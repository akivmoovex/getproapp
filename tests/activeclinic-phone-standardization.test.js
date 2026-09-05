"use strict";

/**
 * ActiveClinic phone standardization tests (Bug Fix 04).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  PLATFORM_DEFAULT_COUNTRY,
  VALIDATION_MODES,
  resolvePhoneValidationMode,
  resolveDefaultCountry,
  listPhoneCountries,
  normalizePhoneNumber,
  comparePhoneNumbers,
  extractPhoneFieldsFromBody,
} = require("../src/platform/services/phoneNumberService");
const {
  normalizeActiveClinicPhone,
} = require("../src/activeclinic/services/normalizeActiveClinicContact");
const {
  normalizeBlessBoardPhone,
} = require("../src/blessboard/services/normalizeBlessBoardPhone");
const {
  normalizeZambiaPhone,
} = require("../src/activeclinic/services/activeClinicPublicOnboardingService");

describe("ActiveClinic phone number service", () => {
  it("defaults platform country to Zambia", () => {
    assert.equal(PLATFORM_DEFAULT_COUNTRY, "ZM");
    assert.equal(resolveDefaultCountry({}), "ZM");
  });

  it("clinic default overrides platform default; user selection wins", () => {
    assert.equal(
      resolveDefaultCountry({ clinicDefaultCountry: "KE", platformDefaultCountry: "ZM" }),
      "KE"
    );
    assert.equal(
      resolveDefaultCountry({
        selectedCountry: "ZA",
        clinicDefaultCountry: "KE",
        platformDefaultCountry: "ZM",
      }),
      "ZA"
    );
  });

  it("country list includes Zambia searchable by name, ISO, and dial code", () => {
    const countries = listPhoneCountries();
    const zm = countries.find((c) => c.iso === "ZM");
    assert.ok(zm);
    assert.match(zm.searchText, /zambia/);
    assert.match(zm.searchText, /\bzm\b/);
    assert.match(zm.searchText, /\+260/);
    assert.ok(countries.some((c) => c.searchText.includes("zambia")));
    assert.ok(countries.some((c) => c.searchText.includes("+260")));
  });

  it("normalizes ZM national / leading-zero / E.164 equivalently", () => {
    const a = normalizePhoneNumber({ phoneNational: "971234567", phoneCountry: "ZM" });
    const b = normalizePhoneNumber({ phone: "0971234567", phoneCountry: "ZM" });
    const c = normalizePhoneNumber({ phone: "+260971234567" });
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(c.ok, true);
    assert.equal(a.e164, "+260971234567");
    assert.equal(b.e164, "+260971234567");
    assert.equal(c.e164, "+260971234567");
    assert.equal(a.e164.startsWith("+2600"), false);
    assert.ok(comparePhoneNumbers("0971234567", "+260971234567", { defaultCountry: "ZM" }));
  });

  it("normalizes non-Zambia country correctly", () => {
    const ke = normalizePhoneNumber({
      phoneNational: "712345678",
      phoneCountry: "KE",
      validationMode: VALIDATION_MODES.RELAXED,
    });
    assert.equal(ke.ok, true);
    assert.equal(ke.e164, "+254712345678");
  });

  it("accepts synthetic QA numbers in relaxed mode", () => {
    const qa = normalizePhoneNumber({
      phone: "+260970000001",
      validationMode: VALIDATION_MODES.RELAXED,
    });
    assert.equal(qa.ok, true);
    assert.equal(qa.e164, "+260970000001");

    const national = normalizePhoneNumber({
      phoneNational: "970000001",
      phoneCountry: "ZM",
      validationMode: VALIDATION_MODES.RELAXED,
    });
    assert.equal(national.ok, true);
    assert.equal(national.e164, "+260970000001");
  });

  it("rejects unparseable garbage in relaxed mode", () => {
    const bad = normalizePhoneNumber({
      phone: "not-a-phone",
      phoneCountry: "ZM",
      validationMode: VALIDATION_MODES.RELAXED,
    });
    assert.equal(bad.ok, false);
    assert.ok(bad.error);
    assert.equal(bad.field, "phone");
  });

  it("strict mode rejects invalid-for-country numbers with field error", () => {
    const bad = normalizePhoneNumber({
      phoneNational: "12",
      phoneCountry: "ZM",
      validationMode: VALIDATION_MODES.STRICT,
    });
    assert.equal(bad.ok, false);
    assert.match(String(bad.error), /valid phone number/i);
  });

  it("relaxed mode rejects impossible short Zambia nationals (3 and 4 digits)", () => {
    for (const national of ["123", "1234", "97", "abcd", "!!!"]) {
      const bad = normalizePhoneNumber({
        phoneNational: national,
        phoneCountry: "ZM",
        validationMode: VALIDATION_MODES.RELAXED,
      });
      assert.equal(bad.ok, false, `expected reject for ${national}`);
      assert.ok(bad.error);
      assert.equal(bad.field, "phone");
    }
    const blank = normalizePhoneNumber({
      phoneNational: "",
      phoneCountry: "ZM",
      validationMode: VALIDATION_MODES.RELAXED,
      required: true,
    });
    assert.equal(blank.ok, false);
    assert.equal(blank.code, "phone_required");

    const valid = normalizePhoneNumber({
      phoneNational: "971234567",
      phoneCountry: "ZM",
      validationMode: VALIDATION_MODES.RELAXED,
    });
    assert.equal(valid.ok, true);
    assert.equal(valid.e164, "+260971234567");

    const ke = normalizePhoneNumber({
      phoneNational: "712345678",
      phoneCountry: "KE",
      validationMode: VALIDATION_MODES.RELAXED,
    });
    assert.equal(ke.ok, true);
    assert.match(String(ke.e164), /^\+254/);
  });

  it("ActiveClinic registration helper rejects short phones", () => {
    const short = normalizeZambiaPhone("1234", { phoneCountry: "ZM", phoneNational: "1234" });
    assert.equal(short.ok, false);
    const good = normalizeZambiaPhone("971234567", {
      phoneCountry: "ZM",
      phoneNational: "971234567",
    });
    assert.equal(good.ok, true);
    assert.equal(good.normalized, "+260971234567");
  });

  it("validation mode comes from trusted env only", () => {
    assert.equal(resolvePhoneValidationMode({ DEPLOYMENT_ENV: "testing" }), "relaxed");
    assert.equal(resolvePhoneValidationMode({ DEPLOYMENT_ENV: "production" }), "strict");
    assert.equal(
      resolvePhoneValidationMode({
        DEPLOYMENT_ENV: "production",
        PHONE_VALIDATION_MODE: "relaxed",
      }),
      "relaxed"
    );
    // Request-like values must not be read — only env object keys.
    assert.equal(resolvePhoneValidationMode({ NODE_ENV: "test" }), "relaxed");
  });

  it("legacy and structured body payloads normalize identically", () => {
    const legacy = extractPhoneFieldsFromBody({ phone: "+260971234567" });
    const structured = extractPhoneFieldsFromBody({
      phone_country: "ZM",
      phone_national: "971234567",
    });
    const a = normalizePhoneNumber({ ...legacy, validationMode: "relaxed" });
    const b = normalizePhoneNumber({ ...structured, validationMode: "relaxed" });
    assert.equal(a.ok && b.ok, true);
    assert.equal(a.e164, b.e164);
  });

  it("ActiveClinic and BlessBoard wrappers share canonical E.164", () => {
    const ac = normalizeActiveClinicPhone("0971234567", { country: "ZM" });
    const bb = normalizeBlessBoardPhone("0971234567", { country: "ZM" });
    const zm = normalizeZambiaPhone("0971234567");
    assert.equal(ac.ok && bb.ok && zm.ok, true);
    assert.equal(ac.normalized, "+260971234567");
    assert.equal(bb.normalized, "+260971234567");
    assert.equal(zm.normalized, "+260971234567");
  });

  it("structured ActiveClinic phone payload works", () => {
    const r = normalizeActiveClinicPhone({
      phoneCountry: "ZM",
      phoneNational: "971234567",
    });
    assert.equal(r.ok, true);
    assert.equal(r.normalized, "+260971234567");
  });
});

describe("phone search criteria", () => {
  const {
    buildPhoneSearchCriteria,
  } = require("../src/platform/services/phoneNumberService");

  it("exact-matches equivalent Zambia full numbers", () => {
    for (const raw of ["970000001", "0970000001", "+260970000001"]) {
      const c = buildPhoneSearchCriteria(raw, { defaultCountry: "ZM" });
      assert.equal(c.ok, true);
      assert.equal(c.mode, "exact");
      assert.equal(c.e164, "+260970000001");
    }
  });

  it("uses partial digit mode for short fragments", () => {
    const c = buildPhoneSearchCriteria("970", { defaultCountry: "ZM" });
    assert.equal(c.ok, true);
    assert.equal(c.mode, "partial");
    assert.equal(c.digits, "970");
  });
});

describe("default country is input default only", () => {
  const {
    splitE164ForForm,
  } = require("../src/activeclinic/services/activeClinicPhoneFieldLocals");

  it("changing clinic default does not reinterpret stored E.164", () => {
    // Saved while clinic default was Botswana (BW)
    const saved = normalizePhoneNumber({
      phoneNational: "71123456",
      phoneCountry: "BW",
      validationMode: VALIDATION_MODES.RELAXED,
    });
    assert.equal(saved.ok, true);
    assert.equal(saved.e164, "+26771123456");
    assert.equal(saved.country, "BW");

    // Clinic default later changes to Zambia — stored value must still display as BW
    const form = splitE164ForForm(saved.e164, "ZM");
    assert.equal(form.country, "BW");
    assert.equal(form.national, "71123456");
    assert.equal(form.e164, "+26771123456");

    // Identity compare still uses original canonical
    assert.ok(
      comparePhoneNumbers("+26771123456", "71123456", { defaultCountry: "BW" })
    );
    assert.equal(
      comparePhoneNumbers("+26771123456", "71123456", { defaultCountry: "ZM" }),
      false
    );
  });
});
