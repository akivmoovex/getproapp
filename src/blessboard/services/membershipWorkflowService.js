"use strict";

/**
 * V8 BlessBoard membership workflow (BB01–BB18 extensions).
 * Intake form publish, optional application fields, needs_follow_up,
 * pastoral notes (restricted), review audit, branch transfers.
 * Never creates login accounts or passwords.
 */

const crypto = require("crypto");
const repo = require("../repositories/memberIdentityRepository");
const { requireActorPermission } = require("./requireActorPermission");
const {
  STATUS,
  submitMemberRegistration,
  reviewMemberRegistration,
  approveMemberRegistration,
  rejectMemberRegistration,
  getMemberRegistrationForManager,
  updateMemberProfileFields: _unused,
} = require("./memberRegistrationService");

// silence unused if not re-exported from here
void _unused;

const HTML_RE = /[<>]/;
const FORM_KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/;

const REVIEWABLE = Object.freeze([
  "submitted",
  "under_review",
  "needs_follow_up",
]);

const OPTIONAL_APPLICATION_KEYS = Object.freeze([
  "faithBackground",
  "baptismStatus",
  "previousChurch",
  "interests",
  "ministryInterest",
  "availability",
  "consentContact",
]);

const FORBIDDEN_APPLICATION_KEYS = Object.freeze([
  "nationalId",
  "ssn",
  "passport",
  "dateOfBirth",
  "dob",
  "health",
  "medical",
  "clinical",
  "diagnosis",
  "income",
  "bankAccount",
  "password",
]);

async function withClient(db, fn) {
  if (db && typeof db.connect === "function") {
    const client = await db.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }
  return fn(db);
}

async function requireManager(client, input, permission) {
  let tenant = input.tenant;
  if (!tenant || tenant.resolved !== true) {
    const churchId = String((input && input.churchId) || "").trim();
    if (!churchId) {
      return { ok: false, status: STATUS.FORBIDDEN, reason: "tenant_required" };
    }
    const churchRow = await client.query(
      `SELECT c.id, c.organization_id, c.church_key, c.display_name,
              b.id AS branch_id, b.branch_key, b.display_name AS branch_display_name
         FROM blessboard.churches c
         LEFT JOIN blessboard.branches b
           ON b.church_id = c.id AND b.is_primary = true AND b.status = 'active'
        WHERE c.id = $1
        LIMIT 1`,
      [churchId]
    );
    const row = churchRow.rows[0];
    if (!row) {
      return { ok: false, status: STATUS.FORBIDDEN, reason: "church_not_found" };
    }
    tenant = {
      resolved: true,
      organization: { id: row.organization_id },
      church: {
        id: row.id,
        key: row.church_key,
        displayName: row.display_name || "",
      },
      primaryBranch: row.branch_id
        ? {
            id: row.branch_id,
            key: row.branch_key,
            displayName: row.branch_display_name || "",
          }
        : null,
    };
  }
  const result = await requireActorPermission(
    { query: client.query.bind(client) },
    {
      actorUserId: input.actorUserId,
      tenant,
      permission: permission || "members.edit",
      branchId: input.branchId || null,
    }
  );
  if (!result.ok || !result.allowed) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: result.reason || "denied" };
  }
  return { ok: true, mode: result.mode };
}

async function canViewPastoralNotes(client, input) {
  let tenant = input.tenant;
  if (!tenant || tenant.resolved !== true) {
    const churchId = String((input && input.churchId) || "").trim();
    if (!churchId) return false;
    const churchRow = await client.query(
      `SELECT c.id, c.organization_id, c.church_key, c.display_name,
              b.id AS branch_id, b.branch_key, b.display_name AS branch_display_name
         FROM blessboard.churches c
         LEFT JOIN blessboard.branches b
           ON b.church_id = c.id AND b.is_primary = true AND b.status = 'active'
        WHERE c.id = $1
        LIMIT 1`,
      [churchId]
    );
    const row = churchRow.rows[0];
    if (!row) return false;
    tenant = {
      resolved: true,
      organization: { id: row.organization_id },
      church: { id: row.id, key: row.church_key, displayName: row.display_name || "" },
      primaryBranch: row.branch_id
        ? { id: row.branch_id, key: row.branch_key, displayName: row.branch_display_name || "" }
        : null,
    };
  }
  const restricted = await requireActorPermission(
    { query: client.query.bind(client) },
    {
      actorUserId: input.actorUserId,
      tenant,
      permission: "pastoral_cases.view_restricted",
      branchId: input.branchId || null,
    }
  );
  if (restricted.ok && restricted.allowed) return true;
  return false;
}

function plainText(value, field, { required, max }) {
  if (value == null || value === "") {
    return required ? { ok: false, reason: field } : { ok: true, value: null };
  }
  const s = String(value).trim();
  if (!s) return required ? { ok: false, reason: field } : { ok: true, value: null };
  if (HTML_RE.test(s)) return { ok: false, reason: `${field}_html` };
  if (s.length > max) return { ok: false, reason: `${field}_len` };
  return { ok: true, value: s };
}

function sanitizeApplicationJson(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  for (const key of Object.keys(src)) {
    if (FORBIDDEN_APPLICATION_KEYS.includes(key)) {
      return { ok: false, reason: `privacy_forbidden:${key}` };
    }
  }
  const out = {};
  for (const key of OPTIONAL_APPLICATION_KEYS) {
    if (src[key] == null || src[key] === "") continue;
    if (key === "interests" && Array.isArray(src[key])) {
      const interests = [];
      for (const item of src[key].slice(0, 20)) {
        const t = plainText(item, "interests", { required: false, max: 80 });
        if (!t.ok) return t;
        if (t.value) interests.push(t.value);
      }
      if (interests.length) out.interests = interests;
      continue;
    }
    if (key === "consentContact") {
      out.consentContact = src[key] === true || src[key] === "1" || src[key] === "on";
      continue;
    }
    const t = plainText(src[key], key, { required: false, max: 500 });
    if (!t.ok) return t;
    if (t.value) out[key] = t.value;
  }
  return { ok: true, value: out };
}

async function createMembershipIntakeForm(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  const title = plainText(input.title, "title", { required: true, max: 200 });
  if (!title.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: title.reason };
  let formKey = String(input.formKey || "").trim().toLowerCase();
  if (!formKey) formKey = `membership_${crypto.randomBytes(3).toString("hex")}`;
  if (!FORM_KEY_RE.test(formKey)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "form_key" };
  }
  const description = plainText(input.description, "description", {
    required: false,
    max: 2000,
  });
  if (!description.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: description.reason };
  }

  try {
    return await withClient(db, async (client) => {
      const gate = await requireManager(client, input, "members.edit");
      if (!gate.ok) return gate;
      const form = await repo.insertIntakeForm(client, {
        churchId,
        branchId: input.branchId || null,
        formKey,
        title: title.value,
        description: description.value,
        enableSpiritualBackground: input.enableSpiritualBackground !== false,
        enableParticipationInterests: input.enableParticipationInterests !== false,
        createdByUserId: actorUserId,
      });
      return { ok: true, status: STATUS.OK, form };
    });
  } catch (err) {
    if (/unique|duplicate/i.test(String(err && err.message))) {
      return { ok: false, status: STATUS.CONFLICT, reason: "duplicate" };
    }
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup" };
  }
}

async function publishMembershipIntakeForm(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const formId = String((input && input.formId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !formId || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  try {
    return await withClient(db, async (client) => {
      const gate = await requireManager(client, input, "members.edit");
      if (!gate.ok) return gate;
      const existing = await repo.getIntakeFormById(client, { id: formId, churchId });
      if (!existing) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
      const form = await repo.updateIntakeForm(client, {
        id: formId,
        churchId,
        status: "published",
        setPublishedAt: true,
        publishedAt: new Date(),
        updatedByUserId: actorUserId,
      });
      return { ok: true, status: STATUS.OK, form };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup" };
  }
}

async function listMembershipIntakeForms(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids", forms: [] };
  }
  try {
    return await withClient(db, async (client) => {
      const gate = await requireManager(client, input, "members.view");
      if (!gate.ok) return { ...gate, forms: [] };
      const forms = await repo.listIntakeForms(client, {
        churchId,
        status: input.status || null,
      });
      return { ok: true, status: STATUS.OK, forms };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup", forms: [] };
  }
}

/**
 * Multi-step membership application submit (BB03–BB07).
 * Optional spiritual / participation fields only — no clinical data.
 */
async function submitMembershipApplication(db, input) {
  const application = sanitizeApplicationJson(input && input.application);
  if (!application.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      reason: application.reason,
      registration: null,
    };
  }

  const result = await submitMemberRegistration(db, {
    ...input,
    intakeFormId: input.intakeFormId || null,
    applicationJson: application.value,
  });

  if (!result.ok || !result.registration) return result;

  try {
    await withClient(db, async (client) => {
      await repo.insertReviewEvent(client, {
        registrationId: result.registration.id,
        churchId: result.registration.churchId,
        branchId: result.registration.branchId,
        fromStatus: null,
        toStatus: "submitted",
        decisionCode: "submitted",
        decisionSummary: "Public membership application submitted",
        actorUserId: null,
      });
    });
  } catch {
    /* non-fatal audit write */
  }
  return result;
}

async function requestNeedsFollowUp(db, input) {
  const registrationId = String((input && input.registrationId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const reviewNotes =
    input.reviewNotes != null && String(input.reviewNotes).trim()
      ? String(input.reviewNotes).trim().slice(0, 2000)
      : null;
  if (!registrationId || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }

  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const registration = await repo.findRegistrationById(client, registrationId);
        if (!registration) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
        }
        const gate = await requireManager(
          client,
          {
            actorUserId,
            churchId: registration.churchId,
            branchId: registration.branchId,
            tenant: input.tenant,
          },
          "members.edit"
        );
        if (!gate.ok) {
          await client.query("ROLLBACK");
          return gate;
        }
        if (!REVIEWABLE.includes(registration.status)) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.CONFLICT,
            reason: `status_${registration.status}`,
          };
        }
        const fromStatus = registration.status;
        const updated = await repo.updateRegistrationStatus(client, {
          id: registrationId,
          status: "needs_follow_up",
          reviewedByUserId: actorUserId,
          reviewedAt: new Date().toISOString(),
          reviewNotes,
        });
        await repo.insertReviewEvent(client, {
          registrationId,
          churchId: registration.churchId,
          branchId: registration.branchId,
          fromStatus,
          toStatus: "needs_follow_up",
          decisionCode: "needs_follow_up",
          decisionSummary: reviewNotes,
          actorUserId,
        });
        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, registration: updated };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });
  } catch {
    return { ok: false, status: STATUS.TRANSACTION_ERROR, reason: "transaction" };
  }
}

async function updateRegistrationPastoralNotes(db, input) {
  const registrationId = String((input && input.registrationId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!registrationId || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  const notes = plainText(input.pastoralNotes, "pastoral_notes", {
    required: false,
    max: 5000,
  });
  if (!notes.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: notes.reason };

  try {
    return await withClient(db, async (client) => {
      const registration = await repo.findRegistrationByIdReadonly(client, registrationId);
      if (!registration) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
      const allowed = await canViewPastoralNotes(client, {
        actorUserId,
        tenant: input.tenant,
        churchId: registration.churchId,
        branchId: registration.branchId,
      });
      if (!allowed) {
        return { ok: false, status: STATUS.FORBIDDEN, reason: "pastoral_restricted" };
      }
      const updated = await repo.updatePastoralNotes(client, {
        id: registrationId,
        churchId: registration.churchId,
        pastoralNotes: notes.value,
        actorUserId,
      });
      await repo.insertReviewEvent(client, {
        registrationId,
        churchId: registration.churchId,
        branchId: registration.branchId,
        fromStatus: registration.status,
        toStatus: registration.status,
        decisionCode: "note",
        decisionSummary: "Pastoral note updated",
        actorUserId,
      });
      return { ok: true, status: STATUS.OK, registration: updated };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup" };
  }
}

/**
 * Load registration for manager; redact pastoral notes unless permitted.
 */
async function getMembershipApplicationForReview(db, input) {
  const base = await getMemberRegistrationForManager(db, input);
  if (!base.ok) return base;
  try {
    return await withClient(db, async (client) => {
      const allowed = await canViewPastoralNotes(client, {
        actorUserId: input.actorUserId,
        tenant: input.tenant,
        churchId: base.registration.churchId,
        branchId: base.registration.branchId,
      });
      const events = await repo.listReviewEvents(client, {
        registrationId: base.registration.id,
        churchId: base.registration.churchId,
      });
      const registration = { ...base.registration };
      if (!allowed) {
        delete registration.pastoralNotes;
        registration.pastoralNotesRestricted = true;
      } else {
        registration.pastoralNotesRestricted = false;
      }
      return {
        ok: true,
        status: STATUS.OK,
        registration,
        reviewEvents: events,
        canViewPastoralNotes: allowed,
      };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup" };
  }
}

async function requestMemberBranchTransfer(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const memberId = String((input && input.memberId) || "").trim();
  const toBranchId = String((input && input.toBranchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !memberId || !toBranchId || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  const reason = plainText(input.reason, "reason", { required: false, max: 1000 });
  if (!reason.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: reason.reason };

  try {
    return await withClient(db, async (client) => {
      const gate = await requireManager(client, input, "members.edit");
      if (!gate.ok) return gate;
      const member = await repo.findMemberInChurch(client, { memberId, churchId });
      if (!member) return { ok: false, status: STATUS.NOT_FOUND, reason: "member_not_found" };
      const toBranch = await repo.findBranchById(client, toBranchId);
      if (!toBranch || String(toBranch.church_id) !== churchId || toBranch.status !== "active") {
        return { ok: false, status: STATUS.INVALID_INPUT, reason: "to_branch" };
      }
      const fromBranchId = member.branchId || (await findPrimaryBranchId(client, memberId));
      if (!fromBranchId) {
        return { ok: false, status: STATUS.INVALID_INPUT, reason: "from_branch" };
      }
      if (String(fromBranchId) === String(toBranchId)) {
        return { ok: false, status: STATUS.INVALID_INPUT, reason: "same_branch" };
      }
      try {
        const transfer = await repo.insertTransferRequest(client, {
          churchId,
          memberId,
          fromBranchId,
          toBranchId,
          reason: reason.value,
          requestedByUserId: actorUserId,
        });
        return { ok: true, status: STATUS.OK, transfer };
      } catch (err) {
        if (/unique|duplicate/i.test(String(err && err.message))) {
          return { ok: false, status: STATUS.CONFLICT, reason: "open_transfer_exists" };
        }
        throw err;
      }
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup" };
  }
}

async function findPrimaryBranchId(client, memberId) {
  const { rows } = await client.query(
    `SELECT branch_id FROM blessboard.member_branch_memberships
      WHERE member_id = $1 AND is_primary = true LIMIT 1`,
    [memberId]
  );
  return rows[0] ? rows[0].branch_id : null;
}

async function reviewMemberBranchTransfer(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const transferId = String((input && input.transferId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const decision = String((input && input.decision) || "").trim().toLowerCase();
  if (!churchId || !transferId || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  if (decision !== "approved" && decision !== "declined") {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "decision" };
  }
  const reviewerNotes = plainText(input.reviewerNotes, "reviewer_notes", {
    required: false,
    max: 2000,
  });
  if (!reviewerNotes.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: reviewerNotes.reason };
  }

  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const gate = await requireManager(client, input, "members.edit");
        if (!gate.ok) {
          await client.query("ROLLBACK");
          return gate;
        }
        const transfer = await repo.getTransferById(client, { id: transferId, churchId });
        if (!transfer) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
        }
        if (transfer.status !== "requested") {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.CONFLICT, reason: `status_${transfer.status}` };
        }
        if (decision === "approved") {
          await repo.setPrimaryMembershipBranch(client, {
            memberId: transfer.memberId,
            fromBranchId: transfer.fromBranchId,
            toBranchId: transfer.toBranchId,
          });
        }
        const updated = await repo.updateTransferStatus(client, {
          id: transferId,
          churchId,
          status: decision,
          reviewerNotes: reviewerNotes.value,
          reviewedByUserId: actorUserId,
        });
        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, transfer: updated };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });
  } catch {
    return { ok: false, status: STATUS.TRANSACTION_ERROR, reason: "transaction" };
  }
}

async function updateApprovedMemberProfile(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const memberId = String((input && input.memberId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !memberId || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  try {
    return await withClient(db, async (client) => {
      const gate = await requireManager(client, input, "members.edit");
      if (!gate.ok) return gate;
      const member = await repo.findMemberInChurch(client, { memberId, churchId });
      if (!member) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
      const fields = { memberId };
      if (input.firstName != null && String(input.firstName).trim()) {
        fields.firstName = String(input.firstName).trim().slice(0, 100);
      }
      if (input.lastName != null && String(input.lastName).trim()) {
        fields.lastName = String(input.lastName).trim().slice(0, 100);
      }
      if (input.preferredName !== undefined) {
        fields.preferredName =
          input.preferredName == null || input.preferredName === ""
            ? null
            : String(input.preferredName).trim().slice(0, 100);
      }
      if (input.email !== undefined) {
        fields.emailDisplay =
          input.email == null || input.email === ""
            ? null
            : String(input.email).trim().slice(0, 254);
      }
      if (input.phone !== undefined && input.phone != null && String(input.phone).trim()) {
        const phone = String(input.phone).trim().slice(0, 32);
        fields.phoneDisplay = phone;
        fields.phoneNormalized = phone;
      }
      const updated = await repo.updateMemberProfileFields(client, fields);
      return { ok: true, status: STATUS.OK, member: updated };
    });
  } catch (err) {
    if (/unique|duplicate/i.test(String(err && err.message))) {
      return { ok: false, status: STATUS.CONFLICT, reason: "duplicate_contact" };
    }
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "lookup" };
  }
}

module.exports = {
  STATUS,
  OPTIONAL_APPLICATION_KEYS,
  FORBIDDEN_APPLICATION_KEYS,
  createMembershipIntakeForm,
  publishMembershipIntakeForm,
  listMembershipIntakeForms,
  submitMembershipApplication,
  requestNeedsFollowUp,
  updateRegistrationPastoralNotes,
  getMembershipApplicationForReview,
  requestMemberBranchTransfer,
  reviewMemberBranchTransfer,
  updateApprovedMemberProfile,
  // re-export core decisions for route convenience
  reviewMemberRegistration,
  approveMemberRegistration,
  rejectMemberRegistration,
};
