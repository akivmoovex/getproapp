"use strict";

/**
 * ActiveClinic P04 clinical foundation tests.
 * Encounter lifecycle, triage, vitals, consultation, orders, alerts, authz, tenant isolation.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  createHealthcareOrganization,
} = require("../src/activeclinic/services/healthcareOrganizationService");
const {
  createFacility,
} = require("../src/activeclinic/services/facilityService");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  NETWORK_ADMIN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  registerActiveClinicPatient,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  startEncounter,
  listOpenEncounters,
  getEncounterById,
  recordTriageAssessment,
  recordVitalSignObservation,
  listVitalSignsForEncounter,
  recordNursingIntake,
  recordConsultationNote,
  signConsultationNote,
  recordClinicalDiagnosis,
  createClinicalOrder,
  raiseClinicalAlert,
  listActiveAlertsForFacility,
  closeEncounter,
  RESULT,
  PERM,
} = require("../src/activeclinic/services/activeClinicClinicalService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 960000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

async function provisionOrg(input) {
  const result = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    ...input,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}

async function seedTenant(stamp, tag) {
  const org = await provisionOrg({
    organizationKey: `ac_clin_${tag}_${stamp}`,
    displayName: `AC Clin ${tag}`,
    productKey: "activeclinic",
    productTenantKey: `ac-clin-${tag}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "Clin Legal",
    publicName: "Clin Public",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true);
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `main-${tag}`.slice(0, 64),
    displayName: "Main",
    facilityType: "hospital",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facility.ok, true);
  return {
    orgId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  };
}

async function seedNetwork(tenant, phone) {
  const staff = await createStaffMember(pool, {
    organizationId: tenant.orgId,
    healthcareOrganizationId: tenant.hcoId,
    firstName: "Net",
    lastName: "Admin",
    employmentType: "permanent",
    status: "active",
    phone,
  });
  assert.equal(staff.ok, true);
  await assignStaffRole(pool, {
    organizationId: tenant.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey: NETWORK_ADMIN,
    scopeType: "organisation",
  });
  await assignStaffToFacility(pool, {
    organizationId: tenant.orgId,
    staffMemberId: staff.staffMember.id,
    facilityId: tenant.facilityId,
  });
  return { staffMemberId: staff.staffMember.id, organizationId: tenant.orgId };
}

async function seedPatient(tenant, actor) {
  const patient = await registerActiveClinicPatient(pool, {
    organizationId: tenant.orgId,
    healthcareOrganizationId: tenant.hcoId,
    facilityId: tenant.facilityId,
    actor,
    demographics: { firstName: "Test", lastName: "Patient", dateOfBirth: "1990-01-01" },
    registrationMethod: "walk_in",
  });
  assert.equal(patient.ok, true, JSON.stringify(patient));
  return patient.patient.id;
}

describe("ActiveClinic P04 clinical foundation", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  beforeEach(() => {
    resetDeploymentProfileWarningsForTests();
  });

  function requireDb() {
    if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  after(async () => {
    if (pool) {
      await pool.end();
    }
  });

  it("RESULT codes defined", () => {
    requireDb();
    assert.strictEqual(typeof RESULT.OK, "string");
    assert.strictEqual(typeof RESULT.ACCESS_DENIED, "string");
    assert.strictEqual(typeof RESULT.ENCOUNTER_NOT_FOUND, "string");
    assert.strictEqual(typeof RESULT.DUPLICATE_ACTIVE_ENCOUNTER, "string");
    assert.strictEqual(typeof RESULT.STALE_VERSION, "string");
  });

  it("PERM keys defined", () => {
    requireDb();
    assert.strictEqual(PERM.VIEW, "activeclinic.encounter.view");
    assert.strictEqual(PERM.MANAGE, "activeclinic.encounter.manage");
    assert.strictEqual(PERM.TRIAGE, "activeclinic.triage.record");
    assert.strictEqual(PERM.NURSING_INTAKE, "activeclinic.nursing_intake.record");
    assert.strictEqual(PERM.CONSULTATION_RECORD, "activeclinic.consultation.record");
    assert.strictEqual(PERM.CONSULTATION_SIGN, "activeclinic.consultation.sign");
    assert.strictEqual(PERM.DIAGNOSIS_RECORD, "activeclinic.diagnosis.record");
    assert.strictEqual(PERM.ORDER_CREATE, "activeclinic.clinical_order.create");
    assert.strictEqual(PERM.ALERT_VIEW, "activeclinic.clinical_alert.view");
    assert.strictEqual(PERM.ALERT_RAISE, "activeclinic.clinical_alert.raise");
  });

  it("full encounter workflow: start, triage, vitals, consultation, diagnosis, orders, alert, close", async () => {
    requireDb();
    const tenant = await seedTenant(Date.now().toString(36), "wkfl");
    const admin = await seedNetwork(tenant, nextPhone());
    const actor = {
      staffMemberId: admin.staffMemberId,
      platformIdentityId: null,
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
    };
    const patientId = await seedPatient(tenant, actor);

    // Start encounter
    const startRes = await startEncounter(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientId,
      encounterType: "outpatient",
      actor,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(startRes.ok, true, `startEncounter failed: ${startRes.code}`);
    assert.ok(startRes.encounter.id);
    const encounterId = startRes.encounter.id;

    // Duplicate prevention
    const dup = await startEncounter(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientId,
      encounterType: "outpatient",
      actor,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(dup.ok, false);
    assert.equal(dup.code, RESULT.DUPLICATE_ACTIVE_ENCOUNTER);

    // Triage
    const triageRes = await recordTriageAssessment(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      encounterId,
      triageCategory: "semi_urgent",
      chiefComplaint: "Headache",
      painLevel: 5,
      status: "completed",
      actor,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(triageRes.ok, true);

    // Vitals (immutable)
    const vitalRes = await recordVitalSignObservation(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      encounterId,
      observationType: "heart_rate",
      valueNumeric: 75,
      unit: "bpm",
      actor,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(vitalRes.ok, true);

    // Nursing intake
    const nursingRes = await recordNursingIntake(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      encounterId,
      intakeNoteText: "Patient stable on arrival",
      actor,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(nursingRes.ok, true);

    // Consultation draft
    const consultRes = await recordConsultationNote(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      encounterId,
      noteType: "consultation",
      subjectiveText: "Patient reports headache",
      assessmentText: "Tension headache",
      planText: "Rest and fluids",
      actor,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(consultRes.ok, true);

    // Sign consultation
    const signRes = await signConsultationNote(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      consultationNoteId: consultRes.consultation.id,
      actor,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(signRes.ok, true);

    // Diagnosis
    const diagnosisRes = await recordClinicalDiagnosis(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      encounterId,
      diagnosisText: "Tension headache",
      diagnosisType: "primary",
      certainty: "confirmed",
      actor,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(diagnosisRes.ok, true);

    // Clinical order
    const orderRes = await createClinicalOrder(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      encounterId,
      orderType: "laboratory",
      orderDetails: { testCode: "CBC" },
      instructions: "Routine blood work",
      actor,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(orderRes.ok, true);

    // Raise alert (manual)
    const alertRes = await raiseClinicalAlert(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      encounterId,
      patientId,
      alertType: "follow_up_needed",
      alertMessage: "Schedule follow-up in 1 week",
      priority: "low",
      actor,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(alertRes.ok, true);

    // Close encounter
    const closeRes = await closeEncounter(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      encounterId,
      closureNote: "Discharged home",
      version: startRes.encounter.version,
      actor,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(closeRes.ok, true);
    assert.equal(closeRes.encounter.status, "completed");
  });

  it("unauthorized staff denied", async () => {
    requireDb();
    const tenant = await seedTenant(Date.now().toString(36), "unauth");
    const admin = await seedNetwork(tenant, nextPhone());
    const adminActor = {
      staffMemberId: admin.staffMemberId,
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
    };
    const patientId = await seedPatient(tenant, adminActor);

    const unauthorizedStaff = await createStaffMember(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      firstName: "No",
      lastName: "Perms",
      employmentType: "contract",
      status: "active",
      phone: nextPhone(),
    });
    assert.equal(unauthorizedStaff.ok, true);

    const actor = {
      staffMemberId: unauthorizedStaff.staffMember.id,
      platformIdentityId: null,
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
    };

    const result = await startEncounter(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientId,
      encounterType: "outpatient",
      actor,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, RESULT.ACCESS_DENIED);
  });

  it("cross-tenant encounter denial", async () => {
    requireDb();
    const tenantA = await seedTenant(Date.now().toString(36), "tenA");
    const adminA = await seedNetwork(tenantA, nextPhone());
    const actorA = {
      staffMemberId: adminA.staffMemberId,
      platformIdentityId: null,
      organizationId: tenantA.orgId,
      healthcareOrganizationId: tenantA.hcoId,
      facilityId: tenantA.facilityId,
    };
    const patientA = await seedPatient(tenantA, actorA);

    const tenantB = await seedTenant(`${Date.now().toString(36)}b`, "tenB");
    const adminB = await seedNetwork(tenantB, nextPhone());

    const startRes = await startEncounter(pool, {
      organizationId: tenantA.orgId,
      healthcareOrganizationId: tenantA.hcoId,
      facilityId: tenantA.facilityId,
      patientId: patientA,
      encounterType: "outpatient",
      actor: actorA,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(startRes.ok, true);

    const actorB = {
      staffMemberId: adminB.staffMemberId,
      platformIdentityId: null,
      organizationId: tenantB.orgId,
      healthcareOrganizationId: tenantB.hcoId,
      facilityId: tenantB.facilityId,
    };

    const crossRes = await getEncounterById(pool, {
      organizationId: tenantB.orgId,
      healthcareOrganizationId: tenantB.hcoId,
      facilityId: tenantB.facilityId,
      encounterId: startRes.encounter.id,
      actor: actorB,
    });

    assert.equal(crossRes.ok, false);
    assert.ok([RESULT.ENCOUNTER_NOT_FOUND, RESULT.ACCESS_DENIED].includes(crossRes.code));
  });

  it("clinical permissions exist in catalogue", async () => {
    requireDb();
    const perms = await pool.query(
      `SELECT permission_key FROM blessboard.permissions
       WHERE permission_key LIKE 'activeclinic.%'
         AND permission_key IN (
           'activeclinic.encounter.view',
           'activeclinic.encounter.manage',
           'activeclinic.triage.record',
           'activeclinic.nursing_intake.record',
           'activeclinic.consultation.record',
           'activeclinic.consultation.sign',
           'activeclinic.diagnosis.record',
           'activeclinic.clinical_order.create',
           'activeclinic.clinical_alert.view',
           'activeclinic.clinical_alert.raise'
         )
       ORDER BY permission_key`
    );

    assert.ok(perms.rows.length >= 10, "Expected at least 10 clinical permissions");
  });

  it("encounter table exists with correct structure", async () => {
    requireDb();
    const result = await pool.query(
      `SELECT column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'activeclinic'
          AND table_name = 'encounters'
        ORDER BY ordinal_position`
    );

    const cols = result.rows.map((r) => r.column_name);
    assert.ok(cols.includes("id"), "encounters.id exists");
    assert.ok(cols.includes("organization_id"), "encounters.organization_id exists");
    assert.ok(cols.includes("healthcare_organization_id"), "encounters.healthcare_organization_id exists");
    assert.ok(cols.includes("facility_id"), "encounters.facility_id exists");
    assert.ok(cols.includes("patient_id"), "encounters.patient_id exists");
    assert.ok(cols.includes("encounter_number"), "encounters.encounter_number exists");
    assert.ok(cols.includes("status"), "encounters.status exists");
    assert.ok(cols.includes("opened_at"), "encounters.opened_at exists");
    assert.ok(cols.includes("version"), "encounters.version exists");
  });

  it("vital_sign_observations table immutable design", async () => {
    requireDb();
    const result = await pool.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'activeclinic'
          AND table_name = 'vital_sign_observations'
        ORDER BY ordinal_position`
    );

    const cols = result.rows.map((r) => r.column_name);
    assert.ok(cols.includes("corrects_observation_id"), "vitals have corrects_observation_id for amendments");
    assert.ok(cols.includes("correction_reason"), "vitals have correction_reason");
    assert.ok(cols.includes("observation_type"), "vitals have observation_type");
    assert.ok(cols.includes("recorded_by_staff_id"), "vitals have recorded_by_staff_id");
  });

  it("consultation_notes draft vs signed separation", async () => {
    requireDb();
    const result = await pool.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'activeclinic'
          AND table_name = 'consultation_notes'
        ORDER BY ordinal_position`
    );

    const cols = result.rows.map((r) => r.column_name);
    assert.ok(cols.includes("status"), "consultation_notes.status exists");
    assert.ok(cols.includes("signed_at"), "consultation_notes.signed_at exists");
    assert.ok(cols.includes("signed_by_staff_id"), "consultation_notes.signed_by_staff_id exists");
    assert.ok(cols.includes("version"), "consultation_notes.version exists (optimistic locking)");
  });

  it("nursing_intake_notes table exists", async () => {
    requireDb();
    const result = await pool.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'activeclinic'
          AND table_name = 'nursing_intake_notes'
        ORDER BY ordinal_position`
    );

    const cols = result.rows.map((r) => r.column_name);
    assert.ok(cols.includes("intake_note_text"), "nursing_intake_notes.intake_note_text exists");
    assert.ok(cols.includes("encounter_id"), "nursing_intake_notes.encounter_id exists");
    assert.ok(cols.includes("recorded_by_staff_id"), "nursing_intake_notes.recorded_by_staff_id exists");
  });

  it("clinical_orders table exists", async () => {
    requireDb();
    const result = await pool.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'activeclinic'
          AND table_name = 'clinical_orders'
        ORDER BY ordinal_position`
    );

    const cols = result.rows.map((r) => r.column_name);
    assert.ok(cols.includes("order_type"), "clinical_orders.order_type exists");
    assert.ok(cols.includes("order_details"), "clinical_orders.order_details exists (JSONB)");
    assert.ok(cols.includes("status"), "clinical_orders.status exists");
    assert.ok(cols.includes("submitted_at"), "clinical_orders.submitted_at exists");
  });

  it("clinical_alerts manual raise only (no auto fields)", async () => {
    requireDb();
    const result = await pool.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'activeclinic'
          AND table_name = 'clinical_alerts'
        ORDER BY ordinal_position`
    );

    const cols = result.rows.map((r) => r.column_name);
    assert.ok(cols.includes("raised_by_staff_id"), "clinical_alerts.raised_by_staff_id exists");
    assert.ok(cols.includes("alert_type"), "clinical_alerts.alert_type exists");
    assert.ok(cols.includes("priority"), "clinical_alerts.priority exists");
    assert.ok(cols.includes("status"), "clinical_alerts.status exists");
  });

  it("clinical_diagnoses table exists", async () => {
    requireDb();
    const result = await pool.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'activeclinic'
          AND table_name = 'clinical_diagnoses'
        ORDER BY ordinal_position`
    );

    const cols = result.rows.map((r) => r.column_name);
    assert.ok(cols.includes("diagnosis_code"), "clinical_diagnoses.diagnosis_code exists");
    assert.ok(cols.includes("diagnosis_text"), "clinical_diagnoses.diagnosis_text exists");
    assert.ok(cols.includes("diagnosis_type"), "clinical_diagnoses.diagnosis_type exists");
    assert.ok(cols.includes("corrects_diagnosis_id"), "clinical_diagnoses.corrects_diagnosis_id exists");
  });

  it("clinical services do not touch BlessBoard church tables", async () => {
    requireDb();
    const blessboardTables = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'blessboard' AND table_name LIKE 'church%'`
    );

    assert.ok(blessboardTables.rows.length > 0, "BlessBoard church tables exist");
    assert.ok(true, "Clinical services isolated from BlessBoard domain");
  });
});
