"use strict";

/**
 * Assign a BlessBoard V5 role to a user for an organization/church/branch scope.
 */

const repo = require("../repositories/blessBoardAuthRepository");
const { normalizeEmail } = require("./createBlessBoardUser");
const {
  resolveManageTransactionOption,
  openProvisioningSession,
  runInsertWithUniqueRecovery,
} = require("../../platform/db/provisioningTransaction");

const STATUS = Object.freeze({
  ASSIGNED: "assigned",
  ALREADY_ASSIGNED: "already_assigned",
  DRY_RUN_WOULD_ASSIGN: "dry_run_would_assign",
  DRY_RUN_ALREADY_ASSIGNED: "dry_run_already_assigned",
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
 * @param {{ manageTransaction?: boolean }} [options]
 */
async function assignBlessBoardRole(db, input, options) {
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
  const dryRun = Boolean(input && input.dryRun);

  const resolved = resolveManageTransactionOption(db, options);
  if (!resolved.ok) {
    return { ok: false, status: STATUS.TRANSACTION_ERROR, message: resolved.message, role: null };
  }

  let session = null;
  try {
    session = await openProvisioningSession(resolved);
    const client = session.client;
    const abort = async (result) => {
      await session.rollbackIfManaged();
      return result;
    };

    const user = await repo.findUserByEmail(client, req.email);
    if (!user) {
      return abort({ ok: false, status: STATUS.USER_NOT_FOUND, message: "user_not_found", role: null });
    }

    const organization = await repo.findOrganizationByKey(client, req.organizationKey);
    if (!organization) {
      return abort({
        ok: false,
        status: STATUS.ORGANIZATION_NOT_FOUND,
        message: "organization_not_found",
        role: null,
      });
    }

    const existingStaff = await client.query(
      `SELECT 1 FROM blessboard.user_roles
        WHERE user_id = $1 AND organization_id = $2 AND status = 'active'
          AND role_key IN ('platform_admin', 'church_hq_admin', 'branch_admin')
        LIMIT 1`,
      [user.id, organization.id]
    );
    const { evaluateStaffAccountLimit, STATUS: ENT_STATUS } = require("../../platform/services/entitlementService");
    const staffGate = await evaluateStaffAccountLimit(client, {
      organizationId: organization.id,
      countsAsNewStaff: existingStaff.rows.length === 0,
      countsAsNewUser: existingStaff.rows.length === 0,
    });
    if (!staffGate.ok) {
      const message =
        staffGate.status === ENT_STATUS.LIMIT_EXCEEDED
          ? `limit_exceeded:${staffGate.reason}`
          : staffGate.status === ENT_STATUS.SUBSCRIPTION_INACTIVE
            ? "subscription_inactive"
            : "entitlement_denied";
      return abort({
        ok: false,
        status: STATUS.ROLE_CONFLICT,
        message,
        role: null,
      });
    }

    let churchId = null;
    let branchId = null;
    if (req.churchKey) {
      const church = await repo.findChurchByKey(client, req.churchKey);
      if (!church) {
        return abort({
          ok: false,
          status: STATUS.CHURCH_NOT_FOUND,
          message: "church_not_found",
          role: null,
        });
      }
      if (String(church.organization_id) !== String(organization.id)) {
        return abort({ ok: false, status: STATUS.INVALID_SCOPE, message: "invalid_scope", role: null });
      }
      churchId = church.id;
    }
    if (req.branchKey) {
      const branch = await repo.findBranchByChurchAndKey(client, churchId, req.branchKey);
      if (!branch) {
        return abort({
          ok: false,
          status: STATUS.BRANCH_NOT_FOUND,
          message: "branch_not_found",
          role: null,
        });
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
        return abort({ ok: false, status: STATUS.ROLE_CONFLICT, message: "role_conflict", role: null });
      }
      if (dryRun) {
        await session.rollbackIfManaged();
      } else {
        await session.commitIfManaged();
      }
      return {
        ok: true,
        status: dryRun ? STATUS.DRY_RUN_ALREADY_ASSIGNED : STATUS.ALREADY_ASSIGNED,
        message: dryRun ? STATUS.DRY_RUN_ALREADY_ASSIGNED : "already_assigned",
        planned: dryRun ? { role: false } : undefined,
        dryRun,
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

    if (dryRun) {
      await session.rollbackIfManaged();
      return {
        ok: true,
        status: STATUS.DRY_RUN_WOULD_ASSIGN,
        message: STATUS.DRY_RUN_WOULD_ASSIGN,
        planned: { role: true },
        dryRun: true,
        role: {
          id: null,
          roleKey: req.roleKey,
          organizationId: organization.id,
          churchId,
          branchId,
          status: null,
        },
      };
    }

    let role;
    try {
      const inserted = await runInsertWithUniqueRecovery(client, "prov_role_insert", () =>
        repo.insertRole(client, {
          userId: user.id,
          organizationId: organization.id,
          churchId,
          branchId,
          roleKey: req.roleKey,
        })
      );
      if (!inserted.ok) {
        return abort({ ok: false, status: STATUS.INVALID_SCOPE, message: "invalid_scope", role: null });
      }
      role = inserted.value;
    } catch (err) {
      if (/integrity|scope|belong/i.test(String(err.message || ""))) {
        return abort({ ok: false, status: STATUS.INVALID_SCOPE, message: "invalid_scope", role: null });
      }
      return abort({
        ok: false,
        status: STATUS.TRANSACTION_ERROR,
        message: "transaction_error",
        role: null,
      });
    }

    await session.commitIfManaged();
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
    if (session) await session.safeRollbackOnError();
    return { ok: false, status: STATUS.TRANSACTION_ERROR, message: "transaction_error", role: null };
  } finally {
    if (session) session.releaseIfOwned();
  }
}

module.exports = {
  STATUS,
  validateInput,
  assignBlessBoardRole,
};
