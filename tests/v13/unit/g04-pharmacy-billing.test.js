"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createClinicalOrder, RESULT } = require(
  "../../../src/activeclinic/services/activeClinicClinicalService"
);
const {
  prescriptionDosageInstructions,
  positiveDispenseQuantity,
} = require("../../../src/activeclinic/services/clinicalOperationsRules");
const { dispensePrescription, RESULT: PHARMACY } = require(
  "../../../src/activeclinic/services/activeClinicPharmacyService"
);

function throwingDb() {
  return { async query() { throw new Error("db_not_allowed"); } };
}

describe("G04 pharmacy and billing contracts", () => {
  it("requires the entered dose fields and does not invent a quantity", async () => {
    const dosage = prescriptionDosageInstructions({
      drug_name: "Amoxicillin",
      dose: "500mg",
      route: "Oral",
      frequency: "twice daily",
      duration: "7 days",
    });
    assert.match(dosage, /Dose: 500mg/);
    assert.match(dosage, /Route: Oral/);
    assert.equal(dosage.includes("ZMW"), false);
    assert.equal(positiveDispenseQuantity("14 tablets"), null);
    assert.equal(positiveDispenseQuantity(14), 14);
    const rejected = await createClinicalOrder(throwingDb(), {
      orderType: "prescription",
      orderDetails: { drug_name: "Amoxicillin" },
    });
    assert.equal(rejected.code, RESULT.INVALID_INPUT);
  });

  it("denies dispensing before a query when the actor is missing", async () => {
    const pool = { async connect() { throw new Error("db_not_allowed"); } };
    const denied = await dispensePrescription(pool, {
      organizationId: "org",
      prescriptionId: "rx",
      itemDispenses: [{ prescriptionItemId: "item", quantityToDispense: 1 }],
    });
    assert.equal(denied.result, PHARMACY.INVALID_INPUT);
  });

  it("rejects a batch from another facility before stock moves", async () => {
    const ORG = "11111111-1111-4111-8111-111111111111";
    const HCO = "22222222-2222-4222-8222-222222222222";
    const FACILITY = "33333333-3333-4333-8333-333333333333";
    const PATIENT = "44444444-4444-4444-8444-444444444444";
    const STAFF = "66666666-6666-4666-8666-666666666666";
    const ITEM = "99999999-9999-4999-8999-999999999999";
    const RX = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const BATCH = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const statements = [];
    let batchSql = "";
    let batchParams = [];
    const pool = {
      async query(sql) {
        const text = String(sql);
        if (text.includes("platform.organization_products")) {
          return { rows: [{ status: "active", organization_status: "active", product_status: "active", organization_id: ORG }] };
        }
        if (text.includes("activeclinic.healthcare_organizations")) {
          return { rows: [{ id: HCO, organization_id: ORG, status: "active" }] };
        }
        if (text.includes("activeclinic.staff_members")) {
          return { rows: [{ id: STAFF, organization_id: ORG, status: "active" }] };
        }
        if (text.includes("permission_key")) {
          return { rows: [{ permission_key: "activeclinic.pharmacy.dispense" }] };
        }
        if (text.includes("staff_role_assignments")) {
          return { rows: [{ status: "active", scope_type: "organisation", role_key: "activeclinic_network_admin", facility_id: null }] };
        }
        return { rows: [] };
      },
      async connect() {
        return {
          async query(sql, params) {
            const text = String(sql);
            statements.push(text);
            if (text === "BEGIN" || text === "ROLLBACK" || text === "COMMIT") return { rows: [] };
            if (text.includes("FROM activeclinic.pharmacy_prescriptions")) {
              return { rows: [{ id: RX, organization_id: ORG, healthcare_organization_id: HCO, facility_id: FACILITY, patient_id: PATIENT, status: "pending" }] };
            }
            if (text.includes("INSERT INTO activeclinic.dispense_events")) {
              return { rows: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }] };
            }
            if (text.includes("FROM activeclinic.pharmacy_prescription_items")) {
              return {
                rows: [{
                  id: ITEM,
                  organization_id: ORG,
                  healthcare_organization_id: HCO,
                  pharmacy_prescription_id: RX,
                  quantity_ordered: 2,
                  quantity_dispensed: 0,
                  status: "pending",
                }],
              };
            }
            if (text.includes("FROM activeclinic.inventory_batches")) {
              batchSql = text;
              batchParams = params;
              return { rows: [] };
            }
            throw new Error(`unexpected_sql:${text.slice(0, 80)}`);
          },
          release() {},
        };
      },
    };
    const result = await dispensePrescription(pool, {
      staffId: STAFF,
      organizationId: ORG,
      prescriptionId: RX,
      itemDispenses: [{ prescriptionItemId: ITEM, quantityToDispense: 2, batchId: BATCH }],
    });
    assert.equal(result.ok, false);
    assert.equal(result.result, PHARMACY.BATCH_NOT_FOUND);
    assert.match(batchSql, /facility_id = \$4/);
    assert.equal(batchParams[3], FACILITY);
    assert.equal(statements.some((sql) => sql.includes("INSERT INTO activeclinic.stock_movements")), false);
    assert.equal(statements.includes("ROLLBACK"), true);
  });
});
