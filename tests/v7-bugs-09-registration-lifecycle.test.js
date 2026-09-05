"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  REGISTRATION_NAV_PARAM,
  isRegistrationContinuityRequest,
  withRegistrationNavParam,
  sanitizeRegistrationDraftFormData,
  resolveRegistrationDraftForGet,
} = require("../src/platform/registration/registrationDraftLifecycle");
const {
  parseRegistrationReturnContext,
  buildRegistrationOutboundLink,
  PRODUCT_CODE,
} = require("../src/platform/registration/registrationReturnContext");
const {
  buildRegistrationPageLocals,
  buildRegistrationStepHref,
} = require("../src/platform/registration/registrationRenderLocals");

describe("V7 registration lifecycle bug 09", () => {
  it("marks registration continuity only when gpRegNav=1 is present", () => {
    assert.equal(isRegistrationContinuityRequest({ query: {} }), false);
    assert.equal(isRegistrationContinuityRequest({ query: { gpRegNav: "1" } }), true);
    assert.equal(isRegistrationContinuityRequest({ query: { from: "registration" } }), false);
    assert.equal(REGISTRATION_NAV_PARAM, "gpRegNav");
  });

  it("appends gpRegNav to inbound and outbound registration links", () => {
    assert.match(withRegistrationNavParam("/register-church"), /gpRegNav=1/);
    assert.match(
      withRegistrationNavParam("/register-church?step=administrator&plan=foundation"),
      /gpRegNav=1/
    );
    assert.match(
      buildRegistrationOutboundLink({
        product: PRODUCT_CODE.BLESSBOARD,
        targetPath: "/terms",
        step: "review",
      }),
      /gpRegNav=1/
    );
    const back = parseRegistrationReturnContext(
      { query: { from: "registration", returnTo: "register-clinic", step: "administrator" } },
      PRODUCT_CODE.ACTIVECLINIC
    );
    assert.match(back.backHref, /gpRegNav=1/);
    assert.match(
      buildRegistrationStepHref(PRODUCT_CODE.ACTIVECLINIC, { step: "review" }),
      /^\/register-clinic\?step=review&gpRegNav=1$/
    );
  });

  it("clears draft on fresh GET and preserves draft on continuity GET", () => {
    let cleared = false;
    const env = { SESSION_SECRET: "x".repeat(32) };
    const res = {
      append() {},
    };
    const readDraft = () => ({ formData: { clinicName: "Draft Clinic", password: "secret" } });
    const clearDraft = () => {
      cleared = true;
    };

    const fresh = resolveRegistrationDraftForGet({
      req: { query: {} },
      res,
      isProduction: false,
      clearDraft,
      readDraft,
      env,
    });
    assert.equal(fresh.restoreDraft, false);
    assert.equal(fresh.formData, null);
    assert.equal(cleared, true);

    cleared = false;
    const continuity = resolveRegistrationDraftForGet({
      req: { query: { gpRegNav: "1" } },
      res,
      isProduction: false,
      clearDraft,
      readDraft,
      env,
    });
    assert.equal(continuity.restoreDraft, true);
    assert.equal(continuity.formData.clinicName, "Draft Clinic");
    assert.equal(continuity.formData.password, undefined);
    assert.equal(cleared, false);
  });

  it("never stores passwords in sanitized draft payloads", () => {
    const sanitized = sanitizeRegistrationDraftFormData({
      clinicName: "Test",
      password: "long-enough-secret",
      password_confirm: "long-enough-secret",
    });
    assert.equal(sanitized.clinicName, "Test");
    assert.equal(sanitized.password, undefined);
    assert.equal(sanitized.password_confirm, undefined);
  });

  it("exposes shared registration lifecycle script with beforeunload guard", () => {
    const js = fs.readFileSync(
      path.join(__dirname, "../public/platform/registration-form-lifecycle.js"),
      "utf8"
    );
    assert.match(js, /initRegistrationLifecycle/);
    assert.match(js, /beforeunload/);
    assert.match(js, /data-gp-registration-nav/);
    assert.match(js, /releaseGuard/);
    assert.match(js, /pageshow/);
    assert.match(js, /restoreSubmitButtons/);
  });

  it("buildRegistrationPageLocals includes step href helper", () => {
    const locals = buildRegistrationPageLocals(
      { query: { from: "registration", returnTo: "register-church", step: "church" } },
      PRODUCT_CODE.BLESSBOARD,
      { step: "church", plan: "foundation" }
    );
    assert.equal(typeof locals.registrationStepHref, "function");
    assert.match(locals.registrationTermsHref, /gpRegNav=1/);
    assert.match(locals.registrationStepHref("administrator"), /gpRegNav=1/);
  });
});
