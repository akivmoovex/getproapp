"use strict";

/**
 * Authenticate a BlessBoard V5 user and create a deployment-scoped session.
 * Does not read process.env. Caller supplies deploymentCode and pool.
 */

const bcrypt = require("bcryptjs");
const repo = require("../repositories/blessBoardAuthRepository");
const { createV5Session } = require("../../platform/session/createV5Session");
const { normalizeEmail } = require("./createBlessBoardUser");

const STATUS = Object.freeze({
  AUTHENTICATED: "authenticated",
  INVALID_CREDENTIALS: "invalid_credentials",
  INVALID_INPUT: "invalid_input",
  NO_ACTIVE_ROLE: "no_active_role",
  TRANSACTION_ERROR: "transaction_error",
});

const GENERIC_FAILURE = "invalid_credentials";

/**
 * @param {Array<{ role_key: string, organization_id: string, church_id: string | null, branch_id: string | null }>} roles
 * @param {string | null} requireOrganizationId
 */
function rolesApplicableToOrganization(roles, requireOrganizationId) {
  if (!requireOrganizationId) return roles;
  const orgId = String(requireOrganizationId);
  return (roles || []).filter((r) => {
    if (String(r.role_key) === "platform_admin") return true;
    return String(r.organization_id || "") === orgId;
  });
}

/**
 * Prefer HQ / branch / platform roles scoped to the required organization when present.
 * @param {Array<{ role_key: string, organization_id: string, church_id: string | null, branch_id: string | null }>} roles
 * @param {string | null} requireOrganizationId
 */
function preferSessionRole(roles, requireOrganizationId) {
  const list = rolesApplicableToOrganization(roles, requireOrganizationId);
  if (!list.length) return null;
  if (requireOrganizationId) {
    const orgId = String(requireOrganizationId);
    const scoped =
      list.find((r) => r.role_key === "church_hq_admin" && String(r.organization_id) === orgId) ||
      list.find((r) => r.role_key === "branch_admin" && String(r.organization_id) === orgId) ||
      list.find((r) => r.role_key === "platform_admin") ||
      list[0];
    return scoped;
  }
  return (
    list.find((r) => r.role_key === "church_hq_admin") ||
    list.find((r) => r.role_key === "branch_admin") ||
    list[0]
  );
}

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{
 *   email: string,
 *   password: string,
 *   deploymentCode: string,
 *   requireOrganizationId?: string | null,
 *   ip?: string | null,
 *   userAgent?: string | null
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

    await client.query("BEGIN");

    const user = await repo.findUserByEmail(client, email);
    if (!user || String(user.status) !== "active") {
      await client.query("ROLLBACK");
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
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: STATUS.INVALID_CREDENTIALS,
        message: GENERIC_FAILURE,
        session: null,
        user: null,
      };
    }

    const roles = await repo.listActiveRolesForUser(client, user.id);
    const applicable = rolesApplicableToOrganization(roles, requireOrganizationId);
    if (!applicable.length) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: STATUS.NO_ACTIVE_ROLE,
        message: "no_active_role",
        session: null,
        user: null,
      };
    }

    const preferred = preferSessionRole(roles, requireOrganizationId);
    if (!preferred) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: STATUS.NO_ACTIVE_ROLE,
        message: "no_active_role",
        session: null,
        user: null,
      };
    }

    const created = await createV5Session(client, {
      deploymentCode,
      userId: user.id,
      organizationId: preferred.organization_id,
      churchId: preferred.church_id,
      branchId: preferred.branch_id,
      ip: input.ip || null,
      userAgent: input.userAgent || null,
    });
    if (!created.ok) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: STATUS.TRANSACTION_ERROR,
        message: created.code || "session_create_failed",
        session: null,
        user: null,
      };
    }

    await repo.touchLastLogin(client, user.id);
    await client.query("COMMIT");

    return {
      ok: true,
      status: STATUS.AUTHENTICATED,
      message: "authenticated",
      rawToken: created.rawToken,
      session: created.session,
      user: {
        id: user.id,
        email: user.email_normalized,
        displayName: user.display_name,
        status: user.status,
      },
      roles: applicable.map((r) => ({
        roleKey: r.role_key,
        organizationId: r.organization_id,
        churchId: r.church_id,
        branchId: r.branch_id,
      })),
    };
  } catch {
    try {
      if (client) await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
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
