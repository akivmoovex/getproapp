"use strict";

/**
 * BlessBoard V5 announcement admin CRUD (HQ church-wide + branch-scoped).
 * Soft lifecycle only — archive, never hard-delete announcements.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const express = require("express");

const {
  createRequireBlessBoardTenantRole,
} = require("./requireBlessBoardTenantRole");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const { buildBranchAdminShellLocals } = require("./branchAdminShellLocals");
const { buildHqAdminShellLocals } = require("./hqAdminShellLocals");
const {
  CSRF_FIELD,
  validateCsrf,
} = require("../../platform/http/v5Csrf");
const {
  STATUS,
  createAnnouncement,
  updateAnnouncement,
  listAdminAnnouncements,
  getAdminAnnouncement,
  presentAnnouncementForRender,
} = require("../services/announcementsService");
const { createMediaUploadService } = require("../media/mediaUploadService");
const { sendPrivateMediaDownload } = require("./sendPrivateMediaDownload");
const {
  listBlessBoardBranches,
  resolveBlessBoardBranchForChurch,
  STATUS: BRANCH_STATUS,
} = require("../services/listBlessBoardBranches");
const {
  authorizeBlessBoardTenantAccess,
  STATUS: AUTHZ_STATUS,
} = require("../services/authorizeBlessBoardTenantAccess");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 20;
const MAX_LIST_PAGE = 10000;

/**
 * @param {string} relativePath
 * @param {object} data
 */
function renderView(relativePath, data) {
  const filename = path.join(VIEWS_ROOT, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  return ejs.render(source, data, { filename });
}

/**
 * @param {unknown} value
 */
function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sendControlled(req, res, status, message, shellKind) {
  const safe = escapeHtml(message);
  const wantsHtml = String(req.get("accept") || "").includes("text/html");
  if (!wantsHtml) {
    return res.status(status).type("text").send(String(message == null ? "" : message));
  }
  const css = shellKind === "hq" ? "hq-admin.css" : "branch-admin.css";
  const bodyClass = shellKind === "hq" ? "bb-hq-body" : "bb-ba-body";
  return res.status(status).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Announcements</title>
<link rel="stylesheet" href="/blessboard/v5/${css}"/></head>
<body class="${bodyClass}"><main><h1>Unavailable</h1><p>${safe}</p>
<p><a href="/">Church homepage</a></p></main></body></html>`);
}

function errorMessage(reason) {
  if (reason === "confirm_publish") {
    return "You must confirm before publishing.";
  }
  if (reason === "platform_publish_denied") {
    return "Platform admins may inspect announcements but cannot publish unless product policy allows it.";
  }
  if (reason === "church_wide_denied") {
    return "Branch admins cannot manage church-wide announcements.";
  }
  if (reason === "optimistic_conflict") {
    return "Someone else updated this record. Review the latest version and try again.";
  }
  if (reason === "already_archived") {
    return "This announcement is already archived.";
  }
  if (reason === "already_published") {
    return "This announcement is already published.";
  }
  return "Please check the form and try again.";
}

function parseAudiencesFromBody(body) {
  const keys = [];
  if (body.audience_members === "1" || body.audience_members === "on") keys.push("members");
  if (body.audience_admins === "1" || body.audience_admins === "on") keys.push("admins");
  if (Array.isArray(body.audiences)) {
    for (const k of body.audiences) keys.push(String(k));
  } else if (typeof body.audiences === "string" && body.audiences) {
    keys.push(body.audiences);
  }
  return [...new Set(keys)];
}

function formItemFromBody(body, id) {
  return {
    id: id || null,
    title: body.title || "",
    body: body.body || "",
    status: body.status || "draft",
    isPinned: Boolean(body.is_pinned),
    isFeatured: Boolean(body.is_featured),
    actionUrl: body.action_url || "",
    actionLabel: body.action_label || "",
    audiences: parseAudiencesFromBody(body),
  };
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 *   sendUnavailable?: Function,
 *   variant: 'hq' | 'branch',
 * }} deps
 */
function createAnnouncementAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const variant = deps.variant === "branch" ? "branch" : "hq";
  const isProduction = String(env.NODE_ENV || "") === "production";
  const shellKind = variant === "hq" ? "hq" : "branch";
  const mediaService = deps.mediaService || createMediaUploadService(env);
  const loginNextDefault =
    variant === "hq" ? "/hq/announcements" : "/branch-admin/announcements";
  const productPolicy = {
    allowPlatformAdminPublish:
      String(env.BLESSBOARD_ALLOW_PLATFORM_ADMIN_ANNOUNCEMENT_PUBLISH || "") === "1",
  };

  const allowedRoles =
    variant === "hq"
      ? ["church_hq_admin", "platform_admin"]
      : ["platform_admin", "church_hq_admin", "branch_admin"];

  const router = express.Router();
  const requireAccess = createRequireBlessBoardTenantRole({ getPool, allowedRoles });

  const rejectApex = createRejectApex({
    isApexHost,
    sendUnavailable,
    mode: variant === "hq" ? "unlessTenant" : "hard",
  });

  function gate(req, res, next) {
    const sessionOk = Boolean(req.v5Session && req.v5Session.authenticated);
    if (!sessionOk) {
      const wantsHtml = String(req.get("accept") || "").includes("text/html");
      if (wantsHtml) {
        return res.redirect(303, `/login?next=${encodeURIComponent(req.originalUrl || loginNextDefault)}`);
      }
      return sendControlled(req, res, 401, "Sign-in is required.", shellKind);
    }
    return requireAccess(req, res, next);
  }

  async function shellLocals(req, res, extra) {
    if (variant === "branch") {
      return buildBranchAdminShellLocals(req, res, {
        env,
        isProduction,
        activeNav: "announcements",
        pageTitle: (extra && extra.pageTitle) || "Announcements",
        extra: {
          shellKind: "branch",
          ...(extra || {}),
        },
      });
    }
    return buildHqAdminShellLocals(req, res, {
      env,
      isProduction,
      getPool,
      activeNav: "announcements",
      pageTitle: (extra && extra.pageTitle) || "Announcements",
      extra: {
        shellKind: "hq",
        ...(extra || {}),
      },
    });
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
   * @returns {Promise<{ churchId: string, branchId: string|null, basePath: string, tenant: object, actorUserId: string }|null>}
   */
  async function resolveScope(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id) {
      sendControlled(req, res, 403, "You do not have access to this site.", shellKind);
      return null;
    }
    const session = req.v5Session && req.v5Session.session;
    if (!session || !session.userId) {
      sendControlled(req, res, 401, "Sign-in is required.", shellKind);
      return null;
    }

    if (variant === "branch") {
      if (!tenant.primaryBranch || !tenant.primaryBranch.id) {
        sendControlled(req, res, 403, "You do not have access to this site.", shellKind);
        return null;
      }
      return {
        churchId: tenant.church.id,
        branchId: tenant.primaryBranch.id,
        branchKey: tenant.primaryBranch.key || null,
        branchDisplayName: tenant.primaryBranch.displayName || null,
        basePath: "/branch-admin/announcements",
        tenant,
        actorUserId: session.userId,
      };
    }

    const branchKey = req.params && req.params.branchKey ? String(req.params.branchKey) : "";
    if (branchKey) {
      const resolved = await resolveBlessBoardBranchForChurch(
        getPool(),
        tenant.church.id,
        branchKey
      );
      if (!resolved.ok || !resolved.branch) {
        const code =
          resolved.status === BRANCH_STATUS.LOOKUP_ERROR
            ? 503
            : resolved.status === BRANCH_STATUS.INACTIVE
              ? 404
              : 404;
        sendControlled(
          req,
          res,
          code,
          code === 503 ? "Branch lookup is temporarily unavailable." : "Branch not found.",
          shellKind
        );
        return null;
      }
      const authz = await authorizeBlessBoardTenantAccess(getPool(), {
        userId: session.userId,
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
        branchDisplayName: resolved.branch.displayName,
        basePath: `/hq/announcements/b/${resolved.branch.key}`,
        tenant,
        actorUserId: session.userId,
      };
    }

    return {
      churchId: tenant.church.id,
      branchId: null,
      branchKey: null,
      branchDisplayName: null,
      basePath: "/hq/announcements",
      tenant,
      actorUserId: session.userId,
    };
  }

  function mediaUploadUrlForScope(scope) {
    if (variant === "branch") return "/branch-admin/content/media/upload";
    if (scope && scope.branchKey) return `/hq/content/b/${scope.branchKey}/media/upload`;
    return "/hq/content/media/upload";
  }

  function editorScopeExtras(scope, isBranchScoped) {
    return {
      branchDisplayName: (scope && scope.branchDisplayName) || null,
      branchKey: (scope && scope.branchKey) || null,
      scopeLabel: isBranchScoped
        ? (scope && scope.branchDisplayName) || "Branch"
        : "Church-wide",
      isHqChurchWide: variant === "hq" && !(scope && scope.branchId),
      isHqBranchScoped: variant === "hq" && Boolean(scope && scope.branchId),
    };
  }

  async function loadScopedAnnouncement(req, res, scope, id) {
    if (!UUID_RE.test(id)) {
      sendControlled(req, res, 404, "Announcement not found.", shellKind);
      return null;
    }
    const loaded = await getAdminAnnouncement(getPool(), {
      id,
      churchId: scope.churchId,
      scopeBranchId: scope.branchId,
      actorUserId: scope.actorUserId,
      tenant: scope.tenant,
      productPolicy,
    });
    if (!loaded.ok || !loaded.item) {
      sendControlled(
        req,
        res,
        loaded.status === STATUS.FORBIDDEN ? 403 : 404,
        "Announcement not found.",
        shellKind
      );
      return null;
    }
    return presentAnnouncementForRender(loaded.item);
  }

  function registerRoutes(mountPrefix, isBranchScoped) {
    router.get(mountPrefix, rejectApex, gate, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const q = String((req.query && req.query.q) || "").slice(0, 100);
      const status = String((req.query && req.query.status) || "").trim().toLowerCase();
      const audience = String((req.query && req.query.audience) || "").trim().toLowerCase();
      let page = Math.max(Number((req.query && req.query.page) || 1) || 1, 1);
      if (page > MAX_LIST_PAGE) page = MAX_LIST_PAGE;
      const limit = PAGE_SIZE;
      const offset = (page - 1) * limit;
      const listed = await listAdminAnnouncements(getPool(), {
        churchId: scope.churchId,
        branchId: scope.branchId,
        actorUserId: scope.actorUserId,
        tenant: scope.tenant,
        productPolicy,
        status: status || null,
        audienceKey: audience === "members" || audience === "admins" ? audience : null,
        q: q || null,
        limit,
        offset,
      });
      if (!listed.ok) {
        return sendControlled(
          req,
          res,
          listed.status === STATUS.FORBIDDEN ? 403 : 503,
          "Announcements are temporarily unavailable.",
          shellKind
        );
      }
      const total = listed.total || 0;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      let branches = [];
      if (variant === "hq" && !scope.branchId) {
        const listResult = await listBlessBoardBranches(getPool(), scope.churchId);
        branches = listResult.ok ? listResult.branches : [];
      }
      const html = renderView(
        "announcements/admin-list.ejs",
        await shellLocals(req, res, {
          items: listed.items,
          basePath: scope.basePath,
          scopeLabel: isBranchScoped
            ? scope.branchDisplayName || "Branch"
            : "Church-wide",
          branchDisplayName: scope.branchDisplayName || null,
          branchKey: scope.branchKey || null,
          branches,
          isHqChurchWide: variant === "hq" && !scope.branchId,
          isHqBranchScoped: variant === "hq" && Boolean(scope.branchId),
          mediaUploadUrl: mediaUploadUrlForScope(scope),
          error: null,
          saved: String((req.query && req.query.saved) || ""),
          q,
          statusFilter: status,
          audienceFilter: audience,
          page,
          limit,
          total,
          totalPages,
        })
      );
      return res.status(200).type("html").send(html);
    });

    router.get(`${mountPrefix}/new`, rejectApex, gate, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const html = renderView(
        "announcements/admin-form.ejs",
        await shellLocals(req, res, {
          pageTitle: "New announcement",
          basePath: scope.basePath,
          item: null,
          error: null,
          formMode: "create",
          showPreview: true,
          mediaUploadUrl: mediaUploadUrlForScope(scope),
          ...editorScopeExtras(scope, isBranchScoped),
        })
      );
      return res.status(200).type("html").send(html);
    });

    router.post(mountPrefix, rejectApex, gate, async (req, res) => {
      if (!validateCsrfPost(req, res)) return;
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const body = req.body || {};
      const created = await createAnnouncement(getPool(), {
        churchId: scope.churchId,
        branchId: scope.branchId,
        actorUserId: scope.actorUserId,
        tenant: scope.tenant,
        productPolicy,
        title: body.title,
        body: body.body,
        status: body.status || "draft",
        isPinned: body.is_pinned === "1" || body.is_pinned === "on",
        isFeatured: body.is_featured === "1" || body.is_featured === "on",
        actionUrl: body.action_url,
        actionLabel: body.action_label,
        audiences: parseAudiencesFromBody(body),
        mediaAssetIds: body.media_asset_id ? [body.media_asset_id] : [],
        confirmPublish: body.confirm_publish,
        enforcePublishConfirm: true,
      });
      if (!created.ok) {
        const html = renderView(
          "announcements/admin-form.ejs",
          await shellLocals(req, res, {
            pageTitle: "New announcement",
            basePath: scope.basePath,
            item: formItemFromBody(body),
            error: errorMessage(created.reason),
            formMode: "create",
            showPreview: true,
            mediaUploadUrl: mediaUploadUrlForScope(scope),
            ...editorScopeExtras(scope, isBranchScoped),
          })
        );
        return res
          .status(created.status === STATUS.FORBIDDEN ? 403 : 400)
          .type("html")
          .send(html);
      }
      return res.redirect(303, `${scope.basePath}/${created.item.id}?saved=1`);
    });

    router.get(`${mountPrefix}/:id`, rejectApex, gate, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const id = String(req.params.id || "");
      const item = await loadScopedAnnouncement(req, res, scope, id);
      if (!item) return;
      const html = renderView(
        "announcements/admin-detail.ejs",
        await shellLocals(req, res, {
          pageTitle: item.title || "Announcement",
          basePath: scope.basePath,
          item,
          error: null,
          saved: String((req.query && req.query.saved) || ""),
        })
      );
      return res.status(200).type("html").send(html);
    });

    router.get(
      `${mountPrefix}/:id/attachments/:attachmentId/file`,
      rejectApex,
      gate,
      async (req, res) => {
        const scope = await resolveScope(req, res);
        if (!scope) return;
        const id = String(req.params.id || "");
        const attachmentId = String(req.params.attachmentId || "");
        if (!UUID_RE.test(id) || !UUID_RE.test(attachmentId)) {
          return res.status(404).type("text").send("Not found");
        }
        const item = await loadScopedAnnouncement(req, res, scope, id);
        if (!item) return;
        const att = (item.attachments || []).find(
          (row) => row && String(row.id) === attachmentId
        );
        if (!att || !att.mediaAssetId) {
          return res.status(404).type("text").send("Not found");
        }
        const delivered = await mediaService.loadMediaBytes(getPool(), {
          assetId: att.mediaAssetId,
          churchId: scope.churchId,
          allowPrivate: true,
          viewerChurchId: scope.churchId,
        });
        if (!delivered.ok) {
          return res.status(404).type("text").send("Not found");
        }
        if (delivered.redirectUrl) {
          res.setHeader("Cache-Control", "private, no-store");
          return res.redirect(302, delivered.redirectUrl);
        }
        if (!delivered.buffer) {
          return res.status(404).type("text").send("Not found");
        }
        return sendPrivateMediaDownload(res, delivered);
      }
    );

    router.get(`${mountPrefix}/:id/edit`, rejectApex, gate, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const id = String(req.params.id || "");
      const item = await loadScopedAnnouncement(req, res, scope, id);
      if (!item) return;
      if (item.status === "archived") {
        return res.redirect(303, `${scope.basePath}/${id}`);
      }
      const html = renderView(
        "announcements/admin-form.ejs",
        await shellLocals(req, res, {
          pageTitle: "Edit announcement",
          basePath: scope.basePath,
          item,
          error: null,
          formMode: "edit",
          showPreview: true,
          saved: String((req.query && req.query.saved) || "") === "1",
          mediaUploadUrl: mediaUploadUrlForScope(scope),
          ...editorScopeExtras(scope, isBranchScoped),
        })
      );
      return res.status(200).type("html").send(html);
    });

    router.get(`${mountPrefix}/:id/preview`, rejectApex, gate, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const id = String(req.params.id || "");
      const item = await loadScopedAnnouncement(req, res, scope, id);
      if (!item) return;
      const html = renderView(
        "announcements/admin-preview.ejs",
        await shellLocals(req, res, {
          pageTitle: "Preview announcement",
          basePath: scope.basePath,
          item,
        })
      );
      return res.status(200).type("html").send(html);
    });

    router.get(`${mountPrefix}/:id/publish`, rejectApex, gate, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const id = String(req.params.id || "");
      const item = await loadScopedAnnouncement(req, res, scope, id);
      if (!item) return;
      if (item.status === "published") {
        return res.redirect(303, `${scope.basePath}/${id}?saved=already`);
      }
      if (item.status === "archived") {
        return res.redirect(303, `${scope.basePath}/${id}`);
      }
      const html = renderView(
        "announcements/admin-publish.ejs",
        await shellLocals(req, res, {
          pageTitle: "Confirm publish",
          basePath: scope.basePath,
          item,
          error: null,
          ...editorScopeExtras(scope, isBranchScoped),
        })
      );
      return res.status(200).type("html").send(html);
    });

    router.post(`${mountPrefix}/:id/publish`, rejectApex, gate, async (req, res) => {
      if (!validateCsrfPost(req, res)) return;
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const id = String(req.params.id || "");
      const item = await loadScopedAnnouncement(req, res, scope, id);
      if (!item) return;
      if (item.status === "published") {
        return res.redirect(303, `${scope.basePath}/${id}?saved=already`);
      }
      if (item.status === "archived") {
        return res.redirect(303, `${scope.basePath}/${id}`);
      }
      const body = req.body || {};
      const updated = await updateAnnouncement(getPool(), id, {
        churchId: scope.churchId,
        scopeBranchId: scope.branchId,
        actorUserId: scope.actorUserId,
        tenant: scope.tenant,
        productPolicy,
        status: "published",
        confirmPublish: body.confirm_publish,
        expectedUpdatedAt: body.expected_updated_at || item.updatedAt,
        enforcePublishConfirm: true,
      });
      if (!updated.ok) {
        const html = renderView(
          "announcements/admin-publish.ejs",
          await shellLocals(req, res, {
            pageTitle: "Confirm publish",
            basePath: scope.basePath,
            item,
            error: errorMessage(updated.reason),
            ...editorScopeExtras(scope, isBranchScoped),
          })
        );
        const code =
          updated.status === STATUS.FORBIDDEN
            ? 403
            : updated.status === STATUS.CONFLICT
              ? 409
              : 400;
        return res.status(code).type("html").send(html);
      }
      return res.redirect(303, `${scope.basePath}/${id}?saved=published`);
    });

    router.post(`${mountPrefix}/:id/archive`, rejectApex, gate, async (req, res) => {
      if (!validateCsrfPost(req, res)) return;
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const id = String(req.params.id || "");
      const item = await loadScopedAnnouncement(req, res, scope, id);
      if (!item) return;
      if (item.status === "archived") {
        return res.redirect(303, `${scope.basePath}/${id}?saved=archived`);
      }
      const body = req.body || {};
      const updated = await updateAnnouncement(getPool(), id, {
        churchId: scope.churchId,
        scopeBranchId: scope.branchId,
        actorUserId: scope.actorUserId,
        tenant: scope.tenant,
        productPolicy,
        status: "archived",
        expectedUpdatedAt: body.expected_updated_at || item.updatedAt,
        enforcePublishConfirm: false,
      });
      if (!updated.ok) {
        return sendControlled(
          req,
          res,
          updated.status === STATUS.FORBIDDEN
            ? 403
            : updated.status === STATUS.CONFLICT
              ? 409
              : 400,
          errorMessage(updated.reason),
          shellKind
        );
      }
      return res.redirect(303, `${scope.basePath}/${id}?saved=archived`);
    });

    router.post(`${mountPrefix}/:id`, rejectApex, gate, async (req, res) => {
      if (!validateCsrfPost(req, res)) return;
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const id = String(req.params.id || "");
      const existing = await loadScopedAnnouncement(req, res, scope, id);
      if (!existing) return;
      if (existing.status === "archived") {
        return res.redirect(303, `${scope.basePath}/${id}`);
      }
      const body = req.body || {};
      // Soft lifecycle only: never hard-delete. Publish transitions require /publish.
      let nextStatus = existing.status;
      if (existing.status === "draft") {
        nextStatus = "draft";
      } else if (existing.status === "published") {
        nextStatus = "published";
      }
      const updated = await updateAnnouncement(getPool(), id, {
        churchId: scope.churchId,
        scopeBranchId: scope.branchId,
        actorUserId: scope.actorUserId,
        tenant: scope.tenant,
        productPolicy,
        title: body.title,
        body: body.body,
        status: nextStatus,
        isPinned: body.is_pinned === "1" || body.is_pinned === "on",
        isFeatured: body.is_featured === "1" || body.is_featured === "on",
        actionUrl: body.action_url,
        actionLabel: body.action_label,
        audiences: parseAudiencesFromBody(body),
        addMediaAssetIds: body.media_asset_id ? [body.media_asset_id] : undefined,
        confirmPublish: existing.status === "published" ? true : false,
        expectedUpdatedAt: body.expected_updated_at,
        enforcePublishConfirm: true,
      });
      if (!updated.ok) {
        const loaded = await getAdminAnnouncement(getPool(), {
          id,
          churchId: scope.churchId,
          scopeBranchId: scope.branchId,
          actorUserId: scope.actorUserId,
          tenant: scope.tenant,
          productPolicy,
        });
        const html = renderView(
          "announcements/admin-form.ejs",
          await shellLocals(req, res, {
            pageTitle: "Edit announcement",
            basePath: scope.basePath,
            item: loaded.item || formItemFromBody(body, id),
            error: errorMessage(updated.reason),
            formMode: "edit",
            showPreview: true,
            mediaUploadUrl: mediaUploadUrlForScope(scope),
            ...editorScopeExtras(scope, isBranchScoped),
          })
        );
        const code =
          updated.status === STATUS.FORBIDDEN
            ? 403
            : updated.status === STATUS.CONFLICT
              ? 409
              : 400;
        return res.status(code).type("html").send(html);
      }
      return res.redirect(303, `${scope.basePath}/${id}?saved=1`);
    });
  }

  if (variant === "hq") {
    registerRoutes("/hq/announcements", false);
    registerRoutes("/hq/announcements/b/:branchKey", true);
  } else {
    registerRoutes("/branch-admin/announcements", true);
  }

  return router;
}

module.exports = {
  createAnnouncementAdminRouter,
};
