"use strict";

/**
 * BUG-005 — Shared registration country selection (AC + BB).
 * Supported set = phone catalogue; Zambia default; product rules configurable.
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  PRODUCT,
  listRegistrationCountries,
  isSupportedRegistrationCountry,
  normalizeRegistrationCountryCode,
  resolveRegistrationDefaultCountry,
  usesZambiaProvinceSelect,
  getProductRegistrationCountryRules,
  buildRegistrationCountryLocals,
  buildRegistrationPageLocals,
} = require("../src/platform/registration");
const {
  validateClinicRegistrationInput,
} = require("../src/activeclinic/services/activeClinicPublicOnboardingService");
const {
  validateChurchCountry,
} = require("../src/blessboard/services/platformChurchRegistrationValidation");

describe("shared registration country selection (BUG-005)", () => {
  it("lists the full shared catalogue for AC and BB (not Zambia-only)", () => {
    const ac = listRegistrationCountries(PRODUCT.ACTIVECLINIC);
    const bb = listRegistrationCountries(PRODUCT.BLESSBOARD);
    assert.ok(ac.length > 1, "AC must expose more than one country");
    assert.ok(bb.length > 1, "BB must expose more than one country");
    assert.equal(ac.length, bb.length);
    assert.equal(ac[0].iso, "ZM");
    assert.ok(ac.some((c) => c.iso === "KE"));
    assert.ok(ac.some((c) => c.iso === "US"));
    assert.ok(ac.some((c) => c.iso === "GB"));
  });

  it("defaults to Zambia and keeps product rules configurable", () => {
    assert.equal(resolveRegistrationDefaultCountry(PRODUCT.ACTIVECLINIC), "ZM");
    assert.equal(resolveRegistrationDefaultCountry(PRODUCT.BLESSBOARD), "ZM");
    const acRules = getProductRegistrationCountryRules(PRODUCT.ACTIVECLINIC);
    const bbRules = getProductRegistrationCountryRules(PRODUCT.BLESSBOARD);
    assert.equal(acRules.allowlist, null);
    assert.equal(bbRules.allowlist, null);
    assert.equal(acRules.zambiaProvinceSelect, true);
    assert.equal(bbRules.zambiaProvinceSelect, false);
    assert.equal(usesZambiaProvinceSelect(PRODUCT.ACTIVECLINIC, "ZM"), true);
    assert.equal(usesZambiaProvinceSelect(PRODUCT.ACTIVECLINIC, "KE"), false);
    assert.equal(usesZambiaProvinceSelect(PRODUCT.BLESSBOARD, "ZM"), false);
  });

  it("normalizes supported countries and rejects unknown ISO codes", () => {
    assert.deepEqual(
      normalizeRegistrationCountryCode("ke", { product: PRODUCT.ACTIVECLINIC }),
      { ok: true, value: "KE" }
    );
    assert.equal(
      normalizeRegistrationCountryCode("XX", { product: PRODUCT.ACTIVECLINIC }).ok,
      false
    );
    assert.equal(
      normalizeRegistrationCountryCode("", { product: PRODUCT.ACTIVECLINIC, required: true }).ok,
      false
    );
    assert.equal(
      normalizeRegistrationCountryCode("", {
        product: PRODUCT.ACTIVECLINIC,
        required: false,
        fallbackCountry: "ZM",
      }).value,
      "ZM"
    );
    assert.equal(isSupportedRegistrationCountry(PRODUCT.BLESSBOARD, "ZM"), true);
    assert.equal(isSupportedRegistrationCountry(PRODUCT.BLESSBOARD, "XX"), false);
  });

  it("buildRegistrationPageLocals exposes multi-country lists for both products", () => {
    const ac = buildRegistrationPageLocals({}, PRODUCT.ACTIVECLINIC, { step: "clinic" });
    const bb = buildRegistrationPageLocals({}, PRODUCT.BLESSBOARD, { step: "church" });
    assert.ok(Array.isArray(ac.registrationCountries));
    assert.ok(ac.registrationCountries.length > 1);
    assert.ok(ac.phoneCountries.some((c) => c.iso === "KE"));
    assert.equal(ac.defaultCountry, "ZM");
    assert.ok(bb.registrationCountries.length > 1);
    assert.ok(bb.registrationCountries.some((c) => c.iso === "US"));
    const locals = buildRegistrationCountryLocals(PRODUCT.ACTIVECLINIC, {
      selectedCountry: "KE",
    });
    assert.equal(locals.selectedRegistrationCountry, "KE");
  });

  it("AC clinic registration accepts KE and rejects XX", () => {
    const ke = validateClinicRegistrationInput(
      {
        clinicName: "Nairobi Clinic",
        clinicType: "clinic",
        countryCode: "KE",
        city: "Nairobi",
        province: "Nairobi",
      },
      { step: "clinic" }
    );
    assert.equal(ke.ok, true);
    assert.equal(ke.normalized.countryCode, "KE");

    const zm = validateClinicRegistrationInput(
      {
        clinicName: "Lusaka Clinic",
        clinicType: "clinic",
        countryCode: "ZM",
        city: "Lusaka",
        province: "Lusaka",
      },
      { step: "clinic" }
    );
    assert.equal(zm.ok, true);
    assert.equal(zm.normalized.countryCode, "ZM");

    const bad = validateClinicRegistrationInput(
      {
        clinicName: "Bad Clinic",
        clinicType: "clinic",
        countryCode: "XX",
      },
      { step: "clinic" }
    );
    assert.equal(bad.ok, false);
    assert.ok(bad.errors.countryCode);
  });

  it("BB church country validation accepts catalogue countries and rejects unknown", () => {
    assert.deepEqual(validateChurchCountry("ZM"), { ok: true, value: "ZM" });
    assert.deepEqual(validateChurchCountry("Kenya"), { ok: true, value: "KE" });
    assert.equal(validateChurchCountry("XX").ok, false);
    assert.equal(validateChurchCountry("").ok, false);
  });
});
