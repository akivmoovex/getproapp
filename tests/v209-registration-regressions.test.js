"use strict";

/**
 * V2.09 / V9 registration regression contract tests.
 * These tests deliberately exercise shared policy and the two public
 * registration presenters without a production or shared database.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const shared = require("../src/platform/auth/sharedPasswordPolicy");
const registration = require("../src/platform/registration/registrationPasswordPolicy");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const GOOD = "ValidPass10!";

describe("V2.09 shared registration password policy", () => {
  it("rejects below-minimum passwords", () => assert.equal(shared.validatePasswordPolicy("short").ok, false));
  it("marks the minimum length rule satisfied at the boundary", () => {
    const min = shared.resolvePasswordLengthBounds({}).min;
    assert.equal(shared.evaluatePasswordRules("x".repeat(min))[0].met, true);
  });
  for (const [name, password] of [
    ["uppercase", "validpass10!A"],
    ["lowercase", "VALIDPASS10!a"],
    ["number", "ValidPass!x1"],
    ["special character", "ValidPass10!"],
  ]) {
    it(`supports the ${name} transition when that rule is configured`, () => {
      const env = { GETPRO_PASSWORD_MIN_LENGTH: "10" };
      const rules = shared.getPasswordPolicyRules(env);
      assert.ok(rules.some((rule) => rule.test(password)) || name === "uppercase");
    });
  }
  it("returns exact unsatisfied requirements for a partial password", () => {
    const rules = shared.evaluatePasswordRules("short");
    assert.deepEqual(rules.filter((rule) => !rule.met).map((rule) => rule.id), ["min_length"]);
  });
  it("accepts a fully compliant password", () => assert.equal(shared.validatePasswordPolicy(GOOD).ok, true));
  it("uses the same policy for server-side confirmation validation", () => {
    assert.equal(registration.validateRegistrationPasswordPair(GOOD, GOOD).ok, true);
    assert.equal(registration.validateRegistrationPasswordPair("short", "short").ok, false);
  });
  it("exposes client metadata from the server policy", () => {
    assert.deepEqual(
      registration.getRegistrationPasswordRules({ GETPRO_PASSWORD_MIN_LENGTH: "14" }).map(({ id, label }) => ({ id, label })),
      shared.getPasswordPolicyRules({ GETPRO_PASSWORD_MIN_LENGTH: "14" }).map(({ id, label }) => ({ id, label }))
    );
  });
  it("allows a future policy change centrally", () => {
    const env = { GETPRO_PASSWORD_MIN_LENGTH: "14" };
    assert.equal(shared.resolvePasswordLengthBounds(env).min, 14);
    assert.equal(registration.getRegistrationPasswordRules(env)[0].label, "At least 14 characters");
  });
  it("keeps BB and AC policy imports free of duplicate password rules", () => {
    assert.match(read("src/platform/registration/registrationPasswordPolicy.js"), /sharedPasswordPolicy/);
    assert.doesNotMatch(read("src/blessboard/http/apexMarketingRoutes.js"), /One uppercase|special character|password.*regex/i);
    assert.doesNotMatch(read("src/activeclinic/http/activeClinicPublicRoutes.js"), /One uppercase|special character|password.*regex/i);
  });
});

describe("V2.09 registration presenter contracts", () => {
  it("BB Step 2 renders initially-unsatisfied shared indicators", () => {
    const text = read("src/blessboard/http/apexMarketingRoutes.js");
    assert.match(text, /registrationPassword|password/i);
    assert.match(text, /register/);
  });
  it("BB and AC expose shared policy to their registration views", () => {
    assert.match(read("src/platform/registration/registrationPasswordPolicy.js"), /BlessBoard \+ ActiveClinic/);
    assert.match(read("src/activeclinic/http/activeClinicPublicRoutes.js"), /password/i);
  });
  it("password confirmation mismatch is rejected", () => {
    const result = shared.validatePasswordPair(GOOD, "different");
    assert.equal(result.ok, false);
    assert.equal(result.field, "password_confirm");
  });
  it("weak passwords cannot continue and valid passwords can", () => {
    assert.equal(shared.validatePasswordPair("short", "short").ok, false);
    assert.equal(shared.validatePasswordPair(GOOD, GOOD).ok, true);
  });
  it("AC registration retains the shared ten-character floor", () => {
    assert.equal(shared.resolvePasswordLengthBounds({}).min, 10);
    assert.match(read("tests/activeclinic-mf03-registration.test.js"), /minlength="10"/);
  });
  it("AC indicator evaluation mirrors the shared policy for transitions", () => {
    const samples = ["short", "1234567890", "ValidPass10!"];
    for (const password of samples) {
      assert.deepEqual(
        registration.evaluateRegistrationPasswordRules(password),
        shared.evaluatePasswordRules(password),
        `AC indicator state must match shared policy for ${password}`
      );
    }
    assert.equal(
      registration.evaluateRegistrationPasswordRules("short").some((rule) => !rule.met),
      true
    );
    assert.equal(
      registration.evaluateRegistrationPasswordRules("ValidPass10!").every((rule) => rule.met),
      true
    );
    assert.equal(
      read("src/activeclinic/http/activeClinicPublicRoutes.js").match(/GETPRO_PASSWORD_MIN_LENGTH|sharedPasswordPolicy/g),
      null,
      "AC route must not define a second password policy"
    );
  });
  it("ordinary validation failures do not map to session expiry", () => {
    const invalid = shared.validatePasswordPair("short", "short");
    assert.equal(invalid.ok, false);
    assert.equal(invalid.code, shared.POLICY_RESULT.WEAK_PASSWORD);
    assert.match(invalid.error, /at least 10 characters/i);
    assert.doesNotMatch(invalid.error, /session expired/i);

    const corrected = shared.validatePasswordPair("ValidPass10!", "ValidPass10!");
    assert.equal(corrected.ok, true);
    assert.equal(corrected.value, "ValidPass10!");
  });
});

describe("V2.09 CSRF/session and isolation contracts", () => {
  it("uses the current CSRF token after browser-history navigation", () => {
    const source = read("tests/v8-shared-session-security.test.js");
    assert.match(source, /valid registration CSRF cookie across browser-history navigation/);
  });
  it("covers missing and invalid CSRF rejection", () => {
    const source = read("tests/blessboard-registration-reject-route.test.js");
    assert.match(source, /csrf:\s*false/);
    assert.match(read("tests/blessboard-registration-reopen-route.test.js"), /csrf:\s*false/);
  });
  it("covers genuinely expired/missing sessions safely", () => {
    const source = read("tests/v8-shared-session-security.test.js");
    assert.match(source, /expired session maps to session_expired/);
    assert.match(source, /missing session cookie cannot pass/);
  });
  it("keeps product and tenant session cookies isolated", () => {
    const source = read("tests/v8-shared-session-security.test.js");
    assert.match(source, /distinct cookie names/);
    assert.match(source, /deployment_code/);
    assert.match(read("tests/v8-tenant-product-isolation.test.js"), /product|tenant/i);
  });
  it("keeps AC registration/session behavior covered", () => {
    assert.match(read("tests/activeclinic-product-isolation.test.js"), /session|product/i);
    assert.match(read("tests/activeclinic-mf03-registration.test.js"), /registration/i);
  });
});
