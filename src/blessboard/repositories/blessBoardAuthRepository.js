"use strict";

/**
 * BlessBoard auth repository helpers (parameterized SQL).
 *
 * V10 canonical: phone_verified_at / phone_country_code / preferred_* are required
 * columns (blessboard/073+). No information_schema probe or lag SELECT.
 */

/**
 * @param {{ query: Function }} client
 * @param {string} whereSql
 * @param {unknown[]} params
 * @param {{ orderLimitSql?: string }} [opts]
 */
async function selectUserRow(client, whereSql, params, opts = {}) {
  const orderLimitSql = opts.orderLimitSql || "LIMIT 1";
  const r = await client.query(
    `SELECT id, email_normalized, email_display, password_hash, status, display_name,
            created_at, updated_at, password_changed_at, last_login_at,
            password_change_required, sign_in_locked_until,
            phone_normalized, phone_display,
            phone_country_code, phone_verified_at,
            preferred_login_identifier, preferred_contact_channel
       FROM blessboard.users
      WHERE ${whereSql}
      ${orderLimitSql}`,
    params
  );
  return r;
}

/**
 * @param {{ query: Function }} client
 * @param {string} emailNormalized
 */
async function findUserByEmail(client, emailNormalized) {
  if (!emailNormalized) return null;
  const r = await selectUserRow(client, "email_normalized = $1", [emailNormalized]);
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} phoneNormalized E.164
 */
async function findUserByPhone(client, phoneNormalized) {
  if (!phoneNormalized) return null;
  const r = await selectUserRow(client, "phone_normalized = $1", [phoneNormalized], {
    orderLimitSql: "ORDER BY created_at ASC LIMIT 2",
  });
  if (r.rows.length !== 1) return null;
  return r.rows[0];
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   emailNormalized: string,
 *   emailDisplay: string,
 *   passwordHash: string,
 *   displayName: string,
 *   status?: string
 * }} fields
 */
async function insertUser(client, fields) {
  const r = await client.query(
    `INSERT INTO blessboard.users
       (email_normalized, email_display, password_hash, status, display_name,
        phone_normalized, phone_display)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, email_normalized, email_display, status, display_name,
               phone_normalized, phone_display, created_at`,
    [
      fields.emailNormalized != null ? fields.emailNormalized : null,
      fields.emailDisplay != null ? fields.emailDisplay : null,
      fields.passwordHash == null ? null : fields.passwordHash,
      fields.status || "active",
      fields.displayName,
      fields.phoneNormalized != null ? fields.phoneNormalized : null,
      fields.phoneDisplay != null ? fields.phoneDisplay : null,
    ]
  );
  return r.rows[0];
}

/**
 * Activate an invited user with a password hash (or refresh password for existing active users).
 * @param {{ query: Function }} client
 * @param {string} userId
 * @param {{ passwordHash: string, displayName?: string|null, status?: string }} fields
 */
async function activateUserWithPassword(client, userId, fields) {
  const r = await client.query(
    `UPDATE blessboard.users
        SET password_hash = $2,
            status = COALESCE($3, 'active'),
            display_name = COALESCE($4, display_name),
            password_changed_at = now(),
            updated_at = now()
      WHERE id = $1
      RETURNING id, email_normalized, email_display, status, display_name`,
    [
      userId,
      fields.passwordHash,
      fields.status || "active",
      fields.displayName != null ? fields.displayName : null,
    ]
  );
  return r.rows[0] || null;
}

/** Catalogue role_key → legacy display key (HQ / seed compatibility). */
const CATALOGUE_TO_LEGACY_ROLE = Object.freeze({
  platform_administrator: "platform_admin",
  organisation_administrator: "church_hq_admin",
  church_system_administrator: "church_hq_admin",
  branch_administrator: "branch_admin",
});

const LEGACY_TO_CATALOGUE_ROLE_KEYS = Object.freeze({
  platform_admin: ["platform_administrator"],
  church_hq_admin: ["organisation_administrator", "church_system_administrator"],
  branch_admin: ["branch_administrator"],
});

function legacyRoleKeyForCatalogue(catalogueKey) {
  return CATALOGUE_TO_LEGACY_ROLE[String(catalogueKey || "")] || String(catalogueKey || "");
}

function catalogueRoleKeysForInput(roleKey) {
  const key = String(roleKey || "")
    .trim()
    .toLowerCase();
  if (LEGACY_TO_CATALOGUE_ROLE_KEYS[key]) return LEGACY_TO_CATALOGUE_ROLE_KEYS[key];
  return key ? [key] : [];
}

function mapAssignmentRowToLegacyShape(row) {
  if (!row) return null;
  const catalogueKey = String(row.role_key || "");
  const branchId =
    row.scope_type === "branch" && row.scope_id
      ? row.scope_id
      : row.branch_id || null;
  return {
    id: row.id,
    user_id: row.user_id,
    organization_id: row.organization_id,
    church_id: row.church_id || null,
    branch_id: branchId,
    role_key: legacyRoleKeyForCatalogue(catalogueKey),
    catalogue_role_key: catalogueKey,
    status: row.status,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    scope_type: row.scope_type || null,
    scope_id: row.scope_id || null,
  };
}

/**
 * Active catalogue assignments shaped like legacy user_roles rows (display keys).
 * @param {{ query: Function }} client
 * @param {string} userId
 */
async function listActiveRolesForUser(client, userId) {
  const r = await client.query(
    `SELECT a.id, a.user_id, a.organization_id, a.church_id, a.scope_type, a.scope_id,
            a.status, a.created_at, a.updated_at, r.role_key
       FROM blessboard.user_role_assignments a
       JOIN blessboard.roles r ON r.id = a.role_id
      WHERE a.user_id = $1
        AND a.status = 'active'
        AND a.revoked_at IS NULL
        AND (a.expires_at IS NULL OR a.expires_at > now())
        AND r.is_active = true
      ORDER BY r.role_key, a.organization_id`,
    [userId]
  );
  return r.rows.map(mapAssignmentRowToLegacyShape);
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationKey
 */
async function findOrganizationByKey(client, organizationKey) {
  const r = await client.query(
    `SELECT id, organization_key, status, data_environment
       FROM platform.organizations
      WHERE organization_key = $1
      LIMIT 1`,
    [organizationKey]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} churchKey
 */
async function findChurchByKey(client, churchKey) {
  const r = await client.query(
    `SELECT id, organization_id, church_key, status
       FROM blessboard.churches
      WHERE church_key = $1
      LIMIT 1`,
    [churchKey]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} churchId
 * @param {string} branchKey
 */
async function findBranchByChurchAndKey(client, churchId, branchKey) {
  const r = await client.query(
    `SELECT id, church_id, branch_key, status, branch_type
       FROM blessboard.branches
      WHERE church_id = $1 AND branch_key = $2
      LIMIT 1`,
    [churchId, branchKey]
  );
  return r.rows[0] || null;
}

/**
 * Find a catalogue assignment by legacy or catalogue role key + scope.
 * @param {{ query: Function }} client
 * @param {{
 *   userId: string,
 *   organizationId: string,
 *   churchId: string | null,
 *   branchId: string | null,
 *   roleKey: string
 * }} fields
 */
async function findRole(client, fields) {
  const catalogueKeys = catalogueRoleKeysForInput(fields.roleKey);
  if (!catalogueKeys.length) return null;
  const branchId = fields.branchId || null;
  const churchId = fields.churchId || null;
  const r = await client.query(
    `SELECT a.id, a.user_id, a.organization_id, a.church_id, a.scope_type, a.scope_id,
            a.status, a.created_at, a.updated_at, r.role_key
       FROM blessboard.user_role_assignments a
       JOIN blessboard.roles r ON r.id = a.role_id
      WHERE a.user_id = $1
        AND a.organization_id = $2
        AND r.role_key = ANY($3::text[])
        AND a.church_id IS NOT DISTINCT FROM $4
        AND (
          ($5::uuid IS NULL AND a.scope_type <> 'branch')
          OR (a.scope_type = 'branch' AND a.scope_id IS NOT DISTINCT FROM $5)
        )
      ORDER BY CASE WHEN a.status = 'active' THEN 0 ELSE 1 END, a.created_at DESC
      LIMIT 1`,
    [fields.userId, fields.organizationId, catalogueKeys, churchId, branchId]
  );
  return mapAssignmentRowToLegacyShape(r.rows[0] || null);
}

/**
 * Load catalogue assignment by id (HQ revoke / detail).
 * @param {{ query: Function }} client
 * @param {string} roleId
 */
async function findRoleById(client, roleId) {
  const r = await client.query(
    `SELECT a.id, a.user_id, a.organization_id, a.church_id, a.scope_type, a.scope_id,
            a.status, a.created_at, a.updated_at, r.role_key
       FROM blessboard.user_role_assignments a
       JOIN blessboard.roles r ON r.id = a.role_id
      WHERE a.id = $1
      LIMIT 1`,
    [roleId]
  );
  return mapAssignmentRowToLegacyShape(r.rows[0] || null);
}

/**
 * Active church-scoped staff assignments (HQ + branch admin). Never returns platform_admin.
 * Rows use legacy display role_key (church_hq_admin / branch_admin) for HQ UI.
 * @param {{ query: Function }} client
 * @param {{ churchId: string, organizationId: string, q?: string | null, roleKey?: string | null, limit?: number, offset?: number }} filters
 */
async function listChurchStaffRoles(client, filters) {
  const churchId = String(filters.churchId || "").trim();
  const organizationId = String(filters.organizationId || "").trim();
  const q = filters.q ? String(filters.q).trim().toLowerCase().slice(0, 100) : "";
  const roleKey = filters.roleKey ? String(filters.roleKey).trim().toLowerCase() : "";
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 100);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  const params = [organizationId, churchId];
  let roleClause = "";
  if (roleKey === "church_hq_admin" || roleKey === "branch_admin") {
    const keys = catalogueRoleKeysForInput(roleKey);
    params.push(keys);
    roleClause = ` AND r.role_key = ANY($${params.length}::text[])`;
  } else {
    params.push([
      "organisation_administrator",
      "church_system_administrator",
      "branch_administrator",
    ]);
    roleClause = ` AND r.role_key = ANY($${params.length}::text[])`;
  }
  let searchClause = "";
  if (q) {
    params.push(`%${q}%`);
    searchClause = ` AND (
      u.email_normalized LIKE $${params.length}
      OR lower(coalesce(u.display_name, '')) LIKE $${params.length}
      OR lower(coalesce(b.branch_key, '')) LIKE $${params.length}
      OR lower(coalesce(b.display_name, '')) LIKE $${params.length}
    )`;
  }
  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const { rows } = await client.query(
    `SELECT a.id, a.user_id, a.organization_id, a.church_id,
            CASE WHEN a.scope_type = 'branch' THEN a.scope_id ELSE NULL END AS branch_id,
            CASE
              WHEN r.role_key = 'branch_administrator' THEN 'branch_admin'
              ELSE 'church_hq_admin'
            END AS role_key,
            a.status, a.created_at, a.updated_at,
            u.email_display, u.email_normalized, u.display_name AS user_display_name, u.status AS user_status,
            (u.password_hash IS NOT NULL) AS has_usable_password,
            u.password_changed_at,
            b.branch_key, b.display_name AS branch_display_name,
            COUNT(*) OVER()::int AS total_count
       FROM blessboard.user_role_assignments a
       JOIN blessboard.roles r ON r.id = a.role_id
       INNER JOIN blessboard.users u ON u.id = a.user_id
       LEFT JOIN blessboard.branches b
         ON b.id = CASE WHEN a.scope_type = 'branch' THEN a.scope_id ELSE NULL END
      WHERE a.organization_id = $1
        AND a.status = 'active'
        AND a.revoked_at IS NULL
        AND (a.expires_at IS NULL OR a.expires_at > now())
        AND r.is_active = true
        AND a.scope_type IN ('organisation', 'church', 'branch')
        AND (a.church_id IS NULL OR a.church_id = $2)
        ${roleClause}
        ${searchClause}
      ORDER BY role_key ASC, u.display_name ASC NULLS LAST, u.email_normalized ASC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );
  return rows;
}

/**
 * @param {{ query: Function }} client
 * @param {string} churchId
 * @param {string} organizationId
 */
async function countActiveChurchStaffRoles(client, churchId, organizationId) {
  const { rows } = await client.query(
    `SELECT
        COUNT(*) FILTER (
          WHERE r.role_key IN ('organisation_administrator', 'church_system_administrator')
        )::int AS hq_admins,
        COUNT(*) FILTER (WHERE r.role_key = 'branch_administrator')::int AS branch_admins
       FROM blessboard.user_role_assignments a
       JOIN blessboard.roles r ON r.id = a.role_id
      WHERE a.organization_id = $1
        AND a.status = 'active'
        AND a.revoked_at IS NULL
        AND (a.expires_at IS NULL OR a.expires_at > now())
        AND r.is_active = true
        AND a.scope_type IN ('organisation', 'church', 'branch')
        AND (a.church_id IS NULL OR a.church_id = $2)
        AND r.role_key IN (
          'organisation_administrator',
          'church_system_administrator',
          'branch_administrator'
        )`,
    [organizationId, churchId]
  );
  return {
    hqAdmins: Number(rows[0] && rows[0].hq_admins) || 0,
    branchAdmins: Number(rows[0] && rows[0].branch_admins) || 0,
  };
}

/**
 * @param {{ query: Function }} client
 * @param {string} userId
 */
async function findUserById(client, userId) {
  const r = await selectUserRow(client, "id = $1", [userId]);
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} userId
 */
async function touchLastLogin(client, userId) {
  await client.query(
    `UPDATE blessboard.users SET last_login_at = now(), updated_at = now() WHERE id = $1`,
    [userId]
  );
}

/**
 * @param {{ query: Function }} client
 * @param {string} userId
 * @param {string} passwordHash
 */
async function updateUserPasswordHash(client, userId, passwordHash) {
  const r = await client.query(
    `UPDATE blessboard.users
        SET password_hash = $2,
            password_changed_at = now(),
            updated_at = now()
      WHERE id = $1
      RETURNING id, email_normalized, status, display_name, password_changed_at`,
    [userId, passwordHash]
  );
  return r.rows[0] || null;
}

/**
 * Update the canonical login email on blessboard.users.
 * Clears email_verified_at when the normalized address changes (ownership not re-proven).
 * @param {{ query: Function }} client
 * @param {{
 *   userId: string,
 *   emailNormalized: string|null,
 *   emailDisplay: string|null,
 * }} fields
 */
async function updateUserEmail(client, fields) {
  const userId = String((fields && fields.userId) || "").trim();
  if (!userId) return null;
  const emailNormalized =
    fields.emailNormalized == null || String(fields.emailNormalized).trim() === ""
      ? null
      : String(fields.emailNormalized).trim().toLowerCase();
  const emailDisplay =
    fields.emailDisplay == null || String(fields.emailDisplay).trim() === ""
      ? null
      : String(fields.emailDisplay).trim();
  const r = await client.query(
    `UPDATE blessboard.users
        SET email_normalized = $2,
            email_display = $3,
            email_verified_at = CASE
              WHEN email_normalized IS DISTINCT FROM $2 THEN NULL
              ELSE email_verified_at
            END,
            updated_at = now()
      WHERE id = $1
      RETURNING id, email_normalized, email_display, status, phone_normalized,
                password_hash, email_verified_at`,
    [userId, emailNormalized, emailDisplay]
  );
  return r.rows[0] || null;
}

/**
 * Active (non-revoked, non-expired) deployment sessions for a user.
 * @param {{ query: Function }} client
 * @param {string} userId
 */
async function countActiveSessionsForUser(client, userId) {
  const r = await client.query(
    `SELECT COUNT(*)::int AS count
       FROM platform.deployment_sessions
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND expires_at > now()`,
    [userId]
  );
  return Number(r.rows[0]?.count) || 0;
}

/**
 * Revoke all non-revoked sessions for a user (including not-yet-expired).
 * Prefer deployment-scoped revoke so V8 operations cannot wipe V7 rows.
 * @param {{ query: Function }} client
 * @param {string} userId
 * @param {{ deploymentCode?: string, allowGlobal?: boolean }} [opts]
 */
async function revokeAllSessionsForUser(client, userId, opts) {
  const options = opts && typeof opts === "object" ? opts : {};
  const deploymentCode = options.deploymentCode
    ? String(options.deploymentCode).trim().toLowerCase()
    : "";
  if (deploymentCode) {
    const r = await client.query(
      `UPDATE platform.deployment_sessions
          SET revoked_at = now()
        WHERE user_id = $1
          AND deployment_code = $2
          AND revoked_at IS NULL
        RETURNING id`,
      [userId, deploymentCode]
    );
    return r.rowCount || 0;
  }
  if (!options.allowGlobal) {
    return 0;
  }
  const r = await client.query(
    `UPDATE platform.deployment_sessions
        SET revoked_at = now()
      WHERE user_id = $1
        AND revoked_at IS NULL
      RETURNING id`,
    [userId]
  );
  return r.rowCount || 0;
}

/**
 * @param {{ query: Function }} client
 * @param {string} userId
 * @param {'active'|'inactive'|'suspended'|'invited'} status
 */
async function updateUserStatus(client, userId, status) {
  const r = await client.query(
    `UPDATE blessboard.users
        SET status = $2, updated_at = now()
      WHERE id = $1
      RETURNING id, status, email_normalized, display_name`,
    [userId, status]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} userId
 * @param {boolean} required
 */
async function setPasswordChangeRequired(client, userId, required) {
  const r = await client.query(
    `UPDATE blessboard.users
        SET password_change_required = $2, updated_at = now()
      WHERE id = $1
      RETURNING id, password_change_required`,
    [userId, Boolean(required)]
  );
  return r.rows[0] || null;
}

/**
 * Clear temporary sign-in lock.
 * @param {{ query: Function }} client
 * @param {string} userId
 */
async function clearSignInLock(client, userId) {
  const r = await client.query(
    `UPDATE blessboard.users
        SET sign_in_locked_until = NULL, updated_at = now()
      WHERE id = $1
      RETURNING id, sign_in_locked_until`,
    [userId]
  );
  return r.rows[0] || null;
}

/**
 * Set temporary sign-in lock until timestamp (ISO or Date).
 * @param {{ query: Function }} client
 * @param {string} userId
 * @param {string|Date} until
 */
async function setSignInLockedUntil(client, userId, until) {
  const r = await client.query(
    `UPDATE blessboard.users
        SET sign_in_locked_until = $2::timestamptz, updated_at = now()
      WHERE id = $1
      RETURNING id, sign_in_locked_until`,
    [userId, until]
  );
  return r.rows[0] || null;
}

/**
 * After a successful password reset/change, clear recovery flags.
 * @param {{ query: Function }} client
 * @param {string} userId
 */
async function clearPasswordRecoveryFlags(client, userId) {
  await client.query(
    `UPDATE blessboard.users
        SET password_change_required = false,
            sign_in_locked_until = NULL,
            updated_at = now()
      WHERE id = $1`,
    [userId]
  );
}

/**
 * Read-only platform_administrator inventory (no secrets).
 * @param {{ query: Function }} client
 */
async function listPlatformAdministrators(client) {
  const r = await client.query(
    `SELECT DISTINCT
        u.id,
        u.display_name,
        u.email_normalized,
        u.status AS account_status,
        'platform_admin' AS role_code,
        a.status AS role_status,
        u.created_at,
        u.last_login_at
       FROM blessboard.users u
       INNER JOIN blessboard.user_role_assignments a ON a.user_id = u.id
       INNER JOIN blessboard.roles r ON r.id = a.role_id
      WHERE r.role_key = 'platform_administrator'
        AND a.status = 'active'
        AND a.revoked_at IS NULL
        AND (a.expires_at IS NULL OR a.expires_at > now())
      ORDER BY u.created_at ASC`
  );
  return r.rows;
}

/**
 * Prefer an active platform_administrator org scope for audit; else any active assignment org.
 * @param {{ query: Function }} client
 * @param {string} userId
 */
async function findAuditOrganizationIdForUser(client, userId) {
  const r = await client.query(
    `SELECT a.organization_id
       FROM blessboard.user_role_assignments a
       JOIN blessboard.roles r ON r.id = a.role_id
      WHERE a.user_id = $1
        AND a.status = 'active'
        AND a.revoked_at IS NULL
        AND (a.expires_at IS NULL OR a.expires_at > now())
      ORDER BY CASE WHEN r.role_key = 'platform_administrator' THEN 0 ELSE 1 END,
               a.created_at ASC
      LIMIT 1`,
    [userId]
  );
  return r.rows[0] ? String(r.rows[0].organization_id) : null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} userId
 */
async function userHasActivePlatformAdminRole(client, userId) {
  const r = await client.query(
    `SELECT 1
       FROM blessboard.user_role_assignments a
       JOIN blessboard.roles r ON r.id = a.role_id
      WHERE a.user_id = $1
        AND r.role_key = 'platform_administrator'
        AND a.status = 'active'
        AND a.revoked_at IS NULL
        AND (a.expires_at IS NULL OR a.expires_at > now())
      LIMIT 1`,
    [userId]
  );
  return Boolean(r.rows[0]);
}

function isUniqueViolation(err) {
  return Boolean(err && (err.code === "23505" || /unique|duplicate/i.test(String(err.message || ""))));
}

module.exports = {
  findUserByEmail,
  findUserByPhone,
  findUserById,
  insertUser,
  activateUserWithPassword,
  listActiveRolesForUser,
  findOrganizationByKey,
  findChurchByKey,
  findBranchByChurchAndKey,
  findRole,
  findRoleById,
  listChurchStaffRoles,
  countActiveChurchStaffRoles,
  touchLastLogin,
  updateUserPasswordHash,
  updateUserEmail,
  countActiveSessionsForUser,
  revokeAllSessionsForUser,
  updateUserStatus,
  setPasswordChangeRequired,
  clearSignInLock,
  setSignInLockedUntil,
  clearPasswordRecoveryFlags,
  listPlatformAdministrators,
  findAuditOrganizationIdForUser,
  userHasActivePlatformAdminRole,
  isUniqueViolation,
};
