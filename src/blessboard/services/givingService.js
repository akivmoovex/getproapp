"use strict";

/**
 * BlessBoard V5 manual giving summaries + Finance SoD controls.
 * Aggregated entries only — no donor PII, cards, or payment gateways.
 * Money: NUMERIC / decimal strings / BigInt cents — never float.
 */

const repo = require("../repositories/givingRepository");
const {
  authorize,
  REASON: AUTHZ_REASON,
} = require("./blessBoardRbacAuthorizationService");
const {
  ERROR_CODES,
  aliasesFor,
  evaluateApprovalSeparation,
  safeFinanceErrorMessage,
} = require("./financeSeparation");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  CONFLICT: "conflict",
  POLICY: "policy",
  LOOKUP_ERROR: "lookup_error",
});

/**
 * Explicit product policy for giving workflow.
 * - Branch/officer may create/edit draft; submit draft → submitted; void draft.
 * - Branch cannot edit or void submitted/approved.
 * - Approver may approve submitted → approved; reject → rejected; may void with reason.
 * - Rejected may reopen → draft.
 * - Approved may void or reverse (controlled); adjust returns to submitted for re-approval.
 * - Monthly reports include submitted + approved only (never draft/void/rejected/reversed).
 * - No deletes — void/reverse is the audit path.
 */
const GIVING_POLICY = Object.freeze({
  branchEditableStatuses: Object.freeze(["draft"]),
  branchMaySubmit: true,
  branchMayVoidDraft: true,
  hqMayApprove: true,
  hqMayVoid: true,
  reportStatuses: Object.freeze(["submitted", "approved"]),
  storesDonorPii: false,
  acceptsCardOrBankDetails: false,
  usesPaymentGateway: false,
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HTML_HINT = /<\/?[a-z][\s\S]*>/i;
const YEAR_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const AMOUNT_RE = /^(0|[1-9]\d*)(\.\d{1,2})?$/;

const FORBIDDEN_ENTRY_COLUMNS = Object.freeze([
  "donor_name",
  "donor_email",
  "donor_phone",
  "donor_address",
  "card_number",
  "card_last4",
  "bank_account",
  "iban",
  "payment_token",
  "stripe_customer_id",
]);

async function withClient(db, fn) {
  let client = null;
  let owned = false;
  try {
    if (db && typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    return await fn(client);
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

function mapDbError(err) {
  const msg = err && err.message ? String(err.message) : "";
  if (/unique|duplicate/i.test(msg)) {
    return { ok: false, status: STATUS.CONFLICT, reason: "duplicate" };
  }
  if (/hard-deleted|cannot be hard-deleted/i.test(msg)) {
    return {
      ok: false,
      status: STATUS.POLICY,
      reason: ERROR_CODES.FINANCE_HARD_DELETE_DENIED,
      errorCode: ERROR_CODES.FINANCE_HARD_DELETE_DENIED,
      safeMessage: safeFinanceErrorMessage(ERROR_CODES.FINANCE_HARD_DELETE_DENIED),
    };
  }
  if (/voided|must belong|must match|reactivat|reversed/i.test(msg)) {
    return { ok: false, status: STATUS.CONFLICT, reason: msg };
  }
  return { ok: false, status: STATUS.LOOKUP_ERROR, reason: msg || "error" };
}

function plainText(value, field, { required, max }) {
  if (value == null || value === "") {
    if (required) return { ok: false, reason: field };
    return { ok: true, value: null };
  }
  const s = String(value).trim();
  if (HTML_HINT.test(s)) return { ok: false, reason: `${field}_html_not_allowed` };
  if (!s) {
    if (required) return { ok: false, reason: field };
    return { ok: true, value: null };
  }
  if (s.length < 1 || s.length > max) return { ok: false, reason: `${field}_length` };
  return { ok: true, value: s };
}

function parseMoneyAmount(raw) {
  if (typeof raw === "number") {
    return { ok: false, reason: "amount_must_be_decimal_string" };
  }
  const s = String(raw == null ? "" : raw).trim();
  if (!AMOUNT_RE.test(s)) return { ok: false, reason: "amount" };
  const [whole, frac = ""] = s.split(".");
  const normalized = `${whole}.${(frac + "00").slice(0, 2)}`;
  return { ok: true, value: normalized };
}

function moneyToCents(amountStr) {
  const [w, f = "00"] = String(amountStr).split(".");
  return BigInt(w) * 100n + BigInt((f + "00").slice(0, 2));
}

function centsToMoney(cents) {
  const abs = cents < 0n ? -cents : cents;
  const w = abs / 100n;
  const f = abs % 100n;
  const sign = cents < 0n ? "-" : "";
  return `${sign}${w}.${String(f).padStart(2, "0")}`;
}

function sumMoneyStrings(amounts) {
  let total = 0n;
  for (const a of amounts) {
    total += moneyToCents(a);
  }
  return centsToMoney(total);
}

function parseGivingDate(raw) {
  const s = String(raw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, reason: "giving_date" };
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return { ok: false, reason: "giving_date" };
  return { ok: true, value: s };
}

function parseCurrency(raw) {
  const s = String(raw || "").trim().toUpperCase();
  if (!CURRENCY_RE.test(s)) return { ok: false, reason: "currency" };
  return { ok: true, value: s };
}

function tenantResource(input, branchId) {
  const tenant = input.tenant || input.tenantContext || null;
  const organizationId =
    (tenant && tenant.organization && tenant.organization.id) ||
    input.organizationId ||
    null;
  const churchId =
    (tenant && tenant.church && tenant.church.id) || input.churchId || null;
  return {
    organizationId,
    churchId,
    branchId: branchId != null ? branchId : input.branchId || null,
  };
}

/**
 * Permission-based actor gate. Accepts finance.* or legacy giving.* aliases.
 */
async function authorizeFinancePermission(client, input, permissionKey, branchId) {
  if (!input.tenant && !input.tenantContext) {
    // Service-level callers without tenant (internal/tests) skip RBAC gate.
    return { ok: true, mode: "unscoped" };
  }
  const actorUserId = String(input.actorUserId || "").trim();
  if (!actorUserId) {
    return { ok: false, reason: "unauthenticated", mode: null };
  }
  const resourceContext = tenantResource(input, branchId);
  if (!resourceContext.organizationId || !resourceContext.churchId) {
    return { ok: false, reason: "tenant", mode: null };
  }
  const aliases = aliasesFor(permissionKey);
  let lastReason = AUTHZ_REASON.PERMISSION_DENIED;
  for (const key of aliases) {
    const result = await authorize(client, {
      actor: { userId: actorUserId },
      permission: key,
      tenantContext: input.tenant || input.tenantContext,
      resourceContext,
    });
    if (result.allowed) {
      const matched = result.matchedAssignments || [];
      const orgWide = matched.some((a) =>
        ["platform", "organisation", "organization", "church"].includes(String(a.scopeType || ""))
      );
      const branchOnly =
        matched.length > 0 &&
        matched.every((a) => String(a.scopeType || "") === "branch");
      return {
        ok: true,
        mode: orgWide ? "hq" : branchOnly ? "branch" : orgWide || !branchId ? "hq" : "branch",
        permission: key,
      };
    }
    lastReason = result.reasonCode || lastReason;
  }
  return { ok: false, reason: lastReason, mode: null };
}

async function enrichEntry(client, entry) {
  if (!entry) return null;
  const category = await repo.findCategoryById(client, entry.categoryId);
  return {
    ...entry,
    categoryKey: category ? category.categoryKey : entry.categoryKey || null,
    categoryLabel: category ? category.label : entry.categoryLabel || null,
  };
}

async function recordFinanceAudit(client, fields) {
  const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");
  await recordBlessBoardAudit(client, {
    churchId: fields.churchId,
    branchId: fields.branchId || null,
    actorUserId: fields.actorUserId,
    actionKey: fields.actionKey,
    entityType: fields.entityType || "giving_entry",
    entityId: fields.entityId,
    outcome: fields.outcome || "success",
    metadata: fields.metadata || {},
  });
}

async function createGivingEntry(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !branchId || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: "scope" };
  }
  const amount = parseMoneyAmount(input.amount);
  if (!amount.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: amount.reason };
  }
  const currency = parseCurrency(input.currency);
  if (!currency.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: currency.reason };
  }
  const givingDate = parseGivingDate(input.givingDate);
  if (!givingDate.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: givingDate.reason };
  }
  const reference = plainText(input.reference, "reference", { required: false, max: 120 });
  if (!reference.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: reference.reason };
  }
  const notes = plainText(input.notes, "notes", { required: false, max: 1000 });
  if (!notes.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: notes.reason };
  }
  const categoryKey = String((input && input.categoryKey) || "").trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{0,31}$/.test(categoryKey)) {
    return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: "category" };
  }
  const welfareRequestId =
    input.welfareRequestId && UUID_RE.test(String(input.welfareRequestId))
      ? String(input.welfareRequestId)
      : null;

  try {
    return await withClient(db, async (client) => {
      const authz = await authorizeFinancePermission(
        client,
        input,
        welfareRequestId
          ? "finance.welfare_disbursement.record"
          : "finance.transactions.create",
        branchId
      );
      if (!authz.ok) {
        return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: authz.reason };
      }
      if (authz.mode === "branch" && input.scopeBranchId) {
        if (String(input.scopeBranchId) !== String(branchId)) {
          return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: "branch_scope" };
        }
      }
      const branch = await repo.findBranchScope(client, branchId);
      if (!branch || String(branch.church_id) !== churchId || branch.status !== "active") {
        return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: "branch" };
      }
      await repo.ensureDefaultCategories(client, churchId);
      const category = await repo.findCategoryByKey(client, churchId, categoryKey);
      if (!category || category.status !== "active") {
        return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: "category" };
      }
      const entry = await repo.insertEntry(client, {
        churchId,
        branchId,
        categoryId: category.id,
        givingDate: givingDate.value,
        amount: amount.value,
        currency: currency.value,
        reference: reference.value,
        notes: notes.value,
        recordedByUserId: actorUserId,
        welfareRequestId,
      });
      await repo.insertEntryEvent(client, {
        entryId: entry.id,
        churchId,
        branchId,
        actorUserId,
        eventType: "created",
        fromStatus: null,
        toStatus: "draft",
      });
      await recordFinanceAudit(client, {
        churchId,
        branchId,
        actorUserId,
        actionKey: welfareRequestId
          ? "finance.welfare_disbursement.recorded"
          : "finance.transaction.created",
        entityId: entry.id,
        metadata: {
          status: "draft",
          currency: entry.currency,
          has_welfare_link: Boolean(welfareRequestId),
        },
      });
      return { ok: true, status: STATUS.OK, entry: await enrichEntry(client, entry) };
    });
  } catch (err) {
    return { ...mapDbError(err), entry: null };
  }
}

async function updateGivingEntry(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const entryId = String((input && input.id) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !UUID_RE.test(entryId) || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: "scope" };
  }

  let amount = null;
  if (input.amount != null && input.amount !== "") {
    amount = parseMoneyAmount(input.amount);
    if (!amount.ok) {
      return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: amount.reason };
    }
  }
  let currency = null;
  if (input.currency != null && input.currency !== "") {
    currency = parseCurrency(input.currency);
    if (!currency.ok) {
      return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: currency.reason };
    }
  }
  let givingDate = null;
  if (input.givingDate != null && input.givingDate !== "") {
    givingDate = parseGivingDate(input.givingDate);
    if (!givingDate.ok) {
      return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: givingDate.reason };
    }
  }
  const reference =
    input.reference === undefined
      ? null
      : plainText(input.reference, "reference", { required: false, max: 120 });
  if (reference && !reference.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: reference.reason };
  }
  const notes =
    input.notes === undefined
      ? null
      : plainText(input.notes, "notes", { required: false, max: 1000 });
  if (notes && !notes.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: notes.reason };
  }
  const categoryKey =
    input.categoryKey != null && input.categoryKey !== ""
      ? String(input.categoryKey).trim().toLowerCase()
      : null;

  try {
    return await withClient(db, async (client) => {
      const existing = await repo.findEntryById(client, entryId);
      if (!existing || String(existing.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, entry: null };
      }
      const authz = await authorizeFinancePermission(
        client,
        input,
        "finance.transactions.edit_draft",
        existing.branchId
      );
      if (!authz.ok) {
        return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: authz.reason };
      }
      if (authz.mode === "branch") {
        if (input.scopeBranchId && String(input.scopeBranchId) !== String(existing.branchId)) {
          return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: "branch_scope" };
        }
        if (!GIVING_POLICY.branchEditableStatuses.includes(existing.status)) {
          return { ok: false, status: STATUS.POLICY, entry: null, reason: "status_locked" };
        }
      } else if (existing.status !== "draft") {
        return { ok: false, status: STATUS.POLICY, entry: null, reason: "status_locked" };
      }

      let categoryId = null;
      if (categoryKey) {
        if (!/^[a-z][a-z0-9_]{0,31}$/.test(categoryKey)) {
          return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: "category" };
        }
        await repo.ensureDefaultCategories(client, churchId);
        const category = await repo.findCategoryByKey(client, churchId, categoryKey);
        if (!category || category.status !== "active") {
          return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: "category" };
        }
        categoryId = category.id;
      }

      const updated = await repo.updateDraftEntry(client, entryId, {
        categoryId,
        givingDate: givingDate ? givingDate.value : null,
        amount: amount ? amount.value : null,
        currency: currency ? currency.value : null,
        clearReference: reference && reference.value == null && input.reference === "",
        reference: reference ? reference.value : undefined,
        clearNotes: notes && notes.value == null && input.notes === "",
        notes: notes ? notes.value : undefined,
      });
      if (!updated) {
        return { ok: false, status: STATUS.CONFLICT, entry: null, reason: "not_draft" };
      }
      await repo.insertEntryEvent(client, {
        entryId,
        churchId,
        branchId: updated.branchId,
        actorUserId,
        eventType: "updated_draft",
        fromStatus: "draft",
        toStatus: "draft",
      });
      await recordFinanceAudit(client, {
        churchId,
        branchId: updated.branchId,
        actorUserId,
        actionKey: "finance.transaction.updated_draft",
        entityId: entryId,
        metadata: { status: "draft" },
      });
      return { ok: true, status: STATUS.OK, entry: await enrichEntry(client, updated) };
    });
  } catch (err) {
    return { ...mapDbError(err), entry: null };
  }
}

async function submitGivingEntry(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const entryId = String((input && input.id) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !UUID_RE.test(entryId) || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: "scope" };
  }
  if (!GIVING_POLICY.branchMaySubmit) {
    return { ok: false, status: STATUS.POLICY, entry: null, reason: "submit_disabled" };
  }
  try {
    return await withClient(db, async (client) => {
      const entry = await repo.findEntryById(client, entryId);
      if (!entry || String(entry.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, entry: null };
      }
      const authz = await authorizeFinancePermission(
        client,
        input,
        "finance.transactions.submit",
        entry.branchId
      );
      if (!authz.ok) {
        return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: authz.reason };
      }
      if (authz.mode === "branch" && input.scopeBranchId) {
        if (String(input.scopeBranchId) !== String(entry.branchId)) {
          return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: "branch_scope" };
        }
      }
      if (entry.status !== "draft") {
        return {
          ok: false,
          status: STATUS.CONFLICT,
          entry,
          reason: ERROR_CODES.FINANCE_STALE_TRANSITION,
          errorCode: ERROR_CODES.FINANCE_STALE_TRANSITION,
          safeMessage: safeFinanceErrorMessage(ERROR_CODES.FINANCE_STALE_TRANSITION),
        };
      }
      const updated = await repo.updateEntryStatus(client, entryId, {
        status: "submitted",
        submittedByUserId: actorUserId,
        submittedAt: new Date().toISOString(),
        clearRejected: true,
        expectStatus: "draft",
      });
      if (!updated) {
        return {
          ok: false,
          status: STATUS.CONFLICT,
          entry,
          reason: ERROR_CODES.FINANCE_STALE_TRANSITION,
          errorCode: ERROR_CODES.FINANCE_STALE_TRANSITION,
          safeMessage: safeFinanceErrorMessage(ERROR_CODES.FINANCE_STALE_TRANSITION),
        };
      }
      await repo.insertEntryEvent(client, {
        entryId,
        churchId,
        branchId: updated.branchId,
        actorUserId,
        eventType: "submitted",
        fromStatus: "draft",
        toStatus: "submitted",
      });
      await recordFinanceAudit(client, {
        churchId,
        branchId: updated.branchId,
        actorUserId,
        actionKey: "finance.transaction.submitted",
        entityId: entryId,
        metadata: { status: "submitted" },
      });
      return { ok: true, status: STATUS.OK, entry: await enrichEntry(client, updated) };
    });
  } catch (err) {
    return { ...mapDbError(err), entry: null };
  }
}

async function approveGivingEntry(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const entryId = String((input && input.id) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !UUID_RE.test(entryId) || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: "scope" };
  }
  if (!GIVING_POLICY.hqMayApprove) {
    return { ok: false, status: STATUS.POLICY, entry: null, reason: "approve_disabled" };
  }
  try {
    return await withClient(db, async (client) => {
      const entry = await repo.findEntryById(client, entryId);
      if (!entry || String(entry.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, entry: null };
      }
      const authz = await authorizeFinancePermission(
        client,
        input,
        "finance.transactions.approve",
        entry.branchId
      );
      if (!authz.ok) {
        return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: authz.reason };
      }
      if (entry.status !== "submitted") {
        return {
          ok: false,
          status: STATUS.CONFLICT,
          entry,
          reason: entry.status === "approved" ? "already_approved" : ERROR_CODES.FINANCE_STALE_TRANSITION,
          errorCode: ERROR_CODES.FINANCE_STALE_TRANSITION,
          safeMessage: safeFinanceErrorMessage(ERROR_CODES.FINANCE_STALE_TRANSITION),
        };
      }
      const sod = evaluateApprovalSeparation(entry, actorUserId);
      if (!sod.ok) {
        return {
          ok: false,
          status: STATUS.FORBIDDEN,
          entry,
          reason: sod.code,
          errorCode: sod.code,
          safeMessage: sod.safeMessage,
        };
      }
      const updated = await repo.updateEntryStatus(client, entryId, {
        status: "approved",
        approvedByUserId: actorUserId,
        approvedAt: new Date().toISOString(),
        expectStatus: "submitted",
      });
      if (!updated) {
        return {
          ok: false,
          status: STATUS.CONFLICT,
          entry,
          reason: ERROR_CODES.FINANCE_STALE_TRANSITION,
          errorCode: ERROR_CODES.FINANCE_STALE_TRANSITION,
          safeMessage: safeFinanceErrorMessage(ERROR_CODES.FINANCE_STALE_TRANSITION),
        };
      }
      const enriched = await enrichEntry(client, updated);
      await repo.insertEntryEvent(client, {
        entryId,
        churchId,
        branchId: enriched.branchId,
        actorUserId,
        eventType: "approved",
        fromStatus: "submitted",
        toStatus: "approved",
      });
      await recordFinanceAudit(client, {
        churchId,
        branchId: enriched.branchId,
        actorUserId,
        actionKey: "finance.transaction.approved",
        entityId: entryId,
        metadata: { status: "approved", currency: enriched.currency },
      });
      // Keep legacy audit key for existing report filters.
      await recordFinanceAudit(client, {
        churchId,
        branchId: enriched.branchId,
        actorUserId,
        actionKey: "giving.entry.approve",
        entityId: entryId,
        metadata: { status: "approved", currency: enriched.currency, amount: enriched.amount },
      });
      return { ok: true, status: STATUS.OK, entry: enriched };
    });
  } catch (err) {
    return { ...mapDbError(err), entry: null };
  }
}

async function rejectGivingEntry(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const entryId = String((input && input.id) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !UUID_RE.test(entryId) || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: "scope" };
  }
  const rejectionReason = plainText(input.rejectionReason, "rejection_reason", {
    required: true,
    max: 500,
  });
  if (!rejectionReason.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      entry: null,
      reason: ERROR_CODES.FINANCE_REASON_REQUIRED,
      errorCode: ERROR_CODES.FINANCE_REASON_REQUIRED,
      safeMessage: safeFinanceErrorMessage(ERROR_CODES.FINANCE_REASON_REQUIRED),
    };
  }
  try {
    return await withClient(db, async (client) => {
      const entry = await repo.findEntryById(client, entryId);
      if (!entry || String(entry.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, entry: null };
      }
      const authz = await authorizeFinancePermission(
        client,
        input,
        "finance.transactions.reject",
        entry.branchId
      );
      if (!authz.ok) {
        return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: authz.reason };
      }
      const sod = evaluateApprovalSeparation(entry, actorUserId);
      if (!sod.ok) {
        return {
          ok: false,
          status: STATUS.FORBIDDEN,
          entry,
          reason: sod.code,
          errorCode: sod.code,
          safeMessage: sod.safeMessage,
        };
      }
      if (entry.status !== "submitted") {
        return {
          ok: false,
          status: STATUS.CONFLICT,
          entry,
          reason: ERROR_CODES.FINANCE_STALE_TRANSITION,
          errorCode: ERROR_CODES.FINANCE_STALE_TRANSITION,
          safeMessage: safeFinanceErrorMessage(ERROR_CODES.FINANCE_STALE_TRANSITION),
        };
      }
      const updated = await repo.updateEntryStatus(client, entryId, {
        status: "rejected",
        rejectedByUserId: actorUserId,
        rejectedAt: new Date().toISOString(),
        rejectionReason: rejectionReason.value,
        expectStatus: "submitted",
      });
      if (!updated) {
        return {
          ok: false,
          status: STATUS.CONFLICT,
          entry,
          reason: ERROR_CODES.FINANCE_STALE_TRANSITION,
          errorCode: ERROR_CODES.FINANCE_STALE_TRANSITION,
          safeMessage: safeFinanceErrorMessage(ERROR_CODES.FINANCE_STALE_TRANSITION),
        };
      }
      await repo.insertEntryEvent(client, {
        entryId,
        churchId,
        branchId: updated.branchId,
        actorUserId,
        eventType: "rejected",
        fromStatus: "submitted",
        toStatus: "rejected",
        reason: rejectionReason.value,
      });
      await recordFinanceAudit(client, {
        churchId,
        branchId: updated.branchId,
        actorUserId,
        actionKey: "finance.transaction.rejected",
        entityId: entryId,
        metadata: { status: "rejected" },
      });
      return { ok: true, status: STATUS.OK, entry: await enrichEntry(client, updated) };
    });
  } catch (err) {
    return { ...mapDbError(err), entry: null };
  }
}

async function reopenRejectedGivingEntry(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const entryId = String((input && input.id) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !UUID_RE.test(entryId) || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      const entry = await repo.findEntryById(client, entryId);
      if (!entry || String(entry.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, entry: null };
      }
      const authz = await authorizeFinancePermission(
        client,
        input,
        "finance.transactions.edit_draft",
        entry.branchId
      );
      if (!authz.ok) {
        return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: authz.reason };
      }
      if (entry.status !== "rejected") {
        return { ok: false, status: STATUS.CONFLICT, entry, reason: "not_rejected" };
      }
      const updated = await repo.updateEntryStatus(client, entryId, {
        status: "draft",
        clearSubmitted: true,
        clearApproved: true,
        expectStatus: "rejected",
      });
      if (!updated) {
        return {
          ok: false,
          status: STATUS.CONFLICT,
          entry,
          reason: ERROR_CODES.FINANCE_STALE_TRANSITION,
          errorCode: ERROR_CODES.FINANCE_STALE_TRANSITION,
          safeMessage: safeFinanceErrorMessage(ERROR_CODES.FINANCE_STALE_TRANSITION),
        };
      }
      await repo.insertEntryEvent(client, {
        entryId,
        churchId,
        branchId: updated.branchId,
        actorUserId,
        eventType: "reopened",
        fromStatus: "rejected",
        toStatus: "draft",
      });
      return { ok: true, status: STATUS.OK, entry: await enrichEntry(client, updated) };
    });
  } catch (err) {
    return { ...mapDbError(err), entry: null };
  }
}

async function adjustGivingEntry(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const entryId = String((input && input.id) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !UUID_RE.test(entryId) || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: "scope" };
  }
  const adjustmentReason = plainText(input.adjustmentReason, "adjustment_reason", {
    required: true,
    max: 500,
  });
  if (!adjustmentReason.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      entry: null,
      reason: ERROR_CODES.FINANCE_REASON_REQUIRED,
      errorCode: ERROR_CODES.FINANCE_REASON_REQUIRED,
      safeMessage: safeFinanceErrorMessage(ERROR_CODES.FINANCE_REASON_REQUIRED),
    };
  }
  const amount = parseMoneyAmount(input.amount);
  if (!amount.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: amount.reason };
  }
  try {
    return await withClient(db, async (client) => {
      const entry = await repo.findEntryById(client, entryId);
      if (!entry || String(entry.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, entry: null };
      }
      const authz = await authorizeFinancePermission(
        client,
        input,
        "finance.transactions.adjust",
        entry.branchId
      );
      if (!authz.ok) {
        return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: authz.reason };
      }
      if (entry.status !== "approved") {
        return { ok: false, status: STATUS.CONFLICT, entry, reason: "not_approved" };
      }
      const updated = await repo.updateEntryStatus(client, entryId, {
        status: "submitted",
        amount: amount.value,
        adjustedByUserId: actorUserId,
        adjustedAt: new Date().toISOString(),
        adjustmentReason: adjustmentReason.value,
        lastMateriallyEditedByUserId: actorUserId,
        lastMateriallyEditedAt: new Date().toISOString(),
        clearApproved: true,
        expectStatus: "approved",
      });
      if (!updated) {
        return {
          ok: false,
          status: STATUS.CONFLICT,
          entry,
          reason: ERROR_CODES.FINANCE_STALE_TRANSITION,
          errorCode: ERROR_CODES.FINANCE_STALE_TRANSITION,
          safeMessage: safeFinanceErrorMessage(ERROR_CODES.FINANCE_STALE_TRANSITION),
        };
      }
      await repo.insertEntryEvent(client, {
        entryId,
        churchId,
        branchId: updated.branchId,
        actorUserId,
        eventType: "adjusted",
        fromStatus: "approved",
        toStatus: "submitted",
        reason: adjustmentReason.value,
        metadataJson: { previous_amount: entry.amount, new_amount: amount.value },
      });
      await recordFinanceAudit(client, {
        churchId,
        branchId: updated.branchId,
        actorUserId,
        actionKey: "finance.transaction.adjusted",
        entityId: entryId,
        metadata: { status: "submitted" },
      });
      return { ok: true, status: STATUS.OK, entry: await enrichEntry(client, updated) };
    });
  } catch (err) {
    return { ...mapDbError(err), entry: null };
  }
}

async function voidGivingEntry(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const entryId = String((input && input.id) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !UUID_RE.test(entryId) || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: "scope" };
  }
  const voidReason = plainText(input.voidReason, "void_reason", { required: true, max: 500 });
  if (!voidReason.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      entry: null,
      reason: ERROR_CODES.FINANCE_REASON_REQUIRED,
      errorCode: ERROR_CODES.FINANCE_REASON_REQUIRED,
      safeMessage: safeFinanceErrorMessage(ERROR_CODES.FINANCE_REASON_REQUIRED),
    };
  }
  try {
    return await withClient(db, async (client) => {
      const entry = await repo.findEntryById(client, entryId);
      if (!entry || String(entry.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, entry: null };
      }
      if (entry.status === "void") {
        return { ok: true, status: STATUS.OK, entry: await enrichEntry(client, entry) };
      }
      let authz = await authorizeFinancePermission(
        client,
        input,
        "finance.transactions.void",
        entry.branchId
      );
      // Draft void may use edit_draft (branch officer path) when full void is absent.
      if (!authz.ok && entry.status === "draft" && GIVING_POLICY.branchMayVoidDraft) {
        const draftAuthz = await authorizeFinancePermission(
          client,
          input,
          "finance.transactions.edit_draft",
          entry.branchId
        );
        if (draftAuthz.ok) authz = { ...draftAuthz, mode: "branch" };
      }
      if (!authz.ok) {
        // Branch recorders without void permission hitting non-draft → policy (not bare deny).
        const recorder = await authorizeFinancePermission(
          client,
          input,
          "finance.transactions.edit_draft",
          entry.branchId
        );
        if (recorder.ok && entry.status !== "draft") {
          return { ok: false, status: STATUS.POLICY, entry: null, reason: "void_not_allowed" };
        }
        return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: authz.reason };
      }
      if (authz.mode === "branch") {
        if (input.scopeBranchId && String(input.scopeBranchId) !== String(entry.branchId)) {
          return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: "branch_scope" };
        }
        if (!GIVING_POLICY.branchMayVoidDraft || entry.status !== "draft") {
          return { ok: false, status: STATUS.POLICY, entry: null, reason: "void_not_allowed" };
        }
      } else if (!GIVING_POLICY.hqMayVoid) {
        return { ok: false, status: STATUS.POLICY, entry: null, reason: "void_disabled" };
      }
      if (entry.status === "reversed") {
        return { ok: false, status: STATUS.POLICY, entry: null, reason: "void_not_allowed" };
      }

      const updated = await repo.updateEntryStatus(client, entryId, {
        status: "void",
        voidedByUserId: actorUserId,
        voidedAt: new Date().toISOString(),
        voidReason: voidReason.value,
      });
      const enriched = await enrichEntry(client, updated);
      await repo.insertEntryEvent(client, {
        entryId,
        churchId,
        branchId: enriched.branchId,
        actorUserId,
        eventType: "voided",
        fromStatus: entry.status,
        toStatus: "void",
        reason: voidReason.value,
      });
      await recordFinanceAudit(client, {
        churchId,
        branchId: enriched.branchId,
        actorUserId,
        actionKey: "finance.transaction.voided",
        entityId: entryId,
        metadata: { status: "void", from_status: entry.status },
      });
      await recordFinanceAudit(client, {
        churchId,
        branchId: enriched.branchId,
        actorUserId,
        actionKey: "giving.entry.void",
        entityId: entryId,
        metadata: { status: "void", from_status: entry.status },
      });
      return { ok: true, status: STATUS.OK, entry: enriched };
    });
  } catch (err) {
    return { ...mapDbError(err), entry: null };
  }
}

async function reverseGivingEntry(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const entryId = String((input && input.id) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !UUID_RE.test(entryId) || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: "scope" };
  }
  const reversalReason = plainText(input.reversalReason, "reversal_reason", {
    required: true,
    max: 500,
  });
  if (!reversalReason.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      entry: null,
      reason: ERROR_CODES.FINANCE_REASON_REQUIRED,
      errorCode: ERROR_CODES.FINANCE_REASON_REQUIRED,
      safeMessage: safeFinanceErrorMessage(ERROR_CODES.FINANCE_REASON_REQUIRED),
    };
  }
  try {
    return await withClient(db, async (client) => {
      const entry = await repo.findEntryById(client, entryId);
      if (!entry || String(entry.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, entry: null };
      }
      const authz = await authorizeFinancePermission(
        client,
        input,
        "finance.transactions.reverse",
        entry.branchId
      );
      if (!authz.ok) {
        return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: authz.reason };
      }
      if (entry.status !== "approved") {
        return { ok: false, status: STATUS.CONFLICT, entry, reason: "not_approved" };
      }
      await client.query("BEGIN");
      try {
        const updated = await repo.updateEntryStatus(client, entryId, {
          status: "reversed",
          reversedByUserId: actorUserId,
          reversedAt: new Date().toISOString(),
          reversalReason: reversalReason.value,
          expectStatus: "approved",
        });
        if (!updated) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.CONFLICT,
            entry,
            reason: ERROR_CODES.FINANCE_STALE_TRANSITION,
            errorCode: ERROR_CODES.FINANCE_STALE_TRANSITION,
            safeMessage: safeFinanceErrorMessage(ERROR_CODES.FINANCE_STALE_TRANSITION),
          };
        }
        // Linked reversal marker: draft → submitted → approved (constraint-safe).
        const reversalDraft = await repo.insertEntry(client, {
          churchId,
          branchId: entry.branchId,
          categoryId: entry.categoryId,
          givingDate: entry.givingDate,
          amount: entry.amount,
          currency: entry.currency,
          reference: entry.reference,
          notes: null,
          status: "draft",
          recordedByUserId: actorUserId,
          reversalOfEntryId: entryId,
        });
        await repo.updateEntryStatus(client, reversalDraft.id, {
          status: "submitted",
          submittedByUserId: actorUserId,
          submittedAt: new Date().toISOString(),
          expectStatus: "draft",
        });
        const reversal = await repo.updateEntryStatus(client, reversalDraft.id, {
          status: "approved",
          approvedByUserId: actorUserId,
          approvedAt: new Date().toISOString(),
          expectStatus: "submitted",
        });
        await repo.insertEntryEvent(client, {
          entryId,
          churchId,
          branchId: entry.branchId,
          actorUserId,
          eventType: "reversed",
          fromStatus: "approved",
          toStatus: "reversed",
          reason: reversalReason.value,
          metadataJson: { reversal_entry_id: reversal.id },
        });
        await recordFinanceAudit(client, {
          churchId,
          branchId: entry.branchId,
          actorUserId,
          actionKey: "finance.transaction.reversed",
          entityId: entryId,
          metadata: { status: "reversed", has_reversal_link: true },
        });
        await client.query("COMMIT");
        return {
          ok: true,
          status: STATUS.OK,
          entry: await enrichEntry(client, updated),
          reversalEntry: await enrichEntry(client, reversal),
        };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });
  } catch (err) {
    return { ...mapDbError(err), entry: null };
  }
}

async function getGivingEntry(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const entryId = String((input && input.id) || "").trim();
  if (!churchId || !UUID_RE.test(entryId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      const entry = await repo.findEntryById(client, entryId);
      if (!entry || String(entry.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, entry: null };
      }
      if (input.tenant && input.actorUserId) {
        const authz = await authorizeFinancePermission(
          client,
          input,
          "finance.transactions.view",
          entry.branchId
        );
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: authz.reason };
        }
        if (authz.mode === "branch" && input.scopeBranchId) {
          if (String(input.scopeBranchId) !== String(entry.branchId)) {
            return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: "branch_scope" };
          }
        }
      }
      const enriched = await enrichEntry(client, entry);
      let events = [];
      try {
        events = await repo.listEntryEvents(client, entryId);
      } catch {
        events = [];
      }
      const approvalSeparation = input.actorUserId
        ? evaluateApprovalSeparation(enriched, input.actorUserId)
        : { ok: true };
      return {
        ok: true,
        status: STATUS.OK,
        entry: enriched,
        events,
        approvalBlockedReason:
          approvalSeparation.ok || enriched.status !== "submitted"
            ? null
            : approvalSeparation.safeMessage,
      };
    });
  } catch (err) {
    return { ...mapDbError(err), entry: null };
  }
}

async function listGivingEntries(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!churchId) {
    return { ok: false, status: STATUS.INVALID_INPUT, entries: [], reason: "church_id" };
  }
  let branchId;
  if (Object.prototype.hasOwnProperty.call(input || {}, "branchId")) {
    branchId = input.branchId == null || input.branchId === "" ? null : String(input.branchId);
  }
  try {
    return await withClient(db, async (client) => {
      if (input.tenant && input.actorUserId) {
        const authz = await authorizeFinancePermission(
          client,
          input,
          "finance.transactions.view",
          branchId || null
        );
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, entries: [], reason: authz.reason };
        }
        if (authz.mode === "branch" && !branchId) {
          return { ok: false, status: STATUS.FORBIDDEN, entries: [], reason: "branch_required" };
        }
      }
      await repo.ensureDefaultCategories(client, churchId);
      const entries = await repo.listEntries(client, {
        churchId,
        branchId: branchId || undefined,
        status: input.status || null,
        yearMonth: input.yearMonth || null,
        limit: input.limit,
      });
      return { ok: true, status: STATUS.OK, entries };
    });
  } catch (err) {
    return { ...mapDbError(err), entries: [] };
  }
}

async function listGivingCategories(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!churchId) {
    return { ok: false, status: STATUS.INVALID_INPUT, categories: [], reason: "church_id" };
  }
  try {
    return await withClient(db, async (client) => {
      const categories = await repo.ensureDefaultCategories(client, churchId);
      return { ok: true, status: STATUS.OK, categories };
    });
  } catch (err) {
    return { ...mapDbError(err), categories: [] };
  }
}

async function getMonthlyGivingSummary(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const yearMonth = String((input && input.yearMonth) || "").trim();
  if (!churchId || !YEAR_MONTH_RE.test(yearMonth)) {
    return { ok: false, status: STATUS.INVALID_INPUT, summary: null, reason: "year_month" };
  }
  let branchId;
  if (Object.prototype.hasOwnProperty.call(input || {}, "branchId")) {
    branchId = input.branchId == null || input.branchId === "" ? null : String(input.branchId);
  }
  try {
    return await withClient(db, async (client) => {
      if (input.tenant && input.actorUserId) {
        const authz = await authorizeFinancePermission(
          client,
          input,
          "finance.reports.view",
          branchId || null
        );
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, summary: null, reason: authz.reason };
        }
        if (authz.mode === "branch" && !branchId) {
          return { ok: false, status: STATUS.FORBIDDEN, summary: null, reason: "branch_required" };
        }
      }
      const byBranch = await repo.monthlySummary(client, {
        churchId,
        branchId: branchId || null,
        yearMonth,
      });
      const churchTotals = branchId
        ? null
        : await repo.monthlyChurchTotals(client, { churchId, yearMonth });
      const rows = churchTotals || byBranch;
      const byCurrency = {};
      for (const row of rows) {
        const cur = row.currency;
        if (!byCurrency[cur]) byCurrency[cur] = [];
        byCurrency[cur].push(row.totalAmount);
      }
      const grandTotalsByCurrency = Object.keys(byCurrency)
        .sort()
        .map((currency) => ({
          currency,
          totalAmount: sumMoneyStrings(byCurrency[currency]),
        }));
      return {
        ok: true,
        status: STATUS.OK,
        summary: {
          yearMonth,
          churchId,
          branchId: branchId || null,
          byBranch,
          churchTotals,
          grandTotalsByCurrency,
          sourceStatuses: GIVING_POLICY.reportStatuses.slice(),
        },
      };
    });
  } catch (err) {
    return { ...mapDbError(err), summary: null };
  }
}

/**
 * Export requires finance.data.export explicitly — report view is not enough.
 */
async function exportMonthlyGivingSummary(db, input) {
  const report = await getMonthlyGivingSummary(db, input);
  if (!report.ok) return report;
  try {
    return await withClient(db, async (client) => {
      if (input.tenant && input.actorUserId) {
        const authz = await authorizeFinancePermission(
          client,
          input,
          "finance.data.export",
          input.branchId || null
        );
        if (!authz.ok) {
          return {
            ok: false,
            status: STATUS.FORBIDDEN,
            export: null,
            reason: ERROR_CODES.FINANCE_EXPORT_DENIED,
            errorCode: ERROR_CODES.FINANCE_EXPORT_DENIED,
            safeMessage: safeFinanceErrorMessage(ERROR_CODES.FINANCE_EXPORT_DENIED),
          };
        }
      }
      await recordFinanceAudit(client, {
        churchId: input.churchId,
        branchId: input.branchId || null,
        actorUserId: input.actorUserId,
        actionKey: "finance.report.exported",
        entityType: "giving_summary",
        entityId: null,
        metadata: {
          year_month: report.summary.yearMonth,
          row_count: (report.summary.byBranch || []).length,
        },
      });
      return {
        ok: true,
        status: STATUS.OK,
        export: {
          yearMonth: report.summary.yearMonth,
          grandTotalsByCurrency: report.summary.grandTotalsByCurrency,
          byBranch: report.summary.byBranch,
        },
      };
    });
  } catch (err) {
    return { ...mapDbError(err), export: null };
  }
}

/**
 * Bank/account details on giving methods require finance.bank_details.view.
 */
async function getGivingMethodBankDetails(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const methodId = String((input && input.methodId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !UUID_RE.test(methodId) || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, details: null, reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      const authz = await authorizeFinancePermission(
        client,
        input,
        "finance.bank_details.view",
        input.branchId || null
      );
      if (!authz.ok) {
        return {
          ok: false,
          status: STATUS.FORBIDDEN,
          details: null,
          reason: ERROR_CODES.FINANCE_BANK_DENIED,
          errorCode: ERROR_CODES.FINANCE_BANK_DENIED,
          safeMessage: safeFinanceErrorMessage(ERROR_CODES.FINANCE_BANK_DENIED),
        };
      }
      const { rows } = await client.query(
        `SELECT id, church_id, branch_id, method_type, label, account_details, status
           FROM blessboard.giving_methods
          WHERE id = $1 AND church_id = $2`,
        [methodId, churchId]
      );
      const row = rows[0];
      if (!row) return { ok: false, status: STATUS.NOT_FOUND, details: null };
      await recordFinanceAudit(client, {
        churchId,
        branchId: row.branch_id,
        actorUserId,
        actionKey: "finance.bank_details.accessed",
        entityType: "giving_method",
        entityId: methodId,
        metadata: { method_type: row.method_type },
      });
      return {
        ok: true,
        status: STATUS.OK,
        details: {
          id: row.id,
          label: row.label,
          methodType: row.method_type,
          accountDetails: row.account_details || null,
          status: row.status,
        },
      };
    });
  } catch (err) {
    return { ...mapDbError(err), details: null };
  }
}

module.exports = {
  STATUS,
  GIVING_POLICY,
  FORBIDDEN_ENTRY_COLUMNS,
  ERROR_CODES,
  parseMoneyAmount,
  moneyToCents,
  centsToMoney,
  sumMoneyStrings,
  createGivingEntry,
  updateGivingEntry,
  submitGivingEntry,
  approveGivingEntry,
  rejectGivingEntry,
  reopenRejectedGivingEntry,
  adjustGivingEntry,
  voidGivingEntry,
  reverseGivingEntry,
  getGivingEntry,
  listGivingEntries,
  listGivingCategories,
  getMonthlyGivingSummary,
  exportMonthlyGivingSummary,
  getGivingMethodBankDetails,
  evaluateApprovalSeparation,
  safeFinanceErrorMessage,
  authorizeFinancePermission,
};
