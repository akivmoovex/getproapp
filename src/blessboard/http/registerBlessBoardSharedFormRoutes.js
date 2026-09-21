"use strict";

/**
 * BlessBoard mount for shared Moovex form builder (SH01–SH07).
 * Separate from legacy member-only blessboard.forms; branding stays BlessBoard.
 *
 * Soft canView/canManage checks read catalogue permissions from
 * blessBoardAuthorizationContext.permissions (populated by
 * loadBlessBoardAuthorizationContext via listEffectivePermissions).
 * HQ routes re-scope that list to church-wide (branchId null) to match
 * createRequireBlessBoardPermission scopeMode: "church".
 */

const {
  createSharedFormBuilderRouter,
} = require("../../platform/http/sharedFormBuilderRoutes");
const { renderFormView } = require("../../platform/forms/renderFormView");
const {
  createRequireBlessBoardPermission,
} = require("./requireBlessBoardPermission");
const {
  createRequireV5AuthenticatedSession,
} = require("../../platform/http/v5SessionAuthGate");
const {
  resolveTenantForAuthorization,
  resolveEffectivePermissionKeys,
} = require("./loadBlessBoardAuthorizationContext");

function hasPermission(req, key) {
  const ctx = req.blessBoardAuthorizationContext;
  const granted = (ctx && ctx.permissions) || [];
  if (granted.includes(key)) return true;
  // Fallback: some shells expose flat permission list on session authz
  const sessionPerms =
    (req.v5Session &&
      req.v5Session.authorization &&
      req.v5Session.authorization.permissions) ||
    [];
  return sessionPerms.includes(key);
}

function formStudioResourceBranchId(tenant, variant) {
  if (variant === "hq") return null;
  return tenant && tenant.primaryBranch && tenant.primaryBranch.id
    ? tenant.primaryBranch.id
    : null;
}

function registerBlessBoardSharedFormRoutes(app, deps) {
  const getPool = deps.getPool;
  const env = deps.env || process.env;
  const isProduction = deps.isProduction === true;
  const variant = deps.variant === "branch" ? "branch" : "hq";
  const adminBasePath = variant === "hq" ? "/hq/form-studio" : "/branch-admin/form-studio";

  const requireSession = createRequireV5AuthenticatedSession({
    loginNext: adminBasePath,
  });
  const requireView = createRequireBlessBoardPermission("requests.view", null, {
    getPool,
    scopeMode: variant === "hq" ? "church" : undefined,
  });

  function requireAdmin(req, res, next) {
    if (!requireSession(req, res, { loginNext: req.originalUrl || adminBasePath })) {
      return;
    }
    return requireView(req, res, async () => {
      // Align soft canView/canManage with the same resource scope as requireView.
      try {
        const tenant = resolveTenantForAuthorization(req);
        const session =
          req.v5Session && req.v5Session.authenticated && req.v5Session.session
            ? req.v5Session.session
            : null;
        const pool = typeof getPool === "function" ? getPool() : null;
        if (tenant && session && session.userId && pool) {
          const permissions = await resolveEffectivePermissionKeys(pool, {
            userId: session.userId,
            tenant,
            branchId: formStudioResourceBranchId(tenant, variant),
          });
          const prev = req.blessBoardAuthorizationContext || {};
          req.blessBoardAuthorizationContext = {
            ...prev,
            permissions,
          };
        }
      } catch {
        // Leave prior context; canView/canManage stay fail-closed when empty.
      }
      return next();
    });
  }

  function sendHtml(res, html, status) {
    res.status(status || 200).type("html").send(html);
  }

  const router = createSharedFormBuilderRouter({
    productCode: "blessboard",
    adminBasePath,
    getPool,
    env,
    isProduction,
    brand: {
      productName: "BlessBoard",
      productClass: "mx-forms--blessboard",
    },
    requireAdmin,
    canView(req) {
      return hasPermission(req, "requests.view") || hasPermission(req, "requests.manage");
    },
    canManage(req) {
      return hasPermission(req, "requests.manage");
    },
    resolveTenant(req) {
      const tenant = resolveTenantForAuthorization(req);
      if (!tenant || !tenant.organization || !tenant.organization.id) return null;
      const session = req.v5Session && req.v5Session.session;
      return {
        organizationId: tenant.organization.id,
        actorIdentityId: (session && session.platformIdentityId) || null,
      };
    },
    renderAdmin(req, res, viewName, locals) {
      sendHtml(res, renderFormView(viewName, locals));
    },
    renderPublic(req, res, viewName, locals) {
      sendHtml(res, renderFormView(viewName, locals));
    },
  });

  app.use(router);
}

module.exports = {
  registerBlessBoardSharedFormRoutes,
};
