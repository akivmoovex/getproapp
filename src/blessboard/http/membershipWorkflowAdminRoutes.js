"use strict";

/**
 * BlessBoard V8 membership workflow admin routes (BB01–BB02, BB11–BB18 extras).
 */

const express = require("express");
const {
  createRequireBlessBoardPermission,
} = require("./requireBlessBoardPermission");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const {
  createRequireV5AuthenticatedSession,
} = require("../../platform/http/v5SessionAuthGate");
const { CSRF_FIELD, validateCsrf } = require("../../platform/http/v5Csrf");
const {
  createMembershipIntakeForm,
  publishMembershipIntakeForm,
  listMembershipIntakeForms,
  requestNeedsFollowUp,
  updateRegistrationPastoralNotes,
  getMembershipApplicationForReview,
  requestMemberBranchTransfer,
  reviewMemberBranchTransfer,
  updateApprovedMemberProfile,
  STATUS,
} = require("../services/membershipWorkflowService");
const { buildHqAdminShellLocals } = require("./hqAdminShellLocals");
const { buildBranchAdminShellLocals } = require("./branchAdminShellLocals");
const { renderFormView } = require("../../platform/forms/renderFormView");

function createMembershipWorkflowAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const isProduction = String(env.NODE_ENV || "") === "production";
  const variant = deps.variant === "branch" ? "branch" : "hq";
  const basePath = variant === "hq" ? "/hq/membership" : "/branch-admin/membership";

  const router = express.Router();
  const requireView = createRequireBlessBoardPermission("members.view", null, {
    getPool,
    scopeMode: variant === "hq" ? "church" : undefined,
  });
  const requireSession = createRequireV5AuthenticatedSession({
    loginNext: basePath,
  });
  const rejectApex = createRejectApex({
    isApexHost,
    sendUnavailable: deps.sendUnavailable,
    mode: "unlessTenant",
  });

  function gate(req, res, next) {
    if (!requireSession(req, res, { loginNext: req.originalUrl || basePath })) return;
    return requireView(req, res, next);
  }

  function tenantContext(req) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id) return null;
    const session = req.v5Session && req.v5Session.session;
    if (!session || !session.userId) return null;
    return {
      tenant,
      churchId: tenant.church.id,
      branchId:
        variant === "branch"
          ? (tenant.primaryBranch && tenant.primaryBranch.id) || null
          : null,
      actorUserId: session.userId,
    };
  }

  function sendHtml(res, html, status) {
    res.status(status || 200).type("html").send(html);
  }

  router.use(basePath, rejectApex, gate);

  // BB01 — forms dashboard
  router.get(basePath + "/forms", async (req, res) => {
    const ctx = tenantContext(req);
    if (!ctx) return res.status(403).send("Forbidden");
    const listed = await listMembershipIntakeForms(getPool(), {
      churchId: ctx.churchId,
      actorUserId: ctx.actorUserId,
      tenant: ctx.tenant,
      branchId: ctx.branchId,
    });
    if (!listed.ok) return res.status(403).send("Forbidden");
    const { issueCsrfToken, setCsrfCookie } = require("../../platform/http/v5Csrf");
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction, env, req });
    return sendHtml(
      res,
      renderFormView("bb-membership-forms", {
        brand: { productName: "BlessBoard", productClass: "mx-forms--blessboard" },
        forms: listed.forms,
        basePath,
        stitchScreen: "BB01",
        mobile: true,
        csrfField: CSRF_FIELD,
        csrfToken,
        canManage: true,
        pageTitle: "Membership forms",
      })
    );
  });

  router.post(basePath + "/forms", async (req, res) => {
    const ctx = tenantContext(req);
    if (!ctx) return res.status(403).send("Forbidden");
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
      return res.status(403).send("CSRF");
    }
    const created = await createMembershipIntakeForm(getPool(), {
      churchId: ctx.churchId,
      branchId: ctx.branchId,
      actorUserId: ctx.actorUserId,
      tenant: ctx.tenant,
      title: req.body.title,
      formKey: req.body.form_key,
      description: req.body.description,
      enableSpiritualBackground: req.body.enable_spiritual !== "0",
      enableParticipationInterests: req.body.enable_interests !== "0",
    });
    if (!created.ok) return res.status(400).send(created.reason || "Unable to create");
    return res.redirect(303, `${basePath}/forms/${created.form.id}`);
  });

  router.get(basePath + "/forms/:formId", async (req, res) => {
    const ctx = tenantContext(req);
    if (!ctx) return res.status(403).send("Forbidden");
    const listed = await listMembershipIntakeForms(getPool(), {
      churchId: ctx.churchId,
      actorUserId: ctx.actorUserId,
      tenant: ctx.tenant,
    });
    const form = (listed.forms || []).find((f) => f.id === req.params.formId);
    if (!form) return res.status(404).send("Not found");
    const { issueCsrfToken, setCsrfCookie } = require("../../platform/http/v5Csrf");
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction, env, req });
    return sendHtml(
      res,
      renderFormView("bb-membership-form-edit", {
        brand: { productName: "BlessBoard", productClass: "mx-forms--blessboard" },
        form,
        basePath,
        stitchScreen: "BB02",
        mobile: true,
        csrfField: CSRF_FIELD,
        csrfToken,
        pageTitle: form.title,
      })
    );
  });

  router.post(basePath + "/forms/:formId/publish", async (req, res) => {
    const ctx = tenantContext(req);
    if (!ctx) return res.status(403).send("Forbidden");
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
      return res.status(403).send("CSRF");
    }
    await publishMembershipIntakeForm(getPool(), {
      churchId: ctx.churchId,
      formId: req.params.formId,
      actorUserId: ctx.actorUserId,
      tenant: ctx.tenant,
      branchId: ctx.branchId,
    });
    return res.redirect(303, `${basePath}/forms/${req.params.formId}`);
  });

  // BB13 — needs follow-up
  router.post(basePath + "/registrations/:registrationId/follow-up", async (req, res) => {
    const ctx = tenantContext(req);
    if (!ctx) return res.status(403).send("Forbidden");
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
      return res.status(403).send("CSRF");
    }
    const result = await requestNeedsFollowUp(getPool(), {
      registrationId: req.params.registrationId,
      actorUserId: ctx.actorUserId,
      tenant: ctx.tenant,
      branchId: ctx.branchId,
      reviewNotes: req.body.review_notes,
    });
    const back =
      variant === "hq"
        ? `/hq/registrations/${req.params.registrationId}`
        : `/branch-admin/registrations/${req.params.registrationId}`;
    if (!result.ok) return res.status(400).send(result.reason || "Unable to update");
    return res.redirect(303, back);
  });

  // Pastoral notes (restricted)
  router.post(basePath + "/registrations/:registrationId/pastoral-notes", async (req, res) => {
    const ctx = tenantContext(req);
    if (!ctx) return res.status(403).send("Forbidden");
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
      return res.status(403).send("CSRF");
    }
    const result = await updateRegistrationPastoralNotes(getPool(), {
      registrationId: req.params.registrationId,
      actorUserId: ctx.actorUserId,
      tenant: ctx.tenant,
      branchId: ctx.branchId,
      pastoralNotes: req.body.pastoral_notes,
    });
    const back =
      variant === "hq"
        ? `/hq/registrations/${req.params.registrationId}`
        : `/branch-admin/registrations/${req.params.registrationId}`;
    if (!result.ok) return res.status(403).send("Pastoral notes restricted");
    return res.redirect(303, back);
  });

  // BB16 transfers
  router.post(basePath + "/members/:memberId/transfer", async (req, res) => {
    const ctx = tenantContext(req);
    if (!ctx) return res.status(403).send("Forbidden");
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
      return res.status(403).send("CSRF");
    }
    if (!(req.body && (req.body.confirm_transfer === "1" || req.body.confirm_transfer === "on"))) {
      return res.status(400).send("Confirm the same-church transfer before continuing.");
    }
    const result = await requestMemberBranchTransfer(getPool(), {
      churchId: ctx.churchId,
      memberId: req.params.memberId,
      toBranchId: req.body.to_branch_id,
      reason: req.body.reason,
      actorUserId: ctx.actorUserId,
      tenant: ctx.tenant,
      branchId: ctx.branchId,
    });
    const back =
      variant === "hq"
        ? `/hq/members/${req.params.memberId}`
        : `/branch-admin/members/${req.params.memberId}`;
    if (!result.ok) return res.status(400).send(result.reason || "Unable to request transfer");
    return res.redirect(303, `${basePath}/transfers/${result.transfer.id}`);
  });

  router.get(basePath + "/transfers/:transferId", async (req, res) => {
    const ctx = tenantContext(req);
    if (!ctx) return res.status(403).send("Forbidden");
    const repo = require("../repositories/memberIdentityRepository");
    const transfer = await repo.getTransferById(getPool(), {
      id: req.params.transferId,
      churchId: ctx.churchId,
    });
    if (!transfer) return res.status(404).send("Not found");
    const { issueCsrfToken, setCsrfCookie } = require("../../platform/http/v5Csrf");
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction, env, req });
    return sendHtml(
      res,
      renderFormView("bb-membership-transfer", {
        brand: { productName: "BlessBoard", productClass: "mx-forms--blessboard" },
        transfer,
        basePath,
        stitchScreen: "BB16",
        mobile: true,
        csrfField: CSRF_FIELD,
        csrfToken,
        pageTitle: "Branch transfer",
      })
    );
  });

  router.post(basePath + "/transfers/:transferId/review", async (req, res) => {
    const ctx = tenantContext(req);
    if (!ctx) return res.status(403).send("Forbidden");
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
      return res.status(403).send("CSRF");
    }
    const result = await reviewMemberBranchTransfer(getPool(), {
      churchId: ctx.churchId,
      transferId: req.params.transferId,
      decision: req.body.decision,
      reviewerNotes: req.body.reviewer_notes,
      actorUserId: ctx.actorUserId,
      tenant: ctx.tenant,
      branchId: ctx.branchId,
    });
    if (!result.ok) return res.status(400).send(result.reason || "Unable to review");
    return res.redirect(303, `${basePath}/transfers/${req.params.transferId}`);
  });

  // BB15 member edit
  router.post(basePath + "/members/:memberId/edit", async (req, res) => {
    const ctx = tenantContext(req);
    if (!ctx) return res.status(403).send("Forbidden");
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
      return res.status(403).send("CSRF");
    }
    const result = await updateApprovedMemberProfile(getPool(), {
      churchId: ctx.churchId,
      memberId: req.params.memberId,
      actorUserId: ctx.actorUserId,
      tenant: ctx.tenant,
      branchId: ctx.branchId,
      firstName: req.body.first_name,
      lastName: req.body.last_name,
      preferredName: req.body.preferred_name,
      email: req.body.email,
      phone: req.body.phone,
    });
    const back =
      variant === "hq"
        ? `/hq/members/${req.params.memberId}`
        : `/branch-admin/members/${req.params.memberId}`;
    if (!result.ok) return res.status(400).send(result.reason || "Unable to save");
    return res.redirect(303, back);
  });

  void getMembershipApplicationForReview;
  void buildHqAdminShellLocals;
  void buildBranchAdminShellLocals;
  void STATUS;

  return router;
}

module.exports = {
  createMembershipWorkflowAdminRouter,
};
