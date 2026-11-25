"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createResendAdapter, PROVIDER_CODE } = require("../../../src/platform/email/resendEmailAdapter");
const { resolveProductSender, SENDERS } = require("../../../src/platform/email/resendSenderCatalog");
const { createResendOtpEmailTransport } = require("../../../src/platform/email/resendOtpTransport");
const {
  verificationTemplate,
  activationTemplate,
  recoveryTemplate,
  deliveryErrorTemplate,
} = require("../../../src/platform/email/transactionalTemplates");
const { resolveOtpProvider } = require("../../../src/platform/otp/otpProviders");
const { resolveOtpActivation } = require("../../../src/platform/otp/otpActivation");

const KEY = "re_test_key_not_a_secret";
const VERIFIED = "notify.blessboard.com,notify.activeclinic.org,notify.pronline.org";

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
      calls.push({ url, init: JSON.parse(JSON.stringify(init)) });
      return handler(calls.length);
    },
  };
}

describe("G140 Resend sender and transport", () => {
  it("routes each product to its own sender and refuses an unverified domain", () => {
    const blocked = resolveProductSender("blessboard", {});
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, "domain_not_verified");
    assert.equal(blocked.sender.email, SENDERS.blessboard.email);
    const env = { GETPRO_RESEND_VERIFIED_DOMAINS: VERIFIED };
    assert.equal(resolveProductSender("blessboard", env).fromHeader, "BlessBoard Security <security@notify.blessboard.com>");
    assert.equal(resolveProductSender("activeclinic", env).sender.domain, "notify.activeclinic.org");
    assert.equal(resolveProductSender("pronline", env).sender.domain, "notify.pronline.org");
    assert.equal(resolveProductSender("neuniversity", env).reason, "not_configured");
    assert.equal(resolveProductSender("activeclinic", { GETPRO_RESEND_VERIFIED_DOMAINS: "notify.blessboard.com" }).ok, false);
  });

  it("rejects a missing key, a bad recipient, an unverified sender, and a provider rejection without leaking the key", async () => {
    const missing = await createResendAdapter({ from: "BlessBoard Security <security@notify.blessboard.com>" }).send({
      recipient: "person@example.com",
      subject: "Verification code",
      text: "Your verification code is 123456. It expires in 5 minutes.",
    });
    assert.equal(missing.reason, "missing_api_key");
    assert.equal(JSON.stringify(missing).includes(KEY), false);

    const network = fetchMock(async () => jsonResponse(200, { id: "email_should_not_send" }));
    const invalid = await createResendAdapter({
      apiKey: KEY,
      from: "BlessBoard Security <security@notify.blessboard.com>",
      fetchImpl: network.fetchImpl,
    }).send({ recipient: "not-an-email", subject: "x", text: "y" });
    assert.equal(invalid.providerCode, PROVIDER_CODE.INVALID_RECIPIENT);
    assert.equal(network.calls.length, 0);

    const wrong = await createResendAdapter({
      apiKey: KEY,
      from: "Other <security@notify.example>",
      fetchImpl: network.fetchImpl,
      enforceApprovedSender: true,
      verifiedDomains: ["notify.blessboard.com"],
    }).send({ recipient: "person@example.com", subject: "x", text: "y" });
    assert.equal(wrong.providerCode, PROVIDER_CODE.DOMAIN_NOT_VERIFIED);
    assert.equal(network.calls.length, 0);

    const logs = [];
    const rejected = await createResendAdapter({
      apiKey: KEY,
      from: "BlessBoard Security <security@notify.blessboard.com>",
      fetchImpl: fetchMock(async () => jsonResponse(401, { name: "invalid_api_key", message: KEY })).fetchImpl,
      log: (entry) => logs.push(entry),
    }).send({
      recipient: "person@example.com",
      subject: "Verification code",
      text: "Your verification code is 654321. It expires in 5 minutes.",
    });
    assert.equal(rejected.providerCode, PROVIDER_CODE.AUTHENTICATION_FAILED);
    assert.equal(JSON.stringify(logs).includes(KEY), false);
    assert.equal(JSON.stringify(logs).includes("654321"), false);
  });

  it("retries a timeout and a rate limit, then stops", async () => {
    const timed = fetchMock(async () => {
      const error = new Error("timed out");
      error.name = "TimeoutError";
      throw error;
    });
    const timeout = await createResendAdapter({
      apiKey: KEY,
      from: "BlessBoard Security <security@notify.blessboard.com>",
      fetchImpl: timed.fetchImpl,
      maxAttempts: 3,
    }).send({ recipient: "person@example.com", subject: "x", text: "y" });
    assert.equal(timed.calls.length, 3);
    assert.equal(timeout.providerCode, PROVIDER_CODE.RETRY_EXHAUSTED);

    const limited = fetchMock(async () => jsonResponse(429, { name: "rate_limit_exceeded" }));
    const rate = await createResendAdapter({
      apiKey: KEY,
      from: "BlessBoard Security <security@notify.blessboard.com>",
      fetchImpl: limited.fetchImpl,
      maxAttempts: 3,
    }).send({ recipient: "person@example.com", subject: "x", text: "y" });
    assert.equal(limited.calls.length, 3);
    assert.equal(rate.providerCode, PROVIDER_CODE.RETRY_EXHAUSTED);
  });

  it("sends once for a verified product sender and suppresses the same idempotency key", async () => {
    const mock = fetchMock(async () => jsonResponse(200, { id: "email_otp_1" }));
    const transport = createResendOtpEmailTransport(
      { RESEND_API_KEY: KEY, GETPRO_RESEND_VERIFIED_DOMAINS: "notify.activeclinic.org" },
      { fetchImpl: mock.fetchImpl }
    );
    const payload = {
      productCode: "activeclinic",
      destination: "patient@example.com",
      text: "Your verification code is 135790. It expires in 5 minutes.",
      idempotencyKey: "attempt-1",
      fetchImpl: mock.fetchImpl,
    };
    const first = await transport(payload);
    const second = await transport(payload);
    assert.equal(first.ok, true);
    assert.equal(second.reason, "duplicate_suppressed");
    assert.equal(mock.calls.length, 1);
    const body = JSON.parse(mock.calls[0].init.body);
    assert.equal(body.from, "ActiveClinic Security <security@notify.activeclinic.org>");
    assert.equal(body.to[0], "patient@example.com");
    assert.equal(mock.calls[0].init.headers.Authorization.includes(KEY), true);
    assert.equal(JSON.stringify({ from: body.from, subject: body.subject }).includes(KEY), false);
    const wrong = await transport({ ...payload, productCode: "blessboard", idempotencyKey: "attempt-2" });
    assert.equal(wrong.reason, "domain_not_verified");
    assert.equal(mock.calls.length, 1);
  });

  it("keeps production OTP blocked and does not put a code in the templates", () => {
    const production = {
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "production",
      GETPRO_OTP_PROVIDER: "resend",
      GETPRO_OTP_EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: KEY,
      GETPRO_RESEND_VERIFIED_DOMAINS: VERIFIED,
    };
    assert.equal(resolveOtpActivation(production).status, "BLOCKED");
    assert.equal(resolveOtpProvider(production).deliveryActivated, false);
    assert.equal(resolveOtpProvider({ ...production, GETPRO_OTP_PROVIDER: "fake" }).name, "inactive");
    const templates = [
      verificationTemplate("ActiveClinic", "Your verification code is 135790. It expires in 5 minutes."),
      activationTemplate("BlessBoard", "https://notify.blessboard.com/activate"),
      recoveryTemplate("PROnline", "https://notify.pronline.org/reset"),
      deliveryErrorTemplate("ActiveClinic"),
    ];
    for (const template of templates) {
      assert.doesNotMatch(JSON.stringify(template), /diagnosis|encounter|patient record/i);
    }
    assert.match(deliveryErrorTemplate("ActiveClinic").text, /could not send/i);
  });

  it("keeps pronline.org distinct from notify.pronline.org until that exact domain is verified", () => {
    const reported = { GETPRO_RESEND_VERIFIED_DOMAINS: "pronline.org" };
    const production = resolveProductSender("pronline", reported);
    assert.equal(production.ok, false);
    assert.equal(production.reason, "domain_not_verified");
    assert.equal(production.sender.domain, "notify.pronline.org");
    const qaWithoutProof = resolveProductSender("blessboard", {
      GETPRO_RESEND_SENDER_PROFILE: "hosted-qa",
    });
    assert.equal(qaWithoutProof.ok, false);
    assert.equal(qaWithoutProof.reason, "domain_not_verified");
    const qaOnNotify = resolveProductSender("activeclinic", {
      GETPRO_RESEND_SENDER_PROFILE: "hosted-qa",
      GETPRO_RESEND_VERIFIED_DOMAINS: "notify.pronline.org",
    });
    assert.equal(qaOnNotify.ok, false);
    assert.equal(qaOnNotify.sender.domain, "pronline.org");
    const qaReady = resolveProductSender("blessboard", {
      GETPRO_RESEND_SENDER_PROFILE: "hosted-qa",
      GETPRO_RESEND_VERIFIED_DOMAINS: "pronline.org",
    });
    assert.equal(qaReady.ok, true);
    assert.equal(qaReady.fromHeader, "BlessBoard QA <qa-blessboard@pronline.org>");
    assert.equal(resolveProductSender("pronline", {
      GETPRO_RESEND_SENDER_PROFILE: "hosted-qa",
      GETPRO_RESEND_VERIFIED_DOMAINS: "pronline.org",
    }).reason, "not_configured");
    assert.equal(SENDERS.pronline.email, "security@notify.pronline.org");
    assert.equal(resolveOtpActivation({
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "production",
      GETPRO_OTP_PROVIDER: "resend",
      GETPRO_RESEND_SENDER_PROFILE: "hosted-qa",
      GETPRO_RESEND_VERIFIED_DOMAINS: "pronline.org",
      RESEND_API_KEY: KEY,
    }).status, "BLOCKED");
  });
});
