"use strict";

/**
 * BlessBoard V5 announcement admin CRUD (HQ church-wide + branch-scoped).
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const express = require("express");

const {
  createRequireBlessBoardTenantRole,
} = require("./requireBlessBoardTenantRole");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { formatRoleLabel } = require("./renderTenantLandingPage");
const {
  CSRF_FIELD,
  issueCsrfToken,
  validateCsrf,
  setCsrfCookie,
} = require("../../platform/http/v5Csrf");
const {
  STATUS,
  createAnnouncement,
  updateAnnouncement,
  listAdminAnnouncements,
  getAdminAnnouncement,
} = require("../services/announcementsService");
const {
  resolveBlessBoardBranchForChurch,
} = require("../services/listBlessBoardBranches");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    return "You must check the box to confirm before publishing.";
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

  function rejectApex(req, res, next) {
    if (isApexHost(req)) {
      if (typeof sendUnavailable === "function") return sendUnavailable(req, res);
      return res.status(503).type("text").send("Unavailable");
    }
    return next();
  }

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

  function primaryRoleLabel(req) {
    const roles =
      req.blessBoardAuthorizationContext && req.blessBoardAuthorizationContext.effectiveRoles
        ? req.blessBoardAuthorizationContext.effectiveRoles
        : [];
    const order =
      variant === "hq"
        ? ["church_hq_admin", "platform_admin", "branch_admin"]
        : ["branch_admin", "church_hq_admin", "platform_admin"];
    for (const key of order) {
      const hit = roles.find((r) => r.roleKey === key);
      if (hit) return formatRoleLabel(hit.roleKey);
    }
    return roles[0] ? formatRoleLabel(roles[0].roleKey) : variant === "hq" ? "HQ admin" : "Branch admin";
  }

  function shellLocals(req, res, extra) {
    const tenant = resolveTenantForAuthorization(req);
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction });
    const base = {
      pageTitle: "Announcements",
      activeNav: "announcements",
      shellKind,
      csrfToken,
      churchDisplayName: tenant && tenant.church ? tenant.church.displayName : "",
      roleLabel: primaryRoleLabel(req),
      displayName:
        req.v5Session && req.v5Session.session && req.v5Session.session.user
          ? req.v5Session.session.user.displayName
          : "",
      ...(extra || {}),
    };
    if (variant === "hq") {
      base.hqBranchDisplayName = tenant && tenant.hqBranch ? tenant.hqBranch.displayName : "";
    } else {
      base.branchDisplayName =
        tenant && tenant.primaryBranch ? tenant.primaryBranch.displayName : "";
    }
    return base;
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
   * @returns {Promise<{ churchId: string, branchId: string|null, basePath: string, tenant: object }|null>}
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
        basePath: "/branch-admin/announcements",
        tenant,
        actorUserId: session.userId,
      };
    }

    const branchKey = req.params && req.params.branchKey ? String(req.params.branchKey) : "";
    if (branchKey) {
      const resolved = await resolveBlessBoardBranchForChurch(getPool(), {
        churchId: tenant.church.id,
        branchKey,
      });
      if (!resolved.ok || !resolved.branch) {
        sendControlled(req, res, 404, "Branch not found.", shellKind);
        return null;
      }
      return {
        churchId: tenant.church.id,
        branchId: resolved.branch.id,
        basePath: `/hq/announcements/b/${resolved.branch.key}`,
        tenant,
        actorUserId: session.userId,
      };
    }

    return {
      churchId: tenant.church.id,
      branchId: null,
      basePath: "/hq/announcements",
      tenant,
      actorUserId: session.userId,
    };
  }

  function registerRoutes(mountPrefix, isBranchScoped) {
    router.get(mountPrefix, rejectApex, gate, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const listed = await listAdminAnnouncements(getPool(), {
        churchId: scope.churchId,
        branchId: scope.branchId,
        actorUserId: scope.actorUserId,
        tenant: scope.tenant,
        productPolicy,
        status: String((req.query && req.query.status) || "").trim() || null,
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
      const html = renderView(
        "announcements/admin-list.ejs",
        shellLocals(req, res, {
          items: listed.items,
          basePath: scope.basePath,
          scopeLabel: isBranchScoped ? "Branch" : "Church-wide",
          error: null,
          saved: String((req.query && req.query.saved) || ""),
        })
      );
      return res.status(200).type("html").send(html);
    });

    router.get(`${mountPrefix}/new`, rejectApex, gate, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const html = renderView(
        "announcements/admin-form.ejs",
        shellLocals(req, res, {
          basePath: scope.basePath,
          item: null,
          error: null,
          formMode: "create",
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
        isPinned: body.is_pinned,
        isFeatured: body.is_featured,
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
          shellLocals(req, res, {
            basePath: scope.basePath,
            item: {
              title: body.title || "",
              body: body.body || "",
              status: body.status || "draft",
              isPinned: Boolean(body.is_pinned),
              isFeatured: Boolean(body.is_featured),
              actionUrl: body.action_url || "",
              actionLabel: body.action_label || "",
              audiences: parseAudiencesFromBody(body),
            },
            error: errorMessage(created.reason),
            formMode: "create",
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
      if (!UUID_RE.test(id)) {
        return sendControlled(req, res, 404, "Announcement not found.", shellKind);
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
        return sendControlled(
          req,
          res,
          loaded.status === STATUS.FORBIDDEN ? 403 : 404,
          "Announcement not found.",
          shellKind
        );
      }
      const html = renderView(
        "announcements/admin-form.ejs",
        shellLocals(req, res, {
          basePath: scope.basePath,
          item: loaded.item,
          error: null,
          formMode: "edit",
          saved: String((req.query && req.query.saved) || "") === "1",
        })
      );
      return res.status(200).type("html").send(html);
    });

    router.post(`${mountPrefix}/:id`, rejectApex, gate, async (req, res) => {
      if (!validateCsrfPost(req, res)) return;
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const id = String(req.params.id || "");
      if (!UUID_RE.test(id)) {
        return sendControlled(req, res, 404, "Announcement not found.", shellKind);
      }
      const body = req.body || {};
      const updated = await updateAnnouncement(getPool(), id, {
        churchId: scope.churchId,
        scopeBranchId: scope.branchId,
        actorUserId: scope.actorUserId,
        tenant: scope.tenant,
        productPolicy,
        title: body.title,
        body: body.body,
        status: body.status,
        isPinned: body.is_pinned,
        isFeatured: body.is_featured,
        actionUrl: body.action_url,
        actionLabel: body.action_label,
        audiences: parseAudiencesFromBody(body),
        addMediaAssetIds: body.media_asset_id ? [body.media_asset_id] : undefined,
        confirmPublish: body.confirm_publish,
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
          shellLocals(req, res, {
            basePath: scope.basePath,
            item: loaded.item || {
              id,
              title: body.title || "",
              body: body.body || "",
              status: body.status || "draft",
              audiences: parseAudiencesFromBody(body),
            },
            error: errorMessage(updated.reason),
            formMode: "edit",
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
