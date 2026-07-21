"use strict";

/**
 * Fail-closed gate for protected BlessBoard tenant routes.
 * Uses attached authorization context when present; otherwise authorizes on demand.
 */

const {
  authorizeBlessBoardTenantAccess,
  STATUS,
} = require("../services/authorizeBlessBoardTenantAccess");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { formatRoleLabel } = require("./renderTenantLandingPage");

/**
 * @param {number} status
 * @param {string} message
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function sendControlled(status, message, req, res) {
  const wantsHtml = String(req.get("accept") || "").includes("text/html");
  if (wantsHtml) {
    return res.status(status).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Access</title></head>
<body><p>${message}</p></body></html>`);
  }
  return res.status(status).type("text").send(message);
}

/**
 * @param {{
 *   getPool?: () => { query: Function } | null | undefined,
 *   authorize?: Function,
 *   allowedRoles?: string[],
 *   getTenant?: Function,
 *   getBranchId?: Function,
 * }} [deps]
 */
function createRequireBlessBoardTenantRole(deps) {
  const options = deps && typeof deps === "object" ? deps : {};
  const getPool = options.getPool;
  const authorize = options.authorize || authorizeBlessBoardTenantAccess;
  const allowedRoles = Array.isArray(options.allowedRoles)
    ? options.allowedRoles.map((r) => String(r))
    : null;
  const getTenant = options.getTenant || resolveTenantForAuthorization;
  const getBranchId =
    options.getBranchId ||
    ((req, tenant) => {
      void req;
      if (!tenant || !tenant.primaryBranch) return null;
      return tenant.primaryBranch.id || null;
    });

  return async function requireBlessBoardTenantRole(req, res, next) {
    try {
      let ctx = req.blessBoardAuthorizationContext;

      if (!ctx) {
        const session =
          req.v5Session && req.v5Session.authenticated && req.v5Session.session
            ? req.v5Session.session
            : null;
        if (!session) {
          return sendControlled(401, "Sign-in is required.", req, res);
        }
        const tenant = getTenant(req);
        if (!tenant) {
          return sendControlled(403, "You do not have access to this site.", req, res);
        }
        if (typeof getPool !== "function") {
          return sendControlled(503, "Access check is temporarily unavailable.", req, res);
        }
        const pool = getPool();
        if (!pool || typeof pool.query !== "function") {
          return sendControlled(503, "Access check is temporarily unavailable.", req, res);
        }
        const result = await authorize(pool, {
          userId: session.userId,
          tenant,
          branchId: getBranchId(req, tenant),
        });
        ctx = { ...result.context, reason: result.status };
        req.blessBoardAuthorizationContext = ctx;

        if (result.status === STATUS.LOOKUP_ERROR) {
          return sendControlled(503, "Access check is temporarily unavailable.", req, res);
        }
        if (result.status === STATUS.UNAUTHENTICATED || result.status === STATUS.INACTIVE_USER) {
          return sendControlled(401, "Sign-in is required.", req, res);
        }
        if (!result.ok) {
          return sendControlled(403, "You do not have access to this site.", req, res);
        }
      } else {
        // Re-authorize when global middleware ran without a tenant (apex before session scope)
        // but a tenant is now attached.
        if (
          !ctx.authorized &&
          (ctx.reason === STATUS.TENANT_UNRESOLVED || ctx.reason === "tenant_unresolved") &&
          getTenant(req)
        ) {
          const session =
            req.v5Session && req.v5Session.authenticated && req.v5Session.session
              ? req.v5Session.session
              : null;
          if (!session) {
            return sendControlled(401, "Sign-in is required.", req, res);
          }
          if (typeof getPool !== "function") {
            return sendControlled(503, "Access check is temporarily unavailable.", req, res);
          }
          const pool = getPool();
          if (!pool || typeof pool.query !== "function") {
            return sendControlled(503, "Access check is temporarily unavailable.", req, res);
          }
          const tenant = getTenant(req);
          const result = await authorize(pool, {
            userId: session.userId,
            tenant,
            branchId: getBranchId(req, tenant),
          });
          ctx = { ...result.context, reason: result.status };
          req.blessBoardAuthorizationContext = ctx;
          if (result.status === STATUS.LOOKUP_ERROR) {
            return sendControlled(503, "Access check is temporarily unavailable.", req, res);
          }
          if (result.status === STATUS.UNAUTHENTICATED || result.status === STATUS.INACTIVE_USER) {
            return sendControlled(401, "Sign-in is required.", req, res);
          }
          if (!result.ok) {
            return sendControlled(403, "You do not have access to this site.", req, res);
          }
        } else {
          if (ctx.reason === STATUS.LOOKUP_ERROR) {
            return sendControlled(503, "Access check is temporarily unavailable.", req, res);
          }
          if (!ctx.authenticated || ctx.reason === STATUS.INACTIVE_USER) {
            return sendControlled(401, "Sign-in is required.", req, res);
          }
          if (!ctx.authorized) {
            return sendControlled(403, "You do not have access to this site.", req, res);
          }
        }
      }

      if (allowedRoles && allowedRoles.length) {
        const keys = (ctx.effectiveRoles || []).map((r) => r.roleKey);
        const ok = allowedRoles.some((role) => keys.includes(role));
        if (!ok) {
          return sendControlled(403, "You do not have access to this site.", req, res);
        }
      }

      return next();
    } catch {
      return sendControlled(503, "Access check is temporarily unavailable.", req, res);
    }
  };
}

/**
 * Safe diagnostic page for /tenant-access-check (no UUIDs).
 * @param {{
 *   authz: object,
 *   churchDisplayName?: string,
 *   branchDisplayName?: string,
 * }} opts
 */
function renderTenantAccessCheckPage(opts) {
  const authz = opts.authz || {};
  const roles = (authz.effectiveRoles || [])
    .map((r) => formatRoleLabel(r.roleKey))
    .join(", ");
  const escape = (v) =>
    String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tenant access check · BlessBoard</title>
</head>
<body>
  <main>
    <h1>Tenant access check</h1>
    <p>Temporary diagnostic surface. Not linked from production navigation.</p>
    <dl>
      <dt>Authenticated</dt><dd>${authz.authenticated ? "yes" : "no"}</dd>
      <dt>Authorized</dt><dd>${authz.authorized ? "yes" : "no"}</dd>
      <dt>Roles</dt><dd>${escape(roles || "(none)")}</dd>
      <dt>Church</dt><dd>${escape(opts.churchDisplayName || "")}</dd>
      <dt>Branch</dt><dd>${escape(opts.branchDisplayName || "")}</dd>
    </dl>
  </main>
</body>
</html>`;
}

module.exports = {
  createRequireBlessBoardTenantRole,
  renderTenantAccessCheckPage,
};
