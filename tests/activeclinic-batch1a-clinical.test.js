"use strict";

/**
 * V2.03 ACN14–16 clinical worklist, encounter workspace, follow-up + RBAC denials.
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
  CASHIER,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  registerActiveClinicPatient,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  startEncounter,
  recordConsultationNote,
  listPractitionerWorklist,
  completeEncounterWorkspace,
  RESULT,
} = require("../src/activeclinic/services/activeClinicClinicalService");
const {
  createClinicalFollowUpItem,
  listClinicalFollowUpItems,
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
let phoneSeq = 770000000;
let app;

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
  });
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

describe("ActiveClinic V2.03 ACN14–16 clinical", () => {
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
    if (pool) await pool.end();
  });

  it("ships migration, views, and Stitch markers for ACN14–16", () => {
    const migration = fs.readFileSync(
      path.join(ROOT, "db/migrations/activeclinic/039_batch1a_clinical_follow_up.sql"),
      "utf8"
    );
    assert.match(migration, /clinical_follow_up_items/);
    assert.match(migration, /history_text/);
    assert.match(migration, /medication_text/);
    assert.match(migration, /activeclinic\.clinical_follow_up_items/);
    assert.doesNotMatch(migration, /CREATE TABLE IF NOT EXISTS platform\./);

    const worklist = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/app/clinical-queue-content.ejs"),
      "utf8"
    );
    assert.match(worklist, /data-ac-stitch="ACN14"/);
    assert.match(worklist, /ae083a2bfe324046b4d9a0648c516bbd/);

    const encounter = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/app/consultation-workspace-content.ejs"),
      "utf8"
    );
    assert.match(encounter, /data-ac-stitch="ACN15"/);
    assert.match(encounter, /Save draft/);
    assert.match(encounter, /Complete encounter/);
    assert.match(encounter, /not a prescribing engine/);

    const followUp = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/app/clinical-follow-up-content.ejs"),
      "utf8"
    );
    assert.match(followUp, /data-ac-stitch="ACN16"/);
    assert.match(followUp, /0c83bbfc71b94c2f958931693345d1db/);
  });

  it("supports draft save, complete encounter, and follow-up worklist", async () => {
    requireDb();
    const clinic = await provisionClinic("clin", [CLINICIAN, RECEPTIONIST]);
    const patient = await registerActiveClinicPatient(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      actor: clinic.actor,
      demographics: { firstName: "Clinical", lastName: "Patient" },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true, JSON.stringify(patient));

    const started = await startEncounter(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      patientId: patient.patient.id,
      actor: clinic.actor,
      encounterType: "outpatient",
    });
    assert.equal(started.ok, true, JSON.stringify(started));

    const draft = await recordConsultationNote(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      encounterId: started.encounter.id,
      actor: clinic.actor,
      chiefComplaint: "Headache for 2 days",
      historyText: "No prior migraines",
      observations: "Alert, afebrile",
      diagnosis: "Tension-type headache (clinical)",
      treatmentPlan: "Rest and hydration",
      medicationText: "Paracetamol as documented plan only",
      followUpPlanText: "Review if persists 7 days",
      referralText: null,
    });
    assert.equal(draft.ok, true, JSON.stringify(draft));
    assert.equal(draft.consultation.status, "draft");
    assert.equal(draft.consultation.historyText, "No prior migraines");
    assert.equal(draft.consultation.medicationText, "Paracetamol as documented plan only");

    const worklist = await listPractitionerWorklist(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      actor: clinic.actor,
    });
    assert.equal(worklist.ok, true);
    assert.ok(worklist.worklist.incompleteEncounters.some((e) => e.id === started.encounter.id));

    const completed = await completeEncounterWorkspace(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      encounterId: started.encounter.id,
      actor: clinic.actor,
      chiefComplaint: "Headache for 2 days",
      treatmentPlan: "Rest and hydration",
      followUpPlanText: "BP check in 2 weeks",
      followUpDueAt: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      createFollowUp: true,
      encounterVersion: started.encounter.version,
      version: draft.consultation.version,
    });
    assert.equal(completed.ok, true, JSON.stringify(completed));
    assert.equal(completed.encounter.status, "completed");

    const followUps = await listClinicalFollowUpItems(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      actor: clinic.actor,
      body: {},
    });
    assert.equal(followUps.ok, true);
    assert.ok(followUps.items.length >= 1);
    assert.ok(followUps.items.every((i) => i.patientId === patient.patient.id));
  });

  it("negatively blocks reception and cashier from clinical data routes", async () => {
    requireDb();
    const reception = await provisionClinic("rec", [RECEPTIONIST]);
    const cashier = await provisionClinic("cash", [CASHIER]);
    const clinician = await provisionClinic("denyClin", [CLINICIAN, RECEPTIONIST]);

    const patient = await registerActiveClinicPatient(pool, {
      organizationId: clinician.organizationId,
      healthcareOrganizationId: clinician.hcoId,
      facilityId: clinician.facilityId,
      actor: clinician.actor,
      demographics: { firstName: "Secret", lastName: "Notes" },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true);
    const started = await startEncounter(pool, {
      organizationId: clinician.organizationId,
      healthcareOrganizationId: clinician.hcoId,
      facilityId: clinician.facilityId,
      patientId: patient.patient.id,
      actor: clinician.actor,
    });
    assert.equal(started.ok, true);
    await recordConsultationNote(pool, {
      organizationId: clinician.organizationId,
      healthcareOrganizationId: clinician.hcoId,
      facilityId: clinician.facilityId,
      encounterId: started.encounter.id,
      actor: clinician.actor,
      chiefComplaint: "Restricted clinical narrative",
      diagnosis: "Must not leak to reception or finance",
    });

    const recCookie = await sessionCookie(reception);
    const cashCookie = await sessionCookie(cashier);
    const clinCookie = await sessionCookie(clinician);

    for (const [label, cookie] of [
      ["reception", recCookie],
      ["cashier", cashCookie],
    ]) {
      const queue = await request(app).get("/app/clinical").set("Cookie", cookie);
      assert.equal(queue.status, 403, `${label} clinical queue`);
      assert.doesNotMatch(queue.text, /Restricted clinical narrative/);

      const follow = await request(app)
        .get("/app/clinical/follow-up")
        .set("Cookie", cookie);
      assert.equal(follow.status, 403, `${label} follow-up`);

      const enc = await request(app)
        .get(`/app/clinical/encounter/${started.encounter.id}`)
        .set("Cookie", cookie);
      assert.ok([403, 404].includes(enc.status), `${label} encounter ${enc.status}`);
      assert.doesNotMatch(enc.text, /Restricted clinical narrative|Must not leak/);
    }

    const allowed = await request(app)
      .get("/app/clinical")
      .set("Cookie", clinCookie);
    assert.equal(allowed.status, 200);
    assert.match(allowed.text, /data-ac-stitch="ACN14"/);

    const followAllowed = await request(app)
      .get("/app/clinical/follow-up")
      .set("Cookie", clinCookie);
    assert.equal(followAllowed.status, 200);
    assert.match(followAllowed.text, /data-ac-stitch="ACN16"/);

    const encAllowed = await request(app)
      .get(`/app/clinical/encounter/${started.encounter.id}`)
      .set("Cookie", clinCookie);
    assert.equal(encAllowed.status, 200);
    assert.match(encAllowed.text, /data-ac-stitch="ACN15"/);
    assert.match(encAllowed.text, /Restricted clinical narrative/);

    // Cross-tenant: reception of another clinic cannot open clinician encounter by id
    const cross = await request(app)
      .get(`/app/clinical/encounter/${started.encounter.id}`)
      .set("Cookie", recCookie);
    assert.ok([403, 404].includes(cross.status));
    assert.doesNotMatch(cross.text, /Restricted clinical narrative/);
  });
});
