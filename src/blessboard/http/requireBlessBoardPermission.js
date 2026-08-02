"use strict";

/**
 * Permission middleware for BlessBoard tenant routes.
 * Use after session + tenant resolution. Small opt-in surface only.
 */

const {
  authorize,
  REASON,
} = require("../services/blessBoardRbacAuthorizationService");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { recordBlessBoardAudit } = require("../services/recordBlessBoardAudit");

function sendControlled(status, message, req, res) {
  const wantsHtml = String(req.get("accept") || "").includes("text/html");
  if (wantsHtml) {
    if (status === 401) {
      const next = encodeURIComponent(req.originalUrl || req.url || "/");
      return res.redirect(303, `/login?next=${next}`);
    }
    return res.status(status).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Access</title></head>
<body><p>${message}</p></body></html>`);
  }
  return res.status(status).type("text").send(message);
}

/**
 * Church-wide HQ resource context. Explicit branchId: null excludes branch-only grants
 * (including primary-branch branch_admin) from HQ surfaces.
 * @param {import('express').Request} _req
 * @param {object} tenant
 */
function resolveChurchWideResourceContext(_req, tenant) {
  return {
    organizationId: tenant.organization.id,
    churchId: tenant.church.id,
    branchId: null,
  };
}

/**
 * Host primary-branch resource context for Branch Admin surfaces.
 * @param {import('express').Request} _req
 * @param {object} tenant
 */
function resolveHostBranchResourceContext(_req, tenant) {
  return {
    organizationId: tenant.organization.id,
    churchId: tenant.church.id,
    branchId: tenant.primaryBranch && tenant.primaryBranch.id ? tenant.primaryBranch.id : null,
  };
}

/**
 * @param {string} permissionKey
 * @param {(req: import('express').Request, tenant: object) => object | null | Promise<object|null>} [resolveResourceContext]
 * @param {{
 *   getPool?: () => { query: Function } | null | undefined,
 *   getTenant?: Function,
 *   concealAsNotFound?: boolean,
 *   scopeMode?: 'church'|'host_branch',
 * }} [deps]
 */
function createRequireBlessBoardPermission(permissionKey, resolveResourceContext, deps) {
  const options = deps && typeof deps === "object" ? deps : {};
  const getPool = options.getPool;
  const getTenant = options.getTenant || resolveTenantForAuthorization;
  const concealAsNotFound = options.concealAsNotFound === true;
  const key = String(permissionKey || "").trim();
  const scopeMode = options.scopeMode === "church" ? "church" : null;
  const effectiveResolve =
    typeof resolveResourceContext === "function"
      ? resolveResourceContext
      : scopeMode === "church"
        ? resolveChurchWideResourceContext
        : null;

  return async function requireBlessBoardPermission(req, res, next) {
    try {
      const session =
        req.v5Session && req.v5Session.authenticated && req.v5Session.session
          ? req.v5Session.session
          : null;
      if (!session || !session.userId) {
        return sendControlled(401, "Sign-in is required.", req, res);
      }

      const tenant = getTenant(req);
      if (!tenant || tenant.resolved !== true) {
        return sendControlled(
          concealAsNotFound ? 404 : 403,
          concealAsNotFound ? "Not found." : "You do not have access to this site.",
          req,
          res
        );
      }

      if (typeof getPool !== "function") {
        return sendControlled(503, "Access check is temporarily unavailable.", req, res);
      }
      const pool = getPool();
      if (!pool || typeof pool.query !== "function") {
        return sendControlled(503, "Access check is temporarily unavailable.", req, res);
      }

      let resourceContext = {
        organizationId: tenant.organization.id,
        churchId: tenant.church.id,
        branchId: tenant.primaryBranch && tenant.primaryBranch.id ? tenant.primaryBranch.id : null,
      };
      if (typeof effectiveResolve === "function") {
        const resolved = await effectiveResolve(req, tenant);
        if (resolved && typeof resolved === "object") {
          resourceContext = {
            organizationId: resolved.organizationId || resourceContext.organizationId,
            churchId: resolved.churchId || resourceContext.churchId,
            branchId:
              resolved.branchId !== undefined ? resolved.branchId : resourceContext.branchId,
            ministryId: resolved.ministryId || null,
            departmentId: resolved.departmentId || null,
            cellId: resolved.cellId || null,
            classId: resolved.classId || null,
            cohortId: resolved.cohortId || null,
            assignedMemberId: resolved.assignedMemberId || null,
            memberId: resolved.memberId || null,
            assignedCaseId: resolved.assignedCaseId || resolved.caseId || null,
            caseId: resolved.caseId || resolved.assignedCaseId || null,
          };
        }
      }

      // Ownership first: resource context must stay inside trusted tenant.
      if (
        String(resourceContext.organizationId) !== String(tenant.organization.id) ||
        String(resourceContext.churchId) !== String(tenant.church.id)
      ) {
        return sendControlled(
          concealAsNotFound ? 404 : 403,
          concealAsNotFound ? "Not found." : "You do not have access to this site.",
          req,
          res
        );
      }

      const result = await authorize(pool, {
        actor: { userId: session.userId },
        permission: key,
        tenantContext: tenant,
        resourceContext,
      });

      req.blessBoardPermissionDecision = {
        allowed: result.allowed,
        reasonCode: result.reasonCode,
        permission: result.permission,
      };

      if (result.reasonCode === REASON.LOOKUP_ERROR) {
        return sendControlled(503, "Access check is temporarily unavailable.", req, res);
      }
      if (
        result.reasonCode === REASON.UNAUTHENTICATED ||
        result.reasonCode === REASON.INACTIVE_USER
      ) {
        return sendControlled(401, "Sign-in is required.", req, res);
      }
      if (!result.allowed) {
        if (result._internal && result._internal.sensitiveDenial) {
          try {
            await recordBlessBoardAudit(pool, {
              organizationId: tenant.organization.id,
              churchId: tenant.church.id,
              branchId: resourceContext.branchId,
              actorUserId: session.userId,
              actionKey: "rbac.authorization.denied_sensitive",
              entityType: "permission",
              entityId: null,
              outcome: "denied",
              metadata: {
                permission_key: key,
                reason_code: result.reasonCode,
              },
            });
          } catch {
            // ignore audit failure
          }
        }
        return sendControlled(
          concealAsNotFound ? 404 : 403,
          concealAsNotFound ? "Not found." : "You do not have access to this site.",
          req,
          res
        );
      }

      return next();
    } catch {
      return sendControlled(503, "Access check is temporarily unavailable.", req, res);
    }
  };
}

module.exports = {
  createRequireBlessBoardPermission,
  resolveChurchWideResourceContext,
  resolveHostBranchResourceContext,
};
