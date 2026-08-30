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
  STATUS: PUBLISH_STATUS,
  GAP,
} = require("../services/churchWebsitePublishService");
const {
  publishWebsite: publishProductWebsite,
  unpublishWebsite: unpublishProductWebsite,
} = require("../../platform/website-engine/lifecycleOrchestrator");
const {
  PERMISSIONS: WEBSITE_PERMISSIONS,
} = require("../../platform/website-engine/permissionHooks");
const {
  PRODUCT_CODE: WEBSITE_ENGINE_PRODUCT_CODE,
} = require("../../platform/website-engine/productSchemaRegistry");

const WEBSITE_PRODUCT_CODE = WEBSITE_ENGINE_PRODUCT_CODE.BLESSBOARD;
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
  buildPublicWebsitePreviewPath,
} = require("../../platform/website/publicWebsiteUrl");
const {
  BRANDING_KEYS,
  loadWebsiteBranding,
  saveWebsiteBranding,
  normalizeHexColor,
  imageValueFromParts,
  imageFromWebsiteValue,
  colorDefaultsForProduct,
} = require("../../platform/website/branding");
const { registerBlessBoardWebsiteTemplate } = require("../website/blessboardChurchTemplate");
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
const { PERMISSIONS: PLATFORM_WEBSITE_PERMISSIONS } = require("../../platform/website/permissions");
const {
  presentBlessBoardHqWebsiteSettingsUx,
  loadWebsiteManagementSummary,
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
  const requireWebsiteEdit = createRequireBlessBoardPermission("website.edit", null, { getPool, scopeMode: "church" });

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

  function grantedWebsitePermissions(flags) {
    const granted = [];
    if (flags && flags.canViewWebsite) granted.push(PLATFORM_WEBSITE_PERMISSIONS.VIEW);
    if (flags && flags.canEditWebsite) {
      granted.push(PLATFORM_WEBSITE_PERMISSIONS.EDIT);
      granted.push(PLATFORM_WEBSITE_PERMISSIONS.VIEW);
    }
    if (flags && flags.canPublishWebsite) granted.push(PLATFORM_WEBSITE_PERMISSIONS.PUBLISH);
    if (flags && flags.canRestoreWebsite) {
      granted.push(PLATFORM_WEBSITE_PERMISSIONS.RESTORE);
      granted.push(PLATFORM_WEBSITE_PERMISSIONS.ROLLBACK);
    }
    return Array.from(new Set(granted));
  }

  function applyHubPublishPostPath(website, flags, opts) {
    if (!website || typeof website !== "object") return website;
    const actions = website.actions || (website.ux && website.ux.actions) || {};
    const allowPublish = Boolean(flags && flags.canPublishWebsite);
    if (allowPublish) {
      actions.publishPath = "/hq/website/publish";
      actions.unpublishPath = actions.unpublishPath || "/hq/website/unpublish";
    }
    if (opts && opts.needsFoundationRepair) {
      actions.retry = actions.retry || "#website-setup-retry";
    }
    website.actions = actions;
    if (website.ux) website.ux.actions = actions;
    website.canEdit = Boolean(website.canEdit) || Boolean(flags && flags.canEditWebsite);
    website.canPublish = allowPublish;
    website.canView = flags ? flags.canViewWebsite !== false : website.canView;
    return website;
  }

  function overlayHqUnpublishedChanges(website, overview) {
    if (!website || !overview || overview.hasUnpublishedChanges !== true) return website;
    website.unpublishedChanges = true;
    website.unpublishedCount = Math.max(Number(website.unpublishedCount) || 0, Number(overview.unpublishedCount) || 0, 1);
    if (website.liveAvailable) {
      website.statusKey = "unpublished_changes";
      const n = website.unpublishedCount;
      website.statusLabel = website.publishedVersionNumber
        ? `Published (version ${website.publishedVersionNumber}) · unpublished changes`
        : "Published · unpublished changes";
      website.statusHint = `${n} unpublished change${n === 1 ? "" : "s"} will not be public until you publish.`;
    }
    if (website.ux) {
      website.ux.unpublishedChanges = true;
      website.ux.unpublishedCount = website.unpublishedCount;
      website.ux.state = website.statusKey || website.ux.state;
      website.ux.statusLabel = website.statusLabel || website.ux.statusLabel;
      website.ux.statusHint = website.statusHint || website.ux.statusHint;
    }
    return website;
  }

  async function renderWebsiteHub(req, res, opts) {
    const flags = opts.flags || (await websiteCapabilityFlags(req));
    const organizationId = opts.organizationId || null;
    const organizationKey = opts.organizationKey || "";
    const needsFoundationRepair = Boolean(opts.needsFoundationRepair);
    let website = null;
    if (organizationId) {
      try {
        const loaded = await loadWebsiteManagementSummary(getPool(), {
          productCode: PRODUCT_CODE.BLESSBOARD,
          organizationId,
          organizationKey,
          grantedPermissions: grantedWebsitePermissions(flags),
          origin: `${req.protocol}://${req.get("host")}`,
          env,
        });
        if (loaded && loaded.ok) website = loaded.summary;
      } catch {
        website = null;
      }
    }
    if (!website) {
      const websiteUx = presentBlessBoardHqWebsiteSettingsUx({
        overview: opts.overview || {},
        flags,
        needsFoundationRepair: false,
        publicPath: opts.publicPath,
        previewPath: opts.previewPath,
      });
      website = {
        ...websiteUx,
        statusKey: websiteUx.state,
        statusLabel: websiteUx.statusLabel,
        statusHint: websiteUx.statusHint,
        publishedVersionLabel: websiteUx.publishedVersionLabel,
        lastPublishedLabel: websiteUx.lastPublishedLabel,
        lastEditedLabel: websiteUx.lastEditedLabel,
        lastEditor: websiteUx.lastEditor,
        unpublishedChanges: websiteUx.unpublishedChanges,
        unpublishedCount: websiteUx.unpublishedCount,
        liveAvailable: websiteUx.liveAvailable,
        exists: websiteUx.exists,
        publicPath: websiteUx.publicPath,
        publicUrl: websiteUx.publicUrl,
        canEdit: websiteUx.canEdit,
        canPublish: websiteUx.canPublish,
        canView: websiteUx.canView,
        actions: websiteUx.actions,
        ux: websiteUx,
      };
    }
    const overview = opts.overview || {};
    overlayHqUnpublishedChanges(website, overview);
    if (needsFoundationRepair) {
      website.statusLabel = "Website setup incomplete";
      website.statusHint =
        website.statusHint ||
        "Required page shells or settings are missing. Repair inserts only missing structures and does not publish or overwrite existing content.";
      if (website.ux) {
        website.ux.statusLabel = website.statusLabel;
        website.ux.statusHint = website.statusHint;
      }
    }
    applyHubPublishPostPath(website, flags, opts);
    const html = renderHqView(
      "hq/website-management.ejs",
      await shellLocals(req, res, {
        website,
        websiteUx: website.ux || website,
        needsFoundationRepair: Boolean(opts.needsFoundationRepair),
        foundationGaps: opts.foundationGaps || [],
        notice: opts.notice || null,
        error: opts.error || null,
        planKey: opts.planKey || overview.planKey || "foundation",
      })
    );
    return res.status(opts.status || 200).type("html").send(html);
  }

  async function renderLegacyWebsite(req, res, locals) {
    const flags = await websiteCapabilityFlags(req);
    const publicPath = (locals && locals.publicPath) || "";
    const previewPath = (locals && locals.previewPath) || hqPreviewPagePath("home");
    const orgKey = (locals && locals.organizationKey) || "";
    return renderWebsiteHub(req, res, {
      flags,
      organizationId: null,
      organizationKey: orgKey,
      publicPath,
      previewPath,
      needsFoundationRepair: Boolean(locals && locals.needsFoundationRepair),
      foundationGaps: (locals && locals.foundationGaps) || [],
      notice: locals && locals.notice,
      error: locals && locals.error,
      overview: {
        publicPath,
        previewPath,
        editPath: orgKey
          ? buildPublicWebsiteEditPath({
              product: PRODUCT_CODE.BLESSBOARD,
              organizationKey: orgKey,
            })
          : "/hq/content",
        inlineEditPath: orgKey
          ? buildPublicWebsiteEditPath({
              product: PRODUCT_CODE.BLESSBOARD,
              organizationKey: orgKey,
            })
          : "/hq/content",
        readiness: locals && locals.readiness,
      },
    });
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

      const noticeRaw = String((req.query && req.query.notice) || "") || null;
      const noticeMap = {
        published: "Website published.",
        unpublished: "Website unpublished. Content is preserved.",
        preview_ack: "Preview acknowledged.",
        foundation_repaired: "Website foundation repaired.",
      };

      let overview = null;
      if (organizationId) {
        overview = await loadHqWebsiteOverview(getPool(), {
          organizationId,
          churchId: tenant.church.id,
          organizationKey,
          env,
        });
      }
      const flags = await websiteCapabilityFlags(req);
      if (overview && overview.ok) applyOverviewCapabilities(overview, flags);
      const foundation = await inspectWebsiteFoundationGaps(getPool(), {
        churchId: tenant.church.id,
      });
      const needsFoundationRepair = Boolean(foundation && foundation.needsRepair);
      const publicPath =
        (overview && overview.publicPath) || publicChurchHomePath(organizationKey);
      const previewPath =
        (overview && overview.previewPath) || hqPreviewPagePath("home");
      const editPath = organizationKey
        ? buildPublicWebsiteEditPath({
            product: PRODUCT_CODE.BLESSBOARD,
            organizationKey,
          })
        : "/hq/content";

      if (organizationId) {
        return renderWebsiteHub(req, res, {
          flags,
          organizationId,
          organizationKey,
          overview:
            overview && overview.ok
              ? overview
              : {
                  publicPath,
                  previewPath,
                  editPath,
                  inlineEditPath: editPath,
                },
          needsFoundationRepair,
          foundationGaps: (foundation && foundation.gaps) || [],
          notice: noticeMap[noticeRaw] || noticeRaw,
          publicPath,
          previewPath,
          planKey: (overview && overview.planKey) || "foundation",
        });
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
        needsFoundationRepair,
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

  function brandingErrorMessage(code) {
    if (code === "invalid_hex") return "Use a 6-digit colour like #6c5ce7.";
    return "Could not save branding. Try again.";
  }

  function presentBrandingFormValues(loaded) {
    const values = (loaded && loaded.values) || {};
    return {
      logo: imageFromWebsiteValue(values["home.logo"]),
      hero: imageFromWebsiteValue(values["home.hero.image"]),
      primaryColor: values["brand.primary_color"] || "",
      accentColor: values["brand.accent_color"] || "",
    };
  }

  async function renderBrandingPage(req, res, opts) {
    const flags = await websiteCapabilityFlags(req);
    const tenant = resolveTenantForAuthorization(req);
    const organizationId =
      tenant && tenant.organization && tenant.organization.id
        ? String(tenant.organization.id)
        : null;
    const organizationKey =
      (tenant &&
        tenant.organization &&
        (tenant.organization.key || tenant.organization.organizationKey)) ||
      "";
    if (!organizationId) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    registerBlessBoardWebsiteTemplate();
    const loaded = await loadWebsiteBranding(getPool(), {
      organizationId,
      productCode: PRODUCT_CODE.BLESSBOARD,
      keys: BRANDING_KEYS,
    });
    if (!loaded.ok) {
      return sendControlled(req, res, 503, "Website branding could not be loaded.");
    }
    const publicBase = organizationKey
      ? `/c/${encodeURIComponent(organizationKey)}`
      : "";
    const html = renderHqView(
      "hq/website-branding.ejs",
      await shellLocals(req, res, {
        websiteBranding: {
          values: presentBrandingFormValues(loaded),
          churchName:
            (tenant.church && tenant.church.displayName) ||
            (tenant.church && tenant.church.publicName) ||
            "Your church",
          defaults: colorDefaultsForProduct(PRODUCT_CODE.BLESSBOARD),
          canEdit: flags.canEditWebsite === true,
          saved: Boolean(opts && opts.saved),
          error: (opts && opts.error) || "",
          mediaListUrl: publicBase ? `${publicBase}/website/media` : "",
          previewHref: organizationKey
            ? buildPublicWebsitePreviewPath({
                product: PRODUCT_CODE.BLESSBOARD,
                organizationKey,
              })
            : "",
          editHref: organizationKey
            ? buildPublicWebsiteEditPath({
                product: PRODUCT_CODE.BLESSBOARD,
                organizationKey,
              })
            : "",
        },
      })
    );
    return res.status(200).type("html").send(html);
  }

  router.get("/hq/website/branding", rejectApex, gateHq, async (req, res) => {
    try {
      return await renderBrandingPage(req, res, {
        saved: String((req.query && req.query.saved) || "") === "1",
      });
    } catch {
      return sendControlled(req, res, 503, "Website branding could not be loaded.");
    }
  });

  router.post(
    "/hq/website/branding",
    rejectApex,
    gateHq,
    requireWebsiteEdit,
    async (req, res) => {
      try {
        const tenant = resolveTenantForAuthorization(req);
        const organizationId =
          tenant && tenant.organization && tenant.organization.id
            ? String(tenant.organization.id)
            : null;
        if (!organizationId) {
          return sendControlled(req, res, 403, "You do not have access to this site.");
        }
        const submitted = req.body && req.body[CSRF_FIELD];
        if (!validateCsrf(req, submitted, env)) {
          return sendControlled(req, res, 403, "Invalid or missing CSRF token.");
        }
        const primary = normalizeHexColor(req.body && req.body.primaryColor);
        const accent = normalizeHexColor(req.body && req.body.accentColor);
        if (!primary.ok || !accent.ok) {
          return await renderBrandingPage(req, res, {
            error: brandingErrorMessage("invalid_hex"),
          });
        }
        const flags = await websiteCapabilityFlags(req);
        const saved = await saveWebsiteBranding(getPool(), {
          organizationId,
          productCode: PRODUCT_CODE.BLESSBOARD,
          grantedPermissions: grantedWebsitePermissions(flags),
          actorIdentityId: await actorUserId(req),
          entries: [
            {
              key: "home.logo",
              value: imageValueFromParts(
                req.body && req.body.logoSrc,
                req.body && req.body.logoAlt,
                req.body && req.body.logoMediaId
              ),
            },
            { key: "brand.primary_color", value: primary.value },
            { key: "brand.accent_color", value: accent.value },
            {
              key: "home.hero.image",
              value: imageValueFromParts(
                req.body && req.body.heroSrc,
                req.body && req.body.heroAlt,
                req.body && req.body.heroMediaId
              ),
            },
          ],
        });
        if (!saved.ok) {
          return await renderBrandingPage(req, res, {
            error: brandingErrorMessage(saved.code),
          });
        }
        return res.redirect(303, "/hq/website/branding?saved=1");
      } catch {
        return sendControlled(req, res, 503, "Website branding could not be saved.");
      }
    }
  );

  // Repair writes draft settings and draft pages, so it needs edit rather than
  // the view-only shell gate.
  router.post("/hq/website/repair-foundation", rejectApex, gateHq, requireWebsiteEdit, async (req, res) => {
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

  // Acknowledging preview satisfies a publish precondition, so it is gated with
  // publish rather than the view-only shell gate.
  router.post("/hq/website/preview-ack", rejectApex, gateHq, requireWebsitePublish, async (req, res) => {
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

    const result = await publishProductWebsite(getPool(), {
      productCode: WEBSITE_PRODUCT_CODE,
      grantedPermissions: [WEBSITE_PERMISSIONS.PUBLISH],
      request: {
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
      },
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
    requireWebsitePublish,
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
    const result = await unpublishProductWebsite(getPool(), {
      productCode: WEBSITE_PRODUCT_CODE,
      grantedPermissions: [WEBSITE_PERMISSIONS.PUBLISH],
      request: {
        churchId: tenant.church.id,
        actorUserId: await actorUserId(req),
        env,
      },
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
