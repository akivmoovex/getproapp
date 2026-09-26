"use strict";

/**
 * ActiveClinic V2.03 Batch 2 — AC-B2-06 Clinical Encounter workspace.
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
  FACILITY_ADMIN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  registerActiveClinicPatient,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  startEncounter,
} = require("../src/activeclinic/services/activeClinicClinicalService");
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

let pool;
let skipReason = null;
let phoneSeq = 790000000;
let app;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function withCsrf(sessionCookie) {
  const csrf = issueCsrfToken(MINIMAL_AC);
  return {
    csrf,
    cookie: `${sessionCookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`,
  };
}

async function provisionClinic(label, roleKeys) {
  const stamp = `${label}_${Date.now().toString(36)}`;
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: stamp,
    displayName: `Clin ${label}`,
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

async function sessionCookie(clinic) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: clinic.identityId,
    organizationId: clinic.organizationId,
    contextJson: { selectedFacilityId: clinic.facilityId },
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

describe("ActiveClinic V2.03 Batch 2 AC-B2-06 clinical encounter", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      app = createActiveClinicFoundationApp({
        getPool: () => pool,
        env: MINIMAL_AC,
        log: () => {},
      });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("ships B2 encounter composition, SOAP layout, and 390px CSS", () => {
    const css = fs.readFileSync(
      path.join(ROOT, "public/activeclinic/ac-app.css"),
      "utf8"
    );
    assert.match(css, /\.ac-clinical-encounter--b2/);
    assert.match(css, /\.ac-clinical-encounter__layout/);
    assert.match(css, /\.ac-clinical-encounter__steps/);
    assert.match(css, /@media \(max-width: 390px\)[\s\S]*\.ac-clinical-encounter__banner/);
    assert.doesNotMatch(
      css.slice(css.lastIndexOf("AC-B2-06 Clinical Encounter")),
      /:root\s*\{[^}]*--ac-primary/
    );

    const view = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/app/consultation-workspace-content.ejs"),
      "utf8"
    );
    assert.match(view, /data-ac-stitch="AC-B2-06"/);
    assert.match(view, /data-ac-batch1="ACN15"/);
    assert.match(view, /b3d1767822e74ccd844a04947266f4c3/);
    assert.match(view, /f0a06faaa89b4ded8506f3fc67cdfa77/);
    assert.match(view, /data-ac-encounter-steps="1"/);
    assert.match(view, /data-ac-encounter-card="vitals"/);
    assert.match(view, /data-ac-encounter-card="subjective"/);
    assert.match(view, /data-ac-order-affordances="1"/);
    assert.match(view, /gp-ops-status-badge/);
    assert.match(view, /not a prescribing engine/);

    const loader = fs.readFileSync(
      path.join(ROOT, "src/activeclinic/services/loadActiveClinicClinicalScreens.js"),
      "utf8"
    );
    assert.match(loader, /b3d1767822e74ccd844a04947266f4c3/);
    assert.match(loader, /canCreateOrder/);
  });

  it("opens encounter, saves draft with persistence, completes when allowed, denies restricted roles and cross-tenant", async () => {
    requireDb();
    const clinician = await provisionClinic("b206c", [
      CLINICIAN,
      FACILITY_ADMIN,
      RECEPTIONIST,
    ]);
    const reception = await provisionClinic("b206r", [RECEPTIONIST]);
    const other = await provisionClinic("b206x", [CLINICIAN, FACILITY_ADMIN]);

    const patient = await registerActiveClinicPatient(pool, {
      organizationId: clinician.organizationId,
      healthcareOrganizationId: clinician.hcoId,
      facilityId: clinician.facilityId,
      actor: clinician.actor,
      demographics: { firstName: "Encounter", lastName: "Workspace" },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true, JSON.stringify(patient));

    const started = await startEncounter(pool, {
      organizationId: clinician.organizationId,
      healthcareOrganizationId: clinician.hcoId,
      facilityId: clinician.facilityId,
      patientId: patient.patient.id,
      actor: clinician.actor,
      encounterType: "outpatient",
    });
    assert.equal(started.ok, true, JSON.stringify(started));

    const clinCookie = await sessionCookie(clinician);
    const recCookie = await sessionCookie(reception);
    const otherCookie = await sessionCookie(other);

    const open = await request(app)
      .get(`/app/clinical/encounter/${started.encounter.id}`)
      .set("Cookie", clinCookie);
    assert.equal(open.status, 200);
    assert.match(open.text, /data-ac-stitch="AC-B2-06"/);
    assert.match(open.text, /ac-clinical-encounter--b2/);
    assert.match(open.text, /Encounter Workspace|data-ac-encounter-banner/);
    assert.match(open.text, /data-ac-action="save-draft"/);
    assert.match(open.text, /data-ac-encounter-steps="1"/);
    assert.match(open.text, /Subjective — history of present illness/i);

    const csrf = withCsrf(clinCookie);
    const saved = await request(app)
      .post(`/app/clinical/encounter/${started.encounter.id}/consultation`)
      .set("Cookie", csrf.cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf.csrf,
        intent: "save_draft",
        encounter_version: String(started.encounter.version),
        chief_complaint: "Batch2 HPI chief complaint",
        history_text: "Onset two days ago",
        observations: "Alert, oriented",
        diagnosis: "Clinical musculoskeletal strain",
        treatment_plan: "Rest and review",
        medication: "Paracetamol documented plan only",
        follow_up: "Return if worsens",
        referral: "",
      });
    assert.ok([302, 303].includes(saved.status), `save status ${saved.status}`);
    assert.match(String(saved.headers.location || ""), /updated=1/);

    const afterSave = await request(app)
      .get(`/app/clinical/encounter/${started.encounter.id}?updated=1`)
      .set("Cookie", clinCookie);
    assert.equal(afterSave.status, 200);
    assert.match(afterSave.text, /Draft saved/);
    assert.match(afterSave.text, /Batch2 HPI chief complaint/);
    assert.match(afterSave.text, /Onset two days ago/);
    assert.match(afterSave.text, /Clinical musculoskeletal strain/);
    assert.match(afterSave.text, /Draft note v/);

    const reloaded = await request(app)
      .get(`/app/clinical/encounter/${started.encounter.id}`)
      .set("Cookie", clinCookie);
    assert.equal(reloaded.status, 200);
    assert.match(reloaded.text, /Batch2 HPI chief complaint/);
    assert.match(reloaded.text, /Onset two days ago/);

    const versionMatch = reloaded.text.match(/name="version" value="(\d+)"/);
    assert.ok(versionMatch, "draft version field present");
    const encounterVersionMatch = reloaded.text.match(
      /name="encounter_version" value="(\d+)"/
    );
    assert.ok(encounterVersionMatch, "encounter version field present");

    const csrfComplete = withCsrf(clinCookie);
    const completed = await request(app)
      .post(`/app/clinical/encounter/${started.encounter.id}/complete`)
      .set("Cookie", csrfComplete.cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrfComplete.csrf,
        intent: "complete",
        version: versionMatch[1],
        encounter_version: encounterVersionMatch[1],
        chief_complaint: "Batch2 HPI chief complaint",
        history_text: "Onset two days ago",
        observations: "Alert, oriented",
        diagnosis: "Clinical musculoskeletal strain",
        treatment_plan: "Rest and review",
        medication: "Paracetamol documented plan only",
        follow_up: "Return if worsens",
        follow_up_due_at: "",
        referral: "",
      });
    assert.ok([302, 303].includes(completed.status), `complete ${completed.status}`);

    const afterComplete = await request(app)
      .get(`/app/clinical/encounter/${started.encounter.id}`)
      .set("Cookie", clinCookie);
    assert.equal(afterComplete.status, 200);
    assert.match(afterComplete.text, /completed|read-only|Encounter completed/i);
    assert.doesNotMatch(afterComplete.text, /data-ac-action="save-draft"/);

    const denied = await request(app)
      .get(`/app/clinical/encounter/${started.encounter.id}`)
      .set("Cookie", recCookie);
    assert.ok([403, 404].includes(denied.status));
    assert.doesNotMatch(denied.text, /Batch2 HPI chief complaint/);

    const cross = await request(app)
      .get(`/app/clinical/encounter/${started.encounter.id}`)
      .set("Cookie", otherCookie);
    assert.ok([403, 404].includes(cross.status));
    assert.doesNotMatch(cross.text, /Batch2 HPI chief complaint/);
  });
});
