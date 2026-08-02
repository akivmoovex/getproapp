"use strict";

/**
 * Prompt 11G — OTP workflows for invitation activation, phone verification, and recovery.
 * Uses the provider-neutral OTP service. Invitation OTP cannot reset passwords and vice versa.
 */

const bcrypt = require("bcryptjs");
const { normalizeBlessBoardPhone } = require("./normalizeBlessBoardPhone");
const {
  startVerification,
  checkVerification,
  STATUS: OTP_STATUS,
} = require("./otp/blessBoardOtpService");
const {
  acceptInvitation,
  STATUS: INVITE_STATUS,
  validatePassword,
} = require("./inviteBlessBoardStaff");
const { hashSessionToken } = require("../../platform/session/sessionToken");
const inviteRepo = require("../repositories/userInvitationRepository");
const authRepo = require("../repositories/blessBoardAuthRepository");
const { BCRYPT_ROUNDS } = require("./createBlessBoardUser");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  CONFLICT: "conflict",
  RATE_LIMITED: "rate_limited",
  LOOKUP_ERROR: "lookup_error",
});

const NEUTRAL_RECOVERY =
  "If that phone number is registered, a verification code will be sent shortly.";

async function withClient(db, fn) {
  let client = null;
  let owned = false;
  try {
    if (db && typeof db.query === "function" && typeof db.release === "function") {
      return await fn(db);
    }
    if (db && typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    return await fn(client);
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

function mapOtpFailure(result) {
  if (!result || result.ok) return null;
  if (result.status === OTP_STATUS.RATE_LIMITED) {
    return { ok: false, status: STATUS.RATE_LIMITED, reason: result.reason };
  }
  if (result.status === OTP_STATUS.PURPOSE_MISMATCH) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "purpose_mismatch" };
  }
  return {
    ok: false,
    status: STATUS.INVALID_INPUT,
    reason: result.reason || result.status,
    challenge: result.challenge || null,
  };
}

/**
 * Start invitation activation OTP. Phone must match the invitation identity.
 */
async function startInvitationActivationOtp(db, input, env) {
  const rawToken = String((input && input.token) || "").trim();
  const tokenHash = hashSessionToken(rawToken);
  if (!tokenHash || tokenHash.length !== 64) {
    return { ok: false, status: STATUS.NOT_FOUND, reason: "invitation" };
  }

  const confirmedPhone = normalizeBlessBoardPhone(input && input.phone, {
    country: input && input.country,
    defaultCountry: "ZM",
  });
  if (!confirmedPhone.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "phone" };
  }

  try {
    return await withClient(db, async (client) => {
      const invite = await inviteRepo.findByTokenHash(client, tokenHash);
      if (!invite || invite.status !== "pending") {
        return { ok: false, status: STATUS.NOT_FOUND, reason: "invitation" };
      }
      if (!invite.phoneNormalized) {
        return { ok: false, status: STATUS.INVALID_INPUT, reason: "invitation_phone_missing" };
      }
      if (invite.phoneNormalized !== confirmedPhone.normalized) {
        // Do not reveal whether the invitation exists with a different phone.
        return { ok: false, status: STATUS.NOT_FOUND, reason: "invitation" };
      }

      const started = await startVerification(
        client,
        {
          phone: confirmedPhone.normalized,
          purpose: "invitation_activation",
          organizationId: invite.organizationId,
          requestIp: input.requestIp,
          sessionFingerprint: input.sessionFingerprint,
          country: input.country,
        },
        env
      );
      if (!started.ok) return mapOtpFailure(started) || started;
      return {
        ok: true,
        status: STATUS.OK,
        challenge: started.challenge,
        testCode: started.testCode,
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 120) : "error",
    };
  }
}

/**
 * Verify invitation OTP then accept invitation and set password.
 */
async function completeInvitationActivation(db, input, env) {
  const rawToken = String((input && input.token) || "").trim();
  const verificationId = String((input && input.verificationId) || "").trim();
  const code = String((input && input.code) || "").trim();
  if (!rawToken || !verificationId || !code) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }

  const checked = await checkVerification(
    db,
    {
      verificationId,
      purpose: "invitation_activation",
      code,
    },
    env
  );
  if (!checked.ok) return mapOtpFailure(checked) || checked;

  const accepted = await acceptInvitation(db, {
    token: rawToken,
    password: input.password,
  });
  if (!accepted.ok) return accepted;

  const userId =
    (accepted.user && accepted.user.id) ||
    accepted.userId ||
    null;
  if (userId && checked.normalizedPhone) {
    await withClient(db, async (client) => {
      await client.query(
        `UPDATE blessboard.users
            SET phone_normalized = COALESCE(phone_normalized, $2),
                phone_display = COALESCE(phone_display, $2),
                phone_verified_at = now(),
                preferred_login_identifier = COALESCE(preferred_login_identifier, 'phone'),
                updated_at = now()
          WHERE id = $1`,
        [userId, checked.normalizedPhone]
      );
    });
  }

  return {
    ok: true,
    status: STATUS.OK,
    inviteStatus: accepted.status || INVITE_STATUS.OK,
    userId,
    phoneVerified: true,
  };
}

/**
 * Add/verify phone on an authenticated account via OTP.
 */
async function startAccountPhoneVerification(db, input, env) {
  const userId = String((input && input.userId) || "").trim();
  if (!userId) return { ok: false, status: STATUS.INVALID_INPUT, reason: "user" };
  const phone = normalizeBlessBoardPhone(input && input.phone, {
    country: input && input.country,
    defaultCountry: "ZM",
  });
  if (!phone.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: "phone" };

  const purpose =
    input && input.changeExisting ? "phone_change" : "phone_verification";

  return startVerification(
    db,
    {
      phone: phone.normalized,
      purpose,
      userId,
      organizationId: input.organizationId || null,
      requestIp: input.requestIp,
      sessionFingerprint: input.sessionFingerprint,
      country: input.country,
    },
    env
  );
}

async function completeAccountPhoneVerification(db, input, env) {
  const userId = String((input && input.userId) || "").trim();
  const verificationId = String((input && input.verificationId) || "").trim();
  const code = String((input && input.code) || "").trim();
  const purpose = String((input && input.purpose) || "phone_verification").trim();
  if (!userId || !verificationId || !code) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  if (purpose !== "phone_verification" && purpose !== "phone_change") {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "purpose" };
  }

  const checked = await checkVerification(
    db,
    { verificationId, purpose, code },
    env
  );
  if (!checked.ok) return mapOtpFailure(checked) || checked;
  if (checked.userId && String(checked.userId) !== userId) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "user_mismatch" };
  }

  await withClient(db, async (client) => {
    await client.query(
      `UPDATE blessboard.users
          SET phone_normalized = $2,
              phone_display = COALESCE(phone_display, $2),
              phone_verified_at = now(),
              preferred_login_identifier = COALESCE(preferred_login_identifier, 'phone'),
              updated_at = now()
        WHERE id = $1`,
      [userId, checked.normalizedPhone]
    );
    // Phone change invalidates pending OTP challenges for other purposes on old flows
    // by relying on purpose isolation; sessions remain until password change.
  });

  return {
    ok: true,
    status: STATUS.OK,
    phoneNormalized: checked.normalizedPhone,
    phoneVerifiedAt: new Date().toISOString(),
  };
}

/**
 * Phone-first password recovery (email remains available via existing service).
 * Always returns a neutral message to prevent enumeration.
 */
async function startPhonePasswordRecovery(db, input, env) {
  const phone = normalizeBlessBoardPhone(input && input.phone, {
    country: input && input.country,
    defaultCountry: "ZM",
  });
  if (!phone.ok) {
    return { ok: true, status: STATUS.OK, message: NEUTRAL_RECOVERY, sent: false };
  }

  try {
    return await withClient(db, async (client) => {
      const user = await authRepo.findUserByPhone(client, phone.normalized);
      const eligible =
        user && String(user.status) === "active" && user.password_hash;
      if (!eligible) {
        return { ok: true, status: STATUS.OK, message: NEUTRAL_RECOVERY, sent: false };
      }

      const started = await startVerification(
        client,
        {
          phone: phone.normalized,
          purpose: "password_recovery",
          userId: String(user.id),
          requestIp: input.requestIp,
          sessionFingerprint: input.sessionFingerprint,
          country: input.country,
        },
        env
      );
      if (!started.ok) {
        // Still neutral to callers; include rate-limit signal for UI cooldown only.
        return {
          ok: true,
          status: STATUS.OK,
          message: NEUTRAL_RECOVERY,
          sent: false,
          rateLimited: started.status === OTP_STATUS.RATE_LIMITED,
          challenge: started.challenge || null,
        };
      }
      return {
        ok: true,
        status: STATUS.OK,
        message: NEUTRAL_RECOVERY,
        sent: true,
        challenge: started.challenge,
        testCode: started.testCode,
      };
    });
  } catch {
    return { ok: true, status: STATUS.OK, message: NEUTRAL_RECOVERY, sent: false };
  }
}

async function completePhonePasswordRecovery(db, input, env) {
  const verificationId = String((input && input.verificationId) || "").trim();
  const code = String((input && input.code) || "").trim();
  if (!verificationId || !code) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }

  const passwordCheck = validatePassword(input && input.password);
  if (!passwordCheck.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "password" };
  }
  if (
    String(input.passwordConfirm != null ? input.passwordConfirm : "") !==
    passwordCheck.value
  ) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "confirm" };
  }

  // Invitation OTP cannot be reused here — purpose is bound.
  const checked = await checkVerification(
    db,
    {
      verificationId,
      purpose: "password_recovery",
      code,
    },
    env
  );
  if (!checked.ok) return mapOtpFailure(checked) || checked;

  const passwordHash = await bcrypt.hash(passwordCheck.value, BCRYPT_ROUNDS);

  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const user = checked.userId
          ? await authRepo.findUserById(client, checked.userId)
          : await authRepo.findUserByPhone(client, checked.normalizedPhone);
        if (!user || String(user.status) !== "active") {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, reason: "user" };
        }

        await authRepo.updateUserPasswordHash(client, user.id, passwordHash);
        const revoked = await authRepo.revokeAllSessionsForUser(client, user.id);
        await client.query("COMMIT");
        return {
          ok: true,
          status: STATUS.OK,
          userId: String(user.id),
          sessionsRevoked: revoked,
        };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 120) : "error",
    };
  }
}

module.exports = {
  STATUS,
  NEUTRAL_RECOVERY,
  startInvitationActivationOtp,
  completeInvitationActivation,
  startAccountPhoneVerification,
  completeAccountPhoneVerification,
  startPhonePasswordRecovery,
  completePhonePasswordRecovery,
};
