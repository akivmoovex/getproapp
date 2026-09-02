"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  parseRegistrationReturnContext,
  buildRegistrationOutboundLink,
  registrationLinkLocals,
  PRODUCT_CODE,
} = require("../src/platform/registration/registrationReturnContext");
const {
  validateRegistrationConsent,
  CONSENT_FIELD,
  readRegistrationConsentValue,
} = require("../src/platform/registration/registrationConsent");
const {
  validateRegistrationPasswordPair,
  REGISTRATION_PASSWORD_RULES,
  PASSWORD_MIN,
  PASSWORD_MAX,
} = require("../src/platform/registration/registrationPasswordPolicy");
const { validateTermsAcceptance, TERMS_REQUIRED_MESSAGE } = require("../src/activeclinic/legal/termsAcceptance");
const { resolveWebsiteActionUrls } = require("../src/blessboard/urls/websiteActionUrls");
const { buildPublicOrganizationWebsitePath, PRODUCT_CODE: URL_PRODUCT } = require("../src/platform/website/publicWebsiteUrl");

describe("V7 registration UX bugs 05–08", () => {
  it("builds allowlisted registration return links for pricing and legal pages", () => {
    const pricing = buildRegistrationOutboundLink({
      product: PRODUCT_CODE.BLESSBOARD,
      targetPath: "/pricing",
      step: "church",
      plan: "foundation",
    });
    assert.match(pricing, /^\/pricing\?/);
    assert.match(pricing, /from=registration/);
    assert.match(pricing, /returnTo=register-church/);
    assert.match(pricing, /step=church/);
    assert.match(pricing, /plan=foundation/);

    const terms = buildRegistrationOutboundLink({
      product: PRODUCT_CODE.ACTIVECLINIC,
      targetPath: "/terms",
      step: "review",
    });
    assert.match(terms, /^\/terms\?/);
    assert.match(terms, /returnTo=register-clinic/);
    assert.match(terms, /step=review/);
  });

  it("shows registration back bar only for allowlisted return context", () => {
    const direct = parseRegistrationReturnContext({}, PRODUCT_CODE.BLESSBOARD);
    assert.equal(direct.isRegistrationReturn, false);
    assert.equal(direct.backHref, null);

    const fromReg = parseRegistrationReturnContext(
      { query: { from: "registration", returnTo: "register-church", step: "administrator" } },
      PRODUCT_CODE.BLESSBOARD
    );
    assert.equal(fromReg.isRegistrationReturn, true);
    assert.equal(fromReg.backHref, "/register-church?step=administrator");
    assert.equal(fromReg.backLabel, "Back to registration");

    const rejected = parseRegistrationReturnContext(
      { query: { returnTo: "https://evil.example/phish" } },
      PRODUCT_CODE.ACTIVECLINIC
    );
    assert.equal(rejected.isRegistrationReturn, false);
  });

  it("exposes shared registration link locals per product step", () => {
    const bb = registrationLinkLocals({
      product: PRODUCT_CODE.BLESSBOARD,
      step: "review",
      plan: "growth",
    });
    assert.match(bb.registrationTermsHref, /returnTo=register-church/);
    assert.match(bb.registrationPrivacyHref, /step=review/);
    assert.match(bb.registrationPricingHref, /plan=growth/);

    const ac = registrationLinkLocals({
      product: PRODUCT_CODE.ACTIVECLINIC,
      step: "administrator",
    });
    assert.match(ac.registrationTermsHref, /returnTo=register-clinic/);
    assert.equal(ac.registrationPricingHref, null);
  });

  it("uses one shared password policy source (min/max only)", () => {
    assert.equal(REGISTRATION_PASSWORD_RULES.length, 2);
    assert.equal(PASSWORD_MIN, 10);
    assert.equal(PASSWORD_MAX, 200);

    const weak = validateRegistrationPasswordPair("short", "short");
    assert.equal(weak.ok, false);
    assert.equal(weak.field, "password");

    const mismatch = validateRegistrationPasswordPair("valid-password-10", "other-password-10");
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.field, "password_confirm");

    const ok = validateRegistrationPasswordPair("valid-password-10", "valid-password-10");
    assert.equal(ok.ok, true);
    assert.equal(ok.value, "valid-password-10");
  });

  it("requires shared registration consent on server for both products", () => {
    assert.equal(validateRegistrationConsent({}).ok, false);
    assert.equal(validateRegistrationConsent({ [CONSENT_FIELD]: "on" }).ok, true);
    assert.equal(readRegistrationConsentValue({ consent_contact: "on" }), true);
    assert.equal(readRegistrationConsentValue({ acceptTerms: "on" }), true);

    const ac = validateTermsAcceptance({ registration_consent: "on" });
    assert.equal(ac.ok, true);
    assert.equal(ac.termsVersion, ac.termsVersion);

    const missing = validateTermsAcceptance({});
    assert.equal(missing.ok, false);
    assert.equal(missing.errors[CONSENT_FIELD], TERMS_REQUIRED_MESSAGE);
  });

  it("scopes branch admin website action URLs to assigned branch when branchKey is provided", () => {
    const branch = resolveWebsiteActionUrls({
      actor: "branch_admin",
      organizationKey: "demo3",
      branchKey: "south-campus",
    });
    assert.equal(
      branch.previewUrl,
      "/c/demo3/south-campus?website_edit=1&website_mode=draft"
    );
    assert.equal(
      branch.publishedWebsiteUrl,
      buildPublicOrganizationWebsitePath({
        product: URL_PRODUCT.BLESSBOARD,
        organizationKey: "demo3",
        scope: { kind: "branch", branchKey: "south-campus" },
      })
    );
  });
});
