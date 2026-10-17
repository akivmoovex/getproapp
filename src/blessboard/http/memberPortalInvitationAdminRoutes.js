"use strict";

const express = require("express");
const { CSRF_FIELD, issueCsrfToken, setCsrfCookie, validateCsrf } = require("../../platform/http/v5Csrf");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { authorize } = require("../services/blessBoardRbacAuthorizationService");
const {
  PURPOSE,
  issueMemberPortalInvitation,
  resendMemberPortalInvitation,
  revokeMemberPortalInvitation,
} = require("../services/memberPortalInvitationService");
const { renderV5Ejs } = require("./v5EjsTemplateCache");

function createMemberPortalInvitationAdminRouter(deps) {
  const router = express.Router();
  const env = deps.env || process.env;
  const production = String(env.NODE_ENV || "") === "production";

  async function scope(req) {
    const tenant = resolveTenantForAuthorization(req);
    const session = req.v5Session && req.v5Session.authenticated && req.v5Session.session;
    if (!tenant || !tenant.organization || !tenant.church || !session) return null;
    return {
      tenant,
      actorUserId: session.userId,
      organizationId: tenant.organization.id,
      churchId: tenant.church.id,
      branchId: tenant.primaryBranch && tenant.primaryBranch.id,
    };
  }

  async function permitted(db, input, permission) {
    const result = await authorize(db, {
      permission,
      actor: { userId: input.actorUserId },
      tenantContext: {
        organizationId: input.organizationId,
        churchId: input.churchId,
        primaryBranchId: input.branchId || null,
      },
      resourceContext: {
        organizationId: input.organizationId,
        churchId: input.churchId,
        branchId: input.branchId || null,
      },
    });
    return Boolean(result && result.allowed);
  }

  async function load(db, memberId, input) {
    const member = await db.query(`
      select m.id, m.first_name, m.last_name, m.user_id, m.portal_access_status,
             m.email_display, c.organization_id,
             mb.branch_id, mb.is_primary
        from blessboard.members m
        join blessboard.churches c on c.id = m.church_id
        left join blessboard.member_branch_memberships mb
          on mb.member_id = m.id and mb.is_primary = true
       where m.id = $1 and m.church_id = $2
    `, [memberId, input.churchId]);
    if (!member.rows[0] || String(member.rows[0].organization_id) !== String(input.organizationId)) return null;
    const invitation = await db.query(`
      select id, status, expires_at
        from blessboard.member_portal_invitations
       where member_id = $1 and purpose = $2
       order by created_at desc limit 1
    `, [memberId, PURPOSE]);
    return { member: member.rows[0], invitation: invitation.rows[0] || null };
  }

  function page(res, data, status) {
    return res.set("Cache-Control", "no-store")
      .set("Referrer-Policy", "no-referrer")
      .status(status || 200).type("html").send(renderV5Ejs(
      "hq/member-invitation.ejs", data
    ));
  }

  async function getPage(req, res) {
    const input = await scope(req);
    if (!input) return res.status(403).send("You do not have access to this site.");
    const db = deps.getPool();
    if (!(await permitted(db, input, "members.view"))) return res.status(403).send("You do not have permission to view members.");
    const loaded = await load(db, req.params.id, input);
    if (!loaded) return res.status(404).send("Member not found.");
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: production, env, req });
    return page(res, { ...input, ...loaded, csrfToken, csrfField: CSRF_FIELD, oneTimeToken: null, message: null });
  }

  async function postAction(req, res) {
    const input = await scope(req);
    if (!input) return res.status(403).send("You do not have access to this site.");
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) return res.status(403).send("Invalid or missing CSRF token.");
    if (!(await permitted(deps.getPool(), input, "members.create"))) return res.status(403).send("You do not have permission to manage invitations.");
    const loaded = await load(deps.getPool(), req.params.id, input);
    if (!loaded) return res.status(404).send("Member not found.");
    const args = {
      actorUserId: input.actorUserId,
      organizationId: input.organizationId,
      churchId: input.churchId,
      branchId: loaded.member.branch_id,
      memberId: loaded.member.id,
      purpose: PURPOSE,
    };
    const action = String((req.body && req.body.action) || "");
    const result = action === "issue"
      ? await issueMemberPortalInvitation(deps.getPool(), args)
      : action === "resend"
        ? await resendMemberPortalInvitation(deps.getPool(), { ...args, invitationId: loaded.invitation && loaded.invitation.id })
        : action === "revoke"
          ? await revokeMemberPortalInvitation(deps.getPool(), { ...args, invitationId: loaded.invitation && loaded.invitation.id })
          : { ok: false, code: "invalid_action" };
    const latest = await load(deps.getPool(), req.params.id, input);
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: production, env, req });
    return page(res, {
      ...input, ...latest, csrfToken, csrfField: CSRF_FIELD,
      oneTimeToken: result.ok && result.rawToken ? result.rawToken : null,
      message: result.ok ? (result.rawToken ? "Invitation link generated once. Do not claim delivery." : "Invitation updated.") : "Invitation action was not permitted.",
    }, result.ok ? 200 : 400);
  }

  for (const prefix of ["/hq/members", "/branch-admin/members"]) {
    router.get(`${prefix}/:id/invitation`, getPage);
    router.post(`${prefix}/:id/invitation`, postAction);
  }
  return router;
}

module.exports = { createMemberPortalInvitationAdminRouter };
