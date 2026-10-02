"use strict";

/**
 * Prompt 11F — provider-neutral OTP foundation with test provider.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const {
  startVerification,
  checkVerification,
  cancelVerification,
  getStatus,
  STATUS,
  peekTestCode,
} = require("../src/blessboard/services/otp/blessBoardOtpService");
const { clearTestOtpStore } = require("../src/blessboard/services/otp/otpProviders/testProvider");
const { resolveOtpProvider } = require("../src/blessboard/services/otp/otpProviders");

const IDENTITY_KEY = "blessboard-platform-v5";

describe("blessboard OTP foundation (11F)", () => {
  let pool;
  const env = {
    DEPLOYMENT_ENV: "testing",
    BLESSBOARD_OTP_PROVIDER: "test",
    BLESSBOARD_OTP_PEPPER: "test-pepper-11f",
    BLESSBOARD_OTP_EXPOSE_TEST_CODE: "1",
    BLESSBOARD_OTP_RESEND_DELAY_SECONDS: "1",
    BLESSBOARD_OTP_MAX_ATTEMPTS: "3",
    BLESSBOARD_OTP_TTL_SECONDS: "120",
    BLESSBOARD_OTP_DAILY_SEND_CAP: "20",
    BLESSBOARD_OTP_PHONE_HOURLY_CAP: "20",
  };

  before(async () => {
    const databaseUrl = await resetFoundationDatabase();
    pool = createFoundationPool(databaseUrl);
    await migrate({ connectionString: databaseUrl });
    await ensureDatabaseIdentity(pool, {
      connectionString: databaseUrl,
      identityKey: IDENTITY_KEY,
      environmentCode: "testing",
    });
    clearTestOtpStore();
  });

  after(async () => {
    clearTestOtpStore();
    if (pool) await pool.end();
  });

  it("refuses test provider in production configuration", () => {
    const provider = resolveOtpProvider({
      DEPLOYMENT_ENV: "production",
      BLESSBOARD_OTP_PROVIDER: "test",
    });
    assert.equal(provider.name, "test");
    return provider.send({}).then((r) => {
      assert.equal(r.ok, false);
      assert.equal(r.reason, "test_provider_forbidden_in_production");
    });
  });

  it("starts, verifies, and does not store plaintext OTP", async () => {
    const started = await startVerification(
      pool,
      {
        phone: "0971234567",
        purpose: "phone_verification",
        requestIp: "127.0.0.1",
      },
      env
    );
    assert.equal(started.ok, true, started.reason);
    assert.ok(started.challenge.id);
    assert.ok(started.testCode);
    assert.match(started.testCode, /^\d{6}$/);

    const stored = await pool.query(
      `SELECT code_hash, normalized_phone FROM blessboard.phone_otp_verifications WHERE id = $1`,
      [started.challenge.id]
    );
    assert.equal(stored.rows[0].normalized_phone, "+260971234567");
    assert.doesNotMatch(stored.rows[0].code_hash, new RegExp(started.testCode));
    assert.notEqual(stored.rows[0].code_hash, started.testCode);

    const badPurpose = await checkVerification(
      pool,
      {
        verificationId: started.challenge.id,
        purpose: "password_recovery",
        code: started.testCode,
      },
      env
    );
    assert.equal(badPurpose.ok, false);
    assert.equal(badPurpose.status, STATUS.PURPOSE_MISMATCH);

    const wrong = await checkVerification(
      pool,
      {
        verificationId: started.challenge.id,
        purpose: "phone_verification",
        code: "000000",
      },
      env
    );
    assert.equal(wrong.ok, false);
    assert.equal(wrong.status, STATUS.INVALID_CODE);

    const ok = await checkVerification(
      pool,
      {
        verificationId: started.challenge.id,
        purpose: "phone_verification",
        code: started.testCode,
      },
      env
    );
    assert.equal(ok.ok, true, ok.reason);
    assert.equal(ok.normalizedPhone, "+260971234567");

    const reuse = await checkVerification(
      pool,
      {
        verificationId: started.challenge.id,
        purpose: "phone_verification",
        code: started.testCode,
      },
      env
    );
    assert.equal(reuse.ok, false);
  });

  it("enforces attempt limit, cancel, and cooldown", async () => {
    const started = await startVerification(
      pool,
      { phone: "0971234002", purpose: "invitation_activation", requestIp: "10.0.0.2" },
      env
    );
    assert.equal(started.ok, true, started.reason);

    for (let i = 0; i < 3; i += 1) {
      const attempt = await checkVerification(
        pool,
        {
          verificationId: started.challenge.id,
          purpose: "invitation_activation",
          code: "111111",
        },
        env
      );
      if (i < 2) assert.equal(attempt.status, STATUS.INVALID_CODE);
      else assert.equal(attempt.status, STATUS.EXHAUSTED);
    }

    const cancelledStart = await startVerification(
      pool,
      { phone: "0971234003", purpose: "password_recovery", requestIp: "10.0.0.3" },
      env
    );
    assert.equal(cancelledStart.ok, true);
    const cancelled = await cancelVerification(pool, {
      verificationId: cancelledStart.challenge.id,
    });
    assert.equal(cancelled.ok, true);
    const status = await getStatus(pool, { verificationId: cancelledStart.challenge.id });
    assert.equal(status.challenge.status, "cancelled");

    const first = await startVerification(
      pool,
      { phone: "0971234004", purpose: "phone_change", requestIp: "10.0.0.4" },
      { ...env, BLESSBOARD_OTP_RESEND_DELAY_SECONDS: "30" }
    );
    assert.equal(first.ok, true);
    const cooldown = await startVerification(
      pool,
      { phone: "0971234004", purpose: "phone_change", requestIp: "10.0.0.4" },
      { ...env, BLESSBOARD_OTP_RESEND_DELAY_SECONDS: "30" }
    );
    assert.equal(cooldown.ok, false);
    assert.equal(cooldown.status, STATUS.RATE_LIMITED);
    assert.equal(cooldown.reason, "resend_cooldown");
  });

  it("peekTestCode is isolated to test provider memory", () => {
    assert.equal(peekTestCode("missing"), null);
  });
});
