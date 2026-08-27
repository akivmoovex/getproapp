"use strict";

/**
 * HQ website preview acknowledgement + site publish / unpublish.
 * Preview of draft pages remains GET /hq/content/preview/:pageKey.
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
  hqWebsitePublishReviewPath,
  hqWebsitePublishPath,
} = require("../urls/churchUrlHelper");
const {
  PRODUCT_CODE,
  buildPublicWebsiteEditPath,
  buildPublicWebsitePublishPath,
} = require("../../platform/website/publicWebsiteUrl");
const {
  prepareWebsitePublishReview,
  prepareWebsitePublishSuccess,
  prepareWebsitePublishError,
  collectErrorCodes,
} = require("../services/websitePublishReviewService");
const {
  resolveWebsiteScope,
  STATUS: WEBSITE_SCOPE_STATUS,
  SCOPE_TYPE,
} = require("../services/resolveWebsiteScope");
const { buildPermissionNavFlags } = require("./permissionNavLocals");
const {
  presentBlessBoardHqWebsiteSettingsUx,
} = require("../../platform/website/websiteManagementPresentation");

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

  const requireHq = createRequireBlessBoardPermission("website.view", null, { getPool, scopeMode: "church" });
  const requireWebsitePublish = createRequireBlessBoardPermission("website.publish", null, { getPool, scopeMode: "church" });

  async function websiteCapabilityFlags(req) {
    const tenant = resolveTenantForAuthorization(req);
    const session = req.v5Session && req.v5Session.session;
    if (!tenant || !session || !session.userId) {
      return {
        canPublishWebsite: false,
        canEditWebsite: false,
        canRestoreWebsite: false,
        canViewWebsite: false,
      };
    }
    return buildPermissionNavFlags(getPool(), {
      actorUserId: session.userId,
      tenant,
      branchId: null,
    });
  }

  function applyOverviewCapabilities(overview, flags) {
    if (!overview || typeof overview !== "object") return overview;
    overview.canEdit = flags.canEditWebsite === true;
    if (Object.prototype.hasOwnProperty.call(overview, "canPublish")) {
      overview.canPublish = Boolean(overview.canPublish) && flags.canPublishWebsite === true;
    }
    if (overview.undoLastPublish && typeof overview.undoLastPublish === "object") {
      const allowed = flags.canRestoreWebsite === true;
      overview.undoLastPublish.enabled = Boolean(overview.undoLastPublish.enabled) && allowed;
      if (!allowed) {
        overview.undoLastPublish.href = null;
        if (!overview.undoLastPublish.explanation) {
          overview.undoLastPublish.explanation =
            "Restoring a previous website requires restore permission.";
        }
      }
    }
    return overview;
  }

  function attachHqWebsiteUx(overview, flags, extras) {
    const websiteUx = presentBlessBoardHqWebsiteSettingsUx({
      overview: overview || {},
      flags: flags || {},
      ...(extras || {}),
    });
    if (overview && typeof overview === "object") {
      overview.websiteUx = websiteUx;
      overview.liveAvailable = websiteUx.liveAvailable;
    }
    return websiteUx;
  }

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
    const flags = await websiteCapabilityFlags(req);
    const publicPath = (locals && locals.publicPath) || "";
    const previewPath = (locals && locals.previewPath) || hqPreviewPagePath("home");
    const orgKey = (locals && locals.organizationKey) || "";
    const editPath = orgKey
      ? buildPublicWebsiteEditPath({
          product: PRODUCT_CODE.BLESSBOARD,
          organizationKey: orgKey,
        })
      : "/hq/content";
    const websiteUx = presentBlessBoardHqWebsiteSettingsUx({
      overview: {
        publicPath,
        previewPath,
        editPath,
        inlineEditPath: editPath,
        publishReviewPath: buildPublicWebsitePublishPath({
          product: PRODUCT_CODE.BLESSBOARD,
          organizationKey: orgKey,
          query: locals && locals.deferServiceTimes ? { defer_service_times: "1" } : undefined,
        }),
        hasUnpublishedChanges:
          String((locals && locals.readiness && locals.readiness.websiteStatus) || "") !==
          "published",
        readiness: locals && locals.readiness,
      },
      readiness: locals && locals.readiness,
      flags,
      needsFoundationRepair: Boolean(locals && locals.needsFoundationRepair),
      publicPath,
      previewPath,
    });
    const html = renderHqView(
      "hq/website.ejs",
      await shellLocals(req, res, { ...(locals || {}), websiteUx })
    );
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

      try {
        const { ensureEngineContent } = require("../../platform/website-engine/blessboardBridge");
        await ensureEngineContent(getPool(), {
          organizationId,
          churchId: tenant.church.id,
          slug: organizationKey,
        });
      } catch {
        /* engine backfill is best-effort on hub load */
      }

      if (organizationId) {
        const overview = await loadHqWebsiteOverview(getPool(), {
          organizationId,
          churchId: tenant.church.id,
          organizationKey,
          env,
        });
        if (overview && overview.ok && !overview.useLegacyWebsiteScreen) {
          const flags = await websiteCapabilityFlags(req);
          applyOverviewCapabilities(overview, flags);
          const foundation = await inspectWebsiteFoundationGaps(getPool(), {
            churchId: tenant.church.id,
          });
          const needsFoundationRepair = Boolean(foundation && foundation.needsRepair);
          const websiteUx = attachHqWebsiteUx(overview, flags, {
            needsFoundationRepair,
            publicPath: overview.publicPath,
            previewPath: overview.previewPath,
          });
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
              websiteUx,
              needsFoundationRepair,
              foundationGaps: (foundation && foundation.gaps) || [],
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

  async function resolveBranchPublishScope(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    const session = req.v5Session && req.v5Session.session;
    const resolved = await resolveWebsiteScope(getPool(), {
      tenant,
      authenticatedUser: session && session.userId,
      requestedBranchKey: req.params.branchKey,
      organizationId: tenant && tenant.organization ? tenant.organization.id : null,
      churchId: tenant && tenant.church ? tenant.church.id : null,
    });
    if (!resolved.ok || resolved.scopeType !== SCOPE_TYPE.BRANCH || !resolved.branchId) {
      const status = resolved && resolved.httpStatus ? resolved.httpStatus : 404;
      if (status === 503 || (resolved && resolved.status === WEBSITE_SCOPE_STATUS.LOOKUP_ERROR)) {
        sendControlled(req, res, 503, "Publication review is temporarily unavailable.");
        return null;
      }
      sendControlled(req, res, status === 401 ? 401 : 404, "This branch could not be found.");
      return null;
    }
    return resolved;
  }

  async function renderPublishReviewPage(req, res, scope) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id || !tenant.organization) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const defer =
      String((req.query && req.query.defer_service_times) || "") === "1";
    const branchKey = scope && scope.branchKey ? String(scope.branchKey) : null;
    const review = await prepareWebsitePublishReview(getPool(), {
      organizationId: tenant.organization.id,
      churchId: tenant.church.id,
      branchId: scope && scope.branchId ? scope.branchId : null,
      branchKey,
      branchName:
        (scope && scope.branch && scope.branch.displayName) || branchKey || null,
      actorUserId: await actorUserId(req),
      deferServiceTimes: defer,
      organizationKey: (tenant.organization && tenant.organization.key) || null,
      env,
    });
    if (!review.ok) {
      const html = renderHqView(
        "hq/phase4-publish-website-review.ejs",
        await shellLocals(req, res, {
          pageTitle: "Publish Website Changes",
          review: {
            ok: false,
            title: "Publish Website Changes?",
            subtitle: "Review is temporarily unavailable",
            publishable: false,
            draftStatusLabel: "Unavailable",
            changeSummary: {
              items: [],
              fallbackMessage: "Publication review could not be loaded.",
            },
            readinessChecks: [],
            blockingIssues: [
              {
                code: "lookup_error",
                severity: "blocking",
                title: "Readiness check unavailable",
                explanation:
                  "Website readiness could not be evaluated. Try again shortly.",
                message:
                  "Publication review could not load website readiness. Try again shortly.",
                editUrl: hqWebsitePublishReviewPath(branchKey),
                pageKey: null,
                sectionKey: null,
                fieldKey: "readiness",
                branchKey,
                branchName: null,
              },
            ],
            errors: ["Publication review is temporarily unavailable."],
            warnings: [],
            approvedSubmissions: [],
            overviewPath: branchKey
              ? `/hq/website/branches/${encodeURIComponent(branchKey)}`
              : "/hq/website",
            editPath: branchKey
              ? `/hq/website/branches/${encodeURIComponent(branchKey)}/pages/home`
              : "/hq/content",
            detailsPath: branchKey
              ? `/hq/website/branches/${encodeURIComponent(branchKey)}/pages/home`
              : "/hq/settings",
            reviewPath: hqWebsitePublishReviewPath(branchKey),
            publishPath: hqWebsitePublishPath(branchKey),
            previewPath: hqPreviewPagePath("home"),
            emptyState: null,
            scope: {
              organizationId: tenant.organization.id,
              churchId: tenant.church.id,
              branchId: scope && scope.branchId ? scope.branchId : null,
              branchKey,
              scopeType: branchKey ? "branch" : "church",
            },
          },
          deferServiceTimes: defer,
          notice: null,
          error: "Publication review is temporarily unavailable.",
        })
      );
      return res.status(503).type("html").send(html);
    }
    const html = renderHqView(
      "hq/phase4-publish-website-review.ejs",
      await shellLocals(req, res, {
        pageTitle: branchKey
          ? "Publish Branch Website Changes"
          : "Publish Website Changes",
        review,
        deferServiceTimes: defer,
        previewPath: review.previewPath,
        publicPath: review.publicPath,
        notice: String((req.query && req.query.notice) || "") || null,
        error: null,
      })
    );
    return res.status(200).type("html").send(html);
  }

  router.get("/hq/website/publish/review", rejectApex, gateHq, requireWebsitePublish, async (req, res) => {
    // Backward-compatible branch hint: redirect to canonical branch review when reliable.
    const branchHint = String((req.query && (req.query.branch || req.query.branchKey)) || "")
      .trim();
    if (branchHint) {
      const tenant = resolveTenantForAuthorization(req);
      const session = req.v5Session && req.v5Session.session;
      const resolved = await resolveWebsiteScope(getPool(), {
        tenant,
        authenticatedUser: session && session.userId,
        requestedBranchKey: branchHint,
        organizationId: tenant && tenant.organization ? tenant.organization.id : null,
        churchId: tenant && tenant.church ? tenant.church.id : null,
      });
      if (resolved.ok && resolved.scopeType === SCOPE_TYPE.BRANCH && resolved.branchKey) {
        const defer =
          String((req.query && req.query.defer_service_times) || "") === "1"
            ? "?defer_service_times=1"
            : "";
        return res.redirect(
          303,
          `/hq/website/branches/${encodeURIComponent(resolved.branchKey)}/publish/review${defer}`
        );
      }
    }
    return renderPublishReviewPage(req, res, null);
  });

  router.get(
    "/hq/website/branches/:branchKey/publish/review",
    rejectApex,
    gateHq,
    requireWebsitePublish,
    async (req, res) => {
      const scope = await resolveBranchPublishScope(req, res);
      if (!scope) return;
      return renderPublishReviewPage(req, res, scope);
    }
  );

  router.get(
    "/hq/website/branches/:branchKey/details",
    rejectApex,
    gateHq,
    async (req, res) => {
      const scope = await resolveBranchPublishScope(req, res);
      if (!scope) return;
      return res.redirect(
        303,
        `/hq/website/branches/${encodeURIComponent(scope.branchKey)}/pages/home`
      );
    }
  );

  async function renderPublishSuccess(req, res, tenant, versionId, branchKey) {
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
      branchKey: branchKey || null,
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
    const branchKey = String((req.query && req.query.branch) || "").trim() || null;
    return renderPublishSuccess(req, res, tenant, versionId, branchKey);
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
    const branchKey = String((req.query && req.query.branch) || "").trim() || null;
    const publishError = prepareWebsitePublishError({
      codes: codes.length ? codes : ["validation"],
      liveUnchanged: true,
      branchKey,
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

  async function handlePublishPost(req, res, branchScope) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return sendControlled(req, res, 403, "Invalid or missing CSRF token.");
    }
    // Never trust client-supplied org/church/branch ids.
    if (req.body && (req.body.organizationId || req.body.churchId || req.body.branchId)) {
      return sendControlled(req, res, 403, "Invalid publish request.");
    }
    const body = req.body || {};
    const branchKey = branchScope && branchScope.branchKey ? String(branchScope.branchKey) : null;
    const branchId = branchScope && branchScope.branchId ? String(branchScope.branchId) : null;
    const reviewPath = hqWebsitePublishReviewPath(branchKey);
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
          `/hq/website/publish/error?codes=${encodeURIComponent("preview")}${
            branchKey ? `&branch=${encodeURIComponent(branchKey)}` : ""
          }`
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
      branchId,
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
      forcePublishVersion: Boolean(branchId),
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
          const codeList = (codes.length ? codes : ["validation"]).join(",");
          return res.redirect(
            303,
            `/hq/website/publish/error?codes=${encodeURIComponent(codeList)}${
              branchKey ? `&branch=${encodeURIComponent(branchKey)}` : ""
            }`
          );
        }
        return res.redirect(
          303,
          `${reviewPath}?error=not_ready`
        );
      }
      return sendControlled(req, res, 503, "Website could not be published.");
    }
    if (result.publicationVersionId) {
      const qs = `version=${encodeURIComponent(result.publicationVersionId)}${
        branchKey ? `&branch=${encodeURIComponent(branchKey)}` : ""
      }`;
      return res.redirect(303, `/hq/website/publish/success?${qs}`);
    }
    const publicPath =
      result.publicPath ||
      publicChurchHomePath(
        result.organizationKey || (tenant.organization && tenant.organization.key)
      ) ||
      "/hq/website?notice=published";
    return res.redirect(303, publicPath);
  }

  router.post("/hq/website/publish", rejectApex, gateHq, requireWebsitePublish, async (req, res) => {
    return handlePublishPost(req, res, null);
  });

  router.post(
    "/hq/website/branches/:branchKey/publish",
    rejectApex,
    gateHq,
    async (req, res) => {
      const scope = await resolveBranchPublishScope(req, res);
      if (!scope) return;
      return handlePublishPost(req, res, scope);
    }
  );

  router.post("/hq/website/unpublish", rejectApex, gateHq, requireWebsitePublish, async (req, res) => {
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
