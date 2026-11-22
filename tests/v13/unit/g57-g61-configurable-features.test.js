"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  interpretLaboratoryValue,
  retainLaboratoryInterpretation,
  validateReferenceRangeRule,
} = require("../../../src/activeclinic/services/laboratoryReferenceRangeEngine");
const {
  elapsedTimeRetentionDecision,
  planLegalHold,
  planLegalHoldRelease,
  planConsentEvent,
} = require("../../../src/activeclinic/services/recordRetentionRules");
const {
  prescriptionDosageInstructions,
  duplicatePrescriptionItemIds,
} = require("../../../src/activeclinic/services/clinicalOperationsRules");
const { createOtpProvider } = require("../../../src/platform/otp/otpProviders");
const { validateMediaFile } = require("../../../src/blessboard/media/validateMediaFile");
const { areMediaUploadsEnabled } = require("../../../src/blessboard/config/mediaUploadsEnabled");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FACILITY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function approvedRule(overrides) {
  return {
    organizationId: ORG,
    facilityId: FACILITY,
    testCode: "HGB",
    unit: "g/dL",
    low: 12,
    high: 16,
    version: 1,
    status: "approved",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    displayText: "Clinic supplied range",
    ...overrides,
  };
}

function judge(value, rules, extra) {
  return interpretLaboratoryValue({
    value,
    unit: "g/dL",
    recordedAt: "2026-06-01T00:00:00.000Z",
    organizationId: ORG,
    facilityId: FACILITY,
    testCode: "HGB",
    rules,
    ...extra,
  });
}

describe("configurable laboratory reference rules", () => {
  it("does not classify a result when no rule is supplied", () => {
    const judged = judge(4, []);
    assert.equal(judged.status, "unconfigured");
    assert.equal(judged.interpretation, null);
    assert.equal(judged.isAbnormal, null);
    assert.equal(judged.isCritical, null);
  });

  it("uses only an explicitly approved rule for the same clinic", () => {
    const inside = judge(13, [approvedRule()]);
    assert.equal(inside.status, "applicable");
    assert.equal(inside.interpretation, "within_range");
    assert.equal(inside.isAbnormal, false);
    assert.equal(inside.isCritical, false);
    assert.equal(inside.configurationVersion, 1);
    const below = judge(10, [approvedRule()]);
    assert.equal(below.interpretation, "below_range");
    assert.equal(below.isCritical, false);
  });

  it("flags critical only when that rule supplies a critical bound", () => {
    const judged = judge(7, [approvedRule({ criticalLow: 8, criticalHigh: 20 })]);
    assert.equal(judged.interpretation, "critical_low");
    assert.equal(judged.isCritical, true);
    const without = judge(7, [approvedRule()]);
    assert.equal(without.isCritical, false);
  });

  it("rejects inconsistent bounds, another clinic, and a unit that does not match", () => {
    assert.equal(validateReferenceRangeRule(approvedRule({ low: 16, high: 12 })).status, "invalid");
    assert.equal(judge(13, [approvedRule({ organizationId: OTHER })]).status, "cross_tenant");
    assert.equal(
      judge(13, [approvedRule({ unit: "mmol/L" })]).status,
      "incompatible_unit"
    );
  });

  it("selects the newest effective version and reports a conflict", () => {
    const newest = judge(13, [
      approvedRule({ version: 1, low: 1, high: 2 }),
      approvedRule({ version: 2, low: 12, high: 16 }),
    ]);
    assert.equal(newest.configurationVersion, 2);
    assert.equal(newest.interpretation, "within_range");
    const conflict = judge(13, [approvedRule({ id: "a" }), approvedRule({ id: "b" })]);
    assert.equal(conflict.status, "conflict");
    assert.equal(conflict.isAbnormal, null);
  });

  it("keeps a stored interpretation until reassessment is authorized", () => {
    const kept = retainLaboratoryInterpretation("within_range", "below_range", false);
    assert.equal(kept, "within_range");
    assert.equal(
      retainLaboratoryInterpretation("within_range", "below_range", true),
      "below_range"
    );
  });
});

describe("retention holds and consent metadata", () => {
  it("never deletes because time passed", () => {
    const decision = elapsedTimeRetentionDecision({ elapsedDays: 3650 });
    assert.equal(decision.deletes, false);
  });

  it("places and releases a hold without deleting the record", () => {
    const denied = planLegalHold({ reason: "review", authorizationOk: false });
    assert.equal(denied.code, "access_denied");
    assert.equal(denied.deleted, false);
    const placed = planLegalHold({ reason: "review", authorizationOk: true });
    assert.equal(placed.holdStatus, "placed");
    assert.equal(placed.deleted, false);
    const blocked = planLegalHoldRelease({
      holdStatus: "placed",
      authorizationOk: true,
      releaseAuthorized: false,
    });
    assert.equal(blocked.deleted, false);
    assert.equal(blocked.holdStatus, "placed");
    const released = planLegalHoldRelease({
      holdStatus: "placed",
      authorizationOk: true,
      releaseAuthorized: true,
    });
    assert.equal(released.holdStatus, "released");
    assert.equal(released.deleted, false);
  });

  it("records consent only from supplied scope, method, and time", () => {
    assert.equal(planConsentEvent({}).ok, false);
    const recorded = planConsentEvent({
      scope: "treatment",
      method: "written",
      recordedAt: "2026-06-01T00:00:00.000Z",
    });
    assert.equal(recorded.code, "recorded");
    assert.equal(recorded.withdrawn, false);
    const withdrawn = planConsentEvent({
      scope: "treatment",
      method: "written",
      recordedAt: "2026-06-02T00:00:00.000Z",
      withdrawn: true,
    });
    assert.equal(withdrawn.code, "withdrawn");
  });
});

describe("manual prescription and closed delivery controls", () => {
  it("keeps manual dose text and rejects a repeated dispense item", () => {
    const dosage = prescriptionDosageInstructions({
      drug_name: "Amoxicillin",
      dose: "500",
      dose_unit: "mg",
      frequency: "twice daily",
      duration: "7 days",
    });
    assert.match(dosage, /Dose: 500 mg/);
    assert.equal(
      prescriptionDosageInstructions({ drug_name: "Amoxicillin", dose: "500" }),
      null
    );
    assert.equal(
      duplicatePrescriptionItemIds([
        { prescriptionItemId: ORG },
        { prescriptionItemId: ORG },
      ]),
      true
    );
  });

  it("keeps production OTP and media uploads closed", async () => {
    const production = createOtpProvider({
      NODE_ENV: "production",
      GETPRO_OTP_PROVIDER: "fake",
    });
    assert.equal(production.name, "inactive");
    const missing = await createOtpProvider({}).dispatch({
      channel: "sms",
      destination: "+260977000000",
      code: "000000",
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, "delivery_not_activated");
    const unselected = await createOtpProvider({
      GETPRO_OTP_PROVIDER: "interface",
      GETPRO_OTP_SMS_GATEWAY: "twilio",
    }).dispatch({
      channel: "sms",
      destination: "+260977000000",
      code: "000000",
    });
    assert.equal(unselected.reason, "provider_not_selected");
    assert.equal(areMediaUploadsEnabled({}), false);
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
    ]);
    const named = validateMediaFile({
      buffer: png,
      originalFilename: "../secret.png",
      claimedMime: "image/png",
    });
    assert.equal(named.ok, true);
    assert.equal(named.originalFilename.includes("/"), false);
    assert.equal(named.originalFilename.includes(".."), false);
  });
});
