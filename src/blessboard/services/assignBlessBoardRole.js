"use strict";

/**
 * Assign a BlessBoard staff role (catalogue user_role_assignments only, V2.02).
 * Accepts legacy input aliases (platform_admin / church_hq_admin / branch_admin)
 * and maps them to catalogue keys. Does not write blessboard.user_roles.
 */

const repo = require("../repositories/blessBoardAuthRepository");
const rbacRepo = require("../repositories/blessBoardRbacRepository");
const { normalizeEmail } = require("./createBlessBoardUser");
const {
  LEGACY_TO_CATALOGUE_ROLE,
} = require("./blessBoardCatalogueLogin");
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

const ACCEPTED_INPUT_ROLE_KEYS = new Set([
  "platform_admin",
  "church_hq_admin",
  "branch_admin",
  "platform_administrator",
  "organisation_administrator",
  "church_system_administrator",
  "branch_administrator",
]);

function normalizeRoleKey(raw) {
  const key = String(raw || "")
    .trim()
    .toLowerCase();
  if (LEGACY_TO_CATALOGUE_ROLE[key]) return LEGACY_TO_CATALOGUE_ROLE[key];
  return key;
}

function scopeForCatalogueRole(catalogueRoleKey, churchId, branchId, organizationId) {
  if (catalogueRoleKey === "platform_administrator") {
    return {
      scopeType: "platform",
      scopeId: null,
      churchId: null,
      branchId: null,
      organizationId,
    };
  }
  if (
    catalogueRoleKey === "organisation_administrator" ||
    catalogueRoleKey === "church_system_administrator"
  ) {
    return {
      scopeType: churchId ? "church" : "organisation",
      scopeId: churchId || organizationId,
      churchId: churchId || null,
      branchId: null,
      organizationId,
    };
  }
  if (catalogueRoleKey === "branch_administrator") {
    return {
      scopeType: "branch",
      scopeId: branchId,
      churchId: churchId || null,
      branchId,
      organizationId,
    };
  }
  return {
    scopeType: churchId ? "church" : "organisation",
    scopeId: churchId || organizationId,
    churchId: churchId || null,
    branchId: null,
    organizationId,
  };
}

/**
 * @param {object} input
 */
function validateInput(input) {
  const raw = input && typeof input === "object" ? input : {};
  const email = normalizeEmail(raw.email);
  const organizationKey = String(raw.organizationKey || "")
    .trim()
    .toLowerCase();
  const inputRoleKey = String(raw.roleKey || "")
    .trim()
    .toLowerCase();
  const churchKey = raw.churchKey != null ? String(raw.churchKey).trim().toLowerCase() : "";
  const branchKey = raw.branchKey != null ? String(raw.branchKey).trim().toLowerCase() : "";

  if (!email) return { ok: false, reason: "email" };
  if (!organizationKey) return { ok: false, reason: "organizationKey" };
  if (!ACCEPTED_INPUT_ROLE_KEYS.has(inputRoleKey)) return { ok: false, reason: "roleKey" };

  const catalogueRoleKey = normalizeRoleKey(inputRoleKey);

  if (catalogueRoleKey === "platform_administrator" && (churchKey || branchKey)) {
    return { ok: false, reason: "platform_admin_scope" };
  }
  if (
    (catalogueRoleKey === "organisation_administrator" ||
      catalogueRoleKey === "church_system_administrator") &&
    (!churchKey || branchKey)
  ) {
    return { ok: false, reason: "church_hq_admin_scope" };
  }
  if (catalogueRoleKey === "branch_administrator" && (!churchKey || !branchKey)) {
    return { ok: false, reason: "branch_admin_scope" };
  }

  return {
    ok: true,
    value: {
      email,
      organizationKey,
      roleKey: catalogueRoleKey,
      inputRoleKey,
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

    const catalogueRole = await rbacRepo.findRoleByKey(client, req.roleKey);
    if (!catalogueRole || !catalogueRole.id) {
      return abort({
        ok: false,
        status: STATUS.INVALID_INPUT,
        message: "invalid_input:roleKey",
        role: null,
      });
    }

    const existingStaff = await client.query(
      `SELECT 1 FROM blessboard.user_role_assignments a
        WHERE a.user_id = $1 AND a.organization_id = $2 AND a.status = 'active'
          AND a.revoked_at IS NULL
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

    const scope = scopeForCatalogueRole(
      req.roleKey,
      churchId,
      branchId,
      organization.id
    );
    if (req.roleKey === "branch_administrator" && !scope.scopeId) {
      return abort({ ok: false, status: STATUS.INVALID_SCOPE, message: "invalid_scope", role: null });
    }

    const existingAssignments = await rbacRepo.listActiveAssignmentsForUser(
      client,
      user.id,
      organization.id
    );
    const existing = (existingAssignments || []).find(
      (a) =>
        String(a.roleKey) === req.roleKey &&
        String(a.scopeType) === scope.scopeType &&
        String(a.scopeId || "") === String(scope.scopeId || "")
    );
    if (existing) {
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
          roleKey: existing.roleKey,
          organizationId: existing.organizationId,
          churchId: existing.churchId,
          branchId: scope.branchId,
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
          churchId: scope.churchId,
          branchId: scope.branchId,
          status: null,
        },
      };
    }

    let role;
    try {
      const inserted = await runInsertWithUniqueRecovery(client, "prov_role_insert", () =>
        rbacRepo.insertAssignment(client, {
          userId: user.id,
          organizationId: organization.id,
          churchId: scope.churchId,
          roleId: catalogueRole.id,
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
          assignedByUserId: null,
          assignmentOrigin: "system",
          assignmentReason: "assignBlessBoardRole_catalogue",
        })
      );
      if (!inserted.ok) {
        return abort({ ok: false, status: STATUS.INVALID_SCOPE, message: "invalid_scope", role: null });
      }
      role = inserted.value;
    } catch (err) {
      if (/integrity|scope|belong|unique/i.test(String(err.message || ""))) {
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
        roleKey: req.roleKey,
        organizationId: role.organizationId,
        churchId: role.churchId,
        branchId: scope.branchId,
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
  ROLE_KEYS: ACCEPTED_INPUT_ROLE_KEYS,
  assignBlessBoardRole,
  validateInput,
  normalizeRoleKey,
};
