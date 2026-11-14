"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createOtpService } = require("../../../src/platform/otp/otpService");
const {
  resolveOtpProvider,
  createFakeOtpProvider,
  UNAPPROVED_PROVIDERS,
} = require("../../../src/platform/otp/otpProviders");
const { normalizeZambiaSms } = require("../../../src/platform/otp/otpPhone");
const { buildOtpMessage, MESSAGE_RE } = require("../../../src/platform/otp/otpDelivery");
const { OTP_POLICY } = require("../../../src/platform/otp/otpPolicy");

const PEPPER = "unit-test-otp-pepper-32b-minimum!!";
const ORG = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";
const SECRET = "super-secret-otp-key";

function testingEnv(extra) {
  return {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "testing",
    DATABASE_IDENTITY_ENV: "testing",
    DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
    PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
    GETPRO_OTP_ALLOW_FIXED_CODE: "1",
    GETPRO_OTP_PEPPER: PEPPER,
    ...extra,
  };
}

function productionEnv(extra) {
  return {
    NODE_ENV: "production",
    DEPLOYMENT_ENV: "production",
    DATABASE_IDENTITY_ENV: "production",
    DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
    PLATFORM_DEPLOYMENT_CODE: "moovex-platform-production",
    GETPRO_OTP_PEPPER: PEPPER,
    ...extra,
  };
}

function clockAt(start) {
  let now = start;
  return {
    clock: () => now,
    advance(ms) {
      now += ms;
    },
  };
}

describe("D14B OTP providers", () => {
  it("normalizes Zambia numbers to E.164 and rejects other countries", () => {
    const env = testingEnv();
    assert.equal(normalizeZambiaSms("0977123456", env), "+260977123456");
    assert.equal(normalizeZambiaSms("+260 97 712 3456", env), "+260977123456");
    assert.equal(normalizeZambiaSms("+14155552671", env), null);
    assert.equal(normalizeZambiaSms("12345", env), null);
    assert.equal(normalizeZambiaSms("", env), null);
  });

  it("sends a code-only message through a mock email transport and retries timeouts", async () => {
    const calls = [];
    const env = testingEnv({
      GETPRO_OTP_PROVIDER: "interface",
      GETPRO_OTP_EMAIL_PROVIDER: "interface",
      GETPRO_OTP_EMAIL_API_KEY: SECRET,
    });
    const provider = resolveOtpProvider(env, {
      emailTransport: async (payload) => {
        calls.push(payload);
        if (calls.length < 3) {
          const error = new Error("timed out");
          error.code = "timeout";
          throw error;
        }
        return { ok: true, reason: "accepted" };
      },
    });
    const otp = createOtpService({ provider });
    const started = await otp.beginChallenge(
      {
        action: "auth.login",
        productCode: "blessboard",
        channel: "email",
        organizationId: ORG,
        accountId: ACCOUNT,
        identifier: "member@example.com",
        accountResolved: true,
        churchName: "Grace Chapel",
        diagnosis: "malaria",
      },
      env
    );
    assert.equal(calls.length, 3);
    assert.equal(calls[0].destination, "member@example.com");
    assert.match(calls[0].text, MESSAGE_RE);
    assert.equal(calls[0].subject, "Verification code");
    assert.equal(JSON.stringify(calls).includes("Grace"), false);
    assert.equal(JSON.stringify(calls).includes("malaria"), false);
    assert.equal(JSON.stringify(calls).includes(SECRET), false);
    assert.equal(Object.prototype.hasOwnProperty.call(calls[0], "apiKey"), false);
    assert.equal(started.server.delivery, "accepted");
    assert.equal(started.server.sessionComplete, false);
    assert.equal(JSON.stringify(otp.store.audits()).includes(SECRET), false);
    assert.equal(JSON.stringify(otp.store.audits()).includes("malaria"), false);
    for (const event of otp.store.audits()) {
      assert.equal(event.code, undefined);
      assert.equal(event.text, undefined);
      assert.equal(event.destination, undefined);
    }
  });

  it("uses the fake provider only for verified testing and applies the provider cap", async () => {
    assert.equal(resolveOtpProvider(productionEnv({ GETPRO_OTP_PROVIDER: "fake" })).name, "inactive");
    assert.equal(createFakeOtpProvider().contactsNetwork, false);
    const time = clockAt(1_700_000_000_000);
    const otp = createOtpService({
      clock: time.clock,
      provider: createFakeOtpProvider(),
      providerHourlyCap: 1,
    });
    const env = testingEnv({ GETPRO_OTP_PROVIDER: "fake" });
    const first = await otp.beginChallenge(
      {
        action: "auth.account_activation",
        productCode: "activeclinic",
        channel: "sms",
        organizationId: ORG,
        accountId: ACCOUNT,
        identifier: "0977123456",
        accountResolved: true,
      },
      env
    );
    assert.equal(first.server.delivery, "accepted");
    assert.equal(first.server.reason, "fake_accepted");
    assert.equal(first.public.code, undefined);
    time.advance(OTP_POLICY.resendCooldownSeconds * 1000);
    const limited = await otp.beginChallenge(
      {
        action: "auth.account_activation",
        productCode: "activeclinic",
        channel: "sms",
        organizationId: ORG,
        accountId: ACCOUNT,
        identifier: "+260977123456",
        accountResolved: true,
      },
      env
    );
    assert.equal(limited.server.reason, "provider_rate_limited");
    assert.equal(limited.server.sessionComplete, false);
    const foreign = await otp.beginChallenge(
      {
        action: "auth.login",
        productCode: "blessboard",
        channel: "sms",
        organizationId: ORG,
        accountId: ACCOUNT,
        identifier: "+14155552671",
        accountResolved: true,
      },
      env
    );
    assert.equal(foreign.server.reason, "identifier");
  });

  it("does not select an unapproved gateway and reports a hard delivery failure", async () => {
    assert.equal(UNAPPROVED_PROVIDERS.has("twilio"), true);
    let called = 0;
    const env = testingEnv({
      GETPRO_OTP_PROVIDER: "interface",
      GETPRO_OTP_SMS_GATEWAY: "twilio",
      TWILIO_AUTH_TOKEN: SECRET,
    });
    const provider = resolveOtpProvider(env, {
      smsTransport: async () => {
        called += 1;
        return { ok: true };
      },
    });
    const otp = createOtpService({ provider });
    const started = await otp.beginChallenge(
      {
        action: "admin.security_setting",
        productCode: "activeclinic",
        channel: "sms",
        organizationId: ORG,
        accountId: ACCOUNT,
        sessionId: "44444444-4444-4444-8444-444444444444",
        identifier: "+260977123456",
      },
      env
    );
    assert.equal(called, 0);
    assert.equal(started.server.reason, "provider_not_selected");
    assert.equal(started.server.sessionComplete, false);
    assert.equal(JSON.stringify(started).includes(SECRET), false);
    const message = buildOtpMessage("1234");
    assert.match(message.text, MESSAGE_RE);
    assert.throws(() => buildOtpMessage("12<script>"), /otp_message_rejected/);
  });
});
