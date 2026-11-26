"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { recordConsultationNote, RESULT: CLINICAL } = require(
  "../../../src/activeclinic/services/activeClinicClinicalService"
);
const {
  enterLaboratoryResult,
  enterRadiologyReport,
  verifyLaboratoryResult,
  RESULT: LAB,
} = require("../../../src/activeclinic/services/activeClinicDiagnosticsService");
const {
  dispensePrescription,
  createPharmacyPrescription,
  RESULT: PHARMACY,
} = require("../../../src/activeclinic/services/activeClinicPharmacyService");

const ORG = "11111111-1111-4111-8111-111111111111";
const HCO = "22222222-2222-4222-8222-222222222222";
const FACILITY = "33333333-3333-4333-8333-333333333333";
const PATIENT = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";
const STAFF = "66666666-6666-4666-8666-666666666666";
const PRESCRIBER = "77777777-7777-4777-8777-777777777777";
const ENC = "88888888-8888-4888-8888-888888888888";
const NOTE = "99999999-9999-4999-8999-999999999999";
const REQUEST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RX = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function scriptedPool(handler) {
  const statements = [];
  const client = {
    async query(sql, params) {
      statements.push(String(sql));
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
      return handler(String(sql), params || []);
    },
    release() {},
  };
  return {
    statements,
    async connect() {
      return client;
    },
  };
}

function authQuery(text) {
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
    return { rows: [{ id: STAFF, organization_id: ORG, status: "active" }] };
  }
  if (text.includes("permission_key")) {
    return {
      rows: [
        "activeclinic.encounter.view",
        "activeclinic.consultation.record",
        "activeclinic.pharmacy.view",
        "activeclinic.pharmacy.dispense",
      ].map((permission_key) => ({ permission_key })),
    };
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
  return null;
}

describe("D74 consultation integrity", () => {
  it("does not replace a signed consultation note", async () => {
    const calls = [];
    const result = await recordConsultationNote(
      {
        async query(sql, params) {
          const text = String(sql);
          calls.push(text);
          const auth = authQuery(text);
          if (auth) return auth;
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
          if (text.includes("FROM activeclinic.consultation_notes")) {
            return {
              rows: [{
                id: NOTE,
                organization_id: ORG,
                facility_id: FACILITY,
                patient_id: PATIENT,
                status: "signed",
                version: 2,
              }],
            };
          }
          throw new Error(text.slice(0, 80));
        },
      },
      {
        organizationId: ORG,
        healthcareOrganizationId: HCO,
        facilityId: FACILITY,
        encounterId: ENC,
        subjectiveText: "changed",
        actor: { staffMemberId: STAFF },
      }
    );
    assert.equal(result.code, CLINICAL.CANNOT_EDIT_SIGNED);
    assert.equal(calls.some((sql) => sql.includes("UPDATE activeclinic.consultation_notes")), false);
    assert.equal(calls.some((sql) => sql.includes("INSERT INTO activeclinic.consultation_notes")), false);
  });

  it("does not edit a draft note that belongs to another patient", async () => {
    const calls = [];
    const result = await recordConsultationNote(
      {
        async query(sql) {
          const text = String(sql);
          calls.push(text);
          const auth = authQuery(text);
          if (auth) return auth;
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
          if (text.includes("FROM activeclinic.consultation_notes")) {
            return {
              rows: [{
                id: NOTE,
                patient_id: OTHER,
                status: "draft",
                version: 1,
              }],
            };
          }
          throw new Error("update_not_allowed");
        },
      },
      {
        organizationId: ORG,
        healthcareOrganizationId: HCO,
        facilityId: FACILITY,
        encounterId: ENC,
        subjectiveText: "changed",
        actor: { staffMemberId: STAFF },
      }
    );
    assert.equal(result.code, CLINICAL.PATIENT_NOT_FOUND);
    assert.equal(calls.some((sql) => sql.startsWith("UPDATE")), false);
  });
});

describe("D74 laboratory association", () => {
  it("does not attach a laboratory result to another patient", async () => {
    const pool = scriptedPool((sql) => {
      if (sql.includes("FROM activeclinic.laboratory_requests")) {
        return { rows: [{ id: REQUEST, patient_id: PATIENT, status: "received" }] };
      }
      throw new Error("insert_not_allowed");
    });
    const result = await enterLaboratoryResult(pool, {
      organizationId: ORG,
      healthcareOrganizationId: HCO,
      facilityId: FACILITY,
      laboratoryRequestId: REQUEST,
      patientId: OTHER,
      resultSummary: "value",
      isCritical: false,
      components: [],
      actor: { staffId: STAFF },
    });
    assert.equal(result.code, LAB.PATIENT_NOT_FOUND);
    assert.equal(pool.statements.some((sql) => sql.includes("INSERT INTO activeclinic.laboratory_results")), false);
  });

  it("does not enter a laboratory result for a closed request", async () => {
    const pool = scriptedPool((sql) => {
      if (sql.includes("FROM activeclinic.laboratory_requests")) {
        return { rows: [{ id: REQUEST, patient_id: PATIENT, status: "verified" }] };
      }
      throw new Error("insert_not_allowed");
    });
    const result = await enterLaboratoryResult(pool, {
      organizationId: ORG,
      healthcareOrganizationId: HCO,
      facilityId: FACILITY,
      laboratoryRequestId: REQUEST,
      resultSummary: "value",
      isCritical: false,
      components: [],
      actor: { staffId: STAFF },
    });
    assert.equal(result.code, LAB.INVALID_STATUS);
    assert.equal(pool.statements.includes("COMMIT"), false);
  });

  it("does not attach a radiology report to another patient", async () => {
    const pool = scriptedPool((sql) => {
      if (sql.includes("FROM activeclinic.radiology_requests")) {
        return { rows: [{ id: REQUEST, patient_id: PATIENT, status: "pending" }] };
      }
      throw new Error("insert_not_allowed");
    });
    const result = await enterRadiologyReport(pool, {
      organizationId: ORG,
      healthcareOrganizationId: HCO,
      facilityId: FACILITY,
      radiologyRequestId: REQUEST,
      patientId: OTHER,
      findings: "seen",
      impression: "clear",
      technique: "plain",
      isCritical: false,
      actor: { staffId: STAFF },
    });
    assert.equal(result.code, LAB.PATIENT_NOT_FOUND);
    assert.equal(pool.statements.some((sql) => sql.includes("INSERT INTO activeclinic.radiology_reports")), false);
  });

  it("does not enter a radiology report for a closed request", async () => {
    const pool = scriptedPool((sql) => {
      if (sql.includes("FROM activeclinic.radiology_requests")) {
        return { rows: [{ id: REQUEST, patient_id: PATIENT, status: "reported" }] };
      }
      throw new Error("insert_not_allowed");
    });
    const result = await enterRadiologyReport(pool, {
      organizationId: ORG,
      healthcareOrganizationId: HCO,
      facilityId: FACILITY,
      radiologyRequestId: REQUEST,
      findings: "seen",
      impression: "clear",
      technique: "plain",
      isCritical: false,
      actor: { staffId: STAFF },
    });
    assert.equal(result.code, LAB.INVALID_STATUS);
    assert.equal(pool.statements.includes("COMMIT"), false);
  });

  it("does not verify a laboratory result for another patient", async () => {
    const pool = scriptedPool((sql) => {
      if (sql.includes("FROM activeclinic.laboratory_results")) {
        return {
          rows: [{
            id: REQUEST,
            patient_id: PATIENT,
            status: "resulted",
            entered_by_staff_id: PRESCRIBER,
          }],
        };
      }
      throw new Error("update_not_allowed");
    });
    const result = await verifyLaboratoryResult(pool, {
      organizationId: ORG,
      healthcareOrganizationId: HCO,
      laboratoryResultId: REQUEST,
      patientId: OTHER,
      actor: { staffId: STAFF },
    });
    assert.equal(result.code, LAB.PATIENT_NOT_FOUND);
    assert.equal(pool.statements.some((sql) => sql.startsWith("UPDATE")), false);
  });
});

describe("D74 pharmacy provenance", () => {
  it("denies a dispense when the staff member lacks the dispense permission", async () => {
    let connections = 0;
    const result = await dispensePrescription(
      {
        async query() {
          return { rows: [] };
        },
        async connect() {
          connections += 1;
          throw new Error("connect_not_allowed");
        },
      },
      {
        staffId: STAFF,
        organizationId: ORG,
        prescriptionId: RX,
        itemDispenses: [{ prescriptionItemId: NOTE, quantityToDispense: 1, batchId: REQUEST }],
      }
    );
    assert.equal(result.result, PHARMACY.ACCESS_DENIED);
    assert.equal(connections, 0);
  });

  it("does not dispense a prescription for another patient", async () => {
    const clientCalls = [];
    const result = await dispensePrescription(
      {
        async query(sql) {
          return authQuery(String(sql)) || { rows: [] };
        },
        async connect() {
          return {
            async query(sql) {
              const text = String(sql);
              clientCalls.push(text);
              if (text === "BEGIN" || text === "ROLLBACK") return { rows: [] };
              if (text.includes("FROM activeclinic.pharmacy_prescriptions")) {
                return {
                  rows: [{
                    id: RX,
                    organization_id: ORG,
                    healthcare_organization_id: HCO,
                    facility_id: FACILITY,
                    patient_id: PATIENT,
                    status: "pending",
                    prescriber_staff_id: PRESCRIBER,
                  }],
                };
              }
              throw new Error("dispense_not_allowed");
            },
            release() {},
          };
        },
      },
      {
        staffId: STAFF,
        organizationId: ORG,
        prescriptionId: RX,
        patientId: OTHER,
        itemDispenses: [{ prescriptionItemId: NOTE, quantityToDispense: 1, batchId: REQUEST }],
      }
    );
    assert.equal(result.result, PHARMACY.PATIENT_NOT_FOUND);
    assert.equal(clientCalls.some((sql) => sql.includes("INSERT INTO activeclinic.dispense_events")), false);
  });

  it("does not dispense a prescription that is already dispensed", async () => {
    const clientCalls = [];
    const result = await dispensePrescription(
      {
        async query(sql) {
          return authQuery(String(sql)) || { rows: [] };
        },
        async connect() {
          return {
            async query(sql) {
              const text = String(sql);
              clientCalls.push(text);
              if (text === "BEGIN" || text === "ROLLBACK") return { rows: [] };
              if (text.includes("FROM activeclinic.pharmacy_prescriptions")) {
                return {
                  rows: [{
                    id: RX,
                    organization_id: ORG,
                    healthcare_organization_id: HCO,
                    facility_id: FACILITY,
                    patient_id: PATIENT,
                    status: "dispensed",
                    prescriber_staff_id: PRESCRIBER,
                  }],
                };
              }
              throw new Error("dispense_not_allowed");
            },
            release() {},
          };
        },
      },
      {
        staffId: STAFF,
        organizationId: ORG,
        prescriptionId: RX,
        itemDispenses: [{ prescriptionItemId: NOTE, quantityToDispense: 1, batchId: REQUEST }],
      }
    );
    assert.equal(result.result, PHARMACY.INVALID_STATUS);
    assert.equal(clientCalls.some((sql) => sql.includes("INSERT INTO activeclinic.dispense_events")), false);
  });

  it("keeps the original prescriber on a new prescription", async () => {
    let prescriber = null;
    const result = await createPharmacyPrescription(
      {
        async query(sql) {
          return authQuery(String(sql)) || { rows: [] };
        },
        async connect() {
          return {
            async query(sql, params) {
              const text = String(sql);
              if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") return { rows: [] };
              if (text.includes("COUNT(*)")) return { rows: [{ count: "0" }] };
              if (text.includes("INSERT INTO activeclinic.pharmacy_prescriptions")) {
                prescriber = params[6];
                return {
                  rows: [{
                    id: RX,
                    organization_id: ORG,
                    healthcare_organization_id: HCO,
                    facility_id: FACILITY,
                    patient_id: PATIENT,
                    prescriber_staff_id: params[6],
                    prescription_number: "RX000001",
                    status: "pending",
                  }],
                };
              }
              if (text.includes("INSERT INTO activeclinic.pharmacy_prescription_items")) return { rows: [] };
              return { rows: [] };
            },
            release() {},
          };
        },
      },
      {
        staffId: STAFF,
        organizationId: ORG,
        healthcareOrganizationId: HCO,
        facilityId: FACILITY,
        patientId: PATIENT,
        prescriberStaffId: PRESCRIBER,
        items: [{ medicationCatalogueItemId: NOTE, quantityOrdered: 1 }],
      }
    );
    assert.equal(result.ok, true);
    assert.equal(prescriber, PRESCRIBER);
    assert.equal(result.prescription.prescriberStaffId, PRESCRIBER);
  });
});
