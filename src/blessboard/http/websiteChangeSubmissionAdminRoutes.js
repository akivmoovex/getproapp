"use strict";

/**
 * Phase3 HQ website change submissions list + review routes.
 */

const express = require("express");
const { renderV5Ejs } = require("./v5EjsTemplateCache");
const {
  createRequireBlessBoardTenantRole,
} = require("./requireBlessBoardTenantRole");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const { buildHqAdminShellLocals } = require("./hqAdminShellLocals");
const {
  CSRF_FIELD,
  validateCsrf,
} = require("../../platform/http/v5Csrf");
const {
  hqContentPagePath,
  hqPreviewPagePath,
} = require("../urls/churchUrlHelper");
const svc = require("../services/websiteChangeSubmissionService");

/**
 * @param {string} relativePath
 * @param {object} data
 */
function renderHqView(relativePath, data) {
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
function sendControlled(req, res, status, message) {
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
  <title>Website change submissions · BlessBoard</title>
  <link rel="stylesheet" href="/blessboard/v5/hq-admin.css?v=57" />
</head>
<body class="bb-hq-body">
  <main class="bb-hq-login-unavailable">
    <h1>${status === 401 ? "Sign-in required" : status === 404 ? "Not found" : "Unavailable"}</h1>
    <p>${safe}</p>
    <p><a href="/hq">HQ home</a></p>
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
function createWebsiteChangeSubmissionAdminRouter(deps) {
  const router = express.Router();
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const isProduction = String(env.NODE_ENV || "") === "production";

  const requireHq = createRequireBlessBoardTenantRole({
    getPool,
    allowedRoles: ["church_hq_admin", "platform_admin"],
  });

  const rejectApex = createRejectApex({
    isApexHost,
    mode: "unlessTenant",
    sendUnavailable: (req, res) => sendControlled(req, res, 404, "Not found on this host."),
  });

  function gateHq(req, res, next) {
    const sessionOk = Boolean(req.v5Session && req.v5Session.authenticated);
    if (!sessionOk) {
      const wantsHtml = String(req.get("accept") || "").includes("text/html");
      if (wantsHtml) {
        return res.redirect(303, "/login?next=/hq/website/change-submissions");
      }
      return sendControlled(req, res, 401, "Sign-in is required.");
    }
    return requireHq(req, res, next);
  }

  async function shellLocals(req, res, extras) {
    return buildHqAdminShellLocals(req, res, {
      env,
      isProduction,
      activeNav: "content",
      pageTitle: extras && extras.pageTitle ? extras.pageTitle : "Website change submissions",
      getPool,
      extra: extras,
    });
  }

  function actorUserId(req) {
    const session = req.v5Session && req.v5Session.session;
    return session && session.userId ? String(session.userId) : null;
  }

  function requireTenant(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.organization || !tenant.organization.id) {
      sendControlled(req, res, 403, "You do not have access to this site.");
      return null;
    }
    if (!tenant.church || !tenant.church.id) {
      sendControlled(req, res, 403, "You do not have access to this site.");
      return null;
    }
    return tenant;
  }

  router.get("/hq/website/change-submissions", rejectApex, gateHq, async (req, res) => {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const result = await svc.loadSubmissionsList(getPool(), {
      organizationId: tenant.organization.id,
      q: req.query && req.query.q,
      status: req.query && req.query.status,
      branchId: req.query && req.query.branch,
      pageKey: req.query && req.query.page,
      submittedBy: req.query && req.query.submitted_by,
      submittedFrom: req.query && req.query.from,
      submittedTo: req.query && req.query.to,
    });

    if (!result.ok) {
      if (result.status === svc.STATUS.LOOKUP_ERROR) {
        const html = renderHqView(
          "hq/phase3-website-change-submissions.ejs",
          await shellLocals(req, res, {
            pageTitle: "Website Change Submissions",
            items: [],
            total: 0,
            summary: {
              pendingReview: 0,
              changesRequested: 0,
              approvedToday: 0,
              recentlyPublished: 0,
            },
            pageKeys: [],
            submitters: [],
            branches: [],
            filters: {
              q: "",
              status: "",
              branchId: "",
              pageKey: "",
              submittedBy: "",
              submittedFrom: "",
              submittedTo: "",
            },
            statusLabels: svc.STATUS_LABELS,
            editorPath: hqContentPagePath("home"),
            previewPathFor: (pageKey) => hqPreviewPagePath(pageKey),
            queryError: "Submissions could not be loaded. Try again shortly.",
            notice: null,
          })
        );
        return res.status(503).type("html").send(html);
      }
      return sendControlled(req, res, 503, "Submissions are temporarily unavailable.");
    }

    const notice = String((req.query && req.query.notice) || "") || null;
    const html = renderHqView(
      "hq/phase3-website-change-submissions.ejs",
      await shellLocals(req, res, {
        pageTitle: "Website Change Submissions",
        items: result.items,
        total: result.total,
        summary: result.summary,
        pageKeys: result.pageKeys,
        submitters: result.submitters,
        branches: result.branches,
        filters: result.filters,
        statusLabels: svc.STATUS_LABELS,
        editorPath: hqContentPagePath("home"),
        previewPathFor: (pageKey) => hqPreviewPagePath(pageKey),
        queryError: null,
        notice,
      })
    );
    return res.type("html").send(html);
  });

  router.get(
    "/hq/website/change-submissions/:submissionId",
    rejectApex,
    gateHq,
    async (req, res) => {
      const tenant = requireTenant(req, res);
      if (!tenant) return;

      const result = await svc.loadSubmissionReview(getPool(), {
        organizationId: tenant.organization.id,
        submissionId: req.params.submissionId,
      });

      if (!result.ok) {
        if (result.status === svc.STATUS.NOT_FOUND) {
          return sendControlled(req, res, 404, "This submission was not found.");
        }
        if (result.status === svc.STATUS.INVALID_INPUT) {
          return sendControlled(req, res, 404, "This submission was not found.");
        }
        return sendControlled(req, res, 503, "Submission review is temporarily unavailable.");
      }

      const formError = String((req.query && req.query.error) || "") || null;
      const html = renderHqView(
        "hq/phase3-website-change-review.ejs",
        await shellLocals(req, res, {
          pageTitle: "Review Website Changes",
          submission: result.submission,
          events: result.events,
          comparison: result.comparison,
          reviewable: result.reviewable,
          proposedPreviewSupported: result.proposedPreviewSupported,
          approveAndPublishNowSupported: result.approveAndPublishNowSupported,
          statusLabels: svc.STATUS_LABELS,
          eventLabels: svc.EVENT_LABELS,
          listPath: "/hq/website/change-submissions",
          pagePreviewPath: hqPreviewPagePath(result.submission.pageKey),
          formError,
          notice: String((req.query && req.query.notice) || "") || null,
        })
      );
      return res.type("html").send(html);
    }
  );

  async function postDecision(req, res, action) {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return sendControlled(req, res, 403, "Invalid or missing CSRF token.");
    }

    const reviewerUserId = actorUserId(req);
    if (!reviewerUserId) {
      return sendControlled(req, res, 401, "Sign-in is required.");
    }

    const submissionId = req.params.submissionId;
    const detailPath = `/hq/website/change-submissions/${encodeURIComponent(submissionId)}`;

    let result;
    if (action === "approve") {
      result = await svc.approveSubmission(getPool(), {
        organizationId: tenant.organization.id,
        submissionId,
        reviewerUserId,
        reviewerComment: req.body && req.body.reviewer_comment,
      });
    } else if (action === "request-changes") {
      result = await svc.requestChanges(getPool(), {
        organizationId: tenant.organization.id,
        submissionId,
        reviewerUserId,
        feedback: req.body && req.body.feedback,
      });
    } else if (action === "reject") {
      result = await svc.rejectSubmission(getPool(), {
        organizationId: tenant.organization.id,
        submissionId,
        reviewerUserId,
        rejectionReason: req.body && req.body.rejection_reason,
      });
    } else {
      return sendControlled(req, res, 404, "Not found.");
    }

    if (!result.ok) {
      if (result.status === svc.STATUS.NOT_FOUND) {
        return sendControlled(req, res, 404, "This submission was not found.");
      }
      if (result.status === svc.STATUS.INVALID_INPUT) {
        const err =
          result.reason === "feedback_required"
            ? "feedback_required"
            : result.reason === "rejection_reason_required"
              ? "rejection_reason_required"
              : "invalid_input";
        return res.redirect(303, `${detailPath}?error=${encodeURIComponent(err)}`);
      }
      if (result.status === svc.STATUS.CONFLICT) {
        return res.redirect(303, `${detailPath}?error=invalid_transition`);
      }
      return sendControlled(req, res, 503, "The review decision could not be saved.");
    }

    const notice =
      action === "approve"
        ? "approved"
        : action === "request-changes"
          ? "changes_requested"
          : "rejected";
    return res.redirect(
      303,
      `/hq/website/change-submissions?notice=${encodeURIComponent(notice)}`
    );
  }

  router.post(
    "/hq/website/change-submissions/:submissionId/approve",
    rejectApex,
    gateHq,
    (req, res) => postDecision(req, res, "approve")
  );
  router.post(
    "/hq/website/change-submissions/:submissionId/request-changes",
    rejectApex,
    gateHq,
    (req, res) => postDecision(req, res, "request-changes")
  );
  router.post(
    "/hq/website/change-submissions/:submissionId/reject",
    rejectApex,
    gateHq,
    (req, res) => postDecision(req, res, "reject")
  );

  return router;
}

module.exports = {
  createWebsiteChangeSubmissionAdminRouter,
};
