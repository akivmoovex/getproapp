"use strict";

/**
 * Prevent removing the last viable Church HQ administrator.
 *
 * Protected grants (catalogue only, V2.02):
 * - `organisation_administrator` and `church_system_administrator`
 *   at organisation or church scope (`blessboard.user_role_assignments`)
 *
 * A holder must also have users.status in ('active', 'invited').
 */

const REASON = Object.freeze({
  LAST_HQ_ADMIN: "last_hq_admin",
  INVALID_INPUT: "ids",
});

const CATALOGUE_HQ_ADMIN_ROLE_KEYS = Object.freeze([
  "organisation_administrator",
  "church_system_administrator",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isCatalogueHqAdminRole(roleKey) {
  return CATALOGUE_HQ_ADMIN_ROLE_KEYS.includes(String(roleKey || ""));
}

function isHqAdminGrant(input) {
  const roleKey = String((input && input.roleKey) || "");
  if (!isCatalogueHqAdminRole(roleKey)) return false;
  const scopeType = String((input && input.scopeType) || "");
  return scopeType === "organisation" || scopeType === "church" || !scopeType;
}

/**
 * Distinct active users who can administer this church at HQ level.
 */
async function countActiveHqAdmins(db, organizationId, churchId) {
  const org = String(organizationId || "");
  const church = String(churchId || "");
  if (!UUID_RE.test(org) || !UUID_RE.test(church)) return 0;
  const result = await db.query(
    `SELECT COUNT(DISTINCT a.user_id)::int AS cnt
       FROM blessboard.user_role_assignments a
       JOIN blessboard.roles r ON r.id = a.role_id
       JOIN blessboard.users u ON u.id = a.user_id
      WHERE a.organization_id = $1
        AND a.status = 'active'
        AND a.revoked_at IS NULL
        AND (a.expires_at IS NULL OR a.expires_at > now())
        AND r.role_key = ANY($3::text[])
        AND a.scope_type IN ('organisation', 'church')
        AND (a.church_id IS NULL OR a.church_id = $2)
        AND u.status IN ('active', 'invited')`,
    [org, church, CATALOGUE_HQ_ADMIN_ROLE_KEYS.slice()]
  );
  return Number(result.rows[0] && result.rows[0].cnt) || 0;
}

async function userHoldsHqAdmin(db, input) {
  const remaining = await countUserHqAdminGrantsExcluding(db, input);
  return remaining > 0;
}

/**
 * HQ-admin grants remaining for this user, optionally excluding the row being revoked.
 */
async function countUserHqAdminGrantsExcluding(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const churchId = String((input && input.churchId) || "");
  const userId = String((input && input.userId) || "");
  if (![organizationId, churchId, userId].every((x) => UUID_RE.test(x))) {
    return 0;
  }
  const excludeAssignmentId = String((input && input.excludeAssignmentId) || "");
  const hasExclude = UUID_RE.test(excludeAssignmentId);
  const params = [
    organizationId,
    churchId,
    userId,
    CATALOGUE_HQ_ADMIN_ROLE_KEYS.slice(),
  ];
  let excludeSql = "";
  if (hasExclude) {
    params.push(excludeAssignmentId);
    excludeSql = "AND a.id <> $5";
  }
  const result = await db.query(
    `SELECT COUNT(*)::int AS cnt
       FROM blessboard.user_role_assignments a
       JOIN blessboard.roles r ON r.id = a.role_id
       JOIN blessboard.users u ON u.id = a.user_id
      WHERE a.user_id = $3
        AND a.organization_id = $1
        AND a.status = 'active'
        AND a.revoked_at IS NULL
        AND (a.expires_at IS NULL OR a.expires_at > now())
        AND r.role_key = ANY($4::text[])
        AND a.scope_type IN ('organisation', 'church')
        AND (a.church_id IS NULL OR a.church_id = $2)
        AND u.status IN ('active', 'invited')
        ${excludeSql}`,
    params
  );
  return Number(result.rows[0] && result.rows[0].cnt) || 0;
}

/**
 * Block revoking the last remaining HQ administrator capability for a church.
 * Removing one HQ grant from a user who still has another HQ grant is allowed.
 */
async function assertNotLastHqAdminRemoval(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const churchId = String((input && input.churchId) || "");
  const userId = String((input && input.userId) || "");
  if (![organizationId, churchId, userId].every((x) => UUID_RE.test(x))) {
    return { ok: false, reason: REASON.INVALID_INPUT };
  }
  if (!isHqAdminGrant(input)) {
    return { ok: true, reason: null };
  }
  const remainingForUser = await countUserHqAdminGrantsExcluding(db, input);
  if (remainingForUser > 0) {
    return { ok: true, reason: null };
  }
  const total = await countActiveHqAdmins(db, organizationId, churchId);
  if (total <= 1) {
    return { ok: false, reason: REASON.LAST_HQ_ADMIN };
  }
  return { ok: true, reason: null };
}

module.exports = {
  REASON,
  CATALOGUE_HQ_ADMIN_ROLE_KEYS,
  isCatalogueHqAdminRole,
  isHqAdminGrant,
  countActiveHqAdmins,
  userHoldsHqAdmin,
  countUserHqAdminGrantsExcluding,
  assertNotLastHqAdminRemoval,
};
