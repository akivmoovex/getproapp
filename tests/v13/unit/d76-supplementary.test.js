"use strict";

const fs = require("fs");
const path = require("path");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  grantPatientConsent,
  withdrawPatientConsent,
  CONSENT_TYPES,
  RESULT,
} = require("../../../src/activeclinic/services/activeClinicPatientConsentService");

const root = path.join(__dirname, "../../..");
const ORG = "11111111-1111-4111-8111-111111111111";
const HCO = "22222222-2222-4222-8222-222222222222";
const PATIENT = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";
const STAFF = "55555555-5555-4555-8555-555555555555";
const CONSENT = "66666666-6666-4666-8666-666666666666";

function authDb(decide) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      const text = String(sql);
      calls.push(text);
      if (text.includes("platform.organization_products")) {
        return {
          rows: [{
            status: "active",
            organization_status: "active",
            product_status: "active",
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
        return { rows: [{ permission_key: "activeclinic.patient.update" }] };
      }
      if (text.includes("staff_role_assignments")) {
        return { rows: [{ status: "active", scope_type: "organisation", role_key: "activeclinic_network_admin" }] };
      }
      return decide(text, params || []);
    },
  };
}

describe("D76 consent safeguards", () => {
  it("keeps the stored consent types and does not add a representative type", () => {
    assert.deepEqual(CONSENT_TYPES, [
      "treatment",
      "data_processing",
      "sharing_with_referrer",
      "photography",
      "research_contact",
      "other",
    ]);
  });

  it("does not grant a consent type outside the stored list", async () => {
    const db = authDb(() => {
      throw new Error("insert_not_allowed");
    });
    const result = await grantPatientConsent(db, {
      organizationId: ORG,
      healthcareOrganizationId: HCO,
      patientId: PATIENT,
      consentType: "research_use_of_images",
      captureMethod: "staff_recorded",
      status: "granted",
      actor: { staffMemberId: STAFF },
    });
    assert.equal(result.code, RESULT.INVALID_INPUT);
    assert.equal(result.consent, null);
    assert.equal(db.calls.some((sql) => sql.includes("INSERT INTO activeclinic.patient_consents")), false);
  });

  it("does not withdraw another patient's consent", async () => {
    const db = authDb((text) => {
      if (text.includes("FROM activeclinic.patient_consents")) {
        return {
          rows: [{
            id: CONSENT,
            organization_id: ORG,
            healthcare_organization_id: HCO,
            patient_id: PATIENT,
            consent_type: "treatment",
            status: "granted",
            note: "PRIVATE-NOTE",
          }],
        };
      }
      throw new Error("update_not_allowed");
    });
    const result = await withdrawPatientConsent(db, {
      organizationId: ORG,
      healthcareOrganizationId: HCO,
      consentId: CONSENT,
      patientId: OTHER,
      withdrawalReason: "wrong patient",
      actor: { staffMemberId: STAFF },
    });
    assert.equal(result.code, RESULT.PATIENT_NOT_FOUND);
    assert.equal(result.consent, null);
    assert.equal(JSON.stringify(result).includes("PRIVATE-NOTE"), false);
    assert.equal(db.calls.some((sql) => sql.includes("UPDATE activeclinic.patient_consents")), false);
  });
});

describe("D76 blocked supplementary surfaces", () => {
  it("does not add an allergy blocker, a retention period, an outbox, or a versioned clinical route", () => {
    const pharmacy = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicPharmacyService.js"),
      "utf8"
    );
    const consent = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicPatientConsentService.js"),
      "utf8"
    );
    const clinical = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicClinicalService.js"),
      "utf8"
    );
    const routes = fs.readFileSync(
      path.join(root, "src/activeclinic/http/activeClinicAppRoutes.js"),
      "utf8"
    );
    const otp = fs.readFileSync(path.join(root, "src/platform/otp/otpService.js"), "utf8");
    const demo = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicDemoClinicSpec.js"),
      "utf8"
    );
    assert.equal(/allergy/i.test(pharmacy), false);
    assert.equal(consent.includes("DELETE FROM"), false);
    assert.equal(/\b\d+\s+years\b/i.test(consent), false);
    assert.equal(clinical.includes("outbox"), false);
    assert.equal(routes.includes("/api/v1"), false);
    assert.equal(otp.includes("console."), false);
    assert.equal(/signingEnabled|twoScreen/.test(demo), false);
    assert.equal(fs.existsSync(path.join(root, "src/platform/ops/restoreTenant.js")), false);
  });
});
