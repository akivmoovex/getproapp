"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const express = require("express");
const request = require("supertest");
const fs = require("node:fs");
const path = require("node:path");

const {
  safeRegistrationPublicError,
  DEFAULT_PUBLIC_REGISTRATION_ERROR,
} = require("../src/platform/registration/safeRegistrationPublicError");
const {
  mapProvisionFailure,
  GENERIC_PROVISION_ERROR,
  GENERIC_SAVE_ERROR,
} = require("../src/blessboard/services/platformChurchRegistrationService");
const {
  STATUS,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const {
  createApexMarketingRouter,
  wizardStepFromAction,
} = require("../src/blessboard/http/apexMarketingRoutes");
const { CSRF_FIELD } = require("../src/platform/http/v5Csrf");

function createTestApp() {
  const env = {
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    NODE_ENV: "test",
  };
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    req.cookies = {};
    next();
  });
  app.use(
    createApexMarketingRouter({
      getPool: () => null,
      isApexHost: () => true,
      env,
      isProduction: false,
    })
  );
  return app;
}

describe("BB production registration P1 guards", () => {
  it("never returns a blank public registration error", () => {
    assert.equal(safeRegistrationPublicError(""), DEFAULT_PUBLIC_REGISTRATION_ERROR);
    assert.equal(safeRegistrationPublicError(null), DEFAULT_PUBLIC_REGISTRATION_ERROR);
    assert.equal(safeRegistrationPublicError("   "), DEFAULT_PUBLIC_REGISTRATION_ERROR);
    assert.equal(
      safeRegistrationPublicError("deployment_not_found"),
      DEFAULT_PUBLIC_REGISTRATION_ERROR
    );
    assert.equal(
      safeRegistrationPublicError("provision_failure", GENERIC_PROVISION_ERROR),
      GENERIC_PROVISION_ERROR
    );
    assert.equal(
      safeRegistrationPublicError("Please enter your church name."),
      "Please enter your church name."
    );
  });

  it("maps missing deployment catalogue to a non-empty provision error", () => {
    const mapped = mapProvisionFailure({ status: STATUS.DEPLOYMENT_NOT_FOUND || "deployment_not_found" }, null);
    assert.equal(mapped.ok, false);
    assert.equal(mapped.httpStatus, 503);
    assert.equal(String(mapped.error || "").trim().length > 0, true);
    assert.doesNotMatch(String(mapped.error), /deployment_not_found/i);
    assert.equal(mapped.error, GENERIC_PROVISION_ERROR);
  });

  it("keeps CSRF failures on the review step for confirm posts", () => {
    assert.equal(wizardStepFromAction("confirm"), "review");
    assert.equal(wizardStepFromAction("next-admin"), "administrator");
    assert.equal(wizardStepFromAction("next-church"), "church");
  });

  it("POST confirm with invalid CSRF stays on review with a non-empty alert", async () => {
    const app = createTestApp();
    const res = await request(app)
      .post("/register-church")
      .type("form")
      .send({
        action: "confirm",
        church_name: "P1 CSRF Church",
        country: "ZM",
        city: "Lusaka",
        branch_name: "HQ Campus",
        selected_plan: "foundation",
        contact_name: "P1 Admin",
        email: "p1-csrf@example.org",
        phone_country: "ZM",
        phone_national: "971234567",
        role_in_church: "Administrator",
        registration_consent: "on",
        [CSRF_FIELD]: "v5c1.not-a-valid-token.invalid",
      });

    assert.equal(res.status, 403);
    assert.match(res.text, /security token/i);
    assert.match(res.text, /bb-apex-register-alert/);
    assert.match(res.text, /data-bb-register-step="review"/);
    assert.doesNotMatch(res.text, /role="alert"><p>\s*<\/p>/);
    assert.ok(String(res.text).includes(GENERIC_SAVE_ERROR) === false || /security token/i.test(res.text));
  });

  it("registration lifecycle script restores submit buttons after cancelled navigation", () => {
    const js = fs.readFileSync(
      path.join(__dirname, "../public/platform/registration-form-lifecycle.js"),
      "utf8"
    );
    assert.match(js, /pageshow/);
    assert.match(js, /restoreSubmitButtons/);
    assert.match(js, /data-gp-reg-label/);
  });
});
