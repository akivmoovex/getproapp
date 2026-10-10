const LEGACY = "legacy";
const BLESSBOARD = "blessboard";

const ITEMS = Object.freeze([
  { key: "dashboard", label: "Dashboard", href: "/admin/dashboard", product: LEGACY, desktop: true, mobile: true, active: ["/admin/dashboard"] },
  { key: "leads", label: "Leads", href: "/admin/leads", product: LEGACY, capability: "canAccessCrm", scoped: true, desktop: true, mobile: true, active: ["/admin/leads"] },
  { key: "project_intake", label: "New project", href: "/admin/project-intake", product: LEGACY, capability: "canAccessProjectIntake", scoped: true, desktop: true, mobile: true, active: ["/admin/project-intake"] },
  { key: "projects", label: "Projects", href: "/admin/projects", product: LEGACY, capability: "canAccessProjectIntake", scoped: true, desktop: true, mobile: true, active: ["/admin/projects"] },
  { key: "client_lead_status", label: "Client Lead Status", href: "/admin/client-lead-status", product: LEGACY, capability: "canAccessProjectIntake", scoped: true, desktop: true, mobile: true, active: ["/admin/client-lead-status"] },
  { key: "crm", label: "CRM", href: "/admin/crm", product: LEGACY, capability: "canAccessCrm", scoped: true, desktop: true, mobile: true, active: ["/admin/crm"] },
  { key: "field_agent_analytics", label: "Field agents", href: "/admin/field-agent-analytics", product: LEGACY, capability: "canAccessCrm", scoped: true, desktop: true, mobile: true, active: ["/admin/field-agent-analytics"] },
  { key: "field_agent_pay_runs", label: "Pay runs", href: "/admin/field-agent-pay-runs", product: LEGACY, capability: "canAccessPayRunSection", scoped: true, desktop: true, mobile: true, active: ["/admin/field-agent-pay-runs"] },
  { key: "field_agent_payout_batches", label: "Payout batches", href: "/admin/field-agent-payout-batches", product: LEGACY, capability: "canAccessPayRunSection", scoped: true, desktop: true, mobile: true, active: ["/admin/field-agent-payout-batches"] },
  { key: "field_agent_bank_reconciliation", label: "Bank reconciliation", href: "/admin/field-agent-bank-reconciliation", product: LEGACY, capability: "canAccessPayRunSection", scoped: true, desktop: true, mobile: true, active: ["/admin/field-agent-bank-reconciliation"] },
  { key: "field_agent_payout_finance", label: "Payout review", href: "/admin/field-agent-pay-runs/finance-dashboard", product: LEGACY, capability: "canAccessPayRunSection", scoped: true, desktop: true, mobile: true, active: ["/admin/field-agent-pay-runs/finance-dashboard"] },
  { key: "field_agent_disputes", label: "Disputes", href: "/admin/field-agent-disputes", product: LEGACY, capability: "canManageUsers", scoped: true, desktop: true, mobile: true, active: ["/admin/field-agent-disputes"] },
  { key: "field_agent_adjustments", label: "Adjustments", href: "/admin/field-agent-adjustments", product: LEGACY, capability: "canManageUsers", scoped: true, desktop: true, mobile: true, active: ["/admin/field-agent-adjustments"] },
  { key: "articles", label: "Articles", href: "/admin/content?kind=article&edit=1", product: LEGACY, capability: "canManageArticles", scoped: true, desktop: true, mobile: true, active: ["/admin/content"] },
  { key: "tenant_contact", label: "Contact", href: "/admin/settings/tenant", product: LEGACY, capability: "canAccessTenantSettings", scoped: true, desktop: true, mobile: true, active: ["/admin/settings/tenant"] },
  { key: "settings", label: "Settings", href: "/admin/settings", product: LEGACY, capability: "canAccessSettingsHub", scoped: true, desktop: true, mobile: true, active: ["/admin/settings"] },
  { key: "super", label: "Super", href: "/admin/super", product: LEGACY, role: "super", desktop: true, mobile: true, active: ["/admin/super"] },
  { key: "super_users", label: "All users", href: "/admin/super/users", product: LEGACY, role: "super", desktop: true, mobile: true, active: ["/admin/super/users"] },
  { key: "finance_summary", label: "Finance summary", href: "/admin/finance/summary", product: LEGACY, role: "super", desktop: true, mobile: true, active: ["/admin/finance/summary"] },
  { key: "finance_cfo", label: "Finance (CFO)", href: "/admin/finance/cfo", product: LEGACY, role: "super", desktop: true, mobile: true, active: ["/admin/finance/cfo"] },
  { key: "db", label: "DB", href: "/admin/db", product: LEGACY, role: "super", desktop: true, mobile: true, active: ["/admin/db"] },
  { key: "home", label: "Dashboard", href: "/admin", product: BLESSBOARD, icon: "dashboard", desktop: true, mobile: true, active: ["/admin"] },
  { key: "organizations", label: "Organisations", href: "/admin/organizations", product: BLESSBOARD, icon: "corporate_fare", desktop: true, mobile: true, active: ["/admin/organizations", "/admin/churches"] },
  { key: "users", label: "Users", href: "/admin/users", product: BLESSBOARD, icon: "group", desktop: true, mobile: true, active: ["/admin/users", "/admin/church/users"] },
  { key: "members", label: "Members", href: "/admin/members", product: BLESSBOARD, icon: "badge", desktop: true, mobile: true, active: ["/admin/members", "/admin/church/members"] },
  { key: "domains", label: "Domains and links", href: "/admin/domains", product: BLESSBOARD, icon: "language", desktop: true, mobile: true, active: ["/admin/domains"] },
  { key: "roles", label: "Roles and access", href: "/admin/roles", product: BLESSBOARD, icon: "admin_panel_settings", desktop: true, mobile: true, active: ["/admin/roles", "/admin/church/roles"] },
  { key: "settings", label: "Settings", href: "/admin/settings", product: BLESSBOARD, icon: "settings", desktop: true, mobile: true, active: ["/admin/settings"] },
  { key: "system", label: "System", href: "/admin/system/deployments", product: BLESSBOARD, icon: "monitor_heart", desktop: true, mobile: false, active: ["/admin/system"] },
  { key: "deployments", label: "Deployments", href: "/admin/system/deployments", product: BLESSBOARD, icon: "dns", parent: "system", desktop: true, mobile: true, active: ["/admin/system/deployments"] },
  { key: "account", label: "Account", href: "/admin/account", product: BLESSBOARD, icon: "person", desktop: true, mobile: true, active: ["/admin/account"] },
  { key: "branches", label: "Branches", href: "/admin/church/branches", product: BLESSBOARD, icon: "account_tree", desktop: true, mobile: true, active: ["/admin/church/branches"] },
  { key: "audit", label: "Audit log", href: "/admin/church/audit", product: BLESSBOARD, icon: "history", desktop: true, mobile: true, active: ["/admin/church/audit"] },
  { key: "jobs", label: "Background jobs", href: "/admin/church/jobs", product: BLESSBOARD, icon: "schedule", desktop: true, mobile: true, active: ["/admin/church/jobs"] },
  { key: "notifications", label: "Notifications", href: "/admin/church/notification-templates", product: BLESSBOARD, icon: "mail", desktop: true, mobile: true, active: ["/admin/church/notification-templates"] },
  { key: "security", label: "Security", href: "/admin/church/security", product: BLESSBOARD, icon: "security", desktop: true, mobile: true, active: ["/admin/church/security"] },
  { key: "support", label: "Support", href: "/admin/diagnostics", product: BLESSBOARD, icon: "monitor_heart", desktop: true, mobile: true, active: ["/admin/diagnostics"] },
  { key: "releases", label: "Releases", href: "/admin/releases", product: BLESSBOARD, icon: "new_releases", desktop: true, mobile: true, active: ["/admin/releases"] },
  { key: "pilot_flags", label: "Pilot flags", href: "/admin/church/pilot-flags", product: BLESSBOARD, icon: "toggle_on", desktop: true, mobile: true, active: ["/admin/church/pilot-flags"] },
  { key: "search", label: "Search", href: "/admin/church/search", product: BLESSBOARD, icon: "search", desktop: true, mobile: true, active: ["/admin/church/search"] },
  { key: "reset_requests", label: "Reset requests", href: "/admin/church/reset-requests", product: BLESSBOARD, icon: "lock_reset", desktop: true, mobile: true, active: ["/admin/church/reset-requests"] },
  { key: "new_church", label: "New church", href: "/admin/churches/new", product: BLESSBOARD, icon: "add", desktop: true, mobile: true, active: ["/admin/churches/new"] },
]);

function normalizePath(path = "") {
  const raw = String(path).split("?")[0].split("#")[0] || "/";
  return raw.length > 1 ? raw.replace(/\/+$/, "") : raw;
}

function isActiveNavigationItem(item, path) {
  const current = normalizePath(path);
  return (item.active || [item.href]).some((prefix) => {
    const target = normalizePath(prefix);
    return current === target || current.startsWith(`${target}/`);
  });
}

function canShow(item, context = {}) {
  if (item.product !== context.product) return false;
  if (item.scoped && !context.tenantScoped) return false;
  if (item.role === "super" && !context.isSuper) return false;
  if (item.capability && !context[item.capability]) return false;
  return true;
}

function getAdminNavigation(product, context = {}, viewport = "desktop") {
  return ITEMS.filter((item) => canShow(item, { ...context, product }))
    .filter((item) => item[viewport] !== false)
    .map((item) => ({ ...item, isActive: isActiveNavigationItem(item, context.path) }));
}

module.exports = {
  ADMIN_NAVIGATION_ITEMS: ITEMS,
  getAdminNavigation,
  isActiveNavigationItem,
  normalizePath,
};

