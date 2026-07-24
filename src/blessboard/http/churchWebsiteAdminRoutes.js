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
  repairWebsiteFoundation,
  inspectWebsiteFoundationGaps,
} = require("../services/websiteFoundationRepairService");
const {
  publicChurchHomePath,
  hqPreviewPagePath,
} = require("../urls/churchUrlHelper");

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

  router.get("/hq/website", rejectApex, gateHq, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const defer = String((req.query && req.query.defer_service_times) || "") === "1";
    const readiness = await evaluatePublishReadiness(getPool(), {
      churchId: tenant.church.id,
      deferServiceTimes: defer,
      env,
    });
    if (!readiness.ok && readiness.status === PUBLISH_STATUS.LOOKUP_ERROR) {
      return sendControlled(req, res, 503, "Website status is temporarily unavailable.");
    }
    const foundation = await inspectWebsiteFoundationGaps(getPool(), {
      churchId: tenant.church.id,
    });
    const orgKey =
      readiness.organizationKey || (tenant.organization && tenant.organization.key) || null;
    const html = renderHqView(
      "hq/website.ejs",
      await shellLocals(req, res, {
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
      })
    );
    return res.status(200).type("html").send(html);
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
    return res.redirect(303, "/hq/website?notice=preview_ack");
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
    const result = await publishChurchWebsite(getPool(), {
      churchId: tenant.church.id,
      actorUserId: await actorUserId(req),
      deferServiceTimes,
      confirmPublish: body.confirm_publish,
      env,
    });
    if (!result.ok) {
      if (result.status === PUBLISH_STATUS.NOT_READY || result.status === PUBLISH_STATUS.INVALID_INPUT) {
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
