"use strict";

/**
 * V2.03 Batch 3 — ACN20 Referral Management presentation leaf.
 * Classification B: filtered view of ACN16 pending_referral follow-up items.
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
  CLINICIAN,
  RECEPTIONIST,
  NURSE,
  CASHIER,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  registerActiveClinicPatient,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  createClinicalFollowUpItem,
} = require("../src/activeclinic/services/activeClinicClinicalFollowUpService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, issueCsrfToken } = require("../src/platform/http/v5Csrf");

const PASSWORD = "activeclinic-pass-12";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});
const ROOT = path.join(__dirname, "..");
const VIEWS = path.join(ROOT, "views", "activeclinic", "app");

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 983100000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

async function provisionClinic(label, roleKeys) {
  const stamp = `${label}_${Date.now().toString(36)}`;
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: stamp,
    displayName: `B3 ${label}`,
    productKey: "activeclinic",
    productTenantKey: stamp,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: `${label} Legal`,
    publicName: `${label} Clinic`,
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `hq-${stamp}`,
    displayName: "HQ",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
    city: "Lusaka",
  });
  await ensureDefaultDepartments(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  });
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
  });
  await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: PASSWORD,
  });
  const staff = await createStaffMember(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    firstName: "Staff",
    lastName: label,
    employmentType: "permanent",
    phone,
    status: "active",
    platformIdentityId: identity.identity.id,
    jobTitle: label,
  });
  await assignStaffToFacility(pool, {
    organizationId: org.records.organization.id,
    staffMemberId: staff.staffMember.id,
    facilityId: facility.facility.id,
    isPrimary: true,
  });
  for (const roleKey of roleKeys) {
    const role = await assignStaffRole(pool, {
      organizationId: org.records.organization.id,
      staffMemberId: staff.staffMember.id,
      roleKey,
      scopeType: "facility",
      facilityId: facility.facility.id,
    });
    assert.equal(role.ok, true, JSON.stringify(role));
  }
  return {
    organizationId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
    staffId: staff.staffMember.id,
    identityId: identity.identity.id,
    actor: {
      staffMemberId: staff.staffMember.id,
      platformIdentityId: identity.identity.id,
    },
  };
}

async function sessionCookie(identityId, orgId) {
  const session = await createPlatformIdentitySession(pool, {
    platformIdentityId: identityId,
    organizationId: orgId,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(session.ok, true);
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

function withCsrf(cookie) {
  const csrf = issueCsrfToken(MINIMAL_AC);
  return {
    cookie: `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`,
    csrf,
  };
}

async function selectFacility(app, cookie, facilityId) {
  const { cookie: selectCookie, csrf } = withCsrf(cookie);
  const res = await request(app)
    .post("/app/select-facility")
    .set("Cookie", selectCookie)
    .type("form")
    .send({ [CSRF_FIELD]: csrf, facility_id: facilityId });
  assert.equal(res.status, 303);
}

describe("V2.03 Batch 3 ACN20 referral presentation leaf", () => {
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

  it("classifies ACN20 as presentation over ACN16 pending_referral with Stitch markers", () => {
    const html = fs.readFileSync(path.join(VIEWS, "clinical-referrals-content.ejs"), "utf8");
    assert.match(html, /data-ac-batch3="ACN20"/);
    assert.match(html, /9afe2826b316421e81d56d98364e1fbf/);
    assert.match(html, /43fabf392a204db68bd229e2acc51926/);
    assert.match(html, /data-ac-classification=/);
    assert.match(html, /classification \|\| 'B'/);
    assert.match(html, /ACN16_pending_referral/);
    assert.match(html, /data-ac-referrals-desktop/);
    assert.match(html, /data-ac-referrals-mobile/);
    assert.match(html, /data-ac-omitted="demo-only"/);
    assert.match(html, /Omitted Stitch/);
    assert.doesNotMatch(html, /action="[^"]*outbound|id="new-outbound-referral"/i);

    const followUp = fs.readFileSync(path.join(VIEWS, "clinical-follow-up-content.ejs"), "utf8");
    assert.match(followUp, /data-ac-stitch="ACN16"/);
    assert.doesNotMatch(followUp, /data-ac-batch3="ACN20"/);

    const encounter = fs.readFileSync(path.join(VIEWS, "consultation-workspace-content.ejs"), "utf8");
    assert.match(encounter, /data-ac-stitch="AC-B2-06"/);
    assert.doesNotMatch(encounter, /data-ac-batch3="ACN20"/);

    const css = fs.readFileSync(path.join(ROOT, "public/activeclinic/ac-app.css"), "utf8");
    assert.match(css, /\.ac-clinical-referrals/);
    assert.match(css, /@media \(max-width:\s*390px\)[\s\S]*\.ac-clinical-referrals/);
  });

  it("renders ACN20 for clinical roles, reuses follow-up status POST, denies cashier, isolates tenants", async () => {
    requireDb();
    resetDeploymentProfileWarningsForTests();
    const clinical = await provisionClinic("ref", [RECEPTIONIST, NURSE, CLINICIAN]);
    const other = await provisionClinic("refx", [RECEPTIONIST, CLINICIAN]);

    const patient = await registerActiveClinicPatient(pool, {
      organizationId: clinical.organizationId,
      healthcareOrganizationId: clinical.hcoId,
      facilityId: clinical.facilityId,
      actor: clinical.actor,
      demographics: { firstName: "Ref", lastName: "Patient" },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true, JSON.stringify(patient));

    const created = await createClinicalFollowUpItem(pool, {
      organizationId: clinical.organizationId,
      healthcareOrganizationId: clinical.hcoId,
      facilityId: clinical.facilityId,
      patientId: patient.patient.id,
      actor: clinical.actor,
      itemType: "pending_referral",
      title: "Cardiac rehab referral",
      reason: "Phase II rehab post PCI",
      urgency: "routine",
      body: {},
      query: {},
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(created.ok, true, JSON.stringify(created));

    const otherPatient = await registerActiveClinicPatient(pool, {
      organizationId: other.organizationId,
      healthcareOrganizationId: other.hcoId,
      facilityId: other.facilityId,
      actor: other.actor,
      demographics: { firstName: "Other", lastName: "Tenant" },
      registrationMethod: "walk_in",
    });
    assert.equal(otherPatient.ok, true, JSON.stringify(otherPatient));
    const otherItem = await createClinicalFollowUpItem(pool, {
      organizationId: other.organizationId,
      healthcareOrganizationId: other.hcoId,
      facilityId: other.facilityId,
      patientId: otherPatient.patient.id,
      actor: other.actor,
      itemType: "pending_referral",
      title: "Foreign referral",
      reason: "Should not leak",
      body: {},
      query: {},
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(otherItem.ok, true, JSON.stringify(otherItem));

    const app = createActiveClinicFoundationApp({
      env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
      getPool: () => pool,
      isProduction: false,
    });

    const cookie = await sessionCookie(clinical.identityId, clinical.organizationId);
    await selectFacility(app, cookie, clinical.facilityId);

    const list = await request(app)
      .get("/app/clinical/referrals")
      .set("Cookie", cookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /data-ac-batch3="ACN20"/);
    assert.match(list.text, /Cardiac rehab referral/);
    assert.match(list.text, /ac-app\.css\?v=v2-03-b3-acn20-01/);
    assert.doesNotMatch(list.text, /Foreign referral/);

    const followUp = await request(app)
      .get("/app/clinical/follow-up")
      .set("Cookie", cookie);
    assert.equal(followUp.status, 200);
    assert.match(followUp.text, /data-ac-stitch="ACN16"/);
    assert.match(followUp.text, /Cardiac rehab referral/);

    const { cookie: postCookie, csrf } = withCsrf(cookie);
    const marked = await request(app)
      .post(`/app/clinical/follow-up/${created.item.id}/status`)
      .set("Cookie", postCookie)
      .type("form")
      .redirects(0)
      .send({
        [CSRF_FIELD]: csrf,
        version: created.item.version,
        status: "completed",
        return_to: "/app/clinical/referrals",
      });
    assert.equal(marked.status, 303);
    assert.match(String(marked.headers.location || ""), /\/app\/clinical\/referrals/);

    const denyPhone = nextPhone();
    const denyIdentity = await createPlatformIdentity(pool, {
      primaryPhone: denyPhone,
      phoneNormalized: denyPhone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    await setPlatformIdentityPassword(pool, {
      identityId: denyIdentity.identity.id,
      password: PASSWORD,
    });
    const cashier = await createStaffMember(pool, {
      organizationId: clinical.organizationId,
      healthcareOrganizationId: clinical.hcoId,
      firstName: "Cash",
      lastName: "Deny",
      employmentType: "permanent",
      phone: denyPhone,
      status: "active",
      platformIdentityId: denyIdentity.identity.id,
      jobTitle: "Cashier",
    });
    await assignStaffToFacility(pool, {
      organizationId: clinical.organizationId,
      staffMemberId: cashier.staffMember.id,
      facilityId: clinical.facilityId,
      isPrimary: true,
    });
    await assignStaffRole(pool, {
      organizationId: clinical.organizationId,
      staffMemberId: cashier.staffMember.id,
      roleKey: CASHIER,
      scopeType: "facility",
      facilityId: clinical.facilityId,
    });
    const denyCookie = await sessionCookie(denyIdentity.identity.id, clinical.organizationId);
    await selectFacility(app, denyCookie, clinical.facilityId);
    const denied = await request(app)
      .get("/app/clinical/referrals")
      .set("Cookie", denyCookie);
    assert.ok([403, 302, 303].includes(denied.status));
    assert.doesNotMatch(String(denied.text || ""), /Cardiac rehab referral/);
  });
});
