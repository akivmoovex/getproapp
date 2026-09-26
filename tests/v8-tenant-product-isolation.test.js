"use strict";

/**
 * Cross-product tenant isolation for V8 shared platform.
 * Disposable foundation DB only — never deletes hosted V7 data.
 *
 * Proves BlessBoard and ActiveClinic tenants cannot resolve each other's
 * product enrolments, and that V8/V7 host allowlists stay isolated.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

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
  resolveOrganizationForProduct,
  RESULT,
} = require("../src/platform/services/organizationProductService");
const {
  isValidApplicationCode,
  BUSINESS_PRODUCT_CODES,
} = require("../src/platform/config/productRegistry");
const {
  CODE_MOOVEX_PLATFORM_V8_TESTING,
  CODE_MOOVEX_PLATFORM_TESTING,
  CODE_ORG_STAGING,
  CODE_ACTIVECLINIC_ORG_V6,
  getDeploymentProfile,
} = require("../src/platform/config/deploymentProfiles");
const {
  resolveCanonicalHost,
} = require("../src/platform/config/canonicalHostRegistry");
const {
  assertHostnameAllowedForDeployment,
} = require("../src/platform/http/platformRequestContext");
const {
  isV8Deployment,
  V8_HOSTS,
  V7_TESTING_HOSTS,
} = require("../src/platform/config/v8DeploymentIsolation");

let pool;
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

function requireDb() {
  if (skipReason) {
    // eslint-disable-next-line no-console
    console.log("skip:", skipReason);
    return false;
  }
  return true;
}

describe("V8 cross-product tenant isolation", () => {
  before(async () => {
    try {
      const url = await resetFoundationDatabase();
      pool = createFoundationPool(url);
      await migrate({ pool });
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 240) : "no foundation db";
      pool = null;
    }
  });

  after(async () => {
    if (pool) {
      try {
        await pool.end();
      } catch {
        /* ignore */
      }
    }
  });

  it("registers distinct business product codes for BB and AC", () => {
    assert.equal(isValidApplicationCode("blessboard"), true);
    assert.equal(isValidApplicationCode("activeclinic"), true);
    assert.ok(BUSINESS_PRODUCT_CODES.includes("blessboard"));
    assert.ok(BUSINESS_PRODUCT_CODES.includes("activeclinic"));
  });

  it("BB-enabled org is not active for ActiveClinic and vice versa", async () => {
    if (!requireDb()) return;
    const stamp = Date.now().toString(36);
    const bb = await provisionOrg({
      organizationKey: `v8_iso_bb_${stamp}`,
      displayName: "V8 Iso BlessBoard",
      productKey: "blessboard",
      productTenantKey: `bb-tenant-${stamp}`,
      deploymentCode: CODE_ORG_STAGING,
    });
    const ac = await provisionOrg({
      organizationKey: `v8_iso_ac_${stamp}`,
      displayName: "V8 Iso ActiveClinic",
      productKey: "activeclinic",
      productTenantKey: `ac-tenant-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });

    const bbOrgId = bb.records.organization.id;
    const acOrgId = ac.records.organization.id;

    assert.equal(
      await organizationHasActiveProduct(pool, {
        organizationId: bbOrgId,
        applicationCode: "blessboard",
      }),
      true
    );
    assert.equal(
      await organizationHasActiveProduct(pool, {
        organizationId: bbOrgId,
        applicationCode: "activeclinic",
      }),
      false
    );
    assert.equal(
      await organizationHasActiveProduct(pool, {
        organizationId: acOrgId,
        applicationCode: "activeclinic",
      }),
      true
    );
    assert.equal(
      await organizationHasActiveProduct(pool, {
        organizationId: acOrgId,
        applicationCode: "blessboard",
      }),
      false
    );
  });

  it("requireOrganizationProduct fails closed on wrong product", async () => {
    if (!requireDb()) return;
    const stamp = Date.now().toString(36);
    const bb = await provisionOrg({
      organizationKey: `v8_iso_req_${stamp}`,
      displayName: "V8 Iso Require",
      productKey: "blessboard",
      productTenantKey: `bb-req-${stamp}`,
      deploymentCode: CODE_ORG_STAGING,
    });
    const ok = await requireOrganizationProduct(pool, {
      organizationId: bb.records.organization.id,
      applicationCode: "blessboard",
    });
    assert.equal(ok.ok, true);

    const bad = await requireOrganizationProduct(pool, {
      organizationId: bb.records.organization.id,
      applicationCode: "activeclinic",
    });
    assert.equal(bad.ok, false);
    assert.ok(typeof bad.code === "string" && bad.code !== RESULT.OK);
  });

  it("resolveOrganizationForProduct does not cross product boundaries", async () => {
    if (!requireDb()) return;
    const stamp = Date.now().toString(36);
    const bb = await provisionOrg({
      organizationKey: `v8_iso_res_bb_${stamp}`,
      displayName: "V8 Iso Resolve BB",
      productKey: "blessboard",
      productTenantKey: `bb-res-${stamp}`,
      deploymentCode: CODE_ORG_STAGING,
    });
    const ac = await provisionOrg({
      organizationKey: `v8_iso_res_ac_${stamp}`,
      displayName: "V8 Iso Resolve AC",
      productKey: "activeclinic",
      productTenantKey: `ac-res-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });

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
    assert.equal(bbAsAc.code, RESULT.NOT_FOUND);

    const acOk = await resolveOrganizationForProduct(pool, {
      organizationKey: ac.records.organization.key,
      applicationCode: "activeclinic",
    });
    assert.equal(acOk.ok, true);

    const acAsBb = await resolveOrganizationForProduct(pool, {
      organizationKey: ac.records.organization.key,
      applicationCode: "blessboard",
    });
    assert.equal(acAsBb.ok, false);

    const enrolment = await getOrganizationProduct(pool, {
      organizationId: bb.records.organization.id,
      applicationCode: "blessboard",
    });
    assert.equal(enrolment.ok, true);
    assert.ok(enrolment.organizationProduct);
    assert.equal(enrolment.organizationProduct.productKey, "blessboard");
  });

  it("neuniversity and pronline testing profiles reject each other's hosts", () => {
    const v8Profile = getDeploymentProfile({
      PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
      DEPLOYMENT_ENV: "testing",
      NODE_ENV: "production",
    });
    const v7Profile = getDeploymentProfile({
      PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
      DEPLOYMENT_ENV: "testing",
      NODE_ENV: "production",
    });
    assert.equal(
      isV8Deployment({ PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING }),
      true
    );
    // V9: pronline testing reuses V8 platform line (About 2.02) under a separate deployment code.
    assert.equal(
      isV8Deployment({ PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING }),
      true
    );
    assert.equal(v8Profile.platformLine, "v8");
    assert.equal(v7Profile.platformLine, "v8");
    assert.notEqual(v8Profile.sessionCookieName, v7Profile.sessionCookieName);

    for (const host of V8_HOSTS) {
      const resolved = resolveCanonicalHost(host);
      assert.equal(resolved.ok, true, host);
      const site = resolved.site;
      assert.ok(site, host);
      assert.equal(assertHostnameAllowedForDeployment(v8Profile, site).ok, true, host);
      assert.equal(
        assertHostnameAllowedForDeployment(v7Profile, site).ok,
        false,
        `pronline testing must reject ${host}`
      );
    }
    for (const host of V7_TESTING_HOSTS) {
      const resolved = resolveCanonicalHost(host);
      assert.equal(resolved.ok, true, host);
      const site = resolved.site;
      assert.ok(site, host);
      assert.equal(assertHostnameAllowedForDeployment(v7Profile, site).ok, true, host);
      assert.equal(
        assertHostnameAllowedForDeployment(v8Profile, site).ok,
        false,
        `neuniversity V8 must reject ${host}`
      );
    }
  });

  it("canonical host registry maps BB/AC product keys per apex line", () => {
    const bbV8 = resolveCanonicalHost("blessboard.neuniversity.org");
    const acV8 = resolveCanonicalHost("activeclinic.neuniversity.org");
    const bbV7 = resolveCanonicalHost("blessboard.pronline.org");
    assert.equal(bbV8.ok, true);
    assert.equal(acV8.ok, true);
    assert.equal(bbV7.ok, true);
    assert.equal(bbV8.site.productKey, "blessboard");
    assert.equal(acV8.site.productKey, "activeclinic");
    assert.equal(bbV8.site.platformLine, "v8");
    assert.equal(bbV7.site.platformLine, "v8");
  });
});
