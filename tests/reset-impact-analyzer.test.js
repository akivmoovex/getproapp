"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeResetImpact } = require("../src/platform/services/resetImpactAnalyzer");

const base = {
  deploymentEnvironment: "testing",
  databaseIdentity: { allowlisted: true, environment: "testing" },
  isPlatformSuperAdmin: true,
  tenants: [
    { id: "bb-a", product: "blessboard" },
    { id: "bb-b", product: "blessboard" },
    { id: "ac-a", product: "activeclinic" },
  ],
  records: [
    { id: "r1", tenantId: "bb-a" },
    { id: "r2", tenantId: "bb-b" },
    { id: "r3", tenantId: "ac-a" },
  ],
  sessions: [
    { id: "s1", tenantId: "bb-a" },
    { id: "s2", tenantId: "bb-b" },
    { id: "admin", shared: true },
  ],
  tokens: [{ id: "t1", tenantId: "bb-a" }, { id: "t2", tenantId: "ac-a" }],
  jobs: [{ id: "j1", tenantId: "bb-a" }, { id: "shared-job", shared: true }],
  media: [{ id: "m1", tenantId: "bb-a" }, { id: "shared-media", shared: true }],
};

test("selected scope isolates tenants and protects shared records", () => {
  const result = analyzeResetImpact({ ...base, scope: "selected_blessboard_tenant", selectedTenantId: "bb-a" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.affectedTenants.map((t) => t.id), ["bb-a"]);
  assert.equal(result.records.find((r) => r.id === "r1").classification, "AFFECTED");
  assert.equal(result.records.find((r) => r.id === "r2").classification, "UNAFFECTED");
  assert.equal(result.sessions.find((s) => s.id === "admin").classification, "BLOCKED");
  assert.equal(result.databaseMutation, false);
});

test("shared jobs and media are blocked, including full scope", () => {
  const result = analyzeResetImpact({ ...base, scope: "full_test_database" });
  assert.equal(result.jobs.find((j) => j.id === "shared-job").classification, "BLOCKED");
  assert.equal(result.media.find((m) => m.id === "shared-media").classification, "BLOCKED");
  assert.deepEqual(result.destructiveActions, []);
});

test("environment, identity, role, scope and identifier gates fail closed", () => {
  assert.equal(analyzeResetImpact({ ...base, scope: "full_test_database", deploymentEnvironment: "production" }).reason, "deployment_env_not_testing");
  assert.equal(analyzeResetImpact({ ...base, scope: "full_test_database", databaseIdentity: { allowlisted: false } }).reason, "database_identity_not_verified");
  assert.equal(analyzeResetImpact({ ...base, scope: "full_test_database", isPlatformSuperAdmin: false }).reason, "platform_super_admin_required");
  assert.equal(analyzeResetImpact({ ...base, scope: "bad_scope" }).reason, "scope_not_allowlisted");
  assert.equal(analyzeResetImpact({ ...base, scope: "selected_blessboard_tenant", selectedTenantId: "x;drop" }).reason, "tenant_id_invalid");
});
