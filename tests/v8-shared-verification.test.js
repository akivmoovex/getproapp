"use strict";

/**
 * V8 shared email/phone verification gates.
 * Disposable foundation DB only.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const {
  ENFORCEMENT,
  VERIFICATION_STATUS,
  resolveVerificationEnforcement,
  classifyVerificationStatus,
  evaluateVerificationGate,
} = require("../src/platform/verification/sharedVerificationPolicy");
const {
  startSharedVerification,
  completeSharedVerification,
  getSharedVerificationStatus,
  peekSharedVerificationCodeForTests,
  RESULT,
  CHANNEL,
  SUBJECT_KIND,
} = require("../src/platform/verification/sharedVerificationService");
const {
  clearVerificationDeliveries,
} = require("../src/platform/verification/verificationTestingOutbox");
const {
  createBlessBoardUser,
} = require("../src/blessboard/services/createBlessBoardUser");
const identityRepo = require("../src/platform/repositories/platformIdentityRepository");
const {
  startBlessBoardPhoneVerification,
  completeBlessBoardVerification,
} = require("../src/blessboard/services/blessBoardSharedVerification");
const {
  startActiveClinicEmailVerification,
  completeActiveClinicVerification,
} = require("../src/activeclinic/services/activeClinicSharedVerification");

const TEST_ENV = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  DATABASE_IDENTITY_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: "moovex-platform-v8-testing",
  GETPRO_VERIFICATION_ENFORCEMENT: "soft",
  GETPRO_VERIFICATION_RESEND_DELAY_SECONDS: "1",
  SESSION_SECRET: "v8-verification-test-secret-do-not-use-0123456789",
});

let pool;
let skipReason = null;

function requireDb() {
  if (skipReason) {
    // eslint-disable-next-line no-console
    console.log("skip:", skipReason);
    return false;
  }
  return true;
}

function uniq(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(2).toString("hex")}`;
}

describe("V8 verification policy (grandfather / enforcement)", () => {
  it("defaults V7 to off and never locks legacy users out of login", () => {
    assert.equal(
      resolveVerificationEnforcement({
        PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
      }),
      ENFORCEMENT.OFF
    );
    assert.equal(
      resolveVerificationEnforcement({
        PLATFORM_DEPLOYMENT_CODE: "moovex-platform-v8-testing",
      }),
      ENFORCEMENT.SOFT
    );
    assert.equal(
      classifyVerificationStatus({ identifierPresent: true, verifiedAt: null }),
      VERIFICATION_STATUS.LEGACY_UNVERIFIED
    );
    const gate = evaluateVerificationGate({
      status: VERIFICATION_STATUS.LEGACY_UNVERIFIED,
      enforcement: ENFORCEMENT.HARD,
      action: "login",
    });
    assert.equal(gate.loginAllowed, true);
    assert.equal(gate.blocked, false);
  });
});

describe("V8 shared verification service", () => {
  before(async () => {
    clearVerificationDeliveries();
    try {
      const url = await resetFoundationDatabase();
      pool = createFoundationPool(url);
      await migrate({ pool });
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 240) : "no db";
      pool = null;
    }
  });

  after(async () => {
    clearVerificationDeliveries();
    if (pool) {
      try {
        await pool.end();
      } catch {
        /* ignore */
      }
    }
  });

  it("BB phone: valid OTP, invalid OTP, expiry, resend cooldown, attempt limits, replay", async () => {
    if (!requireDb()) return;
    const phone = `+26097${String(Date.now()).slice(-7)}`;
    const created = await createBlessBoardUser(pool, {
      email: `${uniq("bbv")}@example.test`,
      displayName: "BB Verify",
      password: "ValidPass10!",
      phoneNormalized: phone,
      phoneDisplay: phone,
    });
    assert.equal(created.ok, true);
    const userId = created.user.id;

    await pool.query(
      `UPDATE blessboard.users SET phone_normalized = $2 WHERE id = $1`,
      [userId, phone]
    );

    const started = await startBlessBoardPhoneVerification(
      pool,
      {
        subjectId: userId,
        identifier: phone,
        country: "ZM",
        requestIp: "203.0.113.40",
        source: "v8_test",
      },
      TEST_ENV
    );
    assert.equal(started.ok, true);
    assert.equal(started.delivered, true);
    assert.ok(started.challenge && started.challenge.id);
    assert.equal(started.challenge.identifierMasked.includes("***"), true);

    const peek = peekSharedVerificationCodeForTests(started.challenge.id, TEST_ENV);
    assert.equal(peek.ok, true);
    const code = peek.verificationCode;

    const bad = await completeBlessBoardVerification(
      pool,
      {
        challengeId: started.challenge.id,
        subjectId: userId,
        code: "000000",
      },
      TEST_ENV
    );
    assert.equal(bad.ok, false);
    assert.equal(bad.code, RESULT.INVALID_CODE);

    // Resend cooldown
    const cooldown = await startBlessBoardPhoneVerification(
      pool,
      {
        subjectId: userId,
        identifier: phone,
        country: "ZM",
        requestIp: "203.0.113.40",
      },
      { ...TEST_ENV, GETPRO_VERIFICATION_RESEND_DELAY_SECONDS: "120" }
    );
    assert.equal(cooldown.ok, false);
    assert.equal(cooldown.code, RESULT.RATE_LIMITED);

    // Wait out short cooldown env and start concurrent challenge (cancels prior)
    await new Promise((r) => setTimeout(r, 1100));
    const restarted = await startBlessBoardPhoneVerification(
      pool,
      {
        subjectId: userId,
        identifier: phone,
        country: "ZM",
        requestIp: "203.0.113.41",
      },
      TEST_ENV
    );
    assert.equal(restarted.ok, true);
    const code2 = peekSharedVerificationCodeForTests(
      restarted.challenge.id,
      TEST_ENV
    ).verificationCode;

    // Old code must not work against new challenge (replay / concurrent)
    const oldReplay = await completeBlessBoardVerification(
      pool,
      {
        challengeId: started.challenge.id,
        subjectId: userId,
        code,
      },
      TEST_ENV
    );
    assert.equal(oldReplay.ok, false);

    const ok = await completeBlessBoardVerification(
      pool,
      {
        challengeId: restarted.challenge.id,
        subjectId: userId,
        code: code2,
      },
      TEST_ENV
    );
    assert.equal(ok.ok, true);

    const replay = await completeBlessBoardVerification(
      pool,
      {
        challengeId: restarted.challenge.id,
        subjectId: userId,
        code: code2,
      },
      TEST_ENV
    );
    assert.equal(replay.ok, false);

    const status = await getSharedVerificationStatus(
      pool,
      {
        subjectKind: SUBJECT_KIND.BLESSBOARD_USER,
        subjectId: userId,
        channel: CHANNEL.PHONE,
        action: "login",
      },
      TEST_ENV
    );
    assert.equal(status.status, VERIFICATION_STATUS.VERIFIED);
    assert.equal(status.gate.loginAllowed, true);

    const row = await pool.query(
      `SELECT phone_verified_at FROM blessboard.users WHERE id = $1`,
      [userId]
    );
    assert.ok(row.rows[0].phone_verified_at);
  });

  it("rejects account mismatch and cross-subject completion", async () => {
    if (!requireDb()) return;
    const phoneA = `+26096${String(Date.now()).slice(-7)}`;
    const phoneB = `+26095${String(Date.now()).slice(-7)}`;
    const a = await createBlessBoardUser(pool, {
      email: `${uniq("mma")}@example.test`,
      displayName: "Mismatch A",
      password: "ValidPass10!",
      phoneNormalized: phoneA,
    });
    const b = await createBlessBoardUser(pool, {
      email: `${uniq("mmb")}@example.test`,
      displayName: "Mismatch B",
      password: "ValidPass10!",
      phoneNormalized: phoneB,
    });
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    await pool.query(`UPDATE blessboard.users SET phone_normalized = $2 WHERE id = $1`, [
      a.user.id,
      phoneA,
    ]);
    await pool.query(`UPDATE blessboard.users SET phone_normalized = $2 WHERE id = $1`, [
      b.user.id,
      phoneB,
    ]);

    const wrongId = await startSharedVerification(
      pool,
      {
        subjectKind: SUBJECT_KIND.BLESSBOARD_USER,
        subjectId: a.user.id,
        productKey: "blessboard",
        channel: CHANNEL.PHONE,
        identifier: phoneB,
        country: "ZM",
      },
      TEST_ENV
    );
    assert.equal(wrongId.ok, false);
    assert.equal(wrongId.code, RESULT.MISMATCH);

    const started = await startSharedVerification(
      pool,
      {
        subjectKind: SUBJECT_KIND.BLESSBOARD_USER,
        subjectId: a.user.id,
        productKey: "blessboard",
        channel: CHANNEL.PHONE,
        identifier: phoneA,
        country: "ZM",
        requestIp: "203.0.113.50",
      },
      TEST_ENV
    );
    assert.equal(started.ok, true);
    const code = peekSharedVerificationCodeForTests(
      started.challenge.id,
      TEST_ENV
    ).verificationCode;

    const cross = await completeSharedVerification(
      pool,
      {
        challengeId: started.challenge.id,
        subjectKind: SUBJECT_KIND.BLESSBOARD_USER,
        subjectId: b.user.id,
        code,
      },
      TEST_ENV
    );
    assert.equal(cross.ok, false);
    assert.equal(cross.code, RESULT.MISMATCH);
  });

  it("AC email verification + attempt exhaustion + production peek refused", async () => {
    if (!requireDb()) return;
    const email = `${uniq("acv")}@example.test`;
    const phone = `+26094${String(Date.now()).slice(-7)}`;
    const identity = await identityRepo.insertIdentity(pool, {
      status: "active",
      primaryPhone: phone,
      phoneNormalized: phone,
      primaryEmail: email,
      emailNormalized: email,
      passwordHash: null,
      mustChangePassword: false,
      lockedAt: null,
      suspendedAt: null,
      phoneVerifiedAt: null,
      emailVerifiedAt: null,
    });
    assert.ok(identity && identity.id);

    const started = await startActiveClinicEmailVerification(
      pool,
      {
        subjectId: identity.id,
        identifier: email,
        requestIp: "203.0.113.60",
      },
      TEST_ENV
    );
    assert.equal(started.ok, true);
    const challengeId = started.challenge.id;

    const prodPeek = peekSharedVerificationCodeForTests(challengeId, {
      DEPLOYMENT_ENV: "production",
      DATABASE_IDENTITY_ENV: "production",
    });
    assert.equal(prodPeek.ok, false);
    assert.equal(prodPeek.code, RESULT.FORBIDDEN);

    for (let i = 0; i < 5; i += 1) {
      const attempt = await completeActiveClinicVerification(
        pool,
        {
          challengeId,
          subjectId: identity.id,
          code: "111111",
        },
        { ...TEST_ENV, GETPRO_VERIFICATION_MAX_ATTEMPTS: "5" }
      );
      if (i < 4) {
        assert.equal(attempt.code, RESULT.INVALID_CODE);
      } else {
        assert.equal(attempt.code, RESULT.EXHAUSTED);
      }
    }

    // Existing user without verification remains login-allowed
    const legacy = await getSharedVerificationStatus(
      pool,
      {
        subjectKind: SUBJECT_KIND.PLATFORM_IDENTITY,
        subjectId: identity.id,
        channel: CHANNEL.PHONE,
        action: "login",
      },
      { ...TEST_ENV, GETPRO_VERIFICATION_ENFORCEMENT: "hard" }
    );
    assert.equal(legacy.status, VERIFICATION_STATUS.LEGACY_UNVERIFIED);
    assert.equal(legacy.gate.loginAllowed, true);
    assert.equal(legacy.gate.blocked, false);
  });

  it("expired challenge is rejected", async () => {
    if (!requireDb()) return;
    const email = `${uniq("exp")}@example.test`;
    const phone = `+26093${String(Date.now()).slice(-7)}`;
    const created = await createBlessBoardUser(pool, {
      email,
      displayName: "Expire User",
      password: "ValidPass10!",
      phoneNormalized: phone,
    });
    await pool.query(`UPDATE blessboard.users SET phone_normalized = $2 WHERE id = $1`, [
      created.user.id,
      phone,
    ]);

    const started = await startSharedVerification(
      pool,
      {
        subjectKind: SUBJECT_KIND.BLESSBOARD_USER,
        subjectId: created.user.id,
        productKey: "blessboard",
        channel: CHANNEL.PHONE,
        identifier: phone,
        country: "ZM",
        requestIp: "203.0.113.70",
      },
      { ...TEST_ENV, GETPRO_VERIFICATION_TTL_SECONDS: "3600" }
    );
    assert.equal(started.ok, true);
    await pool.query(
      `UPDATE platform.identity_verification_challenges
          SET created_at = now() - interval '2 hours',
              expires_at = now() - interval '1 hour'
        WHERE id = $1`,
      [started.challenge.id]
    );
    const code = peekSharedVerificationCodeForTests(
      started.challenge.id,
      TEST_ENV
    ).verificationCode;
    const expired = await completeSharedVerification(
      pool,
      {
        challengeId: started.challenge.id,
        subjectKind: SUBJECT_KIND.BLESSBOARD_USER,
        subjectId: created.user.id,
        code,
      },
      TEST_ENV
    );
    assert.equal(expired.ok, false);
    assert.equal(expired.code, RESULT.EXPIRED);
  });
});
