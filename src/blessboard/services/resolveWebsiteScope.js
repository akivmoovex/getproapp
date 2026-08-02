"use strict";

/**
 * Single server-side website scope resolver for editors, previews, and drafts.
 *
 * Church-wide website: branchId = null, scopeType = "church"
 * Branch mini website: explicit authorized branchId, scopeType = "branch"
 *
 * organizationId / churchId are always taken from the trusted resolved tenant —
 * never from client body, query, or path as authority. Callers may pass those
 * fields for documentation, but tenant wins.
 */

const authzRepo = require("../repositories/blessBoardAuthorizationRepository");
const branchRepo = require("../repositories/blessBoardBranchRepository");
const {
  resolveBlessBoardBranchForChurch,
  normalizeBranchKey,
  STATUS: BRANCH_STATUS,
} = require("./listBlessBoardBranches");
const {
  authorizeBlessBoardTenantAccess,
  uuidEqual,
  STATUS: AUTHZ_STATUS,
} = require("./authorizeBlessBoardTenantAccess");

const STATUS = Object.freeze({
  OK: "ok",
  UNAUTHENTICATED: "unauthenticated",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  TENANT_UNRESOLVED: "tenant_unresolved",
  LOOKUP_ERROR: "lookup_error",
  INVALID_INPUT: "invalid_input",
});

const SCOPE_TYPE = Object.freeze({
  CHURCH: "church",
  BRANCH: "branch",
});

/**
 * @param {object | null | undefined} tenant
 */
function trustedTenantIds(tenant) {
  if (!tenant || tenant.resolved !== true) return null;
  const organizationId = tenant.organization && tenant.organization.id;
  const churchId = tenant.church && tenant.church.id;
  if (!organizationId || !churchId) return null;
  return {
    organizationId: String(organizationId),
    churchId: String(churchId),
  };
}

/**
 * @param {string | { id?: string, userId?: string } | null | undefined} authenticatedUser
 */
function resolveUserId(authenticatedUser) {
  if (authenticatedUser == null) return null;
  if (typeof authenticatedUser === "string") {
    const id = authenticatedUser.trim();
    return id || null;
  }
  if (typeof authenticatedUser === "object") {
    const raw = authenticatedUser.userId || authenticatedUser.id || null;
    if (raw == null) return null;
    const id = String(raw).trim();
    return id || null;
  }
  return null;
}

/**
 * @param {object} row
 */
function mapBranchDto(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    key: String(row.branch_key || row.key || ""),
    displayName: String(row.display_name || row.displayName || ""),
    branchType: String(row.branch_type || row.branchType || ""),
    isPrimary: Boolean(row.is_primary != null ? row.is_primary : row.isPrimary),
  };
}

/**
 * @param {object} partial
 */
function fail(partial) {
  return {
    ok: false,
    status: partial.status,
    message: partial.message || partial.status,
    organizationId: partial.organizationId || null,
    churchId: partial.churchId || null,
    branchId: null,
    branchKey: null,
    branch: null,
    scopeType: null,
    httpStatus: partial.httpStatus || null,
  };
}

/**
 * @param {Array<{ roleKey: string, organizationId: string, churchId: string|null, branchId: string|null }>} roles
 * @param {{ organizationId: string, churchId: string }} ids
 */
function classifyEditorRoles(roles, ids) {
  let isPlatform = false;
  let isHq = false;
  /** @type {string[]} */
  const assignedBranchIds = [];
  for (const role of roles || []) {
    const key = String(role.roleKey || "");
    if (key === "platform_admin") {
      isPlatform = true;
      continue;
    }
    if (key === "church_hq_admin") {
      if (
        uuidEqual(role.organizationId, ids.organizationId) &&
        uuidEqual(role.churchId, ids.churchId)
      ) {
        isHq = true;
      }
      continue;
    }
    if (key === "branch_admin") {
      if (
        role.branchId &&
        uuidEqual(role.organizationId, ids.organizationId) &&
        uuidEqual(role.churchId, ids.churchId)
      ) {
        assignedBranchIds.push(String(role.branchId));
      }
    }
  }
  return {
    isHqEditor: isPlatform || isHq,
    isBranchEditor: assignedBranchIds.length > 0,
    assignedBranchIds,
  };
}

/**
 * Resolve website scope for editors / previews / drafts.
 *
 * @param {{ query: Function }} db
 * @param {{
 *   tenant: object,
 *   authenticatedUser?: string | { id?: string, userId?: string } | null,
 *   requestedBranchKey?: string | null,
 *   organizationId?: string | null,
 *   churchId?: string | null,
 * }} input
 *
 * Contract (trusted fields come from tenant):
 *   resolveWebsiteScope({ organizationId, churchId, requestedBranchKey, authenticatedUser })
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   status: string,
 *   message?: string,
 *   organizationId: string|null,
 *   churchId: string|null,
 *   branchId: string|null,
 *   branchKey: string|null,
 *   branch: object|null,
 *   scopeType: "church"|"branch"|null,
 *   httpStatus?: number|null,
 * }>}
 */
async function resolveWebsiteScope(db, input) {
  const opts = input && typeof input === "object" ? input : {};
  const userId = resolveUserId(opts.authenticatedUser);
  if (!userId) {
    return fail({ status: STATUS.UNAUTHENTICATED, httpStatus: 401 });
  }

  const ids = trustedTenantIds(opts.tenant);
  if (!ids) {
    return fail({ status: STATUS.TENANT_UNRESOLVED, httpStatus: 403 });
  }

  // Client-supplied organizationId / churchId are never authoritative.
  // If present, they must match the trusted tenant or the request is denied.
  if (
    opts.organizationId != null &&
    String(opts.organizationId).trim() !== "" &&
    !uuidEqual(opts.organizationId, ids.organizationId)
  ) {
    return fail({
      status: STATUS.NOT_FOUND,
      httpStatus: 404,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      message: "not_found",
    });
  }
  if (
    opts.churchId != null &&
    String(opts.churchId).trim() !== "" &&
    !uuidEqual(opts.churchId, ids.churchId)
  ) {
    return fail({
      status: STATUS.NOT_FOUND,
      httpStatus: 404,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      message: "not_found",
    });
  }

  if (!db || typeof db.query !== "function") {
    return fail({
      status: STATUS.LOOKUP_ERROR,
      httpStatus: 503,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
    });
  }

  const rawKey =
    opts.requestedBranchKey != null && String(opts.requestedBranchKey).trim() !== ""
      ? String(opts.requestedBranchKey)
      : null;
  const wantsChurchWide = rawKey == null;
  const normalizedKey = rawKey ? normalizeBranchKey(rawKey) : null;
  if (rawKey && !normalizedKey) {
    return fail({
      status: STATUS.NOT_FOUND,
      httpStatus: 404,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      message: "not_found",
    });
  }

  try {
    const user = await authzRepo.findUserStatusById(db, userId);
    if (!user || String(user.status) !== "active") {
      return fail({
        status: STATUS.FORBIDDEN,
        httpStatus: 403,
        organizationId: ids.organizationId,
        churchId: ids.churchId,
        message: "forbidden",
      });
    }

    const roles = await authzRepo.listActiveAuthorizationRoles(db, userId);
    const classified = classifyEditorRoles(roles, ids);

    // Permission-based website editors (RBAC website_editor / website_publisher, etc.)
    try {
      const {
        listEffectivePermissions,
      } = require("./blessBoardRbacAuthorizationService");
      const churchPerms = await listEffectivePermissions(db, {
        actor: { userId },
        tenantContext: opts.tenant,
        resourceContext: {
          organizationId: ids.organizationId,
          churchId: ids.churchId,
          branchId: null,
        },
      });
      const churchKeys = new Set(churchPerms.permissions || []);
      if (
        churchKeys.has("website.view") ||
        churchKeys.has("website.edit") ||
        churchKeys.has("website.publish")
      ) {
        classified.isHqEditor = true;
      }

      if (!classified.isHqEditor) {
        const rbacRepo = require("../repositories/blessBoardRbacRepository");
        const assignments = await rbacRepo.listActiveAssignmentsForUser(
          db,
          userId,
          ids.organizationId
        );
        for (const assignment of assignments) {
          if (String(assignment.scopeType) !== "branch" || !assignment.scopeId) continue;
          const branchPerms = await listEffectivePermissions(db, {
            actor: { userId },
            tenantContext: opts.tenant,
            resourceContext: {
              organizationId: ids.organizationId,
              churchId: ids.churchId,
              branchId: assignment.scopeId,
            },
          });
          const keys = new Set(branchPerms.permissions || []);
          if (
            keys.has("website.view") ||
            keys.has("website.edit") ||
            keys.has("website.publish")
          ) {
            classified.isBranchEditor = true;
            const bid = String(assignment.scopeId);
            if (!classified.assignedBranchIds.includes(bid)) {
              classified.assignedBranchIds.push(bid);
            }
          }
        }
      }
    } catch {
      /* permission expansion is best-effort; legacy roles still apply */
    }

    if (!classified.isHqEditor && !classified.isBranchEditor) {
      return fail({
        status: STATUS.FORBIDDEN,
        httpStatus: 403,
        organizationId: ids.organizationId,
        churchId: ids.churchId,
        message: "forbidden",
      });
    }

    // --- Church-wide (HQ / platform only) ---
    if (wantsChurchWide) {
      if (classified.isHqEditor) {
        return {
          ok: true,
          status: STATUS.OK,
          message: STATUS.OK,
          organizationId: ids.organizationId,
          churchId: ids.churchId,
          branchId: null,
          branchKey: null,
          branch: null,
          scopeType: SCOPE_TYPE.CHURCH,
          httpStatus: 200,
        };
      }

      // Branch Admin: never derive from primaryBranch — use assigned role branch.
      const assignedId = classified.assignedBranchIds[0] || null;
      if (!assignedId) {
        return fail({
          status: STATUS.NOT_FOUND,
          httpStatus: 404,
          organizationId: ids.organizationId,
          churchId: ids.churchId,
          message: "not_found",
        });
      }
      const assignedRow = await branchRepo.findActiveBranchByIdForChurch(
        db,
        assignedId,
        ids.churchId
      );
      if (!assignedRow) {
        return fail({
          status: STATUS.NOT_FOUND,
          httpStatus: 404,
          organizationId: ids.organizationId,
          churchId: ids.churchId,
          message: "not_found",
        });
      }
      const branch = mapBranchDto(assignedRow);
      return {
        ok: true,
        status: STATUS.OK,
        message: STATUS.OK,
        organizationId: ids.organizationId,
        churchId: ids.churchId,
        branchId: branch.id,
        branchKey: branch.key,
        branch,
        scopeType: SCOPE_TYPE.BRANCH,
        httpStatus: 200,
      };
    }

    // --- Explicit branch key ---
    const resolved = await resolveBlessBoardBranchForChurch(db, ids.churchId, normalizedKey);
    if (!resolved.ok || !resolved.branch) {
      const lookup =
        resolved.status === BRANCH_STATUS.LOOKUP_ERROR
          ? STATUS.LOOKUP_ERROR
          : STATUS.NOT_FOUND;
      return fail({
        status: lookup,
        httpStatus: lookup === STATUS.LOOKUP_ERROR ? 503 : 404,
        organizationId: ids.organizationId,
        churchId: ids.churchId,
        message: "not_found",
      });
    }

    const targetBranch = resolved.branch;

    if (classified.isHqEditor) {
      const authz = await authorizeBlessBoardTenantAccess(db, {
        userId,
        tenant: opts.tenant,
        branchId: targetBranch.id,
      });
      if (authz.status === AUTHZ_STATUS.LOOKUP_ERROR) {
        return fail({
          status: STATUS.LOOKUP_ERROR,
          httpStatus: 503,
          organizationId: ids.organizationId,
          churchId: ids.churchId,
        });
      }
      if (!authz.ok) {
        // Same-church but unauthorized / inactive → non-disclosure 404
        return fail({
          status: STATUS.NOT_FOUND,
          httpStatus: 404,
          organizationId: ids.organizationId,
          churchId: ids.churchId,
          message: "not_found",
        });
      }
      return {
        ok: true,
        status: STATUS.OK,
        message: STATUS.OK,
        organizationId: ids.organizationId,
        churchId: ids.churchId,
        branchId: targetBranch.id,
        branchKey: targetBranch.key,
        branch: targetBranch,
        scopeType: SCOPE_TYPE.BRANCH,
        httpStatus: 200,
      };
    }

    // Branch Admin: only assigned branch (never primaryBranch fallback)
    const allowed = classified.assignedBranchIds.some((id) => uuidEqual(id, targetBranch.id));
    if (!allowed) {
      return fail({
        status: STATUS.NOT_FOUND,
        httpStatus: 404,
        organizationId: ids.organizationId,
        churchId: ids.churchId,
        message: "not_found",
      });
    }

    return {
      ok: true,
      status: STATUS.OK,
      message: STATUS.OK,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
      branchId: targetBranch.id,
      branchKey: targetBranch.key,
      branch: targetBranch,
      scopeType: SCOPE_TYPE.BRANCH,
      httpStatus: 200,
    };
  } catch {
    return fail({
      status: STATUS.LOOKUP_ERROR,
      httpStatus: 503,
      organizationId: ids.organizationId,
      churchId: ids.churchId,
    });
  }
}

module.exports = {
  STATUS,
  SCOPE_TYPE,
  resolveWebsiteScope,
  trustedTenantIds,
  resolveUserId,
  classifyEditorRoles,
};
