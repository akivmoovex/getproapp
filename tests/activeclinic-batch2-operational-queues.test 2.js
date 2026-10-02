"use strict";

/**
 * ActiveClinic V2.03 Batch 2 — AC-B2-07 Pharmacy + AC-B2-08 Diagnostics operational queues.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  createPlatformIdentity,
} = require("../src/platform/services/platformIdentityService");
const {
  setPlatformIdentityPassword,
} = require("../src/platform/services/platformIdentityCredentialService");
const {
  createHealthcareOrganization,
} = require("../src/activeclinic/services/healthcareOrganizationService");
const { createFacility } = require("../src/activeclinic/services/facilityService");
const {
  ensureDefaultDepartments,
} = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  PHARMACIST,
  LAB_TECHNICIAN,
  RADIOLOGY_STAFF,
  RECEPTIONIST,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

const PASSWORD = "activeclinic-pass-12";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});
const ROOT = path.join(__dirname, "..");

let pool;
let skipReason = null;
let phoneSeq = 880000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

async function seedTenant(stamp, keyPrefix) {
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `${keyPrefix}_${stamp}`,
    displayName: `AC ${keyPrefix}`,
    productKey: "activeclinic",
    productTenantKey: `${keyPrefix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "Legal Ops",
    publicName: "Ops Clinic",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true);
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: "main",
    displayName: "Main Facility",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facility.ok, true);
  await ensureDefaultDepartments(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  });
  return {
    orgId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  };
}

async function seedRole(ac, opts) {
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
  });
  assert.equal(identity.ok, true);
  await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: PASSWORD,
  });
  const staff = await createStaffMember(pool, {
    organizationId: ac.orgId,
    healthcareOrganizationId: ac.hcoId,
    firstName: opts.firstName || "Ops",
    lastName: opts.lastName || "Staff",
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
    jobTitle: opts.jobTitle || "Staff",
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  await assignStaffToFacility(pool, {
    organizationId: ac.orgId,
    staffMemberId: staff.staffMember.id,
    facilityId: ac.facilityId,
    isPrimary: true,
  });
  await assignStaffRole(pool, {
    organizationId: ac.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey: opts.roleKey,
    scopeType: "facility",
    facilityId: ac.facilityId,
  });
  return { identityId: identity.identity.id, staffId: staff.staffMember.id };
}

async function sessionCookie(identityId, orgId, facilityId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId: orgId,
    contextJson: { selectedFacilityId: facilityId },
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

describe("ActiveClinic V2.03 Batch 2 operational queues (AC-B2-07/08)", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("ships shared status tabs and B2 pharmacy/diagnostics composition", () => {
    const tabs = fs.readFileSync(
      path.join(ROOT, "views/platform/partials/gp-ops-status-tabs.ejs"),
      "utf8"
    );
    assert.match(tabs, /gp-ops-status-tabs/);
    const gpCss = fs.readFileSync(
      path.join(ROOT, "public/platform/gp-ops-shared.css"),
      "utf8"
    );
    assert.match(gpCss, /\.gp-ops-status-tabs/);

    const acCss = fs.readFileSync(
      path.join(ROOT, "public/activeclinic/ac-app.css"),
      "utf8"
    );
    assert.match(acCss, /\.ac-ops-queue/);
    assert.match(acCss, /AC-B2-07 \/ AC-B2-08/);
    assert.match(acCss, /@media \(max-width: 390px\)[\s\S]*\.ac-ops-queue__header/);

    const pharmDash = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/app/pharmacy-dashboard-content.ejs"),
      "utf8"
    );
    assert.match(pharmDash, /data-ac-stitch="AC-B2-07"/);
    assert.match(pharmDash, /a587c5c7bb87492fa7eb986bcd843a39/);

    const pharmQueue = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/app/pharmacy-prescription-queue-content.ejs"),
      "utf8"
    );
    assert.match(pharmQueue, /data-ac-stitch="AC-B2-07"/);
    assert.match(pharmQueue, /gp-ops-status-tabs|gp-ops-filter-bar/);
    assert.match(pharmQueue, /ac-ops-queue__mobile/);

    const hub = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/app/diagnostics-hub-content.ejs"),
      "utf8"
    );
    assert.match(hub, /data-ac-stitch="AC-B2-08"/);
    assert.match(hub, /07d08d75a44248acab897adb33254426/);

    const labQueue = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/app/diagnostics-laboratory-queue-content.ejs"),
      "utf8"
    );
    assert.match(labQueue, /data-ac-modality="laboratory"/);
    assert.match(labQueue, /gp-ops-status-tabs/);

    const radQueue = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/app/diagnostics-radiology-queue-content.ejs"),
      "utf8"
    );
    assert.match(radQueue, /data-ac-modality="radiology"/);
    assert.match(radQueue, /gp-ops-status-tabs/);
  });

  it("pharmacy role can open hub/queue; unauthorized roles are denied", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedTenant(stamp, "b207");
    const pharm = await seedRole(ac, {
      firstName: "Pharm",
      lastName: "Tech",
      roleKey: PHARMACIST,
    });
    const denied = await seedRole(ac, {
      firstName: "Front",
      lastName: "Desk",
      roleKey: RECEPTIONIST,
    });
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const pharmCookie = await sessionCookie(pharm.identityId, ac.orgId, ac.facilityId);
    const deniedCookie = await sessionCookie(denied.identityId, ac.orgId, ac.facilityId);

    const dash = await request(app).get("/app/pharmacy").set("Cookie", pharmCookie);
    assert.equal(dash.status, 200);
    assert.match(dash.text, /data-ac-stitch="AC-B2-07"/);
    assert.match(dash.text, /ac-pharmacy-dashboard--b2|ac-ops-queue/);
    assert.match(dash.text, /data-ac-pharmacy-metrics/);

    const queue = await request(app)
      .get("/app/pharmacy/queue?status=pending")
      .set("Cookie", pharmCookie);
    assert.equal(queue.status, 200);
    assert.match(queue.text, /data-ac-stitch="AC-B2-07"/);
    assert.match(queue.text, /gp-ops-status-tabs|data-gp-ops="status-tabs"/);
    assert.match(queue.text, /Pending review|Ready to fill|Ready pickup/);
    assert.match(queue.text, /gp-ops-filter-bar|data-gp-ops="filter-bar"/);
    assert.match(queue.text, /ac-pharmacy-queue--b2|ac-ops-queue/);

    assert.equal(
      (await request(app).get("/app/pharmacy").set("Cookie", deniedCookie)).status,
      403
    );
    assert.equal(
      (await request(app).get("/app/pharmacy/queue").set("Cookie", deniedCookie)).status,
      403
    );
  });

  it("preserves lab vs radiology permission boundary on diagnostics queues", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedTenant(stamp, "b208");
    const lab = await seedRole(ac, {
      firstName: "Lab",
      lastName: "Tech",
      roleKey: LAB_TECHNICIAN,
    });
    const rad = await seedRole(ac, {
      firstName: "Rad",
      lastName: "Staff",
      roleKey: RADIOLOGY_STAFF,
    });
    const denied = await seedRole(ac, {
      firstName: "Front",
      lastName: "Desk",
      roleKey: RECEPTIONIST,
    });
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const labCookie = await sessionCookie(lab.identityId, ac.orgId, ac.facilityId);
    const radCookie = await sessionCookie(rad.identityId, ac.orgId, ac.facilityId);
    const deniedCookie = await sessionCookie(denied.identityId, ac.orgId, ac.facilityId);

    const hubLab = await request(app).get("/app/diagnostics").set("Cookie", labCookie);
    assert.equal(hubLab.status, 200);
    assert.match(hubLab.text, /data-ac-stitch="AC-B2-08"/);
    assert.match(hubLab.text, /data-ac-diagnostics-card="laboratory"/);
    assert.doesNotMatch(hubLab.text, /data-ac-diagnostics-card="radiology"/);

    const hubRad = await request(app).get("/app/diagnostics").set("Cookie", radCookie);
    assert.equal(hubRad.status, 200);
    assert.match(hubRad.text, /data-ac-stitch="AC-B2-08"/);
    assert.match(hubRad.text, /data-ac-diagnostics-card="radiology"/);
    assert.doesNotMatch(hubRad.text, /data-ac-diagnostics-card="laboratory"/);

    const labQueue = await request(app)
      .get("/app/diagnostics/laboratory/queue")
      .set("Cookie", labCookie);
    assert.equal(labQueue.status, 200);
    assert.match(labQueue.text, /data-ac-modality="laboratory"/);
    assert.match(labQueue.text, /gp-ops-status-tabs|Open queue/);

    assert.ok(
      [403, 404].includes(
        (await request(app).get("/app/diagnostics/radiology/queue").set("Cookie", labCookie))
          .status
      )
    );

    const radQueue = await request(app)
      .get("/app/diagnostics/radiology/queue")
      .set("Cookie", radCookie);
    assert.equal(radQueue.status, 200);
    assert.match(radQueue.text, /data-ac-modality="radiology"/);
    assert.match(radQueue.text, /gp-ops-status-tabs|Open queue/);

    assert.ok(
      [403, 404].includes(
        (await request(app).get("/app/diagnostics/laboratory/queue").set("Cookie", radCookie))
          .status
      )
    );

    assert.equal(
      (await request(app).get("/app/diagnostics").set("Cookie", deniedCookie)).status,
      403
    );
  });
});
