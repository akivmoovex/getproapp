"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createResendOtpEmailTransport } = require("../../../src/platform/email/resendOtpTransport");
const { resolveOtpProvider } = require("../../../src/platform/otp/otpProviders");

const KEY = "re_test_key_not_a_secret";
const PEPPER = "g334-pepper-value-that-is-at-least-32";
const CODE = "135790";
const VERIFIED = "notify.blessboard.com,notify.activeclinic.org";

function baseEnv(extra) {
  return {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "testing",
    DATABASE_IDENTITY_ENV: "testing",
    GETPRO_OTP_PROVIDER: "resend",
    GETPRO_OTP_EMAIL_PROVIDER: "resend",
    GETPRO_OTP_ACTIVATION: "ACTIVE",
    GETPRO_OTP_EMAIL_DELIVERY: "owner-approved",
    GETPRO_OTP_PEPPER: PEPPER,
    SESSION_SECRET: "session-secret-different-from-pepper-32",
    GETPRO_RESEND_VERIFIED_DOMAINS: VERIFIED,
    RESEND_API_KEY: KEY,
    ...extra,
  };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body || {});
    },
  };
}

function fetchMock(handler) {
  const calls = [];
  return {
    calls,
    async fetchImpl(url, init) {
      calls.push({ url, init });
      return handler(calls.length, url, init);
    },
  };
}

function payload(productCode, key) {
  return {
    productCode,
    purpose: "login",
    destination: "person@example.com",
    text: `Your verification code is ${CODE}. It expires in 5 minutes.`,
    idempotencyKey: key,
  };
}

describe("G334 shared Resend OTP provider", () => {
  it("accepts one mock delivery for ActiveClinic and BlessBoard and does not claim mailbox receipt", async () => {
    for (const product of ["activeclinic", "blessboard"]) {
      const mock = fetchMock(async () => jsonResponse(200, { id: `email_${product}` }));
      const transport = createResendOtpEmailTransport(baseEnv(), { fetchImpl: mock.fetchImpl });
      const result = await transport(payload(product, `attempt-${product}`));
      assert.equal(result.ok, true);
      assert.equal(result.delivered, false);
      assert.equal(result.reason, "resend");
      assert.equal(mock.calls.length, 1);
      assert.equal(mock.calls[0].url, "https://api.resend.com/emails");
      const body = JSON.parse(mock.calls[0].init.body);
      const from = product === "activeclinic"
        ? "ActiveClinic Security <security@notify.activeclinic.org>"
        : "BlessBoard Security <security@notify.blessboard.com>";
      assert.equal(body.from, from);
      assert.equal(body.to[0], "person@example.com");
      assert.equal(JSON.stringify(result).includes(KEY), false);
      assert.equal(JSON.stringify(result).includes(CODE), false);
    }
  });

  it("fails closed for a missing approval, a production process, a missing key, and an unverified sender", async () => {
    const mock = fetchMock(async () => jsonResponse(200, { id: "email_should_not_send" }));
    const closed = await createResendOtpEmailTransport(
      baseEnv({ GETPRO_OTP_EMAIL_DELIVERY: "" }),
      { fetchImpl: mock.fetchImpl }
    )(payload("activeclinic", "closed"));
    assert.equal(closed.ok, false);
    const hosted = await createResendOtpEmailTransport(
      baseEnv({ NODE_ENV: "production", DEPLOYMENT_ENV: "production" }),
      { fetchImpl: mock.fetchImpl }
    )(payload("blessboard", "hosted"));
    assert.equal(hosted.reason, "production_environment");
    const missing = await createResendOtpEmailTransport(
      baseEnv({ RESEND_API_KEY: "" }),
      { fetchImpl: mock.fetchImpl }
    )(payload("activeclinic", "missing-key"));
    assert.equal(missing.reason, "missing_api_key");
    const sender = await createResendOtpEmailTransport(
      baseEnv({ GETPRO_RESEND_VERIFIED_DOMAINS: "notify.blessboard.com" }),
      { fetchImpl: mock.fetchImpl }
    )(payload("activeclinic", "bad-sender"));
    assert.equal(sender.reason, "domain_not_verified");
    assert.equal(mock.calls.length, 0);
    assert.equal(resolveOtpProvider(baseEnv()).deliveryActivated, false);
  });

  it("classifies authentication, rate limit, timeout, temporary, and permanent provider responses", async () => {
    const cases = [
      [401, { name: "unauthorized" }, "authentication_failed"],
      [429, { name: "rate_limit_exceeded" }, "rate_limited"],
      [503, { name: "internal_server_error" }, "provider_unavailable"],
      [422, { name: "validation_error" }, "request_rejected"],
    ];
    for (const [status, body, reason] of cases) {
      const mock = fetchMock(async () => jsonResponse(status, body));
      const result = await createResendOtpEmailTransport(baseEnv(), { fetchImpl: mock.fetchImpl })(
        payload("activeclinic", `status-${status}`)
      );
      assert.equal(result.ok, false);
      assert.equal(result.reason, reason);
      assert.equal(result.delivered, false);
    }
    const timed = fetchMock(async () => {
      const error = new Error("timed out");
      error.name = "TimeoutError";
      throw error;
    });
    const timeout = await createResendOtpEmailTransport(baseEnv(), { fetchImpl: timed.fetchImpl })(
      payload("blessboard", "timeout")
    );
    assert.equal(timeout.reason, "timeout");
    assert.equal(timeout.retryable, true);
  });

  it("suppresses a duplicate idempotency key and leaves an unset provider inactive", async () => {
    const mock = fetchMock(async () => jsonResponse(200, { id: "email_once" }));
    const transport = createResendOtpEmailTransport(baseEnv(), { fetchImpl: mock.fetchImpl });
    const first = await transport(payload("activeclinic", "same-attempt"));
    const second = await transport(payload("activeclinic", "same-attempt"));
    assert.equal(first.ok, true);
    assert.equal(second.reason, "duplicate_suppressed");
    assert.equal(mock.calls.length, 1);
    const inactive = resolveOtpProvider({ NODE_ENV: "test" });
    assert.equal(inactive.name, "inactive");
    const sms = await resolveOtpProvider(baseEnv(), { fetchImpl: mock.fetchImpl }).dispatch({
      channel: "sms",
      destination: "+260977000000",
      code: CODE,
      productCode: "activeclinic",
      purpose: "login",
      idempotencyKey: "sms-1",
    });
    assert.equal(sms.ok, false);
    assert.equal(mock.calls.length, 1);
  });
});
