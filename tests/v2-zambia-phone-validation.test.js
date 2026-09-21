"use strict";

/**
 * V2.0 BUG FIX 01 — Zambia phone validation (shared platform).
 *
 * Accepts ZM mobile NSN forms used in BlessBoard church registration QA:
 *   9710000021 | 09710000021 | +2609710000021 | 2609710000021
 * → +2609710000021 (no double country-code prefix).
 *
 * Server-authoritative via phoneNumberService; BB + AC wrappers must agree.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizePhoneNumber,
  VALIDATION_MODES,
  resolvePhoneValidationMode,
} = require("../src/platform/services/phoneNumberService");
const {
  normalizeBlessBoardPhone,
} = require("../src/blessboard/services/normalizeBlessBoardPhone");
const {
  normalizeRegistrationPhone,
} = require("../src/blessboard/services/normalizeRegistrationPhone");
const {
  normalizeActiveClinicPhone,
} = require("../src/activeclinic/services/normalizeActiveClinicContact");
const {
  validatePlatformChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationValidation");

const EXPECTED_E164 = "+2609710000021";
const TESTING_ENV = { DEPLOYMENT_ENV: "testing", NODE_ENV: "production" };

const ACCEPTED_ZM_FORMS = [
  "9710000021",
  "09710000021",
  "+2609710000021",
  "2609710000021",
];

const MALFORMED = [
  { raw: "abcdefghij", label: "letters" },
  { raw: "123", label: "tiny" },
  { raw: "097719869", label: "trunk-zero-leak-short" },
  { raw: "097719869701", label: "eleven-digit-nsn" },
  { raw: "+260123", label: "invalid-short-e164" },
];

const BASE_REG = {
  church_name: "V2 Phone QA Church",
  branch_name: "Main Campus",
  country: "Zambia",
  city: "Lusaka",
  contact_name: "Phone QA Admin",
  role_in_church: "Pastor",
  email: "v2-phone-qa@example.invalid",
  consent_contact: "on",
  selected_plan: "foundation",
};

describe("V2 Zambia phone validation (shared platform)", () => {
  it("testing env resolves to relaxed validation", () => {
    assert.equal(resolvePhoneValidationMode(TESTING_ENV), VALIDATION_MODES.RELAXED);
  });

  it("accepts four ZM formats and normalizes to +2609710000021 (shared)", () => {
    for (const raw of ACCEPTED_ZM_FORMS) {
      const r = normalizePhoneNumber({
        phone: raw,
        phoneCountry: "ZM",
        env: TESTING_ENV,
      });
      assert.equal(r.ok, true, `shared should accept ${raw}: ${r.error || ""}`);
      assert.equal(r.e164, EXPECTED_E164, `shared ${raw}`);
      assert.equal(String(r.e164).startsWith("+2600"), false, `no double prefix ${raw}`);
    }
  });

  it("structured phone_national + ZM country matches legacy E.164 forms", () => {
    const national = normalizePhoneNumber({
      phoneNational: "9710000021",
      phoneCountry: "ZM",
      env: TESTING_ENV,
    });
    const intl = normalizePhoneNumber({
      phone: "+2609710000021",
      env: TESTING_ENV,
    });
    assert.equal(national.ok, true);
    assert.equal(intl.ok, true);
    assert.equal(national.e164, EXPECTED_E164);
    assert.equal(intl.e164, EXPECTED_E164);
  });

  it("BlessBoard + registration + ActiveClinic wrappers agree on all four forms", () => {
    for (const raw of ACCEPTED_ZM_FORMS) {
      const shared = normalizePhoneNumber({
        phone: raw,
        phoneCountry: "ZM",
        env: TESTING_ENV,
      });
      const bb = normalizeBlessBoardPhone(raw, {
        phoneCountry: "ZM",
        env: TESTING_ENV,
      });
      const reg = normalizeRegistrationPhone(raw, {
        phoneCountry: "ZM",
        env: TESTING_ENV,
      });
      const ac = normalizeActiveClinicPhone(raw, {
        country: "ZM",
        env: TESTING_ENV,
      });

      assert.equal(shared.ok, true, `shared ${raw}`);
      assert.equal(bb.ok, true, `bb ${raw}: ${bb.error || ""}`);
      assert.equal(reg.ok, true, `reg ${raw}: ${reg.error || ""}`);
      assert.equal(ac.ok, true, `ac ${raw}: ${ac.error || ""}`);

      assert.equal(shared.e164, EXPECTED_E164);
      assert.equal(bb.normalized, EXPECTED_E164);
      assert.equal(reg.normalized, EXPECTED_E164);
      assert.equal(ac.normalized || ac.e164, EXPECTED_E164);
    }
  });

  it("church registration validation accepts 9710000021 under testing", () => {
    const result = validatePlatformChurchRegistration(
      {
        ...BASE_REG,
        phone_country: "ZM",
        phone_national: "9710000021",
      },
      { env: TESTING_ENV }
    );
    assert.equal(result.ok, true, result.error || "");
    assert.equal(result.data.contact_phone_normalized, EXPECTED_E164);
  });

  it("rejects malformed numbers in relaxed and strict modes", () => {
    for (const mode of [VALIDATION_MODES.RELAXED, VALIDATION_MODES.STRICT]) {
      for (const { raw, label } of MALFORMED) {
        const r = normalizePhoneNumber({
          phone: raw,
          phoneCountry: "ZM",
          validationMode: mode,
        });
        assert.equal(r.ok, false, `${mode} should reject ${label} (${raw})`);
        assert.ok(r.error, `${mode} ${label} needs message`);
        assert.equal(r.field, "phone");
      }
    }
  });

  it("strict/production still rejects 10-digit ZM NSN (ITU isValid required)", () => {
    for (const raw of ACCEPTED_ZM_FORMS) {
      const r = normalizePhoneNumber({
        phone: raw,
        phoneCountry: "ZM",
        validationMode: VALIDATION_MODES.STRICT,
      });
      assert.equal(r.ok, false, `strict must reject ${raw}`);
      assert.equal(r.code, "phone_invalid_for_country");
    }

    const reg = validatePlatformChurchRegistration(
      {
        ...BASE_REG,
        phone_country: "ZM",
        phone_national: "9710000021",
      },
      { env: { DEPLOYMENT_ENV: "production" } }
    );
    assert.equal(reg.ok, false);
    assert.equal(reg.field, "phone");
  });

  it("required-field rejection still works", () => {
    const r = normalizePhoneNumber({
      phoneNational: "",
      phoneCountry: "ZM",
      env: TESTING_ENV,
      required: true,
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "phone_required");
  });

  it("non-ZM international numbers still normalize under relaxed", () => {
    const ke = normalizePhoneNumber({
      phoneNational: "712345678",
      phoneCountry: "KE",
      env: TESTING_ENV,
    });
    assert.equal(ke.ok, true);
    assert.equal(ke.e164, "+254712345678");
  });
});
