"use strict";

/**
 * AC-SEC-02 — Receptionist denied restricted clinical encounter notes.
 *
 * Catalogue already omits clinical perms for activeclinic_receptionist
 * (088_activeclinic_rbac_role_catalogue). This suite proves server-side
 * denial for same-tenant direct URLs, note mutations, and JSON Accept,
 * without relying on UI hiding. No catalogue change unless a grant is found.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
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
  resolveEffectivePermissions,
  CLINICIAN,
  RECEPTIONIST,
  NURSE,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  registerActiveClinicPatient,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  startEncounter,
  recordConsultationNote,
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

const PASSWORD = "AcSec02-Pass-12!";
const SECRET_COMPLAINT = "ACSEC02_RESTRICTED_CHIEF_COMPLAINT_MARK";
const SECRET_DIAGNOSIS = "ACSEC02_RESTRICTED_DIAGNOSIS_MARK";
const CLINICAL_DENY_PERMS = Object.freeze([
  "activeclinic.encounter.view",
  "activeclinic.encounter.manage",
  "activeclinic.consultation.record",
  "activeclinic.consultation.sign",
  "activeclinic.triage.record",
  "activeclinic.nursing_intake.record",
  "activeclinic.diagnosis.record",
  "activeclinic.clinical_order.create",
  "activeclinic.clinical_alert.view",
  "activeclinic.clinical_alert.raise",
]);

const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let skipReason = null;
let phoneSeq = 883300000;
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

function assertNoNoteLeak(res, label) {
  assert.doesNotMatch(
    String(res.text || ""),
    new RegExp(`${SECRET_COMPLAINT}|${SECRET_DIAGNOSIS}`),
    `${label}: must not leak restricted note body`
  );
}

async function countConsultationNotes(organizationId, encounterId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM activeclinic.consultation_notes
      WHERE organization_id = $1 AND encounter_id = $2`,
    [organizationId, encounterId]
  );
  return r.rows[0].n;
}

async function seedStaff(ctx, label, roleKey, facilityId) {
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryEmail: `${label}.${phone.slice(-8)}@acsec02.test`,
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
  });
  assert.equal(identity.ok, true, JSON.stringify(identity));
  await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: PASSWORD,
  });
  const staff = await createStaffMember(pool, {
    organizationId: ctx.organizationId,
    healthcareOrganizationId: ctx.hcoId,
    firstName: label,
    lastName: "Sec02",
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
    jobTitle: label,
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  await assignStaffToFacility(pool, {
    organizationId: ctx.organizationId,
    staffMemberId: staff.staffMember.id,
    facilityId,
    isPrimary: true,
  });
  const role = await assignStaffRole(pool, {
    organizationId: ctx.organizationId,
    staffMemberId: staff.staffMember.id,
    roleKey,
    scopeType: "facility",
    facilityId,
    assignmentOrigin: "system",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(role.ok, true, JSON.stringify(role));
  return {
    identityId: identity.identity.id,
    staffMemberId: staff.staffMember.id,
    facilityId,
    actor: {
      staffMemberId: staff.staffMember.id,
      platformIdentityId: identity.identity.id,
    },
  };
}

async function sessionCookie(organizationId, identityId, facilityId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId,
    contextJson: { selectedFacilityId: facilityId },
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

async function provisionClinic(stamp) {
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `ac_sec02_${stamp}`,
    displayName: `SEC02 ${stamp}`,
    productKey: "activeclinic",
    productTenantKey: `ac-sec02-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: `${stamp} Legal`,
    publicName: `${stamp} Clinic`,
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true);
  const facilityA = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `a-${stamp}`,
    displayName: "Facility A",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facilityA.ok, true);
  const facilityB = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `b-${stamp}`,
    displayName: "Facility B",
    facilityType: "clinic",
    status: "active",
    isPrimary: false,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facilityB.ok, true);
  await ensureDefaultDepartments(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityId: facilityA.facility.id,
  });
  await ensureDefaultDepartments(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityId: facilityB.facility.id,
  });
  return {
    organizationId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityAId: facilityA.facility.id,
    facilityBId: facilityB.facility.id,
  };
}

describe("AC-SEC-02 receptionist denied restricted clinical notes", () => {
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

  it("catalogue: receptionist lacks clinical permissions (no accidental grant)", async () => {
    requireDb();
    const clinic = await provisionClinic("cat");
    const reception = await seedStaff(
      clinic,
      "rec",
      RECEPTIONIST,
      clinic.facilityAId
    );
    const resolved = await resolveEffectivePermissions(pool, {
      organizationId: clinic.organizationId,
      staffMemberId: reception.staffMemberId,
      platformIdentityId: reception.identityId,
      facilityId: clinic.facilityAId,
    });
    assert.equal(resolved.ok, true, JSON.stringify(resolved));
    for (const key of CLINICAL_DENY_PERMS) {
      assert.equal(
        resolved.permissions.includes(key),
        false,
        `receptionist must not have ${key}`
      );
    }
    assert.ok(
      resolved.permissions.includes("activeclinic.patient.view"),
      "receptionist retains patient.view"
    );
    assert.ok(
      resolved.permissions.includes("activeclinic.reception.view"),
      "receptionist retains reception.view"
    );
  });

  it("same-tenant receptionist: direct URL + note POST denied; no body leak; no mutation", async () => {
    requireDb();
    const clinic = await provisionClinic("same");
    const clinician = await seedStaff(clinic, "doc", CLINICIAN, clinic.facilityAId);
    // Facility admin needed only so clinician can manage encounter start if required;
    // startEncounter is called via service with actor.
    const reception = await seedStaff(
      clinic,
      "front",
      RECEPTIONIST,
      clinic.facilityAId
    );

    const patient = await registerActiveClinicPatient(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityAId,
      actor: reception.actor,
      demographics: { firstName: "Sec02", lastName: "Patient" },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true, JSON.stringify(patient));

    const started = await startEncounter(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityAId,
      patientId: patient.patient.id,
      actor: clinician.actor,
      encounterType: "outpatient",
    });
    assert.equal(started.ok, true, JSON.stringify(started));

    const draft = await recordConsultationNote(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityAId,
      encounterId: started.encounter.id,
      actor: clinician.actor,
      chiefComplaint: SECRET_COMPLAINT,
      diagnosis: SECRET_DIAGNOSIS,
      observations: "Alert",
      treatmentPlan: "Rest",
    });
    assert.equal(draft.ok, true, JSON.stringify(draft));
    const noteCountBefore = await countConsultationNotes(
      clinic.organizationId,
      started.encounter.id
    );
    assert.ok(noteCountBefore >= 1);

    const clinCookie = await sessionCookie(
      clinic.organizationId,
      clinician.identityId,
      clinic.facilityAId
    );
    const recCookie = await sessionCookie(
      clinic.organizationId,
      reception.identityId,
      clinic.facilityAId
    );

    // A — authorized practitioner can read note body
    const allowed = await request(app)
      .get(`/app/clinical/encounter/${started.encounter.id}`)
      .set("Cookie", clinCookie);
    assert.equal(allowed.status, 200);
    assert.match(allowed.text, new RegExp(SECRET_COMPLAINT));
    assert.match(allowed.text, new RegExp(SECRET_DIAGNOSIS));

    // B — receptionist denied encounter detail (direct URL)
    const enc = await request(app)
      .get(`/app/clinical/encounter/${started.encounter.id}`)
      .set("Cookie", recCookie);
    assert.equal(enc.status, 403, `reception encounter GET ${enc.status}`);
    assertNoNoteLeak(enc, "reception encounter GET");

    // C — JSON Accept still denies without note payload
    const encJson = await request(app)
      .get(`/app/clinical/encounter/${started.encounter.id}`)
      .set("Cookie", recCookie)
      .set("Accept", "application/json");
    assert.equal(encJson.status, 403);
    assertNoNoteLeak(encJson, "reception encounter JSON Accept");
    assert.doesNotMatch(String(encJson.text || ""), /"chiefComplaint"|"subjective"/i);

    // D — clinical queue / follow-up
    for (const path of ["/app/clinical", "/app/clinical/follow-up", "/app/clinical/referrals"]) {
      const res = await request(app).get(path).set("Cookie", recCookie);
      assert.equal(res.status, 403, `reception ${path}`);
      assertNoNoteLeak(res, `reception ${path}`);
    }

    // E — nursing intake / triage / vitals / order form (note-adjacent)
    for (const path of [
      `/app/clinical/encounter/${started.encounter.id}/nursing-intake`,
      `/app/clinical/encounter/${started.encounter.id}/triage`,
      `/app/clinical/encounter/${started.encounter.id}/vitals`,
      `/app/clinical/encounter/${started.encounter.id}/order/prescription`,
    ]) {
      const res = await request(app).get(path).set("Cookie", recCookie);
      assert.equal(res.status, 403, `reception ${path}`);
      assertNoNoteLeak(res, `reception ${path}`);
    }

    // F — patient clinical-history leaf (patient.view alone must not expose notes)
    const history = await request(app)
      .get(`/app/patients/${encodeURIComponent(patient.patient.patientNumber)}/clinical-history`)
      .set("Cookie", recCookie);
    assert.equal(history.status, 403);
    assertNoNoteLeak(history, "reception clinical-history");

    // G — note create/update POST denied; no mutation
    const csrf = withCsrf(recCookie);
    const saveAttempt = await request(app)
      .post(`/app/clinical/encounter/${started.encounter.id}/consultation`)
      .set("Cookie", csrf.cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf.csrf,
        chief_complaint: "RECEPTION_FORGED_NOTE_BODY",
        diagnosis: "RECEPTION_FORGED_DX",
        version: String(draft.consultation.version),
      });
    assert.equal(saveAttempt.status, 403);
    assertNoNoteLeak(saveAttempt, "reception consultation POST");
    assert.doesNotMatch(String(saveAttempt.text || ""), /RECEPTION_FORGED/);

    const signAttempt = await request(app)
      .post(
        `/app/clinical/encounter/${started.encounter.id}/consultation/${draft.consultation.id}/sign`
      )
      .set("Cookie", csrf.cookie)
      .type("form")
      .send({ [CSRF_FIELD]: csrf.csrf });
    assert.equal(signAttempt.status, 403);
    assertNoNoteLeak(signAttempt, "reception sign POST");

    const completeAttempt = await request(app)
      .post(`/app/clinical/encounter/${started.encounter.id}/complete`)
      .set("Cookie", csrf.cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf.csrf,
        chief_complaint: "RECEPTION_COMPLETE_FORGE",
        encounter_version: String(started.encounter.version),
      });
    assert.equal(completeAttempt.status, 403);
    assertNoNoteLeak(completeAttempt, "reception complete POST");

    const noteCountAfter = await countConsultationNotes(
      clinic.organizationId,
      started.encounter.id
    );
    assert.equal(noteCountAfter, noteCountBefore, "no consultation note mutation");

    const forgedStillAbsent = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM activeclinic.consultation_notes
        WHERE organization_id = $1
          AND encounter_id = $2
          AND (
            COALESCE(subjective_text, '') ILIKE '%RECEPTION_FORGED%'
            OR COALESCE(assessment_text, '') ILIKE '%RECEPTION_FORGED%'
            OR COALESCE(subjective_text, '') ILIKE '%RECEPTION_COMPLETE%'
            OR COALESCE(assessment_text, '') ILIKE '%RECEPTION_COMPLETE%'
          )`,
      [clinic.organizationId, started.encounter.id]
    );
    assert.equal(forgedStillAbsent.rows[0].n, 0);

    // H — reception demographic / booking surfaces still work
    const patients = await request(app).get("/app/patients").set("Cookie", recCookie);
    assert.equal(patients.status, 200, "reception patient directory");
    assertNoNoteLeak(patients, "reception patients list");

    const profile = await request(app)
      .get(`/app/patients/${encodeURIComponent(patient.patient.patientNumber)}`)
      .set("Cookie", recCookie);
    assert.equal(profile.status, 200, "reception patient profile");
    assertNoNoteLeak(profile, "reception patient profile");

    const receptionQueue = await request(app)
      .get("/app/reception")
      .set("Cookie", recCookie);
    assert.ok(
      [200, 302, 303].includes(receptionQueue.status),
      `reception queue status ${receptionQueue.status}`
    );
    if (receptionQueue.status === 200) {
      assertNoNoteLeak(receptionQueue, "reception queue");
    }
  });

  it("nurse follows catalogue: can view encounter; cannot sign consultation", async () => {
    requireDb();
    const clinic = await provisionClinic("nurse");
    const clinician = await seedStaff(clinic, "md", CLINICIAN, clinic.facilityAId);
    const nurse = await seedStaff(clinic, "rn", NURSE, clinic.facilityAId);
    const reception = await seedStaff(
      clinic,
      "desk",
      RECEPTIONIST,
      clinic.facilityAId
    );

    const patient = await registerActiveClinicPatient(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityAId,
      actor: reception.actor,
      demographics: { firstName: "Nurse", lastName: "Scope" },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true, JSON.stringify(patient));

    const started = await startEncounter(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityAId,
      patientId: patient.patient.id,
      actor: clinician.actor,
      encounterType: "outpatient",
    });
    assert.equal(started.ok, true);

    const draft = await recordConsultationNote(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityAId,
      encounterId: started.encounter.id,
      actor: clinician.actor,
      chiefComplaint: SECRET_COMPLAINT,
      diagnosis: SECRET_DIAGNOSIS,
    });
    assert.equal(draft.ok, true);

    const nursePerms = await resolveEffectivePermissions(pool, {
      organizationId: clinic.organizationId,
      staffMemberId: nurse.staffMemberId,
      platformIdentityId: nurse.identityId,
      facilityId: clinic.facilityAId,
    });
    assert.equal(nursePerms.ok, true);
    assert.ok(nursePerms.permissions.includes("activeclinic.encounter.view"));
    assert.ok(nursePerms.permissions.includes("activeclinic.nursing_intake.record"));
    assert.equal(
      nursePerms.permissions.includes("activeclinic.consultation.sign"),
      false
    );
    assert.equal(
      nursePerms.permissions.includes("activeclinic.consultation.record"),
      false
    );

    const nurseCookie = await sessionCookie(
      clinic.organizationId,
      nurse.identityId,
      clinic.facilityAId
    );

    const view = await request(app)
      .get(`/app/clinical/encounter/${started.encounter.id}`)
      .set("Cookie", nurseCookie);
    assert.equal(view.status, 200);
    assert.match(view.text, new RegExp(SECRET_COMPLAINT));

    const csrf = withCsrf(nurseCookie);
    const signDenied = await request(app)
      .post(
        `/app/clinical/encounter/${started.encounter.id}/consultation/${draft.consultation.id}/sign`
      )
      .set("Cookie", csrf.cookie)
      .type("form")
      .send({ [CSRF_FIELD]: csrf.csrf });
    assert.equal(signDenied.status, 403);

    const recordDenied = await request(app)
      .post(`/app/clinical/encounter/${started.encounter.id}/consultation`)
      .set("Cookie", csrf.cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf.csrf,
        chief_complaint: "NURSE_SHOULD_NOT_WRITE_CONSULT",
      });
    assert.equal(recordDenied.status, 403);
  });

  it("tenant and facility scope: foreign org and wrong facility conceal note body", async () => {
    requireDb();
    const clinicA = await provisionClinic("tenA");
    const clinicB = await provisionClinic("tenB");
    const clinicianA = await seedStaff(
      clinicA,
      "docA",
      CLINICIAN,
      clinicA.facilityAId
    );
    const receptionA = await seedStaff(
      clinicA,
      "recA",
      RECEPTIONIST,
      clinicA.facilityAId
    );
    // Same-org clinician scoped only to facility B
    const clinicianBOnly = await seedStaff(
      clinicA,
      "docB",
      CLINICIAN,
      clinicA.facilityBId
    );
    const foreignClinician = await seedStaff(
      clinicB,
      "docX",
      CLINICIAN,
      clinicB.facilityAId
    );

    const patient = await registerActiveClinicPatient(pool, {
      organizationId: clinicA.organizationId,
      healthcareOrganizationId: clinicA.hcoId,
      facilityId: clinicA.facilityAId,
      actor: receptionA.actor,
      demographics: { firstName: "Scope", lastName: "Tenant" },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true, JSON.stringify(patient));

    const started = await startEncounter(pool, {
      organizationId: clinicA.organizationId,
      healthcareOrganizationId: clinicA.hcoId,
      facilityId: clinicA.facilityAId,
      patientId: patient.patient.id,
      actor: clinicianA.actor,
      encounterType: "outpatient",
    });
    assert.equal(started.ok, true);

    await recordConsultationNote(pool, {
      organizationId: clinicA.organizationId,
      healthcareOrganizationId: clinicA.hcoId,
      facilityId: clinicA.facilityAId,
      encounterId: started.encounter.id,
      actor: clinicianA.actor,
      chiefComplaint: SECRET_COMPLAINT,
      diagnosis: SECRET_DIAGNOSIS,
    });

    const foreignCookie = await sessionCookie(
      clinicB.organizationId,
      foreignClinician.identityId,
      clinicB.facilityAId
    );
    const wrongFacilityCookie = await sessionCookie(
      clinicA.organizationId,
      clinicianBOnly.identityId,
      clinicA.facilityBId
    );

    const crossTenant = await request(app)
      .get(`/app/clinical/encounter/${started.encounter.id}`)
      .set("Cookie", foreignCookie);
    assert.ok([403, 404].includes(crossTenant.status), `cross ${crossTenant.status}`);
    assertNoNoteLeak(crossTenant, "cross-tenant encounter");

    const wrongFacility = await request(app)
      .get(`/app/clinical/encounter/${started.encounter.id}`)
      .set("Cookie", wrongFacilityCookie);
    assert.ok(
      [403, 404].includes(wrongFacility.status),
      `wrong facility ${wrongFacility.status}`
    );
    assertNoNoteLeak(wrongFacility, "wrong-facility encounter");
  });

  it("unauthenticated access to encounter is redirected or denied without note body", async () => {
    requireDb();
    const clinic = await provisionClinic("anon");
    const clinician = await seedStaff(
      clinic,
      "docAnon",
      CLINICIAN,
      clinic.facilityAId
    );
    const reception = await seedStaff(
      clinic,
      "recAnon",
      RECEPTIONIST,
      clinic.facilityAId
    );

    const patient = await registerActiveClinicPatient(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityAId,
      actor: reception.actor,
      demographics: { firstName: "Anon", lastName: "Gate" },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true, JSON.stringify(patient));
    const started = await startEncounter(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityAId,
      patientId: patient.patient.id,
      actor: clinician.actor,
      encounterType: "outpatient",
    });
    assert.equal(started.ok, true, JSON.stringify(started));
    await recordConsultationNote(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityAId,
      encounterId: started.encounter.id,
      actor: clinician.actor,
      chiefComplaint: SECRET_COMPLAINT,
      diagnosis: SECRET_DIAGNOSIS,
    });

    const anon = await request(app).get(
      `/app/clinical/encounter/${started.encounter.id}`
    );
    assert.ok(
      [303, 302, 401, 403].includes(anon.status),
      `anon status ${anon.status}`
    );
    assertNoNoteLeak(anon, "unauthenticated encounter");
  });
});
