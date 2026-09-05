"use strict";

/**
 * ActiveClinic QA wave 1 — DEF-AC-001 / 002 / 003 regression guards.
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  VALIDATION_MODES,
  normalizePhoneNumber,
} = require("../src/platform/services/phoneNumberService");
const {
  normalizeZambiaPhone,
  validateClinicRegistrationInput,
} = require("../src/activeclinic/services/activeClinicPublicOnboardingService");
const {
  NEUTRAL_MESSAGE,
  requestActiveClinicPasswordReset,
} = require("../src/activeclinic/services/activeClinicPasswordRecoveryService");
const { DELIVERY } = require("../src/activeclinic/services/activeClinicShareLinks");

describe("DEF-AC-001 phone validation", () => {
  it("rejects blank, short, and malformed registration phones server-side", () => {
    const cases = [
      { phoneNational: "", phoneCountry: "ZM" },
      { phoneNational: "123", phoneCountry: "ZM" },
      { phoneNational: "1234", phoneCountry: "ZM" },
      { phoneNational: "ab12", phoneCountry: "ZM" },
      { phoneNational: "!!!!", phoneCountry: "ZM" },
    ];
    for (const c of cases) {
      const r = normalizePhoneNumber({
        ...c,
        validationMode: VALIDATION_MODES.RELAXED,
        required: true,
      });
      assert.equal(r.ok, false, `expected reject for ${JSON.stringify(c)}`);
    }
  });

  it("accepts valid Zambia and Kenya mobiles", () => {
    const zm = normalizeZambiaPhone(null, {
      phoneCountry: "ZM",
      phoneNational: "971234567",
    });
    assert.equal(zm.ok, true);
    assert.equal(zm.normalized, "+260971234567");

    const ke = normalizePhoneNumber({
      phoneCountry: "KE",
      phoneNational: "712345678",
      validationMode: VALIDATION_MODES.RELAXED,
    });
    assert.equal(ke.ok, true);
    assert.match(String(ke.e164), /^\+2547/);
  });

  it("clinic registration validation surfaces phone field errors", () => {
    const bad = validateClinicRegistrationInput(
      {
        clinicName: "Wave1 Clinic",
        clinicType: "clinic",
        countryCode: "ZM",
        city: "Lusaka",
        contactName: "Admin",
        contactEmail: "wave1.admin@example.test",
        phoneCountry: "ZM",
        phoneNational: "1234",
        password: "GpQa!Wave1Pass9A",
        passwordConfirm: "GpQa!Wave1Pass9A",
        acceptTerms: "on",
      },
      { requireTermsAcceptance: true }
    );
    assert.equal(bad.ok, false);
    assert.ok(bad.errors && bad.errors.contactPhone);
  });
});

describe("DEF-AC-002 / DEF-AC-003 password recovery", () => {
  it("invalid identifier stays neutral and does not claim delivery", async () => {
    const unknown = await requestActiveClinicPasswordReset(
      {
        async connect() {
          throw new Error("db should not be used for invalid identifier");
        },
      },
      {
        identifier: "not-an-email-or-phone",
        requestId: "test-req-invalid",
      }
    );
    assert.equal(unknown.ok, true);
    assert.equal(unknown.message, NEUTRAL_MESSAGE);
    assert.equal(unknown.sent, false);
    assert.equal(unknown.deliveryStatus, DELIVERY.UNAVAILABLE);
  });

  it("documents delivery-unavailable semantics for public recovery", () => {
    assert.match(NEUTRAL_MESSAGE, /when delivery is configured/i);
    assert.equal(DELIVERY.UNAVAILABLE, "unavailable");
  });
});
