"use strict";

const ALLOWED_SCOPES = Object.freeze([
  "selected_blessboard_tenant",
  "selected_activeclinic_tenant",
  "all_blessboard_test_tenants",
  "all_activeclinic_test_tenants",
  "full_test_database",
]);

const BLOCKED = "BLOCKED";

function normalizeId(value) {
  const id = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{1,120}$/.test(id) ? id : null;
}

function selectedTenants(scope, tenants, selectedTenantId) {
  if (scope === "selected_blessboard_tenant" || scope === "selected_activeclinic_tenant") {
    const id = normalizeId(selectedTenantId);
    if (!id) return { error: "tenant_id_invalid" };
    const tenant = tenants.find((item) => item.id === id);
    if (!tenant || tenant.product !== (scope.includes("blessboard") ? "blessboard" : "activeclinic")) {
      return { error: "tenant_not_in_scope" };
    }
    return { tenants: [tenant] };
  }
  if (scope === "all_blessboard_test_tenants") {
    return { tenants: tenants.filter((item) => item.product === "blessboard") };
  }
  if (scope === "all_activeclinic_test_tenants") {
    return { tenants: tenants.filter((item) => item.product === "activeclinic") };
  }
  return { tenants: tenants.slice() };
}

function analyzeResetImpact(input = {}) {
  const scope = String(input.scope || "").trim();
  if (!ALLOWED_SCOPES.includes(scope)) {
    return { ok: false, status: "invalid_input", reason: "scope_not_allowlisted" };
  }
  if (String(input.deploymentEnvironment || "").toLowerCase() !== "testing") {
    return { ok: false, status: "blocked", reason: "deployment_env_not_testing" };
  }
  if (!input.databaseIdentity || input.databaseIdentity.allowlisted !== true ||
      String(input.databaseIdentity.environment || "").toLowerCase() !== "testing") {
    return { ok: false, status: "blocked", reason: "database_identity_not_verified" };
  }
  if (input.isPlatformSuperAdmin !== true) {
    return { ok: false, status: "forbidden", reason: "platform_super_admin_required" };
  }

  const tenants = Array.isArray(input.tenants) ? input.tenants : [];
  const selected = selectedTenants(scope, tenants, input.selectedTenantId);
  if (selected.error) return { ok: false, status: "invalid_input", reason: selected.error };
  const ids = new Set(selected.tenants.map((item) => item.id));
  const belongs = (item) => item.tenantId && ids.has(item.tenantId);
  const classify = (items, kind) => (Array.isArray(items) ? items : []).map((item) => ({
    id: item.id || null,
    kind,
    tenantId: item.tenantId || null,
    classification: item.shared || !item.tenantId ? BLOCKED : belongs(item) ? "AFFECTED" : "UNAFFECTED",
    recordCount: Number.isInteger(item.recordCount) ? item.recordCount : 1,
  }));

  const sessions = classify(input.sessions, "session");
  const tokens = classify(input.tokens, "token");
  const jobs = classify(input.jobs, "job");
  const media = classify(input.media, "media");
  const records = classify(input.records, "record");
  return {
    ok: true,
    dryRun: true,
    scope,
    affectedTenants: selected.tenants.map(({ id, product }) => ({ id, product })),
    records,
    sessions,
    tokens,
    jobs,
    media,
    protectedRecords: [
      ...sessions, ...tokens, ...jobs, ...media, ...records,
    ].filter((item) => item.classification === BLOCKED),
    destructiveActions: [],
    databaseMutation: false,
    sessionInvalidation: false,
    jobCancellation: false,
    mediaDeletion: false,
  };
}

module.exports = { ALLOWED_SCOPES, analyzeResetImpact };
