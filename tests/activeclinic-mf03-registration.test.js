"use strict";

/**
 * MF03 clinic-registration chrome: visual contract on the existing engine.
 * Does not add License ID, specialty taxonomy, OTP, or SSO.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  renderPublicPage,
} = require("../src/activeclinic/http/renderActiveClinicPublic");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function clinicLocals(extra) {
  return {
    csrfField: "_csrf",
    csrfToken: "x",
    formData: { countryCode: "ZM", clinicType: "clinic", ...(extra.formData || {}) },
    validationErrors: extra.validationErrors || {},
    formState: extra.formState || "form",
    phoneCountries: [{ iso: "ZM", name: "Zambia", callingCode: "+260" }],
    clinicTypeOptions: [
      { value: "hospital", label: "Hospital" },
      { value: "clinic", label: "Clinic" },
      { value: "health_centre", label: "Health centre" },
    ],
    wizardStep: extra.wizardStep || "clinic",
    error: extra.error || null,
    ...extra,
  };
}

describe("ActiveClinic MF03 registration chrome", () => {
  it("step 1 uses transactional MF chrome and V7 facility types", () => {
    const html = renderPublicPage({
      pageId: "public-register-clinic",
      pageTitle: "Register",
      contentTemplate: "public/register-clinic",
      shellVariant: "platform",
      locals: clinicLocals({ wizardStep: "clinic" }),
    });
    assert.match(html, /data-ac-public-chrome="mf-register"/);
    assert.match(html, /data-ac-mf-family="MF03"/);
    assert.match(html, /data-ac-acw-screen="ACW09-clinic"/);
    assert.match(html, /name="clinicName"/);
    assert.match(html, /name="clinicType"/);
    assert.match(html, /name="countryCode"/);
    assert.match(html, /name="province"/);
    assert.match(html, /name="city"/);
    assert.match(html, /name="address"/);
    assert.match(html, /name="notes"/);
    assert.match(html, />Hospital</);
    assert.match(html, />Clinic</);
    assert.doesNotMatch(html, /General Practice|Specialist Center|Physiotherapy/);
    assert.doesNotMatch(html, /License ID|license_number/);
    assert.doesNotMatch(html, /Continue with Google|Sign in with Apple/);
    assert.doesNotMatch(html, /data-ac-mobile-bottom-nav="platform"/);
    assert.match(html, /href="\/privacy"/);
    assert.match(html, /href="\/terms"/);
    assert.match(html, /href="\/contact"/);
    assert.doesNotMatch(html, /Help Center/);
    assert.match(html, /aria-current="step"/);
    assert.match(html, /Step 1 of 3/);
  });

  it("step 2 keeps V7 10-character password policy and empty password fields", () => {
    const html = renderPublicPage({
      pageId: "public-register-clinic",
      pageTitle: "Register",
      contentTemplate: "public/register-clinic",
      shellVariant: "platform",
      locals: clinicLocals({
        wizardStep: "administrator",
        formData: {
          clinicName: "Lakeside",
          clinicType: "clinic",
          countryCode: "ZM",
          contactName: "Ada",
          contactEmail: "ada@example.com",
        },
      }),
    });
    assert.match(html, /data-ac-acw-screen="ACW09-admin"/);
    assert.match(html, /Administrator name/);
    assert.match(html, /minlength="10"/);
    assert.match(html, /Password must be at least 10 characters/);
    assert.doesNotMatch(html, /At least 8 characters/);
    assert.doesNotMatch(html, /One uppercase letter/);
    assert.match(html, /name="password"/);
    assert.doesNotMatch(html, /name="password"[^>]*value=/);
    assert.match(html, /data-ac-toggle-password="password"/);
    assert.match(html, /data-ac-phone-field/);
  });

  it("review shows live payload fields and omits Stitch-only license/CMO", () => {
    const html = renderPublicPage({
      pageId: "public-register-clinic",
      pageTitle: "Review",
      contentTemplate: "public/register-clinic-review",
      shellVariant: "platform",
      locals: clinicLocals({
        wizardStep: "review",
        formData: {
          clinicName: "Lakeside Medical",
          clinicType: "hospital",
          clinicTypeLabel: "Hospital",
          countryCode: "ZM",
          city: "Lusaka",
          province: "Lusaka Province",
          address: "1 Independence Avenue",
          contactName: "Ada Admin",
          contactEmail: "ada@clinic.example",
          contactPhone: "+260971100001",
        },
      }),
    });
    assert.match(html, /data-ac-acw-screen="ACW09-review"/);
    assert.match(html, /Lakeside Medical/);
    assert.match(html, /Hospital/);
    assert.match(html, /Ada Admin/);
    assert.match(html, /name="acceptTerms"/);
    assert.match(html, /Create clinic/);
    assert.match(html, /data-ac-register-confirm="1"/);
    assert.doesNotMatch(html, /License ID|WA-MED/);
    assert.doesNotMatch(html, /Chief Medical Officer/);
    assert.doesNotMatch(html, /name="password"[^>]*type="text"/);
  });

  it("success uses immediate-provision copy and real destinations", () => {
    const html = renderPublicPage({
      pageId: "public-register-clinic-success",
      pageTitle: "Clinic created",
      contentTemplate: "public/register-clinic-success",
      shellVariant: "platform",
      locals: clinicLocals({
        wizardStep: "success",
        ready: true,
        reviewRequired: false,
        applicationReference: "AC-TEST-1",
      }),
    });
    assert.match(html, /Your clinic is ready/);
    assert.match(html, /unpublished/i);
    assert.match(html, /Website Management/);
    assert.match(html, /data-ac-sign-in="1"/);
    assert.match(html, /href="\/login"/);
    assert.match(html, /data-ac-continue-onboarding="1"/);
    assert.doesNotMatch(html, /Waiting for Platform Admin approval|We'll approve your clinic shortly/i);
    assert.doesNotMatch(html, /View Help Guide/);
  });

  it("scopes MF03 CSS away from BlessBoard and marketing pages", () => {
    const css = read("public/activeclinic/acw-platform.css");
    assert.match(css, /body\.ac-public-body--mf-register/);
    assert.match(css, /@media \(max-width: 390px\)/);
    assert.match(css, /overflow-x:\s*clip/);
    assert.doesNotMatch(css, /body\.church-body--apex \.acw-register/);
  });
});
