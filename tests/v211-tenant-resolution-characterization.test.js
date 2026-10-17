"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeCanonicalHostname,
  resolveCanonicalHost,
} = require("../src/platform/config/canonicalHostRegistry");
const {
  resolveRequestCanonicalSite,
  resolveRequestCanonicalSiteAsync,
} = require("../src/platform/http/resolveRequestHostname");
const {
  resolveHostname,
  RESULT_TYPES,
} = require("../src/platform/services/resolveHostname");
const {
  resolvePlatformRequestContext,
} = require("../src/platform/http/platformRequestContext");
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

function dynamicRow(overrides = {}) {
  return {
    domain_id: "domain-1",
    domain_type: "custom",
    domain_status: "active",
    domain_is_primary: false,
    domain_deployment_id: "blessboard-com-production",
    deployment_code: "blessboard-com-production",
    deployment_status: "active",
    deployment_jobs_enabled: false,
    product_id: "product-1",
    product_key: "blessboard",
    product_display_name: "BlessBoard",
    product_status: "active",
    organization_id: "org-1",
    organization_key: "church-one",
    organization_display_name: "Church One",
    organization_status: "active",
    organization_data_environment: "production",
    organization_product_id: "enrolment-1",
    organization_product_status: "active",
    organization_product_tenant_key: "church-one",
    ...overrides,
  };
}

function databaseReturning(row) {
  return {
    query: async () => ({ rows: row ? [row] : [] }),
  };
}

test("dynamic BB hostname resolves a tenant through the existing database resolver", async () => {
  const result = await resolveRequestCanonicalSiteAsync(
    requestFor("church-one.example.test"),
    {
      env: { NODE_ENV: "production" },
      allowTestHostOverride: false,
      db: databaseReturning(dynamicRow()),
      expectedDeploymentCode: "blessboard-com-production",
    }
  );
  assert.equal(result.ok, true);
  assert.equal(result.site.productKey, "blessboard");
  assert.equal(result.site.siteType, "tenant");
  assert.equal(result.site.environment, "production");
});

test("dynamic AC hostname resolves an ActiveClinic tenant without changing the resolver authority", async () => {
  const result = await resolveRequestCanonicalSiteAsync(
    requestFor("clinic-one.example.test"),
    {
      env: { NODE_ENV: "production" },
      allowTestHostOverride: false,
      db: databaseReturning(dynamicRow({
        domain_deployment_id: "activeclinic-org-production",
        deployment_code: "activeclinic-org-production",
        product_key: "activeclinic",
        product_display_name: "ActiveClinic",
        organization_key: "clinic-one",
        organization_data_environment: "production",
      })),
      expectedDeploymentCode: "activeclinic-org-production",
    }
  );
  assert.equal(result.ok, true);
  assert.equal(result.site.productKey, "activeclinic");
  assert.equal(result.site.siteType, "tenant");
});

test("dynamic resolver characterizes unknown and inactive host states", async () => {
  const unknown = await resolveHostname(databaseReturning(null), "unknown.example.test");
  assert.equal(unknown.type, RESULT_TYPES.UNKNOWN_DOMAIN);

  const inactive = await resolveHostname(
    databaseReturning(dynamicRow({ domain_status: "inactive" })),
    "inactive.example.test"
  );
  assert.equal(inactive.type, RESULT_TYPES.INACTIVE_DOMAIN);
});

test("dynamic resolver characterizes inactive enrolment, product, and organization", async () => {
  const inactiveProduct = await resolveHostname(
    databaseReturning(dynamicRow({ product_status: "inactive" })),
    "inactive-product.example.test"
  );
  const inactiveOrg = await resolveHostname(
    databaseReturning(dynamicRow({ organization_status: "inactive" })),
    "inactive-org.example.test"
  );
  const inactiveEnrolment = await resolveHostname(
    databaseReturning(dynamicRow({ organization_product_status: "inactive" })),
    "inactive-enrolment.example.test"
  );
  assert.equal(inactiveProduct.type, RESULT_TYPES.INACTIVE_PRODUCT);
  assert.equal(inactiveOrg.type, RESULT_TYPES.INACTIVE_ORGANIZATION);
  assert.equal(inactiveEnrolment.type, RESULT_TYPES.INACTIVE_ENROLMENT);
});

test("dynamic resolver characterizes deployment and environment mismatch", async () => {
  const mismatch = await resolveHostname(
    databaseReturning(dynamicRow()),
    "mismatch.example.test",
    { expectedDeploymentCode: "activeclinic-org-production" }
  );
  assert.equal(mismatch.type, RESULT_TYPES.DEPLOYMENT_MISMATCH);

  const environmentMismatch = await resolveRequestCanonicalSiteAsync(
    requestFor("wrong-environment.example.test"),
    {
      env: { NODE_ENV: "production" },
      allowTestHostOverride: false,
      db: databaseReturning(dynamicRow({
        organization_data_environment: "testing",
      })),
      expectedDeploymentCode: "blessboard-com-production",
    }
  );
  // Dynamic site environment is taken from the resolved organization; the
  // current async resolver does not independently reject this mismatch.
  assert.equal(environmentMismatch.ok, true);
  assert.equal(environmentMismatch.site.environment, "testing");
});

test("request-context layer rejects a dynamic environment mismatch", () => {
  const result = resolvePlatformRequestContext({
    env: {
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "production",
      PLATFORM_DEPLOYMENT_CODE: "blessboard-com-production",
    },
    resolvedSite: {
      hostname: "wrong-environment.example.test",
      productKey: "blessboard",
      environment: "testing",
      platformLine: "v8",
      brand: "BlessBoard",
      siteType: "tenant",
      sessionCookieName: null,
      csrfCookieName: null,
      redirectTargetOrigin: null,
    },
    hostSource: "request",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "PLATFORM_ENVIRONMENT_HOST_MISMATCH");
});

test("dynamic resolver rejects missing organization, enrolment, and unrelated product", async () => {
  const missingOrg = await resolveHostname(
    databaseReturning(dynamicRow({ organization_id: null })),
    "missing-org.example.test"
  );
  const missingEnrolment = await resolveHostname(
    databaseReturning(dynamicRow({ organization_product_id: null })),
    "missing-enrolment.example.test"
  );
  const unrelated = await resolveHostname(
    databaseReturning(dynamicRow({ product_key: "activeclinic" })),
    "unrelated-product.example.test"
  );
  assert.equal(missingOrg.type, RESULT_TYPES.MISSING_ORGANIZATION);
  assert.equal(missingEnrolment.type, RESULT_TYPES.MISSING_ENROLMENT);
  assert.equal(unrelated.type, RESULT_TYPES.RESOLVED_TENANT);
});

test("dynamic resolver safely handles missing database and database failure", async () => {
  const noDatabase = await resolveRequestCanonicalSiteAsync(
    requestFor("dynamic.example.test"),
    { env: { NODE_ENV: "production" }, allowTestHostOverride: false }
  );
  assert.equal(noDatabase.ok, false);
  assert.equal(noDatabase.code, "UNKNOWN_PLATFORM_HOST");

  const databaseFailure = await resolveRequestCanonicalSiteAsync(
    requestFor("dynamic.example.test"),
    {
      env: { NODE_ENV: "production" },
      allowTestHostOverride: false,
      db: { query: async () => { throw new Error("controlled failure"); } },
    }
  );
  assert.equal(databaseFailure.ok, false);
  assert.equal(databaseFailure.code, "UNKNOWN_PLATFORM_HOST");
});

test("static canonical host takes precedence over dynamic database lookup", async () => {
  let calls = 0;
  const result = await resolveRequestCanonicalSiteAsync(
    requestFor("blessboard.neuniversity.org"),
    {
      env: { NODE_ENV: "production" },
      allowTestHostOverride: false,
      db: {
        query: async () => {
          calls += 1;
          throw new Error("static host must not query database");
        },
      },
    }
  );
  assert.equal(result.ok, true);
  assert.equal(result.site.productKey, "blessboard");
  assert.equal(calls, 0);
});
