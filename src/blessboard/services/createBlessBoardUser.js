"use strict";

/**
 * Create a BlessBoard V5 user (hashed password). Caller supplies pool/client.
 *
 * Password hashing runs before BEGIN so bcrypt CPU work does not hold a transaction open.
 * Idempotent password verification (bcrypt.compare) still runs after the email lookup.
 */

const bcrypt = require("bcryptjs");
const repo = require("../repositories/blessBoardAuthRepository");
const {
  resolveManageTransactionOption,
  openProvisioningSession,
  runInsertWithUniqueRecovery,
} = require("../../platform/db/provisioningTransaction");

const STATUS = Object.freeze({
  CREATED: "created",
  ALREADY_EXISTS: "already_exists",
  INVALID_INPUT: "invalid_input",
  IDENTITY_CONFLICT: "identity_conflict",
  TRANSACTION_ERROR: "transaction_error",
});

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const BCRYPT_ROUNDS = 12;

function normalizeEmail(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

/**
 * @param {object} input
 */
function validateInput(input) {
  const raw = input && typeof input === "object" ? input : {};
  const emailNormalized = normalizeEmail(raw.email);
  const emailDisplay = String(raw.email != null ? raw.email : "").trim();
  const displayName = String(raw.displayName != null ? raw.displayName : "").trim();
  const phoneNormalized =
    raw.phoneNormalized != null && String(raw.phoneNormalized).trim()
      ? String(raw.phoneNormalized).trim()
      : null;
  const phoneDisplay =
    raw.phoneDisplay != null && String(raw.phoneDisplay).trim()
      ? String(raw.phoneDisplay).trim()
      : phoneNormalized;
  const password = raw.password != null ? String(raw.password) : "";
  const passwordHash = raw.passwordHash != null ? String(raw.passwordHash) : "";

  if (!emailNormalized || !EMAIL_RE.test(emailNormalized) || emailNormalized.length > 254) {
    return { ok: false, reason: "email" };
  }
  if (!displayName || displayName.length > 200) {
    return { ok: false, reason: "displayName" };
  }
  if (passwordHash) {
    if (passwordHash.length < 20 || passwordHash.length > 200) {
      return { ok: false, reason: "passwordHash" };
    }
    return {
      ok: true,
      value: {
        emailNormalized,
        emailDisplay: emailDisplay || emailNormalized,
        displayName,
        phoneNormalized,
        phoneDisplay,
        password: null,
        passwordHash,
      },
    };
  }
  if (!password || password.length < 10 || password.length > 200) {
    return { ok: false, reason: "password" };
  }
  return {
    ok: true,
    value: {
      emailNormalized,
      emailDisplay: emailDisplay || emailNormalized,
      displayName,
      phoneNormalized,
      phoneDisplay,
      password,
      passwordHash: null,
    },
  };
}

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {object} input
 * @param {{ manageTransaction?: boolean }} [options]
 */
async function createBlessBoardUser(db, input, options) {
  const validated = validateInput(input);
  if (!validated.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: `invalid_input:${validated.reason}`, user: null };
  }
  const req = validated.value;

  const resolved = resolveManageTransactionOption(db, options);
  if (!resolved.ok) {
    return { ok: false, status: STATUS.TRANSACTION_ERROR, message: resolved.message, user: null };
  }

  // Hash before opening a transaction so bcrypt does not hold locks/TX open.
  // Orchestrator may pass a precomputed passwordHash (never log it).
  const passwordHash =
    req.passwordHash || (await bcrypt.hash(req.password, BCRYPT_ROUNDS));

  let session = null;
  try {
    session = await openProvisioningSession(resolved);
    const client = session.client;
    const abort = async (result) => {
      await session.rollbackIfManaged();
      return result;
    };

    const existing = await repo.findUserByEmail(client, req.emailNormalized);
    if (existing) {
      if (
        String(existing.display_name) === req.displayName &&
        String(existing.status) === "active" &&
        req.password
      ) {
        const matches = await bcrypt.compare(req.password, existing.password_hash);
        if (matches) {
          await session.commitIfManaged();
          return {
            ok: true,
            status: STATUS.ALREADY_EXISTS,
            message: "already_exists",
            user: {
              id: existing.id,
              email: existing.email_normalized,
              displayName: existing.display_name,
              status: existing.status,
            },
          };
        }
      }
      return abort({
        ok: false,
        status: STATUS.IDENTITY_CONFLICT,
        message: "identity_conflict",
        user: null,
      });
    }

    let user;
    try {
      const inserted = await runInsertWithUniqueRecovery(client, "prov_user_insert", () =>
        repo.insertUser(client, {
          emailNormalized: req.emailNormalized,
          emailDisplay: req.emailDisplay,
          passwordHash,
          displayName: req.displayName,
          phoneNormalized: req.phoneNormalized,
          phoneDisplay: req.phoneDisplay,
        })
      );
      if (!inserted.ok) {
        return abort({
          ok: false,
          status: STATUS.IDENTITY_CONFLICT,
          message: "identity_conflict",
          user: null,
        });
      }
      user = inserted.value;
    } catch (err) {
      throw err;
    }

    await session.commitIfManaged();
    return {
      ok: true,
      status: STATUS.CREATED,
      message: "created",
      user: {
        id: user.id,
        email: user.email_normalized,
        displayName: user.display_name,
        status: user.status,
      },
    };
  } catch {
    if (session) await session.safeRollbackOnError();
    return { ok: false, status: STATUS.TRANSACTION_ERROR, message: "transaction_error", user: null };
  } finally {
    if (session) session.releaseIfOwned();
  }
}

module.exports = {
  STATUS,
  BCRYPT_ROUNDS,
  normalizeEmail,
  validateInput,
  createBlessBoardUser,
};
