"use strict";

/**
 * ActiveClinic V6 — healthcare organization and facility foundation (AC-V6-05).
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
  enableOrganizationProduct,
  suspendOrganizationProduct,
} = require("../src/platform/services/organizationProductService");
const {
  createHealthcareOrganization,
  getHealthcareOrganizationByOrganizationId,
  requireActiveHealthcareOrganization,
  RESULT: HCO_RESULT,
} = require("../src/activeclinic/services/healthcareOrganizationService");
const {
  createFacility,
  getFacilityByOrganizationAndKey,
  requireActiveFacility,
  setPrimaryFacility,
  archiveFacility,
  listFacilitiesByOrganization,
  RESULT: FAC_RESULT,
} = require("../src/activeclinic/services/facilityService");
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

function hcoInput(organizationId, extras) {
  return {
    organizationId,
    legalName: "Juflona Legal Name",
    publicName: "Juflona Public",
    organizationType: "faith_based_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    ...extras,
  };
}

function facilityInput(organizationId, healthcareOrganizationId, extras) {
  return {
    organizationId,
    healthcareOrganizationId,
    facilityKey: "main-hospital",
    displayName: "Main Hospital",
    facilityType: "hospital",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: "+260971234567",
    ...extras,
  };
}

describe("ActiveClinic healthcare organization and facility foundation", () => {
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

  it("creates healthcare organization only with active ActiveClinic enrolment", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await provisionOrg({
      organizationKey: `ac_hco_${stamp}`,
      displayName: "AC HCO Org",
      productKey: "activeclinic",
      productTenantKey: `ac-hco-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    const created = await createHealthcareOrganization(
      pool,
      hcoInput(ac.records.organization.id)
    );
    assert.equal(created.ok, true, JSON.stringify(created));

    const bb = await provisionOrg({
      organizationKey: `bb_only_${stamp}`,
      displayName: "BB Only",
      productKey: "blessboard",
      productTenantKey: `bb-only-${stamp}`,
      deploymentCode: CODE_ORG_STAGING,
    });
    const denied = await createHealthcareOrganization(
      pool,
      hcoInput(bb.records.organization.id)
    );
    assert.equal(denied.ok, false);
    assert.equal(denied.code, HCO_RESULT.PRODUCT_NOT_ENABLED);

    const dup = await createHealthcareOrganization(
      pool,
      hcoInput(ac.records.organization.id, { publicName: "Other" })
    );
    assert.equal(dup.ok, false);
    assert.equal(dup.code, HCO_RESULT.DUPLICATE);
  });

  it("rejects invalid HCO type/status and non-active resolution", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}a`;
    const ac = await provisionOrg({
      organizationKey: `ac_stat_${stamp}`,
      displayName: "AC Status Org",
      productKey: "activeclinic",
      productTenantKey: `ac-stat-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    const badType = await createHealthcareOrganization(
      pool,
      hcoInput(ac.records.organization.id, { organizationType: "not_a_type" })
    );
    assert.equal(badType.code, HCO_RESULT.INVALID_TYPE);

    const badStatus = await createHealthcareOrganization(
      pool,
      hcoInput(ac.records.organization.id, { status: "deleted" })
    );
    assert.equal(badStatus.code, HCO_RESULT.INVALID_STATUS);

    const created = await createHealthcareOrganization(
      pool,
      hcoInput(ac.records.organization.id, { status: "suspended" })
    );
    assert.equal(created.ok, true);
    const active = await requireActiveHealthcareOrganization(pool, {
      organizationId: ac.records.organization.id,
    });
    assert.equal(active.ok, false);
    assert.equal(active.code, HCO_RESULT.NOT_ACTIVE);
  });

  it("creates facilities with key uniqueness and primary rules", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}b`;
    const orgA = await provisionOrg({
      organizationKey: `ac_fa_${stamp}`,
      displayName: "AC Fac A",
      productKey: "activeclinic",
      productTenantKey: `ac-fa-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    const orgB = await provisionOrg({
      organizationKey: `ac_fb_${stamp}`,
      displayName: "AC Fac B",
      productKey: "activeclinic",
      productTenantKey: `ac-fb-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    const hcoA = await createHealthcareOrganization(
      pool,
      hcoInput(orgA.records.organization.id)
    );
    const hcoB = await createHealthcareOrganization(
      pool,
      hcoInput(orgB.records.organization.id)
    );
    assert.equal(hcoA.ok, true);
    assert.equal(hcoB.ok, true);

    const primary = await createFacility(
      pool,
      facilityInput(orgA.records.organization.id, hcoA.healthcareOrganization.id)
    );
    assert.equal(primary.ok, true, JSON.stringify(primary));

    const clinic = await createFacility(
      pool,
      facilityInput(orgA.records.organization.id, hcoA.healthcareOrganization.id, {
        facilityKey: "outpatient",
        displayName: "Outpatient Clinic",
        facilityType: "clinic",
        isPrimary: false,
        status: "active",
        email: "clinic@example.test",
      })
    );
    assert.equal(clinic.ok, true);

    const dupKey = await createFacility(
      pool,
      facilityInput(orgA.records.organization.id, hcoA.healthcareOrganization.id, {
        facilityKey: "main-hospital",
        isPrimary: false,
      })
    );
    assert.equal(dupKey.code, FAC_RESULT.DUPLICATE_KEY);

    const sameKeyOtherOrg = await createFacility(
      pool,
      facilityInput(orgB.records.organization.id, hcoB.healthcareOrganization.id, {
        facilityKey: "main-hospital",
      })
    );
    assert.equal(sameKeyOtherOrg.ok, true);

    const secondPrimary = await createFacility(
      pool,
      facilityInput(orgA.records.organization.id, hcoA.healthcareOrganization.id, {
        facilityKey: "second-primary",
        isPrimary: true,
      })
    );
    assert.equal(secondPrimary.code, FAC_RESULT.PRIMARY_CONFLICT);

    const archived = await archiveFacility(pool, {
      id: primary.facility.id,
      organizationId: orgA.records.organization.id,
    });
    assert.equal(archived.ok, true);
    assert.equal(archived.facility.isPrimary, false);

    const replacement = await createFacility(
      pool,
      facilityInput(orgA.records.organization.id, hcoA.healthcareOrganization.id, {
        facilityKey: "replacement-hq",
        isPrimary: true,
      })
    );
    assert.equal(replacement.ok, true, JSON.stringify(replacement));

    const inactive = await createFacility(
      pool,
      facilityInput(orgA.records.organization.id, hcoA.healthcareOrganization.id, {
        facilityKey: "inactive-site",
        status: "inactive",
        isPrimary: false,
      })
    );
    assert.equal(inactive.ok, true);
    const inactiveResolve = await requireActiveFacility(pool, {
      organizationId: orgA.records.organization.id,
      facilityKey: "inactive-site",
    });
    assert.equal(inactiveResolve.code, FAC_RESULT.NOT_ACTIVE);
  });

  it("rejects ownership mismatch and cross-org facility lookup", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}c`;
    const orgA = await provisionOrg({
      organizationKey: `ac_own_a_${stamp}`,
      displayName: "AC Own A",
      productKey: "activeclinic",
      productTenantKey: `ac-own-a-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    const orgB = await provisionOrg({
      organizationKey: `ac_own_b_${stamp}`,
      displayName: "AC Own B",
      productKey: "activeclinic",
      productTenantKey: `ac-own-b-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    const hcoA = await createHealthcareOrganization(
      pool,
      hcoInput(orgA.records.organization.id)
    );
    await createHealthcareOrganization(pool, hcoInput(orgB.records.organization.id));
    const mismatch = await createFacility(
      pool,
      facilityInput(orgB.records.organization.id, hcoA.healthcareOrganization.id)
    );
    assert.equal(mismatch.ok, false);
    assert.ok(
      [FAC_RESULT.HCO_NOT_FOUND, FAC_RESULT.OWNERSHIP_MISMATCH].includes(mismatch.code)
    );

    const fac = await createFacility(
      pool,
      facilityInput(orgA.records.organization.id, hcoA.healthcareOrganization.id, {
        facilityKey: "scoped-site",
        isPrimary: true,
      })
    );
    assert.equal(fac.ok, true);
    const cross = await getFacilityByOrganizationAndKey(pool, {
      organizationId: orgB.records.organization.id,
      facilityKey: "scoped-site",
    });
    assert.equal(cross.code, FAC_RESULT.NOT_FOUND);
  });

  it("rejects invalid facility type/status and inactive enrolment", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}d`;
    const ac = await provisionOrg({
      organizationKey: `ac_inv_${stamp}`,
      displayName: "AC Invalid",
      productKey: "activeclinic",
      productTenantKey: `ac-inv-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    const hco = await createHealthcareOrganization(
      pool,
      hcoInput(ac.records.organization.id)
    );
    const badType = await createFacility(
      pool,
      facilityInput(ac.records.organization.id, hco.healthcareOrganization.id, {
        facilityType: "ward",
        isPrimary: false,
        facilityKey: "bad-type",
      })
    );
    assert.equal(badType.code, FAC_RESULT.INVALID_TYPE);

    const badStatus = await createFacility(
      pool,
      facilityInput(ac.records.organization.id, hco.healthcareOrganization.id, {
        status: "deleted",
        isPrimary: false,
        facilityKey: "bad-status",
      })
    );
    assert.equal(badStatus.code, FAC_RESULT.INVALID_STATUS);

    await suspendOrganizationProduct(pool, {
      organizationId: ac.records.organization.id,
      applicationCode: "activeclinic",
    });
    const afterSuspend = await requireActiveHealthcareOrganization(pool, {
      organizationId: ac.records.organization.id,
    });
    assert.equal(afterSuspend.code, HCO_RESULT.PRODUCT_NOT_ENABLED);

    const dual = await provisionOrg({
      organizationKey: `dual_${stamp}`,
      displayName: "Dual Org",
      productKey: "blessboard",
      productTenantKey: `dual-bb-${stamp}`,
      deploymentCode: CODE_ORG_STAGING,
    });
    const enabled = await enableOrganizationProduct(pool, {
      organizationKey: dual.records.organization.key,
      displayName: "Dual Org",
      dataEnvironment: "testing",
      productKey: "activeclinic",
      productTenantKey: `dual-ac-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      skipDomain: true,
    });
    assert.equal(enabled.ok, true, JSON.stringify(enabled));
    const dualHco = await createHealthcareOrganization(
      pool,
      hcoInput(dual.records.organization.id)
    );
    assert.equal(dualHco.ok, true);
  });

  it("infra probes resolve healthcare org and facilities with safe denial", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}e`;
    const ac = await provisionOrg({
      organizationKey: `ac_probe_${stamp}`,
      displayName: "AC Probe",
      productKey: "activeclinic",
      productTenantKey: `ac-probe-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    const hco = await createHealthcareOrganization(
      pool,
      hcoInput(ac.records.organization.id)
    );
    await createFacility(
      pool,
      facilityInput(ac.records.organization.id, hco.healthcareOrganization.id, {
        facilityKey: "probe-hospital",
      })
    );

    const app = createActiveClinicFoundationApp({
      env: MINIMAL_AC,
      getPool: () => pool,
    });

    const hcoCtx = await request(app)
      .get(
        `/__ac/healthcare-organization-context?organizationKey=${ac.records.organization.key}`
      )
      .set("Host", "activeclinic.org");
    assert.equal(hcoCtx.status, 200);
    assert.equal(hcoCtx.body.healthcareOrganization.status, "active");

    const list = await request(app)
      .get(`/__ac/facilities?organizationKey=${ac.records.organization.key}`)
      .set("Host", "activeclinic.org");
    assert.equal(list.status, 200);
    assert.equal(list.body.facilities.length, 1);

    const one = await request(app)
      .get(
        `/__ac/facilities/probe-hospital?organizationKey=${ac.records.organization.key}`
      )
      .set("Host", "activeclinic.org");
    assert.equal(one.status, 200);
    assert.equal(one.body.facility.facilityKey, "probe-hospital");

    const denied = await request(app)
      .get("/__ac/facilities?organizationKey=missing-org")
      .set("Host", "activeclinic.org");
    assert.equal(denied.status, 404);

    const prodApp = createActiveClinicFoundationApp({
      env: { ...MINIMAL_AC, NODE_ENV: "production" },
      getPool: () => pool,
    });
    const prodBlocked = await request(prodApp)
      .get(`/__ac/facilities?organizationKey=${ac.records.organization.key}`)
      .set("Host", "activeclinic.org");
    assert.equal(prodBlocked.status, 404);
  });

  it("org without healthcare organization can still resolve product enrolment", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}f`;
    const ac = await provisionOrg({
      organizationKey: `ac_empty_${stamp}`,
      displayName: "AC Empty HCO",
      productKey: "activeclinic",
      productTenantKey: `ac-empty-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    const missing = await getHealthcareOrganizationByOrganizationId(pool, {
      organizationId: ac.records.organization.id,
    });
    assert.equal(missing.code, HCO_RESULT.NOT_FOUND);
    const listed = await listFacilitiesByOrganization(pool, {
      organizationId: ac.records.organization.id,
    });
    assert.equal(listed.ok, true);
    assert.equal(listed.facilities.length, 0);
  });

  it("setPrimary replaces prior active primary", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}g`;
    const ac = await provisionOrg({
      organizationKey: `ac_pri_${stamp}`,
      displayName: "AC Primary",
      productKey: "activeclinic",
      productTenantKey: `ac-pri-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    const hco = await createHealthcareOrganization(
      pool,
      hcoInput(ac.records.organization.id)
    );
    const a = await createFacility(
      pool,
      facilityInput(ac.records.organization.id, hco.healthcareOrganization.id, {
        facilityKey: "site-a",
        isPrimary: true,
      })
    );
    const b = await createFacility(
      pool,
      facilityInput(ac.records.organization.id, hco.healthcareOrganization.id, {
        facilityKey: "site-b",
        isPrimary: false,
        status: "active",
      })
    );
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    const switched = await setPrimaryFacility(pool, {
      id: b.facility.id,
      organizationId: ac.records.organization.id,
    });
    assert.equal(switched.ok, true);
    assert.equal(switched.facility.isPrimary, true);
    const listed = await listFacilitiesByOrganization(pool, {
      organizationId: ac.records.organization.id,
    });
    const primaries = listed.facilities.filter((f) => f.isPrimary && f.status === "active");
    assert.equal(primaries.length, 1);
    assert.equal(primaries[0].facilityKey, "site-b");
  });
});
