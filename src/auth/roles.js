/** Admin roles (stored in admin_users.role). */
const ROLES = {
  SUPER_ADMIN: "super_admin",
  TENANT_MANAGER: "tenant_manager",
  /** Customer support: CRM + intake + directory validation; sees price estimates (with tenant admin / super admin). */
  CSR: "csr",
  TENANT_EDITOR: "tenant_editor",
  TENANT_AGENT: "tenant_agent",
  TENANT_VIEWER: "tenant_viewer",
  /** Read-only demo / end-user console (same effective permissions as tenant_viewer). */
  END_USER: "end_user",
  /** Pay-run finance: read-only (finance dashboard + finance detail). */
  FINANCE_VIEWER: "finance_viewer",
  /** Pay-run finance: reverse/correct payment ledger lines (policy + routes). */
  FINANCE_OPERATOR: "finance_operator",
  /** Pay-run finance: soft-close runs; reversal window override; includes operator-level actions. */
  FINANCE_MANAGER: "finance_manager",
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
  const n = normalizeRole(role);
  return n === ROLES.TENANT_VIEWER || n === ROLES.END_USER;
}

/** Create/update/delete articles (and other managed content): super admin + tenant admin only. */
function canManageArticles(role) {
  const n = normalizeRole(role);
  return n === ROLES.SUPER_ADMIN || n === ROLES.TENANT_MANAGER;
}

/** Can edit directory data (categories, companies, leads actions). */
function canEditDirectoryData(role) {
  const n = normalizeRole(role);
  return (
    n === ROLES.SUPER_ADMIN ||
    n === ROLES.TENANT_MANAGER ||
    n === ROLES.CSR ||
    n === ROLES.TENANT_EDITOR
  );
}

/** Can create/update/delete admin users for a tenant. */
function canManageTenantUsers(role) {
  const n = normalizeRole(role);
  return n === ROLES.SUPER_ADMIN || n === ROLES.TENANT_MANAGER;
}

/** Directory service-provider categories (tenant-scoped CRUD in admin). Super admin + tenant admin only. */
function canManageServiceProviderCategories(role) {
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
    n === ROLES.CSR ||
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
    n === ROLES.CSR ||
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
    n === ROLES.CSR ||
    n === ROLES.TENANT_EDITOR ||
    n === ROLES.TENANT_AGENT
  );
}

/** Region contact / business settings (admin Settings tab). */
function canAccessTenantSettings(role) {
  const n = normalizeRole(role);
  return n === ROLES.SUPER_ADMIN || n === ROLES.TENANT_MANAGER;
}

/** Settings hub (grid of directory / admin tools). Not for read-only viewers. */
function canAccessSettingsHub(role) {
  if (isTenantViewer(role)) return false;
  const n = normalizeRole(role);
  return (
    n === ROLES.SUPER_ADMIN ||
    n === ROLES.TENANT_MANAGER ||
    n === ROLES.CSR ||
    n === ROLES.TENANT_EDITOR ||
    n === ROLES.TENANT_AGENT
  );
}

/**
 * Intake estimated budget / price line (admin + API-derived displays). Not for service provider portal or end-client views.
 * CSR, tenant admin (manager), and super admin only.
 */
function canViewIntakePriceEstimation(role) {
  const n = normalizeRole(role);
  return n === ROLES.SUPER_ADMIN || n === ROLES.TENANT_MANAGER || n === ROLES.CSR;
}

/** Internal deal pricing + CSR-style validation actions (same role set as price estimation). */
function canValidateDeals(role) {
  return canViewIntakePriceEstimation(role);
}

/** Tenant manager (or super admin): emphasize tenant-wide intake / lead pipeline visibility. */
function canViewTenantWideLeadProgress(role) {
  const n = normalizeRole(role);
  return n === ROLES.SUPER_ADMIN || n === ROLES.TENANT_MANAGER;
}

/** Account manager + field-agent submission linkage on companies (admin-only; tenant manager + super admin). */
function canMutateCompanyFieldAgentLinkage(role) {
  const n = normalizeRole(role);
  return n === ROLES.SUPER_ADMIN || n === ROLES.TENANT_MANAGER;
}

/** Manual status corrections / dispute resolution on field-agent submissions (analytics + audit). Manager or super admin only. */
function canCorrectFieldAgentSubmissions(role) {
  const n = normalizeRole(role);
  return n === ROLES.SUPER_ADMIN || n === ROLES.TENANT_MANAGER;
}

/** Any pay-run finance UI (nav + gated routes): tenant managers / super admin, or finance_* roles. */
function canAccessPayRunSection(role) {
  if (canManageTenantUsers(role)) return true;
  const n = normalizeRole(role);
  return n === ROLES.FINANCE_VIEWER || n === ROLES.FINANCE_OPERATOR || n === ROLES.FINANCE_MANAGER;
}

function isPayRunFinanceViewerOnly(role) {
  return normalizeRole(role) === ROLES.FINANCE_VIEWER;
}

/** Create/lock/approve pay runs, record payments, previews — tenant admin + super admin only. */
function canPayRunWorkflowWrite(role) {
  return canManageTenantUsers(role);
}

/** Reverse/correct ledger lines. */
function canPayRunReverseOrCorrect(role) {
  if (canManageTenantUsers(role)) return true;
  const n = normalizeRole(role);
  return n === ROLES.FINANCE_OPERATOR || n === ROLES.FINANCE_MANAGER;
}

/** Soft-close pay runs (mark closed). */
function canPayRunCloseRun(role) {
  if (canManageTenantUsers(role)) return true;
  return normalizeRole(role) === ROLES.FINANCE_MANAGER;
}

/** Bypass reversal-age window (routes pass to repo). */
function canPayRunOverrideReversalWindow(role) {
  if (canManageTenantUsers(role)) return true;
  return normalizeRole(role) === ROLES.FINANCE_MANAGER;
}

/** Lock/unlock accounting periods (month). */
function canManageAccountingPeriodLock(role) {
  return isSuperAdmin(role) || normalizeRole(role) === ROLES.FINANCE_MANAGER;
}

/** Approve pay run for payout (finance gate before ledger payout / mark paid). Tenant admins + finance operator/manager. */
function canApprovePayrunForPayout(role) {
  if (canPayRunWorkflowWrite(role)) return true;
  const n = normalizeRole(role);
  return n === ROLES.FINANCE_OPERATOR || n === ROLES.FINANCE_MANAGER;
}

/**
 * “New Project” intake (admin): search clients, create clients, create projects.
 * GET access mirrors CRM (all tenant roles incl. viewer). Mutations use canMutateCrm (excludes tenant_viewer).
 * Decision: tenant_viewer stays read-only for intake writes (same as CRM tasks/comments) so support agents
 * with viewer role cannot create clients/projects; only manager/editor/agent/super_admin can. Unrelated
 * admin POSTs remain guarded by requireDirectoryEditor / requireNotViewer as before.
 */
function canAccessClientProjectIntake(role) {
  return canAccessCrm(role);
}

function canMutateClientProjectIntake(role) {
  return canMutateCrm(role);
}

module.exports = {
  ROLES,
  ALL_ROLES,
  normalizeRole,
  isSuperAdmin,
  isTenantViewer,
  canManageArticles,
  canEditDirectoryData,
  canManageTenantUsers,
  canAccessSuperConsole,
  canAccessCrm,
  canMutateCrm,
  canClaimCrmTasks,
  canAccessTenantSettings,
  canAccessSettingsHub,
  canAccessClientProjectIntake,
  canMutateClientProjectIntake,
  canManageServiceProviderCategories,
  canViewIntakePriceEstimation,
  canValidateDeals,
  canViewTenantWideLeadProgress,
  canMutateCompanyFieldAgentLinkage,
  canCorrectFieldAgentSubmissions,
  canAccessPayRunSection,
  isPayRunFinanceViewerOnly,
  canPayRunWorkflowWrite,
  canPayRunReverseOrCorrect,
  canPayRunCloseRun,
  canPayRunOverrideReversalWindow,
  canManageAccountingPeriodLock,
  canApprovePayrunForPayout,
};
