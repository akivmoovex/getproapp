"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  startEncounter,
  closeEncounter,
  recordTriageAssessment,
  signConsultationNote,
  RESULT: CLINICAL,
} = require("../../../src/activeclinic/services/activeClinicClinicalService");
const {
  createQueueEntry,
  callNextQueueEntry,
  transferQueueEntry,
  RESULT: QUEUE,
} = require("../../../src/activeclinic/services/activeClinicReceptionService");

const ORG = "11111111-1111-4111-8111-111111111111";
const HCO = "22222222-2222-4222-8222-222222222222";
const FACILITY = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";
const PATIENT = "55555555-5555-4555-8555-555555555555";
const STAFF = "66666666-6666-4666-8666-666666666666";
const ENC = "77777777-7777-4777-8777-777777777777";
const NOTE = "88888888-8888-4888-8888-888888888888";
const ENTRY = "99999999-9999-4999-8999-999999999999";
const POINT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ARRIVAL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const PERMISSIONS = [
  "activeclinic.encounter.manage",
  "activeclinic.encounter.view",
  "activeclinic.triage.record",
  "activeclinic.consultation.sign",
  "activeclinic.reception.view",
  "activeclinic.reception.manage_queue",
  "activeclinic.reception.call_next",
  "activeclinic.reception.transfer",
];

function staffRow() {
  return { id: STAFF, organization_id: ORG, status: "active" };
}

function authDb(decide) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      const text = String(sql);
      calls.push({ text, params });
      if (text.includes("platform.organization_products")) {
        return {
          rows: [{
            status: "active",
            organization_status: "active",
            product_status: "active",
            organization_id: ORG,
          }],
        };
      }
      if (text.includes("activeclinic.healthcare_organizations")) {
        return { rows: [{ id: HCO, organization_id: ORG, status: "active" }] };
      }
      if (text.includes("activeclinic.staff_members")) {
        return { rows: [staffRow()] };
      }
      if (text.includes("permission_key")) {
        return { rows: PERMISSIONS.map((permission_key) => ({ permission_key })) };
      }
      if (text.includes("staff_role_assignments")) {
        return {
          rows: [{
            status: "active",
            scope_type: "organisation",
            role_key: "activeclinic_network_admin",
            facility_id: null,
          }],
        };
      }
      if (text.startsWith("BEGIN") || text.startsWith("COMMIT") || text.startsWith("ROLLBACK")) {
        return { rows: [] };
      }
      return decide(text, params || []);
    },
  };
}

describe("D73 encounters, queues and nursing", () => {
  it("rejects an encounter with no staff member before a query", async () => {
    let queries = 0;
    const result = await startEncounter(
      { async query() { queries += 1; throw new Error("db_not_allowed"); } },
      {
        encounterType: "outpatient",
        organizationId: ORG,
        healthcareOrganizationId: HCO,
        facilityId: FACILITY,
        patientId: PATIENT,
      }
    );
    assert.equal(result.code, CLINICAL.INVALID_INPUT);
    assert.equal(result.encounter, null);
    assert.equal(queries, 0);
  });

  it("does not open an encounter for a facility outside the organization", async () => {
    const db = authDb(() => ({ rows: [] }));
    const result = await startEncounter(db, {
      encounterType: "outpatient",
      organizationId: ORG,
      healthcareOrganizationId: HCO,
      facilityId: OTHER,
      patientId: PATIENT,
      actor: { staffMemberId: STAFF },
    });
    assert.equal(result.code, CLINICAL.FACILITY_NOT_FOUND);
    assert.equal(db.calls.some((call) => call.text.includes("INSERT INTO activeclinic.encounters")), false);
  });

  it("does not open a second encounter while one is already open", async () => {
    const db = authDb((text) => {
      if (text.includes("SELECT id FROM activeclinic.facilities")) return { rows: [{ id: FACILITY }] };
      if (text.includes("SELECT id FROM activeclinic.patients")) return { rows: [{ id: PATIENT }] };
      if (text.includes("SELECT id FROM activeclinic.encounters")) return { rows: [{ id: ENC }] };
      return { rows: [] };
    });
    const result = await startEncounter(db, {
      encounterType: "emergency",
      organizationId: ORG,
      healthcareOrganizationId: HCO,
      facilityId: FACILITY,
      patientId: PATIENT,
      actor: { staffMemberId: STAFF },
    });
    assert.equal(result.code, CLINICAL.DUPLICATE_ACTIVE_ENCOUNTER);
    assert.equal(db.calls.some((call) => call.text.includes("INSERT INTO activeclinic.encounters")), false);
  });

  it("records the staff member who opened the encounter", async () => {
    const db = authDb((text, params) => {
      if (text.includes("SELECT id FROM activeclinic.facilities")) return { rows: [{ id: FACILITY }] };
      if (text.includes("SELECT id FROM activeclinic.patients")) return { rows: [{ id: PATIENT }] };
      if (text.includes("SELECT id FROM activeclinic.encounters")) return { rows: [] };
      if (text.includes("INSERT INTO activeclinic.encounters")) {
        return {
          rows: [{
            id: ENC,
            organization_id: ORG,
            healthcare_organization_id: HCO,
            facility_id: FACILITY,
            patient_id: PATIENT,
            encounter_type: "outpatient",
            status: "open",
            opened_by_staff_id: params[7],
            version: 1,
          }],
        };
      }
      return { rows: [] };
    });
    const result = await startEncounter(db, {
      encounterType: "outpatient",
      organizationId: ORG,
      healthcareOrganizationId: HCO,
      facilityId: FACILITY,
      patientId: PATIENT,
      actor: { staffMemberId: STAFF },
    });
    assert.equal(result.code, CLINICAL.OK);
    assert.equal(result.encounter.openedByStaffId, STAFF);
    const event = db.calls.find((call) => call.text.includes("INSERT INTO activeclinic.encounter_events"));
    assert.equal(event.params[4], STAFF);
    assert.equal(event.params[3], "opened");
  });

  it("rejects a pain level outside 0 to 10 before a query", async () => {
    let queries = 0;
    const low = await recordTriageAssessment(
      { async query() { queries += 1; throw new Error("db_not_allowed"); } },
      { painLevel: -1, triageCategory: "urgent", status: "draft" }
    );
    const high = await recordTriageAssessment(
      { async query() { queries += 1; throw new Error("db_not_allowed"); } },
      { painLevel: 11, triageCategory: "urgent", status: "draft" }
    );
    assert.equal(low.code, CLINICAL.INVALID_INPUT);
    assert.equal(high.code, CLINICAL.INVALID_INPUT);
    assert.equal(queries, 0);
  });

  it("does not update triage for another facility", async () => {
    const db = authDb((text) => {
      if (text.includes("JOIN activeclinic.patients")) {
        return {
          rows: [{
            id: ENC,
            organization_id: ORG,
            facility_id: FACILITY,
            patient_id: PATIENT,
            status: "open",
            encounter_type: "outpatient",
            opened_by_staff_id: STAFF,
            version: 1,
          }],
        };
      }
      if (text.includes("FROM activeclinic.triage_assessments")) {
        return { rows: [{ id: NOTE, facility_id: OTHER, version: 1, status: "draft" }] };
      }
      throw new Error("update_not_allowed");
    });
    const result = await recordTriageAssessment(db, {
      organizationId: ORG,
      healthcareOrganizationId: HCO,
      facilityId: FACILITY,
      encounterId: ENC,
      painLevel: 4,
      triageCategory: "urgent",
      status: "draft",
      chiefComplaint: "Pain",
      actor: { staffMemberId: STAFF },
    });
    assert.equal(result.code, CLINICAL.ACCESS_DENIED);
    assert.equal(result.triage, null);
  });

  it("rejects a stale triage version", async () => {
    const db = authDb((text) => {
      if (text.includes("JOIN activeclinic.patients")) {
        return {
          rows: [{
            id: ENC,
            organization_id: ORG,
            facility_id: FACILITY,
            patient_id: PATIENT,
            status: "open",
            encounter_type: "outpatient",
            opened_by_staff_id: STAFF,
            version: 2,
          }],
        };
      }
      if (text.includes("FROM activeclinic.triage_assessments")) {
        return { rows: [{ id: NOTE, facility_id: FACILITY, version: 2, status: "draft" }] };
      }
      if (text.includes("UPDATE activeclinic.triage_assessments")) return { rows: [] };
      return { rows: [] };
    });
    const result = await recordTriageAssessment(db, {
      organizationId: ORG,
      healthcareOrganizationId: HCO,
      facilityId: FACILITY,
      encounterId: ENC,
      painLevel: 0,
      triageCategory: "non_urgent",
      status: "completed",
      version: 1,
      actor: { staffMemberId: STAFF },
    });
    assert.equal(result.code, CLINICAL.STALE_VERSION);
    const update = db.calls.find((call) => call.text.includes("UPDATE activeclinic.triage_assessments"));
    assert.equal(update.params[9], 1);
    assert.equal(update.params[11], FACILITY);
  });

  it("does not sign a consultation note from another facility", async () => {
    const db = authDb((text, params) => {
      if (text.includes("FROM activeclinic.consultation_notes") && params[2] !== FACILITY) {
        return { rows: [] };
      }
      if (text.includes("UPDATE activeclinic.consultation_notes")) throw new Error("sign_not_allowed");
      return { rows: [] };
    });
    const result = await signConsultationNote(db, {
      organizationId: ORG,
      facilityId: OTHER,
      consultationNoteId: NOTE,
      actor: { staffMemberId: STAFF },
    });
    assert.equal(result.code, CLINICAL.CONSULTATION_NOT_FOUND);
  });

  it("does not sign a note that is already signed", async () => {
    const db = authDb((text) => {
      if (text.includes("FROM activeclinic.consultation_notes")) {
        return { rows: [{ id: NOTE, organization_id: ORG, facility_id: FACILITY, status: "signed", version: 2 }] };
      }
      throw new Error("sign_not_allowed");
    });
    const result = await signConsultationNote(db, {
      organizationId: ORG,
      facilityId: FACILITY,
      consultationNoteId: NOTE,
      actor: { staffMemberId: STAFF },
    });
    assert.equal(result.code, CLINICAL.CANNOT_EDIT_SIGNED);
  });

  it("treats a close that misses the stored version as stale", async () => {
    const db = authDb((text) => {
      if (text.includes("UPDATE activeclinic.encounters")) return { rows: [] };
      return { rows: [] };
    });
    const result = await closeEncounter(db, {
      organizationId: ORG,
      healthcareOrganizationId: HCO,
      facilityId: FACILITY,
      encounterId: ENC,
      version: 1,
      actor: { staffMemberId: STAFF },
    });
    assert.equal(result.code, CLINICAL.STALE_VERSION);
    assert.equal(db.calls.some((call) => call.text.includes("INSERT INTO activeclinic.encounter_events")), false);
  });

  it("rejects a second active queue entry for the same patient and service point", async () => {
    const db = authDb((text) => {
      if (text.includes("activeclinic.service_points")) {
        return { rows: [{ id: POINT, facility_id: FACILITY, status: "active" }] };
      }
      if (text.includes("activeclinic.reception_arrivals")) {
        return { rows: [{ id: ARRIVAL, facility_id: FACILITY, patient_id: PATIENT }] };
      }
      if (text.includes("status IN ('waiting'")) return { rows: [{ id: ENTRY }] };
      return { rows: [] };
    });
    const result = await createQueueEntry(db, {
      organizationId: ORG,
      healthcareOrganizationId: HCO,
      facilityId: FACILITY,
      servicePointId: POINT,
      arrivalId: ARRIVAL,
      actor: { staffMemberId: STAFF },
    });
    assert.equal(result.code, QUEUE.DUPLICATE_ACTIVE_ENTRY);
    assert.equal(db.calls.some((call) => call.text.includes("INSERT INTO activeclinic.queue_entries")), false);
  });

  it("does not call a queue entry from another facility", async () => {
    const db = authDb((text) => {
      if (text.includes("FROM activeclinic.queue_entries")) {
        return {
          rows: [{
            id: ENTRY,
            organization_id: ORG,
            healthcare_organization_id: HCO,
            facility_id: FACILITY,
            status: "waiting",
            version: 1,
          }],
        };
      }
      if (text.includes("queue_status_events")) return { rows: [] };
      throw new Error("update_not_allowed");
    });
    const result = await callNextQueueEntry(db, {
      organizationId: ORG,
      healthcareOrganizationId: HCO,
      facilityId: OTHER,
      queueEntryId: ENTRY,
      actor: { staffMemberId: STAFF },
    });
    assert.equal(result.code, QUEUE.ACCESS_DENIED);
  });

  it("rejects a call for a completed queue entry", async () => {
    const db = authDb((text) => {
      if (text.includes("FROM activeclinic.queue_entries")) {
        return {
          rows: [{
            id: ENTRY,
            organization_id: ORG,
            healthcare_organization_id: HCO,
            facility_id: FACILITY,
            status: "completed",
            version: 3,
          }],
        };
      }
      if (text.includes("queue_status_events")) return { rows: [] };
      throw new Error("update_not_allowed");
    });
    const result = await callNextQueueEntry(db, {
      organizationId: ORG,
      healthcareOrganizationId: HCO,
      facilityId: FACILITY,
      queueEntryId: ENTRY,
      actor: { staffMemberId: STAFF },
    });
    assert.equal(result.code, QUEUE.INVALID_TRANSITION);
  });

  it("records the staff member who transfers a waiting entry", async () => {
    const db = authDb((text, params) => {
      if (text.includes("FROM activeclinic.queue_entries") && text.includes("WHERE id")) {
        return {
          rows: [{
            id: ENTRY,
            organization_id: ORG,
            healthcare_organization_id: HCO,
            facility_id: FACILITY,
            status: "waiting",
            version: 1,
          }],
        };
      }
      if (text.includes("UPDATE activeclinic.queue_entries")) {
        assert.equal(text.includes("facility_id"), true);
        assert.equal(params.includes(FACILITY), true);
        return {
          rows: [{
            id: ENTRY,
            organization_id: ORG,
            healthcare_organization_id: HCO,
            facility_id: FACILITY,
            status: "transferred",
            version: 2,
          }],
        };
      }
      if (text.includes("INSERT INTO activeclinic.queue_status_events")) {
        assert.equal(params[4], "transferred");
        assert.equal(params[7], STAFF);
        return { rows: [{ id: "event" }] };
      }
      return { rows: [] };
    });
    const result = await transferQueueEntry(db, {
      organizationId: ORG,
      healthcareOrganizationId: HCO,
      facilityId: FACILITY,
      queueEntryId: ENTRY,
      actor: { staffMemberId: STAFF },
    });
    assert.equal(result.code, QUEUE.OK);
    assert.equal(result.queueEntry.status, "transferred");
    assert.equal(result.queueEntry.facilityId, FACILITY);
  });
});
