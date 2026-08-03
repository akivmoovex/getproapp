"use strict";

/**
 * Minimal authenticated ActiveClinic staff account-lifecycle admin routes.
 * JSON-oriented foundation handlers (not final Staff UI).
 */

const {
  validateCsrf,
  CSRF_FIELD,
  issueCsrfToken,
  setCsrfCookie,
} = require("../../platform/http/v5Csrf");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");
const {
  createRequireActiveClinicAuth,
} = require("./loadActiveClinicAuth");
const {
  authorizeStaffPermission,
} = require("../services/activeClinicAuthorizationService");
const {
  inviteActiveClinicStaff,
  reissueStaffInvitation,
  revokeStaffInvitation,
  getInvitationStatus,
  RESULT: INVITE_RESULT,
} = require("../services/activeClinicStaffInvitationService");
const {
  issueAdminPasswordResetLink,
  revokeActiveClinicStaffSessions,
  requireStaffPasswordChange,
  unlockStaffTemporaryLock,
  suspendStaffAccess,
  restoreStaffAccess,
  RESULT: ADMIN_RESULT,
} = require("../services/activeClinicStaffAccountAdministrationService");
const {
  getHealthcareOrganizationByOrganizationId,
} = require("../services/healthcareOrganizationService");

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clientIp(req) {
  return String(
    (req.headers && req.headers["x-forwarded-for"]) ||
      req.ip ||
      (req.socket && req.socket.remoteAddress) ||
      ""
  )
    .split(",")[0]
    .trim();
}

function wantsJson(req) {
  const accept = String(req.headers.accept || "");
  return (
    accept.includes("application/json") ||
    req.headers["x-requested-with"] === "XMLHttpRequest"
  );
}

/**
 * @param {import('express').Express} app
 * @param {{ getPool: Function, env: NodeJS.ProcessEnv, isProduction: boolean }} deps
 */
function registerActiveClinicStaffAdminRoutes(app, deps) {
  const getPool = deps.getPool;
  const env = deps.env;
  const isProduction = deps.isProduction;
  const requireAuth = createRequireActiveClinicAuth({ env, isProduction });

  function issuePageCsrf(res) {
    const token = issueCsrfToken(env);
    setCsrfCookie(res, token, { secure: isProduction, env });
    return token;
  }

  async function assertPermission(req, permissionKey) {
    const auth = req.activeClinicAuth;
    if (!auth || !auth.authenticated) {
      return { ok: false, status: 401, code: "unauthenticated" };
    }
    const checked = await authorizeStaffPermission(getPool(), {
      organizationId: auth.organization.id,
      staffMemberId: auth.staffMember.id,
      platformIdentityId: auth.platformIdentity.id,
      permissionKey,
      facilityId: (auth.selectedFacility && auth.selectedFacility.id) || null,
    });
    if (!checked.allowed) {
      return { ok: false, status: 403, code: "access_denied" };
    }
    return { ok: true, auth };
  }

  function deny(res, req, status, code) {
    if (wantsJson(req)) {
      return res.status(status).json({ ok: false, code });
    }
    return res.status(status).type("html").send(
      `<!DOCTYPE html><html><body data-ac-error="${escapeHtml(code)}"><p>${escapeHtml(
        code
      )}</p><p><a href="/app">Back</a></p></body></html>`
    );
  }

  function renderInvitePanel(payload, csrfToken) {
    const share = payload.share || {};
    const wa = share.whatsappUrl
      ? `<p><a data-ac-invite-whatsapp="1" href="${escapeHtml(share.whatsappUrl)}" target="_blank" rel="noopener">Share on WhatsApp</a></p>`
      : "";
    const mail = share.mailtoUrl
      ? `<p><a data-ac-invite-email="1" href="${escapeHtml(share.mailtoUrl)}">Share by email</a></p>`
      : "";
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Invitation · ActiveClinic</title>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>
body{font-family:"Hanken Grotesk",system-ui,sans-serif;max-width:36rem;margin:2rem auto;padding:0 1rem;color:#1a2b2f}
.ac-card{border:1px solid #d5e0e3;border-radius:14px;padding:1rem;background:#fff}
.ac-muted{color:#5b6d72;font-size:.9rem}
input[readonly]{width:100%;padding:.6rem;border-radius:8px;border:1px solid #d5e0e3}
button{margin-top:.75rem;padding:.55rem 1rem;border:0;border-radius:999px;background:#0f766e;color:#fff;font:inherit;cursor:pointer}
a{color:#0f766e}
</style></head>
<body data-ac-page="invite-result">
  <h1>Invitation ready</h1>
  <div class="ac-card">
    <p><strong>${escapeHtml(payload.staffMember && payload.staffMember.displayName)}</strong></p>
    <p class="ac-muted">Delivery: ${escapeHtml(payload.deliveryStatus || "link_generated")} — automated email/SMS is not configured.</p>
    <label for="invite_url">Activation link</label>
    <input id="invite_url" readonly value="${escapeHtml(payload.activationUrl || "")}"/>
    <button type="button" data-ac-copy-invite="1">Copy link</button>
    ${wa}${mail}
    <p class="ac-muted" id="copy_status" hidden>Invitation link copied</p>
    <p><a href="/app">Back to app</a></p>
  </div>
  <script>
  (function(){
    var btn=document.querySelector("[data-ac-copy-invite]");
    var input=document.getElementById("invite_url");
    var status=document.getElementById("copy_status");
    if(!btn||!input) return;
    btn.addEventListener("click", function(){
      var text=input.value;
      function ok(){ if(status){ status.hidden=false; } }
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(ok).catch(function(){
          input.select(); document.execCommand("copy"); ok();
        });
      } else { input.select(); document.execCommand("copy"); ok(); }
    });
  })();
  </script>
</body></html>`;
  }

  // Invite new staff (network/facility admin with invite permission)
  app.post("/app/staff/invite", requireAuth, async (req, res, next) => {
    try {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return deny(res, req, 403, "csrf_invalid");
      }
      const gate = await assertPermission(req, "activeclinic.staff.invite");
      if (!gate.ok) return deny(res, req, gate.status, gate.code);

      const deployment = getPlatformDeploymentCode(env);
      const auth = gate.auth;
      const hco = await getHealthcareOrganizationByOrganizationId(getPool(), {
        organizationId: auth.organization.id,
      });
      if (!hco.ok) return deny(res, req, 404, "healthcare_organization_not_found");

      const facilityIds = [];
      if (req.body && req.body.facility_id) {
        facilityIds.push(String(req.body.facility_id));
      }
      const roleAssignments = [];
      if (req.body && req.body.role_key) {
        roleAssignments.push({
          roleKey: String(req.body.role_key),
          scopeType: String(req.body.scope_type || "organisation"),
          facilityId: req.body.role_facility_id || req.body.facility_id || null,
        });
      }

      const invited = await inviteActiveClinicStaff(getPool(), {
        organizationId: auth.organization.id,
        healthcareOrganizationId: hco.healthcareOrganization.id,
        facilityIds,
        firstName: req.body && req.body.first_name,
        lastName: req.body && req.body.last_name,
        preferredName: req.body && req.body.preferred_name,
        phone: req.body && req.body.phone,
        email: req.body && req.body.email,
        employmentType: (req.body && req.body.employment_type) || "permanent",
        jobTitle: req.body && req.body.job_title,
        roleAssignments,
        actorPlatformIdentityId: auth.platformIdentity.id,
        deploymentCode: deployment.code,
        env,
      });
      if (!invited.ok) {
        return deny(res, req, 400, invited.code || INVITE_RESULT.INVALID_INPUT);
      }
      if (wantsJson(req)) {
        return res.status(201).json({
          ok: true,
          staffMemberId: invited.staffMember.id,
          invitationId: invited.invitation.id,
          activationUrl: invited.activationUrl,
          expiresAt: invited.expiresAt,
          deliveryStatus: invited.deliveryStatus,
          share: invited.share,
          identityCreated: invited.identityCreated,
        });
      }
      return res.status(201).type("html").send(
        renderInvitePanel(invited, issuePageCsrf(res))
      );
    } catch (err) {
      return next(err);
    }
  });

  async function staffScopedAction(req, res, next, permissionKey, handler) {
    try {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return deny(res, req, 403, "csrf_invalid");
      }
      const gate = await assertPermission(req, permissionKey);
      if (!gate.ok) return deny(res, req, gate.status, gate.code);
      const deployment = getPlatformDeploymentCode(env);
      const result = await handler({
        pool: getPool(),
        auth: gate.auth,
        deploymentCode: deployment.code,
        staffMemberId: req.params.staffId,
        organizationId: gate.auth.organization.id,
        req,
      });
      if (!result.ok) {
        return deny(res, req, 400, result.code || "action_failed");
      }
      if (wantsJson(req) || result.json) {
        return res.status(200).json({ ok: true, ...result.body });
      }
      if (result.html) {
        return res.status(200).type("html").send(result.html);
      }
      return res.redirect(
        303,
        `/app/staff/${encodeURIComponent(req.params.staffId)}?ok=1`
      );
    } catch (err) {
      return next(err);
    }
  }

  app.post("/app/staff/:staffId/invitations", requireAuth, (req, res, next) =>
    staffScopedAction(req, res, next, "activeclinic.staff.invite", async (ctx) => {
      const issued = await reissueStaffInvitation(ctx.pool, {
        organizationId: ctx.organizationId,
        staffMemberId: ctx.staffMemberId,
        actorPlatformIdentityId: ctx.auth.platformIdentity.id,
        deploymentCode: ctx.deploymentCode,
        env,
      });
      if (!issued.ok) return issued;
      return {
        ok: true,
        html: renderInvitePanel(issued),
        body: {
          invitationId: issued.invitation.id,
          activationUrl: issued.activationUrl,
          deliveryStatus: issued.deliveryStatus,
          share: issued.share,
        },
        json: wantsJson(ctx.req),
      };
    })
  );

  app.post("/app/staff/:staffId/invitations/reissue", requireAuth, (req, res, next) =>
    staffScopedAction(req, res, next, "activeclinic.staff.invite", async (ctx) => {
      const issued = await reissueStaffInvitation(ctx.pool, {
        organizationId: ctx.organizationId,
        staffMemberId: ctx.staffMemberId,
        actorPlatformIdentityId: ctx.auth.platformIdentity.id,
        deploymentCode: ctx.deploymentCode,
        env,
      });
      if (!issued.ok) return issued;
      return {
        ok: true,
        body: {
          invitationId: issued.invitation.id,
          activationUrl: issued.activationUrl,
          deliveryStatus: issued.deliveryStatus,
          share: issued.share,
          expiresAt: issued.expiresAt,
        },
      };
    })
  );

  app.post("/app/staff/:staffId/invitations/revoke", requireAuth, (req, res, next) =>
    staffScopedAction(req, res, next, "activeclinic.staff.invite", async (ctx) => {
      const revoked = await revokeStaffInvitation(ctx.pool, {
        organizationId: ctx.organizationId,
        staffMemberId: ctx.staffMemberId,
        deploymentCode: ctx.deploymentCode,
      });
      if (!revoked.ok) return revoked;
      return { ok: true, body: { invitation: revoked.invitation } };
    })
  );

  app.get("/app/staff/:staffId/invitations", requireAuth, async (req, res, next) => {
    try {
      const gate = await assertPermission(req, "activeclinic.staff.view");
      if (!gate.ok) return deny(res, req, gate.status, gate.code);
      const status = await getInvitationStatus(getPool(), {
        organizationId: gate.auth.organization.id,
        staffMemberId: req.params.staffId,
      });
      return res.status(200).json(status);
    } catch (err) {
      return next(err);
    }
  });

  app.post("/app/staff/:staffId/send-reset", requireAuth, (req, res, next) =>
    staffScopedAction(
      req,
      res,
      next,
      "activeclinic.staff.manage_credentials",
      async (ctx) => {
        const issued = await issueAdminPasswordResetLink(ctx.pool, {
          organizationId: ctx.organizationId,
          staffMemberId: ctx.staffMemberId,
          actorPlatformIdentityId: ctx.auth.platformIdentity.id,
          deploymentCode: ctx.deploymentCode,
          requestIp: clientIp(ctx.req),
          env,
        });
        if (!issued.ok) return issued;
        return {
          ok: true,
          body: {
            resetUrl: issued.resetUrl,
            expiresAt: issued.expiresAt,
            deliveryStatus: issued.deliveryStatus,
            share: issued.share,
          },
        };
      }
    )
  );

  app.post("/app/staff/:staffId/revoke-sessions", requireAuth, (req, res, next) =>
    staffScopedAction(
      req,
      res,
      next,
      "activeclinic.staff.manage_credentials",
      async (ctx) => {
        const revoked = await revokeActiveClinicStaffSessions(ctx.pool, {
          organizationId: ctx.organizationId,
          staffMemberId: ctx.staffMemberId,
          deploymentCode: ctx.deploymentCode,
        });
        return revoked.ok
          ? { ok: true, body: { revokedCount: revoked.revokedCount } }
          : revoked;
      }
    )
  );

  app.post(
    "/app/staff/:staffId/require-password-change",
    requireAuth,
    (req, res, next) =>
      staffScopedAction(
        req,
        res,
        next,
        "activeclinic.staff.manage_credentials",
        async (ctx) => {
          const required = await requireStaffPasswordChange(ctx.pool, {
            organizationId: ctx.organizationId,
            staffMemberId: ctx.staffMemberId,
            deploymentCode: ctx.deploymentCode,
          });
          return required.ok
            ? { ok: true, body: { mustChangePassword: true } }
            : required;
        }
      )
  );

  app.post("/app/staff/:staffId/unlock", requireAuth, (req, res, next) =>
    staffScopedAction(
      req,
      res,
      next,
      "activeclinic.staff.manage_credentials",
      async (ctx) => {
        const unlocked = await unlockStaffTemporaryLock(ctx.pool, {
          organizationId: ctx.organizationId,
          staffMemberId: ctx.staffMemberId,
          deploymentCode: ctx.deploymentCode,
        });
        return unlocked.ok ? { ok: true, body: { unlocked: true } } : unlocked;
      }
    )
  );

  app.post("/app/staff/:staffId/suspend", requireAuth, (req, res, next) =>
    staffScopedAction(req, res, next, "activeclinic.staff.archive", async (ctx) => {
      const suspended = await suspendStaffAccess(ctx.pool, {
        organizationId: ctx.organizationId,
        staffMemberId: ctx.staffMemberId,
        deploymentCode: ctx.deploymentCode,
      });
      return suspended.ok
        ? {
            ok: true,
            body: {
              status: suspended.staffMember.status,
              sessionsRevoked: suspended.sessionsRevoked,
            },
          }
        : suspended;
    })
  );

  app.post("/app/staff/:staffId/restore", requireAuth, (req, res, next) =>
    staffScopedAction(req, res, next, "activeclinic.staff.archive", async (ctx) => {
      const restored = await restoreStaffAccess(ctx.pool, {
        organizationId: ctx.organizationId,
        staffMemberId: ctx.staffMemberId,
        deploymentCode: ctx.deploymentCode,
      });
      return restored.ok
        ? { ok: true, body: { status: restored.staffMember.status } }
        : restored;
    })
  );

  void ADMIN_RESULT;
}

module.exports = {
  registerActiveClinicStaffAdminRoutes,
};
