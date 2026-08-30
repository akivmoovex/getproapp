"use strict";

/**
 * HQ-scoped staff role list / assign / revoke for fixed V5 roles only.
 * Assignable: church_hq_admin, branch_admin. Never platform_admin via this path.
 */

const repo = require("../repositories/blessBoardAuthRepository");
const { normalizeEmail } = require("./createBlessBoardUser");
const {
  evaluateStaffAccountLimit,
  STATUS: ENT_STATUS,
} = require("../../platform/services/entitlementService");
const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");
const { assertNotLastHqAdminRemoval } = require("./blessBoardLastAdminGuard");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  LIMIT_EXCEEDED: "limit_exceeded",
  CONFIRMATION_REQUIRED: "confirmation_required",
  LOOKUP_ERROR: "lookup_error",
});

const HQ_ASSIGNABLE_ROLES = Object.freeze(["church_hq_admin", "branch_admin"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapRoleRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    churchId: row.church_id,
    branchId: row.branch_id || null,
    roleKey: row.role_key,
    status: row.status,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    emailDisplay: row.email_display || null,
    displayName: row.user_display_name || null,
    userStatus: row.user_status || null,
    branchKey: row.branch_key || null,
    branchDisplayName: row.branch_display_name || null,
  };
}

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

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   actorUserId: string,
 *   organizationId: string,
 *   churchId: string,
 *   q?: string | null,
 *   roleKey?: string | null,
 *   limit?: number,
 *   offset?: number,
 * }} input
 */
async function listHqChurchRoles(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  if (!UUID_RE.test(actorUserId) || !UUID_RE.test(organizationId) || !UUID_RE.test(churchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, roles: [], total: 0, counts: null, reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      const rows = await repo.listChurchStaffRoles(client, {
        organizationId,
        churchId,
        q: input.q,
        roleKey: input.roleKey,
        limit: input.limit,
        offset: input.offset,
      });
      const counts = await repo.countActiveChurchStaffRoles(client, churchId, organizationId);
      const total = rows.length ? Number(rows[0].total_count) || rows.length : 0;
      return {
        ok: true,
        status: STATUS.OK,
        roles: rows.map(mapRoleRow),
        total,
        counts,
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      roles: [],
      total: 0,
      counts: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   actorUserId: string,
 *   organizationId: string,
 *   organizationKey: string,
 *   churchId: string,
 *   churchKey: string,
 *   email: string,
 *   roleKey: string,
 *   branchKey?: string | null,
 *   confirmed: boolean,
 *   env?: NodeJS.ProcessEnv,
 * }} input
 */
async function assignHqChurchRole(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const organizationKey = String((input && input.organizationKey) || "")
    .trim()
    .toLowerCase();
  const churchId = String((input && input.churchId) || "").trim();
  const churchKey = String((input && input.churchKey) || "")
    .trim()
    .toLowerCase();
  const email = normalizeEmail(input && input.email);
  const roleKey = String((input && input.roleKey) || "")
    .trim()
    .toLowerCase();
  const branchKey =
    input && input.branchKey != null
      ? String(input.branchKey).trim().toLowerCase()
      : "";

  if (!UUID_RE.test(actorUserId) || !UUID_RE.test(organizationId) || !UUID_RE.test(churchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, role: null, reason: "scope" };
  }
  if (!organizationKey || !churchKey || !email) {
    return { ok: false, status: STATUS.INVALID_INPUT, role: null, reason: "fields" };
  }
  if (roleKey === "platform_admin") {
    return { ok: false, status: STATUS.FORBIDDEN, role: null, reason: "platform_admin_forbidden" };
  }
  if (!HQ_ASSIGNABLE_ROLES.includes(roleKey)) {
    return { ok: false, status: STATUS.INVALID_INPUT, role: null, reason: "role_key" };
  }
  if (roleKey === "church_hq_admin" && branchKey) {
    return { ok: false, status: STATUS.INVALID_INPUT, role: null, reason: "hq_scope" };
  }
  if (roleKey === "branch_admin" && !branchKey) {
    return { ok: false, status: STATUS.INVALID_INPUT, role: null, reason: "branch_required" };
  }
  if (input.confirmed !== true) {
    return { ok: false, status: STATUS.CONFIRMATION_REQUIRED, role: null, reason: "confirm" };
  }

  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const organization = await repo.findOrganizationByKey(client, organizationKey);
        if (!organization || String(organization.id) !== organizationId) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.FORBIDDEN, role: null, reason: "organization" };
        }
        const church = await repo.findChurchByKey(client, churchKey);
        if (
          !church ||
          String(church.id) !== churchId ||
          String(church.organization_id) !== organizationId
        ) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.FORBIDDEN, role: null, reason: "church" };
        }

        const user = await repo.findUserByEmail(client, email);
        if (!user) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, role: null, reason: "user" };
        }
        if (String(user.status) !== "active") {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.FORBIDDEN, role: null, reason: "user_inactive" };
        }
        if (String(user.id) === actorUserId) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.FORBIDDEN, role: null, reason: "self_escalation" };
        }

        let branchId = null;
        if (roleKey === "branch_admin") {
          const branch = await repo.findBranchByChurchAndKey(client, churchId, branchKey);
          if (!branch || String(branch.status) !== "active") {
            await client.query("ROLLBACK");
            return { ok: false, status: STATUS.NOT_FOUND, role: null, reason: "branch" };
          }
          branchId = branch.id;
        }

        const existingStaff = await client.query(
          `SELECT 1 FROM blessboard.user_roles
            WHERE user_id = $1 AND organization_id = $2 AND status = 'active'
              AND role_key IN ('platform_admin', 'church_hq_admin', 'branch_admin')
            LIMIT 1`,
          [user.id, organizationId]
        );
        const existing = await repo.findRole(client, {
          userId: user.id,
          organizationId,
          churchId,
          branchId,
          roleKey,
        });
        const countsAsNewStaff =
          existingStaff.rows.length === 0 && !(existing && String(existing.status) === "active");

        const staffGate = await evaluateStaffAccountLimit(client, {
          organizationId,
          countsAsNewStaff,
          countsAsNewUser: countsAsNewStaff,
        });
        if (!staffGate.ok) {
          await client.query("ROLLBACK");
          if (staffGate.status === ENT_STATUS.LIMIT_EXCEEDED) {
            return {
              ok: false,
              status: STATUS.LIMIT_EXCEEDED,
              role: null,
              reason: staffGate.reason || "max_staff_accounts",
            };
          }
          return { ok: false, status: STATUS.FORBIDDEN, role: null, reason: "entitlement" };
        }

        let roleRow;
        let outcome = "assigned";
        if (existing) {
          if (String(existing.status) === "active") {
            await client.query("COMMIT");
            return {
              ok: true,
              status: STATUS.OK,
              role: mapRoleRow({
                ...existing,
                email_display: user.email_display,
                user_display_name: user.display_name,
                user_status: user.status,
              }),
              alreadyAssigned: true,
            };
          }
          roleRow = await repo.updateRoleStatus(client, existing.id, "active");
          outcome = "reactivated";
        } else {
          roleRow = await repo.insertRole(client, {
            userId: user.id,
            organizationId,
            churchId,
            branchId,
            roleKey,
          });
        }

        await recordBlessBoardAudit(client, {
          organizationId,
          churchId,
          branchId,
          actorUserId,
          actionKey: "role.assigned",
          entityType: "user_role",
          entityId: roleRow.id,
          outcome: "success",
          metadata: {
            role_key: roleKey,
            branch_key: branchKey || null,
            outcome,
            reason_code: outcome,
          },
          env: input.env,
        });

        await client.query("COMMIT");
        return {
          ok: true,
          status: STATUS.OK,
          role: mapRoleRow({
            ...roleRow,
            email_display: user.email_display,
            user_display_name: user.display_name,
            user_status: user.status,
          }),
          alreadyAssigned: false,
        };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        if (repo.isUniqueViolation(err)) {
          return { ok: false, status: STATUS.CONFLICT, role: null, reason: "duplicate" };
        }
        throw err;
      }
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      role: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   actorUserId: string,
 *   organizationId: string,
 *   churchId: string,
 *   roleId: string,
 *   confirmed: boolean,
 *   env?: NodeJS.ProcessEnv,
 * }} input
 */
async function revokeHqChurchRole(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const roleId = String((input && input.roleId) || "").trim();
  if (
    !UUID_RE.test(actorUserId) ||
    !UUID_RE.test(organizationId) ||
    !UUID_RE.test(churchId) ||
    !UUID_RE.test(roleId)
  ) {
    return { ok: false, status: STATUS.INVALID_INPUT, role: null, reason: "scope" };
  }
  if (input.confirmed !== true) {
    return { ok: false, status: STATUS.CONFIRMATION_REQUIRED, role: null, reason: "confirm" };
  }

  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const existing = await repo.findRoleById(client, roleId);
        if (!existing) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, role: null, reason: "role" };
        }
        if (
          String(existing.organization_id) !== organizationId ||
          String(existing.church_id) !== churchId
        ) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.FORBIDDEN, role: null, reason: "cross_church" };
        }
        if (!HQ_ASSIGNABLE_ROLES.includes(String(existing.role_key))) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.FORBIDDEN, role: null, reason: "role_key" };
        }
        if (String(existing.user_id) === actorUserId) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.FORBIDDEN, role: null, reason: "self_escalation" };
        }
        if (String(existing.status) !== "active") {
          await client.query("COMMIT");
          return { ok: true, status: STATUS.OK, role: mapRoleRow(existing), alreadyRevoked: true };
        }

        if (String(existing.role_key) === "church_hq_admin") {
          const lastAdmin = await assertNotLastHqAdminRemoval(client, {
            organizationId,
            churchId,
            userId: existing.user_id,
            excludeLegacyRoleId: roleId,
            grant: { roleKey: "church_hq_admin", scopeType: "church" },
          });
          if (!lastAdmin.ok) {
            await client.query("ROLLBACK");
            return {
              ok: false,
              status: STATUS.FORBIDDEN,
              role: null,
              reason: lastAdmin.reason || "last_hq_admin",
            };
          }
        }

        const roleRow = await repo.updateRoleStatus(client, roleId, "inactive");
        await recordBlessBoardAudit(client, {
          organizationId,
          churchId,
          branchId: existing.branch_id,
          actorUserId,
          actionKey: "role.revoked",
          entityType: "user_role",
          entityId: roleId,
          outcome: "success",
          metadata: {
            reason_code: String(existing.role_key),
            branch_key: null,
          },
          env: input.env,
        });
        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, role: mapRoleRow(roleRow), alreadyRevoked: false };
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
      role: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

module.exports = {
  STATUS,
  HQ_ASSIGNABLE_ROLES,
  listHqChurchRoles,
  assignHqChurchRole,
  revokeHqChurchRole,
};
