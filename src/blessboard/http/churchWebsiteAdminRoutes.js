"use strict";

/**
 * HQ website preview acknowledgement + site publish / unpublish.
 * Preview of draft pages remains GET /hq/content/preview/:pageKey.
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
  evaluatePublishReadiness,
  acknowledgeWebsitePreview,
  publishChurchWebsite,
  unpublishChurchWebsite,
  STATUS: PUBLISH_STATUS,
  GAP,
} = require("../services/churchWebsitePublishService");
const {
  loadHqWebsiteOverview,
} = require("../services/websiteOverviewService");
const {
  repairWebsiteFoundation,
  inspectWebsiteFoundationGaps,
} = require("../services/websiteFoundationRepairService");
const {
  publicChurchHomePath,
  hqPreviewPagePath,
} = require("../urls/churchUrlHelper");
const {
  prepareWebsitePublishReview,
  prepareWebsitePublishSuccess,
  prepareWebsitePublishError,
  collectErrorCodes,
} = require("../services/websitePublishReviewService");

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
  <title>Website · BlessBoard</title>
  <link rel="stylesheet" href="/blessboard/v5/hq-admin.css?v=58" />
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

const GAP_LABELS = Object.freeze({
  [GAP.ORGANIZATION_NAME]: "Organization and church names are required.",
  [GAP.FIRST_BRANCH]: "At least one active branch is required.",
  [GAP.CONTACT_METHOD]: "Add a phone or email in church or branch settings.",
  [GAP.SERVICE_TIMES]: "Add service times content, or confirm publishing without them.",
  [GAP.REQUIRED_PAGES]: "Required public page shells are missing.",
  [GAP.PUBLIC_HOSTNAME]: "A valid public path or hostname is required.",
  [GAP.CUSTOM_DOMAIN_ENTITLEMENT]: "Custom domains require an entitled plan.",
  [GAP.WEBSITE_SUSPENDED]: "Website is suspended; clear suspension before publishing.",
});

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 * }} deps
 */
function createChurchWebsiteAdminRouter(deps) {
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
        return res.redirect(303, "/login?next=/hq/website");
      }
      return sendControlled(req, res, 401, "Sign-in is required.");
    }
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || tenant.resolved !== true) {
      return sendControlled(
        req,
        res,
        403,
        "Your account is signed in, but this church HQ workspace could not be loaded. Confirm you are assigned as a church HQ administrator for an active organization, then sign in again."
      );
    }
    return requireHq(req, res, next);
  }

  async function shellLocals(req, res, extras) {
    return buildHqAdminShellLocals(req, res, {
      env,
      isProduction,
      activeNav: "content",
      pageTitle: "Website",
      getPool,
      extra: extras,
    });
  }

  async function actorUserId(req) {
    const session = req.v5Session && req.v5Session.session;
    return session && session.userId ? String(session.userId) : null;
  }

  async function renderLegacyWebsite(req, res, locals) {
    const html = renderHqView("hq/website.ejs", await shellLocals(req, res, locals));
    return res.status(200).type("html").send(html);
  }

  router.get("/hq/website", rejectApex, gateHq, async (req, res) => {
    try {
      const tenant = resolveTenantForAuthorization(req);
      if (!tenant || !tenant.church || !tenant.church.id) {
        return sendControlled(req, res, 403, "You do not have access to this site.");
      }
      const defer = String((req.query && req.query.defer_service_times) || "") === "1";
      const organizationId =
        tenant.organization && tenant.organization.id
          ? String(tenant.organization.id)
          : null;
      const organizationKey =
        (tenant.organization && (tenant.organization.key || tenant.organization.organizationKey)) ||
        null;

      if (organizationId) {
        const overview = await loadHqWebsiteOverview(getPool(), {
          organizationId,
          churchId: tenant.church.id,
          organizationKey,
          env,
        });
        if (overview && overview.ok && !overview.useLegacyWebsiteScreen) {
          const noticeRaw = String((req.query && req.query.notice) || "") || null;
          const noticeMap = {
            published: "Website published.",
            unpublished: "Website unpublished. Content is preserved.",
            preview_ack: "Preview acknowledged.",
            foundation_repaired: "Website foundation repaired.",
          };
          const viewName =
            overview.planKey === "growth"
              ? "hq/phase4-growth-website-workflow-overview.ejs"
              : "hq/phase4-foundation-website-overview.ejs";
          const html = renderHqView(
            viewName,
            await shellLocals(req, res, {
              overview,
              notice: noticeMap[noticeRaw] || noticeRaw,
              error: null,
            })
          );
          return res.status(200).type("html").send(html);
        }
      }

      const readiness = await evaluatePublishReadiness(getPool(), {
        churchId: tenant.church.id,
        deferServiceTimes: defer,
        env,
      });
      if (!readiness.ok && readiness.status === PUBLISH_STATUS.LOOKUP_ERROR) {
        return renderLegacyWebsite(req, res, {
          readiness: {
            ok: false,
            websiteStatus: "draft",
            gaps: [],
            planKey: null,
            publicPath: publicChurchHomePath(organizationKey),
          },
          gapLabels: GAP_LABELS,
          error: "Website status is temporarily unavailable. Try again shortly.",
          notice: null,
          deferServiceTimes: defer,
          previewPath: hqPreviewPagePath("home"),
          publicPath: publicChurchHomePath(organizationKey),
          organizationKey,
          needsFoundationRepair: false,
          foundationGaps: [],
        });
      }
      const foundation = await inspectWebsiteFoundationGaps(getPool(), {
        churchId: tenant.church.id,
      });
      const orgKey =
        readiness.organizationKey || organizationKey || null;
      return renderLegacyWebsite(req, res, {
        readiness,
        gapLabels: GAP_LABELS,
        error: null,
        notice: String((req.query && req.query.notice) || "") || null,
        deferServiceTimes: defer,
        previewPath: hqPreviewPagePath("home"),
        publicPath: readiness.publicPath || publicChurchHomePath(orgKey),
        organizationKey: orgKey,
        needsFoundationRepair: Boolean(foundation && foundation.needsRepair),
        foundationGaps: (foundation && foundation.gaps) || [],
      });
    } catch {
      return renderLegacyWebsite(req, res, {
        readiness: {
          ok: false,
          websiteStatus: "draft",
          gaps: [],
          planKey: null,
          publicPath: "",
        },
        gapLabels: GAP_LABELS,
        error: "Website management could not be loaded. Please try again.",
        notice: null,
        deferServiceTimes: false,
        previewPath: hqPreviewPagePath("home"),
        publicPath: "",
        organizationKey: null,
        needsFoundationRepair: false,
        foundationGaps: [],
      });
    }
  });

  router.post("/hq/website/repair-foundation", rejectApex, gateHq, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return sendControlled(req, res, 403, "Invalid or missing CSRF token.");
    }
    const confirm =
      req.body &&
      (req.body.confirm_repair === "1" ||
        req.body.confirm_repair === "on" ||
        req.body.confirm_repair === true);
    if (!confirm) {
      return sendControlled(req, res, 400, "Confirm repair before continuing.");
    }
    const result = await repairWebsiteFoundation(getPool(), {
      churchId: tenant.church.id,
      publicName: tenant.church.displayName || null,
      actorUserId: await actorUserId(req),
      auditReason: String((req.body && req.body.audit_reason) || "hq_repair_website_foundation"),
    });
    if (!result.ok) {
      return sendControlled(req, res, 503, "Website foundation could not be repaired.");
    }
    return res.redirect(303, "/hq/website?notice=foundation_repaired");
  });

  router.post("/hq/website/preview-ack", rejectApex, gateHq, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.organization || !tenant.organization.id) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return sendControlled(req, res, 403, "Invalid or missing CSRF token.");
    }
    const result = await acknowledgeWebsitePreview(getPool(), {
      organizationId: tenant.organization.id,
      actorUserId: await actorUserId(req),
      env,
    });
    if (!result.ok) {
      return sendControlled(req, res, 503, "Could not record preview acknowledgement.");
    }
    const next = String((req.body && req.body.next) || "");
    if (next === "publish_review") {
      return res.redirect(303, "/hq/website/publish/review?notice=preview_ack");
    }
    return res.redirect(303, "/hq/website?notice=preview_ack");
  });

  router.get("/hq/website/publish/review", rejectApex, gateHq, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id || !tenant.organization) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const defer =
      String((req.query && req.query.defer_service_times) || "") === "1";
    const review = await prepareWebsitePublishReview(getPool(), {
      organizationId: tenant.organization.id,
      churchId: tenant.church.id,
      actorUserId: await actorUserId(req),
      deferServiceTimes: defer,
      organizationKey: (tenant.organization && tenant.organization.key) || null,
      env,
    });
    if (!review.ok) {
      return sendControlled(
        req,
        res,
        review.status === "invalid_input" ? 400 : 503,
        "Publication review is temporarily unavailable."
      );
    }
    const html = renderHqView(
      "hq/phase4-publish-website-review.ejs",
      await shellLocals(req, res, {
        pageTitle: "Publish Website Changes",
        review,
        deferServiceTimes: defer,
        previewPath: review.previewPath,
        publicPath: review.publicPath,
        notice: String((req.query && req.query.notice) || "") || null,
        error: null,
      })
    );
    return res.status(200).type("html").send(html);
  });

  async function renderPublishSuccess(req, res, tenant, versionId) {
    const readiness = await evaluatePublishReadiness(getPool(), {
      churchId: tenant.church.id,
      deferServiceTimes: true,
      env,
    });
    const success = await prepareWebsitePublishSuccess(getPool(), {
      organizationId: tenant.organization.id,
      versionId: versionId || null,
      organizationKey: (tenant.organization && tenant.organization.key) || null,
      planKey: readiness && readiness.planKey,
      publishedByName:
        (req.v5Session && req.v5Session.user && req.v5Session.user.displayName) ||
        null,
    });
    const html = renderHqView(
      "hq/phase4-website-published.ejs",
      await shellLocals(req, res, {
        pageTitle: "Website Published",
        success,
      })
    );
    return res.status(200).type("html").send(html);
  }

  router.get("/hq/website/publish/success", rejectApex, gateHq, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.organization || !tenant.organization.id || !tenant.church) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const versionId = String((req.query && req.query.version) || "").trim();
    return renderPublishSuccess(req, res, tenant, versionId);
  });

  router.get("/hq/website/publish/error", rejectApex, gateHq, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.organization || !tenant.organization.id) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const codes = String((req.query && req.query.codes) || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);
    const publishError = prepareWebsitePublishError({
      codes: codes.length ? codes : ["validation"],
      liveUnchanged: true,
    });
    const html = renderHqView(
      "hq/phase4-publish-website-error.ejs",
      await shellLocals(req, res, {
        pageTitle: "Publish Website Error",
        publishError,
      })
    );
    return res.status(400).type("html").send(html);
  });

  router.get("/hq/website/publish/result", rejectApex, gateHq, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.organization || !tenant.organization.id) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const failed = String((req.query && req.query.failed) || "") === "1";
    if (failed) {
      const codes = String((req.query && req.query.errors) || "")
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
      const mapped = collectErrorCodes({ errors: codes });
      return res.redirect(
        303,
        `/hq/website/publish/error?codes=${encodeURIComponent(
          (mapped.length ? mapped : ["validation"]).join(",")
        )}`
      );
    }
    const versionId = String((req.query && req.query.version) || "").trim();
    const qs = versionId
      ? `?version=${encodeURIComponent(versionId)}`
      : "";
    return res.redirect(303, `/hq/website/publish/success${qs}`);
  });

  router.post("/hq/website/publish", rejectApex, gateHq, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return sendControlled(req, res, 403, "Invalid or missing CSRF token.");
    }
    const body = req.body || {};
    const deferServiceTimes =
      body.defer_service_times === "1" ||
      body.defer_service_times === "on" ||
      body.defer_service_times === true;
    const mobilePreviewConfirmed =
      body.mobile_preview_confirmed === "1" ||
      body.mobile_preview_confirmed === "on" ||
      body.mobile_preview_confirmed === true;
    const previewReviewed =
      body.preview_reviewed === "1" ||
      body.preview_reviewed === "on" ||
      body.preview_reviewed === true;
    const fromConfirmation =
      body.from_confirmation === "1" || body.from_confirmation === true;

    if (fromConfirmation && tenant.organization && tenant.organization.id) {
      if (!previewReviewed) {
        return res.redirect(
          303,
          `/hq/website/publish/error?codes=${encodeURIComponent("preview")}`
        );
      }
      await acknowledgeWebsitePreview(getPool(), {
        organizationId: tenant.organization.id,
        actorUserId: await actorUserId(req),
        env,
      });
    }

    const result = await publishChurchWebsite(getPool(), {
      organizationId: tenant.organization && tenant.organization.id,
      churchId: tenant.church.id,
      branchId: null,
      actorUserId: await actorUserId(req),
      deferServiceTimes,
      confirmPublish: body.confirm_publish,
      publicationNote: body.publication_note || null,
      mobilePreviewConfirmed,
      notifyBranchAdmins:
        body.notify_branch_admins === "1" ||
        body.notify_branch_admins === "on" ||
        body.notify_branch_admins === true,
      notifyHqTeam:
        body.notify_hq_team === "1" ||
        body.notify_hq_team === "on" ||
        body.notify_hq_team === true,
      env,
    });
    if (!result.ok) {
      if (result.status === PUBLISH_STATUS.NOT_READY || result.status === PUBLISH_STATUS.INVALID_INPUT) {
        const codes = collectErrorCodes({
          errors: (result.validation && result.validation.errors) || result.validationErrors || [],
          gaps: result.gaps || [],
          reason: result.reason,
        });
        if (fromConfirmation) {
          return res.redirect(
            303,
            `/hq/website/publish/error?codes=${encodeURIComponent(
              (codes.length ? codes : ["validation"]).join(",")
            )}`
          );
        }
        const readiness = await evaluatePublishReadiness(getPool(), {
          churchId: tenant.church.id,
          deferServiceTimes,
          env,
        });
        const orgKey =
          readiness.organizationKey || (tenant.organization && tenant.organization.key) || null;
        const html = renderHqView(
          "hq/website.ejs",
          await shellLocals(req, res, {
            readiness,
            gapLabels: GAP_LABELS,
            error:
              result.reason === "confirm_publish"
                ? "Confirm publishing before continuing."
                : "Publish readiness checks failed. Resolve the gaps below.",
            notice: null,
            deferServiceTimes,
            previewPath: hqPreviewPagePath("home"),
            publicPath: readiness.publicPath || publicChurchHomePath(orgKey),
            organizationKey: orgKey,
            needsFoundationRepair: false,
            foundationGaps: [],
          })
        );
        return res.status(400).type("html").send(html);
      }
      return sendControlled(req, res, 503, "Website could not be published.");
    }
    if (result.publicationVersionId) {
      return res.redirect(
        303,
        `/hq/website/publish/success?version=${encodeURIComponent(result.publicationVersionId)}`
      );
    }
    const publicPath =
      result.publicPath ||
      publicChurchHomePath(
        result.organizationKey || (tenant.organization && tenant.organization.key)
      ) ||
      "/hq/website?notice=published";
    return res.redirect(303, publicPath);
  });

  router.post("/hq/website/unpublish", rejectApex, gateHq, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return sendControlled(req, res, 403, "Invalid or missing CSRF token.");
    }
    const result = await unpublishChurchWebsite(getPool(), {
      churchId: tenant.church.id,
      actorUserId: await actorUserId(req),
      env,
    });
    if (!result.ok) {
      if (result.reason === "website_suspended") {
        return sendControlled(req, res, 403, "Suspended websites cannot be unpublished here.");
      }
      return sendControlled(req, res, 503, "Website could not be unpublished.");
    }
    return res.redirect(303, "/hq/website?notice=unpublished");
  });

  return router;
}

module.exports = {
  createChurchWebsiteAdminRouter,
  GAP_LABELS,
};
