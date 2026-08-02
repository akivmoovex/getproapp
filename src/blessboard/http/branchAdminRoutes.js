"use strict";

/**
 * Minimal BlessBoard V5 branch-admin portal shell (tenant hosts only).
 * Branch identity comes from authoritative hostname tenant context — never query strings.
 */

const express = require("express");
const { renderV5Ejs, VIEWS_ROOT } = require("./v5EjsTemplateCache");

const {
  createRequireBlessBoardPermission,
} = require("./requireBlessBoardPermission");
const {
  createRequireAnyBlessBoardPermission,
} = require("./requireBlessBoardShellAccess");
const {
  BRANCH_SHELL_VISIBLE_PERMISSIONS,
} = require("./shellVisiblePermissions");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const {
  CSRF_FIELD,
  issueCsrfToken,
  validateCsrf,
  setCsrfCookie,
} = require("../../platform/http/v5Csrf");
const {
  clearV5SessionCookie,
  readV5SessionCookie,
} = require("../../platform/session/v5SessionCookie");
const { revokeV5Session } = require("../../platform/session/revokeV5Session");
const { exitSupport } = require("../../platform/services/platformSupportModeService");
const {
  readSupportContextCookie,
  clearSupportContextCookie,
} = require("../../platform/http/supportContextCookie");
const {
  getBranchSettingsPageModel,
  updateBranchSettings,
  STATUS: SETTINGS_STATUS,
} = require("../services/blessBoardSettingsService");
const {
  inviteBlessBoardStaff,
  STATUS: INVITE_STATUS,
} = require("../services/inviteBlessBoardStaff");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");
const { buildBranchAdminShellLocals } = require("./branchAdminShellLocals");
const { tenantAbsoluteUrl } = require("./tenantLoginHelpers");
const { createRejectApex } = require("./rejectApex");
const {
  createRequireV5AuthenticatedSession,
} = require("../../platform/http/v5SessionAuthGate");

/**
 * @param {string} relativePath
 * @param {object} data
 */
function renderBranchAdminView(relativePath, data) {
  return renderV5Ejs(relativePath, data);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {number} status
 * @param {string} message
 */
function sendLoginUnavailable(req, res, status, message) {
  const safe = escapeHtml(message);
  const wantsHtml = String(req.get("accept") || "").includes("text/html");
  if (!wantsHtml) {
    return res.status(status).type("text").send(String(message == null ? "" : message));
  }
  return res.status(status).type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign-in unavailable · BlessBoard</title>
  <link rel="stylesheet" href="/blessboard/v5/branch-admin.css?v=38" />
</head>
<body class="bb-ba-body">
  <main class="bb-ba-login-unavailable">
    <h1>Sign-in unavailable</h1>
    <p>${safe}</p>
    <p><a href="/">Church homepage</a></p>
  </main>
</body>
</html>`);
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 *   sendUnavailable?: Function,
 * }} deps
 */
function createBranchAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const isProduction = String(env.NODE_ENV || "") === "production";

  const router = express.Router();
  const requireAccess = createRequireAnyBlessBoardPermission(BRANCH_SHELL_VISIBLE_PERMISSIONS, {
    getPool,
    resolveResourceContext: (_req, tenant) => ({
      organizationId: tenant.organization.id,
      churchId: tenant.church.id,
      // Host-resolved branch only — never rebind to a different assigned branch.
      branchId: tenant.primaryBranch && tenant.primaryBranch.id ? tenant.primaryBranch.id : null,
    }),
    denyMessage:
      "You do not have access to this branch workspace. Ask an administrator to assign a branch module permission.",
  });
  const requireBranchesEdit = createRequireBlessBoardPermission("branches.edit", null, { getPool });
  const requireRolesAssign = createRequireBlessBoardPermission("roles.assign_standard", null, {
    getPool,
  });

  function sendMissingTenantContext(req, res) {
    const reason = req.blessBoardSessionTenantReason || "tenant_context_missing";
    console.info(
      JSON.stringify({
        event: "branch_admin_missing_tenant_context",
        reason,
        path: req.originalUrl || req.path || null,
        hasSession: Boolean(req.v5Session && req.v5Session.authenticated),
        hasOrganizationId: Boolean(
          req.v5Session &&
            req.v5Session.session &&
            req.v5Session.session.organizationId
        ),
      })
    );
    return sendLoginUnavailable(
      req,
      res,
      403,
      "Your account is signed in, but this branch workspace could not be loaded. Confirm you are assigned to an active organization and branch, then sign in again."
    );
  }

  const requireSession = createRequireV5AuthenticatedSession({
    loginNext: "/branch-admin",
  });

  const rejectApex = createRejectApex({
    isApexHost,
    mode: "unlessTenant",
    sendUnavailable: (req, res) => {
      // Unauthenticated (incl. store errors) should not reach here in unlessTenant
      // mode, but keep the shared gate so store blips never force a login redirect.
      if (!(req.v5Session && req.v5Session.authenticated)) {
        requireSession(req, res, { loginNext: "/branch-admin" });
        return;
      }
      return sendMissingTenantContext(req, res);
    },
  });

  function gateAccess(req, res, next) {
    if (!requireSession(req, res, { loginNext: "/branch-admin" })) return;
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || tenant.resolved !== true) {
      return sendMissingTenantContext(req, res);
    }
    return requireAccess(req, res, next);
  }

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {string} activeNav
   * @param {object} [extra]
   */
  async function shellLocals(req, res, activeNav, extra) {
    return buildBranchAdminShellLocals(req, res, {
      getPool,
      env,
      isProduction,
      activeNav,
      extra,
    });
  }

  router.get("/branch-admin", rejectApex, gateAccess, async (req, res) => {
    const locals = await shellLocals(req, res, "home");
    const html = renderBranchAdminView("branch-admin/dashboard.ejs", locals);
    return res.status(200).type("html").send(html);
  });

  router.get("/branch-admin/account", rejectApex, gateAccess, async (req, res) => {
    const locals = await shellLocals(req, res, "account");
    const html = renderBranchAdminView("branch-admin/account.ejs", locals);
    return res.status(200).type("html").send(html);
  });

  router.get("/branch-admin/settings", rejectApex, gateAccess, requireBranchesEdit, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    const branchId = tenant && tenant.primaryBranch ? tenant.primaryBranch.id : null;
    if (!branchId) {
      return sendLoginUnavailable(req, res, 403, "You do not have access to this site.");
    }
    const loaded = await getBranchSettingsPageModel(getPool(), branchId);
    if (!loaded.ok || !loaded.model) {
      return sendLoginUnavailable(
        req,
        res,
        loaded.status === SETTINGS_STATUS.LOOKUP_ERROR ? 503 : 403,
        "Settings are temporarily unavailable."
      );
    }
    const html = renderBranchAdminView(
      "branch-admin/settings.ejs",
      await shellLocals(req, res, "settings", {
        settings: loaded.model.settings,
        catalogue: loaded.model.catalogue,
        error: null,
        fieldError: null,
        saved: String((req.query && req.query.saved) || "") === "1",
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post("/branch-admin/settings", rejectApex, gateAccess, requireBranchesEdit, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    const branchId = tenant && tenant.primaryBranch ? tenant.primaryBranch.id : null;
    if (!branchId) {
      return sendLoginUnavailable(req, res, 403, "You do not have access to this site.");
    }
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return res.status(403).type("text").send("Invalid or missing CSRF token.");
    }
    const body = req.body || {};
    const session = req.v5Session && req.v5Session.session;
    const updated = await updateBranchSettings(getPool(), branchId, {
      publicName: body.publicName,
      email: body.email,
      phone: body.phone,
      timezone: body.timezone,
      countryCode: body.countryCode,
      addressLine1: body.addressLine1,
      addressLine2: body.addressLine2,
      city: body.city,
      provinceState: body.provinceState,
      postalCode: body.postalCode,
      latitude: body.latitude,
      longitude: body.longitude,
      expectedChurchId: tenant.church && tenant.church.id,
      actorUserId: session && session.userId,
    });
    if (!updated.ok) {
      if (
        updated.status === SETTINGS_STATUS.INVALID_INPUT ||
        updated.status === SETTINGS_STATUS.CONFLICT
      ) {
        const loaded = await getBranchSettingsPageModel(getPool(), branchId);
        const html = renderBranchAdminView(
          "branch-admin/settings.ejs",
          await shellLocals(req, res, "settings", {
            settings: (loaded.model && loaded.model.settings) || {
              publicName: String(body.publicName || ""),
              email: body.email || null,
              phone: body.phone || null,
              timezone: body.timezone || null,
              countryCode: body.countryCode || null,
              addressLine1: body.addressLine1 || null,
              addressLine2: body.addressLine2 || null,
              city: body.city || null,
              provinceState: body.provinceState || null,
              postalCode: body.postalCode || null,
              latitude: body.latitude || null,
              longitude: body.longitude || null,
            },
            catalogue: loaded.model ? loaded.model.catalogue : null,
            error: updated.message || "Please check the settings and try again.",
            fieldError: updated.reason || null,
            saved: false,
          })
        );
        return res
          .status(updated.status === SETTINGS_STATUS.CONFLICT ? 409 : 400)
          .type("html")
          .send(html);
      }
      return sendLoginUnavailable(req, res, 503, "Settings could not be saved.");
    }
    return res.redirect(303, "/branch-admin/settings?saved=1");
  });

  /**
   * Branch admins may invite only within their assigned branch (phone-first).
   */
  router.post("/branch-admin/invitations", rejectApex, gateAccess, requireRolesAssign, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    const session = req.v5Session && req.v5Session.session;
    if (!tenant || !tenant.church || !tenant.organization || !tenant.primaryBranch || !session) {
      return sendLoginUnavailable(req, res, 403, "You do not have access to this site.");
    }
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return res.status(403).type("text").send("Invalid or missing CSRF token.");
    }
    const body = req.body || {};
    const host = String(req.hostname || req.get("host") || "")
      .split(":")[0]
      .toLowerCase();
    const acceptBase =
      tenantAbsoluteUrl(host, "/invite/accept", env) || "/invite/accept";
    const {
      createScopedTeamMember,
      STATUS: SCOPED_STATUS,
    } = require("../../platform/services/createScopedTeamMemberService");
    const result = await createScopedTeamMember(getPool(), {
      actorUserId: session.userId,
      organizationId: tenant.organization.id,
      churchId: tenant.church.id,
      branchId: tenant.primaryBranch.id,
      placement: "branch",
      firstName: body.first_name || String(body.display_name || "").split(/\s+/)[0] || "Team",
      lastName:
        body.last_name ||
        String(body.display_name || "")
          .split(/\s+/)
          .slice(1)
          .join(" ") ||
        "Member",
      phone: body.phone,
      email: body.email || undefined,
      roleKey: body.role_key || "branch_admin",
      assignmentReason: body.assignment_reason,
      actorSource: "branch_admin",
      invitationAcceptBase: acceptBase,
      env,
    });
    if (!result.ok) {
      const status =
        result.status === SCOPED_STATUS.FORBIDDEN
          ? 403
          : result.status === SCOPED_STATUS.CONFLICT
            ? 409
            : 400;
      return res
        .status(status)
        .type("text")
        .send(result.message || result.reason || "Invitation could not be created.");
    }
    const inviteLink = result.invitationUrl || "";
    const whatsapp = result.whatsappUrl
      ? `<p><a data-bb-invite-whatsapp="1" href="${String(result.whatsappUrl).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">Share on WhatsApp</a></p>`
      : "";
    const emailBtn = result.emailDisplay
      ? `<p><a data-bb-invite-email="1" href="mailto:${encodeURIComponent(result.emailDisplay)}">Share by email</a></p>`
      : `<p data-bb-invite-email-disabled="1">Share by email unavailable (no email)</p>`;
    return res.status(201).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Team member added</title></head>
<body>
  <h1 data-bb-invite-result="1">Team member added</h1>
  <p>Placement: <strong>${String((result.branch && result.branch.displayName) || "Branch").replace(/</g, "&lt;")}</strong></p>
  <p data-bb-invite-copy-once="1">Copy this invitation link once — it will not be shown again.</p>
  <p><input readonly data-bb-invite-link="1" value="${inviteLink.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" style="width:100%"/></p>
  <p><button type="button" data-bb-copy-invite="1">Copy link</button></p>
  ${whatsapp}
  ${emailBtn}
  <p><a href="/branch-admin">Back</a></p>
  <script>
  (function(){
    var b=document.querySelector('[data-bb-copy-invite]');
    var i=document.querySelector('[data-bb-invite-link]');
    if(!b||!i)return;
    b.onclick=function(){
      var u=i.value||'';
      if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(u);
      else{i.select();try{document.execCommand('copy')}catch(e){}}
    };
  })();
  </script>
</body></html>`);
  });

  router.post("/branch-admin/logout", rejectApex, async (req, res) => {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return res.status(403).type("text").send("Invalid or missing CSRF token.");
    }
    const deployment = getPlatformDeploymentCode(env);
    const rawToken = readV5SessionCookie(req, env);
    try {
      if (deployment.ok && deployment.code && rawToken) {
        await revokeV5Session(getPool(), {
          rawToken,
          deploymentCode: deployment.code,
        });
      }
    } catch {
      /* fail-open clear cookie */
    }
    clearV5SessionCookie(res, { secure: isProduction, env });
    clearSupportContextCookie(res, { secure: isProduction, env });
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction });
    return res.redirect(303, "/login");
  });

  router.post("/branch-admin/support/exit", rejectApex, async (req, res) => {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return res.status(403).type("text").send("Invalid or missing CSRF token.");
    }
    const session =
      req.v5Session && req.v5Session.authenticated && req.v5Session.session
        ? req.v5Session.session
        : null;
    if (!session || !session.userId) {
      return res.redirect(303, "/login");
    }
    await exitSupport(getPool(), {
      actorUserId: session.userId,
      rawToken: readSupportContextCookie(req, env),
      env,
    });
    clearSupportContextCookie(res, { secure: isProduction, env });
    return res.redirect(303, "/admin");
  });

  return router;
}

module.exports = {
  createBranchAdminRouter,
  renderBranchAdminView,
  sendLoginUnavailable,
};
