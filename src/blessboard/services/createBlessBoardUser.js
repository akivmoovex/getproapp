"use strict";

/**
 * Create a BlessBoard V5 user (hashed password). Caller supplies pool/client.
 */

const bcrypt = require("bcryptjs");
const repo = require("../repositories/blessBoardAuthRepository");

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
  const password = raw.password != null ? String(raw.password) : "";

  if (!emailNormalized || !EMAIL_RE.test(emailNormalized) || emailNormalized.length > 254) {
    return { ok: false, reason: "email" };
  }
  if (!displayName || displayName.length > 200) {
    return { ok: false, reason: "displayName" };
  }
  if (!password || password.length < 10 || password.length > 200) {
    return { ok: false, reason: "password" };
  }
  return {
    ok: true,
    value: { emailNormalized, emailDisplay: emailDisplay || emailNormalized, displayName, password },
  };
}

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {object} input
 */
async function createBlessBoardUser(db, input) {
  const validated = validateInput(input);
  if (!validated.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: `invalid_input:${validated.reason}`, user: null };
  }
  const req = validated.value;

  if (!db || (typeof db.connect !== "function" && typeof db.query !== "function")) {
    return { ok: false, status: STATUS.TRANSACTION_ERROR, message: "database required", user: null };
  }

  let client = null;
  let owned = false;
  try {
    if (typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }

    await client.query("BEGIN");

    const existing = await repo.findUserByEmail(client, req.emailNormalized);
    if (existing) {
      if (
        String(existing.display_name) === req.displayName &&
        String(existing.status) === "active"
      ) {
        // Idempotent only when password also matches (verify hash).
        const matches = await bcrypt.compare(req.password, existing.password_hash);
        await client.query(matches ? "COMMIT" : "ROLLBACK");
        if (matches) {
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
        return {
          ok: false,
          status: STATUS.IDENTITY_CONFLICT,
          message: "identity_conflict",
          user: null,
        };
      }
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: STATUS.IDENTITY_CONFLICT,
        message: "identity_conflict",
        user: null,
      };
    }

    const passwordHash = await bcrypt.hash(req.password, BCRYPT_ROUNDS);
    let user;
    try {
      user = await repo.insertUser(client, {
        emailNormalized: req.emailNormalized,
        emailDisplay: req.emailDisplay,
        passwordHash,
        displayName: req.displayName,
      });
    } catch (err) {
      if (repo.isUniqueViolation(err)) {
        await client.query("ROLLBACK");
        return {
          ok: false,
          status: STATUS.IDENTITY_CONFLICT,
          message: "identity_conflict",
          user: null,
        };
      }
      throw err;
    }

    await client.query("COMMIT");
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
    try {
      if (client) await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    return { ok: false, status: STATUS.TRANSACTION_ERROR, message: "transaction_error", user: null };
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

module.exports = {
  STATUS,
  BCRYPT_ROUNDS,
  normalizeEmail,
  validateInput,
  createBlessBoardUser,
};
