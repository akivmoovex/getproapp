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

/**
 * Full admin/detail column list (includes Phase2 rejection metadata from migration 039).
 * Do not use for public registration INSERT RETURNING / idempotency SELECTs — those
 * must not depend on admin-only columns.
 */
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
  risk_decision, risk_reason_codes, risk_decided_at, rejection_reason, review_events,
  rejection_category, reapplication_allowed, rejection_notification_status
`;

/**
 * Columns required for public registration write path (INSERT + idempotency SELECT/RETURNING).
 * Excludes admin-only rejection metadata (rejection_category, reapplication_allowed,
 * rejection_notification_status) — those are set later by admin rejection workflows.
 */
const PUBLIC_WRITE_SELECT_COLUMNS = `
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

/** Admin-only columns never written by public registration INSERT. */
const PUBLIC_REGISTRATION_ADMIN_ONLY_COLUMNS = Object.freeze([
  "rejection_category",
  "reapplication_allowed",
  "rejection_notification_status",
]);

const PUBLIC_REGISTRATION_REQUIRED_COLUMNS = Object.freeze(
  PUBLIC_WRITE_SELECT_COLUMNS.split(",")
    .map((c) => c.trim())
    .filter(Boolean)
);

/** @type {{ ok: boolean, missingColumns: string[] } | null} */
let publicRegistrationSchemaCache = null;

class PublicRegistrationSchemaMismatchError extends Error {
  /**
   * @param {string[]} missingColumns
   */
  constructor(missingColumns) {
    super("public_registration_schema_mismatch");
    this.name = "PublicRegistrationSchemaMismatchError";
    this.code = "schema_mismatch";
    this.missingColumns = Array.isArray(missingColumns) ? missingColumns.slice() : [];
    this.httpStatus = 503;
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const {
  phoneUniquenessSqlPredicate,
  DUPLICATE_PHONE_MESSAGE,
  normalizeRegistrationPhone,
} = require("../services/normalizeRegistrationPhone");

const PHONE_VERIFICATION_OUTCOMES = Object.freeze([
  "answered",
  "no_answer",
  "unavailable",
  "wrong_number",
  "callback_requested",
  "information_inconsistent",
]);
const PHONE_VERIFICATION_CHECK_STATUSES = Object.freeze([
  "not_checked",
  "confirmed",
  "not_confirmed",
]);
const PHONE_VERIFICATION_RESULTS = Object.freeze(["pending", "verified", "failed"]);

const PHONE_VERIFY_ATTEMPT_SELECT = `
  id, application_id, phone_number_called, phone_number_normalized,
  contact_person_name, contact_person_role, attempted_at, outcome,
  applicant_identity_status, applicant_authority_status, verification_result,
  verification_reason, notes, follow_up_at, created_by_user_id, created_at
`;

const EMAIL_VERIFY_TOKEN_STATUSES = Object.freeze([
  "sent",
  "verified",
  "expired",
  "replaced",
]);

const EMAIL_VERIFY_TOKEN_SELECT = `
  id, application_id, email, email_normalized, token_hash, status,
  sent_at, expires_at, verified_at, invalidated_at, invalidation_reason,
  created_by_user_id, created_at
`;

const DUPLICATE_MATCH_RECORD_TYPES = Object.freeze([
  "application",
  "organization",
  "user",
  "church",
  "branch",
  "domain",
]);

const DUPLICATE_MATCH_RISK_LEVELS = Object.freeze([
  "none",
  "possible",
  "strong",
  "confirmed",
]);

const DUPLICATE_MATCH_REVIEW_DECISIONS = Object.freeze([
  "different_church",
  "link_existing_church",
  "additional_branch_request",
  "clarification_required",
  "senior_review",
  "impersonation_concern",
  "confirmed_duplicate",
]);

const DUPLICATE_MATCH_SELECT = `
  id, application_id, matched_record_type, matched_record_id,
  score, risk_level, evidence_snapshot,
  review_decision, review_reason, reviewed_by_user_id, reviewed_at,
  created_at, updated_at
`;

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
 * Read-only readiness check for public registration writes.
 * Does not run DDL. Lists exact missing columns for internal logging only.
 * @param {{ query: Function }} client
 * @returns {Promise<{ ok: boolean, missingColumns: string[] }>}
 */
async function checkPublicRegistrationSchemaReady(client) {
  if (publicRegistrationSchemaCache && publicRegistrationSchemaCache.ok) {
    return publicRegistrationSchemaCache;
  }
  if (!client || typeof client.query !== "function") {
    return { ok: false, missingColumns: PUBLIC_REGISTRATION_REQUIRED_COLUMNS.slice() };
  }
  const r = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
        AND column_name = ANY($3::text[])`,
    [TARGET_SCHEMA, TARGET_TABLE, PUBLIC_REGISTRATION_REQUIRED_COLUMNS.slice()]
  );
  const present = new Set((r.rows || []).map((row) => String(row.column_name)));
  const missingColumns = PUBLIC_REGISTRATION_REQUIRED_COLUMNS.filter((c) => !present.has(c));
  const result = { ok: missingColumns.length === 0, missingColumns };
  if (result.ok) {
    publicRegistrationSchemaCache = result;
  }
  return result;
}

/**
 * @param {{ query: Function }} client
 * @throws {PublicRegistrationSchemaMismatchError}
 */
async function assertPublicRegistrationSchemaReady(client) {
  const check = await checkPublicRegistrationSchemaReady(client);
  if (!check.ok) {
    throw new PublicRegistrationSchemaMismatchError(check.missingColumns);
  }
  return check;
}

/** Test helper — clears process-level schema readiness cache. */
function resetPublicRegistrationSchemaCacheForTests() {
  publicRegistrationSchemaCache = null;
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
     RETURNING ${PUBLIC_WRITE_SELECT_COLUMNS}`,
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
  await assertPublicRegistrationSchemaReady(pool);
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
    `SELECT ${PUBLIC_WRITE_SELECT_COLUMNS}
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
    `SELECT ${PUBLIC_WRITE_SELECT_COLUMNS}
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
    `SELECT ${PUBLIC_WRITE_SELECT_COLUMNS}
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
    await assertPublicRegistrationSchemaReady(client);

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
  if (s === "needs_information") return "needs_information";
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

/** Prompt 062 — registration application communications allowlists. */
const COMMUNICATION_TYPES = Object.freeze([
  "internal_note",
  "information_request",
  "applicant_message",
  "rejection_notice",
  "applicant_response",
  "system_event",
]);
const COMMUNICATION_CHANNELS = Object.freeze(["internal", "email", "phone", "other"]);
const COMMUNICATION_DIRECTIONS = Object.freeze(["internal", "outbound", "inbound"]);
const COMMUNICATION_DELIVERY_STATUSES = Object.freeze([
  "not_applicable",
  "recorded",
  "sending_unavailable",
  "queued",
  "sent",
  "failed",
]);
const REJECTION_NOTIFICATION_STATUSES = Object.freeze([
  "recorded",
  "sending_unavailable",
  "queued",
  "sent",
  "failed",
]);

const REG_APP_COMM_SELECT = `
  id, application_id, communication_type, channel, direction, recipient, subject,
  applicant_message, internal_note, request_category, requested_fields, requested_documents,
  response_due_at, delivery_status, delivery_error_code, created_by_user_id, created_at
`;

const REJECTION_METADATA_SELECT = `
  id, application_status, rejection_reason, rejection_category,
  reapplication_allowed, rejection_notification_status, updated_at
`;

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
    } else if (follow === "needs_information") {
      clauses.push(
        `${EFFECTIVE_FOLLOW_UP_SQL} IN ('awaiting_customer', 'needs_help', 'self_onboarding')`
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
  if (filters.queue === "needs_review") {
    clauses.push(`(
      a.organization_id IS NULL
      AND a.provisioning_status IS DISTINCT FROM 'provisioned'
      AND a.provisioning_status IS DISTINCT FROM 'provisioning_failed'
      AND a.application_status IN ('submitted', 'duplicate_review')
      AND COALESCE(a.selected_plan, '') IS DISTINCT FROM 'network'
      AND ${EFFECTIVE_SUPPORT_REQUESTED_SQL} = FALSE
    )`);
  } else if (filters.queue === "provisioning_failed") {
    clauses.push(`a.provisioning_status = 'provisioning_failed'`);
  } else if (filters.queue === "network_validation") {
    clauses.push(`(
      a.organization_id IS NULL
      AND a.provisioning_status IS DISTINCT FROM 'provisioned'
      AND a.application_status NOT IN ('rejected', 'cancelled')
      AND (
        a.selected_plan = 'network'
        OR ${EFFECTIVE_SUPPORT_REQUESTED_SQL} = TRUE
      )
      AND ${EFFECTIVE_FOLLOW_UP_SQL} IS DISTINCT FROM 'approved_for_provision'
      AND ${EFFECTIVE_FOLLOW_UP_SQL} IS DISTINCT FROM 'qualified'
    )`);
  } else if (filters.queue === "network_ready") {
    clauses.push(`(
      a.organization_id IS NULL
      AND a.provisioning_status IS DISTINCT FROM 'provisioned'
      AND a.application_status NOT IN ('rejected', 'cancelled')
      AND (
        a.selected_plan = 'network'
        OR ${EFFECTIVE_SUPPORT_REQUESTED_SQL} = TRUE
      )
      AND ${EFFECTIVE_FOLLOW_UP_SQL} IN ('approved_for_provision', 'qualified')
    )`);
  } else if (filters.queue === "provisioned") {
    clauses.push(`(
      a.provisioning_status = 'provisioned'
      OR (a.application_status = 'closed' AND a.organization_id IS NOT NULL)
    )`);
  } else if (filters.queue === "rejected") {
    clauses.push(`a.application_status IN ('rejected', 'cancelled')`);
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
 * Insert one append-only phone verification attempt.
 * Does not mutate the application, support contacts, or audit events.
 * @param {{ query: Function }} client
 * @param {{
 *   applicationId: string,
 *   phoneNumberCalled: string,
 *   country?: string|null,
 *   contactPersonName?: string|null,
 *   contactPersonRole?: string|null,
 *   attemptedAt: Date|string,
 *   outcome: string,
 *   applicantIdentityStatus?: string,
 *   applicantAuthorityStatus?: string,
 *   verificationResult?: string,
 *   verificationReason?: string|null,
 *   notes?: string|null,
 *   followUpAt?: Date|string|null,
 *   createdByUserId: string,
 * }} fields
 */
async function createPhoneVerificationAttempt(client, fields) {
  const applicationId = String(fields.applicationId || "").trim();
  if (!applicationId) throw new Error("application_id_required");
  if (!UUID_RE.test(applicationId)) throw new Error("invalid_application_id");

  const createdByUserId = String(fields.createdByUserId || "").trim();
  if (!createdByUserId) throw new Error("created_by_user_id_required");
  if (!UUID_RE.test(createdByUserId)) throw new Error("invalid_created_by_user_id");

  const phoneNumberCalled = String(fields.phoneNumberCalled || "").trim();
  if (!phoneNumberCalled) throw new Error("phone_number_called_required");

  const normalized = normalizeRegistrationPhone(
    phoneNumberCalled,
    fields.country != null ? fields.country : null
  );
  if (!normalized.ok) {
    const err = new Error(normalized.error || "phone_number_invalid");
    err.code = "invalid_phone_number";
    err.field = normalized.field || "phone";
    throw err;
  }

  if (fields.attemptedAt == null || String(fields.attemptedAt).trim() === "") {
    throw new Error("attempted_at_required");
  }

  const outcome = String(fields.outcome || "").trim().toLowerCase();
  if (!PHONE_VERIFICATION_OUTCOMES.includes(outcome)) {
    throw new Error("invalid_phone_verification_outcome");
  }

  const applicantIdentityStatus = String(
    fields.applicantIdentityStatus != null && String(fields.applicantIdentityStatus).trim() !== ""
      ? fields.applicantIdentityStatus
      : "not_checked"
  )
    .trim()
    .toLowerCase();
  if (!PHONE_VERIFICATION_CHECK_STATUSES.includes(applicantIdentityStatus)) {
    throw new Error("invalid_applicant_identity_status");
  }

  const applicantAuthorityStatus = String(
    fields.applicantAuthorityStatus != null &&
      String(fields.applicantAuthorityStatus).trim() !== ""
      ? fields.applicantAuthorityStatus
      : "not_checked"
  )
    .trim()
    .toLowerCase();
  if (!PHONE_VERIFICATION_CHECK_STATUSES.includes(applicantAuthorityStatus)) {
    throw new Error("invalid_applicant_authority_status");
  }

  const verificationResult = String(
    fields.verificationResult != null && String(fields.verificationResult).trim() !== ""
      ? fields.verificationResult
      : "pending"
  )
    .trim()
    .toLowerCase();
  if (!PHONE_VERIFICATION_RESULTS.includes(verificationResult)) {
    throw new Error("invalid_verification_result");
  }

  let verificationReason =
    fields.verificationReason != null ? String(fields.verificationReason).trim() : "";
  if (verificationReason === "") verificationReason = null;
  if (
    (verificationResult === "verified" || verificationResult === "failed") &&
    !verificationReason
  ) {
    throw new Error("verification_reason_required");
  }

  let notes = fields.notes != null ? String(fields.notes) : null;
  if (notes != null && notes.trim() === "") notes = null;

  let contactPersonName =
    fields.contactPersonName != null ? String(fields.contactPersonName).trim() : "";
  if (contactPersonName === "") contactPersonName = null;

  let contactPersonRole =
    fields.contactPersonRole != null ? String(fields.contactPersonRole).trim() : "";
  if (contactPersonRole === "") contactPersonRole = null;

  const r = await client.query(
    `INSERT INTO blessboard.registration_phone_verification_attempts (
       application_id, phone_number_called, phone_number_normalized,
       contact_person_name, contact_person_role, attempted_at, outcome,
       applicant_identity_status, applicant_authority_status, verification_result,
       verification_reason, notes, follow_up_at, created_by_user_id
     ) VALUES (
       $1, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9, $10, $11, $12, $13::timestamptz, $14
     )
     RETURNING ${PHONE_VERIFY_ATTEMPT_SELECT}`,
    [
      applicationId,
      phoneNumberCalled.slice(0, 64),
      normalized.normalized,
      contactPersonName,
      contactPersonRole,
      fields.attemptedAt,
      outcome,
      applicantIdentityStatus,
      applicantAuthorityStatus,
      verificationResult,
      verificationReason,
      notes,
      fields.followUpAt != null && String(fields.followUpAt).trim() !== ""
        ? fields.followUpAt
        : null,
      createdByUserId,
    ]
  );
  return r.rows[0];
}

/**
 * List phone verification attempts for an application (newest first).
 * @param {{ query: Function }} client
 * @param {string} applicationId
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<object[]>}
 */
async function listPhoneVerificationAttempts(client, applicationId, opts = {}) {
  const id = String(applicationId || "").trim();
  if (!id) throw new Error("application_id_required");
  if (!UUID_RE.test(id)) throw new Error("invalid_application_id");
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 100);
  const r = await client.query(
    `SELECT ${PHONE_VERIFY_ATTEMPT_SELECT}
       FROM blessboard.registration_phone_verification_attempts
      WHERE application_id = $1
      ORDER BY attempted_at DESC, created_at DESC, id DESC
      LIMIT $2`,
    [id, limit]
  );
  return r.rows;
}

/**
 * Insert a registration email-verification token (hash only; never plaintext).
 * @param {{ query: Function }} client
 * @param {{
 *   applicationId: string,
 *   email: string,
 *   emailNormalized: string,
 *   tokenHash: string,
 *   status?: string,
 *   sentAt: Date|string,
 *   expiresAt: Date|string,
 *   createdByUserId?: string|null,
 * }} fields
 */
async function createRegistrationEmailVerificationToken(client, fields) {
  const applicationId = String(fields.applicationId || "").trim();
  if (!applicationId) throw new Error("application_id_required");
  if (!UUID_RE.test(applicationId)) throw new Error("invalid_application_id");

  const email = String(fields.email || "").trim();
  if (!email) throw new Error("email_required");

  const emailNormalized = String(fields.emailNormalized || "").trim().toLowerCase();
  if (!emailNormalized) throw new Error("email_normalized_required");

  const tokenHash = String(fields.tokenHash || "").trim().toLowerCase();
  if (!tokenHash || tokenHash.length !== 64 || !/^[a-f0-9]{64}$/.test(tokenHash)) {
    throw new Error("token_hash_required");
  }

  const status = String(fields.status != null ? fields.status : "sent")
    .trim()
    .toLowerCase();
  if (!EMAIL_VERIFY_TOKEN_STATUSES.includes(status)) {
    throw new Error("invalid_email_verification_token_status");
  }
  if (status !== "sent") {
    throw new Error("create_requires_sent_status");
  }

  if (fields.sentAt == null || String(fields.sentAt).trim() === "") {
    throw new Error("sent_at_required");
  }
  if (fields.expiresAt == null || String(fields.expiresAt).trim() === "") {
    throw new Error("expires_at_required");
  }

  let createdByUserId =
    fields.createdByUserId != null ? String(fields.createdByUserId).trim() : "";
  if (createdByUserId === "") createdByUserId = null;
  if (createdByUserId && !UUID_RE.test(createdByUserId)) {
    throw new Error("invalid_created_by_user_id");
  }

  const r = await client.query(
    `INSERT INTO blessboard.registration_email_verification_tokens (
       application_id, email, email_normalized, token_hash, status,
       sent_at, expires_at, created_by_user_id
     ) VALUES (
       $1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8
     )
     RETURNING ${EMAIL_VERIFY_TOKEN_SELECT}`,
    [
      applicationId,
      email.slice(0, 254),
      emailNormalized.slice(0, 254),
      tokenHash,
      status,
      fields.sentAt,
      fields.expiresAt,
      createdByUserId,
    ]
  );
  return r.rows[0];
}

/**
 * Find a token by SHA-256 hex hash.
 * @param {{ query: Function }} client
 * @param {string} tokenHash
 * @param {{ forUpdate?: boolean }} [opts]
 */
async function findRegistrationEmailVerificationTokenByHash(client, tokenHash, opts = {}) {
  const hash = String(tokenHash || "").trim().toLowerCase();
  if (!hash || hash.length !== 64 || !/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error("token_hash_required");
  }
  const lock = opts.forUpdate ? " FOR UPDATE" : "";
  const r = await client.query(
    `SELECT ${EMAIL_VERIFY_TOKEN_SELECT}
       FROM blessboard.registration_email_verification_tokens
      WHERE token_hash = $1
      LIMIT 1${lock}`,
    [hash]
  );
  return r.rows[0] || null;
}

/**
 * Latest token for an application (newest created_at first).
 * @param {{ query: Function }} client
 * @param {string} applicationId
 * @param {{ forUpdate?: boolean }} [opts]
 */
async function findLatestRegistrationEmailVerificationToken(client, applicationId, opts = {}) {
  const id = String(applicationId || "").trim();
  if (!id) throw new Error("application_id_required");
  if (!UUID_RE.test(id)) throw new Error("invalid_application_id");
  const lock = opts.forUpdate ? " FOR UPDATE" : "";
  const r = await client.query(
    `SELECT ${EMAIL_VERIFY_TOKEN_SELECT}
       FROM blessboard.registration_email_verification_tokens
      WHERE application_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1${lock}`,
    [id]
  );
  return r.rows[0] || null;
}

/**
 * Invalidate all active `sent` tokens for an application (status → replaced).
 * @param {{ query: Function }} client
 * @param {string} applicationId
 * @param {{
 *   reason?: string,
 *   invalidatedAt?: Date|string,
 * }} [opts]
 */
async function invalidateActiveRegistrationEmailVerificationTokens(
  client,
  applicationId,
  opts = {}
) {
  const id = String(applicationId || "").trim();
  if (!id) throw new Error("application_id_required");
  if (!UUID_RE.test(id)) throw new Error("invalid_application_id");

  let reason =
    opts.reason != null && String(opts.reason).trim() !== ""
      ? String(opts.reason).trim().slice(0, 120)
      : "superseded";
  const invalidatedAt =
    opts.invalidatedAt != null && String(opts.invalidatedAt).trim() !== ""
      ? opts.invalidatedAt
      : new Date();

  const r = await client.query(
    `UPDATE blessboard.registration_email_verification_tokens
        SET status = 'replaced',
            invalidated_at = $2::timestamptz,
            invalidation_reason = $3
      WHERE application_id = $1
        AND status = 'sent'
      RETURNING ${EMAIL_VERIFY_TOKEN_SELECT}`,
    [id, invalidatedAt, reason]
  );
  return r.rows;
}

/**
 * Mark a sent, unexpired token verified exactly once (concurrent-safe).
 * @param {{ query: Function }} client
 * @param {string} tokenId
 * @param {{ verifiedAt?: Date|string }} [opts]
 */
async function markRegistrationEmailVerificationTokenVerified(client, tokenId, opts = {}) {
  const id = String(tokenId || "").trim();
  if (!id) throw new Error("token_id_required");
  if (!UUID_RE.test(id)) throw new Error("invalid_token_id");

  const verifiedAt =
    opts.verifiedAt != null && String(opts.verifiedAt).trim() !== ""
      ? opts.verifiedAt
      : new Date();

  const r = await client.query(
    `UPDATE blessboard.registration_email_verification_tokens
        SET status = 'verified',
            verified_at = $2::timestamptz
      WHERE id = $1
        AND status = 'sent'
        AND expires_at > $2::timestamptz
        AND verified_at IS NULL
        AND invalidated_at IS NULL
      RETURNING ${EMAIL_VERIFY_TOKEN_SELECT}`,
    [id, verifiedAt]
  );
  return r.rows[0] || null;
}

/**
 * @param {unknown} value
 * @returns {object}
 */
function normalizeEvidenceSnapshot(value) {
  if (value == null) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      return {};
    }
    return {};
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return {};
}

/**
 * @param {object} fields
 * @param {string} applicationId
 */
function validateDuplicateMatchInput(fields, applicationId) {
  const matchedRecordType = String(fields.matchedRecordType || fields.matched_record_type || "")
    .trim()
    .toLowerCase();
  if (!DUPLICATE_MATCH_RECORD_TYPES.includes(matchedRecordType)) {
    throw new Error("invalid_matched_record_type");
  }

  const matchedRecordId = String(fields.matchedRecordId || fields.matched_record_id || "").trim();
  if (!matchedRecordId || !UUID_RE.test(matchedRecordId)) {
    throw new Error("invalid_matched_record_id");
  }
  if (matchedRecordType === "application" && matchedRecordId === applicationId) {
    throw new Error("self_match_not_allowed");
  }

  const scoreRaw = fields.score != null ? fields.score : fields.totalWeight;
  const score = Number(scoreRaw);
  if (!Number.isFinite(score) || score < 0 || score > 10000 || Math.floor(score) !== score) {
    throw new Error("invalid_score");
  }

  const riskLevel = String(fields.riskLevel || fields.risk_level || "")
    .trim()
    .toLowerCase();
  if (!DUPLICATE_MATCH_RISK_LEVELS.includes(riskLevel)) {
    throw new Error("invalid_risk_level");
  }

  const evidenceSnapshot = normalizeEvidenceSnapshot(
    fields.evidenceSnapshot != null ? fields.evidenceSnapshot : fields.evidence_snapshot
  );

  return {
    matchedRecordType,
    matchedRecordId,
    score,
    riskLevel,
    evidenceSnapshot,
  };
}

/**
 * Replace/recompute duplicate matches for an application.
 * Upserts the provided set; deletes undecided rows not present in the new set.
 * Preserves review decisions; refreshes score / risk / evidence on upsert.
 *
 * @param {{ query: Function }} client
 * @param {string} applicationId
 * @param {object[]} matches
 * @returns {Promise<object[]>}
 */
async function replaceRegistrationDuplicateMatches(client, applicationId, matches) {
  const appId = String(applicationId || "").trim();
  if (!appId || !UUID_RE.test(appId)) throw new Error("invalid_application_id");

  const list = Array.isArray(matches) ? matches : [];
  const normalized = [];
  const seen = new Set();
  for (const raw of list) {
    const row = validateDuplicateMatchInput(raw && typeof raw === "object" ? raw : {}, appId);
    const key = `${row.matchedRecordType}:${row.matchedRecordId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(row);
  }

  if (normalized.length === 0) {
    await client.query(
      `DELETE FROM blessboard.registration_duplicate_matches
        WHERE application_id = $1::uuid
          AND review_decision IS NULL`,
      [appId]
    );
  } else {
    const types = normalized.map((m) => m.matchedRecordType);
    const ids = normalized.map((m) => m.matchedRecordId);
    await client.query(
      `DELETE FROM blessboard.registration_duplicate_matches d
        WHERE d.application_id = $1::uuid
          AND d.review_decision IS NULL
          AND NOT EXISTS (
            SELECT 1
              FROM unnest($2::text[], $3::uuid[]) AS keep(matched_record_type, matched_record_id)
             WHERE keep.matched_record_type = d.matched_record_type
               AND keep.matched_record_id = d.matched_record_id
          )`,
      [appId, types, ids]
    );
  }

  for (const m of normalized) {
    await client.query(
      `INSERT INTO blessboard.registration_duplicate_matches (
         application_id, matched_record_type, matched_record_id,
         score, risk_level, evidence_snapshot
       ) VALUES (
         $1::uuid, $2, $3::uuid, $4, $5, $6::jsonb
       )
       ON CONFLICT (application_id, matched_record_type, matched_record_id)
       DO UPDATE SET
         score = EXCLUDED.score,
         risk_level = EXCLUDED.risk_level,
         evidence_snapshot = EXCLUDED.evidence_snapshot,
         updated_at = now()`,
      [
        appId,
        m.matchedRecordType,
        m.matchedRecordId,
        m.score,
        m.riskLevel,
        JSON.stringify(m.evidenceSnapshot),
      ]
    );
  }

  return listRegistrationDuplicateMatches(client, appId);
}

/**
 * List duplicate matches for an application (highest score first).
 * @param {{ query: Function }} client
 * @param {string} applicationId
 * @param {{ pendingOnly?: boolean }} [opts]
 */
async function listRegistrationDuplicateMatches(client, applicationId, opts = {}) {
  const appId = String(applicationId || "").trim();
  if (!appId || !UUID_RE.test(appId)) throw new Error("invalid_application_id");

  const pendingOnly = opts.pendingOnly === true;
  const r = await client.query(
    `SELECT ${DUPLICATE_MATCH_SELECT}
       FROM blessboard.registration_duplicate_matches
      WHERE application_id = $1::uuid
        ${pendingOnly ? "AND review_decision IS NULL" : ""}
      ORDER BY score DESC, created_at DESC, id DESC`,
    [appId]
  );
  return r.rows;
}

/**
 * Load one duplicate match by id (optionally scoped to an application).
 * @param {{ query: Function }} client
 * @param {string} matchId
 * @param {{ applicationId?: string|null }} [opts]
 */
async function getRegistrationDuplicateMatchById(client, matchId, opts = {}) {
  const id = String(matchId || "").trim();
  if (!id || !UUID_RE.test(id)) throw new Error("invalid_match_id");

  const applicationId =
    opts.applicationId != null && String(opts.applicationId).trim() !== ""
      ? String(opts.applicationId).trim()
      : null;
  if (applicationId && !UUID_RE.test(applicationId)) {
    throw new Error("invalid_application_id");
  }

  const params = [id];
  let sql = `SELECT ${DUPLICATE_MATCH_SELECT}
               FROM blessboard.registration_duplicate_matches
              WHERE id = $1::uuid`;
  if (applicationId) {
    params.push(applicationId);
    sql += ` AND application_id = $2::uuid`;
  }
  sql += ` LIMIT 1`;
  const r = await client.query(sql, params);
  return r.rows[0] || null;
}

/**
 * Record a review decision on a stored match.
 * Does not merge, reject, or change approval gates.
 *
 * @param {{ query: Function }} client
 * @param {string} matchId
 * @param {{
 *   reviewDecision: string,
 *   reviewReason: string,
 *   reviewedByUserId: string,
 *   reviewedAt?: Date|string,
 *   applicationId?: string|null,
 * }} fields
 */
async function recordRegistrationDuplicateMatchDecision(client, matchId, fields = {}) {
  const id = String(matchId || "").trim();
  if (!id || !UUID_RE.test(id)) throw new Error("invalid_match_id");

  const reviewDecision = String(fields.reviewDecision || fields.review_decision || "")
    .trim()
    .toLowerCase();
  if (!DUPLICATE_MATCH_REVIEW_DECISIONS.includes(reviewDecision)) {
    throw new Error("invalid_review_decision");
  }

  const reviewReason = String(fields.reviewReason || fields.review_reason || "").trim();
  if (!reviewReason || reviewReason.length > 2000) {
    throw new Error("invalid_review_reason");
  }

  const reviewedByUserId = String(
    fields.reviewedByUserId || fields.reviewed_by_user_id || ""
  ).trim();
  if (!reviewedByUserId || !UUID_RE.test(reviewedByUserId)) {
    throw new Error("invalid_reviewed_by_user_id");
  }

  const reviewedAt =
    fields.reviewedAt != null && String(fields.reviewedAt).trim() !== ""
      ? fields.reviewedAt
      : new Date().toISOString();

  const applicationId =
    fields.applicationId != null && String(fields.applicationId).trim() !== ""
      ? String(fields.applicationId).trim()
      : null;
  if (applicationId && !UUID_RE.test(applicationId)) {
    throw new Error("invalid_application_id");
  }

  const params = [id, reviewDecision, reviewReason, reviewedByUserId, reviewedAt];
  let sql = `UPDATE blessboard.registration_duplicate_matches
                SET review_decision = $2,
                    review_reason = $3,
                    reviewed_by_user_id = $4::uuid,
                    reviewed_at = $5::timestamptz,
                    updated_at = now()
              WHERE id = $1::uuid`;
  if (applicationId) {
    params.push(applicationId);
    sql += ` AND application_id = $6::uuid`;
  }
  sql += ` RETURNING ${DUPLICATE_MATCH_SELECT}`;

  const r = await client.query(sql, params);
  return r.rows[0] || null;
}

const DUPLICATE_CANDIDATE_APP_SELECT = `
  id, church_name, city, country, contact_email, contact_phone, contact_phone_normalized,
  application_status, provisioning_status, branch_name, selected_plan, created_at
`;

/**
 * Batched pending/rejected application candidates for duplicate check (excludes subject).
 * @param {{ query: Function }} client
 * @param {{
 *   excludeApplicationId: string,
 *   phoneNormalized?: string|null,
 *   churchName?: string|null,
 *   city?: string|null,
 *   country?: string|null,
 *   emailNormalized?: string|null,
 *   limit?: number,
 * }} opts
 */
async function listDuplicateCandidateApplications(client, opts = {}) {
  const excludeId = String(opts.excludeApplicationId || "").trim();
  if (!excludeId || !UUID_RE.test(excludeId)) throw new Error("invalid_application_id");
  const limit = Math.min(Math.max(Number(opts.limit) || 40, 1), 100);

  const phone = opts.phoneNormalized != null ? String(opts.phoneNormalized).trim() : "";
  const churchName = opts.churchName != null ? String(opts.churchName).trim().toLowerCase() : "";
  const city = opts.city != null ? String(opts.city).trim().toLowerCase() : "";
  const country = opts.country != null ? String(opts.country).trim().toLowerCase() : "";
  const email = opts.emailNormalized != null ? String(opts.emailNormalized).trim().toLowerCase() : "";

  const occupancy = phoneUniquenessSqlPredicate("a");
  const r = await client.query(
    `SELECT ${DUPLICATE_CANDIDATE_APP_SELECT}
       FROM ${TARGET_RELATION} a
      WHERE a.id <> $1::uuid
        AND (
          ($2::text <> '' AND a.contact_phone_normalized = $2 AND ${occupancy})
          OR (
            $3::text <> '' AND $4::text <> '' AND $5::text <> ''
            AND lower(a.church_name) = $3
            AND lower(a.city) = $4
            AND lower(a.country) = $5
            AND ${occupancy}
          )
          OR ($6::text <> '' AND lower(a.contact_email) = $6 AND ${occupancy})
          OR (
            a.application_status = 'rejected'
            AND (
              ($2::text <> '' AND a.contact_phone_normalized = $2)
              OR ($6::text <> '' AND lower(a.contact_email) = $6)
            )
          )
        )
      ORDER BY a.created_at DESC, a.id ASC
      LIMIT $7`,
    [excludeId, phone, churchName, city, country, email, limit]
  );
  return r.rows;
}

/**
 * Organizations with optional church settings email (one query; production/pilot only).
 * @param {{ query: Function }} client
 * @param {{ displayNameNormalized?: string|null, limit?: number }} opts
 */
async function listDuplicateCandidateOrganizations(client, opts = {}) {
  const name = opts.displayNameNormalized != null ? String(opts.displayNameNormalized).trim() : "";
  if (!name) return [];
  const limit = Math.min(Math.max(Number(opts.limit) || 40, 1), 100);
  const r = await client.query(
    `SELECT o.id, o.organization_key, o.display_name, o.legal_name, o.status, o.data_environment,
            cs.primary_email, cs.primary_phone
       FROM platform.organizations o
       LEFT JOIN blessboard.churches c ON c.organization_id = o.id
       LEFT JOIN blessboard.church_settings cs ON cs.church_id = c.id
      WHERE o.status IN ('active', 'inactive')
        AND o.data_environment IN ('production', 'pilot')
        AND (
          lower(regexp_replace(btrim(o.display_name), '\\s+', ' ', 'g')) = $1
          OR (
            o.legal_name IS NOT NULL
            AND lower(regexp_replace(btrim(o.legal_name), '\\s+', ' ', 'g')) = $1
          )
        )
      ORDER BY o.created_at DESC, o.id ASC
      LIMIT $2`,
    [name, limit]
  );
  return r.rows;
}

/**
 * Churches in production/pilot orgs by display/legal name.
 * @param {{ query: Function }} client
 * @param {{ displayNameNormalized?: string|null, limit?: number }} opts
 */
async function listDuplicateCandidateChurches(client, opts = {}) {
  const name = opts.displayNameNormalized != null ? String(opts.displayNameNormalized).trim() : "";
  if (!name) return [];
  const limit = Math.min(Math.max(Number(opts.limit) || 40, 1), 100);
  const r = await client.query(
    `SELECT c.id, c.organization_id, c.church_key, c.display_name, c.legal_name, c.status,
            c.data_environment, cs.primary_email, cs.primary_phone
       FROM blessboard.churches c
       JOIN platform.organizations o ON o.id = c.organization_id
       LEFT JOIN blessboard.church_settings cs ON cs.church_id = c.id
      WHERE c.status IN ('active', 'inactive', 'suspended')
        AND c.data_environment IN ('production', 'pilot')
        AND o.data_environment IN ('production', 'pilot')
        AND (
          lower(regexp_replace(btrim(c.display_name), '\\s+', ' ', 'g')) = $1
          OR (
            c.legal_name IS NOT NULL
            AND lower(regexp_replace(btrim(c.legal_name), '\\s+', ' ', 'g')) = $1
          )
        )
      ORDER BY c.created_at DESC, c.id ASC
      LIMIT $2`,
    [name, limit]
  );
  return r.rows;
}

/**
 * Live branches by display_name_normalized (church-scoped uniqueness; listed as weak candidates).
 * @param {{ query: Function }} client
 * @param {{ displayNameNormalized?: string|null, limit?: number }} opts
 */
async function listDuplicateCandidateBranches(client, opts = {}) {
  const name = opts.displayNameNormalized != null ? String(opts.displayNameNormalized).trim() : "";
  if (!name) return [];
  const limit = Math.min(Math.max(Number(opts.limit) || 40, 1), 100);
  const r = await client.query(
    `SELECT b.id, b.church_id, b.branch_key, b.display_name, b.display_name_normalized,
            b.status, b.country_code, c.organization_id
       FROM blessboard.branches b
       JOIN blessboard.churches c ON c.id = b.church_id
       JOIN platform.organizations o ON o.id = c.organization_id
      WHERE b.status IN ('active', 'inactive', 'suspended')
        AND o.data_environment IN ('production', 'pilot')
        AND b.display_name_normalized = $1
      ORDER BY b.created_at DESC, b.id ASC
      LIMIT $2`,
    [name, limit]
  );
  return r.rows;
}

/**
 * Domains by normalized hostname.
 * @param {{ query: Function }} client
 * @param {{ hostname?: string|null, limit?: number }} opts
 */
async function listDuplicateCandidateDomains(client, opts = {}) {
  const hostname = opts.hostname != null ? String(opts.hostname).trim().toLowerCase() : "";
  if (!hostname) return [];
  const limit = Math.min(Math.max(Number(opts.limit) || 40, 1), 100);
  const r = await client.query(
    `SELECT d.id, d.organization_id, d.hostname, d.domain_type, d.status, d.is_primary
       FROM platform.domains d
       LEFT JOIN platform.organizations o ON o.id = d.organization_id
      WHERE d.status IN ('active', 'inactive')
        AND d.hostname = $1
        AND (o.id IS NULL OR o.data_environment IN ('production', 'pilot'))
      ORDER BY d.created_at DESC, d.id ASC
      LIMIT $2`,
    [hostname, limit]
  );
  return r.rows;
}

/**
 * Platform user by email — id only for privacy (no password/display dump).
 * @param {{ query: Function }} client
 * @param {string} emailNormalized
 */
async function findDuplicateCandidateUserByEmail(client, emailNormalized) {
  const email = String(emailNormalized || "")
    .trim()
    .toLowerCase();
  if (!email) return null;
  const r = await client.query(
    `SELECT id, email_normalized, status
       FROM blessboard.users
      WHERE email_normalized = $1
      LIMIT 1`,
    [email]
  );
  return r.rows[0] || null;
}

/**
 * Batch-load safe candidate rows by type for list/comparison (no N+1).
 * @param {{ query: Function }} client
 * @param {{ type: string, ids: string[] }[]} groups
 */
async function loadDuplicateMatchRecordsByType(client, groups) {
  const out = {
    application: new Map(),
    organization: new Map(),
    church: new Map(),
    branch: new Map(),
    domain: new Map(),
    user: new Map(),
  };
  const list = Array.isArray(groups) ? groups : [];
  await Promise.all(
    list.map(async (group) => {
      const type = String(group.type || "").trim().toLowerCase();
      const ids = Array.isArray(group.ids)
        ? [...new Set(group.ids.map((id) => String(id)).filter((id) => UUID_RE.test(id)))]
        : [];
      if (!ids.length || !out[type]) return;

      if (type === "application") {
        const r = await client.query(
          `SELECT ${DUPLICATE_CANDIDATE_APP_SELECT}
             FROM ${TARGET_RELATION}
            WHERE id = ANY($1::uuid[])`,
          [ids]
        );
        for (const row of r.rows) out.application.set(String(row.id), row);
        return;
      }
      if (type === "organization") {
        const r = await client.query(
          `SELECT o.id, o.organization_key, o.display_name, o.legal_name, o.status, o.data_environment,
                  o.created_at, cs.primary_email, cs.primary_phone
             FROM platform.organizations o
             LEFT JOIN blessboard.churches c ON c.organization_id = o.id
             LEFT JOIN blessboard.church_settings cs ON cs.church_id = c.id
            WHERE o.id = ANY($1::uuid[])`,
          [ids]
        );
        for (const row of r.rows) out.organization.set(String(row.id), row);
        return;
      }
      if (type === "church") {
        const r = await client.query(
          `SELECT c.id, c.organization_id, c.church_key, c.display_name, c.legal_name, c.status,
                  c.data_environment, c.created_at, cs.primary_email, cs.primary_phone
             FROM blessboard.churches c
             LEFT JOIN blessboard.church_settings cs ON cs.church_id = c.id
            WHERE c.id = ANY($1::uuid[])`,
          [ids]
        );
        for (const row of r.rows) out.church.set(String(row.id), row);
        return;
      }
      if (type === "branch") {
        const r = await client.query(
          `SELECT b.id, b.church_id, b.branch_key, b.display_name, b.display_name_normalized,
                  b.status, b.country_code
             FROM blessboard.branches b
            WHERE b.id = ANY($1::uuid[])`,
          [ids]
        );
        for (const row of r.rows) out.branch.set(String(row.id), row);
        return;
      }
      if (type === "domain") {
        const r = await client.query(
          `SELECT id, organization_id, hostname, domain_type, status, is_primary
             FROM platform.domains
            WHERE id = ANY($1::uuid[])`,
          [ids]
        );
        for (const row of r.rows) out.domain.set(String(row.id), row);
        return;
      }
      if (type === "user") {
        const r = await client.query(
          `SELECT id, status
             FROM blessboard.users
            WHERE id = ANY($1::uuid[])`,
          [ids]
        );
        for (const row of r.rows) out.user.set(String(row.id), row);
      }
    })
  );
  return out;
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

function nullIfEmptyString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function normalizeJsonbStringArray(value, fieldName) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`invalid_${fieldName}`);
  }
  const out = [];
  for (const item of value) {
    if (item == null) continue;
    const s = String(item).trim();
    if (s === "") continue;
    if (s.length > 200) throw new Error(`invalid_${fieldName}_item`);
    out.push(s);
  }
  return out;
}

/**
 * Insert an append-only registration application communication row.
 * Does not send email, change application status, follow-up, or review_events.
 * @param {{ query: Function }} client
 * @param {object} fields
 */
async function createRegistrationApplicationCommunication(client, fields) {
  const applicationId = String((fields && fields.applicationId) || "").trim();
  if (!applicationId) throw new Error("application_id_required");
  if (!UUID_RE.test(applicationId)) throw new Error("invalid_application_id");

  const createdByUserId = String((fields && fields.createdByUserId) || "").trim();
  if (!createdByUserId) throw new Error("created_by_user_id_required");
  if (!UUID_RE.test(createdByUserId)) throw new Error("invalid_created_by_user_id");

  const communicationType = String((fields && fields.communicationType) || "")
    .trim()
    .toLowerCase();
  if (!COMMUNICATION_TYPES.includes(communicationType)) {
    throw new Error("invalid_communication_type");
  }

  const channel = String((fields && fields.channel) || "")
    .trim()
    .toLowerCase();
  if (!COMMUNICATION_CHANNELS.includes(channel)) {
    throw new Error("invalid_communication_channel");
  }

  const direction = String((fields && fields.direction) || "")
    .trim()
    .toLowerCase();
  if (!COMMUNICATION_DIRECTIONS.includes(direction)) {
    throw new Error("invalid_communication_direction");
  }

  const deliveryStatus = String((fields && fields.deliveryStatus) || "")
    .trim()
    .toLowerCase();
  if (!COMMUNICATION_DELIVERY_STATUSES.includes(deliveryStatus)) {
    throw new Error("invalid_delivery_status");
  }

  if (communicationType === "internal_note") {
    if (direction !== "internal") throw new Error("internal_note_direction_invalid");
    if (deliveryStatus !== "not_applicable") {
      throw new Error("internal_note_delivery_status_invalid");
    }
  }

  const applicantMessage = nullIfEmptyString(fields && fields.applicantMessage);
  const internalNote = nullIfEmptyString(fields && fields.internalNote);

  if (
    (communicationType === "information_request" ||
      communicationType === "rejection_notice" ||
      (communicationType === "applicant_message" && direction === "outbound")) &&
    !applicantMessage
  ) {
    throw new Error("applicant_message_required");
  }

  let deliveryErrorCode = nullIfEmptyString(fields && fields.deliveryErrorCode);
  if (deliveryStatus !== "failed") {
    deliveryErrorCode = null;
  }

  const requestedFields = normalizeJsonbStringArray(
    fields && fields.requestedFields,
    "requested_fields"
  );
  const requestedDocuments = normalizeJsonbStringArray(
    fields && fields.requestedDocuments,
    "requested_documents"
  );

  const r = await client.query(
    `INSERT INTO blessboard.registration_application_communications (
       application_id, communication_type, channel, direction, recipient, subject,
       applicant_message, internal_note, request_category, requested_fields, requested_documents,
       response_due_at, delivery_status, delivery_error_code, created_by_user_id
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb,
       $12::timestamptz, $13, $14, $15
     )
     RETURNING ${REG_APP_COMM_SELECT}`,
    [
      applicationId,
      communicationType,
      channel,
      direction,
      nullIfEmptyString(fields && fields.recipient),
      nullIfEmptyString(fields && fields.subject),
      applicantMessage,
      internalNote,
      nullIfEmptyString(fields && fields.requestCategory),
      JSON.stringify(requestedFields),
      JSON.stringify(requestedDocuments),
      fields && fields.responseDueAt != null && String(fields.responseDueAt).trim() !== ""
        ? fields.responseDueAt
        : null,
      deliveryStatus,
      deliveryErrorCode,
      createdByUserId,
    ]
  );
  return r.rows[0];
}

/**
 * List communications for an application (newest first).
 * @param {{ query: Function }} client
 * @param {string} applicationId
 * @param {{ communicationType?: string|null, limit?: number }} [opts]
 * @returns {Promise<object[]>}
 */
async function listRegistrationApplicationCommunications(client, applicationId, opts = {}) {
  const id = String(applicationId || "").trim();
  if (!id) throw new Error("application_id_required");
  if (!UUID_RE.test(id)) throw new Error("invalid_application_id");

  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 200);
  const params = [id];
  let typeClause = "";
  if (opts.communicationType != null && String(opts.communicationType).trim() !== "") {
    const communicationType = String(opts.communicationType).trim().toLowerCase();
    if (!COMMUNICATION_TYPES.includes(communicationType)) {
      throw new Error("invalid_communication_type");
    }
    params.push(communicationType);
    typeClause = ` AND communication_type = $${params.length}`;
  }
  params.push(limit);

  const r = await client.query(
    `SELECT ${REG_APP_COMM_SELECT}
       FROM blessboard.registration_application_communications
      WHERE application_id = $1${typeClause}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}`,
    params
  );
  return r.rows;
}

/**
 * Latest communication for an application (optional type filter).
 * @param {{ query: Function }} client
 * @param {string} applicationId
 * @param {{ communicationType?: string|null }} [opts]
 * @returns {Promise<object|null>}
 */
async function findLatestRegistrationApplicationCommunication(
  client,
  applicationId,
  opts = {}
) {
  const rows = await listRegistrationApplicationCommunications(client, applicationId, {
    communicationType: opts.communicationType,
    limit: 1,
  });
  return rows[0] || null;
}

/**
 * Update only rejection metadata columns (category / reapplication / notification status).
 * Does not alter application_status or rejection_reason.
 * @param {{ query: Function }} client
 * @param {string} applicationId
 * @param {{
 *   rejectionCategory?: string|null,
 *   reapplicationAllowed?: boolean|null,
 *   rejectionNotificationStatus?: string|null,
 * }} patch
 */
async function updateRegistrationRejectionMetadata(client, applicationId, patch = {}) {
  const id = String(applicationId || "").trim();
  if (!id) throw new Error("application_id_required");
  if (!UUID_RE.test(id)) throw new Error("invalid_application_id");

  const setCategory = Object.prototype.hasOwnProperty.call(patch, "rejectionCategory");
  const setReapply = Object.prototype.hasOwnProperty.call(patch, "reapplicationAllowed");
  const setNotify = Object.prototype.hasOwnProperty.call(patch, "rejectionNotificationStatus");
  if (!setCategory && !setReapply && !setNotify) {
    throw new Error("rejection_metadata_patch_required");
  }

  let rejectionCategory = null;
  if (setCategory) {
    rejectionCategory = nullIfEmptyString(patch.rejectionCategory);
  }

  let reapplicationAllowed = null;
  if (setReapply) {
    if (patch.reapplicationAllowed == null) {
      reapplicationAllowed = null;
    } else {
      reapplicationAllowed = Boolean(patch.reapplicationAllowed);
    }
  }

  let rejectionNotificationStatus = null;
  if (setNotify) {
    rejectionNotificationStatus = nullIfEmptyString(patch.rejectionNotificationStatus);
    if (
      rejectionNotificationStatus != null &&
      !REJECTION_NOTIFICATION_STATUSES.includes(rejectionNotificationStatus)
    ) {
      throw new Error("invalid_rejection_notification_status");
    }
  }

  const r = await client.query(
    `UPDATE blessboard.platform_church_registration_applications
        SET rejection_category = CASE WHEN $2::boolean THEN $3::text ELSE rejection_category END,
            reapplication_allowed = CASE WHEN $4::boolean THEN $5::boolean ELSE reapplication_allowed END,
            rejection_notification_status = CASE
              WHEN $6::boolean THEN $7::text
              ELSE rejection_notification_status
            END,
            updated_at = now()
      WHERE id = $1
      RETURNING ${REJECTION_METADATA_SELECT}`,
    [
      id,
      setCategory,
      rejectionCategory,
      setReapply,
      reapplicationAllowed,
      setNotify,
      rejectionNotificationStatus,
    ]
  );
  return r.rows[0] || null;
}

module.exports = {
  TARGET_SCHEMA,
  TARGET_TABLE,
  TARGET_RELATION,
  FORBIDDEN_RELATION_FRAGMENTS,
  SELECT_COLUMNS,
  PUBLIC_WRITE_SELECT_COLUMNS,
  PUBLIC_REGISTRATION_REQUIRED_COLUMNS,
  PUBLIC_REGISTRATION_ADMIN_ONLY_COLUMNS,
  APPLICATION_STATUSES,
  PROVISIONING_STATUSES,
  FOLLOW_UP_STATUSES,
  WORKFLOW_STATUSES,
  CONTACT_METHODS,
  CONTACT_OUTCOMES,
  COMMUNICATION_TYPES,
  COMMUNICATION_CHANNELS,
  COMMUNICATION_DIRECTIONS,
  COMMUNICATION_DELIVERY_STATUSES,
  REJECTION_NOTIFICATION_STATUSES,
  PHONE_VERIFICATION_OUTCOMES,
  PHONE_VERIFICATION_CHECK_STATUSES,
  PHONE_VERIFICATION_RESULTS,
  LINKED_FILTERS,
  SORT_OPTIONS,
  DuplicateRegistrationPhoneError,
  PublicRegistrationSchemaMismatchError,
  isUniquePhoneViolation,
  normalizeFollowUpStatusInput,
  checkPublicRegistrationSchemaReady,
  assertPublicRegistrationSchemaReady,
  resetPublicRegistrationSchemaCacheForTests,
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
  createPhoneVerificationAttempt,
  listPhoneVerificationAttempts,
  createRegistrationApplicationCommunication,
  listRegistrationApplicationCommunications,
  findLatestRegistrationApplicationCommunication,
  updateRegistrationRejectionMetadata,
  createRegistrationEmailVerificationToken,
  findRegistrationEmailVerificationTokenByHash,
  findLatestRegistrationEmailVerificationToken,
  invalidateActiveRegistrationEmailVerificationTokens,
  markRegistrationEmailVerificationTokenVerified,
  EMAIL_VERIFY_TOKEN_STATUSES,
  DUPLICATE_MATCH_RECORD_TYPES,
  DUPLICATE_MATCH_RISK_LEVELS,
  DUPLICATE_MATCH_REVIEW_DECISIONS,
  linkApplicationToOrganization,
  listActivePlatformAdministrators,
  getOrganizationPublicationSummary,
  getOrganizationCurrentPlanKey,
  getOrganizationCurrentSubscriptionSummary,
  findApplicationIdForOrganization,
  findApplicationIdForOrganizationKey,
  findOrganizationIdByKey,
  loadOrganizationOnboardingFacts,
  replaceRegistrationDuplicateMatches,
  listRegistrationDuplicateMatches,
  getRegistrationDuplicateMatchById,
  recordRegistrationDuplicateMatchDecision,
  listDuplicateCandidateApplications,
  listDuplicateCandidateOrganizations,
  listDuplicateCandidateChurches,
  listDuplicateCandidateBranches,
  listDuplicateCandidateDomains,
  findDuplicateCandidateUserByEmail,
  loadDuplicateMatchRecordsByType,
  escapeLikePattern,
};
