"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const phoneRulesService = require("../src/phone/phoneRulesService");
const { isValidPhoneForTenant } = require("../src/tenants");

function demoRules() {
  return phoneRulesService.compileRules({
    slug: "demo",
    phone_strict_validation: false,
    phone_regex: "",
    phone_default_country_code: "",
    phone_normalization_mode: "generic_digits",
  });
}

function zmRules() {
  return phoneRulesService.compileRules({
    slug: "zm",
    phone_strict_validation: true,
    phone_regex: phoneRulesService.DEFAULT_ZM_PHONE_REGEX,
    phone_default_country_code: "260",
    phone_normalization_mode: "zm_e164",
  });
}

test("normalize Zm local and international to same canonical", () => {
  const r = zmRules();
  const a = phoneRulesService.normalizeWithRules(r, "0977123456");
  const b = phoneRulesService.normalizeWithRules(r, "+260 977 123 456");
  assert.equal(a, "260977123456");
  assert.equal(b, "260977123456");
});

test("normalize Demo generic_digits", () => {
  const r = demoRules();
  assert.equal(phoneRulesService.normalizeWithRules(r, "+44 20 7946 0958"), "442079460958");
});

test("validate Demo accepts non-Zambia when permissive", () => {
  const r = demoRules();
  const v = phoneRulesService.validateWithRules(r, "+44 20 7946 0958", "phone");
  assert.equal(v.ok, true);
});

test("validate Zm rejects invalid", () => {
  const r = zmRules();
  const v = phoneRulesService.validateWithRules(r, "+44 20 7946 0958", "phone");
  assert.equal(v.ok, false);
});

test("invalid stored regex does not crash validation", () => {
  const r = phoneRulesService.compileRules({
    slug: "zm",
    phone_strict_validation: true,
    phone_regex: "[invalid(",
    phone_default_country_code: "260",
    phone_normalization_mode: "zm_e164",
  });
  assert.equal(r.regexBroken, true);
  const v = phoneRulesService.validateWithRules(r, "0977123456", "phone");
  assert.equal(v.ok, true);
});

test("duplicate norm expansion for Zm", () => {
  const r = zmRules();
  const norms = phoneRulesService.expandDuplicateComparisonNorms(r, "260977123456");
  assert.ok(norms.includes("260977123456"));
  assert.ok(norms.includes("0977123456"));
});

test("isValidPhoneForTenant slug fallback matches Zm regex", () => {
  assert.equal(isValidPhoneForTenant("zm", "0977123456"), true);
  assert.equal(isValidPhoneForTenant("demo", "12345"), true);
  assert.equal(isValidPhoneForTenant("demo", "1234"), false);
});

test("safeCompileRegex rejects bad pattern", () => {
  const a = phoneRulesService.safeCompileRegex("[");
  assert.equal(a.ok, false);
  const b = phoneRulesService.safeCompileRegex("^\\d+$");
  assert.equal(b.ok, true);
});
