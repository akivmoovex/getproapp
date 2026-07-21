"use strict";

/**
 * HQ staff role assignment UI — fixed V5 roles only (church_hq_admin / branch_admin).
 */

const express = require("express");
const { renderV5Ejs } = require("./v5EjsTemplateCache");
const {
  createRequireBlessBoardTenantRole,
} = require("./requireBlessBoardTenantRole");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { buildHqAdminShellLocals } = require("./hqAdminShellLocals");
const {
  listBlessBoardBranches,
} = require("../services/listBlessBoardBranches");
const {
  listHqChurchRoles,
  assignHqChurchRole,
  revokeHqChurchRole,
  STATUS,
  HQ_ASSIGNABLE_ROLES,
} = require("../services/hqRoleManagementService");
const {
  inviteBlessBoardStaff,
  listPendingInvitations,
  revokeInvitation,
  STATUS: INVITE_STATUS,
  INVITE_ROLES,
} = require("../services/inviteBlessBoardStaff");
const {
  CSRF_FIELD,
  validateCsrf,
} = require("../../platform/http/v5Csrf");
const { getApexOrigin, tenantAbsoluteUrl } = require("./tenantLoginHelpers");

const PAGE_LIMIT = 50;

function renderHqView(relativePath, data) {
  return renderV5Ejs(relativePath, data);
}

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
  if (!wantsHtml) {
    return res.status(status).type("text").send(String(message == null ? "" : message));
  }
  return res.status(status).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>HQ</title>
<link rel="stylesheet" href="/blessboard/v5/hq-admin.css?v=56"/></head>
<body class="bb-hq-body"><main class="bb-hq-login-unavailable">
<h1>Unavailable</h1><p>${safe}</p><p><a href="/hq">Church HQ</a></p>
</main></body></html>`);
}

function presentRole(row) {
  if (!row) return null;
  return {
    id: row.id,
    roleKey: row.roleKey,
    emailDisplay: row.emailDisplay,
    displayName: row.displayName,
    branchKey: row.branchKey,
    branchDisplayName: row.branchDisplayName,
    status: row.status,
    createdAt: row.createdAt,
  };
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 *   sendUnavailable?: Function,
 * }} deps
 */
function createHqRoleAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const isProduction = String(env.NODE_ENV || "") === "production";

  const router = express.Router();
  const requireHqAccess = createRequireBlessBoardTenantRole({
    getPool,
    allowedRoles: ["church_hq_admin", "platform_admin"],
  });

  function rejectApex(req, res, next) {
    if (isApexHost(req)) {
      if (typeof sendUnavailable === "function") return sendUnavailable(req, res);
      return res.status(503).type("text").send("Unavailable");
    }
    return next();
  }

  function gateHq(req, res, next) {
    const sessionOk = Boolean(req.v5Session && req.v5Session.authenticated);
    if (!sessionOk) {
      const wantsHtml = String(req.get("accept") || "").includes("text/html");
      if (wantsHtml) {
        return res.redirect(303, `/login?next=${encodeURIComponent(req.originalUrl || "/hq/roles")}`);
      }
      return sendControlled(req, res, 401, "Sign-in is required.");
    }
    return requireHqAccess(req, res, next);
  }

  async function shellLocals(req, res, extra) {
    return buildHqAdminShellLocals(req, res, {
      env,
      isProduction,
      getPool,
      activeNav: "roles",
      pageTitle: "Staff permissions",
      extra,
    });
  }

  function hqScope(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id || !tenant.organization) {
      sendControlled(req, res, 403, "You do not have access to this site.");
      return null;
    }
    const session = req.v5Session && req.v5Session.session;
    if (!session || !session.userId) {
      sendControlled(req, res, 401, "Sign-in is required.");
      return null;
    }
    const organizationKey = tenant.organization.key || null;
    const churchKey = tenant.church.key || null;
    if (!organizationKey || !churchKey) {
      sendControlled(req, res, 503, "Church catalogue context is incomplete.");
      return null;
    }
    return {
      churchId: tenant.church.id,
      organizationId: tenant.organization.id,
      organizationKey,
      churchKey,
      actorUserId: session.userId,
      tenant,
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

  async function renderRolesPage(req, res, scope, flash) {
    const q = String((req.query && req.query.q) || "").slice(0, 100);
    const roleFilter = String((req.query && req.query.role) || "")
      .trim()
      .toLowerCase();
    const listed = await listHqChurchRoles(getPool(), {
      actorUserId: scope.actorUserId,
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      q: q || null,
      roleKey: HQ_ASSIGNABLE_ROLES.includes(roleFilter) ? roleFilter : null,
      limit: PAGE_LIMIT,
      offset: 0,
    });
    if (!listed.ok) {
      return sendControlled(req, res, 503, "Staff roles are temporarily unavailable.");
    }

    const pending = await listPendingInvitations(getPool(), {
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      limit: PAGE_LIMIT,
    });

    const branches = await listBlessBoardBranches(getPool(), scope.churchId);
    const branchOptions =
      branches.ok && branches.branches
        ? branches.branches.map((b) => ({
            key: b.key,
            displayName: b.displayName,
            branchType: b.branchType,
          }))
        : [];

    const host = String(req.hostname || req.get("host") || "")
      .split(":")[0]
      .toLowerCase();
    const inviteAcceptBase =
      tenantAbsoluteUrl(host, "/invite/accept", env) ||
      `${getApexOrigin(env)}/invite/accept`;

    const html = renderHqView(
      "hq/roles.ejs",
      await shellLocals(req, res, {
        churchDisplayName: scope.tenant.church.displayName,
        roles: (listed.roles || []).map(presentRole),
        total: listed.total,
        counts: listed.counts || { hqAdmins: 0, branchAdmins: 0 },
        branches: branchOptions,
        pendingInvitations: pending.ok ? pending.invitations : [],
        inviteRoles: INVITE_ROLES,
        inviteAcceptBase,
        inviteToken: flash && flash.inviteToken ? flash.inviteToken : null,
        inviteLink: flash && flash.inviteLink ? flash.inviteLink : null,
        q,
        roleFilter: HQ_ASSIGNABLE_ROLES.includes(roleFilter) ? roleFilter : "",
        notice: flash && flash.notice ? flash.notice : null,
        error: flash && flash.error ? flash.error : null,
        form: flash && flash.form ? flash.form : null,
      })
    );
    return res.status(200).type("html").send(html);
  }

  router.get("/hq/roles", rejectApex, gateHq, async (req, res) => {
    const scope = hqScope(req, res);
    if (!scope) return;
    const noticeCode = String((req.query && req.query.notice) || "");
    const errorCode = String((req.query && req.query.error) || "");
    let notice = null;
    let error = null;
    if (noticeCode === "assigned") notice = "Role assignment saved.";
    if (noticeCode === "revoked") notice = "Role revoked. Access ends on the next authorization check.";
    if (noticeCode === "invite_revoked") notice = "Invitation revoked.";
    if (errorCode === "csrf") error = "Invalid or missing CSRF token.";
    if (errorCode === "confirm") error = "Confirm the change before submitting.";
    if (errorCode === "forbidden") error = "That role change is not allowed.";
    if (errorCode === "not_found") error = "User, branch, or role was not found.";
    if (errorCode === "platform") error = "Platform admin cannot be assigned from Church HQ.";
    if (errorCode === "self") error = "You cannot change your own role assignments here.";
    if (errorCode === "inactive") error = "That user account is inactive or suspended.";
    if (errorCode === "limit") error = "Staff account limit reached for this organization. Upgrade to invite another administrator.";
    if (errorCode === "invalid") error = "Check the email, role, and branch selections.";
    if (errorCode === "already") error = "That user already has this role.";
    return renderRolesPage(req, res, scope, { notice, error });
  });

  router.post("/hq/roles/invite", rejectApex, gateHq, async (req, res) => {
    const scope = hqScope(req, res);
    if (!scope) return;
    if (!validateCsrfPost(req, res)) return;

    const body = req.body || {};
    const form = {
      email: String(body.email || "").trim(),
      displayName: String(body.display_name || "").trim(),
      roleKey: String(body.role_key || "").trim().toLowerCase(),
      branchKey: String(body.branch_key || "").trim().toLowerCase(),
    };

    const result = await inviteBlessBoardStaff(getPool(), {
      actorUserId: scope.actorUserId,
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      email: form.email,
      displayName: form.displayName || form.email,
      roleKey: form.roleKey,
      branchKey: form.roleKey === "branch_admin" ? form.branchKey : null,
    });

    if (!result.ok) {
      let error = "Check the invitation details and try again.";
      if (result.status === INVITE_STATUS.LIMIT_EXCEEDED) {
        error =
          result.message ||
          "Staff account limit reached for this organization. Upgrade to invite another administrator.";
      } else if (result.reason === "already_assigned") {
        error = "That user already has this role.";
      } else if (result.reason === "role_escalation" || result.status === INVITE_STATUS.FORBIDDEN) {
        error = "That role cannot be invited from your account.";
      } else if (result.status === INVITE_STATUS.NOT_FOUND) {
        error = "Branch was not found or is inactive.";
      }
      return renderRolesPage(req, res, scope, { error, form });
    }

    const host = String(req.hostname || req.get("host") || "")
      .split(":")[0]
      .toLowerCase();
    const inviteLink =
      tenantAbsoluteUrl(host, `/invite/accept?token=${encodeURIComponent(result.rawToken)}`, env) ||
      `${getApexOrigin(env)}/invite/accept?token=${encodeURIComponent(result.rawToken)}`;

    return renderRolesPage(req, res, scope, {
      notice: result.invitation.resent
        ? "Previous invite link was invalidated. Copy the new invitation link once — it will not be shown again."
        : "Invitation created. Copy the link once and share it out of band — it will not be shown again.",
      inviteToken: result.rawToken,
      inviteLink,
      form: null,
    });
  });

  router.post("/hq/roles/invitations/:invitationId/revoke", rejectApex, gateHq, async (req, res) => {
    const scope = hqScope(req, res);
    if (!scope) return;
    if (!validateCsrfPost(req, res)) return;

    const invitationId = String(req.params.invitationId || "").trim();
    const result = await revokeInvitation(getPool(), {
      invitationId,
      actorUserId: scope.actorUserId,
      organizationId: scope.organizationId,
      churchId: scope.churchId,
    });
    if (!result.ok) {
      return res.redirect(303, "/hq/roles?error=forbidden");
    }
    return res.redirect(303, "/hq/roles?notice=invite_revoked");
  });

  router.post("/hq/roles/assign", rejectApex, gateHq, async (req, res) => {
    const scope = hqScope(req, res);
    if (!scope) return;
    if (!validateCsrfPost(req, res)) return;

    const body = req.body || {};
    const form = {
      email: String(body.email || "").trim(),
      roleKey: String(body.role_key || "").trim().toLowerCase(),
      branchKey: String(body.branch_key || "").trim().toLowerCase(),
    };
    const confirmed = String(body.confirm_assign || "") === "1";

    const result = await assignHqChurchRole(getPool(), {
      actorUserId: scope.actorUserId,
      organizationId: scope.organizationId,
      organizationKey: scope.organizationKey,
      churchId: scope.churchId,
      churchKey: scope.churchKey,
      email: form.email,
      roleKey: form.roleKey,
      branchKey: form.roleKey === "branch_admin" ? form.branchKey : null,
      confirmed,
      env,
    });

    if (!result.ok) {
      let error = "invalid";
      if (result.status === STATUS.CONFIRMATION_REQUIRED) error = "confirm";
      else if (result.reason === "platform_admin_forbidden") error = "platform";
      else if (result.reason === "self_escalation") error = "self";
      else if (result.reason === "user_inactive") error = "inactive";
      else if (result.status === STATUS.LIMIT_EXCEEDED) error = "limit";
      else if (result.status === STATUS.NOT_FOUND) error = "not_found";
      else if (result.status === STATUS.FORBIDDEN) error = "forbidden";
      return res.redirect(303, `/hq/roles?error=${error}`);
    }
    return res.redirect(303, "/hq/roles?notice=assigned");
  });

  router.post("/hq/roles/:roleId/revoke", rejectApex, gateHq, async (req, res) => {
    const scope = hqScope(req, res);
    if (!scope) return;
    if (!validateCsrfPost(req, res)) return;

    const roleId = String(req.params.roleId || "").trim();
    const confirmed = String((req.body && req.body.confirm_revoke) || "") === "1";
    const result = await revokeHqChurchRole(getPool(), {
      actorUserId: scope.actorUserId,
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      roleId,
      confirmed,
      env,
    });

    if (!result.ok) {
      let error = "invalid";
      if (result.status === STATUS.CONFIRMATION_REQUIRED) error = "confirm";
      else if (result.reason === "self_escalation") error = "self";
      else if (result.reason === "cross_church") error = "forbidden";
      else if (result.status === STATUS.NOT_FOUND) error = "not_found";
      else if (result.status === STATUS.FORBIDDEN) error = "forbidden";
      return res.redirect(303, `/hq/roles?error=${error}`);
    }
    return res.redirect(303, "/hq/roles?notice=revoked");
  });

  return router;
}

module.exports = {
  createHqRoleAdminRouter,
};
