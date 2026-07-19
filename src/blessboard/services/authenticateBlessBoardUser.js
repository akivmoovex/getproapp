"use strict";

/**
 * Authenticate a BlessBoard V5 user and create a deployment-scoped session.
 * Does not read process.env. Caller supplies deploymentCode and pool.
 */

const bcrypt = require("bcryptjs");
const repo = require("../repositories/blessBoardAuthRepository");
const { normalizeEmail } = require("./createBlessBoardUser");
const {
  establishBlessBoardSession,
  rolesApplicableToOrganization,
  preferSessionRole,
} = require("./establishBlessBoardSession");

const STATUS = Object.freeze({
  AUTHENTICATED: "authenticated",
  INVALID_CREDENTIALS: "invalid_credentials",
  INVALID_INPUT: "invalid_input",
  NO_ACTIVE_ROLE: "no_active_role",
  TRANSACTION_ERROR: "transaction_error",
});

const GENERIC_FAILURE = "invalid_credentials";

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{
 *   email: string,
 *   password: string,
 *   deploymentCode: string,
 *   requireOrganizationId?: string | null,
 *   ip?: string | null,
 *   userAgent?: string | null,
 *   createSession?: Function,
 * }} input
 */
async function authenticateBlessBoardUser(db, input) {
  const email = normalizeEmail(input && input.email);
  const password = input && input.password != null ? String(input.password) : "";
  const deploymentCode = String((input && input.deploymentCode) || "")
    .trim()
    .toLowerCase();
  const requireOrganizationId =
    input && input.requireOrganizationId != null && String(input.requireOrganizationId).trim() !== ""
      ? String(input.requireOrganizationId).trim()
      : null;

  if (!email || !password || !deploymentCode) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input", session: null, user: null };
  }

  if (!db || (typeof db.connect !== "function" && typeof db.query !== "function")) {
    return {
      ok: false,
      status: STATUS.TRANSACTION_ERROR,
      message: "database required",
      session: null,
      user: null,
    };
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

    const user = await repo.findUserByEmail(client, email);
    if (!user || String(user.status) !== "active") {
      try {
        // Burn comparable CPU without revealing existence; ignore invalid-hash errors.
        await bcrypt.compare(
          password,
          "$2a$12$C6UzMDM.H6dfI/f/IKxGhuR.Vo5.1qHqGhuR.Vo5.1qHqGhuR.Vo5."
        );
      } catch {
        /* ignore */
      }
      return {
        ok: false,
        status: STATUS.INVALID_CREDENTIALS,
        message: GENERIC_FAILURE,
        session: null,
        user: null,
      };
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      return {
        ok: false,
        status: STATUS.INVALID_CREDENTIALS,
        message: GENERIC_FAILURE,
        session: null,
        user: null,
      };
    }

    // Release owned client before nested establishBlessBoardSession opens its own.
    if (owned && client && typeof client.release === "function") {
      client.release();
      owned = false;
      client = null;
    }

    return establishBlessBoardSession(db, {
      userId: user.id,
      deploymentCode,
      requireOrganizationId,
      ip: input.ip || null,
      userAgent: input.userAgent || null,
      createSession: input.createSession,
    });
  } catch {
    return {
      ok: false,
      status: STATUS.TRANSACTION_ERROR,
      message: "transaction_error",
      session: null,
      user: null,
    };
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

module.exports = {
  STATUS,
  authenticateBlessBoardUser,
  rolesApplicableToOrganization,
  preferSessionRole,
};
