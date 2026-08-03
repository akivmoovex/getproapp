"use strict";

/**
 * BlessBoard auth repository helpers (parameterized SQL).
 *
 * Core SELECT stays compatible with migrations through 072. Columns introduced
 * in 073+ (phone_verified_at, phone_country_code, preferred_*) are attached
 * when present so testing DBs that lag migrations do not break auth/recovery.
 */

/** @type {string|null} */
let usersOptionalPhoneSelectSql = null;
/** @type {Promise<string>|null} */
let usersOptionalPhoneSelectPromise = null;

/**
 * @param {{ query: Function }} client
 * @returns {Promise<string>}
 */
async function resolveUsersOptionalPhoneSelect(client) {
  if (usersOptionalPhoneSelectSql != null) return usersOptionalPhoneSelectSql;
  if (!usersOptionalPhoneSelectPromise) {
    usersOptionalPhoneSelectPromise = (async () => {
      try {
        const r = await client.query(
          `SELECT column_name
             FROM information_schema.columns
            WHERE table_schema = 'blessboard'
              AND table_name = 'users'
              AND column_name = ANY($1::text[])`,
          [
            [
              "phone_country_code",
              "phone_verified_at",
              "preferred_login_identifier",
              "preferred_contact_channel",
            ],
          ]
        );
        const present = new Set(r.rows.map((row) => String(row.column_name)));
        const parts = [];
        for (const col of [
          "phone_country_code",
          "phone_verified_at",
          "preferred_login_identifier",
          "preferred_contact_channel",
        ]) {
          if (present.has(col)) parts.push(col);
        }
        usersOptionalPhoneSelectSql = parts.length ? `, ${parts.join(", ")}` : "";
      } catch {
        usersOptionalPhoneSelectSql = "";
      }
      return usersOptionalPhoneSelectSql;
    })();
  }
  return usersOptionalPhoneSelectPromise;
}

/**
 * @param {{ query: Function }} client
 * @param {string} whereSql
 * @param {unknown[]} params
 * @param {{ orderLimitSql?: string }} [opts]
 */
async function selectUserRow(client, whereSql, params, opts = {}) {
  const optional = await resolveUsersOptionalPhoneSelect(client);
  const orderLimitSql = opts.orderLimitSql || "LIMIT 1";
  const r = await client.query(
    `SELECT id, email_normalized, email_display, password_hash, status, display_name,
            created_at, updated_at, password_changed_at, last_login_at,
            password_change_required, sign_in_locked_until,
            phone_normalized, phone_display${optional}
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

/**
 * @param {{ query: Function }} client
 * @param {string} userId
 */
async function listActiveRolesForUser(client, userId) {
  const r = await client.query(
    `SELECT id, user_id, organization_id, church_id, branch_id, role_key, status
       FROM blessboard.user_roles
      WHERE user_id = $1 AND status = 'active'
      ORDER BY role_key, organization_id`,
    [userId]
  );
  return r.rows;
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
  const r = await client.query(
    `SELECT id, user_id, organization_id, church_id, branch_id, role_key, status
       FROM blessboard.user_roles
      WHERE user_id = $1
        AND organization_id = $2
        AND role_key = $3
        AND church_id IS NOT DISTINCT FROM $4
        AND branch_id IS NOT DISTINCT FROM $5
      LIMIT 1`,
    [
      fields.userId,
      fields.organizationId,
      fields.roleKey,
      fields.churchId,
      fields.branchId,
    ]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   userId: string,
 *   organizationId: string,
 *   churchId: string | null,
 *   branchId: string | null,
 *   roleKey: string
 * }} fields
 */
async function insertRole(client, fields) {
  const r = await client.query(
    `INSERT INTO blessboard.user_roles
       (user_id, organization_id, church_id, branch_id, role_key, status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     RETURNING id, user_id, organization_id, church_id, branch_id, role_key, status`,
    [
      fields.userId,
      fields.organizationId,
      fields.churchId,
      fields.branchId,
      fields.roleKey,
    ]
  );
  return r.rows[0];
}

/**
 * @param {{ query: Function }} client
 * @param {string} roleId
 */
async function findRoleById(client, roleId) {
  const r = await client.query(
    `SELECT id, user_id, organization_id, church_id, branch_id, role_key, status, created_at, updated_at
       FROM blessboard.user_roles
      WHERE id = $1
      LIMIT 1`,
    [roleId]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} roleId
 * @param {string} status
 */
async function updateRoleStatus(client, roleId, status) {
  const r = await client.query(
    `UPDATE blessboard.user_roles
        SET status = $2, updated_at = now()
      WHERE id = $1
      RETURNING id, user_id, organization_id, church_id, branch_id, role_key, status`,
    [roleId, status]
  );
  return r.rows[0] || null;
}

/**
 * Active church-scoped staff roles (HQ + branch admin). Never returns platform_admin.
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
    params.push(roleKey);
    roleClause = ` AND ur.role_key = $${params.length}`;
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
    `SELECT ur.id, ur.user_id, ur.organization_id, ur.church_id, ur.branch_id,
            ur.role_key, ur.status, ur.created_at, ur.updated_at,
            u.email_display, u.email_normalized, u.display_name AS user_display_name, u.status AS user_status,
            (u.password_hash IS NOT NULL) AS has_usable_password,
            u.password_changed_at,
            b.branch_key, b.display_name AS branch_display_name,
            COUNT(*) OVER()::int AS total_count
       FROM blessboard.user_roles ur
       INNER JOIN blessboard.users u ON u.id = ur.user_id
       LEFT JOIN blessboard.branches b ON b.id = ur.branch_id
      WHERE ur.organization_id = $1
        AND ur.church_id = $2
        AND ur.status = 'active'
        AND ur.role_key IN ('church_hq_admin', 'branch_admin')
        ${roleClause}
        ${searchClause}
      ORDER BY ur.role_key ASC, u.display_name ASC NULLS LAST, u.email_normalized ASC
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
        COUNT(*) FILTER (WHERE role_key = 'church_hq_admin')::int AS hq_admins,
        COUNT(*) FILTER (WHERE role_key = 'branch_admin')::int AS branch_admins
       FROM blessboard.user_roles
      WHERE organization_id = $1
        AND church_id = $2
        AND status = 'active'
        AND role_key IN ('church_hq_admin', 'branch_admin')`,
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
 * @param {{ query: Function }} client
 * @param {string} userId
 */
async function revokeAllSessionsForUser(client, userId) {
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
 * Read-only platform_admin role inventory (no secrets).
 * @param {{ query: Function }} client
 */
async function listPlatformAdministrators(client) {
  const r = await client.query(
    `SELECT DISTINCT
        u.id,
        u.display_name,
        u.email_normalized,
        u.status AS account_status,
        ur.role_key AS role_code,
        ur.status AS role_status,
        u.created_at,
        u.last_login_at
       FROM blessboard.users u
       INNER JOIN blessboard.user_roles ur ON ur.user_id = u.id
      WHERE ur.role_key = 'platform_admin'
      ORDER BY u.created_at ASC`
  );
  return r.rows;
}

/**
 * Prefer an active platform_admin org scope for audit; else any active role org.
 * @param {{ query: Function }} client
 * @param {string} userId
 */
async function findAuditOrganizationIdForUser(client, userId) {
  const r = await client.query(
    `SELECT organization_id
       FROM blessboard.user_roles
      WHERE user_id = $1
        AND status = 'active'
      ORDER BY CASE WHEN role_key = 'platform_admin' THEN 0 ELSE 1 END,
               created_at ASC
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
       FROM blessboard.user_roles
      WHERE user_id = $1
        AND role_key = 'platform_admin'
        AND status = 'active'
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
  insertRole,
  updateRoleStatus,
  listChurchStaffRoles,
  countActiveChurchStaffRoles,
  touchLastLogin,
  updateUserPasswordHash,
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
