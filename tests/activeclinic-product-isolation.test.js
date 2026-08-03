"use strict";

/**
 * ActiveClinic V6 — organization product isolation (platform.organization_products).
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  getOrganizationProduct,
  requireOrganizationProduct,
  organizationHasActiveProduct,
  listOrganizationsByProduct,
  listProductsForOrganization,
  resolveOrganizationForProduct,
  enableOrganizationProduct,
  suspendOrganizationProduct,
  restoreOrganizationProduct,
  RESULT,
} = require("../src/platform/services/organizationProductService");
const { isValidApplicationCode } = require("../src/platform/config/productRegistry");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  CODE_ORG_STAGING,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let databaseUrl;
let skipReason = null;

async function provisionOrg(input) {
  const result = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    ...input,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}

describe("ActiveClinic organization product isolation", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  beforeEach(() => {
    resetDeploymentProfileWarningsForTests();
  });

  function requireDb() {
    if (skipReason) {
      assert.fail(`Local PostgreSQL unavailable for foundation tests: ${skipReason}`);
    }
  }

  it("accepts activeclinic and blessboard application codes", () => {
    assert.equal(isValidApplicationCode("activeclinic"), true);
    assert.equal(isValidApplicationCode("blessboard"), true);
    assert.equal(isValidApplicationCode("not-a-product"), false);
  });

  it("organization existence alone does not grant ActiveClinic access", async () => {
    requireDb();
    const bb = await provisionOrg({
      organizationKey: `bbonly_${Date.now().toString(36)}`,
      displayName: "BlessBoard Only Org",
      productKey: "blessboard",
      productTenantKey: `bb-tenant-${Date.now()}`,
      deploymentCode: CODE_ORG_STAGING,
    });
    const orgId = bb.records.organization.id;

    assert.equal(
      await organizationHasActiveProduct(pool, {
        organizationId: orgId,
        applicationCode: "activeclinic",
      }),
      false
    );

    const resolved = await resolveOrganizationForProduct(pool, {
      organizationKey: bb.records.organization.key,
      applicationCode: "activeclinic",
    });
    assert.equal(resolved.ok, false);
    assert.equal(resolved.code, RESULT.NOT_FOUND);
  });

  it("resolves ActiveClinic-only and BlessBoard-only independently", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await provisionOrg({
      organizationKey: `aconly_${stamp}`,
      displayName: "ActiveClinic Only",
      productKey: "activeclinic",
      productTenantKey: `ac-tenant-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    const bb = await provisionOrg({
      organizationKey: `bbonly2_${stamp}`,
      displayName: "BlessBoard Only 2",
      productKey: "blessboard",
      productTenantKey: `bb-tenant-2-${stamp}`,
      deploymentCode: CODE_ORG_STAGING,
    });

    const acOk = await resolveOrganizationForProduct(pool, {
      organizationKey: ac.records.organization.key,
      applicationCode: "activeclinic",
    });
    assert.equal(acOk.ok, true);
    assert.equal(acOk.product.key, "activeclinic");

    const acAsBb = await resolveOrganizationForProduct(pool, {
      organizationKey: ac.records.organization.key,
      applicationCode: "blessboard",
    });
    assert.equal(acAsBb.ok, false);
    assert.equal(acAsBb.code, RESULT.NOT_FOUND);

    const bbOk = await resolveOrganizationForProduct(pool, {
      organizationKey: bb.records.organization.key,
      applicationCode: "blessboard",
    });
    assert.equal(bbOk.ok, true);

    const bbAsAc = await resolveOrganizationForProduct(pool, {
      organizationKey: bb.records.organization.key,
      applicationCode: "activeclinic",
    });
    assert.equal(bbAsAc.ok, false);
  });

  it("supports dual-product enablement on one organization", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const orgKey = `dual_${stamp}`;
    const first = await provisionOrg({
      organizationKey: orgKey,
      displayName: "Dual Product Org",
      productKey: "blessboard",
      productTenantKey: `dual-bb-${stamp}`,
      deploymentCode: CODE_ORG_STAGING,
    });
    const second = await enableOrganizationProduct(pool, {
      organizationKey: orgKey,
      displayName: "Dual Product Org",
      dataEnvironment: "testing",
      productKey: "activeclinic",
      productTenantKey: `dual-ac-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      skipDomain: true,
    });
    assert.equal(second.ok, true);
    assert.equal(second.created.enrolment, true);
    assert.equal(second.created.organization, false);

    const products = await listProductsForOrganization(pool, {
      organizationId: first.records.organization.id,
    });
    assert.equal(products.ok, true);
    const keys = products.products.map((p) => p.productKey).sort();
    assert.deepEqual(keys, ["activeclinic", "blessboard"]);

    const acList = await listOrganizationsByProduct(pool, {
      applicationCode: "activeclinic",
    });
    const bbList = await listOrganizationsByProduct(pool, {
      applicationCode: "blessboard",
    });
    assert.ok(acList.organizations.some((o) => o.organizationKey === orgKey));
    assert.ok(bbList.organizations.some((o) => o.organizationKey === orgKey));
    assert.ok(!acList.organizations.some((o) => o.organizationKey === `missing_${stamp}`));
  });

  it("denies suspended ActiveClinic enablement with safe denial", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await provisionOrg({
      organizationKey: `acsusp_${stamp}`,
      displayName: "Suspended AC",
      productKey: "activeclinic",
      productTenantKey: `ac-susp-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    const orgId = ac.records.organization.id;

    const suspended = await suspendOrganizationProduct(pool, {
      organizationId: orgId,
      applicationCode: "activeclinic",
    });
    assert.equal(suspended.ok, true);
    assert.equal(suspended.organizationProduct.status, "inactive");

    const required = await requireOrganizationProduct(pool, {
      organizationId: orgId,
      applicationCode: "activeclinic",
    });
    assert.equal(required.ok, false);
    assert.equal(required.code, RESULT.NOT_FOUND);

    const got = await getOrganizationProduct(pool, {
      organizationId: orgId,
      applicationCode: "activeclinic",
    });
    assert.equal(got.ok, true);
    assert.equal(got.organizationProduct.status, "inactive");

    const restored = await restoreOrganizationProduct(pool, {
      organizationId: orgId,
      applicationCode: "activeclinic",
    });
    assert.equal(restored.ok, true);
    assert.equal(restored.organizationProduct.status, "active");
  });

  it("rejects duplicate organization/product enablement", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const orgKey = `dup_${stamp}`;
    await provisionOrg({
      organizationKey: orgKey,
      displayName: "Dup Guard",
      productKey: "activeclinic",
      productTenantKey: `dup-ac-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    const again = await enableOrganizationProduct(pool, {
      organizationKey: orgKey,
      displayName: "Dup Guard",
      dataEnvironment: "testing",
      productKey: "activeclinic",
      productTenantKey: `dup-ac-other-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      skipDomain: true,
    });
    assert.equal(again.ok, false);
    assert.match(String(again.status || again.message), /enrolment_conflict|conflict/i);
  });

  it("product-scoped listings exclude other-product-only orgs", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    await provisionOrg({
      organizationKey: `list_ac_${stamp}`,
      displayName: "List AC",
      productKey: "activeclinic",
      productTenantKey: `list-ac-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    await provisionOrg({
      organizationKey: `list_bb_${stamp}`,
      displayName: "List BB",
      productKey: "blessboard",
      productTenantKey: `list-bb-${stamp}`,
      deploymentCode: CODE_ORG_STAGING,
    });

    const acList = await listOrganizationsByProduct(pool, {
      applicationCode: "activeclinic",
    });
    const bbList = await listOrganizationsByProduct(pool, {
      applicationCode: "blessboard",
    });
    assert.ok(acList.organizations.some((o) => o.organizationKey === `list_ac_${stamp}`));
    assert.ok(!acList.organizations.some((o) => o.organizationKey === `list_bb_${stamp}`));
    assert.ok(bbList.organizations.some((o) => o.organizationKey === `list_bb_${stamp}`));
    assert.ok(!bbList.organizations.some((o) => o.organizationKey === `list_ac_${stamp}`));
  });

  it("ActiveClinic stub denies cross-product organization context safely", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const bb = await provisionOrg({
      organizationKey: `stub_bb_${stamp}`,
      displayName: "Stub BB",
      productKey: "blessboard",
      productTenantKey: `stub-bb-${stamp}`,
      deploymentCode: CODE_ORG_STAGING,
    });
    const ac = await provisionOrg({
      organizationKey: `stub_ac_${stamp}`,
      displayName: "Stub AC",
      productKey: "activeclinic",
      productTenantKey: `stub-ac-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });

    const prev = {};
    for (const [k, v] of Object.entries(MINIMAL_AC)) {
      prev[k] = process.env[k];
      process.env[k] = v;
    }
    try {
      const app = createActiveClinicFoundationApp({
        env: process.env,
        getPool: () => pool,
      });

      const denied = await request(app)
        .get("/__ac/organization-context")
        .query({ organizationKey: bb.records.organization.key });
      assert.equal(denied.status, 404);
      assert.equal(denied.body.code, "organization_product_not_found");

      const allowed = await request(app)
        .get("/__ac/organization-context")
        .query({ organizationKey: ac.records.organization.key });
      assert.equal(allowed.status, 200);
      assert.equal(allowed.body.ok, true);
      assert.equal(allowed.body.organization.key, ac.records.organization.key);
      assert.equal(allowed.body.organizationProduct.productKey, "activeclinic");

      const listed = await request(app).get("/__ac/organizations");
      assert.equal(listed.status, 200);
      assert.ok(
        listed.body.organizations.some((o) => o.organizationKey === ac.records.organization.key)
      );
      assert.ok(
        !listed.body.organizations.some((o) => o.organizationKey === bb.records.organization.key)
      );

      const homeDenied = await request(app)
        .get("/")
        .query({ organizationKey: bb.records.organization.key });
      assert.equal(homeDenied.status, 200);
      assert.match(homeDenied.text, /data-ac-org-denied="1"/);

      const homeOk = await request(app)
        .get("/")
        .query({ organizationKey: ac.records.organization.key });
      assert.equal(homeOk.status, 200);
      assert.match(homeOk.text, /data-ac-org=/);
    } finally {
      for (const k of Object.keys(MINIMAL_AC)) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
    }
  });
});
