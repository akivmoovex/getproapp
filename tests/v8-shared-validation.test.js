"use strict";

/**
 * V8 shared validation + safe API error handling.
 * Field validators, form/field errors, correlation IDs, and leak-safe responses.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");

const {
  validateRequired,
  validateEmail,
  validatePhone,
  validateText,
  validateUrl,
  validateUuid,
  validateImageUpload,
  validateFields,
  validatePasswordPair,
  VALIDATION_CODE,
  MEDIA_LIMITS,
} = require("../src/platform/validation");
const {
  statusForCode,
  sanitizePublicErrorMessage,
  buildSafeApiErrorBody,
  sendSafeApiError,
  sendValidationApiError,
  sendAuthorizationApiError,
  sendBackendFailureApiError,
  wrapAsyncRoute,
  ensureCorrelationId,
  resolveCorrelationId,
} = require("../src/platform/http/sharedApiError");
const { validateContentValue, CONTENT_TYPES } = require("../src/platform/website/contentTypes");
const { safeRegistrationPublicError } = require("../src/platform/registration/safeRegistrationPublicError");
const { assignV5RequestId, createV5ErrorHandler } = require("../src/platform/http/v5SafeLogging");

describe("V8 shared field validators", () => {
  it("rejects missing required and invalid email/phone/url/uuid/text", () => {
    assert.equal(validateRequired("").ok, false);
    assert.equal(validateRequired("ok").ok, true);

    assert.equal(validateEmail("not-an-email").ok, false);
    assert.equal(validateEmail("not-an-email").code, VALIDATION_CODE.INVALID_EMAIL);
    assert.equal(validateEmail("user@example.org").ok, true);
    assert.equal(validateEmail("").ok, true);
    assert.equal(validateEmail("", { required: true }).ok, false);

    assert.equal(validatePhone("abc").ok, false);
    assert.equal(validatePhone("+260971234567").ok, true);

    assert.equal(validateUrl("javascript:alert(1)").ok, false);
    assert.equal(validateUrl("https://example.org/a").ok, true);
    assert.equal(validateUrl("/relative/path").ok, true);

    assert.equal(validateUuid("nope").ok, false);
    assert.equal(validateUuid("11111111-1111-4111-8111-111111111111").ok, true);

    assert.equal(validateText("<script>x</script>").ok, false);
    assert.equal(validateText("Hello", { maxLen: 3 }).ok, false);
    assert.equal(validateText("Hello", { maxLen: 10 }).ok, true);
  });

  it("validates image uploads and password pairs consistently", () => {
    const bad = validateImageUpload({ mimeType: "text/html", sizeBytes: 10 });
    assert.equal(bad.ok, false);
    assert.equal(bad.code, VALIDATION_CODE.UNSAFE_MEDIA_TYPE);

    const huge = validateImageUpload({
      mimeType: "image/jpeg",
      sizeBytes: MEDIA_LIMITS.maxBytes + 1,
    });
    assert.equal(huge.ok, false);
    assert.equal(huge.code, VALIDATION_CODE.MEDIA_TOO_LARGE);

    const ok = validateImageUpload({ mimeType: "image/png", sizeBytes: 128 });
    assert.equal(ok.ok, true);

    const weak = validatePasswordPair("short", "short");
    assert.equal(weak.ok, false);
    const mismatch = validatePasswordPair("long-enough-password", "other");
    assert.equal(mismatch.ok, false);
    const pair = validatePasswordPair("long-enough-password", "long-enough-password");
    assert.equal(pair.ok, true);
  });

  it("collects field-level and form-level errors", () => {
    const result = validateFields(
      {
        email: { kind: "email", required: true },
        phone: { kind: "phone", required: true },
        name: { kind: "text", required: true, maxLen: 40 },
      },
      { email: "bad", phone: "", name: "" }
    );
    assert.equal(result.ok, false);
    assert.ok(result.fieldErrors.email);
    assert.ok(result.fieldErrors.phone);
    assert.ok(result.fieldErrors.name);
    assert.match(String(result.formError), /correct/i);
  });

  it("keeps website contentTypes email/phone contracts via shared validators", () => {
    const email = validateContentValue({ type: CONTENT_TYPES.EMAIL, maxLen: 254 }, "a@b.co");
    assert.equal(email.ok, true);
    const bad = validateContentValue({ type: CONTENT_TYPES.EMAIL }, "nope");
    assert.equal(bad.ok, false);
    assert.equal(bad.code, "invalid_email");
    const phone = validateContentValue({ type: CONTENT_TYPES.PHONE }, "+260971234567");
    assert.equal(phone.ok, true);
  });
});

describe("V8 shared safe API errors", () => {
  it("maps codes to HTTP status and sanitizes sensitive messages", () => {
    assert.equal(statusForCode("validation_failed"), 400);
    assert.equal(statusForCode("forbidden"), 403);
    assert.equal(statusForCode("unauthenticated"), 401);
    assert.equal(statusForCode("not_found"), 404);
    assert.equal(statusForCode("conflict"), 409);
    assert.equal(statusForCode("rate_limit"), 429);
    assert.equal(statusForCode("server_error"), 500);

    assert.match(
      sanitizePublicErrorMessage("Enter a valid email."),
      /email/i
    );
    assert.equal(
      sanitizePublicErrorMessage("password=secret postgres://user:pass@host/db"),
      "Something went wrong. Please try again."
    );
    assert.equal(
      sanitizePublicErrorMessage("Error\n    at Object.<anonymous> (x.js:1:1)"),
      "Something went wrong. Please try again."
    );
  });

  it("builds V7-compatible bodies with additive correlation and fieldErrors", () => {
    const body = buildSafeApiErrorBody({
      code: "invalid_email",
      reason: "invalid_email",
      message: "Enter a valid email address.",
      fieldErrors: { email: "Enter a valid email address." },
      formError: "Please correct the highlighted fields.",
      requestId: "abc123",
    });
    assert.equal(body.ok, false);
    assert.equal(body.code, "invalid_email");
    assert.equal(body.reason, "invalid_email");
    assert.equal(body.requestId, "abc123");
    assert.equal(body.correlationId, "abc123");
    assert.equal(body.fieldErrors.email, "Enter a valid email address.");
  });

  it("returns safe API errors for validation, authz, and backend failures", async () => {
    const app = express();
    app.use(assignV5RequestId);
    app.get("/validate", (req, res) => {
      const validation = validateFields(
        { email: { kind: "email", required: true } },
        { email: "bad" }
      );
      return sendValidationApiError(req, res, validation);
    });
    app.get("/forbidden", (req, res) => sendAuthorizationApiError(req, res, { code: "forbidden" }));
    app.get("/boom", (req, res) => {
      const err = new Error("relation \"secret_table\" does not exist password=x");
      err.code = "42P01";
      return sendBackendFailureApiError(req, res, err, { isProduction: true, log: () => {} });
    });
    app.get(
      "/async-fail",
      wrapAsyncRoute(async () => {
        const err = new Error("async failure");
        err.status = 503;
        throw err;
      })
    );
    app.use(createV5ErrorHandler({ env: { NODE_ENV: "test" }, log: () => {} }));

    const validation = await request(app).get("/validate").set("Accept", "application/json");
    assert.equal(validation.status, 400);
    assert.equal(validation.body.ok, false);
    assert.equal(validation.body.code, "validation_failed");
    assert.ok(validation.body.fieldErrors.email);
    assert.ok(validation.body.requestId);
    assert.equal(validation.body.correlationId, validation.body.requestId);
    assert.equal(validation.headers["x-correlation-id"], validation.body.correlationId);

    const forbidden = await request(app).get("/forbidden").set("Accept", "application/json");
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.code, "forbidden");

    const boom = await request(app).get("/boom").set("Accept", "application/json");
    assert.equal(boom.status, 500);
    assert.equal(boom.body.code, "server_error");
    assert.doesNotMatch(JSON.stringify(boom.body), /secret_table|password=/i);

    const asyncFail = await request(app).get("/async-fail").set("Accept", "application/json");
    assert.equal(asyncFail.status, 503);
    assert.equal(asyncFail.body.ok, false);
    assert.equal(asyncFail.body.reason, "server_error");
    assert.ok(asyncFail.body.requestId);
    assert.equal(asyncFail.body.correlationId, asyncFail.body.requestId);
  });

  it("honors incoming x-request-id and registration public error sanitization", () => {
    const req = { headers: { "x-request-id": "corr-test-001" } };
    const res = { headersSent: false, setHeader() {} };
    const id = ensureCorrelationId(req, res);
    assert.equal(id, "corr-test-001");
    assert.equal(resolveCorrelationId(req), "corr-test-001");

    assert.equal(
      safeRegistrationPublicError("schema_mismatch"),
      "We could not save your request right now. Please try again shortly."
    );
    assert.equal(
      safeRegistrationPublicError("Please choose another church name."),
      "Please choose another church name."
    );
    assert.match(
      safeRegistrationPublicError("DATABASE_URL=postgres://x"),
      /could not save|try again/i
    );
  });
});
