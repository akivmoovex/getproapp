"use strict";

/**
 * Phase3 Branch Admin website change submissions (create / track / withdraw).
 * Canonical prefix: /branch-admin/website/...
 */

const express = require("express");
const { renderV5Ejs } = require("./v5EjsTemplateCache");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const { buildBranchAdminShellLocals } = require("./branchAdminShellLocals");
const {
  CSRF_FIELD,
  validateCsrf,
} = require("../../platform/http/v5Csrf");
const {
  authorizeBlessBoardTenantAccess,
  STATUS: AUTHZ_STATUS,
} = require("../services/authorizeBlessBoardTenantAccess");
const authzRepo = require("../repositories/blessBoardAuthorizationRepository");
const svc = require("../services/websiteChangeSubmissionService");
const { publicChurchHomePath } = require("../urls/churchUrlHelper");
const { EDIT_QUERY } = require("./attachWebsiteAdminChrome");

function renderView(relativePath, data) {
  return renderV5Ejs(relativePath, data);
}

/**
 * Canonical Branch Admin visual-editor entry for the session-resolved church.
 * Org key comes from tenant context only — never from client input.
 * @param {object} tenant
 * @returns {string|null}
 */
function resolveBranchWebsiteEditorPath(tenant) {
  const org =
    tenant && tenant.organization
      ? tenant.organization.key || tenant.organization.organizationKey || null
      : null;
  const home = publicChurchHomePath(org);
  if (!home) return null;
  return `${home}?${EDIT_QUERY}=1`;
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
  try {
    res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Surrogate-Control", "no-store");
    res.setHeader("Vary", "Cookie");
  } catch {
    /* headers may be unavailable */
  }
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
  <title>Website submissions · BlessBoard</title>
  <link rel="stylesheet" href="/blessboard/v5/branch-admin.css?v=39" />
</head>
<body class="bb-ba-body">
  <main class="bb-ba-login-unavailable">
    <h1>${status === 401 ? "Sign-in required" : status === 404 ? "Not found" : "Unavailable"}</h1>
    <p>${safe}</p>
    <p><a href="/branch-admin">Branch home</a></p>
  </main>
</body>
</html>`);
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 * }} deps
 */
function createWebsiteChangeSubmissionBranchRouter(deps) {
  const router = express.Router();
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const isProduction = String(env.NODE_ENV || "") === "production";

  const rejectApex = createRejectApex({
    isApexHost,
    mode: "unlessTenant",
    sendUnavailable: (req, res) => sendControlled(req, res, 404, "Not found on this host."),
  });

  /**
   * Prefer the caller's branch_admin assignment; HQ/platform fall back to primary branch.
   * @param {import('express').Request} req
   * @param {object} tenant
   */
  async function resolveActorBranchId(req, tenant) {
    const session = req.v5Session && req.v5Session.session;
    if (!session || !session.userId || !tenant || !tenant.organization || !tenant.church) {
      return null;
    }
    const roles = await authzRepo.listActiveAuthorizationRoles(getPool(), session.userId);
    const orgId = String(tenant.organization.id);
    const churchId = String(tenant.church.id);
    const branchRole = (roles || []).find(
      (r) =>
        r.roleKey === "branch_admin" &&
        String(r.organizationId) === orgId &&
        String(r.churchId) === churchId &&
        r.branchId
    );
    if (branchRole && branchRole.branchId) return String(branchRole.branchId);
    if (tenant.primaryBranch && tenant.primaryBranch.id) {
      return String(tenant.primaryBranch.id);
    }
    return null;
  }

  async function gateBranch(req, res, next) {
    const sessionOk = Boolean(req.v5Session && req.v5Session.authenticated);
    if (!sessionOk) {
      const wantsHtml = String(req.get("accept") || "").includes("text/html");
      if (wantsHtml) {
        const nextUrl = encodeURIComponent(req.originalUrl || "/branch-admin/website");
        return res.redirect(303, `/login?next=${nextUrl}`);
      }
      return sendControlled(req, res, 401, "Sign-in is required.");
    }

    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.organization || !tenant.church) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }

    try {
      const branchId = await resolveActorBranchId(req, tenant);
      if (!branchId) {
        return sendControlled(req, res, 403, "You do not have access to this site.");
      }
      const session = req.v5Session.session;
      const authz = await authorizeBlessBoardTenantAccess(getPool(), {
        userId: session.userId,
        tenant,
        branchId,
      });
      if (authz.status === AUTHZ_STATUS.LOOKUP_ERROR) {
        return sendControlled(req, res, 503, "Access check is temporarily unavailable.");
      }
      if (!authz.ok) {
        return sendControlled(req, res, 403, "You do not have access to this site.");
      }
      const keys = (authz.context.effectiveRoles || []).map((r) => r.roleKey);
      const allowed = ["branch_admin", "church_hq_admin", "platform_admin"];
      if (!keys.some((k) => allowed.includes(k))) {
        return sendControlled(req, res, 403, "You do not have access to this site.");
      }
      req.blessBoardAuthorizationContext = { ...authz.context, reason: authz.status };
      req.blessBoardActorBranchId = branchId;
      return next();
    } catch {
      return sendControlled(req, res, 503, "Access check is temporarily unavailable.");
    }
  }

  function actorUserId(req) {
    const session = req.v5Session && req.v5Session.session;
    return session && session.userId ? String(session.userId) : null;
  }

  function requireBranchTenant(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    if (
      !tenant ||
      !tenant.organization ||
      !tenant.organization.id ||
      !tenant.church ||
      !tenant.church.id ||
      !req.blessBoardActorBranchId
    ) {
      sendControlled(req, res, 403, "You do not have access to this site.");
      return null;
    }
    return {
      ...tenant,
      actorBranchId: String(req.blessBoardActorBranchId),
    };
  }

  /**
   * Branch isolation before CSRF: out-of-scope submission IDs return 404 uniformly.
   * @returns {Promise<boolean>} true when the submission is in the actor branch scope
   */
  async function requireScopedBranchSubmission(req, res, tenant, submissionId) {
    const scoped = await svc.assertSubmissionInOrganizationBranch(getPool(), {
      organizationId: tenant.organization.id,
      branchId: tenant.actorBranchId,
      submissionId,
    });
    if (!scoped.ok) {
      if (
        scoped.status === svc.STATUS.NOT_FOUND ||
        scoped.status === svc.STATUS.INVALID_INPUT
      ) {
        sendControlled(req, res, 404, "This submission was not found.");
        return false;
      }
      sendControlled(req, res, 503, "Submission is temporarily unavailable.");
      return false;
    }
    return true;
  }

  function shellLocals(req, res, extras) {
    return buildBranchAdminShellLocals(req, res, {
      env,
      isProduction,
      activeNav: (extras && extras.activeNav) || "website_submissions",
      pageTitle: extras && extras.pageTitle ? extras.pageTitle : "Website submissions",
      extra: extras,
    });
  }

  function editorPath(tenant) {
    return resolveBranchWebsiteEditorPath(tenant) || "/branch-admin/content";
  }

  function draftFieldsFromBody(body) {
    return {
      title: body && body.title,
      pageKey: body && body.page_key,
      sectionKey: body && body.section_key,
      reason: body && body.reason,
      submitterNote: body && body.submitter_note,
      priority: body && body.priority,
      requestedPublicationDate: body && body.requested_publication_date,
      changeType: body && body.change_type,
      proposedContent: svc.buildProposedFromBody(body),
      checklist: svc.parseChecklist(body),
    };
  }

  /**
   * Canonical Website nav entry: open the church public site in authenticated edit mode.
   * Overview hub lives at /branch-admin/website/overview; change requests stay under /submissions.
   */
  router.get("/branch-admin/website", rejectApex, gateBranch, async (req, res) => {
    const tenant = requireBranchTenant(req, res);
    if (!tenant) return;

    const editorHref = resolveBranchWebsiteEditorPath(tenant);
    if (!editorHref) {
      return sendControlled(
        req,
        res,
        503,
        "Website editor is temporarily unavailable."
      );
    }
    return res.redirect(303, editorHref);
  });

  router.get("/branch-admin/website/overview", rejectApex, gateBranch, async (req, res) => {
    const tenant = requireBranchTenant(req, res);
    if (!tenant) return;

    const {
      loadBranchWebsiteOverview,
    } = require("../services/websiteOverviewService");
    const overview = await loadBranchWebsiteOverview(getPool(), {
      organizationId: tenant.organization.id,
      churchId: tenant.church.id,
      branchId: tenant.actorBranchId,
      organizationKey:
        tenant.organization.key || tenant.organization.organizationKey || null,
      branchDisplayName:
        (tenant.primaryBranch && tenant.primaryBranch.displayName) || null,
      env,
    });
    if (!overview.ok) {
      const code =
        overview.status === "forbidden" || overview.status === "not_found" ? 404 : 503;
      return sendControlled(
        req,
        res,
        code,
        code === 404 ? "Not found." : "Website overview is temporarily unavailable."
      );
    }

    const html = renderView(
      "branch-admin/phase4-branch-website-overview.ejs",
      await Promise.resolve(
        shellLocals(req, res, {
          pageTitle: "Branch Website",
          activeNav: "website",
          overview,
        })
      )
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/branch-admin/website/submissions", rejectApex, gateBranch, async (req, res) => {
    const tenant = requireBranchTenant(req, res);
    if (!tenant) return;

    const result = await svc.listBranchSubmissions(getPool(), {
      organizationId: tenant.organization.id,
      branchId: tenant.actorBranchId,
      q: req.query && req.query.q,
      status: req.query && req.query.status,
      pageKey: req.query && req.query.page,
    });

    if (!result.ok) {
      return sendControlled(req, res, 503, "Submissions are temporarily unavailable.");
    }

    const html = renderView(
      "branch-admin/phase3-branch-website-submissions.ejs",
      shellLocals(req, res, {
        pageTitle: "My Website Submissions",
        items: result.items,
        total: result.total,
        summary: result.summary,
        pageKeys: result.pageKeys,
        filters: result.filters,
        statusLabels: svc.STATUS_LABELS,
        editorPath: editorPath(tenant),
        notice: String((req.query && req.query.notice) || "") || null,
      })
    );
    return res.type("html").send(html);
  });

  router.get(
    "/branch-admin/website/submissions/:submissionId",
    rejectApex,
    gateBranch,
    async (req, res) => {
      const tenant = requireBranchTenant(req, res);
      if (!tenant) return;

      const result = await svc.loadBranchSubmission(getPool(), {
        organizationId: tenant.organization.id,
        branchId: tenant.actorBranchId,
        submissionId: req.params.submissionId,
      });

      if (!result.ok) {
        if (result.status === svc.STATUS.NOT_FOUND || result.status === svc.STATUS.INVALID_INPUT) {
          return sendControlled(req, res, 404, "This submission was not found.");
        }
        return sendControlled(req, res, 503, "Submission is temporarily unavailable.");
      }

      const html = renderView(
        "branch-admin/phase3-branch-website-submission-detail.ejs",
        shellLocals(req, res, {
          pageTitle: result.submission.title || "Submission",
          submission: result.submission,
          events: result.events,
          comparison: result.comparison,
          actions: result.actions,
          statusLabels: svc.STATUS_LABELS,
          eventLabels: svc.EVENT_LABELS,
          listPath: "/branch-admin/website/submissions",
          editorPath: editorPath(tenant),
          notice: String((req.query && req.query.notice) || "") || null,
          formError: String((req.query && req.query.error) || "") || null,
        })
      );
      return res.type("html").send(html);
    }
  );

  router.get("/branch-admin/website/submit", rejectApex, gateBranch, async (req, res) => {
    const tenant = requireBranchTenant(req, res);
    if (!tenant) return;

    const model = await svc.buildBranchSubmissionFormModel(getPool(), {
      organizationId: tenant.organization.id,
      churchId: tenant.church.id,
      branchId: tenant.actorBranchId,
      submissionId: req.query && req.query.submission,
      pageKey: req.query && req.query.page,
      sectionKey: req.query && req.query.section,
    });

    if (!model.ok) {
      if (model.status === svc.STATUS.NOT_FOUND) {
        return sendControlled(req, res, 404, "This submission was not found.");
      }
      if (model.status === svc.STATUS.CONFLICT) {
        return res.redirect(
          303,
          `/branch-admin/website/submissions/${encodeURIComponent(req.query.submission)}`
        );
      }
      return sendControlled(req, res, 503, "Submission form is temporarily unavailable.");
    }

    const html = renderView(
      "branch-admin/phase4-submit-branch-website-update.ejs",
      shellLocals(req, res, {
        pageTitle: "Submit Branch Website Update",
        model,
        statusLabels: svc.STATUS_LABELS,
        priorities: svc.PRIORITIES,
        editorPath: editorPath(tenant),
        listPath: "/branch-admin/website/submissions",
        formError: String((req.query && req.query.error) || "") || null,
        notice: String((req.query && req.query.notice) || "") || null,
        branchDisplayName:
          (tenant.primaryBranch &&
            (tenant.primaryBranch.displayName || tenant.primaryBranch.key)) ||
          "Branch",
      })
    );
    return res.type("html").send(html);
  });

  router.post(
    "/branch-admin/website/submissions/draft",
    rejectApex,
    gateBranch,
    async (req, res) => {
      const tenant = requireBranchTenant(req, res);
      if (!tenant) return;
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return sendControlled(req, res, 403, "Invalid or missing CSRF token.");
      }
      const actor = actorUserId(req);
      if (!actor) return sendControlled(req, res, 401, "Sign-in is required.");

      const fields = draftFieldsFromBody(req.body);
      const result = await svc.saveBranchSubmissionDraft(getPool(), {
        organizationId: tenant.organization.id,
        churchId: tenant.church.id,
        branchId: tenant.actorBranchId,
        actorUserId: actor,
        submissionId: req.body && req.body.submission_id,
        ...fields,
      });

      if (!result.ok) {
        const err = result.reason || "invalid_input";
        return res.redirect(
          303,
          `/branch-admin/website/submit?error=${encodeURIComponent(err)}`
        );
      }
      return res.redirect(
        303,
        `/branch-admin/website/submissions/${result.submission.id}?notice=draft_saved`
      );
    }
  );

  router.post(
    "/branch-admin/website/submissions/:submissionId/save",
    rejectApex,
    gateBranch,
    async (req, res) => {
      const tenant = requireBranchTenant(req, res);
      if (!tenant) return;
      if (!(await requireScopedBranchSubmission(req, res, tenant, req.params.submissionId))) {
        return;
      }
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return sendControlled(req, res, 403, "Invalid or missing CSRF token.");
      }
      const actor = actorUserId(req);
      if (!actor) return sendControlled(req, res, 401, "Sign-in is required.");

      const fields = draftFieldsFromBody(req.body);
      const result = await svc.saveBranchSubmissionDraft(getPool(), {
        organizationId: tenant.organization.id,
        churchId: tenant.church.id,
        branchId: tenant.actorBranchId,
        actorUserId: actor,
        submissionId: req.params.submissionId,
        ...fields,
      });

      if (!result.ok) {
        if (result.status === svc.STATUS.NOT_FOUND) {
          return sendControlled(req, res, 404, "This submission was not found.");
        }
        return res.redirect(
          303,
          `/branch-admin/website/submit?submission=${encodeURIComponent(
            req.params.submissionId
          )}&error=${encodeURIComponent(result.reason || "invalid_input")}`
        );
      }
      return res.redirect(
        303,
        `/branch-admin/website/submissions/${result.submission.id}?notice=draft_saved`
      );
    }
  );

  router.post(
    "/branch-admin/website/submissions/:submissionId/submit",
    rejectApex,
    gateBranch,
    async (req, res) => {
      const tenant = requireBranchTenant(req, res);
      if (!tenant) return;
      if (!(await requireScopedBranchSubmission(req, res, tenant, req.params.submissionId))) {
        return;
      }
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return sendControlled(req, res, 403, "Invalid or missing CSRF token.");
      }
      const actor = actorUserId(req);
      if (!actor) return sendControlled(req, res, 401, "Sign-in is required.");

      const fields = draftFieldsFromBody(req.body);
      const result = await svc.submitBranchSubmission(getPool(), {
        organizationId: tenant.organization.id,
        churchId: tenant.church.id,
        branchId: tenant.actorBranchId,
        actorUserId: actor,
        submissionId: req.params.submissionId,
        saveFirst: true,
        ...fields,
      });

      if (!result.ok) {
        if (result.status === svc.STATUS.NOT_FOUND) {
          return sendControlled(req, res, 404, "This submission was not found.");
        }
        const err = result.reason || "invalid_input";
        return res.redirect(
          303,
          `/branch-admin/website/submit?submission=${encodeURIComponent(
            req.params.submissionId
          )}&error=${encodeURIComponent(err)}`
        );
      }
      return res.redirect(
        303,
        `/branch-admin/website/submissions/${result.submission.id}?notice=submitted`
      );
    }
  );

  // New submission submit (no id yet): save draft then submit.
  router.post("/branch-admin/website/submissions/submit", rejectApex, gateBranch, async (req, res) => {
    const tenant = requireBranchTenant(req, res);
    if (!tenant) return;
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return sendControlled(req, res, 403, "Invalid or missing CSRF token.");
    }
    const actor = actorUserId(req);
    if (!actor) return sendControlled(req, res, 401, "Sign-in is required.");

    const fields = draftFieldsFromBody(req.body);
    const result = await svc.submitBranchSubmission(getPool(), {
      organizationId: tenant.organization.id,
      churchId: tenant.church.id,
      branchId: tenant.actorBranchId,
      actorUserId: actor,
      submissionId: req.body && req.body.submission_id,
      saveFirst: true,
      ...fields,
    });

    if (!result.ok) {
      return res.redirect(
        303,
        `/branch-admin/website/submit?error=${encodeURIComponent(result.reason || "invalid_input")}`
      );
    }
    return res.redirect(
      303,
      `/branch-admin/website/submissions/${result.submission.id}?notice=submitted`
    );
  });

  router.post(
    "/branch-admin/website/submissions/:submissionId/withdraw",
    rejectApex,
    gateBranch,
    async (req, res) => {
      const tenant = requireBranchTenant(req, res);
      if (!tenant) return;
      if (!(await requireScopedBranchSubmission(req, res, tenant, req.params.submissionId))) {
        return;
      }
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return sendControlled(req, res, 403, "Invalid or missing CSRF token.");
      }
      const actor = actorUserId(req);
      if (!actor) return sendControlled(req, res, 401, "Sign-in is required.");

      const result = await svc.withdrawBranchSubmission(getPool(), {
        organizationId: tenant.organization.id,
        branchId: tenant.actorBranchId,
        submissionId: req.params.submissionId,
        actorUserId: actor,
      });

      if (!result.ok) {
        if (result.status === svc.STATUS.NOT_FOUND) {
          return sendControlled(req, res, 404, "This submission was not found.");
        }
        return res.redirect(
          303,
          `/branch-admin/website/submissions/${encodeURIComponent(
            req.params.submissionId
          )}?error=${encodeURIComponent(result.reason || "invalid_transition")}`
        );
      }
      return res.redirect(
        303,
        `/branch-admin/website/submissions/${result.submission.id}?notice=withdrawn`
      );
    }
  );

  router.post(
    "/branch-admin/website/submissions/:submissionId/duplicate",
    rejectApex,
    gateBranch,
    async (req, res) => {
      const tenant = requireBranchTenant(req, res);
      if (!tenant) return;
      if (!(await requireScopedBranchSubmission(req, res, tenant, req.params.submissionId))) {
        return;
      }
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return sendControlled(req, res, 403, "Invalid or missing CSRF token.");
      }
      const actor = actorUserId(req);
      if (!actor) return sendControlled(req, res, 401, "Sign-in is required.");

      const result = await svc.duplicateBranchSubmissionDraft(getPool(), {
        organizationId: tenant.organization.id,
        branchId: tenant.actorBranchId,
        submissionId: req.params.submissionId,
        actorUserId: actor,
      });

      if (!result.ok) {
        if (result.status === svc.STATUS.NOT_FOUND) {
          return sendControlled(req, res, 404, "This submission was not found.");
        }
        return res.redirect(
          303,
          `/branch-admin/website/submissions/${encodeURIComponent(
            req.params.submissionId
          )}?error=${encodeURIComponent(result.reason || "invalid_transition")}`
        );
      }
      return res.redirect(
        303,
        `/branch-admin/website/submit?submission=${result.submission.id}&notice=duplicated`
      );
    }
  );

  router.get(
    "/branch-admin/website/submissions/:submissionId/comments",
    rejectApex,
    gateBranch,
    async (req, res) => {
      const tenant = requireBranchTenant(req, res);
      if (!tenant) return;
      const result = await svc.listSubmissionConversation(getPool(), {
        organizationId: tenant.organization.id,
        branchId: tenant.actorBranchId,
        submissionId: req.params.submissionId,
        includeInternal: false,
      });
      if (!result.ok) {
        if (result.status === svc.STATUS.NOT_FOUND) {
          return sendControlled(req, res, 404, "This submission was not found.");
        }
        return sendControlled(req, res, 503, "Comments are temporarily unavailable.");
      }
      const html = await renderView(
        "hq/phase3-submission-review-comments.ejs",
        await shellLocals(req, res, {
          pageTitle: "Submission Review Comments",
          shellKind: "branch",
          submission: result.submission,
          events: result.events,
          eventLabels: result.eventLabels,
          commentsPostPath: `/branch-admin/website/submissions/${result.submission.id}/comments`,
          commentsBackPath: `/branch-admin/website/submissions/${result.submission.id}`,
          formError: String((req.query && req.query.error) || "") || null,
          notice: String((req.query && req.query.notice) || "") || null,
        })
      );
      return res.type("html").send(html);
    }
  );

  router.post(
    "/branch-admin/website/submissions/:submissionId/comments",
    rejectApex,
    gateBranch,
    async (req, res) => {
      const tenant = requireBranchTenant(req, res);
      if (!tenant) return;
      if (!(await requireScopedBranchSubmission(req, res, tenant, req.params.submissionId))) {
        return;
      }
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return sendControlled(req, res, 403, "Invalid or missing CSRF token.");
      }
      const actor = actorUserId(req);
      if (!actor) return sendControlled(req, res, 401, "Sign-in is required.");

      const result = await svc.addSubmissionComment(getPool(), {
        organizationId: tenant.organization.id,
        branchId: tenant.actorBranchId,
        submissionId: req.params.submissionId,
        actorUserId: actor,
        actorRole: "branch_admin",
        comment: req.body && req.body.comment,
        visibility: "shared",
        pageKey: req.body && req.body.page_key,
        sectionKey: req.body && req.body.section_key,
        allowInternal: false,
      });
      const base = `/branch-admin/website/submissions/${encodeURIComponent(req.params.submissionId)}/comments`;
      if (!result.ok) {
        if (result.status === svc.STATUS.NOT_FOUND) {
          return sendControlled(req, res, 404, "This submission was not found.");
        }
        if (result.status === svc.STATUS.FORBIDDEN) {
          return sendControlled(req, res, 403, "Internal comments are not allowed for branch users.");
        }
        return res.redirect(
          303,
          `${base}?error=${encodeURIComponent(result.reason || "invalid_input")}`
        );
      }
      return res.redirect(303, `${base}?notice=comment_added`);
    }
  );

  return router;
}

module.exports = {
  createWebsiteChangeSubmissionBranchRouter,
};
