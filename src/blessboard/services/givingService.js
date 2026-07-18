"use strict";

/**
 * BlessBoard V5 manual giving summaries.
 * Aggregated entries only — no donor PII, cards, banks, or payment gateways.
 * Money: NUMERIC / decimal strings / BigInt cents — never float.
 */

const repo = require("../repositories/givingRepository");
const {
  authorizeBlessBoardTenantAccess,
  STATUS: AUTHZ_STATUS,
} = require("./authorizeBlessBoardTenantAccess");

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
 * - Branch may create/edit draft; submit draft → submitted; void draft.
 * - Branch cannot edit or void submitted/approved.
 * - HQ may approve submitted → approved; may void any non-void with reason.
 * - Monthly reports include submitted + approved only (never draft/void).
 * - No deletes — void is the audit path.
 */
const GIVING_POLICY = Object.freeze({
  branchEditableStatuses: Object.freeze(["draft"]),
  branchMaySubmit: true,
  branchMayVoidDraft: true,
  hqMayApprove: true,
  hqMayVoid: true,
  reportStatuses: Object.freeze(["submitted", "approved"]),
  // Explicit: this phase stores no donor personal data.
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

/** Columns that must never appear on giving_entries (donor / payment PII). */
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
  if (/voided|must belong|must match|reactivat/i.test(msg)) {
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

/**
 * Parse money as a decimal string with at most 2 fraction digits.
 * Rejects floats, scientific notation, and negative amounts.
 */
function parseMoneyAmount(raw) {
  if (typeof raw === "number") {
    // Explicit reject of JS number/float money inputs.
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

async function authorizeActor(client, input) {
  const authz = await authorizeBlessBoardTenantAccess(
    { query: client.query.bind(client) },
    {
      userId: input.actorUserId,
      tenant: input.tenant,
      branchId: input.branchId,
    }
  );
  if (!authz.ok) {
    return {
      ok: false,
      reason: authz.status || AUTHZ_STATUS.UNAUTHORIZED,
      effectiveRoles: [],
      mode: null,
    };
  }
  const roles = authz.context.effectiveRoles || [];
  const hasHq = roles.some((r) => r.roleKey === "church_hq_admin");
  const hasBranch = roles.some((r) => r.roleKey === "branch_admin");
  const hasPlatform = roles.some((r) => r.roleKey === "platform_admin");
  if (hasHq || hasPlatform) {
    return { ok: true, effectiveRoles: roles, mode: "hq" };
  }
  if (hasBranch && input.branchId) {
    return { ok: true, effectiveRoles: roles, mode: "branch" };
  }
  return { ok: false, reason: "role", effectiveRoles: roles, mode: null };
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

  try {
    return await withClient(db, async (client) => {
      if (input.tenant) {
        const authz = await authorizeActor(client, {
          actorUserId,
          tenant: input.tenant,
          branchId,
        });
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: authz.reason };
        }
        if (authz.mode === "branch" && input.scopeBranchId) {
          if (String(input.scopeBranchId) !== String(branchId)) {
            return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: "branch_scope" };
          }
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
      if (input.tenant) {
        const authz = await authorizeActor(client, {
          actorUserId,
          tenant: input.tenant,
          branchId: existing.branchId,
        });
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
      if (input.tenant) {
        const authz = await authorizeActor(client, {
          actorUserId,
          tenant: input.tenant,
          branchId: entry.branchId,
        });
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: authz.reason };
        }
        if (authz.mode === "branch" && input.scopeBranchId) {
          if (String(input.scopeBranchId) !== String(entry.branchId)) {
            return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: "branch_scope" };
          }
        }
      }
      if (entry.status !== "draft") {
        return { ok: false, status: STATUS.CONFLICT, entry, reason: "not_draft" };
      }
      const updated = await repo.updateEntryStatus(client, entryId, {
        status: "submitted",
        submittedByUserId: actorUserId,
        submittedAt: new Date().toISOString(),
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
      if (input.tenant) {
        const authz = await authorizeActor(client, {
          actorUserId,
          tenant: input.tenant,
          branchId: entry.branchId,
        });
        if (!authz.ok || authz.mode !== "hq") {
          return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: "hq_required" };
        }
      }
      if (entry.status !== "submitted") {
        return { ok: false, status: STATUS.CONFLICT, entry, reason: "not_submitted" };
      }
      const updated = await repo.updateEntryStatus(client, entryId, {
        status: "approved",
        approvedByUserId: actorUserId,
        approvedAt: new Date().toISOString(),
      });
      const enriched = await enrichEntry(client, updated);
      const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");
      await recordBlessBoardAudit(client, {
        churchId,
        branchId: enriched.branchId,
        actorUserId,
        actionKey: "giving.entry.approve",
        entityType: "giving_entry",
        entityId: entryId,
        outcome: "success",
        metadata: { status: "approved", currency: enriched.currency, amount: enriched.amount },
      });
      return { ok: true, status: STATUS.OK, entry: enriched };
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
    return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: voidReason.reason };
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
      let mode = null;
      if (input.tenant) {
        const authz = await authorizeActor(client, {
          actorUserId,
          tenant: input.tenant,
          branchId: entry.branchId,
        });
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: authz.reason };
        }
        mode = authz.mode;
        if (mode === "branch") {
          if (input.scopeBranchId && String(input.scopeBranchId) !== String(entry.branchId)) {
            return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: "branch_scope" };
          }
          if (!GIVING_POLICY.branchMayVoidDraft || entry.status !== "draft") {
            return { ok: false, status: STATUS.POLICY, entry: null, reason: "void_not_allowed" };
          }
        } else if (!GIVING_POLICY.hqMayVoid) {
          return { ok: false, status: STATUS.POLICY, entry: null, reason: "void_disabled" };
        }
      } else if (entry.status !== "draft" && entry.status !== "submitted" && entry.status !== "approved") {
        return { ok: false, status: STATUS.POLICY, entry: null, reason: "void_not_allowed" };
      }

      const updated = await repo.updateEntryStatus(client, entryId, {
        status: "void",
        voidedByUserId: actorUserId,
        voidedAt: new Date().toISOString(),
        voidReason: voidReason.value,
      });
      const enriched = await enrichEntry(client, updated);
      const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");
      await recordBlessBoardAudit(client, {
        churchId,
        branchId: enriched.branchId,
        actorUserId,
        actionKey: "giving.entry.void",
        entityType: "giving_entry",
        entityId: entryId,
        outcome: "success",
        metadata: { status: "void", from_status: entry.status },
      });
      return { ok: true, status: STATUS.OK, entry: enriched };
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
        const authz = await authorizeActor(client, {
          actorUserId: input.actorUserId,
          tenant: input.tenant,
          branchId: entry.branchId,
        });
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: authz.reason };
        }
        if (authz.mode === "branch" && input.scopeBranchId) {
          if (String(input.scopeBranchId) !== String(entry.branchId)) {
            return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: "branch_scope" };
          }
        }
      }
      return { ok: true, status: STATUS.OK, entry: await enrichEntry(client, entry) };
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
        const authz = await authorizeActor(client, {
          actorUserId: input.actorUserId,
          tenant: input.tenant,
          branchId: branchId || null,
        });
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
        const authz = await authorizeActor(client, {
          actorUserId: input.actorUserId,
          tenant: input.tenant,
          branchId: branchId || null,
        });
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

module.exports = {
  STATUS,
  GIVING_POLICY,
  FORBIDDEN_ENTRY_COLUMNS,
  parseMoneyAmount,
  moneyToCents,
  centsToMoney,
  sumMoneyStrings,
  createGivingEntry,
  updateGivingEntry,
  submitGivingEntry,
  approveGivingEntry,
  voidGivingEntry,
  getGivingEntry,
  listGivingEntries,
  listGivingCategories,
  getMonthlyGivingSummary,
};
