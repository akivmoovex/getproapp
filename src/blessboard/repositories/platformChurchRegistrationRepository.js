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
  role_in_church, branch_name, branch_count, selected_plan, message, consent_terms,
  review_notes, source_ip, user_agent, created_at, updated_at,
  organization_id, application_status, provisioning_status,
  provisioning_started_at, provisioned_at, provisioning_failed_at,
  provisioning_error_code, provisioning_error_detail
`;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {{ query: Function }} client
 * @param {object} fields
 */
async function insertApplicationRow(client, fields) {
  const r = await client.query(
    `INSERT INTO ${TARGET_RELATION} (
       status, application_status, provisioning_status,
       church_name, country, city, contact_name, contact_email, contact_phone,
       role_in_church, branch_name, branch_count, selected_plan, message, consent_terms,
       source_ip, user_agent
     ) VALUES (
       'pending', 'submitted', 'not_started',
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11, $12,
       $13, $14
     )
     RETURNING ${SELECT_COLUMNS}`,
    [
      fields.church_name,
      fields.country,
      fields.city,
      fields.contact_name,
      fields.contact_email,
      fields.contact_phone,
      fields.role_in_church || null,
      fields.branch_name || null,
      fields.branch_count || null,
      fields.selected_plan || null,
      fields.message || null,
      Boolean(fields.consent_terms),
      fields.source_ip || null,
      fields.user_agent || null,
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
 * Recent pending twin used for accidental double-submit idempotency.
 * @param {import('pg').Pool} pool
 * @param {{ contact_email: string, church_name: string, windowMinutes?: number }} opts
 */
async function findRecentPendingDuplicate(pool, opts) {
  return findRecentRegistrationDuplicate(pool, opts);
}

/**
 * Insert at most one application for the same email+church within the window.
 * Uses a transaction-scoped advisory lock (no migration / unique index required).
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

  // Query-only mocks / clients: insert without advisory lock (tests + fallback).
  if (typeof pool.connect !== "function") {
    const existing = await findRecentRegistrationDuplicate(pool, {
      contact_email: fields.contact_email,
      church_name: fields.church_name,
      windowMinutes: opts.windowMinutes,
    });
    if (existing) {
      return { application: existing, duplicate: true };
    }
    const application = await insertApplicationRow(pool, fields);
    return { application, duplicate: false };
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
    const existing = await findRecentRegistrationDuplicate(client, {
      contact_email: fields.contact_email,
      church_name: fields.church_name,
      windowMinutes: opts.windowMinutes,
    });
    if (existing) {
      await client.query("COMMIT");
      return { application: existing, duplicate: true };
    }
    const application = await insertApplicationRow(client, fields);
    await client.query("COMMIT");
    return { application, duplicate: false };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
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
  "call_pending",
  "contacted",
  "needs_help",
  "self_onboarding",
  "completed",
  "unreachable",
  "not_interested",
]);
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
  a.contact_name, a.contact_email, a.contact_phone, a.role_in_church,
  a.branch_name, a.branch_count, a.selected_plan, a.message, a.consent_terms,
  a.created_at, a.updated_at, a.organization_id, a.application_status, a.provisioning_status,
  a.provisioning_started_at, a.provisioned_at, a.provisioning_failed_at,
  a.provisioning_error_code, a.provisioning_error_detail,
  o.organization_key, o.display_name AS organization_display_name, o.status AS organization_status,
  o.created_at AS organization_created_at,
  oo.onboarding_status, oo.follow_up_status, oo.assigned_support_user_id,
  oo.first_contacted_at, oo.last_contacted_at, oo.next_follow_up_at,
  oo.onboarding_started_at, oo.onboarding_completed_at, oo.support_requested,
  oo.last_activity_at,
  su.display_name AS support_display_name, su.email_normalized AS support_email
`;

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
    params.push(filters.followUpStatus);
    clauses.push(`oo.follow_up_status = $${params.length}`);
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
       LEFT JOIN blessboard.users su ON su.id = oo.assigned_support_user_id
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
            a.review_notes, a.source_ip, a.user_agent, a.message AS registration_message
       FROM ${TARGET_RELATION} a
       LEFT JOIN platform.organizations o ON o.id = a.organization_id
       LEFT JOIN blessboard.organization_onboarding oo ON oo.organization_id = a.organization_id
       LEFT JOIN blessboard.users su ON su.id = oo.assigned_support_user_id
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
  const r = await client.query(
    `INSERT INTO blessboard.organization_support_contacts (
       organization_id, registration_application_id, created_by_user_id,
       contact_method, outcome, note, contacted_at, next_follow_up_at
     ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()), $8)
     RETURNING id, organization_id, registration_application_id, created_by_user_id,
               contact_method, outcome, note, contacted_at, next_follow_up_at, created_at`,
    [
      fields.organizationId,
      fields.registrationApplicationId || null,
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
  const id = String(organizationId || "").trim();
  if (!UUID_RE.test(id)) return null;
  const r = await client.query(
    `SELECT p.plan_key
       FROM platform.organization_subscriptions os
       INNER JOIN platform.plans p ON p.id = os.plan_id
      WHERE os.organization_id = $1
        AND os.status IN ('active', 'trialing')
      ORDER BY os.created_at DESC
      LIMIT 1`,
    [id]
  );
  return r.rows[0] ? String(r.rows[0].plan_key) : null;
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

module.exports = {
  TARGET_SCHEMA,
  TARGET_TABLE,
  TARGET_RELATION,
  FORBIDDEN_RELATION_FRAGMENTS,
  SELECT_COLUMNS,
  APPLICATION_STATUSES,
  PROVISIONING_STATUSES,
  FOLLOW_UP_STATUSES,
  CONTACT_METHODS,
  CONTACT_OUTCOMES,
  LINKED_FILTERS,
  SORT_OPTIONS,
  createApplication,
  createApplicationIdempotent,
  findRecentPendingDuplicate,
  findRecentRegistrationDuplicate,
  listApplications,
  countPending,
  countOrganizationsCreatedSince,
  registrationTableExists,
  lockApplicationById,
  findApplicationById,
  updateApplicationProvisioningState,
  listRegistrationApplications,
  countRegistrationApplications,
  getRegistrationApplicationById,
  updateOrganizationOnboarding,
  ensureOrganizationOnboardingRow,
  createOrganizationSupportContact,
  listOrganizationSupportContacts,
  listActivePlatformAdministrators,
  getOrganizationPublicationSummary,
  getOrganizationCurrentPlanKey,
  findApplicationIdForOrganization,
  findApplicationIdForOrganizationKey,
  escapeLikePattern,
};
