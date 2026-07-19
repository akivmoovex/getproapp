"use strict";

/**
 * BlessBoard V5 member announcement list / detail / mark-read.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const express = require("express");

const { createRequireActiveMember } = require("./requireActiveMember");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { CSRF_FIELD, validateCsrf } = require("../../platform/http/v5Csrf");
const { buildMemberShellLocals } = require("./memberShellLocals");
const {
  STATUS,
  listMemberAnnouncements,
  getMemberAnnouncement,
  markAnnouncementRead,
  presentAnnouncementForRender,
} = require("../services/announcementsService");
const { createMediaUploadService } = require("../media/mediaUploadService");
const { sendPrivateMediaDownload } = require("./sendPrivateMediaDownload");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {string} relativePath
 * @param {object} data
 */
function renderMemberView(relativePath, data) {
  const filename = path.join(VIEWS_ROOT, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  return ejs.render(source, data, { filename });
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 *   sendUnavailable?: Function,
 * }} deps
 */
function createAnnouncementMemberRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const isProduction = String(env.NODE_ENV || "") === "production";
  const mediaService = deps.mediaService || createMediaUploadService(env);

  const router = express.Router();
  const requireMember = createRequireActiveMember({ getPool });

  function rejectApex(req, res, next) {
    if (isApexHost(req)) {
      if (typeof sendUnavailable === "function") return sendUnavailable(req, res);
      return res.status(503).type("text").send("Unavailable");
    }
    return next();
  }

  function shellLocals(req, res, activeNav, extra) {
    return buildMemberShellLocals(req, res, {
      env,
      isProduction,
      activeNav,
      extra,
    });
  }

  function memberScope(req) {
    const tenant = resolveTenantForAuthorization(req);
    const access = req.blessBoardMemberAccess;
    if (!tenant || !tenant.church || !tenant.primaryBranch || !access || !access.member) {
      return null;
    }
    return {
      churchId: tenant.church.id,
      branchId: tenant.primaryBranch.id,
      memberId: access.member.id,
    };
  }

  /**
   * Presentation filters over announcements already visible to this member.
   * Does not invent Branch/HQ categories or delivery metrics.
   * @param {string} raw
   */
  function normalizeMemberAnnFilter(raw) {
    const value = String(raw || "all")
      .trim()
      .toLowerCase();
    if (value === "unread" || value === "pinned" || value === "featured") return value;
    return "all";
  }

  /**
   * @param {object[]} items
   * @param {string} filter
   * @param {string} q
   */
  function filterVisibleMemberAnnouncements(items, filter, q) {
    let out = Array.isArray(items) ? items.slice() : [];
    if (filter === "unread") out = out.filter((item) => item && item.isUnread);
    else if (filter === "pinned") out = out.filter((item) => item && item.isPinned);
    else if (filter === "featured") out = out.filter((item) => item && item.isFeatured);

    const query = String(q || "")
      .trim()
      .toLowerCase()
      .slice(0, 100);
    if (query) {
      out = out.filter((item) => {
        if (!item) return false;
        const title = String(item.title || "").toLowerCase();
        const body = String(item.body || "").toLowerCase();
        return title.includes(query) || body.includes(query);
      });
    }
    return out;
  }

  router.get("/member/announcements", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) {
      return res.status(403).type("text").send("You do not have member access to this site.");
    }
    const listed = await listMemberAnnouncements(getPool(), scope);
    if (!listed.ok) {
      return res.status(503).type("text").send("Announcements are temporarily unavailable.");
    }
    const allItems = listed.items || [];
    const filter = normalizeMemberAnnFilter(req.query && req.query.filter);
    const q = String((req.query && req.query.q) || "")
      .trim()
      .slice(0, 100);
    const items = filterVisibleMemberAnnouncements(allItems, filter, q);
    const unreadCount = allItems.reduce((n, item) => n + (item && item.isUnread ? 1 : 0), 0);
    const html = renderMemberView(
      "announcements/member-list.ejs",
      shellLocals(req, res, "announcements", {
        allItems,
        items,
        unreadCount,
        filter,
        q,
        featuredItems: items.filter((item) => item && item.isFeatured),
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/member/announcements/:id", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) {
      return res.status(403).type("text").send("You do not have member access to this site.");
    }
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) {
      return res.status(404).type("text").send("Announcement not found.");
    }
    const loaded = await getMemberAnnouncement(getPool(), { ...scope, id, recordSeen: true });
    if (!loaded.ok || !loaded.item) {
      const code =
        loaded.status === STATUS.FORBIDDEN ? 403 : loaded.status === STATUS.NOT_FOUND ? 404 : 503;
      return res.status(code).type("text").send("Announcement not found.");
    }
    const html = renderMemberView(
      "announcements/member-detail.ejs",
      shellLocals(req, res, "announcements", {
        item: presentAnnouncementForRender(loaded.item),
        marked: String((req.query && req.query.read) || "") === "1",
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get(
    "/member/announcements/:id/attachments/:attachmentId/file",
    rejectApex,
    requireMember,
    async (req, res) => {
      const scope = memberScope(req);
      if (!scope) {
        return res.status(403).type("text").send("You do not have member access to this site.");
      }
      const id = String(req.params.id || "");
      const attachmentId = String(req.params.attachmentId || "");
      if (!UUID_RE.test(id) || !UUID_RE.test(attachmentId)) {
        return res.status(404).type("text").send("Not found");
      }
      const loaded = await getMemberAnnouncement(getPool(), {
        ...scope,
        id,
        recordSeen: false,
      });
      if (!loaded.ok || !loaded.item) {
        const code =
          loaded.status === STATUS.FORBIDDEN ? 403 : loaded.status === STATUS.NOT_FOUND ? 404 : 503;
        return res.status(code).type("text").send("Not found");
      }
      const att = (loaded.item.attachments || []).find(
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

  router.post("/member/announcements/:id/read", rejectApex, requireMember, async (req, res) => {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return res.status(403).type("text").send("Invalid or missing CSRF token.");
    }
    const scope = memberScope(req);
    if (!scope) {
      return res.status(403).type("text").send("You do not have member access to this site.");
    }
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) {
      return res.status(404).type("text").send("Announcement not found.");
    }
    const marked = await markAnnouncementRead(getPool(), { ...scope, id });
    if (!marked.ok) {
      const code =
        marked.status === STATUS.FORBIDDEN ? 403 : marked.status === STATUS.NOT_FOUND ? 404 : 503;
      return res.status(code).type("text").send("Announcement could not be marked read.");
    }
    const wantsJson = String(req.get("accept") || "").includes("application/json");
    if (wantsJson) {
      return res.status(200).json({
        ok: true,
        readAt: marked.read.readAt,
        firstSeenAt: marked.read.firstSeenAt,
      });
    }
    return res.redirect(303, `/member/announcements/${id}?read=1`);
  });

  return router;
}

module.exports = {
  createAnnouncementMemberRouter,
};
