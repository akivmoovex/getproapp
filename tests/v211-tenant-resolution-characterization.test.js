"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeCanonicalHostname,
  resolveCanonicalHost,
} = require("../src/platform/config/canonicalHostRegistry");
const {
  resolveRequestCanonicalSite,
} = require("../src/platform/http/resolveRequestHostname");
const {
  createLoadActiveClinicProductContext,
} = require("../src/activeclinic/http/loadActiveClinicProductContext");
const {
  buildBlessBoardTenantContext,
} = require("../src/blessboard/http/buildBlessBoardTenantContext");
const {
  getDeploymentProfile,
  CODE_ACTIVECLINIC_ORG_V6,
  CODE_BLESSBOARD_PRONLINE_TESTING,
} = require("../src/platform/config/deploymentProfiles");
const { getProduct } = require("../src/platform/config/productRegistry");

function requestFor(host, forwardedHost, trustProxy = 1) {
  const headers = {};
  if (forwardedHost !== undefined) headers["x-forwarded-host"] = forwardedHost;
  return {
    headers,
    hostname: host,
    get(name) {
      const key = String(name || "").toLowerCase();
      if (key === "host") return host;
      return headers[key];
    },
    app: {
      get(name) {
        return name === "trust proxy" ? trustProxy : undefined;
      },
    },
  };
}

function responseAndNext() {
  return {
    res: {},
    nextCalled: false,
    next() {
      this.nextCalled = true;
    },
  };
}

test("canonical host registry resolves BB and AC with product/environment identity", () => {
  const bb = resolveCanonicalHost("blessboard.neuniversity.org");
  const ac = resolveCanonicalHost("activeclinic.neuniversity.org");

  assert.equal(bb.ok, true);
  assert.equal(bb.site.productKey, "blessboard");
  assert.equal(bb.site.environment, "testing");
  assert.equal(ac.ok, true);
  assert.equal(ac.site.productKey, "activeclinic");
  assert.equal(ac.site.environment, "testing");
  assert.notEqual(bb.site.sessionCookieName, ac.site.sessionCookieName);
});

test("canonical host resolution rejects unknown, unsupported, and malformed hosts", () => {
  assert.equal(resolveCanonicalHost("unknown.neuniversity.org").code, "UNKNOWN_PLATFORM_HOST");
  assert.equal(resolveCanonicalHost("activeclinic.example.org").code, "UNKNOWN_PLATFORM_HOST");
  assert.equal(normalizeCanonicalHostname("https://blessboard.com/path").code, "malformed_host");
  assert.equal(normalizeCanonicalHostname("blessboard.com@evil.test").code, "malformed_host");
  assert.equal(normalizeCanonicalHostname("blessboard.com evil.test").code, "malformed_host");
});

test("request hostname uses the current trusted proxy contract and exact allowlist", () => {
  const direct = resolveRequestCanonicalSite(
    requestFor("blessboard.neuniversity.org"),
    { env: { NODE_ENV: "production" }, allowTestHostOverride: false }
  );
  assert.equal(direct.ok, true);
  assert.equal(direct.site.productKey, "blessboard");

  const forwarded = resolveRequestCanonicalSite(
    requestFor("internal.proxy", "activeclinic.neuniversity.org", 1),
    { env: { NODE_ENV: "production" }, allowTestHostOverride: false }
  );
  assert.equal(forwarded.ok, true);
  assert.equal(forwarded.site.productKey, "activeclinic");

  const forged = resolveRequestCanonicalSite(
    requestFor("internal.proxy", "activeclinic.neuniversity.org, blessboard.neuniversity.org", 1),
    { env: { NODE_ENV: "production" }, allowTestHostOverride: false }
  );
  // Current contract consumes the first forwarded-host hop when one proxy hop
  // is trusted; later hops are not selected as the product host.
  assert.equal(forged.ok, true);
  assert.equal(forged.site.productKey, "activeclinic");
});

test("deployment profiles preserve product and environment selection", () => {
  const bb = getDeploymentProfile({
    PLATFORM_DEPLOYMENT_CODE: CODE_BLESSBOARD_PRONLINE_TESTING,
    DEPLOYMENT_ENV: "testing",
    NODE_ENV: "test",
  });
  const ac = getDeploymentProfile({
    PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
    DEPLOYMENT_ENV: "testing",
    NODE_ENV: "test",
  });
  assert.equal(bb.productCode, "blessboard");
  assert.equal(ac.productCode, "activeclinic");
  assert.equal(bb.deploymentEnvironment, "testing");
  assert.equal(ac.deploymentEnvironment, "testing");
});

test("BlessBoard tenant context requires organization, church, HQ branch, and primary branch", () => {
  const complete = buildBlessBoardTenantContext({
    organization: { id: "org-1", key: "church-one" },
    church: { id: "church-1", churchKey: "church-one", displayName: "Church One" },
    hqBranch: { id: "branch-hq", branchKey: "hq" },
    primaryBranch: { id: "branch-primary", branchKey: "main" },
  });
  assert.equal(complete.resolved, true);
  assert.equal(complete.church.id, "church-1");
  assert.equal(buildBlessBoardTenantContext({ organization: { id: "org-1" } }), null);
});

test("BlessBoard context preserves church/branch separation and does not grant authority", () => {
  const context = buildBlessBoardTenantContext({
    organization: { id: "org-1", key: "church-one" },
    church: { id: "church-1", churchKey: "church-one" },
    hqBranch: { id: "branch-hq", branchKey: "hq" },
    primaryBranch: { id: "branch-primary", branchKey: "main" },
  });
  assert.equal(context.organization.id, "org-1");
  assert.equal(context.hqBranch.id, "branch-hq");
  assert.equal(context.primaryBranch.id, "branch-primary");
  assert.equal(context.isAdmin, undefined);
  assert.equal(context.authorized, undefined);
});

test("ActiveClinic context starts safely without tenant and rejects product mismatch", async () => {
  const loader = createLoadActiveClinicProductContext({
    getPool() {
      throw new Error("database must not be reached without organization key");
    },
    env: {
      NODE_ENV: "test",
      DEPLOYMENT_ENV: "testing",
      PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
    },
  });
  const noTenant = { query: {}, headers: {}, platform: { productKey: "activeclinic" } };
  const noTenantFlow = responseAndNext();
  await loader(noTenant, noTenantFlow.res, noTenantFlow.next.bind(noTenantFlow));
  assert.equal(noTenant.activeClinicContext.resolution, "deployment_only");

  const mismatch = { query: {}, headers: {}, platform: { productKey: "blessboard" } };
  const mismatchFlow = responseAndNext();
  await loader(mismatch, mismatchFlow.res, mismatchFlow.next.bind(mismatchFlow));
  assert.equal(mismatch.activeClinicContext.resolution, "product_mismatch");
});

test("ActiveClinic context resolves only the activeclinic product and never grants clinical authority", async () => {
  let seen;
  const loader = createLoadActiveClinicProductContext({
    getPool() {
      return {
        query: async () => ({ rows: [] }),
      };
    },
    env: {
      NODE_ENV: "test",
      DEPLOYMENT_ENV: "testing",
      PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
    },
  });
  const req = {
    query: { organizationKey: "clinic-one" },
    headers: {},
    platform: { productKey: "activeclinic" },
  };
  const flow = responseAndNext();
  await loader(req, flow.res, flow.next.bind(flow));
  seen = req.activeClinicContext;
  assert.equal(seen.resolution, "denied");
  assert.equal(seen.organization, null);
  assert.equal(seen.facility, null);
  assert.equal(seen.clinicalPermission, undefined);
});

test("product registry preserves BB and AC boundary", () => {
  assert.equal(getProduct("blessboard").productCode, "blessboard");
  assert.equal(getProduct("activeclinic").productCode, "activeclinic");
  assert.notEqual(getProduct("blessboard").productCode, getProduct("activeclinic").productCode);
});
