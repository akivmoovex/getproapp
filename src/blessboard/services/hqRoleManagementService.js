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
const {
  createRoleAssignment,
  revokeRoleAssignment,
} = require("./blessBoardRoleAssignmentService");
const rbacRepo = require("../repositories/blessBoardRbacRepository");

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
  const actorUserId = String(input?.actorUserId || '').trim();
  const organizationId = String(input?.organizationId || '').trim();
  const churchId = String(input?.churchId || '').trim();
  if (!UUID_RE.test(actorUserId) || !UUID_RE.test(organizationId) || !UUID_RE.test(churchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, roles: [], total: 0, counts: null, reason: 'scope' };
  }
  try {
    const rows = await rbacRepo.listAssignmentsForChurch(db, {
      organizationId, churchId,
      scopeType: input.roleKey === 'branch_admin' ? 'branch' : undefined,
    });
    const roles = rows.filter((a) => ['organisation_administrator', 'branch_administrator'].includes(a.roleKey))
      .map((a) => ({
        id: a.id, userId: a.userId, organizationId: a.organizationId, churchId: a.churchId,
        branchId: a.scopeType === 'branch' ? a.scopeId : null,
        roleKey: a.roleKey === 'organisation_administrator' ? 'church_hq_admin' : 'branch_admin',
        status: a.status,
      }));
    return { ok: true, status: STATUS.OK, roles, total: roles.length, counts: null };
  } catch (err) {
    return { ok: false, status: STATUS.LOOKUP_ERROR, roles: [], total: 0, counts: null, reason: err.message || 'error' };
  }
}

async function assignHqChurchRole(db, input) {
  const actorUserId = String(input?.actorUserId || '').trim();
  const organizationId = String(input?.organizationId || '').trim();
  const organizationKey = String(input?.organizationKey || '').trim().toLowerCase();
  const churchId = String(input?.churchId || '').trim();
  const churchKey = String(input?.churchKey || '').trim().toLowerCase();
  const email = normalizeEmail(input?.email);
  const roleKey = String(input?.roleKey || '').trim().toLowerCase();
  const branchKey = String(input?.branchKey || '').trim().toLowerCase();
  if (!UUID_RE.test(actorUserId) || !UUID_RE.test(organizationId) || !UUID_RE.test(churchId) || !organizationKey || !churchKey || !email) {
    return { ok: false, status: STATUS.INVALID_INPUT, role: null, reason: 'fields' };
  }
  if (input.confirmed !== true) return { ok: false, status: STATUS.CONFIRMATION_REQUIRED, role: null, reason: 'confirm' };
  if (roleKey === 'platform_admin') return { ok: false, status: STATUS.FORBIDDEN, role: null, reason: 'platform_admin_forbidden' };
  const canonicalRole = roleKey === 'church_hq_admin' ? 'organisation_administrator' : roleKey === 'branch_admin' ? 'branch_administrator' : null;
  if (!canonicalRole) return { ok: false, status: STATUS.INVALID_INPUT, role: null, reason: 'role_key' };
  const user = await repo.findUserByEmail(db, email);
  if (!user) return { ok: false, status: STATUS.NOT_FOUND, role: null, reason: 'user' };
  if (String(user.status) !== 'active') return { ok: false, status: STATUS.FORBIDDEN, role: null, reason: 'user_inactive' };
  const church = await repo.findChurchByKey(db, churchKey);
  if (!church || String(church.id) !== churchId || String(church.organization_id) !== organizationId) return { ok: false, status: STATUS.FORBIDDEN, role: null, reason: 'church' };
  let scopeType = 'church'; let scopeId = churchId; let branchId = null;
  if (canonicalRole === 'branch_administrator') {
    if (!branchKey) return { ok: false, status: STATUS.INVALID_INPUT, role: null, reason: 'branch_required' };
    const branch = await repo.findBranchByChurchAndKey(db, churchId, branchKey);
    if (!branch || String(branch.status) !== 'active') return { ok: false, status: STATUS.NOT_FOUND, role: null, reason: 'branch' };
    scopeType = 'branch'; scopeId = branch.id; branchId = branch.id;
  }
  const result = await createRoleAssignment(db, {
    actorUserId, userId: user.id, roleKey: canonicalRole, organizationId, churchId,
    scopeType, scopeId, actorChurchId: churchId, assignmentOrigin: 'manual',
    assignmentReason: 'hq_role_management', forbidPlatformScope: true,
    tenantContext: { resolved: true, organization: { id: organizationId }, church: { id: churchId }, primaryBranch: branchId ? { id: branchId } : null },
  });
  if (!result.ok) return { ok: false, status: result.status === 'forbidden' ? STATUS.FORBIDDEN : STATUS.INVALID_INPUT, role: null, reason: result.reason === 'self_elevation' ? 'self_escalation' : result.reason };
  return { ok: true, status: STATUS.OK, alreadyAssigned: result.idempotent === true, role: { id: result.assignment.id, userId: user.id, organizationId, churchId, branchId, roleKey, status: 'active' } };
}

async function revokeHqChurchRole(db, input) {
  const actorUserId = String(input?.actorUserId || '').trim();
  const organizationId = String(input?.organizationId || '').trim();
  const churchId = String(input?.churchId || '').trim();
  const roleId = String(input?.roleId || '').trim();
  if (!UUID_RE.test(actorUserId) || !UUID_RE.test(organizationId) || !UUID_RE.test(churchId) || !UUID_RE.test(roleId)) return { ok: false, status: STATUS.INVALID_INPUT, role: null, reason: 'scope' };
  if (input.confirmed !== true) return { ok: false, status: STATUS.CONFIRMATION_REQUIRED, role: null, reason: 'confirm' };
  const result = await revokeRoleAssignment(db, {
    actorUserId, assignmentId: roleId, actorChurchId: churchId, revocationReason: 'hq_role_management',
    tenantContext: { resolved: true, organization: { id: organizationId }, church: { id: churchId } },
  });
  if (!result.ok) return { ok: false, status: result.status === 'forbidden' ? STATUS.FORBIDDEN : STATUS.NOT_FOUND, role: null, reason: result.reason === 'self_elevation' ? 'self_escalation' : result.reason };
  return { ok: true, status: STATUS.OK, role: result.assignment, alreadyRevoked: false };
}

module.exports = {
  STATUS,
  HQ_ASSIGNABLE_ROLES: Object.freeze(['church_hq_admin', 'branch_admin']),
  listHqChurchRoles,
  assignHqChurchRole,
  revokeHqChurchRole,
};
