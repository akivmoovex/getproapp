const { isSuperAdmin, canEditDirectoryData } = require("./roles");
const { TENANT_ZM } = require("./tenantIds");

/**
 * Draft preview on public routes (?preview=1) — logged-in directory editors only.
 */
function canPreviewDraft(req, tenantId) {
  const u = req.session && req.session.adminUser;
  if (!u || !canEditDirectoryData(u.role)) return false;
  const tid = Number(tenantId);
  if (isSuperAdmin(u.role)) {
    const scope = req.session.adminTenantScope;
    if (scope != null && Number(scope) > 0) return Number(scope) === tid;
    return tid === TENANT_ZM;
  }
  return Number(u.tenantId) === tid;
}

module.exports = { canPreviewDraft };
