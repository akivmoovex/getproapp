"use strict";

/**
 * BlessBoard V5 public content administration (HQ church-wide, HQ branch scope, branch-admin).
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const express = require("express");

const {
  createRequireBlessBoardTenantRole,
} = require("./requireBlessBoardTenantRole");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { buildHqAdminShellLocals } = require("./hqAdminShellLocals");
const { buildBranchAdminShellLocals } = require("./branchAdminShellLocals");
const {
  listBlessBoardBranches,
  resolveBlessBoardBranchForChurch,
  STATUS: BRANCH_STATUS,
} = require("../services/listBlessBoardBranches");
const {
  authorizeBlessBoardTenantAccess,
  STATUS: AUTHZ_STATUS,
} = require("../services/authorizeBlessBoardTenantAccess");
const {
  CSRF_FIELD,
  validateCsrf,
} = require("../../platform/http/v5Csrf");
const multer = require("multer");
const { createMediaUploadService, STATUS: MEDIA_STATUS } = require("../media/mediaUploadService");
const { areMediaUploadsEnabled } = require("../config/mediaUploadsEnabled");
const { MAX_ANY_BYTES, VISIBILITY } = require("../media/mediaConstants");
const {
  provisionEmptyPublicPages,
  listAdminPages,
  getAdminPageBundle,
  updatePublicPage,
  createPageSection,
  updatePageSection,
  createLeader,
  updateLeader,
  listAdminLeaders,
  createMinistry,
  updateMinistry,
  listAdminMinistries,
  createEvent,
  updateEvent,
  listAdminEvents,
  createSermon,
  updateSermon,
  listAdminSermons,
  createContactChannel,
  updateContactChannel,
  listAdminContactChannels,
  createGivingMethod,
  updateGivingMethod,
  listAdminGivingMethods,
  STATUS: ADMIN_STATUS,
} = require("../services/publicContentAdminService");
const { PAGE_KEY_TITLES } = require("../services/publicContentConstants");
const repo = require("../repositories/publicContentRepository");
const {
  SERVICE_TIMES_SECTION_KEY,
  DAYS: SERVICE_TIME_DAYS,
  entriesFromSection,
  ensureCanonicalServiceTimesSection,
  saveHomeServiceTimes,
  repairHomeContentFoundation,
  STATUS: SERVICE_TIMES_STATUS,
} = require("../services/homeServiceTimesService");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");

const ENTITY_ROUTES = Object.freeze({
  leadership: {
    title: "Leadership",
    pageKey: "leadership",
    listFn: listAdminLeaders,
    createFn: createLeader,
    updateFn: updateLeader,
    findFn: repo.findLeaderById,
  },
  ministries: {
    title: "Ministries",
    pageKey: "ministries",
    listFn: listAdminMinistries,
    createFn: createMinistry,
    updateFn: updateMinistry,
    findFn: repo.findMinistryById,
  },
  events: {
    title: "Events",
    pageKey: "events",
    listFn: listAdminEvents,
    createFn: createEvent,
    updateFn: updateEvent,
    findFn: repo.findEventById,
  },
  sermons: {
    title: "Sermons",
    pageKey: "sermons",
    listFn: listAdminSermons,
    createFn: createSermon,
    updateFn: updateSermon,
    findFn: repo.findSermonById,
  },
  contact: {
    title: "Contact channels",
    pageKey: "contact",
    listFn: listAdminContactChannels,
    createFn: createContactChannel,
    updateFn: updateContactChannel,
    findFn: repo.findContactChannelById,
  },
  giving: {
    title: "Giving methods",
    pageKey: "giving",
    listFn: listAdminGivingMethods,
    createFn: createGivingMethod,
    updateFn: updateGivingMethod,
    findFn: repo.findGivingMethodById,
  },
});

/**
 * @param {string} relativePath
 * @param {object} data
 */
function renderContentAdminView(relativePath, data) {
  const filename = path.join(VIEWS_ROOT, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  return ejs.render(source, data, { filename });
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
 * @param {'hq'|'branch'} shellKind
 */
function sendControlled(req, res, status, message, shellKind) {
  const safe = escapeHtml(message);
  const wantsHtml = String(req.get("accept") || "").includes("text/html");
  if (!wantsHtml) {
    return res.status(status).type("text").send(String(message == null ? "" : message));
  }
  const css =
    shellKind === "hq"
      ? "/blessboard/v5/hq-admin.css?v=56"
      : "/blessboard/v5/branch-admin.css?v=38";
  const bodyClass = shellKind === "hq" ? "bb-hq-body" : "bb-ba-body";
  return res.status(status).type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Content · BlessBoard</title>
  <link rel="stylesheet" href="${css}" />
</head>
<body class="${bodyClass}">
  <main class="bb-ca-unavailable">
    <h1>${status === 401 ? "Sign-in required" : status === 404 ? "Not found" : "Unavailable"}</h1>
    <p>${safe}</p>
    <p><a href="/">Church homepage</a></p>
  </main>
</body>
</html>`);
}

/**
 * @param {object|null} page
 * @param {{ churchId: string, branchId: string|null }} scope
 */
function verifyPageScope(page, scope) {
  if (!page || page.churchId !== scope.churchId) return false;
  if (scope.branchId) return page.branchId === scope.branchId;
  return page.branchId == null;
}

/**
 * @param {object|null} item
 * @param {{ churchId: string, branchId: string|null }} scope
 */
function verifyEntityScope(item, scope) {
  if (!item || item.churchId !== scope.churchId) return false;
  if (scope.branchId) return item.branchId === scope.branchId;
  return item.branchId == null;
}

/**
 * @param {object} body
 */
function publishPatch(body) {
  return {
    confirmPublish: body.confirm_publish,
    expectedUpdatedAt: body.expected_updated_at,
    enforcePublishConfirm: true,
  };
}

function errorMessage(reason, conflict) {
  if (conflict || reason === "optimistic_conflict") {
    return "Someone else updated this record. Review the latest version and try again.";
  }
  if (reason === "confirm_publish") {
    return "You must check the box to confirm before publishing.";
  }
  if (reason === "name" || reason === "day" || reason === "start_time" || reason === "end_time") {
    return "Please check each service time entry and try again.";
  }
  if (reason === "end_time_order") {
    return "End time must be later than start time.";
  }
  if (reason === "duplicate") {
    return "Remove duplicate service times.";
  }
  if (reason === "entries_limit") {
    return "Too many service times. Remove some and try again.";
  }
  return "Please check the form and try again.";
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 *   sendUnavailable?: Function,
 *   variant: 'hq' | 'branch',
 *   mediaService?: ReturnType<typeof createMediaUploadService>,
 * }} deps
 */
function createContentAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const variant = deps.variant === "branch" ? "branch" : "hq";
  const mediaService = deps.mediaService || createMediaUploadService(env);
  const isProduction = String(env.NODE_ENV || "") === "production";
  const shellKind = variant === "hq" ? "hq" : "branch";
  const formClass = variant === "hq" ? "bb-hq-form" : "bb-ba-form";
  const loginNextDefault = variant === "hq" ? "/hq/content" : "/branch-admin/content";

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_ANY_BYTES, files: 1 },
  });

  const allowedRoles =
    variant === "hq"
      ? ["church_hq_admin", "platform_admin"]
      : ["platform_admin", "church_hq_admin", "branch_admin"];

  const router = express.Router();
  const requireAccess = createRequireBlessBoardTenantRole({ getPool, allowedRoles });

  function rejectApex(req, res, next) {
    if (isApexHost(req)) {
      if (typeof sendUnavailable === "function") return sendUnavailable(req, res);
      return res.status(503).type("text").send("Unavailable");
    }
    return next();
  }

  function gateContent(req, res, next) {
    req.contentAdminVariant = variant;
    const sessionOk = Boolean(req.v5Session && req.v5Session.authenticated);
    if (!sessionOk) {
      const wantsHtml = String(req.get("accept") || "").includes("text/html");
      if (wantsHtml) {
        const nextUrl = encodeURIComponent(req.originalUrl || loginNextDefault);
        return res.redirect(303, `/login?next=${nextUrl}`);
      }
      return sendControlled(req, res, 401, "Sign-in is required.", shellKind);
    }
    return requireAccess(req, res, next);
  }

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {object} [extra]
   */
  async function shellLocals(req, res, extra) {
    if (variant === "hq") {
      return buildHqAdminShellLocals(req, res, {
        env,
        isProduction,
      getPool,
        activeNav: "content",
        pageTitle: (extra && extra.pageTitle) || "Website content",
        extra: {
          shellKind: "hq",
          formClass,
          ...(extra || {}),
        },
      });
    }
    return buildBranchAdminShellLocals(req, res, {
      env,
      isProduction,
      activeNav: "content",
      pageTitle: (extra && extra.pageTitle) || "Website content",
      extra: {
        shellKind: "branch",
        formClass,
        ...(extra || {}),
      },
    });
  }

  function scopeInput(scope) {
    return { churchId: scope.churchId, branchId: scope.branchId };
  }

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async function resolveChurchWideScope(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id) {
      sendControlled(req, res, 403, "You do not have access to this site.", shellKind);
      return null;
    }
    return {
      churchId: tenant.church.id,
      branchId: null,
      branchKey: null,
      basePath: "/hq/content",
      scopeLabel: "Church-wide",
    };
  }

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async function resolveHqBranchScope(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id) {
      sendControlled(req, res, 403, "You do not have access to this site.", shellKind);
      return null;
    }
    const resolved = await resolveBlessBoardBranchForChurch(
      getPool(),
      tenant.church.id,
      req.params.branchKey
    );
    if (!resolved.ok) {
      if (resolved.status === BRANCH_STATUS.LOOKUP_ERROR) {
        sendControlled(req, res, 503, "Branch lookup is temporarily unavailable.", shellKind);
        return null;
      }
      sendControlled(req, res, 404, "This branch could not be found.", shellKind);
      return null;
    }
    const session = req.v5Session && req.v5Session.session;
    const authz = await authorizeBlessBoardTenantAccess(getPool(), {
      userId: session && session.userId,
      tenant,
      branchId: resolved.branch.id,
    });
    if (authz.status === AUTHZ_STATUS.LOOKUP_ERROR) {
      sendControlled(req, res, 503, "Access check is temporarily unavailable.", shellKind);
      return null;
    }
    if (!authz.ok) {
      sendControlled(req, res, 403, "You do not have access to this branch.", shellKind);
      return null;
    }
    return {
      churchId: tenant.church.id,
      branchId: resolved.branch.id,
      branchKey: resolved.branch.key,
      basePath: `/hq/content/b/${resolved.branch.key}`,
      scopeLabel: resolved.branch.displayName,
    };
  }

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async function resolveBranchAdminScope(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id || !tenant.primaryBranch) {
      sendControlled(req, res, 403, "You do not have access to this site.", shellKind);
      return null;
    }
    return {
      churchId: tenant.church.id,
      branchId: tenant.primaryBranch.id,
      branchKey: tenant.primaryBranch.key || null,
      basePath: "/branch-admin/content",
      scopeLabel: tenant.primaryBranch.displayName || "Branch",
    };
  }

  function validateCsrfPost(req, res) {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      sendControlled(req, res, 403, "Invalid or missing CSRF token.", shellKind);
      return false;
    }
    return true;
  }

  /**
   * @param {string} mountPrefix e.g. `/hq/content` or `/hq/content/b/:branchKey`
   * @param {(req: import('express').Request, res: import('express').Response) => Promise<object|null>} resolveScope
   */
  function registerRoutes(mountPrefix, resolveScope) {
    const p = mountPrefix.replace(/\/$/, "");

    function multerSingle(req, res, next) {
      upload.single("file")(req, res, (err) => {
        if (!err) return next();
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ ok: false, reason: "size_limit" });
        }
        return res.status(400).json({ ok: false, reason: "upload_error" });
      });
    }

    router.post(
      `${p}/media/upload`,
      rejectApex,
      gateContent,
      (req, res, next) => {
        if (!areMediaUploadsEnabled(env)) {
          return res.status(403).json({ ok: false, reason: "media_uploads_disabled" });
        }
        return next();
      },
      multerSingle,
      async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const submitted =
        (req.body && req.body[CSRF_FIELD]) ||
        (req.headers["x-csrf-token"] != null ? String(req.headers["x-csrf-token"]) : "");
      if (!validateCsrf(req, submitted, env)) {
        return res.status(403).json({ ok: false, reason: "csrf" });
      }
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ ok: false, reason: "empty_file" });
      }
      const session = req.v5Session && req.v5Session.session;
      const visibility =
        String((req.body && req.body.visibility) || VISIBILITY.PUBLIC).toLowerCase() ===
        VISIBILITY.PRIVATE
          ? VISIBILITY.PRIVATE
          : VISIBILITY.PUBLIC;

      const result = await mediaService.uploadMediaAsset(getPool(), {
        churchId: scope.churchId,
        branchId: scope.branchId,
        uploadedByUserId: session && session.userId,
        buffer: req.file.buffer,
        originalFilename: req.file.originalname,
        claimedMime: req.file.mimetype,
        visibility,
      });

      if (!result.ok) {
        const status =
          result.status === MEDIA_STATUS.FORBIDDEN
            ? 403
            : result.status === MEDIA_STATUS.CONFLICT
              ? 409
              : result.status === MEDIA_STATUS.STORAGE_ERROR
                ? 503
                : 400;
        const cleanup =
          result.status === MEDIA_STATUS.STORAGE_ERROR || result.reason === "upload_failed";
        return res.status(status).json({
          ok: false,
          reason: result.reason || "upload_failed",
          cleanup: cleanup ? "removed" : null,
        });
      }

      return res.status(200).json({
        ok: true,
        assetId: result.asset.id,
        deliveryPath: result.deliveryPath,
        mimeType: result.asset.mimeType,
        sizeBytes: result.asset.sizeBytes,
        visibility: result.asset.visibility,
        originalFilename: result.asset.originalFilename,
        deduped: Boolean(result.deduped),
      });
      }
    );

    router.get(`${p}/media`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const visibilityRaw = String((req.query && req.query.visibility) || "")
        .trim()
        .toLowerCase();
      const visibility =
        visibilityRaw === VISIBILITY.PUBLIC || visibilityRaw === VISIBILITY.PRIVATE
          ? visibilityRaw
          : null;
      const listed = await mediaService.listMediaAssets(getPool(), {
        churchId: scope.churchId,
        visibility,
        limit: req.query && req.query.limit,
      });
      if (!listed.ok) {
        return res.status(503).json({ ok: false, reason: listed.reason || "lookup", assets: [] });
      }
      const assets = (listed.assets || []).map((a) => ({
        ...a,
        previewPath: `${String(scope.basePath || p).replace(/\/$/, "")}/media/${a.id}`,
      }));
      return res.status(200).json({ ok: true, assets });
    });

    router.post(`${p}/media/:assetId/archive`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const submitted =
        (req.body && req.body[CSRF_FIELD]) ||
        (req.headers["x-csrf-token"] != null ? String(req.headers["x-csrf-token"]) : "");
      if (!validateCsrf(req, submitted, env)) {
        return res.status(403).json({ ok: false, reason: "csrf" });
      }
      const result = await mediaService.archiveMediaAsset(getPool(), {
        assetId: req.params.assetId,
        churchId: scope.churchId,
      });
      if (!result.ok) {
        const status = result.status === MEDIA_STATUS.NOT_FOUND ? 404 : 400;
        return res.status(status).json({ ok: false, reason: result.reason || "archive_failed" });
      }
      return res.status(200).json({ ok: true, assetId: result.asset.id, status: result.asset.status });
    });

    router.get(`${p}/media/:assetId`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const loaded = await mediaService.loadMediaBytes(getPool(), {
        assetId: req.params.assetId,
        viewerChurchId: scope.churchId,
        allowPrivate: true,
      });
      if (!loaded.ok) {
        const code =
          loaded.status === MEDIA_STATUS.FORBIDDEN
            ? 403
            : loaded.status === MEDIA_STATUS.NOT_FOUND
              ? 404
              : 503;
        return sendControlled(
          req,
          res,
          code,
          code === 403 ? "You do not have access to this file." : "Media not found.",
          shellKind
        );
      }
      if (loaded.redirectUrl) {
        return res.redirect(302, loaded.redirectUrl);
      }
      res.setHeader("Content-Type", loaded.asset.mimeType);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).send(loaded.buffer);
    });

    router.get(p, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      await provisionEmptyPublicPages(getPool(), scopeInput(scope));
      const listed = await listAdminPages(getPool(), scopeInput(scope));
      let branches = [];
      if (variant === "hq" && !scope.branchId) {
        const listResult = await listBlessBoardBranches(getPool(), scope.churchId);
        branches = (listResult && listResult.branches) || [];
      }
      const rawStatus = String((req.query && req.query.status) || "")
        .trim()
        .toLowerCase();
      const statusFilter =
        variant === "hq" && ["draft", "published", "archived"].includes(rawStatus)
          ? rawStatus
          : "";
      const q =
        variant === "hq"
          ? String((req.query && req.query.q) || "")
              .trim()
              .slice(0, 100)
          : "";
      const html = renderContentAdminView(
        "content-admin/index.ejs",
        await shellLocals(req, res, {
          scope,
          pages: (listed && listed.pages) || [],
          pageTitles: PAGE_KEY_TITLES,
          branches,
          statusFilter,
          q,
          error: null,
          saved: String((req.query && req.query.saved) || "") === "1",
        })
      );
      return res.status(200).type("html").send(html);
    });

    router.get(`${p}/pages/:pageKey`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const pageKey = String(req.params.pageKey || "").trim();
      const isChurchWideHome = pageKey === "home" && !scope.branchId;
      if (isChurchWideHome) {
        await ensureCanonicalServiceTimesSection(getPool(), {
          churchId: scope.churchId,
          branchId: null,
        });
      }
      const bundle = await getAdminPageBundle(getPool(), {
        ...scopeInput(scope),
        pageKey,
      });
      if (!bundle.ok || !bundle.page) {
        return sendControlled(req, res, 404, "Page not found.", shellKind);
      }
      if (!verifyPageScope(bundle.page, scope)) {
        return sendControlled(req, res, 403, "You do not have access to this page.", shellKind);
      }
      const serviceTimesSection = isChurchWideHome
        ? (bundle.sections || []).find((s) => s.sectionKey === SERVICE_TIMES_SECTION_KEY) || null
        : null;
      const serviceTimesEntries = serviceTimesSection
        ? entriesFromSection(serviceTimesSection)
        : [];
      const html = renderContentAdminView(
        "content-admin/page.ejs",
        await shellLocals(req, res, {
          scope,
          page: bundle.page,
          sections: bundle.sections || [],
          error: null,
          conflict: false,
          submitted: null,
          saved: String((req.query && req.query.saved) || "") === "1",
          serviceTimesSaved: String((req.query && req.query.service_times) || "") === "1",
          showServiceTimesEditor: isChurchWideHome,
          serviceTimesSection,
          serviceTimesEntries,
          serviceTimeDays: SERVICE_TIME_DAYS,
          serviceTimesError: null,
        })
      );
      return res.status(200).type("html").send(html);
    });

    router.post(`${p}/pages/home/service-times`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      if (!validateCsrfPost(req, res)) return;
      if (scope.branchId) {
        return sendControlled(
          req,
          res,
          403,
          "Service times are managed on the church-wide home page.",
          shellKind
        );
      }
      const body = req.body || {};
      const tenant = resolveTenantForAuthorization(req);
      const organizationId =
        tenant && tenant.organization && tenant.organization.id
          ? tenant.organization.id
          : null;
      const actorUserId =
        req.v5Session && req.v5Session.session && req.v5Session.session.userId
          ? req.v5Session.session.userId
          : null;
      const saved = await saveHomeServiceTimes(getPool(), {
        churchId: scope.churchId,
        branchId: null,
        organizationId,
        actorUserId,
        formBody: body,
        confirmPublish: body.confirm_publish,
      });
      if (!saved.ok) {
        const bundle = await getAdminPageBundle(getPool(), {
          churchId: scope.churchId,
          branchId: null,
          pageKey: "home",
        });
        const serviceTimesSection =
          (bundle.sections || []).find((s) => s.sectionKey === SERVICE_TIMES_SECTION_KEY) || null;
        const html = renderContentAdminView(
          "content-admin/page.ejs",
          await shellLocals(req, res, {
            scope,
            page: bundle.page || { pageKey: "home", title: "Home", status: "draft", updatedAt: new Date() },
            sections: (bundle && bundle.sections) || [],
            error: saved.message || errorMessage(saved.reason, false),
            conflict: false,
            submitted: null,
            saved: false,
            serviceTimesSaved: false,
            showServiceTimesEditor: true,
            serviceTimesSection,
            serviceTimesEntries: [],
            serviceTimeDays: SERVICE_TIME_DAYS,
            serviceTimesError: saved.message || errorMessage(saved.reason, false),
            serviceTimesDraft: body,
          })
        );
        const statusCode =
          saved.status === SERVICE_TIMES_STATUS.INVALID_INPUT
            ? 400
            : saved.status === SERVICE_TIMES_STATUS.NOT_FOUND
              ? 404
              : 503;
        return res.status(statusCode).type("html").send(html);
      }
      return res.redirect(303, `${scope.basePath}/pages/home?saved=1&service_times=1`);
    });

    router.post(`${p}/pages/home/repair-service-times`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      if (!validateCsrfPost(req, res)) return;
      if (scope.branchId) {
        return sendControlled(
          req,
          res,
          403,
          "Service times are managed on the church-wide home page.",
          shellKind
        );
      }
      const tenant = resolveTenantForAuthorization(req);
      const repaired = await repairHomeContentFoundation(getPool(), {
        churchId: scope.churchId,
        organizationId:
          tenant && tenant.organization && tenant.organization.id
            ? tenant.organization.id
            : null,
        actorUserId:
          req.v5Session && req.v5Session.session && req.v5Session.session.userId
            ? req.v5Session.session.userId
            : null,
      });
      if (!repaired.ok) {
        return sendControlled(req, res, 503, "Could not repair home content foundation.", shellKind);
      }
      return res.redirect(303, `${scope.basePath}/pages/home?saved=1&service_times=1`);
    });

    router.post(`${p}/pages/:pageKey`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      if (!validateCsrfPost(req, res)) return;
      const body = req.body || {};
      const bundle = await getAdminPageBundle(getPool(), {
        ...scopeInput(scope),
        pageKey: req.params.pageKey,
      });
      if (!bundle.ok || !bundle.page) {
        return sendControlled(req, res, 404, "Page not found.", shellKind);
      }
      if (!verifyPageScope(bundle.page, scope)) {
        return sendControlled(req, res, 403, "You do not have access to this page.", shellKind);
      }
      const updated = await updatePublicPage(getPool(), bundle.page.id, {
        title: body.title,
        status: body.status,
        ...publishPatch(body),
      });
      if (!updated.ok) {
        const isConflict = updated.status === ADMIN_STATUS.CONFLICT;
        const isConfirm = updated.reason === "confirm_publish";
        const statusCode = isConflict ? 409 : isConfirm || updated.status === ADMIN_STATUS.INVALID_INPUT ? 400 : 503;
        const html = renderContentAdminView(
          "content-admin/page.ejs",
          await shellLocals(req, res, {
            scope,
            page: isConflict ? updated.page || bundle.page : bundle.page,
            sections: bundle.sections || [],
            error: errorMessage(updated.reason, isConflict),
            conflict: isConflict,
            submitted: {
              title: body.title != null ? String(body.title) : bundle.page.title,
              status: body.status != null ? String(body.status) : bundle.page.status,
            },
          })
        );
        return res.status(statusCode).type("html").send(html);
      }
      return res.redirect(303, `${scope.basePath}/pages/${req.params.pageKey}?saved=1`);
    });

    router.get(`${p}/pages/:pageKey/sections/:sectionKey`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const bundle = await getAdminPageBundle(getPool(), {
        ...scopeInput(scope),
        pageKey: req.params.pageKey,
      });
      if (!bundle.ok || !bundle.page) {
        return sendControlled(req, res, 404, "Page not found.", shellKind);
      }
      if (!verifyPageScope(bundle.page, scope)) {
        return sendControlled(req, res, 403, "You do not have access to this page.", shellKind);
      }
      const section = (bundle.sections || []).find((s) => s.sectionKey === req.params.sectionKey);
      if (!section || section.pageId !== bundle.page.id) {
        return sendControlled(req, res, 404, "Section not found.", shellKind);
      }
      const html = renderContentAdminView(
        "content-admin/section.ejs",
        await shellLocals(req, res, {
          scope,
          page: bundle.page,
          section,
          error: null,
          conflict: false,
          submitted: null,
          saved: String((req.query && req.query.saved) || "") === "1",
        })
      );
      return res.status(200).type("html").send(html);
    });

    router.post(`${p}/pages/:pageKey/sections`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      if (!validateCsrfPost(req, res)) return;
      const body = req.body || {};
      const bundle = await getAdminPageBundle(getPool(), {
        ...scopeInput(scope),
        pageKey: req.params.pageKey,
      });
      if (!bundle.ok || !bundle.page) {
        return sendControlled(req, res, 404, "Page not found.", shellKind);
      }
      if (!verifyPageScope(bundle.page, scope)) {
        return sendControlled(req, res, 403, "You do not have access to this page.", shellKind);
      }
      const created = await createPageSection(getPool(), {
        pageId: bundle.page.id,
        sectionKey: body.section_key,
        sectionType: body.section_type,
        heading: body.heading,
        bodyText: body.body_text,
        mediaUrl: body.media_url,
        sortOrder: body.sort_order,
        status: body.status,
        confirmPublish: body.confirm_publish,
        enforcePublishConfirm: true,
      });
      if (!created.ok) {
        const html = renderContentAdminView(
          "content-admin/page.ejs",
          await shellLocals(req, res, {
            scope,
            page: bundle.page,
            sections: bundle.sections || [],
            error: errorMessage(created.reason, false),
            conflict: false,
            submitted: null,
            sectionFormError: true,
            sectionDraft: body,
          })
        );
        const statusCode =
          created.reason === "confirm_publish" || created.status === ADMIN_STATUS.INVALID_INPUT
            ? 400
            : 503;
        return res.status(statusCode).type("html").send(html);
      }
      return res.redirect(
        303,
        `${scope.basePath}/pages/${req.params.pageKey}/sections/${created.section.sectionKey}?saved=1`
      );
    });

    router.post(`${p}/pages/:pageKey/sections/:sectionKey`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      if (!validateCsrfPost(req, res)) return;
      const body = req.body || {};
      const bundle = await getAdminPageBundle(getPool(), {
        ...scopeInput(scope),
        pageKey: req.params.pageKey,
      });
      if (!bundle.ok || !bundle.page) {
        return sendControlled(req, res, 404, "Page not found.", shellKind);
      }
      if (!verifyPageScope(bundle.page, scope)) {
        return sendControlled(req, res, 403, "You do not have access to this page.", shellKind);
      }
      const section = (bundle.sections || []).find((s) => s.sectionKey === req.params.sectionKey);
      if (!section || section.pageId !== bundle.page.id) {
        return sendControlled(req, res, 404, "Section not found.", shellKind);
      }
      const updated = await updatePageSection(getPool(), section.id, {
        heading: body.heading,
        bodyText: body.body_text,
        mediaUrl: body.media_url,
        sortOrder: body.sort_order,
        status: body.status,
        sectionType: body.section_type,
        ...publishPatch(body),
      });
      if (!updated.ok) {
        const isConflict = updated.status === ADMIN_STATUS.CONFLICT;
        const isConfirm = updated.reason === "confirm_publish";
        const statusCode = isConflict ? 409 : isConfirm || updated.status === ADMIN_STATUS.INVALID_INPUT ? 400 : 503;
        const html = renderContentAdminView(
          "content-admin/section.ejs",
          await shellLocals(req, res, {
            scope,
            page: bundle.page,
            section: isConflict ? updated.section || section : section,
            error: errorMessage(updated.reason, isConflict),
            conflict: isConflict,
            submitted: {
              heading: body.heading != null ? String(body.heading) : section.heading,
              body_text: body.body_text != null ? String(body.body_text) : section.bodyText,
              media_url: body.media_url != null ? String(body.media_url) : section.mediaUrl || "",
              sort_order: body.sort_order != null ? String(body.sort_order) : String(section.sortOrder),
              status: body.status != null ? String(body.status) : section.status,
              section_type: body.section_type != null ? String(body.section_type) : section.sectionType,
            },
          })
        );
        return res.status(statusCode).type("html").send(html);
      }
      return res.redirect(
        303,
        `${scope.basePath}/pages/${req.params.pageKey}/sections/${req.params.sectionKey}?saved=1`
      );
    });

    for (const [routeKey, cfg] of Object.entries(ENTITY_ROUTES)) {
      router.get(`${p}/${routeKey}`, rejectApex, gateContent, async (req, res) => {
        const scope = await resolveScope(req, res);
        if (!scope) return;
        const listed = await cfg.listFn(getPool(), scopeInput(scope));
        const rawStatus = String((req.query && req.query.status) || "")
          .trim()
          .toLowerCase();
        const allowedStatus =
          routeKey === "events"
            ? ["draft", "published", "cancelled", "archived"]
            : ["draft", "published", "archived"];
        const statusFilter = allowedStatus.includes(rawStatus) ? rawStatus : "";
        const q = String((req.query && req.query.q) || "")
          .trim()
          .slice(0, 100);
        const rawWhen = String((req.query && req.query.when) || "")
          .trim()
          .toLowerCase();
        const whenFilter =
          routeKey === "events" && (rawWhen === "upcoming" || rawWhen === "past") ? rawWhen : "";
        const html = renderContentAdminView(
          "content-admin/entities.ejs",
          await shellLocals(req, res, {
            scope,
            entityKind: routeKey,
            entityTitle: cfg.title,
            items: (listed && listed.items) || [],
            statusFilter,
            q,
            whenFilter,
            error: null,
            conflict: false,
            submitted: null,
            saved: String((req.query && req.query.saved) || "") === "1",
          })
        );
        return res.status(200).type("html").send(html);
      });

      router.post(`${p}/${routeKey}`, rejectApex, gateContent, async (req, res) => {
        const scope = await resolveScope(req, res);
        if (!scope) return;
        if (!validateCsrfPost(req, res)) return;
        const body = req.body || {};
        const action = String(body.action || "create").trim().toLowerCase();
        let result;
        if (action === "update") {
          const itemId = String(body.item_id || "").trim();
          if (!itemId) {
            return sendControlled(req, res, 400, "Item id is required for update.", shellKind);
          }
          const existing = await cfg.findFn(getPool(), itemId);
          if (!existing || !verifyEntityScope(existing, scope)) {
            return sendControlled(req, res, 404, "Item not found.", shellKind);
          }
          result = await cfg.updateFn(getPool(), itemId, entityPatchFromBody(routeKey, body));
        } else {
          result = await cfg.createFn(getPool(), {
            ...scopeInput(scope),
            ...entityPatchFromBody(routeKey, body),
          });
        }
        const listed = await cfg.listFn(getPool(), scopeInput(scope));
        if (!result.ok) {
          const isConflict = result.status === ADMIN_STATUS.CONFLICT;
          const isConfirm = result.reason === "confirm_publish";
          const statusCode = isConflict ? 409 : isConfirm || result.status === ADMIN_STATUS.INVALID_INPUT ? 400 : 503;
          const html = renderContentAdminView(
            "content-admin/entities.ejs",
            await shellLocals(req, res, {
              scope,
              entityKind: routeKey,
              entityTitle: cfg.title,
              items: (listed && listed.items) || [],
              statusFilter: "",
              q: "",
              whenFilter: "",
              error: errorMessage(result.reason, isConflict),
              conflict: isConflict,
              submitted: body,
              editItemId: action === "update" ? String(body.item_id || "") : null,
              saved: false,
            })
          );
          return res.status(statusCode).type("html").send(html);
        }
        return res.redirect(303, `${scope.basePath}/${routeKey}?saved=1`);
      });
    }

    router.get(`${p}/preview/:pageKey`, rejectApex, gateContent, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const pageKey = req.params.pageKey;
      const bundle = await getAdminPageBundle(getPool(), {
        ...scopeInput(scope),
        pageKey,
      });
      if (!bundle.ok || !bundle.page) {
        return sendControlled(req, res, 404, "Page not found.", shellKind);
      }
      if (!verifyPageScope(bundle.page, scope)) {
        return sendControlled(req, res, 403, "You do not have access to this page.", shellKind);
      }
      if (bundle.page.status === "archived") {
        return sendControlled(req, res, 404, "Page not found.", shellKind);
      }
      const sections = (bundle.sections || []).filter((s) => s.status !== "archived");
      let entities = [];
      const entityCfg = ENTITY_ROUTES[pageKey];
      if (entityCfg) {
        const listed = await entityCfg.listFn(getPool(), scopeInput(scope));
        entities = ((listed && listed.items) || []).filter(
          (item) => item.status === "draft" || item.status === "published"
        );
      }
      const html = renderContentAdminView(
        "content-admin/preview.ejs",
        await shellLocals(req, res, {
          scope,
          page: bundle.page,
          pageKey,
          pageTitle: PAGE_KEY_TITLES[pageKey] || bundle.page.title,
          sections,
          entities,
        })
      );
      return res.status(200).type("html").send(html);
    });
  }

  if (variant === "hq") {
    registerRoutes("/hq/content", resolveChurchWideScope);
    registerRoutes("/hq/content/b/:branchKey", resolveHqBranchScope);
  } else {
    registerRoutes("/branch-admin/content", resolveBranchAdminScope);
  }

  return router;
}

/**
 * @param {string} routeKey
 * @param {object} body
 */
function entityPatchFromBody(routeKey, body) {
  const base = {
    status: body.status,
    confirmPublish: body.confirm_publish,
    expectedUpdatedAt: body.expected_updated_at,
    enforcePublishConfirm: true,
    sortOrder: body.sort_order,
  };
  switch (routeKey) {
    case "leadership":
      return {
        ...base,
        displayName: body.display_name,
        roleTitle: body.role_title,
        biography: body.biography,
        imageUrl: body.image_url,
      };
    case "ministries":
      return {
        ...base,
        name: body.name,
        summary: body.summary,
        description: body.description,
        meetingDay: body.meeting_day,
        contactEmail: body.contact_email,
        imageUrl: body.image_url,
      };
    case "events":
      return {
        ...base,
        title: body.title,
        summary: body.summary,
        startsAt: body.starts_at,
        endsAt: body.ends_at,
        timezone: body.timezone,
        location: body.location,
        registrationUrl: body.registration_url,
        imageUrl: body.image_url,
      };
    case "sermons":
      return {
        ...base,
        title: body.title,
        speakerName: body.speaker_name,
        preachedAt: body.preached_at,
        summary: body.summary,
        mediaUrl: body.media_url,
        resourceUrl: body.resource_url,
      };
    case "contact":
      return {
        ...base,
        channelType: body.channel_type,
        label: body.label,
        value: body.value,
      };
    case "giving":
      return {
        ...base,
        methodType: body.method_type,
        label: body.label,
        instructions: body.instructions,
        externalUrl: body.external_url,
      };
    default:
      return base;
  }
}

module.exports = {
  createContentAdminRouter,
  renderContentAdminView,
};
