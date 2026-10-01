"use strict";

/**
 * Shared V5 session establishment after identity is already trusted
 * (password verified, or post-provision auto-login).
 * Login eligibility: catalogue user_role_assignments (+ optional member scope).
 * Does not depend on blessboard.user_roles.
 *
 * Tenant context (organization / church / branch) always comes from the preferred
 * catalogue (or member) role after optional requireOrganizationId scoping —
 * the same path used by normal password login. Callers must not inject a second
 * forced church/branch algorithm.
 */

const repo = require("../repositories/blessBoardAuthRepository");
const memberRepo = require("../repositories/memberIdentityRepository");
const { createV5Session } = require("../../platform/session/createV5Session");
const {
  listCatalogueLoginRolesForUser,
  preferCatalogueSessionRole,
} = require("./blessBoardCatalogueLogin");

const STATUS = Object.freeze({
  AUTHENTICATED: "authenticated",
  INVALID_INPUT: "invalid_input",
  NO_ACTIVE_ROLE: "no_active_role",
  USER_NOT_FOUND: "user_not_found",
  TRANSACTION_ERROR: "transaction_error",
  SESSION_CREATE_FAILED: "session_create_failed",
});

/**
 * Safe classification for logs — no tokens, passwords, or PII payloads.
 * @param {unknown} err
 */
function classifyEstablishSessionError(err) {
  if (!err || typeof err !== "object") {
    return {
      code: "unknown_throw",
      message: "transaction_error",
      pgCode: null,
      constraint: null,
    };
  }
  const pgCode = err.code != null ? String(err.code).slice(0, 32) : null;
  const constraint =
    err.constraint != null ? String(err.constraint).slice(0, 120) : null;
  const rawMessage = err.message != null ? String(err.message) : "";
  // Strip anything that looks like a bearer/session token from messages.
  const scrubbed = rawMessage
    .replace(/[A-Za-z0-9_-]{40,}/g, "[redacted]")
    .slice(0, 160);
  let code = "query_error";
  if (pgCode === "23503") code = "fk_violation";
  else if (pgCode === "23505") code = "unique_violation";
  else if (pgCode === "23514") code = "check_violation";
  else if (pgCode === "25P02") code = "failed_transaction";
  else if (pgCode === "40001" || pgCode === "40P01") code = "serialization_failure";
  else if (/timeout|ECONN|ENOTFOUND|connection/i.test(scrubbed)) code = "connectivity";
  return {
    code,
    message: scrubbed || "transaction_error",
    pgCode,
    constraint,
  };
}

/**
 * @deprecated Legacy helper retained for callers that still pass role arrays.
 * Platform_admin org bypass removed — catalogue platform_administrator is org-agnostic via preferCatalogueSessionRole.
 * @param {Array<{ role_key: string, organization_id: string, church_id: string | null, branch_id: string | null }>} roles
 * @param {string | null} requireOrganizationId
 */
function rolesApplicableToOrganization(roles, requireOrganizationId) {
  if (!requireOrganizationId) return roles;
  const orgId = String(requireOrganizationId);
  return (roles || []).filter((r) => {
    const key = String(r.role_key || "");
    if (key === "platform_administrator") return true;
    return String(r.organization_id || "") === orgId;
  });
}

/**
 * @deprecated Prefer preferCatalogueSessionRole. Kept for test/compat imports.
 */
function preferSessionRole(roles, requireOrganizationId) {
  return preferCatalogueSessionRole(roles, requireOrganizationId);
}

/**
 * Active member membership for an organization (not a user_roles row).
 * @param {{ query: Function }} client
 * @param {string} userId
 * @param {string} organizationId
 */
async function resolveMemberScopeForOrganization(client, userId, organizationId) {
  const scope = await client.query(
    `SELECT c.id AS church_id, b.id AS branch_id
       FROM blessboard.churches c
       INNER JOIN blessboard.branches b
         ON b.church_id = c.id AND b.status = 'active'
      WHERE c.organization_id = $1
        AND c.status = 'active'
      ORDER BY CASE WHEN lower(b.branch_key) = 'hq' THEN 0 ELSE 1 END, b.created_at ASC
      LIMIT 8`,
    [organizationId]
  );
  for (const row of scope.rows || []) {
    const member = await memberRepo.findActiveMemberByUserId(client, {
      churchId: row.church_id,
      userId,
    });
    if (!member) continue;
    const membership = await memberRepo.findMembership(client, member.id, row.branch_id);
    if (membership && membership.membershipStatus === "active") {
      return {
        organization_id: organizationId,
        church_id: row.church_id,
        branch_id: row.branch_id,
        role_key: "member",
        memberId: member.id,
        source: "member",
      };
    }
  }
  return null;
}

/**
 * Canonical tenant ids for a new deployment session — catalogue/member preferred only.
 * @param {{ organization_id?: string, church_id?: string|null, branch_id?: string|null }} preferred
 */
function sessionTenantContextFromPreferred(preferred) {
  if (!preferred || typeof preferred !== "object") {
    return { organizationId: null, churchId: null, branchId: null };
  }
  return {
    organizationId: preferred.organization_id || null,
    churchId: preferred.church_id || null,
    branchId: preferred.branch_id || null,
  };
}

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{
 *   userId: string,
 *   deploymentCode: string,
 *   requireOrganizationId?: string | null,
 *   organizationId?: string | null,
 *   churchId?: string | null,
 *   branchId?: string | null,
 *   ip?: string | null,
 *   userAgent?: string | null,
 *   createSession?: typeof createV5Session,
 * }} input
 */
async function establishBlessBoardSession(db, input) {
  const userId = String((input && input.userId) || "").trim();
  const deploymentCode = String((input && input.deploymentCode) || "")
    .trim()
    .toLowerCase();
  // Scope role selection only. Do not treat organizationId as a forced session
  // tenant override — login and registration both derive session tenant from
  // preferCatalogueSessionRole / member scope.
  const requireOrganizationId =
    input && input.requireOrganizationId != null && String(input.requireOrganizationId).trim() !== ""
      ? String(input.requireOrganizationId).trim()
      : null;
  const createSession = (input && input.createSession) || createV5Session;

  if (!userId || !deploymentCode) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input", session: null, user: null };
  }
  if (!db || (typeof db.connect !== "function" && typeof db.query !== "function")) {
    return {
      ok: false,
      status: STATUS.TRANSACTION_ERROR,
      message: "database required",
      failureCode: "database_required",
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

    const user = await repo.findUserById(client, userId);
    if (!user || String(user.status) !== "active") {
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: STATUS.USER_NOT_FOUND,
        message: "user_not_found",
        session: null,
        user: null,
      };
    }

    const catalogueRoles = await listCatalogueLoginRolesForUser(
      client,
      user.id,
      requireOrganizationId
    );
    const applicable = rolesApplicableToOrganization(catalogueRoles, requireOrganizationId);
    let memberScope = null;
    if (requireOrganizationId) {
      memberScope = await resolveMemberScopeForOrganization(client, user.id, requireOrganizationId);
    }
    if (!applicable.length && !memberScope) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: STATUS.NO_ACTIVE_ROLE,
        message: "no_active_role",
        session: null,
        user: null,
      };
    }

    const preferred =
      preferCatalogueSessionRole(applicable, requireOrganizationId) || memberScope;
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

    const tenant = sessionTenantContextFromPreferred(preferred);
    const created = await createSession(client, {
      deploymentCode,
      userId: user.id,
      organizationId: tenant.organizationId,
      churchId: tenant.churchId,
      branchId: tenant.branchId,
      ip: input.ip || null,
      userAgent: input.userAgent || null,
    });
    if (!created.ok) {
      await client.query("ROLLBACK");
      const createCode = String(created.code || "session_create_failed").slice(0, 80);
      return {
        ok: false,
        status: STATUS.SESSION_CREATE_FAILED,
        message: createCode,
        failureCode: createCode,
        session: null,
        user: null,
      };
    }

    await repo.touchLastLogin(client, user.id);
    await client.query("COMMIT");

    const rolePayload = applicable.map((r) => ({
      roleKey: r.role_key,
      organizationId: r.organization_id,
      churchId: r.church_id,
      branchId: r.branch_id,
      scopeType: r.scope_type || null,
      source: r.source || "catalogue",
    }));
    if (memberScope) {
      rolePayload.push({
        roleKey: "member",
        organizationId: memberScope.organization_id,
        churchId: memberScope.church_id,
        branchId: memberScope.branch_id,
        source: "member",
      });
    }

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
      roles: rolePayload,
      preferredRoleKey: preferred.role_key,
      tenantContext: tenant,
    };
  } catch (err) {
    try {
      if (client) await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    const classified = classifyEstablishSessionError(err);
    return {
      ok: false,
      status: STATUS.TRANSACTION_ERROR,
      message: classified.message,
      failureCode: classified.code,
      pgCode: classified.pgCode,
      constraint: classified.constraint,
      session: null,
      user: null,
    };
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

module.exports = {
  STATUS,
  establishBlessBoardSession,
  rolesApplicableToOrganization,
  preferSessionRole,
  resolveMemberScopeForOrganization,
  sessionTenantContextFromPreferred,
  classifyEstablishSessionError,
};
