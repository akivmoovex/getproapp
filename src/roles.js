/** Admin roles (stored in admin_users.role). */
const ROLES = {
  SUPER_ADMIN: "super_admin",
  TENANT_MANAGER: "tenant_manager",
  TENANT_EDITOR: "tenant_editor",
  TENANT_AGENT: "tenant_agent",
  TENANT_VIEWER: "tenant_viewer",
};

const ALL_ROLES = Object.values(ROLES);

function normalizeRole(r) {
  const s = String(r || "").toLowerCase().trim();
  return ALL_ROLES.includes(s) ? s : ROLES.TENANT_EDITOR;
}

/** Super admin can manage all tenants. */
function isSuperAdmin(role) {
  return normalizeRole(role) === ROLES.SUPER_ADMIN;
}

/** Viewer: read-only reports (dashboard + leads). */
function isTenantViewer(role) {
  return normalizeRole(role) === ROLES.TENANT_VIEWER;
}

/** Can edit directory data (categories, companies, leads actions). */
function canEditDirectoryData(role) {
  const n = normalizeRole(role);
  return (
    n === ROLES.SUPER_ADMIN ||
    n === ROLES.TENANT_MANAGER ||
    n === ROLES.TENANT_EDITOR
  );
}

/** Can create/update/delete admin users for a tenant. */
function canManageTenantUsers(role) {
  const n = normalizeRole(role);
  return n === ROLES.SUPER_ADMIN || n === ROLES.TENANT_MANAGER;
}

/** Can access super-admin tenant console. */
function canAccessSuperConsole(role) {
  return normalizeRole(role) === ROLES.SUPER_ADMIN;
}

/** CRM: any logged-in tenant user (incl. viewer read-only). Super admin included. */
function canAccessCrm(role) {
  const n = normalizeRole(role);
  return (
    n === ROLES.SUPER_ADMIN ||
    n === ROLES.TENANT_MANAGER ||
    n === ROLES.TENANT_EDITOR ||
    n === ROLES.TENANT_AGENT ||
    n === ROLES.TENANT_VIEWER
  );
}

/** CRM: claim tasks, change status (not read-only viewer). */
function canMutateCrm(role) {
  const n = normalizeRole(role);
  return (
    n === ROLES.SUPER_ADMIN ||
    n === ROLES.TENANT_MANAGER ||
    n === ROLES.TENANT_EDITOR ||
    n === ROLES.TENANT_AGENT
  );
}

/** Can see / claim pool of unassigned tasks (Admin = manager, Agent = editor/agent; not viewer). */
function canClaimCrmTasks(role) {
  const n = normalizeRole(role);
  return (
    n === ROLES.SUPER_ADMIN ||
    n === ROLES.TENANT_MANAGER ||
    n === ROLES.TENANT_EDITOR ||
    n === ROLES.TENANT_AGENT
  );
}

module.exports = {
  ROLES,
  ALL_ROLES,
  normalizeRole,
  isSuperAdmin,
  isTenantViewer,
  canEditDirectoryData,
  canManageTenantUsers,
  canAccessSuperConsole,
  canAccessCrm,
  canMutateCrm,
  canClaimCrmTasks,
};
