"use strict";

/**
 * Apex website-governance gate.
 * Platform admins keep full access. CSR / support may enter with platform-scoped
 * website.review (and only the website.* keys actually granted).
 * Never implies platform_admin. Organization-scoped website.review is not elevated.
 */

const {
  listActiveAuthorizationRoles,
  findUserStatusById,
} = require("../../blessboard/repositories/blessBoardAuthorizationRepository");
const { PERMISSIONS, PLATFORM_ADMIN_PERMISSIONS } = require("../website/permissions");
const { formatRoleLabel } = require("../../blessboard/http/renderTenantLandingPage");

const PLATFORM_WEBSITE_GOVERNANCE_ROLES = Object.freeze({
  platform_website_support: {
    displayName: "Website support",
    grants: ["website.view", "website.review"],
    scope: "platform",
    label: "Platform-wide website governance",
  },
  platform_website_approver: {
    displayName: "Website approver",
    grants: ["website.approve"],
    scope: "platform",
    label: "Platform-wide website governance",
  },
  platform_website_hider: {
    displayName: "Website hider",
    grants: ["website.take_offline"],
    scope: "platform",
    label: "Platform-wide website governance",
  },
  platform_website_blocker: {
    displayName: "Website blocker",
    grants: ["website.suspend"],
    scope: "platform",
    label: "Platform-wide website governance",
  },
  platform_website_restorer: {
    displayName: "Website restorer",
    grants: ["website.restore"],
    scope: "platform",
    label: "Platform-wide website governance",
  },
});

const DENIED_ORG_SCOPED =
  "This console is platform-wide website governance. An organization-scoped website.review grant does not provide access to /admin/recent-website-changes.";
const DENIED_GENERIC =
  "You do not have platform-scoped access to website governance. Organization-scoped website.review does not unlock this console.";

function websitePermissionKeysFromRows(rows) {
  return [...new Set((rows || []).map((row) => String(row.permission_key || "")).filter(Boolean))];
}

function isPlatformWebsiteGovernanceRole(roleKey) {
  return Object.prototype.hasOwnProperty.call(
    PLATFORM_WEBSITE_GOVERNANCE_ROLES,
    String(roleKey || "")
  );
}

async function listPlatformScopedWebsitePermissions(db, userId) {
  const rows = await db.query(
    `SELECT DISTINCT p.permission_key
       FROM blessboard.user_role_assignments a
       JOIN blessboard.roles r ON r.id = a.role_id
       JOIN blessboard.role_permissions rp ON rp.role_id = a.role_id
       JOIN blessboard.permissions p ON p.id = rp.permission_id
      WHERE a.user_id = $1
        AND a.status = 'active'
        AND a.scope_type = 'platform'
        AND (a.expires_at IS NULL OR a.expires_at > now())
        AND r.is_active = true
        AND p.is_active = true
        AND p.permission_key LIKE 'website.%'
      ORDER BY p.permission_key`,
    [userId]
  );
  return websitePermissionKeysFromRows(rows.rows);
}

async function hasOrgScopedWebsiteReview(db, userId) {
  const rows = await db.query(
    `SELECT 1
       FROM blessboard.user_role_assignments a
       JOIN blessboard.roles r ON r.id = a.role_id
       JOIN blessboard.role_permissions rp ON rp.role_id = a.role_id
       JOIN blessboard.permissions p ON p.id = rp.permission_id
      WHERE a.user_id = $1
        AND a.status = 'active'
        AND a.scope_type IS DISTINCT FROM 'platform'
        AND (a.expires_at IS NULL OR a.expires_at > now())
        AND r.is_active = true
        AND p.is_active = true
        AND p.permission_key = $2
      LIMIT 1`,
    [userId, PERMISSIONS.REVIEW]
  );
  return Boolean(rows.rows[0]);
}

function createRequireWebsiteGovernanceAccess(deps) {
  const {
    getPool,
    authLog,
    findUserStatusByIdFn,
    listActiveAuthorizationRolesFn,
    redirectToApexLogin,
    shouldRedirectUnauthenticatedToLogin,
    sendControlled,
  } = deps;

  return async function requireWebsiteGovernanceAccess(req, res, next) {
    try {
      const session =
        req.v5Session && req.v5Session.authenticated && req.v5Session.session
          ? req.v5Session.session
          : null;
      if (!session) {
        if (authLog) {
          authLog.logAuthEvent(req, "website_governance_denied", {
            outcome: "denied",
            failureCategory: "unauthenticated",
            sessionFound: false,
          });
        }
        if (shouldRedirectUnauthenticatedToLogin && shouldRedirectUnauthenticatedToLogin(req)) {
          return redirectToApexLogin(req, res);
        }
        return sendControlled(req, res, 401, "Sign-in is required.");
      }

      const pool = getPool();
      if (!pool || typeof pool.query !== "function") {
        return sendControlled(req, res, 503, "Website governance is temporarily unavailable.");
      }

      const findUser = findUserStatusByIdFn || findUserStatusById;
      const listRoles = listActiveAuthorizationRolesFn || listActiveAuthorizationRoles;
      const user = await findUser(pool, session.userId);
      if (!user || String(user.status) !== "active") {
        if (shouldRedirectUnauthenticatedToLogin && shouldRedirectUnauthenticatedToLogin(req)) {
          return redirectToApexLogin(req, res);
        }
        return sendControlled(req, res, 401, "Sign-in is required.");
      }

      const roles = await listRoles(pool, session.userId);
      const isPlatformAdmin = (roles || []).some((r) => r.roleKey === "platform_admin");
      const displayName =
        session.user && session.user.displayName ? session.user.displayName : "";

      if (isPlatformAdmin) {
        req.platformAdminContext = {
          authenticated: true,
          authorized: true,
          userId: session.userId,
          platformIdentityId: session.platformIdentityId || null,
          displayName,
          roleLabel: formatRoleLabel("platform_admin"),
          actorRole: "platform_admin",
          permissions: PLATFORM_ADMIN_PERMISSIONS,
          websiteGovernanceOnly: false,
          websiteGovernanceScope: "platform",
        };
        return next();
      }

      const permissions = await listPlatformScopedWebsitePermissions(pool, session.userId);
      if (!permissions.includes(PERMISSIONS.REVIEW)) {
        const orgScoped = await hasOrgScopedWebsiteReview(pool, session.userId);
        if (authLog) {
          authLog.logAuthEvent(req, "website_governance_denied", {
            outcome: "denied",
            failureCategory: orgScoped ? "org_scoped_website_review" : "missing_website_review",
            sessionFound: true,
          });
        }
        return sendControlled(req, res, 403, orgScoped ? DENIED_ORG_SCOPED : DENIED_GENERIC);
      }

      req.platformAdminContext = {
        authenticated: true,
        authorized: true,
        userId: session.userId,
        platformIdentityId: session.platformIdentityId || null,
        displayName,
        roleLabel: "Platform-wide website governance",
        actorRole: "csr",
        permissions,
        websiteGovernanceOnly: true,
        websiteGovernanceScope: "platform",
      };
      return next();
    } catch (err) {
      if (authLog) {
        authLog.logAuthEvent(req, "website_governance_unexpected_error", {
          outcome: "error",
          failureCategory: "unexpected",
          sessionFound: Boolean(req.v5Session && req.v5Session.authenticated),
        });
      }
      return sendControlled(req, res, 503, "Website governance is temporarily unavailable.");
    }
  };
}

module.exports = {
  createRequireWebsiteGovernanceAccess,
  listPlatformScopedWebsitePermissions,
  hasOrgScopedWebsiteReview,
  isPlatformWebsiteGovernanceRole,
  PLATFORM_WEBSITE_GOVERNANCE_ROLES,
};
