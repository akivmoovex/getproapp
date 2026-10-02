"use strict";

/**
 * Shell entry middleware: allow when the actor has ANY of the listed permissions
 * under the given resource context. Does not grant module access by itself.
 */

const {
  listEffectivePermissions,
} = require("../services/blessBoardRbacAuthorizationService");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");

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
 * @param {readonly string[]|string[]} permissionKeys
 * @param {{
 *   getPool: () => { query: Function } | null | undefined,
 *   getTenant?: Function,
 *   resolveResourceContext?: (req: import('express').Request, tenant: object) => object | null | Promise<object|null>,
 *   denyMessage?: string,
 * }} deps
 */
function createRequireAnyBlessBoardPermission(permissionKeys, deps) {
  const options = deps && typeof deps === "object" ? deps : {};
  const getPool = options.getPool;
  const getTenant = options.getTenant || resolveTenantForAuthorization;
  const keys = (permissionKeys || []).map((k) => String(k || "").trim()).filter(Boolean);
  const denyMessage =
    options.denyMessage || "You do not have access to this workspace.";

  return async function requireAnyBlessBoardPermission(req, res, next) {
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
        return sendControlled(403, denyMessage, req, res);
      }

      if (typeof getPool !== "function") {
        return sendControlled(503, "Access check is temporarily unavailable.", req, res);
      }
      const pool = getPool();
      if (!pool || typeof pool.query !== "function") {
        return sendControlled(503, "Access check is temporarily unavailable.", req, res);
      }

      if (!keys.length) {
        return sendControlled(403, denyMessage, req, res);
      }

      let resourceContext = {
        organizationId: tenant.organization.id,
        churchId: tenant.church.id,
        branchId: tenant.primaryBranch && tenant.primaryBranch.id ? tenant.primaryBranch.id : null,
      };
      if (typeof options.resolveResourceContext === "function") {
        const resolved = await options.resolveResourceContext(req, tenant);
        if (resolved && typeof resolved === "object") {
          resourceContext = {
            organizationId: resolved.organizationId || resourceContext.organizationId,
            churchId: resolved.churchId || resourceContext.churchId,
            branchId:
              resolved.branchId !== undefined ? resolved.branchId : resourceContext.branchId,
          };
        }
      }

      if (
        String(resourceContext.organizationId) !== String(tenant.organization.id) ||
        String(resourceContext.churchId) !== String(tenant.church.id)
      ) {
        return sendControlled(403, denyMessage, req, res);
      }

      const listed = await listEffectivePermissions(pool, {
        actor: { userId: session.userId },
        tenantContext: tenant,
        resourceContext,
      });
      const effective = new Set(listed.permissions || []);
      const allowed = keys.some((k) => effective.has(k));
      if (!allowed) {
        return sendControlled(403, denyMessage, req, res);
      }

      req.blessBoardShellPermissions = effective;
      return next();
    } catch {
      return sendControlled(503, "Access check is temporarily unavailable.", req, res);
    }
  };
}

module.exports = {
  createRequireAnyBlessBoardPermission,
};
