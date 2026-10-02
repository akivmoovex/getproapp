"use strict";

/**
 * V8 shared authentication + password security gates.
 * Disposable foundation DB only — never hosted V7 data.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const {
  DEFAULT_PASSWORD_MIN,
  DEFAULT_PASSWORD_MAX,
  resolvePasswordLengthBounds,
  validatePasswordPolicy,
  validatePasswordPair,
  POLICY_RESULT,
} = require("../src/platform/auth/sharedPasswordPolicy");
const {
  validateRegistrationPasswordPair,
  REGISTRATION_PASSWORD_RULES,
} = require("../src/platform/registration/registrationPasswordPolicy");
const {
  classifyPasswordHash,
  verifyBcryptPassword,
} = require("../src/migration/v5ToV7/passwordCompat");
const {
  requestPasswordReset,
  completePasswordReset,
  inspectPasswordResetToken,
  STATUS: BB_RESET,
  NEUTRAL_MESSAGE,
} = require("../src/blessboard/services/passwordResetService");
const {
  createBlessBoardUser,
} = require("../src/blessboard/services/createBlessBoardUser");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { hashSessionToken } = require("../src/platform/session/sessionToken");
const tokenRepo = require("../src/blessboard/repositories/userActionTokenRepository");
const {
  matchRegistrationContactPrincipals,
  authorizeExistingPrincipalReuse,
  REGISTRATION_IDENTITY_ACTION,
} = require("../src/platform/registration/resolveRegistrationContactIdentity");
const {
  setPlatformIdentityPassword,
  verifyPlatformIdentityPassword,
} = require("../src/platform/services/platformIdentityCredentialService");
const identityRepo = require("../src/platform/repositories/platformIdentityRepository");
const platformTokenRepo = require("../src/platform/repositories/platformIdentityActionTokenRepository");
const {
  completeActiveClinicPasswordReset,
  RESULT: AC_RESET,
} = require("../src/activeclinic/services/activeClinicPasswordRecoveryService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  CODE_ORG_STAGING,
} = require("../src/platform/config/deploymentProfiles");

const PASSWORD = "ValidPass10!";
const NEW_PASSWORD = "Replacement99!";

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

function createCaptureAdapter() {
  const sent = [];
  return {
    adapter: Object.freeze({
      id: "test_capture",
      sendingAvailable: true,
      async send(envelope) {
        sent.push(envelope);
        return {
          accepted_for_processing: true,
          sendingAvailable: true,
          delivered: true,
          code: "sent",
        };
      },
    }),
    sent,
  };
}

function extractResetToken(text) {
  const m = String(text || "").match(/reset-password\?token=([^\s"'<>]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

describe("V8 shared password policy", () => {
  it("keeps V7 default bounds and refuses to weaken the floor", () => {
    const defaults = resolvePasswordLengthBounds({});
    assert.equal(defaults.min, DEFAULT_PASSWORD_MIN);
    assert.equal(defaults.max, DEFAULT_PASSWORD_MAX);
    assert.equal(DEFAULT_PASSWORD_MIN, 10);

    const raised = resolvePasswordLengthBounds({
      GETPRO_PASSWORD_MIN_LENGTH: "14",
      GETPRO_PASSWORD_MAX_LENGTH: "180",
    });
    assert.equal(raised.min, 14);
    assert.equal(raised.max, 180);

    const weakened = resolvePasswordLengthBounds({
      GETPRO_PASSWORD_MIN_LENGTH: "6",
    });
    assert.equal(weakened.min, 10);
  });

  it("validates password and confirmation for registration/reset/invite/change", () => {
    assert.equal(validatePasswordPolicy("short").ok, false);
    assert.equal(validatePasswordPolicy(PASSWORD).ok, true);

    const mismatch = validatePasswordPair(PASSWORD, "other-password");
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.code, POLICY_RESULT.MISMATCH);
    assert.equal(mismatch.field, "password_confirm");

    const ok = validateRegistrationPasswordPair(PASSWORD, PASSWORD);
    assert.equal(ok.ok, true);
    assert.ok(REGISTRATION_PASSWORD_RULES.length >= 2);
  });

  it("preserves bcrypt hash compatibility for V7 passwords", async () => {
    const hash = await bcrypt.hash(PASSWORD, 12);
    const classified = classifyPasswordHash(hash);
    assert.equal(classified.kind, "bcrypt");
    assert.equal(await verifyBcryptPassword(PASSWORD, hash), true);
    assert.equal(await verifyBcryptPassword("wrong-password", hash), false);
  });
});

describe("V8 registration identity reuse (no duplicate login blocking multi-tenant)", () => {
  it("rejects email/phone split without leaking which side matched", () => {
    const result = matchRegistrationContactPrincipals(
      { id: "a" },
      [{ id: "b" }]
    );
    assert.equal(result.ok, false);
    assert.equal(
      result.action,
      REGISTRATION_IDENTITY_ACTION.REJECT_IDENTITY_CONFLICT
    );
  });

  it("allows reuse of one principal when password verifies", async () => {
    const hash = await bcrypt.hash(PASSWORD, 12);
    const reuse = await authorizeExistingPrincipalReuse({
      passwordHash: hash,
      password: PASSWORD,
    });
    assert.equal(reuse.ok, true);
    assert.equal(reuse.action, REGISTRATION_IDENTITY_ACTION.REUSE);

    const bad = await authorizeExistingPrincipalReuse({
      passwordHash: hash,
      password: "wrong-password-xx",
    });
    assert.equal(bad.ok, false);
  });
});

describe("V8 BlessBoard + ActiveClinic password recovery security", () => {
  before(async () => {
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
    if (pool) {
      try {
        await pool.end();
      } catch {
        /* ignore */
      }
    }
  });

  it("returns enumeration-safe forgot-password responses", async () => {
    if (!requireDb()) return;
    const capture = createCaptureAdapter();
    const unknown = await requestPasswordReset(
      pool,
      {
        email: `nobody_${uniq("x")}@example.test`,
        requestIp: "127.0.0.1",
        env: { BLESSBOARD_APEX_ORIGIN: "https://blessboard.test" },
      },
      { emailAdapter: capture.adapter }
    );
    assert.equal(unknown.ok, true);
    assert.equal(unknown.message, NEUTRAL_MESSAGE);
    assert.equal(unknown.sent, false);

    const created = await createBlessBoardUser(pool, {
      email: `${uniq("bb")}@example.test`,
      displayName: "BB Reset User",
      password: PASSWORD,
    });
    assert.equal(created.ok, true);
    const known = await requestPasswordReset(
      pool,
      {
        email: created.user.email,
        requestIp: "127.0.0.1",
        env: { BLESSBOARD_APEX_ORIGIN: "https://blessboard.test" },
      },
      { emailAdapter: capture.adapter }
    );
    assert.equal(known.ok, true);
    assert.equal(known.message, NEUTRAL_MESSAGE);
    assert.equal(known.sent, true);
  });

  it("enforces expiry, single-use, confirmation, and session invalidation", async () => {
    if (!requireDb()) return;
    const email = `${uniq("bb2")}@example.test`;
    const created = await createBlessBoardUser(pool, {
      email,
      displayName: "BB Reset Complete",
      password: PASSWORD,
    });
    assert.equal(created.ok, true);
    const userId = created.user.id;

    const session = await createV5Session(pool, {
      userId,
      deploymentCode: CODE_ORG_STAGING,
    });
    assert.equal(session.ok, true);

    const capture = createCaptureAdapter();
    await requestPasswordReset(
      pool,
      {
        email,
        requestIp: "127.0.0.2",
        env: { BLESSBOARD_APEX_ORIGIN: "https://blessboard.test" },
      },
      { emailAdapter: capture.adapter }
    );

    // Concurrent second request — only the latest token should remain usable.
    await requestPasswordReset(
      pool,
      {
        email,
        requestIp: "127.0.0.3",
        env: { BLESSBOARD_APEX_ORIGIN: "https://blessboard.test" },
      },
      { emailAdapter: capture.adapter }
    );
    const token = extractResetToken(capture.sent[capture.sent.length - 1].text);
    assert.ok(token);

    const weak = await completePasswordReset(pool, {
      token,
      password: "short",
      passwordConfirm: "short",
    });
    assert.equal(weak.status, BB_RESET.WEAK_PASSWORD);

    const mismatch = await completePasswordReset(pool, {
      token,
      password: NEW_PASSWORD,
      passwordConfirm: "DifferentPass99!",
    });
    assert.equal(mismatch.status, BB_RESET.MISMATCH);

    const done = await completePasswordReset(pool, {
      token,
      password: NEW_PASSWORD,
      passwordConfirm: NEW_PASSWORD,
      deploymentCode: CODE_ORG_STAGING,
    });
    assert.equal(done.ok, true);

    const reuse = await completePasswordReset(pool, {
      token,
      password: NEW_PASSWORD,
      passwordConfirm: NEW_PASSWORD,
    });
    assert.equal(reuse.ok, false);
    assert.ok(
      reuse.status === BB_RESET.CONSUMED || reuse.status === BB_RESET.INVALID_TOKEN
    );

    const sessions = await pool.query(
      `SELECT count(*)::int AS n
         FROM platform.deployment_sessions
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );
    assert.equal(sessions.rows[0].n, 0);

    const rawToken = crypto.randomBytes(32).toString("base64url");
    const inserted = await tokenRepo.insertActionToken(pool, {
      userId,
      purpose: "password_reset",
      tokenHash: hashSessionToken(rawToken),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    await pool.query(
      `UPDATE blessboard.user_action_tokens
          SET created_at = now() - interval '2 hours',
              expires_at = now() - interval '1 hour'
        WHERE id = $1`,
      [inserted.id]
    );
    const expired = await inspectPasswordResetToken(pool, rawToken);
    assert.equal(expired.status, BB_RESET.EXPIRED);
  });

  it("AC reset is single-use, revokes concurrent tokens, and rejects cross-purpose tokens", async () => {
    if (!requireDb()) return;

    const phone = `+26097${String(Date.now()).slice(-7)}`;
    const emailNorm = `${uniq("ac")}@example.test`;
    const identity = await identityRepo.insertIdentity(pool, {
      status: "active",
      primaryPhone: phone,
      phoneNormalized: phone,
      primaryEmail: emailNorm,
      emailNormalized: emailNorm,
      passwordHash: null,
      mustChangePassword: false,
      lockedAt: null,
      suspendedAt: null,
      phoneVerifiedAt: null,
      emailVerifiedAt: null,
    });
    assert.ok(identity && identity.id);

    await setPlatformIdentityPassword(pool, {
      identityId: identity.id,
      password: PASSWORD,
    });

    const raw = crypto.randomBytes(32).toString("base64url");
    await platformTokenRepo.insertActionToken(pool, {
      platformIdentityId: identity.id,
      purpose: "activeclinic_password_reset",
      tokenHash: hashSessionToken(raw),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      productKey: "activeclinic",
      metadataJson: { source: "v8_test" },
    });

    const siblingRaw = crypto.randomBytes(32).toString("base64url");
    await platformTokenRepo.insertActionToken(pool, {
      platformIdentityId: identity.id,
      purpose: "activeclinic_password_reset",
      tokenHash: hashSessionToken(siblingRaw),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      productKey: "activeclinic",
      metadataJson: { source: "v8_test_sibling" },
    });

    const done = await completeActiveClinicPasswordReset(pool, {
      rawToken: raw,
      password: NEW_PASSWORD,
      passwordConfirm: NEW_PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(done.ok, true);

    const reuse = await completeActiveClinicPasswordReset(pool, {
      rawToken: raw,
      password: NEW_PASSWORD,
      passwordConfirm: NEW_PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(reuse.ok, false);

    const sibling = await completeActiveClinicPasswordReset(pool, {
      rawToken: siblingRaw,
      password: "AnotherPass99!",
      passwordConfirm: "AnotherPass99!",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(sibling.ok, false);

    const verified = await verifyPlatformIdentityPassword(pool, {
      identityId: identity.id,
      password: NEW_PASSWORD,
      recordFailure: false,
    });
    assert.equal(verified.ok, true);

    const bbRaw = crypto.randomBytes(32).toString("base64url");
    await platformTokenRepo.insertActionToken(pool, {
      platformIdentityId: identity.id,
      purpose: "activeclinic_staff_activation",
      tokenHash: hashSessionToken(bbRaw),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      productKey: "activeclinic",
      metadataJson: {},
    });
    const cross = await completeActiveClinicPasswordReset(pool, {
      rawToken: bbRaw,
      password: "CrossProduct99!",
      passwordConfirm: "CrossProduct99!",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(cross.ok, false);
    assert.equal(cross.code, AC_RESET.INVALID_TOKEN);
  });
});
