"use strict";

/**
 * Member notification inbox + preference routes (Stitch 25-member-notifications-*).
 */

const express = require("express");

const { createRequireActiveMember } = require("./requireActiveMember");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const { buildMemberShellLocals } = require("./memberShellLocals");
const { renderV5Ejs } = require("./v5EjsTemplateCache");
const {
  CSRF_FIELD,
  validateCsrf,
} = require("../../platform/http/v5Csrf");
const {
  STATUS,
  listInbox,
  getNotification,
  markRead,
  markUnread,
  markAllRead,
  archiveNotification,
  getPreferences,
  updatePreferences,
} = require("../services/memberNotificationService");
const {
  INBOX_CATEGORY_LABELS,
  MESSAGE_TYPE_LABELS,
  PRIORITY_LABELS,
  PREFERENCE_CATEGORY_LABELS,
} = require("../messaging/messageConstants");
const { isUuid } = require("../messaging/messageSanitize");

const PAGE_SIZE = 30;

/**
 * @param {{
 *   getPool: () => { query: Function, connect?: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 * }} deps
 */
function createMemberNotificationRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const router = express.Router();
  const rejectApex = createRejectApex({ isApexHost });
  const requireMember = createRequireActiveMember({ getPool });

  function shell(req, res, activeNav, extra) {
    return buildMemberShellLocals(req, res, {
      env,
      isProduction: String(env.NODE_ENV || "").toLowerCase() === "production",
      activeNav,
      pageTitle: extra && extra.pageTitle,
      extra,
    });
  }

  function scope(req) {
    const tenant = resolveTenantForAuthorization(req);
    const access = req.blessBoardMemberAccess;
    return {
      churchId: tenant && tenant.church ? tenant.church.id : null,
      memberId: access && access.member ? access.member.id : null,
      userId: req.v5Session && req.v5Session.session ? req.v5Session.session.userId : null,
    };
  }

  router.get("/member/notifications", rejectApex, requireMember, async (req, res) => {
    const { churchId, memberId } = scope(req);
    if (!churchId || !memberId) return res.status(403).type("text").send("Forbidden");
    const category = String(req.query.category || "all");
    const page = Math.max(1, Number(req.query.page) || 1);
    const listed = await listInbox(getPool(), {
      churchId,
      memberId,
      category,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    });
    const html = renderV5Ejs("member/member-notifications.ejs", {
      ...shell(req, res, "notifications", { pageTitle: "Notifications" }),
      items: listed.items || [],
      total: listed.total || 0,
      unreadCount: listed.unreadCount || 0,
      category,
      categoryLabels: INBOX_CATEGORY_LABELS,
      typeLabels: MESSAGE_TYPE_LABELS,
      priorityLabels: PRIORITY_LABELS,
      page,
      pageSize: PAGE_SIZE,
      notice: req.query.notice || null,
      error: req.query.error || null,
    });
    return res.type("html").send(html);
  });

  router.get("/member/notifications/:notificationId", rejectApex, requireMember, async (req, res) => {
    const { churchId, memberId } = scope(req);
    const id = String(req.params.notificationId || "");
    if (!churchId || !memberId || !isUuid(id)) {
      return res.status(404).type("text").send("Not found");
    }
    const detail = await getNotification(getPool(), {
      churchId,
      memberId,
      notificationId: id,
    });
    if (detail.status !== STATUS.OK) {
      return res.status(404).type("text").send("Not found");
    }
    if (!detail.item.readAt) {
      await markRead(getPool(), { churchId, memberId, notificationId: id });
      detail.item.readAt = new Date();
      detail.item.unread = false;
    }
    const html = renderV5Ejs("member/member-notification-detail.ejs", {
      ...shell(req, res, "notifications", { pageTitle: detail.item.title }),
      item: detail.item,
      typeLabels: MESSAGE_TYPE_LABELS,
      priorityLabels: PRIORITY_LABELS,
      categoryLabels: INBOX_CATEGORY_LABELS,
      notice: req.query.notice || null,
    });
    return res.type("html").send(html);
  });

  router.post("/member/notifications/:notificationId/read", rejectApex, requireMember, async (req, res) => {
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) return res.status(403).type("text").send("Invalid CSRF token");
    const { churchId, memberId } = scope(req);
    const id = String(req.params.notificationId || "");
    if (!churchId || !memberId || !isUuid(id)) return res.status(404).type("text").send("Not found");
    const result = await markRead(getPool(), { churchId, memberId, notificationId: id });
    if (result.status !== STATUS.OK) return res.status(404).type("text").send("Not found");
    return res.redirect(303, `/member/notifications/${id}?notice=read`);
  });

  router.post("/member/notifications/:notificationId/unread", rejectApex, requireMember, async (req, res) => {
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) return res.status(403).type("text").send("Invalid CSRF token");
    const { churchId, memberId } = scope(req);
    const id = String(req.params.notificationId || "");
    if (!churchId || !memberId || !isUuid(id)) return res.status(404).type("text").send("Not found");
    const result = await markUnread(getPool(), { churchId, memberId, notificationId: id });
    if (result.status !== STATUS.OK) return res.status(404).type("text").send("Not found");
    return res.redirect(303, `/member/notifications/${id}?notice=unread`);
  });

  router.post("/member/notifications/read-all", rejectApex, requireMember, async (req, res) => {
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) return res.status(403).type("text").send("Invalid CSRF token");
    const { churchId, memberId } = scope(req);
    if (!churchId || !memberId) return res.status(403).type("text").send("Forbidden");
    await markAllRead(getPool(), { churchId, memberId });
    return res.redirect(303, "/member/notifications?notice=all_read");
  });

  router.post("/member/notifications/:notificationId/archive", rejectApex, requireMember, async (req, res) => {
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) return res.status(403).type("text").send("Invalid CSRF token");
    const { churchId, memberId } = scope(req);
    const id = String(req.params.notificationId || "");
    if (!churchId || !memberId || !isUuid(id)) return res.status(404).type("text").send("Not found");
    const result = await archiveNotification(getPool(), { churchId, memberId, notificationId: id });
    if (result.status !== STATUS.OK) return res.status(404).type("text").send("Not found");
    return res.redirect(303, "/member/notifications?notice=archived");
  });

  router.get("/member/notification-preferences", rejectApex, requireMember, async (req, res) => {
    const { churchId, memberId } = scope(req);
    if (!churchId || !memberId) return res.status(403).type("text").send("Forbidden");
    const prefs = await getPreferences(getPool(), { churchId, memberId, env });
    const html = renderV5Ejs("member/member-notification-preferences.ejs", {
      ...shell(req, res, "notifications", { pageTitle: "Notification preferences" }),
      preferences: prefs.preferences,
      availability: prefs.availability,
      contact: prefs.contact,
      presets: prefs.presets,
      categoryLabels: PREFERENCE_CATEGORY_LABELS,
      notice: req.query.notice || null,
      error: req.query.error || null,
    });
    return res.type("html").send(html);
  });

  router.post("/member/notification-preferences", rejectApex, requireMember, async (req, res) => {
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) return res.status(403).type("text").send("Invalid CSRF token");
    const { churchId, memberId, userId } = scope(req);
    if (!churchId || !memberId) return res.status(403).type("text").send("Forbidden");
    const result = await updatePreferences(getPool(), {
      churchId,
      memberId,
      updatedByUserId: userId,
      env,
      preset: req.body.preset || null,
      body: req.body,
    });
    if (result.status !== STATUS.OK) {
      return res.redirect(303, `/member/notification-preferences?error=${encodeURIComponent(result.reason || "invalid")}`);
    }
    return res.redirect(303, "/member/notification-preferences?notice=saved");
  });

  return router;
}

module.exports = {
  createMemberNotificationRouter,
};
