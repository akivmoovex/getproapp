"use strict";

/**
 * Assign a BlessBoard V5 role to a user for an organization/church/branch scope.
 */

const repo = require("../repositories/blessBoardAuthRepository");
const { normalizeEmail } = require("./createBlessBoardUser");

const STATUS = Object.freeze({
  ASSIGNED: "assigned",
  ALREADY_ASSIGNED: "already_assigned",
  INVALID_INPUT: "invalid_input",
  USER_NOT_FOUND: "user_not_found",
  ORGANIZATION_NOT_FOUND: "organization_not_found",
  CHURCH_NOT_FOUND: "church_not_found",
  BRANCH_NOT_FOUND: "branch_not_found",
  INVALID_SCOPE: "invalid_scope",
  ROLE_CONFLICT: "role_conflict",
  TRANSACTION_ERROR: "transaction_error",
});

const ROLE_KEYS = new Set(["platform_admin", "church_hq_admin", "branch_admin"]);

/**
 * @param {object} input
 */
function validateInput(input) {
  const raw = input && typeof input === "object" ? input : {};
  const email = normalizeEmail(raw.email);
  const organizationKey = String(raw.organizationKey || "")
    .trim()
    .toLowerCase();
  const roleKey = String(raw.roleKey || "")
    .trim()
    .toLowerCase();
  const churchKey = raw.churchKey != null ? String(raw.churchKey).trim().toLowerCase() : "";
  const branchKey = raw.branchKey != null ? String(raw.branchKey).trim().toLowerCase() : "";

  if (!email) return { ok: false, reason: "email" };
  if (!organizationKey) return { ok: false, reason: "organizationKey" };
  if (!ROLE_KEYS.has(roleKey)) return { ok: false, reason: "roleKey" };

  if (roleKey === "platform_admin" && (churchKey || branchKey)) {
    return { ok: false, reason: "platform_admin_scope" };
  }
  if (roleKey === "church_hq_admin" && (!churchKey || branchKey)) {
    return { ok: false, reason: "church_hq_admin_scope" };
  }
  if (roleKey === "branch_admin" && (!churchKey || !branchKey)) {
    return { ok: false, reason: "branch_admin_scope" };
  }

  return {
    ok: true,
    value: {
      email,
      organizationKey,
      roleKey,
      churchKey: churchKey || null,
      branchKey: branchKey || null,
    },
  };
}

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {object} input
 */
async function assignBlessBoardRole(db, input) {
  const validated = validateInput(input);
  if (!validated.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      message: `invalid_input:${validated.reason}`,
      role: null,
    };
  }
  const req = validated.value;

  if (!db || (typeof db.connect !== "function" && typeof db.query !== "function")) {
    return { ok: false, status: STATUS.TRANSACTION_ERROR, message: "database required", role: null };
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

    const user = await repo.findUserByEmail(client, req.email);
    if (!user) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.USER_NOT_FOUND, message: "user_not_found", role: null };
    }

    const organization = await repo.findOrganizationByKey(client, req.organizationKey);
    if (!organization) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: STATUS.ORGANIZATION_NOT_FOUND,
        message: "organization_not_found",
        role: null,
      };
    }

    let churchId = null;
    let branchId = null;
    if (req.churchKey) {
      const church = await repo.findChurchByKey(client, req.churchKey);
      if (!church) {
        await client.query("ROLLBACK");
        return { ok: false, status: STATUS.CHURCH_NOT_FOUND, message: "church_not_found", role: null };
      }
      if (String(church.organization_id) !== String(organization.id)) {
        await client.query("ROLLBACK");
        return { ok: false, status: STATUS.INVALID_SCOPE, message: "invalid_scope", role: null };
      }
      churchId = church.id;
    }
    if (req.branchKey) {
      const branch = await repo.findBranchByChurchAndKey(client, churchId, req.branchKey);
      if (!branch) {
        await client.query("ROLLBACK");
        return { ok: false, status: STATUS.BRANCH_NOT_FOUND, message: "branch_not_found", role: null };
      }
      branchId = branch.id;
    }

    const existing = await repo.findRole(client, {
      userId: user.id,
      organizationId: organization.id,
      churchId,
      branchId,
      roleKey: req.roleKey,
    });
    if (existing) {
      if (String(existing.status) !== "active") {
        await client.query("ROLLBACK");
        return { ok: false, status: STATUS.ROLE_CONFLICT, message: "role_conflict", role: null };
      }
      await client.query("COMMIT");
      return {
        ok: true,
        status: STATUS.ALREADY_ASSIGNED,
        message: "already_assigned",
        role: {
          id: existing.id,
          roleKey: existing.role_key,
          organizationId: existing.organization_id,
          churchId: existing.church_id,
          branchId: existing.branch_id,
          status: existing.status,
        },
      };
    }

    let role;
    try {
      role = await repo.insertRole(client, {
        userId: user.id,
        organizationId: organization.id,
        churchId,
        branchId,
        roleKey: req.roleKey,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      if (repo.isUniqueViolation(err) || /integrity|scope|belong/i.test(String(err.message || ""))) {
        return { ok: false, status: STATUS.INVALID_SCOPE, message: "invalid_scope", role: null };
      }
      return { ok: false, status: STATUS.TRANSACTION_ERROR, message: "transaction_error", role: null };
    }

    await client.query("COMMIT");
    return {
      ok: true,
      status: STATUS.ASSIGNED,
      message: "assigned",
      role: {
        id: role.id,
        roleKey: role.role_key,
        organizationId: role.organization_id,
        churchId: role.church_id,
        branchId: role.branch_id,
        status: role.status,
      },
    };
  } catch {
    try {
      if (client) await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    return { ok: false, status: STATUS.TRANSACTION_ERROR, message: "transaction_error", role: null };
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

module.exports = {
  STATUS,
  validateInput,
  assignBlessBoardRole,
};
