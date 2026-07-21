"use strict";

/**
 * Persist pending apex church-registration applications.
 * Schema-qualified V5 table only — never public/legacy relations.
 */

const TARGET_SCHEMA = "blessboard";
const TARGET_TABLE = "platform_church_registration_applications";
const TARGET_RELATION = `${TARGET_SCHEMA}.${TARGET_TABLE}`;

/** Forbidden legacy / unqualified relation names (regression guard). */
const FORBIDDEN_RELATION_FRAGMENTS = Object.freeze([
  "public.church_platform_inquiries",
  "public.church_applications",
  "public.registration_applications",
  "public.church_registrations",
  "public.tenants",
  "public.session",
  " INTO church_platform_inquiries",
  " INTO church_applications",
  " INTO registration_applications",
  " FROM church_platform_inquiries",
  " FROM church_applications",
]);

const SELECT_COLUMNS = `
  id, status, church_name, country, city, contact_name, contact_email, contact_phone,
  contact_phone_normalized,
  role_in_church, branch_name, branch_count, selected_plan, message, consent_terms,
  review_notes, source_ip, user_agent, created_at, updated_at,
  organization_id, application_status, provisioning_status,
  provisioning_started_at, provisioned_at, provisioning_failed_at,
  provisioning_error_code, provisioning_error_detail,
  support_requested, follow_up_status,
  assigned_support_user_id, first_contacted_at, last_contacted_at, next_follow_up_at,
  risk_decision, risk_reason_codes, risk_decided_at, rejection_reason, review_events
`;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const {
  phoneUniquenessSqlPredicate,
  DUPLICATE_PHONE_MESSAGE,
} = require("../services/normalizeRegistrationPhone");

class DuplicateRegistrationPhoneError extends Error {
  constructor(message) {
    super(message || DUPLICATE_PHONE_MESSAGE);
    this.name = "DuplicateRegistrationPhoneError";
    this.code = "duplicate_registration_phone";
    this.field = "phone";
    this.httpStatus = 400;
  }
}

function isUniquePhoneViolation(err) {
  if (!err) return false;
  if (String(err.code) !== "23505") return false;
  const constraint = String(err.constraint || err.constraint_name || "");
  const detail = String(err.detail || err.message || "");
  return (
    constraint.includes("phone_normalized") ||
    detail.includes("contact_phone_normalized") ||
    detail.includes("platform_church_reg_apps_phone_normalized_active_uidx")
  );
}

/**
 * @param {{ query: Function }} client
 * @param {object} fields
 */
async function insertApplicationRow(client, fields) {
  const supportRequested = Boolean(fields.support_requested);
  const followUpStatus =
    fields.follow_up_status != null && String(fields.follow_up_status).trim() !== ""
      ? String(fields.follow_up_status).trim().toLowerCase()
      : null;
  const applicationStatus =
    fields.application_status != null && String(fields.application_status).trim() !== ""
      ? String(fields.application_status).trim().toLowerCase()
      : "submitted";
  const riskDecision =
    fields.risk_decision != null && String(fields.risk_decision).trim() !== ""
      ? String(fields.risk_decision).trim().toLowerCase()
      : null;
  const riskReasonCodes = Array.isArray(fields.risk_reason_codes)
    ? fields.risk_reason_codes.map((c) => String(c).trim().toLowerCase()).filter(Boolean)
    : [];
  const riskDecidedAt = fields.risk_decided_at != null ? fields.risk_decided_at : null;
  const r = await client.query(
    `INSERT INTO ${TARGET_RELATION} (
       status, application_status, provisioning_status,
       church_name, country, city, contact_name, contact_email, contact_phone,
       contact_phone_normalized,
       role_in_church, branch_name, branch_count, selected_plan, message, consent_terms,
       source_ip, user_agent,
       support_requested, follow_up_status,
       risk_decision, risk_reason_codes, risk_decided_at
     ) VALUES (
       'pending', $18, 'not_started',
       $1, $2, $3, $4, $5, $6,
       $7,
       $8, $9, $10, $11, $12, $13,
       $14, $15,
       $16, $17,
       $19, $20::text[], $21
     )
     RETURNING ${SELECT_COLUMNS}`,
    [
      fields.church_name,
      fields.country,
      fields.city,
      fields.contact_name,
      fields.contact_email,
      fields.contact_phone,
      fields.contact_phone_normalized || null,
      fields.role_in_church || null,
      fields.branch_name || null,
      fields.branch_count || null,
      fields.selected_plan || null,
      fields.message || null,
      Boolean(fields.consent_terms),
      fields.source_ip || null,
      fields.user_agent || null,
      supportRequested,
      followUpStatus,
      applicationStatus,
      riskDecision,
      riskReasonCodes,
      riskDecidedAt,
    ]
  );
  return r.rows[0];
}

/**
 * @param {import('pg').Pool} pool
 * @param {object} fields
 */
async function createApplication(pool, fields) {
  return insertApplicationRow(pool, fields);
}

/**
 * Recent twin used for accidental double-submit idempotency.
 * Prefers canonical application_status when present; legacy status=pending retained
 * for dormant list/count helpers until Phase 5 cutover.
 * @param {{ query: Function }} client
 * @param {{ contact_email: string, church_name: string, windowMinutes?: number }} opts
 */
async function findRecentRegistrationDuplicate(client, opts) {
  const windowMinutes = Math.min(Math.max(Number(opts.windowMinutes) || 15, 1), 60);
  const r = await client.query(
    `SELECT ${SELECT_COLUMNS}
       FROM ${TARGET_RELATION}
      WHERE lower(contact_email) = lower($1)
        AND lower(church_name) = lower($2)
        AND created_at >= now() - ($3::int * interval '1 minute')
        AND (
          application_status IN ('submitted', 'duplicate_review', 'closed')
          OR status = 'pending'
        )
      ORDER BY created_at DESC
      LIMIT 1`,
    [opts.contact_email, opts.church_name, windowMinutes]
  );
  return r.rows[0] || null;
}

/**
 * Same-email + same normalized phone within the soft window (browser retry).
 * @param {{ query: Function }} client
 * @param {{ contact_email: string, contact_phone_normalized: string, windowMinutes?: number }} opts
 */
async function findRecentPhoneIdempotentDuplicate(client, opts) {
  const normalized = String(opts.contact_phone_normalized || "").trim();
  if (!normalized) return null;
  const windowMinutes = Math.min(Math.max(Number(opts.windowMinutes) || 15, 1), 60);
  const r = await client.query(
    `SELECT ${SELECT_COLUMNS}
       FROM ${TARGET_RELATION}
      WHERE lower(contact_email) = lower($1)
        AND contact_phone_normalized = $2
        AND created_at >= now() - ($3::int * interval '1 minute')
        AND ${phoneUniquenessSqlPredicate()}
      ORDER BY created_at DESC
      LIMIT 1`,
    [opts.contact_email, normalized, windowMinutes]
  );
  return r.rows[0] || null;
}

/**
 * Occupying application for this normalized phone (blocks a new org registration).
 * @param {{ query: Function }} client
 * @param {string} contactPhoneNormalized
 */
async function findActiveRegistrationByPhone(client, contactPhoneNormalized) {
  const normalized = String(contactPhoneNormalized || "").trim();
  if (!normalized) return null;
  const r = await client.query(
    `SELECT ${SELECT_COLUMNS}
       FROM ${TARGET_RELATION}
      WHERE contact_phone_normalized = $1
        AND ${phoneUniquenessSqlPredicate()}
      ORDER BY created_at DESC
      LIMIT 1`,
    [normalized]
  );
  return r.rows[0] || null;
}

/**
 * Recent pending twin used for accidental double-submit idempotency.
 * @param {import('pg').Pool} pool
 * @param {{ contact_email: string, church_name: string, windowMinutes?: number }} opts
 */
async function findRecentPendingDuplicate(pool, opts) {
  return findRecentRegistrationDuplicate(pool, opts);
}

/**
 * Insert at most one application for the same email+church within the window.
 * Enforces normalized-phone uniqueness for occupying statuses (friendly pre-check + DB index).
 * Passwords must never be passed in fields.
 * @param {import('pg').Pool} pool
 * @param {object} fields
 * @param {{ windowMinutes?: number }} [opts]
 * @returns {Promise<{ application: object, duplicate: boolean }>}
 */
async function createApplicationIdempotent(pool, fields, opts = {}) {
  if (!pool || typeof pool.query !== "function") {
    const err = new Error("database required");
    err.code = "pool_unavailable";
    throw err;
  }

  async function resolveOrInsert(client) {
    const existing = await findRecentRegistrationDuplicate(client, {
      contact_email: fields.contact_email,
      church_name: fields.church_name,
      windowMinutes: opts.windowMinutes,
    });
    if (existing) {
      return { application: existing, duplicate: true };
    }

    const phoneNormalized = fields.contact_phone_normalized
      ? String(fields.contact_phone_normalized).trim()
      : "";
    if (phoneNormalized) {
      const phoneRetry = await findRecentPhoneIdempotentDuplicate(client, {
        contact_email: fields.contact_email,
        contact_phone_normalized: phoneNormalized,
        windowMinutes: opts.windowMinutes,
      });
      if (phoneRetry) {
        return { application: phoneRetry, duplicate: true };
      }
      const phoneConflict = await findActiveRegistrationByPhone(client, phoneNormalized);
      if (phoneConflict) {
        throw new DuplicateRegistrationPhoneError();
      }
    }

    try {
      const application = await insertApplicationRow(client, fields);
      return { application, duplicate: false };
    } catch (err) {
      if (isUniquePhoneViolation(err)) {
        throw new DuplicateRegistrationPhoneError();
      }
      throw err;
    }
  }

  // Query-only mocks / clients: insert without advisory lock (tests + fallback).
  if (typeof pool.connect !== "function") {
    return resolveOrInsert(pool);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lockKey = `${String(fields.contact_email || "")
      .trim()
      .toLowerCase()}|${String(fields.church_name || "")
      .trim()
      .toLowerCase()}`;
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [lockKey.slice(0, 200)]);
    if (fields.contact_phone_normalized) {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `phone|${String(fields.contact_phone_normalized).trim()}`.slice(0, 200),
      ]);
    }
    const result = await resolveOrInsert(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    if (err instanceof DuplicateRegistrationPhoneError || isUniquePhoneViolation(err)) {
      throw err instanceof DuplicateRegistrationPhoneError
        ? err
        : new DuplicateRegistrationPhoneError();
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ status?: string, limit?: number }} [opts]
 */
async function listApplications(pool, opts = {}) {
  const params = [];
  const clauses = [];
  const status = String(opts.status || "").trim().toLowerCase();
  if (status && status !== "all") {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 200);
  params.push(limit);
  const r = await pool.query(
    `SELECT ${SELECT_COLUMNS}
       FROM ${TARGET_RELATION}
       ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}`,
    params
  );
  return r.rows;
}

/**
 * @param {import('pg').Pool} pool
 */
async function countPending(pool) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM ${TARGET_RELATION}
      WHERE application_status IN ('submitted', 'duplicate_review')
         OR (status = 'pending' AND application_status NOT IN ('closed', 'rejected', 'cancelled'))`
  );
  return r.rows[0]?.count || 0;
}

/**
 * Safety helper for tests — count organizations created after a timestamp.
 * @param {import('pg').Pool} pool
 * @param {Date | string} since
 */
async function countOrganizationsCreatedSince(pool, since) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM platform.organizations
      WHERE created_at >= $1`,
    [since]
  );
  return r.rows[0]?.count || 0;
}

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<boolean>}
 */
async function registrationTableExists(pool) {
  const r = await pool.query(`SELECT to_regclass($1) AS rel`, [TARGET_RELATION]);
  return Boolean(r.rows[0] && r.rows[0].rel);
}

/**
 * @param {{ query: Function }} client
 * @param {string} applicationId
 */
async function lockApplicationById(client, applicationId) {
  const id = String(applicationId || "").trim();
  if (!UUID_RE.test(id)) return null;
  const r = await client.query(
    `SELECT ${SELECT_COLUMNS}
       FROM ${TARGET_RELATION}
      WHERE id = $1
      FOR UPDATE`,
    [id]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} applicationId
 */
async function findApplicationById(client, applicationId) {
  const id = String(applicationId || "").trim();
  if (!UUID_RE.test(id)) return null;
  const r = await client.query(
    `SELECT ${SELECT_COLUMNS}
       FROM ${TARGET_RELATION}
      WHERE id = $1`,
    [id]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} applicationId
 * @param {{
 *   applicationStatus?: string|null,
 *   provisioningStatus?: string|null,
 *   organizationId?: string|null,
 *   provisioningStartedAt?: Date|string|null,
 *   provisionedAt?: Date|string|null,
 *   provisioningFailedAt?: Date|string|null,
 *   provisioningErrorCode?: string|null,
 *   provisioningErrorDetail?: string|null,
 *   clearFailureMetadata?: boolean,
 *   legacyStatus?: string|null,
 * }} patch
 */
async function updateApplicationProvisioningState(client, applicationId, patch) {
  const id = String(applicationId || "").trim();
  if (!UUID_RE.test(id)) {
    throw new Error("invalid_application_id");
  }
  const clear = Boolean(patch.clearFailureMetadata);
  const setOrg = Object.prototype.hasOwnProperty.call(patch, "organizationId");
  const setLegacy = Object.prototype.hasOwnProperty.call(patch, "legacyStatus");
  const r = await client.query(
    `UPDATE ${TARGET_RELATION}
        SET application_status = COALESCE($2, application_status),
            provisioning_status = COALESCE($3, provisioning_status),
            organization_id = CASE WHEN $4::boolean THEN $5::uuid ELSE organization_id END,
            provisioning_started_at = COALESCE($6, provisioning_started_at),
            provisioned_at = COALESCE($7, provisioned_at),
            provisioning_failed_at = CASE
              WHEN $8::boolean THEN NULL
              ELSE COALESCE($9, provisioning_failed_at)
            END,
            provisioning_error_code = CASE
              WHEN $8::boolean THEN NULL
              ELSE COALESCE($10, provisioning_error_code)
            END,
            provisioning_error_detail = CASE
              WHEN $8::boolean THEN NULL
              ELSE COALESCE($11, provisioning_error_detail)
            END,
            status = CASE WHEN $12::boolean THEN $13::text ELSE status END,
            updated_at = now()
      WHERE id = $1
      RETURNING ${SELECT_COLUMNS}`,
    [
      id,
      patch.applicationStatus != null ? patch.applicationStatus : null,
      patch.provisioningStatus != null ? patch.provisioningStatus : null,
      setOrg,
      setOrg ? patch.organizationId : null,
      patch.provisioningStartedAt != null ? patch.provisioningStartedAt : null,
      patch.provisionedAt != null ? patch.provisionedAt : null,
      clear,
      !clear && patch.provisioningFailedAt != null ? patch.provisioningFailedAt : null,
      !clear && patch.provisioningErrorCode != null ? patch.provisioningErrorCode : null,
      !clear && patch.provisioningErrorDetail != null ? patch.provisioningErrorDetail : null,
      setLegacy,
      setLegacy ? patch.legacyStatus : null,
    ]
  );
  return r.rows[0] || null;
}

const APPLICATION_STATUSES = Object.freeze([
  "submitted",
  "duplicate_review",
  "rejected",
  "cancelled",
  "closed",
]);
const PROVISIONING_STATUSES = Object.freeze([
  "not_started",
  "provisioning",
  "provisioned",
  "provisioning_failed",
]);
const FOLLOW_UP_STATUSES = Object.freeze([
  "new",
  "contact_pending",
  "call_pending",
  "contacted",
  "awaiting_customer",
  "validation_pending",
  "validation_in_progress",
  "qualified",
  "approved_for_provision",
  "needs_help",
  "self_onboarding",
  "completed",
  "unreachable",
  "not_interested",
]);

/** Prompt 26 workflow labels (derived / stored follow-up + application axes). */
const WORKFLOW_STATUSES = Object.freeze([
  "new",
  "contact_pending",
  "contacted",
  "awaiting_customer",
  "validation_pending",
  "validation_in_progress",
  "qualified",
  "approved_for_provision",
  "approved",
  "closed",
  "rejected",
]);

/**
 * Normalize synonyms (legacy call_pending → contact_pending filter match).
 * @param {string} status
 */
function normalizeFollowUpStatusInput(status) {
  const s = String(status || "")
    .trim()
    .toLowerCase();
  if (s === "call_pending") return "contact_pending";
  if (s === "needs_help" || s === "self_onboarding") return s;
  return s;
}

/**
 * Update application-level support fields for unprovisioned registrations.
 * @param {{ query: Function }} client
 * @param {string} applicationId
 * @param {{
 *   followUpStatus?: string|null,
 *   supportRequested?: boolean,
 *   assignedSupportUserId?: string|null,
 *   clearAssignedSupport?: boolean,
 *   firstContactedAt?: Date|string|null,
 *   lastContactedAt?: Date|string|null,
 *   nextFollowUpAt?: Date|string|null,
 *   reviewEvent?: object|null,
 * }} patch
 */
async function updateApplicationSupportFollowUp(client, applicationId, patch) {
  const id = String(applicationId || "").trim();
  if (!UUID_RE.test(id)) {
    throw new Error("invalid_application_id");
  }
  const setFollowUp = Object.prototype.hasOwnProperty.call(patch || {}, "followUpStatus");
  let followUpStatus = null;
  if (setFollowUp && patch.followUpStatus != null && String(patch.followUpStatus).trim() !== "") {
    followUpStatus = String(patch.followUpStatus).trim().toLowerCase();
    if (!FOLLOW_UP_STATUSES.includes(followUpStatus)) {
      throw new Error("invalid_follow_up_status");
    }
  }
  const setSupport = Object.prototype.hasOwnProperty.call(patch || {}, "supportRequested");
  const clearAssignee = Boolean(patch && patch.clearAssignedSupport);
  const setAssignee = Object.prototype.hasOwnProperty.call(patch || {}, "assignedSupportUserId");
  const setFirst = Object.prototype.hasOwnProperty.call(patch || {}, "firstContactedAt");
  const setLast = Object.prototype.hasOwnProperty.call(patch || {}, "lastContactedAt");
  const setNext = Object.prototype.hasOwnProperty.call(patch || {}, "nextFollowUpAt");
  const reviewEvent =
    patch && patch.reviewEvent && typeof patch.reviewEvent === "object" ? patch.reviewEvent : null;

  const r = await client.query(
    `UPDATE ${TARGET_RELATION}
        SET follow_up_status = CASE WHEN $2::boolean THEN $3::text ELSE follow_up_status END,
            support_requested = CASE
              WHEN $4::boolean THEN $5::boolean
              ELSE support_requested
            END,
            assigned_support_user_id = CASE
              WHEN $6::boolean THEN NULL
              WHEN $7::boolean THEN $8::uuid
              ELSE assigned_support_user_id
            END,
            first_contacted_at = CASE
              WHEN $9::boolean THEN COALESCE(first_contacted_at, $10::timestamptz)
              ELSE first_contacted_at
            END,
            last_contacted_at = CASE
              WHEN $11::boolean THEN $12::timestamptz
              ELSE last_contacted_at
            END,
            next_follow_up_at = CASE
              WHEN $13::boolean THEN $14::timestamptz
              ELSE next_follow_up_at
            END,
            review_events = CASE
              WHEN $15::boolean THEN COALESCE(review_events, '[]'::jsonb) || jsonb_build_array($16::jsonb)
              ELSE review_events
            END,
            updated_at = now()
      WHERE id = $1
      RETURNING ${SELECT_COLUMNS}`,
    [
      id,
      setFollowUp && followUpStatus != null,
      followUpStatus,
      setSupport,
      setSupport ? Boolean(patch.supportRequested) : false,
      clearAssignee,
      setAssignee && !clearAssignee,
      setAssignee && !clearAssignee ? patch.assignedSupportUserId : null,
      setFirst,
      setFirst ? patch.firstContactedAt : null,
      setLast,
      setLast ? patch.lastContactedAt : null,
      setNext,
      setNext ? patch.nextFollowUpAt : null,
      Boolean(reviewEvent),
      reviewEvent ? JSON.stringify(reviewEvent) : "{}",
    ]
  );
  return r.rows[0] || null;
}

/**
 * Persist risk decision fields and/or application status for review/reject flows.
 * @param {{ query: Function }} client
 * @param {string} applicationId
 * @param {{
 *   applicationStatus?: string|null,
 *   riskDecision?: string|null,
 *   riskReasonCodes?: string[]|null,
 *   riskDecidedAt?: string|Date|null,
 *   rejectionReason?: string|null,
 *   reviewNotes?: string|null,
 *   reviewEvent?: object|null,
 *   clearRejectionReason?: boolean,
 * }} patch
 */
async function updateApplicationRiskReviewState(client, applicationId, patch) {
  const id = String(applicationId || "").trim();
  if (!UUID_RE.test(id)) {
    throw new Error("invalid_application_id");
  }
  const setStatus = Object.prototype.hasOwnProperty.call(patch || {}, "applicationStatus");
  const setRiskDecision = Object.prototype.hasOwnProperty.call(patch || {}, "riskDecision");
  const setRiskCodes = Object.prototype.hasOwnProperty.call(patch || {}, "riskReasonCodes");
  const setRiskAt = Object.prototype.hasOwnProperty.call(patch || {}, "riskDecidedAt");
  const setRejection = Object.prototype.hasOwnProperty.call(patch || {}, "rejectionReason");
  const setNotes = Object.prototype.hasOwnProperty.call(patch || {}, "reviewNotes");
  const clearRejection = Boolean(patch && patch.clearRejectionReason);
  const reviewEvent = patch && patch.reviewEvent && typeof patch.reviewEvent === "object"
    ? patch.reviewEvent
    : null;

  const reasonCodes = Array.isArray(patch && patch.riskReasonCodes)
    ? patch.riskReasonCodes.map((c) => String(c).trim().toLowerCase()).filter(Boolean)
    : [];

  const r = await client.query(
    `UPDATE ${TARGET_RELATION}
        SET application_status = CASE WHEN $2::boolean THEN $3::text ELSE application_status END,
            risk_decision = CASE WHEN $4::boolean THEN $5::text ELSE risk_decision END,
            risk_reason_codes = CASE WHEN $6::boolean THEN $7::text[] ELSE risk_reason_codes END,
            risk_decided_at = CASE WHEN $8::boolean THEN $9::timestamptz ELSE risk_decided_at END,
            rejection_reason = CASE
              WHEN $10::boolean THEN NULL
              WHEN $11::boolean THEN $12::text
              ELSE rejection_reason
            END,
            review_notes = CASE WHEN $13::boolean THEN $14::text ELSE review_notes END,
            review_events = CASE
              WHEN $15::boolean THEN COALESCE(review_events, '[]'::jsonb) || jsonb_build_array($16::jsonb)
              ELSE review_events
            END,
            updated_at = now()
      WHERE id = $1
      RETURNING ${SELECT_COLUMNS}`,
    [
      id,
      setStatus,
      setStatus ? String(patch.applicationStatus) : null,
      setRiskDecision,
      setRiskDecision ? (patch.riskDecision != null ? String(patch.riskDecision) : null) : null,
      setRiskCodes,
      reasonCodes,
      setRiskAt,
      setRiskAt ? patch.riskDecidedAt : null,
      clearRejection,
      setRejection && !clearRejection,
      setRejection && !clearRejection
        ? patch.rejectionReason != null
          ? String(patch.rejectionReason).slice(0, 500)
          : null
        : null,
      setNotes,
      setNotes ? (patch.reviewNotes != null ? String(patch.reviewNotes).slice(0, 5000) : null) : null,
      Boolean(reviewEvent),
      reviewEvent ? JSON.stringify(reviewEvent) : "{}",
    ]
  );
  return r.rows[0] || null;
}

const CONTACT_METHODS = Object.freeze(["phone", "email", "message", "meeting", "internal_note"]);
const CONTACT_OUTCOMES = Object.freeze([
  "reached",
  "no_answer",
  "left_message",
  "scheduled",
  "declined",
  "completed",
  "other",
]);
const LINKED_FILTERS = Object.freeze(["all", "linked", "unlinked"]);
const SORT_OPTIONS = Object.freeze({
  created_desc: "a.created_at DESC, a.id DESC",
  created_asc: "a.created_at ASC, a.id ASC",
});

const LIST_JOIN_SELECT = `
  a.id, a.status AS legacy_status, a.church_name, a.country, a.city,
  a.contact_name, a.contact_email, a.contact_phone, a.contact_phone_normalized, a.role_in_church,
  a.branch_name, a.branch_count, a.selected_plan, a.message, a.consent_terms,
  a.created_at, a.updated_at, a.organization_id, a.application_status, a.provisioning_status,
  a.provisioning_started_at, a.provisioned_at, a.provisioning_failed_at,
  a.provisioning_error_code, a.provisioning_error_detail,
  a.risk_decision, a.risk_reason_codes, a.risk_decided_at, a.rejection_reason,
  o.organization_key, o.display_name AS organization_display_name, o.status AS organization_status,
  o.created_at AS organization_created_at,
  oo.onboarding_status,
  CASE
    WHEN oo.organization_id IS NOT NULL THEN oo.assigned_support_user_id
    ELSE a.assigned_support_user_id
  END AS assigned_support_user_id,
  CASE
    WHEN oo.organization_id IS NOT NULL THEN oo.first_contacted_at
    ELSE a.first_contacted_at
  END AS first_contacted_at,
  CASE
    WHEN oo.organization_id IS NOT NULL THEN oo.last_contacted_at
    ELSE a.last_contacted_at
  END AS last_contacted_at,
  CASE
    WHEN oo.organization_id IS NOT NULL THEN oo.next_follow_up_at
    ELSE a.next_follow_up_at
  END AS next_follow_up_at,
  oo.onboarding_started_at, oo.onboarding_completed_at,
  oo.last_activity_at,
  CASE
    WHEN oo.organization_id IS NOT NULL THEN oo.follow_up_status
    ELSE a.follow_up_status
  END AS follow_up_status,
  CASE
    WHEN oo.organization_id IS NOT NULL THEN oo.support_requested
    ELSE COALESCE(a.support_requested, false)
  END AS support_requested,
  su.display_name AS support_display_name, su.email_normalized AS support_email
`;

/** Effective follow-up / support expressions shared by list filters (no N+1). */
const EFFECTIVE_FOLLOW_UP_SQL = `CASE
    WHEN oo.organization_id IS NOT NULL THEN oo.follow_up_status
    ELSE a.follow_up_status
  END`;
const EFFECTIVE_SUPPORT_REQUESTED_SQL = `CASE
    WHEN oo.organization_id IS NOT NULL THEN oo.support_requested
    ELSE COALESCE(a.support_requested, false)
  END`;
const EFFECTIVE_NEXT_FOLLOW_UP_SQL = `CASE
    WHEN oo.organization_id IS NOT NULL THEN oo.next_follow_up_at
    ELSE a.next_follow_up_at
  END`;
const EFFECTIVE_ASSIGNED_SUPPORT_SQL = `CASE
    WHEN oo.organization_id IS NOT NULL THEN oo.assigned_support_user_id
    ELSE a.assigned_support_user_id
  END`;
const ACTIVE_FOLLOW_UP_SQL = `${EFFECTIVE_FOLLOW_UP_SQL} IS DISTINCT FROM 'completed'
    AND ${EFFECTIVE_FOLLOW_UP_SQL} IS DISTINCT FROM 'not_interested'
    AND ${EFFECTIVE_FOLLOW_UP_SQL} IS DISTINCT FROM 'unreachable'`;

/**
 * Escape LIKE metacharacters for safe parameterized ILIKE.
 * @param {string} raw
 */
function escapeLikePattern(raw) {
  return String(raw || "")
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * @param {object} filters
 * @returns {{ where: string, params: unknown[] }}
 */
function buildRegistrationListWhere(filters) {
  const params = [];
  const clauses = [];

  if (filters.applicationStatus) {
    params.push(filters.applicationStatus);
    clauses.push(`a.application_status = $${params.length}`);
  }
  if (filters.provisioningStatus) {
    params.push(filters.provisioningStatus);
    clauses.push(`a.provisioning_status = $${params.length}`);
  }
  if (filters.followUpStatus) {
    const follow = normalizeFollowUpStatusInput(filters.followUpStatus);
    if (follow === "contact_pending") {
      clauses.push(
        `${EFFECTIVE_FOLLOW_UP_SQL} IN ('contact_pending', 'call_pending')`
      );
    } else {
      params.push(filters.followUpStatus);
      clauses.push(`${EFFECTIVE_FOLLOW_UP_SQL} = $${params.length}`);
    }
  }
  if (filters.selectedPlan) {
    params.push(filters.selectedPlan);
    clauses.push(`a.selected_plan = $${params.length}`);
  }
  if (filters.supportRequested === true) {
    clauses.push(`${EFFECTIVE_SUPPORT_REQUESTED_SQL} = TRUE`);
  } else if (filters.supportRequested === false) {
    clauses.push(`${EFFECTIVE_SUPPORT_REQUESTED_SQL} = FALSE`);
  }
  if (filters.requiresReview === true) {
    clauses.push(`(
      a.application_status IN ('submitted', 'duplicate_review')
      OR a.provisioning_status = 'provisioning_failed'
      OR ${EFFECTIVE_SUPPORT_REQUESTED_SQL} = TRUE
      OR ${EFFECTIVE_FOLLOW_UP_SQL} IN (
        'new', 'call_pending', 'contact_pending', 'needs_help', 'awaiting_customer'
      )
    )`);
  }
  if (filters.overdueFollowUp === true) {
    clauses.push(`(
      ${EFFECTIVE_NEXT_FOLLOW_UP_SQL} IS NOT NULL
      AND ${EFFECTIVE_NEXT_FOLLOW_UP_SQL} < now()
      AND a.application_status NOT IN ('rejected', 'cancelled', 'closed')
      AND (${ACTIVE_FOLLOW_UP_SQL})
    )`);
  }
  if (filters.linked === "linked") {
    clauses.push(`a.organization_id IS NOT NULL`);
  } else if (filters.linked === "unlinked") {
    clauses.push(`a.organization_id IS NULL`);
  }
  if (filters.createdFrom) {
    params.push(filters.createdFrom);
    clauses.push(`a.created_at >= $${params.length}::timestamptz`);
  }
  if (filters.createdToExclusive) {
    params.push(filters.createdToExclusive);
    clauses.push(`a.created_at < $${params.length}::timestamptz`);
  }
  if (filters.search) {
    params.push(`%${escapeLikePattern(filters.search)}%`);
    const idx = params.length;
    clauses.push(`(
      a.church_name ILIKE $${idx} ESCAPE '\\'
      OR a.contact_name ILIKE $${idx} ESCAPE '\\'
      OR a.contact_email ILIKE $${idx} ESCAPE '\\'
      OR COALESCE(a.contact_phone, '') ILIKE $${idx} ESCAPE '\\'
      OR COALESCE(o.organization_key, '') ILIKE $${idx} ESCAPE '\\'
    )`);
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

/**
 * Paginated registration application list with org/onboarding joins (no N+1).
 * @param {import('pg').Pool|{ query: Function }} pool
 * @param {{
 *   applicationStatus?: string|null,
 *   provisioningStatus?: string|null,
 *   followUpStatus?: string|null,
 *   linked?: string,
 *   search?: string|null,
 *   createdFrom?: string|null,
 *   createdToExclusive?: string|null,
 *   sort?: string,
 *   limit?: number,
 *   offset?: number,
 * }} filters
 */
async function listRegistrationApplications(pool, filters = {}) {
  const limit = Math.min(Math.max(Number(filters.limit) || 25, 1), 100);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  const sortSql = SORT_OPTIONS[filters.sort] || SORT_OPTIONS.created_desc;
  const built = buildRegistrationListWhere(filters);
  const params = [...built.params, limit, offset];
  const r = await pool.query(
    `SELECT ${LIST_JOIN_SELECT}
       FROM ${TARGET_RELATION} a
       LEFT JOIN platform.organizations o ON o.id = a.organization_id
       LEFT JOIN blessboard.organization_onboarding oo ON oo.organization_id = a.organization_id
       LEFT JOIN blessboard.users su ON su.id = ${EFFECTIVE_ASSIGNED_SUPPORT_SQL}
       ${built.where}
      ORDER BY ${sortSql}
      LIMIT $${built.params.length + 1}
      OFFSET $${built.params.length + 2}`,
    params
  );
  return r.rows;
}

/**
 * @param {import('pg').Pool|{ query: Function }} pool
 * @param {object} filters
 */
async function countRegistrationApplications(pool, filters = {}) {
  const built = buildRegistrationListWhere(filters);
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM ${TARGET_RELATION} a
       LEFT JOIN platform.organizations o ON o.id = a.organization_id
       LEFT JOIN blessboard.organization_onboarding oo ON oo.organization_id = a.organization_id
       ${built.where}`,
    built.params
  );
  return r.rows[0]?.count || 0;
}

/**
 * Full application row with organization + onboarding (for detail).
 * @param {{ query: Function }} client
 * @param {string} applicationId
 */
async function getRegistrationApplicationById(client, applicationId) {
  const id = String(applicationId || "").trim();
  if (!UUID_RE.test(id)) return null;
  const r = await client.query(
    `SELECT ${LIST_JOIN_SELECT},
            a.review_notes, a.source_ip, a.user_agent, a.message AS registration_message,
            a.review_events
       FROM ${TARGET_RELATION} a
       LEFT JOIN platform.organizations o ON o.id = a.organization_id
       LEFT JOIN blessboard.organization_onboarding oo ON oo.organization_id = a.organization_id
       LEFT JOIN blessboard.users su ON su.id = ${EFFECTIVE_ASSIGNED_SUPPORT_SQL}
      WHERE a.id = $1
      LIMIT 1`,
    [id]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationId
 * @param {{
 *   followUpStatus?: string|null,
 *   assignedSupportUserId?: string|null,
 *   clearAssignedSupport?: boolean,
 *   firstContactedAt?: Date|string|null,
 *   lastContactedAt?: Date|string|null,
 *   nextFollowUpAt?: Date|string|null,
 *   lastActivityAt?: Date|string|null,
 * }} patch
 */
async function updateOrganizationOnboarding(client, organizationId, patch) {
  const id = String(organizationId || "").trim();
  if (!UUID_RE.test(id)) {
    throw new Error("invalid_organization_id");
  }
  const clearAssignee = Boolean(patch.clearAssignedSupport);
  const setAssignee = Object.prototype.hasOwnProperty.call(patch, "assignedSupportUserId");
  const setSupportRequested = Object.prototype.hasOwnProperty.call(patch, "supportRequested");
  const setOnboardingStatus = Object.prototype.hasOwnProperty.call(patch, "onboardingStatus");
  const setCompletedAt = Object.prototype.hasOwnProperty.call(patch, "onboardingCompletedAt");
  const clearCompletedAt = Boolean(patch.clearOnboardingCompletedAt);
  const setStartedAt = Object.prototype.hasOwnProperty.call(patch, "onboardingStartedAt");
  const setPreviewAcknowledged = Object.prototype.hasOwnProperty.call(patch, "previewAcknowledged");
  const r = await client.query(
    `UPDATE blessboard.organization_onboarding
        SET follow_up_status = COALESCE($2, follow_up_status),
            assigned_support_user_id = CASE
              WHEN $3::boolean THEN NULL
              WHEN $4::boolean THEN $5::uuid
              ELSE assigned_support_user_id
            END,
            first_contacted_at = COALESCE($6, first_contacted_at),
            last_contacted_at = COALESCE($7, last_contacted_at),
            next_follow_up_at = CASE
              WHEN $8::boolean THEN $9::timestamptz
              ELSE next_follow_up_at
            END,
            last_activity_at = COALESCE($10, last_activity_at, now()),
            support_requested = CASE
              WHEN $11::boolean THEN $12::boolean
              ELSE support_requested
            END,
            onboarding_status = CASE
              WHEN $13::boolean THEN $14::text
              ELSE onboarding_status
            END,
            onboarding_started_at = CASE
              WHEN $15::boolean THEN COALESCE(onboarding_started_at, $16::timestamptz)
              ELSE onboarding_started_at
            END,
            onboarding_completed_at = CASE
              WHEN $17::boolean THEN NULL
              WHEN $18::boolean THEN $19::timestamptz
              ELSE onboarding_completed_at
            END,
            preview_acknowledged = CASE
              WHEN $20::boolean THEN $21::boolean
              ELSE preview_acknowledged
            END,
            updated_at = now()
      WHERE organization_id = $1
      RETURNING *`,
    [
      id,
      patch.followUpStatus != null ? patch.followUpStatus : null,
      clearAssignee,
      setAssignee && !clearAssignee,
      setAssignee && !clearAssignee ? patch.assignedSupportUserId : null,
      patch.firstContactedAt != null ? patch.firstContactedAt : null,
      patch.lastContactedAt != null ? patch.lastContactedAt : null,
      Object.prototype.hasOwnProperty.call(patch, "nextFollowUpAt"),
      Object.prototype.hasOwnProperty.call(patch, "nextFollowUpAt") ? patch.nextFollowUpAt : null,
      patch.lastActivityAt != null ? patch.lastActivityAt : null,
      setSupportRequested,
      setSupportRequested ? Boolean(patch.supportRequested) : false,
      setOnboardingStatus,
      setOnboardingStatus ? patch.onboardingStatus : null,
      setStartedAt,
      setStartedAt ? patch.onboardingStartedAt : null,
      clearCompletedAt,
      setCompletedAt && !clearCompletedAt,
      setCompletedAt && !clearCompletedAt ? patch.onboardingCompletedAt : null,
      setPreviewAcknowledged,
      setPreviewAcknowledged ? Boolean(patch.previewAcknowledged) : false,
    ]
  );
  return r.rows[0] || null;
}

/**
 * Ensure onboarding row exists for a provisioned organization (idempotent).
 * @param {{ query: Function }} client
 * @param {{ organizationId: string, applicationId?: string|null }} fields
 */
async function ensureOrganizationOnboardingRow(client, fields) {
  const organizationId = String(fields.organizationId || "").trim();
  if (!UUID_RE.test(organizationId)) {
    throw new Error("invalid_organization_id");
  }
  const applicationId =
    fields.applicationId && UUID_RE.test(String(fields.applicationId))
      ? String(fields.applicationId)
      : null;
  await client.query(
    `INSERT INTO blessboard.organization_onboarding (
       organization_id, registration_application_id, onboarding_status, follow_up_status,
       preview_acknowledged, onboarding_dismissed, support_requested
     ) VALUES ($1, $2, 'not_started', 'new', false, false, false)
     ON CONFLICT (organization_id) DO NOTHING`,
    [organizationId, applicationId]
  );
  const r = await client.query(
    `SELECT * FROM blessboard.organization_onboarding WHERE organization_id = $1`,
    [organizationId]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   organizationId: string,
 *   registrationApplicationId?: string|null,
 *   createdByUserId: string,
 *   contactMethod: string,
 *   outcome: string,
 *   note: string,
 *   contactedAt?: Date|string|null,
 *   nextFollowUpAt?: Date|string|null,
 * }} fields
 */
async function createOrganizationSupportContact(client, fields) {
  const organizationId =
    fields.organizationId != null && String(fields.organizationId).trim() !== ""
      ? String(fields.organizationId).trim()
      : null;
  const registrationApplicationId =
    fields.registrationApplicationId != null &&
    String(fields.registrationApplicationId).trim() !== ""
      ? String(fields.registrationApplicationId).trim()
      : null;
  if (!organizationId && !registrationApplicationId) {
    throw new Error("support_contact_scope_required");
  }
  if (organizationId && !UUID_RE.test(organizationId)) {
    throw new Error("invalid_organization_id");
  }
  if (registrationApplicationId && !UUID_RE.test(registrationApplicationId)) {
    throw new Error("invalid_application_id");
  }
  const r = await client.query(
    `INSERT INTO blessboard.organization_support_contacts (
       organization_id, registration_application_id, created_by_user_id,
       contact_method, outcome, note, contacted_at, next_follow_up_at
     ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()), $8)
     RETURNING id, organization_id, registration_application_id, created_by_user_id,
               contact_method, outcome, note, contacted_at, next_follow_up_at, created_at`,
    [
      organizationId,
      registrationApplicationId,
      fields.createdByUserId,
      fields.contactMethod,
      fields.outcome,
      fields.note,
      fields.contactedAt || null,
      fields.nextFollowUpAt || null,
    ]
  );
  return r.rows[0];
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationId
 * @param {{ limit?: number }} [opts]
 */
async function listOrganizationSupportContacts(client, organizationId, opts = {}) {
  const id = String(organizationId || "").trim();
  if (!UUID_RE.test(id)) return [];
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 100);
  const r = await client.query(
    `SELECT c.id, c.organization_id, c.registration_application_id, c.created_by_user_id,
            c.contact_method, c.outcome, c.note, c.contacted_at, c.next_follow_up_at, c.created_at,
            u.display_name AS created_by_display_name, u.email_normalized AS created_by_email
       FROM blessboard.organization_support_contacts c
       LEFT JOIN blessboard.users u ON u.id = c.created_by_user_id
      WHERE c.organization_id = $1
      ORDER BY c.contacted_at DESC, c.created_at DESC, c.id DESC
      LIMIT $2`,
    [id, limit]
  );
  return r.rows;
}

/**
 * Application-scoped contact history (Network / unprovisioned enquiries).
 * @param {{ query: Function }} client
 * @param {string} applicationId
 * @param {{ limit?: number }} [opts]
 */
async function listApplicationSupportContacts(client, applicationId, opts = {}) {
  const id = String(applicationId || "").trim();
  if (!UUID_RE.test(id)) return [];
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 100);
  const r = await client.query(
    `SELECT c.id, c.organization_id, c.registration_application_id, c.created_by_user_id,
            c.contact_method, c.outcome, c.note, c.contacted_at, c.next_follow_up_at, c.created_at,
            u.display_name AS created_by_display_name, u.email_normalized AS created_by_email
       FROM blessboard.organization_support_contacts c
       LEFT JOIN blessboard.users u ON u.id = c.created_by_user_id
      WHERE c.registration_application_id = $1
      ORDER BY c.contacted_at DESC, c.created_at DESC, c.id DESC
      LIMIT $2`,
    [id, limit]
  );
  return r.rows;
}

/**
 * Soft-link an unprovisioned application to an existing organization (no provision / no paid activation).
 * @param {{ query: Function }} client
 * @param {string} applicationId
 * @param {string} organizationId
 */
async function linkApplicationToOrganization(client, applicationId, organizationId) {
  const appId = String(applicationId || "").trim();
  const orgId = String(organizationId || "").trim();
  if (!UUID_RE.test(appId) || !UUID_RE.test(orgId)) {
    throw new Error("invalid_link_ids");
  }
  const r = await client.query(
    `UPDATE ${TARGET_RELATION}
        SET organization_id = $2,
            application_status = 'closed',
            updated_at = now()
      WHERE id = $1
        AND organization_id IS NULL
        AND provisioning_status <> 'provisioned'
      RETURNING ${SELECT_COLUMNS}`,
    [appId, orgId]
  );
  return r.rows[0] || null;
}

/**
 * Active V5 platform administrators for support assignment.
 * @param {{ query: Function }} client
 */
async function listActivePlatformAdministrators(client) {
  const r = await client.query(
    `SELECT DISTINCT u.id, u.display_name, u.email_normalized
       FROM blessboard.users u
       INNER JOIN blessboard.user_roles ur ON ur.user_id = u.id
      WHERE ur.role_key = 'platform_admin'
        AND ur.status = 'active'
        AND u.status = 'active'
      ORDER BY u.display_name ASC, u.email_normalized ASC`
  );
  return r.rows;
}

/**
 * Publication summary for a church linked to an organization.
 * @param {{ query: Function }} client
 * @param {string} organizationId
 */
async function getOrganizationPublicationSummary(client, organizationId) {
  const id = String(organizationId || "").trim();
  if (!UUID_RE.test(id)) {
    return { draftPages: 0, publishedPages: 0 };
  }
  const r = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE pp.status = 'draft')::int AS draft_pages,
       COUNT(*) FILTER (WHERE pp.status = 'published')::int AS published_pages
       FROM blessboard.public_pages pp
       INNER JOIN blessboard.churches c ON c.id = pp.church_id
      WHERE c.organization_id = $1`,
    [id]
  );
  return {
    draftPages: r.rows[0]?.draft_pages || 0,
    publishedPages: r.rows[0]?.published_pages || 0,
  };
}

/**
 * Current plan key for an organization (if any).
 * @param {{ query: Function }} client
 * @param {string} organizationId
 */
async function getOrganizationCurrentPlanKey(client, organizationId) {
  const summary = await getOrganizationCurrentSubscriptionSummary(client, organizationId);
  return summary ? summary.planKey : null;
}

/**
 * Current subscription summary for admin registration/organization detail.
 * @param {{ query: Function }} client
 * @param {string} organizationId
 * @returns {Promise<{
 *   planKey: string,
 *   subscriptionStatus: string,
 *   startsAt: Date | string | null,
 *   endsAt: Date | string | null
 * } | null>}
 */
async function getOrganizationCurrentSubscriptionSummary(client, organizationId) {
  const id = String(organizationId || "").trim();
  if (!UUID_RE.test(id)) return null;
  const r = await client.query(
    `SELECT p.plan_key, os.status, os.starts_at, os.ends_at
       FROM platform.organization_subscriptions os
       INNER JOIN platform.plans p ON p.id = os.plan_id
      WHERE os.organization_id = $1
        AND os.status IN ('active', 'trialing', 'past_due')
      ORDER BY os.created_at DESC
      LIMIT 1`,
    [id]
  );
  if (!r.rows[0]) return null;
  return {
    planKey: String(r.rows[0].plan_key),
    subscriptionStatus: String(r.rows[0].status),
    startsAt: r.rows[0].starts_at || null,
    endsAt: r.rows[0].ends_at || null,
  };
}

/**
 * Find application id linked to an organization (via onboarding or application.organization_id).
 * @param {{ query: Function }} client
 * @param {string} organizationId
 */
async function findApplicationIdForOrganization(client, organizationId) {
  const id = String(organizationId || "").trim();
  if (!UUID_RE.test(id)) return null;
  const r = await client.query(
    `SELECT COALESCE(
         (SELECT registration_application_id FROM blessboard.organization_onboarding WHERE organization_id = $1),
         (SELECT id FROM ${TARGET_RELATION} WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1)
       ) AS application_id`,
    [id]
  );
  const appId = r.rows[0] && r.rows[0].application_id;
  return appId ? String(appId) : null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationKey
 */
async function findApplicationIdForOrganizationKey(client, organizationKey) {
  const key = String(organizationKey || "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  const r = await client.query(
    `SELECT COALESCE(
         oo.registration_application_id,
         (
           SELECT a.id
             FROM ${TARGET_RELATION} a
            WHERE a.organization_id = o.id
            ORDER BY a.created_at DESC
            LIMIT 1
         )
       ) AS application_id
       FROM platform.organizations o
       LEFT JOIN blessboard.organization_onboarding oo ON oo.organization_id = o.id
      WHERE o.organization_key = $1
      LIMIT 1`,
    [key]
  );
  const appId = r.rows[0] && r.rows[0].application_id;
  return appId ? String(appId) : null;
}

/**
 * Resolve organization id from immutable organization_key (never trust client UUIDs alone).
 * @param {{ query: Function }} client
 * @param {string} organizationKey
 */
async function findOrganizationIdByKey(client, organizationKey) {
  const key = String(organizationKey || "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  const r = await client.query(
    `SELECT id FROM platform.organizations WHERE organization_key = $1 LIMIT 1`,
    [key]
  );
  return r.rows[0] ? String(r.rows[0].id) : null;
}

/**
 * Single-query onboarding facts for checklist + summary (avoids N+1).
 * @param {{ query: Function }} client
 * @param {{ organizationId?: string|null, organizationKey?: string|null }} input
 */
async function loadOrganizationOnboardingFacts(client, input = {}) {
  const organizationId =
    input.organizationId && UUID_RE.test(String(input.organizationId))
      ? String(input.organizationId)
      : null;
  const organizationKey = input.organizationKey
    ? String(input.organizationKey).trim().toLowerCase()
    : null;
  if (!organizationId && !organizationKey) return null;

  const r = await client.query(
    `SELECT
        o.id AS organization_id,
        o.organization_key,
        o.display_name AS org_display_name,
        o.status AS organization_status,
        c.id AS church_id,
        c.display_name AS church_display_name,
        c.legal_name AS church_legal_name,
        c.status AS church_status,
        oo.organization_id IS NOT NULL AS onboarding_row_present,
        oo.onboarding_status,
        oo.follow_up_status,
        oo.assigned_support_user_id,
        oo.first_contacted_at,
        oo.last_contacted_at,
        oo.next_follow_up_at,
        oo.onboarding_started_at,
        oo.onboarding_completed_at,
        oo.last_activity_at,
        oo.preview_acknowledged,
        oo.support_requested,
        oo.registration_application_id,
        su.display_name AS support_display_name,
        su.email_normalized AS support_email,
        cs.primary_email,
        cs.primary_phone,
        COALESCE(bc.active_branch_count, 0)::int AS active_branch_count,
        COALESCE(bc.has_branch_contact, false) AS has_branch_contact,
        COALESCE(pub.draft_pages, 0)::int AS draft_pages,
        COALESCE(pub.published_pages, 0)::int AS published_pages,
        COALESCE(svc.has_service_times, false) AS has_service_times,
        false AS has_logo,
        login_stats.church_admin_last_login_at,
        plan_row.plan_key,
        COALESCE(
          oo.registration_application_id,
          (
            SELECT a.id
              FROM ${TARGET_RELATION} a
             WHERE a.organization_id = o.id
             ORDER BY a.created_at DESC
             LIMIT 1
          )
        ) AS linked_application_id
       FROM platform.organizations o
       LEFT JOIN blessboard.churches c ON c.organization_id = o.id
       LEFT JOIN blessboard.organization_onboarding oo ON oo.organization_id = o.id
       LEFT JOIN blessboard.users su ON su.id = oo.assigned_support_user_id
       LEFT JOIN blessboard.church_settings cs ON cs.church_id = c.id
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (WHERE b.status = 'active')::int AS active_branch_count,
           EXISTS (
             SELECT 1
               FROM blessboard.branch_settings bs
               INNER JOIN blessboard.branches b2 ON b2.id = bs.branch_id
              WHERE b2.church_id = c.id
                AND (
                  NULLIF(TRIM(COALESCE(bs.email, '')), '') IS NOT NULL
                  OR NULLIF(TRIM(COALESCE(bs.phone, '')), '') IS NOT NULL
                  OR NULLIF(TRIM(COALESCE(bs.address_line_1, '')), '') IS NOT NULL
                )
           ) AS has_branch_contact
           FROM blessboard.branches b
          WHERE b.church_id = c.id
       ) bc ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (WHERE pp.status = 'draft')::int AS draft_pages,
           COUNT(*) FILTER (WHERE pp.status = 'published')::int AS published_pages
           FROM blessboard.public_pages pp
          WHERE pp.church_id = c.id
       ) pub ON TRUE
       LEFT JOIN LATERAL (
         SELECT EXISTS (
           SELECT 1
             FROM blessboard.page_sections ps
             INNER JOIN blessboard.public_pages pp2 ON pp2.id = ps.page_id
            WHERE pp2.church_id = c.id
              AND (
                ps.section_key IN ('service_times', 'services', 'worship_times')
                OR ps.section_type IN ('service_times', 'services', 'worship_times')
              )
              AND (
                NULLIF(TRIM(COALESCE(ps.body_text, '')), '') IS NOT NULL
                OR NULLIF(TRIM(COALESCE(ps.heading, '')), '') IS NOT NULL
              )
         ) AS has_service_times
       ) svc ON TRUE
       LEFT JOIN LATERAL (
         SELECT MAX(u.last_login_at) AS church_admin_last_login_at
           FROM blessboard.user_roles ur
           INNER JOIN blessboard.users u ON u.id = ur.user_id
          WHERE ur.organization_id = o.id
            AND ur.status = 'active'
            AND ur.role_key IN ('church_hq_admin', 'branch_admin')
            AND u.status = 'active'
       ) login_stats ON TRUE
       LEFT JOIN LATERAL (
         SELECT p.plan_key
           FROM platform.organization_subscriptions os
           INNER JOIN platform.plans p ON p.id = os.plan_id
          WHERE os.organization_id = o.id
            AND os.status IN ('active', 'trialing')
          ORDER BY os.created_at DESC
          LIMIT 1
       ) plan_row ON TRUE
      WHERE ($1::uuid IS NOT NULL AND o.id = $1)
         OR ($1::uuid IS NULL AND o.organization_key = $2)
      LIMIT 1`,
    [organizationId, organizationKey]
  );
  const row = r.rows[0];
  if (!row) return null;

  return {
    organizationId: String(row.organization_id),
    organizationKey: String(row.organization_key || ""),
    orgDisplayName: row.org_display_name != null ? String(row.org_display_name) : "",
    organizationStatus: row.organization_status != null ? String(row.organization_status) : null,
    churchId: row.church_id ? String(row.church_id) : null,
    churchDisplayName: row.church_display_name != null ? String(row.church_display_name) : "",
    churchLegalName: row.church_legal_name != null ? String(row.church_legal_name) : null,
    churchStatus: row.church_status != null ? String(row.church_status) : null,
    onboardingRowPresent: Boolean(row.onboarding_row_present),
    onboardingStatus: row.onboarding_status != null ? String(row.onboarding_status) : null,
    followUpStatus: row.follow_up_status != null ? String(row.follow_up_status) : null,
    assignedSupportUserId: row.assigned_support_user_id
      ? String(row.assigned_support_user_id)
      : null,
    supportDisplayName: row.support_display_name != null ? String(row.support_display_name) : null,
    supportEmail: row.support_email != null ? String(row.support_email) : null,
    firstContactedAt: row.first_contacted_at || null,
    lastContactedAt: row.last_contacted_at || null,
    nextFollowUpAt: row.next_follow_up_at || null,
    onboardingStartedAt: row.onboarding_started_at || null,
    onboardingCompletedAt: row.onboarding_completed_at || null,
    lastActivityAt: row.last_activity_at || null,
    previewAcknowledged: Boolean(row.preview_acknowledged),
    supportRequested: Boolean(row.support_requested),
    registrationApplicationId: row.linked_application_id
      ? String(row.linked_application_id)
      : row.registration_application_id
        ? String(row.registration_application_id)
        : null,
    primaryEmail: row.primary_email != null ? String(row.primary_email) : null,
    primaryPhone: row.primary_phone != null ? String(row.primary_phone) : null,
    activeBranchCount: Number(row.active_branch_count) || 0,
    hasBranchContact: Boolean(row.has_branch_contact),
    draftPages: Number(row.draft_pages) || 0,
    publishedPages: Number(row.published_pages) || 0,
    hasServiceTimesContent: Boolean(row.has_service_times),
    hasLogo: Boolean(row.has_logo),
    churchAdminLastLoginAt: row.church_admin_last_login_at || null,
    planKey: row.plan_key != null ? String(row.plan_key) : null,
  };
}

module.exports = {
  TARGET_SCHEMA,
  TARGET_TABLE,
  TARGET_RELATION,
  FORBIDDEN_RELATION_FRAGMENTS,
  SELECT_COLUMNS,
  APPLICATION_STATUSES,
  PROVISIONING_STATUSES,
  FOLLOW_UP_STATUSES,
  WORKFLOW_STATUSES,
  CONTACT_METHODS,
  CONTACT_OUTCOMES,
  LINKED_FILTERS,
  SORT_OPTIONS,
  DuplicateRegistrationPhoneError,
  isUniquePhoneViolation,
  normalizeFollowUpStatusInput,
  createApplication,
  createApplicationIdempotent,
  findRecentPendingDuplicate,
  findRecentRegistrationDuplicate,
  findRecentPhoneIdempotentDuplicate,
  findActiveRegistrationByPhone,
  listApplications,
  countPending,
  countOrganizationsCreatedSince,
  registrationTableExists,
  lockApplicationById,
  findApplicationById,
  updateApplicationProvisioningState,
  updateApplicationSupportFollowUp,
  updateApplicationRiskReviewState,
  listRegistrationApplications,
  countRegistrationApplications,
  getRegistrationApplicationById,
  updateOrganizationOnboarding,
  ensureOrganizationOnboardingRow,
  createOrganizationSupportContact,
  listOrganizationSupportContacts,
  listApplicationSupportContacts,
  linkApplicationToOrganization,
  listActivePlatformAdministrators,
  getOrganizationPublicationSummary,
  getOrganizationCurrentPlanKey,
  getOrganizationCurrentSubscriptionSummary,
  findApplicationIdForOrganization,
  findApplicationIdForOrganizationKey,
  findOrganizationIdByKey,
  loadOrganizationOnboardingFacts,
  escapeLikePattern,
};
