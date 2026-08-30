"use strict";

/**
 * HQ staff-access management UI — RBAC catalogue assignments + legacy display.
 * Routes under /hq/settings/staff-access|roles|access-audit.
 * Legacy fixed-role UI remains at /hq/roles.
 */

const express = require("express");
const { renderV5Ejs } = require("./v5EjsTemplateCache");
const {
  createRequireBlessBoardPermission,
} = require("./requireBlessBoardPermission");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const { buildHqAdminShellLocals } = require("./hqAdminShellLocals");
const {
  CSRF_FIELD,
  validateCsrf,
} = require("../../platform/http/v5Csrf");
const {
  listStaffAccess,
  getStaffAccessDetail,
  listRoleCatalogue,
  getRoleCatalogueDetail,
  listAccessAudit,
  listAssignableScopeOptions,
  findUserInOrganisation,
  STATUS,
} = require("../services/staffAccessService");
const {
  createRoleAssignment,
  revokeRoleAssignment,
  CHURCH_ASSIGNABLE_SCOPE_TYPES,
} = require("../services/blessBoardRoleAssignmentService");
const { listBlessBoardBranches } = require("../services/listBlessBoardBranches");
const {
  createScopedTeamMember,
} = require("../../platform/services/createScopedTeamMemberService");
const { tenantAbsoluteUrl } = require("./tenantLoginHelpers");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sendControlled(req, res, status, message) {
  const safe = escapeHtml(message);
  const wantsHtml = String(req.get("accept") || "").includes("text/html");
  if (!wantsHtml) return res.status(status).type("text").send(String(message || ""));
  return res.status(status).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Staff access</title>
<link rel="stylesheet" href="/blessboard/v5/hq-admin.css?v=80"/></head>
<body class="bb-hq-body"><main class="bb-hq-login-unavailable">
<h1>${status === 401 ? "Sign-in required" : status === 404 ? "Not found" : "Unavailable"}</h1>
<p>${safe}</p><p><a href="/hq">HQ home</a></p></main></body></html>`);
}

function redirectWith(res, path, kind, code) {
  const q =
    kind === "error"
      ? `error=${encodeURIComponent(code)}`
      : `notice=${encodeURIComponent(code)}`;
  return res.redirect(303, `${path}?${q}`);
}

function safeAssignError(reason) {
  switch (String(reason || "")) {
    case "self_elevation":
      return "You cannot assign or change roles for yourself.";
    case "reason_required":
      return "A reason is required for sensitive role changes.";
    case "excessive_delegation":
      return "You cannot grant permissions beyond your own authority.";
    case "scope_exceeds_authority":
      return "That scope is broader than your administration authority.";
    case "highly_sensitive_requires_org_admin":
      return "Highly sensitive roles require organisation administrator authority.";
    case "platform_scope_forbidden":
      return "Platform scope cannot be assigned from church HQ.";
    case "expires_at_past":
      return "Expiry must be in the future.";
    case "duplicate":
      return "An identical active assignment already exists.";
    case "last_hq_admin":
      return "This role cannot be removed because the church must have at least one active Church HQ Administrator.";
    default:
      return "This assignment could not be completed.";
  }
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 * }} deps
 */
function createHqStaffAccessRouter(deps) {
  const router = express.Router();
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const isProduction = String(env.NODE_ENV || "") === "production";

  const requireRolesView = createRequireBlessBoardPermission("roles.view", null, {
    getPool,
    scopeMode: "church",
    concealAsNotFound: true,
  });

  const rejectApex = createRejectApex({
    isApexHost,
    mode: "unlessTenant",
    sendUnavailable: (req, res) => sendControlled(req, res, 404, "Not found on this host."),
  });

  function gateSession(req, res, next) {
    const session =
      req.v5Session && req.v5Session.authenticated && req.v5Session.session
        ? req.v5Session.session
        : null;
    if (!session || !session.userId) {
      return res.redirect(
        303,
        `/login?next=${encodeURIComponent(req.originalUrl || "/hq/settings/staff-access")}`
      );
    }
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || tenant.resolved !== true) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    return next();
  }

  async function shellLocals(req, res, extra) {
    return buildHqAdminShellLocals(req, res, {
      env,
      isProduction,
      getPool,
      activeNav: (extra && extra.activeNav) || "staff-access",
      pageTitle: (extra && extra.pageTitle) || "Staff access",
      extra: { shellKind: "hq", ...(extra || {}) },
    });
  }

  function tenantScope(req) {
    const tenant = resolveTenantForAuthorization(req);
    const session = req.v5Session && req.v5Session.session;
    return {
      tenant,
      actorUserId: session && session.userId,
      organizationId: tenant.organization.id,
      churchId: tenant.church.id,
    };
  }

  function validateCsrfPost(req, res) {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      sendControlled(req, res, 403, "Invalid or missing CSRF token.");
      return false;
    }
    return true;
  }

  // List
  router.get(
    "/hq/settings/staff-access",
    rejectApex,
    gateSession,
    requireRolesView,
    async (req, res) => {
      const scope = tenantScope(req);
      const listed = await listStaffAccess(getPool(), {
        actorUserId: scope.actorUserId,
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        tenantContext: scope.tenant,
        q: req.query.q,
        branchId: req.query.branch,
        roleKey: req.query.role,
        userStatus: req.query.status,
        assignmentStatus: req.query.assignment,
        sensitivity: req.query.sensitivity,
        limit: req.query.limit,
        offset: req.query.offset,
      });
      if (!listed.ok) {
        return sendControlled(
          req,
          res,
          listed.status === STATUS.FORBIDDEN ? 404 : 503,
          listed.status === STATUS.FORBIDDEN ? "Not found." : "Staff access is temporarily unavailable."
        );
      }
      const branches = await listBlessBoardBranches(getPool(), scope.churchId);
      const catalogue = await listRoleCatalogue(getPool(), {
        actorUserId: scope.actorUserId,
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        tenantContext: scope.tenant,
      });
      const html = renderV5Ejs(
        "hq/staff-access-list.ejs",
        await shellLocals(req, res, {
          pageTitle: "Users",
          activeNav: "staff-access",
          loadUrpAssets: true,
          users: listed.users,
          stats: listed.stats || {
            totalUsers: listed.users.length,
            churchAdmins: 0,
            branchAdmins: 0,
            pendingInvitations: 0,
          },
          total: listed.total || listed.users.length,
          limit: listed.limit || 50,
          offset: listed.offset || 0,
          branches: branches.ok ? branches.branches : [],
          roles: catalogue.ok ? catalogue.roles : [],
          filters: {
            q: String(req.query.q || ""),
            branch: String(req.query.branch || ""),
            role: String(req.query.role || ""),
            status: String(req.query.status || ""),
            sensitivity: String(req.query.sensitivity || ""),
          },
          notice: String(req.query.notice || ""),
          error: String(req.query.error || ""),
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  router.get(
    "/hq/settings/staff-access/invite",
    rejectApex,
    gateSession,
    requireRolesView,
    async (req, res) => {
      const scope = tenantScope(req);
      const catalogue = await listRoleCatalogue(getPool(), {
        actorUserId: scope.actorUserId,
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        tenantContext: scope.tenant,
      });
      const branches = await listBlessBoardBranches(getPool(), scope.churchId);
      const placement = String(req.query.placement || "hq").toLowerCase() === "branch" ? "branch" : "hq";
      const html = renderV5Ejs(
        "hq/staff-access-invite.ejs",
        await shellLocals(req, res, {
          pageTitle: "Invite user",
          activeNav: "staff-access",
          loadUrpAssets: true,
          placement,
          branches: branches.ok ? branches.branches : [],
          roles: catalogue.ok ? catalogue.roles : [],
          draft: {
            firstName: String(req.query.first_name || ""),
            lastName: String(req.query.last_name || ""),
            phone: String(req.query.phone || ""),
            email: String(req.query.email || ""),
            branchId: String(req.query.branch_id || ""),
            roleKey: String(req.query.role_key || ""),
            assignmentReason: String(req.query.assignment_reason || ""),
          },
          notice: String(req.query.notice || ""),
          error: String(req.query.error || ""),
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  router.post(
    "/hq/settings/staff-access/invite",
    rejectApex,
    gateSession,
    requireRolesView,
    async (req, res) => {
      if (!validateCsrfPost(req, res)) return;
      const scope = tenantScope(req);
      const body = req.body || {};
      const placement =
        String(body.placement || "").toLowerCase() === "branch" ? "branch" : "hq";
      let branchId =
        body.branch_id != null && String(body.branch_id).trim()
          ? String(body.branch_id).trim()
          : null;
      if (placement === "hq") branchId = null;
      const host = String(req.hostname || req.get("host") || "")
        .split(":")[0]
        .toLowerCase();
      const acceptBase =
        tenantAbsoluteUrl(host, "/invite/accept", env) || "/invite/accept";
      const created = await createScopedTeamMember(getPool(), {
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        actorUserId: scope.actorUserId,
        firstName: body.first_name,
        lastName: body.last_name,
        phone: body.phone,
        email: body.email,
        placement,
        branchId,
        roleKey:
          body.role_key ||
          (placement === "branch" ? "branch_admin" : "church_hq_admin"),
        assignmentReason: body.assignment_reason,
        leadershipTitle: body.leadership_title,
        actorSource: "church_hq_admin",
        invitationAcceptBase: acceptBase,
        env,
      });
      if (!created.ok) {
        return res.redirect(
          303,
          `/hq/settings/staff-access/invite?placement=${encodeURIComponent(placement)}&error=${encodeURIComponent(created.reason || "invite_failed")}`
        );
      }
      const html = renderV5Ejs(
        "hq/staff-access-invite-result.ejs",
        await shellLocals(req, res, {
          pageTitle: "Team member added",
          activeNav: "staff-access",
          loadUrpAssets: true,
          result: created,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  // Assign by email (from list page) — before :userId routes
  router.post(
    "/hq/settings/staff-access/assign",
    rejectApex,
    gateSession,
    requireRolesView,
    async (req, res) => {
      if (!validateCsrfPost(req, res)) return;
      const scope = tenantScope(req);
      const body = req.body || {};
      const found = await findUserInOrganisation(getPool(), {
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        email: body.email,
      });
      if (!found.ok || !found.user) {
        return redirectWith(res, "/hq/settings/staff-access", "error", "User not found.");
      }
      if (found.user.status !== "active") {
        return redirectWith(
          res,
          `/hq/settings/staff-access/${found.user.id}`,
          "error",
          "User account is not active."
        );
      }
      return res.redirect(303, `/hq/settings/staff-access/${found.user.id}`);
    }
  );

  // Detail
  router.get(
    "/hq/settings/staff-access/:userId",
    rejectApex,
    gateSession,
    requireRolesView,
    async (req, res) => {
      const scope = tenantScope(req);
      const userId = String(req.params.userId || "");
      if (!UUID_RE.test(userId)) {
        return sendControlled(req, res, 404, "Not found.");
      }
      const detail = await getStaffAccessDetail(getPool(), {
        actorUserId: scope.actorUserId,
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        tenantContext: scope.tenant,
        userId,
      });
      if (!detail.ok) {
        return sendControlled(
          req,
          res,
          detail.status === STATUS.NOT_FOUND || detail.status === STATUS.FORBIDDEN ? 404 : 503,
          "Not found."
        );
      }
      const scopeOptions = await listAssignableScopeOptions(getPool(), {
        organizationId: scope.organizationId,
        churchId: scope.churchId,
      });
      const catalogue = await listRoleCatalogue(getPool(), {
        actorUserId: scope.actorUserId,
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        tenantContext: scope.tenant,
      });
      const html = renderV5Ejs(
        "hq/staff-access-detail.ejs",
        await shellLocals(req, res, {
          pageTitle: detail.user.displayName,
          activeNav: "staff-access",
          loadUrpAssets: true,
          detail,
          scopeOptions: scopeOptions.ok ? scopeOptions.options : {},
          scopeTypes: CHURCH_ASSIGNABLE_SCOPE_TYPES.slice(),
          assignableRoles: catalogue.ok ? catalogue.roles : [],
          actorUserId: scope.actorUserId,
          notice: String(req.query.notice || ""),
          error: String(req.query.error || ""),
          safety: String(req.query.safety || ""),
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  // Assign
  router.post(
    "/hq/settings/staff-access/:userId/assign",
    rejectApex,
    gateSession,
    requireRolesView,
    async (req, res) => {
      if (!validateCsrfPost(req, res)) return;
      const scope = tenantScope(req);
      const userId = String(req.params.userId || "");
      if (!UUID_RE.test(userId)) return sendControlled(req, res, 404, "Not found.");
      const body = req.body || {};
      const scopeType = String(body.scope_type || "").trim();
      let scopeId = body.scope_id != null ? String(body.scope_id).trim() : "";
      let churchId = scope.churchId;
      if (scopeType === "organisation") {
        churchId = null;
        scopeId = scopeId || scope.organizationId;
      } else if (scopeType === "church") {
        scopeId = scope.churchId;
        churchId = scope.churchId;
      }
      let expiresAt = null;
      if (body.expires_at) {
        expiresAt = new Date(String(body.expires_at)).toISOString();
      }
      const result = await createRoleAssignment(getPool(), {
        actorUserId: scope.actorUserId,
        userId,
        roleKey: body.role_key,
        organizationId: scope.organizationId,
        churchId,
        scopeType,
        scopeId,
        assignmentOrigin: "manual",
        assignmentReason: body.assignment_reason,
        expiresAt,
        tenantContext: scope.tenant,
        actorChurchId: scope.churchId,
        forbidPlatformScope: true,
      });
      if (!result.ok) {
        return redirectWith(
          res,
          `/hq/settings/staff-access/${userId}`,
          "error",
          safeAssignError(result.reason)
        );
      }
      return redirectWith(
        res,
        `/hq/settings/staff-access/${userId}`,
        "notice",
        result.idempotent ? "Assignment already active." : "Role assigned."
      );
    }
  );

  // Revoke
  router.post(
    "/hq/settings/staff-access/:userId/assignments/:assignmentId/revoke",
    rejectApex,
    gateSession,
    requireRolesView,
    async (req, res) => {
      if (!validateCsrfPost(req, res)) return;
      const scope = tenantScope(req);
      const userId = String(req.params.userId || "");
      const assignmentId = String(req.params.assignmentId || "");
      if (!UUID_RE.test(userId) || !UUID_RE.test(assignmentId)) {
        return sendControlled(req, res, 404, "Not found.");
      }
      const body = req.body || {};
      const result = await revokeRoleAssignment(getPool(), {
        actorUserId: scope.actorUserId,
        assignmentId,
        revocationReason: body.revocation_reason,
        tenantContext: scope.tenant,
        actorChurchId: scope.churchId,
      });
      if (!result.ok) {
        const safety =
          result.reason === "last_hq_admin"
            ? "&safety=last_hq_admin"
            : result.reason === "self_elevation"
              ? "&safety=self_demotion"
              : "";
        return res.redirect(
          303,
          `/hq/settings/staff-access/${userId}?error=${encodeURIComponent(
            safeAssignError(result.reason)
          )}${safety}`
        );
      }
      return redirectWith(res, `/hq/settings/staff-access/${userId}`, "notice", "Assignment revoked.");
    }
  );

  // Role catalogue
  router.get(
    "/hq/settings/roles",
    rejectApex,
    gateSession,
    requireRolesView,
    async (req, res) => {
      const scope = tenantScope(req);
      const catalogue = await listRoleCatalogue(getPool(), {
        actorUserId: scope.actorUserId,
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        tenantContext: scope.tenant,
      });
      if (!catalogue.ok) {
        return sendControlled(
          req,
          res,
          catalogue.status === STATUS.FORBIDDEN ? 404 : 503,
          "Not found."
        );
      }
      const html = renderV5Ejs(
        "hq/staff-roles-catalogue.ejs",
        await shellLocals(req, res, {
          pageTitle: "Roles",
          activeNav: "staff-access",
          loadUrpAssets: true,
          roles: catalogue.roles,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  router.get(
    "/hq/settings/roles/:roleKey",
    rejectApex,
    gateSession,
    requireRolesView,
    async (req, res) => {
      const scope = tenantScope(req);
      const roleKey = String(req.params.roleKey || "").trim();
      const detail = await getRoleCatalogueDetail(getPool(), {
        actorUserId: scope.actorUserId,
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        tenantContext: scope.tenant,
        roleKey,
      });
      if (!detail.ok) {
        return sendControlled(req, res, 404, "Not found.");
      }
      const html = renderV5Ejs(
        "hq/staff-role-detail.ejs",
        await shellLocals(req, res, {
          pageTitle: detail.role.displayName,
          activeNav: "staff-access",
          loadUrpAssets: true,
          role: detail.role,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  // Access audit
  router.get(
    "/hq/settings/access-audit",
    rejectApex,
    gateSession,
    requireRolesView,
    async (req, res) => {
      const scope = tenantScope(req);
      const audit = await listAccessAudit(getPool(), {
        actorUserId: scope.actorUserId,
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        tenantContext: scope.tenant,
      });
      if (!audit.ok) {
        return sendControlled(
          req,
          res,
          audit.status === STATUS.FORBIDDEN ? 404 : 503,
          "Not found."
        );
      }
      const html = renderV5Ejs(
        "hq/staff-access-audit.ejs",
        await shellLocals(req, res, {
          pageTitle: "Access audit",
          activeNav: "staff-access",
          loadUrpAssets: true,
          events: audit.events,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  return router;
}

module.exports = {
  createHqStaffAccessRouter,
};
