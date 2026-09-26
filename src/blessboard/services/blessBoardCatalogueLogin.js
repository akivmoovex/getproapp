"use strict";

/**
 * BlessBoard catalogue-only login helpers (V2.02).
 * Session eligibility uses user_role_assignments — not blessboard.user_roles.
 * Tables may still exist for rollback; runtime must not require them.
 */

const rbacRepo = require("../repositories/blessBoardRbacRepository");

/** Scopes that establish a staff login session. */
const LOGIN_ELIGIBLE_SCOPE_TYPES = Object.freeze([
  "platform",
  "organisation",
  "church",
  "branch",
]);

/**
 * Legacy → catalogue migration map (test users / invite normalization).
 * Do not invent elevated grants beyond these pairs.
 */
const LEGACY_TO_CATALOGUE_ROLE = Object.freeze({
  platform_admin: "platform_administrator",
  church_hq_admin: "organisation_administrator",
  branch_admin: "branch_administrator",
});

/**
 * Catalogue role → preferred portal / session chrome key.
 */
const CATALOGUE_SESSION_PRIORITY = Object.freeze([
  "platform_administrator",
  "organisation_administrator",
  "church_system_administrator",
  "branch_administrator",
  "branch_pastor",
]);

const PORTAL_FOR_CATALOGUE_ROLE = Object.freeze({
  platform_administrator: "platform_administrator",
  organisation_administrator: "organisation_administrator",
  church_system_administrator: "church_system_administrator",
  branch_administrator: "branch_administrator",
  branch_pastor: "branch_pastor",
  website_editor: "website_editor",
  website_publisher: "website_publisher",
  communications_officer: "communications_officer",
  auditor: "auditor",
  finance_director: "finance_restricted",
  finance_officer: "finance_restricted",
  finance_approver: "finance_restricted",
});

const PORTAL_PATHS_CATALOGUE = Object.freeze({
  platform_administrator: "/hq",
  organisation_administrator: "/hq",
  church_system_administrator: "/hq",
  branch_administrator: "/branch-admin",
  branch_pastor: "/branch-admin",
  website_editor: "/account",
  website_publisher: "/account",
  communications_officer: "/account",
  auditor: "/account",
  finance_restricted: "/account",
  member: "/member",
  account: "/account",
});

/**
 * Normalize invite / seed role keys to catalogue keys.
 * @param {string} roleKey
 */
function normalizeToCatalogueRoleKey(roleKey) {
  const key = String(roleKey || "").trim().toLowerCase();
  if (!key) return null;
  if (LEGACY_TO_CATALOGUE_ROLE[key]) return LEGACY_TO_CATALOGUE_ROLE[key];
  return key;
}

/**
 * @param {object} assignment mapped from rbacRepo
 */
function assignmentToSessionRole(assignment) {
  if (!assignment) return null;
  const roleKey = String(assignment.roleKey || "");
  const scopeType = String(assignment.scopeType || "");
  let churchId = assignment.churchId || null;
  let branchId = null;
  if (scopeType === "branch") {
    branchId = assignment.scopeId || null;
  } else if (scopeType === "church" && !churchId) {
    churchId = assignment.scopeId || null;
  }
  return {
    role_key: roleKey,
    organization_id: assignment.organizationId,
    church_id: churchId,
    branch_id: branchId,
    scope_type: scopeType,
    scope_id: assignment.scopeId || null,
    assignment_id: assignment.id,
    source: "catalogue",
  };
}

/**
 * Active, unexpired, login-eligible catalogue assignments.
 * @param {{ query: Function }} client
 * @param {string} userId
 * @param {string|null} requireOrganizationId
 */
async function listCatalogueLoginRolesForUser(client, userId, requireOrganizationId) {
  const now = Date.now();
  const assignments = await rbacRepo.listActiveAssignmentsForUser(
    client,
    userId,
    requireOrganizationId || undefined
  );
  const out = [];
  for (const a of assignments || []) {
    if (!LOGIN_ELIGIBLE_SCOPE_TYPES.includes(String(a.scopeType))) continue;
    if (a.expiresAt) {
      const t =
        a.expiresAt instanceof Date
          ? a.expiresAt.getTime()
          : Date.parse(String(a.expiresAt));
      if (Number.isFinite(t) && t <= now) continue;
    }
    if (
      requireOrganizationId &&
      String(a.scopeType) !== "platform" &&
      String(a.organizationId) !== String(requireOrganizationId)
    ) {
      continue;
    }
    const mapped = assignmentToSessionRole(a);
    if (mapped) out.push(mapped);
  }
  return out;
}

/**
 * Prefer HQ / branch / platform catalogue roles for session chrome.
 * @param {Array<object>} roles
 * @param {string|null} requireOrganizationId
 */
function preferCatalogueSessionRole(roles, requireOrganizationId) {
  const list = Array.isArray(roles) ? roles.slice() : [];
  if (!list.length) return null;
  const scoped = requireOrganizationId
    ? list.filter(
        (r) =>
          String(r.role_key) === "platform_administrator" ||
          String(r.organization_id) === String(requireOrganizationId)
      )
    : list;
  const pool = scoped.length ? scoped : list;
  for (const key of CATALOGUE_SESSION_PRIORITY) {
    const hit = pool.find((r) => String(r.role_key) === key);
    if (hit) return hit;
  }
  return pool[0];
}

/**
 * Whether a catalogue role key is treated as HQ-capable for invite/portal.
 * @param {string} roleKey
 */
function isCatalogueHqRole(roleKey) {
  const key = String(roleKey || "");
  return (
    key === "organisation_administrator" ||
    key === "church_system_administrator" ||
    key === "platform_administrator"
  );
}

/**
 * @param {string} roleKey
 */
function isCatalogueBranchRole(roleKey) {
  const key = String(roleKey || "");
  return key === "branch_administrator" || key === "branch_pastor";
}

/**
 * @param {string} roleKey
 */
function portalKeyForCatalogueRole(roleKey) {
  const key = String(roleKey || "");
  if (PORTAL_FOR_CATALOGUE_ROLE[key]) return PORTAL_FOR_CATALOGUE_ROLE[key];
  if (isCatalogueHqRole(key)) return "organisation_administrator";
  if (isCatalogueBranchRole(key)) return "branch_administrator";
  return key || "account";
}

/**
 * Default scope for a catalogue invite/seed role.
 * @param {string} catalogueRoleKey
 * @param {{ organizationId: string, churchId: string, branchId?: string|null }} scope
 */
function defaultScopeForCatalogueRole(catalogueRoleKey, scope) {
  const key = String(catalogueRoleKey || "");
  if (key === "platform_administrator") {
    return { scopeType: "platform", scopeId: null, churchId: null };
  }
  if (key === "organisation_administrator") {
    return {
      scopeType: "organisation",
      scopeId: scope.organizationId,
      churchId: scope.churchId || null,
    };
  }
  if (key === "church_system_administrator") {
    return {
      scopeType: "church",
      scopeId: scope.churchId,
      churchId: scope.churchId,
    };
  }
  if (isCatalogueBranchRole(key)) {
    return {
      scopeType: "branch",
      scopeId: scope.branchId || null,
      churchId: scope.churchId,
    };
  }
  return {
    scopeType: "church",
    scopeId: scope.churchId,
    churchId: scope.churchId,
  };
}

module.exports = {
  LOGIN_ELIGIBLE_SCOPE_TYPES,
  LEGACY_TO_CATALOGUE_ROLE,
  CATALOGUE_SESSION_PRIORITY,
  PORTAL_FOR_CATALOGUE_ROLE,
  PORTAL_PATHS_CATALOGUE,
  normalizeToCatalogueRoleKey,
  assignmentToSessionRole,
  listCatalogueLoginRolesForUser,
  preferCatalogueSessionRole,
  isCatalogueHqRole,
  isCatalogueBranchRole,
  portalKeyForCatalogueRole,
  defaultScopeForCatalogueRole,
};
