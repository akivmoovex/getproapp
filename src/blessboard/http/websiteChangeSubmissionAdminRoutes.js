"use strict";

/**
 * Phase3 HQ website change submissions list + review routes.
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
  hqContentPagePath,
  hqPreviewPagePath,
} = require("../urls/churchUrlHelper");
const svc = require("../services/websiteChangeSubmissionService");
const {
  renderWebsiteFeatureLocked,
  checkWebsiteCapability,
  planEntitlementSvc,
} = require("./websitePlanEntitlementHttp");
const { buildChangeRequestsEmptyState } = require("./websiteSystemStateHttp");

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
  // Authenticated HQ responses must not be cached publicly (incl. 404 out-of-scope probes).
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

  const requireHq = createRequireBlessBoardPermission("website.view", null, { getPool, scopeMode: "church" });

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
        return res.redirect(303, "/login?next=/hq/website/change-requests");
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

    const entitled = await checkWebsiteCapability(
      getPool,
      tenant,
      "website.change_requests",
      env
    );
    if (!entitled.ok && entitled.status === planEntitlementSvc.STATUS.NOT_ENTITLED) {
      return renderWebsiteFeatureLocked(req, res, shellLocals, entitled, {
        featureTitle: "Website Change Requests",
        returnHref: "/hq/website",
      });
    }
    if (!entitled.ok) {
      return sendControlled(req, res, 503, "Submissions are temporarily unavailable.");
    }

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
          "hq/phase4-website-change-requests.ejs",
          await shellLocals(req, res, {
            pageTitle: "Website Change Requests",
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
            listPath: "/hq/website/change-submissions",
            editorPath: hqContentPagePath("home"),
            previewPathFor: (pageKey) => hqPreviewPagePath(pageKey),
            queryError: "Submissions could not be loaded. Try again shortly.",
            emptyState: null,
            notice: null,
          })
        );
        return res.status(503).type("html").send(html);
      }
      return sendControlled(req, res, 503, "Submissions are temporarily unavailable.");
    }

    const notice = String((req.query && req.query.notice) || "") || null;
    const html = renderHqView(
      "hq/phase4-website-change-requests.ejs",
      await shellLocals(req, res, {
        pageTitle: "Website Change Requests",
        items: result.items,
        total: result.total,
        summary: result.summary,
        pageKeys: result.pageKeys,
        submitters: result.submitters,
        branches: result.branches,
        filters: result.filters,
        statusLabels: svc.STATUS_LABELS,
        listPath: "/hq/website/change-submissions",
        editorPath: hqContentPagePath("home"),
        previewPathFor: (pageKey) => hqPreviewPagePath(pageKey),
        queryError: null,
        emptyState: buildChangeRequestsEmptyState({
          viewerRole: "hq",
          listPath: "/hq/website/change-submissions",
          editorPath: hqContentPagePath("home"),
        }),
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

      // Tenant isolation first: never reveal foreign submissions via plan-lock 200.
      // Repository query is organization_id + id (session/host tenant, not client-supplied org).
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

      const entitled = await checkWebsiteCapability(
        getPool,
        tenant,
        "website.change_requests",
        env
      );
      if (!entitled.ok && entitled.status === planEntitlementSvc.STATUS.NOT_ENTITLED) {
        return renderWebsiteFeatureLocked(req, res, shellLocals, entitled, {
          featureTitle: "Review Website Update",
          returnHref: "/hq/website",
        });
      }
      if (!entitled.ok) {
        return sendControlled(req, res, 503, "Submission review is temporarily unavailable.");
      }

      const formError = String((req.query && req.query.error) || "") || null;
      const html = renderHqView(
        "hq/phase4-review-website-update.ejs",
        await shellLocals(req, res, {
          pageTitle: "Review Website Update",
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

    const submissionId = req.params.submissionId;
    const detailPath = `/hq/website/change-submissions/${encodeURIComponent(submissionId)}`;

    // Scope check before entitlement so cross-org IDs return 404 (not plan 403).
    const scoped = await svc.assertSubmissionInOrganization(getPool(), {
      organizationId: tenant.organization.id,
      submissionId,
    });
    if (!scoped.ok) {
      if (
        scoped.status === svc.STATUS.NOT_FOUND ||
        scoped.status === svc.STATUS.INVALID_INPUT
      ) {
        return sendControlled(req, res, 404, "This submission was not found.");
      }
      return sendControlled(req, res, 503, "The review decision could not be saved.");
    }

    const entitled = await checkWebsiteCapability(
      getPool,
      tenant,
      "website.change_requests",
      env
    );
    if (!entitled.ok) {
      return sendControlled(req, res, 403, "This action is not available on your current plan.");
    }

    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return sendControlled(req, res, 403, "Invalid or missing CSRF token.");
    }

    const reviewerUserId = actorUserId(req);
    if (!reviewerUserId) {
      return sendControlled(req, res, 401, "Sign-in is required.");
    }

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
        const conflictErr =
          result.reason === "approve_apply_empty"
            ? "approve_apply_failed"
            : "invalid_transition";
        return res.redirect(303, `${detailPath}?error=${encodeURIComponent(conflictErr)}`);
      }
      if (result.reason === "approve_publish_failed") {
        return res.redirect(303, `${detailPath}?error=approve_publish_failed`);
      }
      return sendControlled(req, res, 503, "The review decision could not be saved.");
    }

    const notice =
      action === "approve"
        ? result.published
          ? "approved_and_published"
          : "approved"
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

  router.get(
    "/hq/website/change-submissions/:submissionId/comments",
    rejectApex,
    gateHq,
    async (req, res) => {
      const tenant = requireTenant(req, res);
      if (!tenant) return;
      const result = await svc.listSubmissionConversation(getPool(), {
        organizationId: tenant.organization.id,
        submissionId: req.params.submissionId,
        includeInternal: true,
      });
      if (!result.ok) {
        if (result.status === svc.STATUS.NOT_FOUND) {
          return sendControlled(req, res, 404, "This submission was not found.");
        }
        return sendControlled(req, res, 503, "Comments are temporarily unavailable.");
      }
      const html = await renderHqView(
        "hq/phase3-submission-review-comments.ejs",
        await shellLocals(req, res, {
          pageTitle: "Submission Review Comments",
          shellKind: "hq",
          submission: result.submission,
          events: result.events,
          eventLabels: result.eventLabels,
          commentsPostPath: `/hq/website/change-submissions/${result.submission.id}/comments`,
          commentsBackPath: `/hq/website/change-submissions/${result.submission.id}`,
          formError: String((req.query && req.query.error) || "") || null,
          notice: String((req.query && req.query.notice) || "") || null,
        })
      );
      return res.type("html").send(html);
    }
  );

  router.post(
    "/hq/website/change-submissions/:submissionId/comments",
    rejectApex,
    gateHq,
    async (req, res) => {
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
      const result = await svc.addSubmissionComment(getPool(), {
        organizationId: tenant.organization.id,
        submissionId: req.params.submissionId,
        actorUserId: reviewerUserId,
        actorRole: "church_hq_admin",
        comment: req.body && req.body.comment,
        visibility:
          req.body && (req.body.hq_internal === "1" || req.body.hq_internal === "on")
            ? "hq_internal"
            : "shared",
        pageKey: req.body && req.body.page_key,
        sectionKey: req.body && req.body.section_key,
        allowInternal: true,
      });
      const base = `/hq/website/change-submissions/${encodeURIComponent(req.params.submissionId)}/comments`;
      if (!result.ok) {
        if (result.status === svc.STATUS.NOT_FOUND) {
          return sendControlled(req, res, 404, "This submission was not found.");
        }
        return res.redirect(
          303,
          `${base}?error=${encodeURIComponent(result.reason || "invalid_input")}`
        );
      }
      return res.redirect(303, `${base}?notice=comment_added`);
    }
  );


  // Phase4 preferred paths (alias to canonical handlers).
  router.get("/hq/website/change-requests", rejectApex, gateHq, (req, res) => {
    const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    return res.redirect(302, "/hq/website/change-submissions" + qs);
  });
  router.get("/hq/website/change-requests/:submissionId", rejectApex, gateHq, (req, res) => {
    const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    return res.redirect(
      302,
      `/hq/website/change-submissions/${encodeURIComponent(req.params.submissionId)}` + qs
    );
  });
  router.post(
    "/hq/website/change-requests/:submissionId/approve",
    rejectApex,
    gateHq,
    (req, res) => postDecision(req, res, "approve")
  );
  router.post(
    "/hq/website/change-requests/:submissionId/request-changes",
    rejectApex,
    gateHq,
    (req, res) => postDecision(req, res, "request-changes")
  );
  router.post(
    "/hq/website/change-requests/:submissionId/reject",
    rejectApex,
    gateHq,
    (req, res) => postDecision(req, res, "reject")
  );

  return router;
}

module.exports = {
  createWebsiteChangeSubmissionAdminRouter,
};
