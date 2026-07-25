"use strict";

/**
 * HQ Broadcast Center routes (Stitch 61-hq-broadcast-center-*-v2).
 */

const express = require("express");

const {
  createRequireBlessBoardTenantRole,
} = require("./requireBlessBoardTenantRole");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const { buildHqAdminShellLocals } = require("./hqAdminShellLocals");
const { renderV5Ejs } = require("./v5EjsTemplateCache");
const {
  CSRF_FIELD,
  validateCsrf,
} = require("../../platform/http/v5Csrf");
const {
  STATUS,
  saveDraft,
  sendMessage,
  cancelMessage,
  getBroadcastCenter,
  getBroadcastDetail,
  estimateAudience,
} = require("../services/messageService");
const {
  MANUAL_MESSAGE_TYPES,
  MESSAGE_TYPE_LABELS,
  MESSAGE_STATUS_LABELS,
  PRIORITY_LABELS,
  AUDIENCE_TYPE_LABELS,
  DELIVERY_STATUS_LABELS,
} = require("../messaging/messageConstants");
const {
  getDeliveryChannelAvailability,
} = require("../messaging/deliveryChannelAvailability");
const { renderSafeMessageBodyHtml, isUuid } = require("../messaging/messageSanitize");
const { listBlessBoardBranches } = require("../services/listBlessBoardBranches");
const { areBlessBoardJobsEnabled } = require("../../church/blessBoardEnv");

const PAGE_SIZE = 20;

function parseAudiencesFromBody(body) {
  const audienceType = String(body.audience_type || "all_active_members").trim();
  if (audienceType === "all_active_members") {
    return [{ audienceType: "all_active_members" }];
  }
  if (audienceType === "branches") {
    const ids = [].concat(body.branch_ids || body.branch_id || []).filter(Boolean);
    return ids.map((id) => ({ audienceType: "branches", branchId: String(id) }));
  }
  if (audienceType === "ministries") {
    const ids = [].concat(body.ministry_ids || body.ministry_id || []).filter(Boolean);
    return ids.map((id) => ({ audienceType: "ministries", ministryId: String(id) }));
  }
  if (audienceType === "members") {
    const ids = String(body.member_ids || "")
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return ids.map((id) => ({ audienceType: "members", memberId: id }));
  }
  if (audienceType === "roles") {
    const keys = [].concat(body.role_keys || body.role_key || []).filter(Boolean);
    return keys.map((roleKey) => ({ audienceType: "roles", roleKey: String(roleKey) }));
  }
  if (audienceType === "event_attendees") {
    const eventId = body.event_id || body.related_entity_id;
    return [{ audienceType: "event_attendees", metadataJson: { eventId } }];
  }
  return [{ audienceType: "all_active_members" }];
}

function composerFromBody(body) {
  return {
    title: body.title,
    previewText: body.preview_text,
    body: body.body,
    messageType: body.message_type,
    priority: body.priority || "normal",
    senderDisplayName: body.sender_display_name,
    relatedEntityType: body.related_entity_type || null,
    relatedEntityId: body.related_entity_id || null,
    callToActionLabel: body.call_to_action_label || null,
    callToActionUrl: body.call_to_action_url || null,
    channelInApp: true,
    channelEmail: body.channel_email === "1" || body.channel_email === "on",
    channelSms: body.channel_sms === "1" || body.channel_sms === "on",
    channelPush: body.channel_push === "1" || body.channel_push === "on",
    scheduledAt: body.scheduled_at || null,
    audiences: parseAudiencesFromBody(body),
    branchId: body.scope_branch_id || null,
  };
}

/**
 * @param {{
 *   getPool: () => { query: Function, connect?: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 * }} deps
 */
function createBroadcastAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const router = express.Router();
  const rejectApex = createRejectApex({ isApexHost });
  const requireHq = createRequireBlessBoardTenantRole({
    getPool,
    allowedRoles: ["church_hq_admin", "platform_admin"],
  });

  async function shell(req, res, activeNav, extra) {
    return buildHqAdminShellLocals(req, res, {
      env,
      isProduction: String(env.NODE_ENV || "").toLowerCase() === "production",
      activeNav,
      getPool,
      pageTitle: extra && extra.pageTitle,
      extra,
    });
  }

  function churchId(req) {
    const tenant = resolveTenantForAuthorization(req);
    return tenant && tenant.church ? tenant.church.id : null;
  }

  function userId(req) {
    return req.v5Session && req.v5Session.session ? req.v5Session.session.userId : null;
  }

  router.get("/hq/broadcasts", rejectApex, requireHq, async (req, res) => {
    const cid = churchId(req);
    if (!cid) return res.status(403).type("text").send("Forbidden");
    const page = Math.max(1, Number(req.query.page) || 1);
    const result = await getBroadcastCenter(getPool(), {
      churchId: cid,
      status: req.query.status ? String(req.query.status) : null,
      messageType: req.query.message_type ? String(req.query.message_type) : null,
      audienceType: req.query.audience_type ? String(req.query.audience_type) : null,
      channel: req.query.channel ? String(req.query.channel) : null,
      branchId: req.query.branch ? String(req.query.branch) : null,
      q: req.query.q ? String(req.query.q).slice(0, 100) : null,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      env,
    });
    const branchesListed = await listBlessBoardBranches(getPool(), cid);
    const html = renderV5Ejs("hq/hq-broadcast-center-v2.ejs", {
      ...(await shell(req, res, "broadcasts", { pageTitle: "Broadcast Center" })),
      summary: result.summary,
      items: result.items,
      total: result.total,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil((result.total || 0) / PAGE_SIZE)),
      filters: {
        status: req.query.status || "",
        message_type: req.query.message_type || "",
        audience_type: req.query.audience_type || "",
        channel: req.query.channel || "",
        branch: req.query.branch || "",
        q: req.query.q || "",
      },
      branches: branchesListed.branches || [],
      channelAvailability: result.channelAvailability,
      statusLabels: MESSAGE_STATUS_LABELS,
      typeLabels: MESSAGE_TYPE_LABELS,
      priorityLabels: PRIORITY_LABELS,
      audienceLabels: AUDIENCE_TYPE_LABELS,
      notice: req.query.notice || null,
      error: req.query.error || null,
      jobsEnabled: areBlessBoardJobsEnabled(env),
    });
    return res.type("html").send(html);
  });

  router.get("/hq/broadcasts/new", rejectApex, requireHq, async (req, res) => {
    const cid = churchId(req);
    if (!cid) return res.status(403).type("text").send("Forbidden");
    const branchesListed = await listBlessBoardBranches(getPool(), cid);
    const ministries = await getPool().query(
      `SELECT id, name AS title FROM blessboard.ministries
        WHERE church_id = $1 AND status IN ('draft', 'published')
        ORDER BY name ASC LIMIT 200`,
      [cid]
    );
    const events = await getPool().query(
      `SELECT id, title FROM blessboard.events
        WHERE church_id = $1 AND status = 'published'
        ORDER BY starts_at DESC NULLS LAST LIMIT 100`,
      [cid]
    );
    const session = req.v5Session && req.v5Session.session;
    const defaultSender =
      (session && session.user && session.user.displayName) || "Church leadership";
    const html = renderV5Ejs("hq/hq-broadcast-compose-v2.ejs", {
      ...(await shell(req, res, "broadcasts", { pageTitle: "Create Message" })),
      item: null,
      form: {
        title: "",
        preview_text: "",
        body: "",
        message_type: "announcement",
        priority: "normal",
        sender_display_name: defaultSender,
        audience_type: "all_active_members",
        channel_email: false,
        channel_sms: false,
        channel_push: false,
      },
      messageTypes: MANUAL_MESSAGE_TYPES,
      typeLabels: MESSAGE_TYPE_LABELS,
      priorityLabels: PRIORITY_LABELS,
      branches: branchesListed.branches || [],
      ministries: ministries.rows || [],
      events: events.rows || [],
      channelAvailability: getDeliveryChannelAvailability(env),
      jobsEnabled: areBlessBoardJobsEnabled(env),
      estimatedRecipients: null,
      error: req.query.error || null,
      fieldErrors: {},
    });
    return res.type("html").send(html);
  });

  router.get("/hq/broadcasts/:broadcastId", rejectApex, requireHq, async (req, res) => {
    const cid = churchId(req);
    const id = String(req.params.broadcastId || "");
    if (!cid || !isUuid(id)) return res.status(404).type("text").send("Not found");
    const detail = await getBroadcastDetail(getPool(), {
      churchId: cid,
      messageId: id,
      env,
    });
    if (detail.status !== STATUS.OK) {
      return res.status(404).type("text").send("Not found");
    }
    const html = renderV5Ejs("hq/hq-broadcast-detail-v2.ejs", {
      ...(await shell(req, res, "broadcasts", { pageTitle: detail.message.title })),
      message: detail.message,
      audiences: detail.audiences,
      delivery: detail.delivery,
      inAppReads: detail.inAppReads,
      bodyHtml: renderSafeMessageBodyHtml(detail.message.body),
      statusLabels: MESSAGE_STATUS_LABELS,
      typeLabels: MESSAGE_TYPE_LABELS,
      priorityLabels: PRIORITY_LABELS,
      audienceLabels: AUDIENCE_TYPE_LABELS,
      deliveryLabels: DELIVERY_STATUS_LABELS,
      channelAvailability: detail.channelAvailability,
      notice: req.query.notice || null,
      error: req.query.error || null,
    });
    return res.type("html").send(html);
  });

  router.post("/hq/broadcasts/draft", rejectApex, requireHq, async (req, res) => {
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
      return res.status(403).type("text").send("Invalid CSRF token");
    }
    const cid = churchId(req);
    if (!cid) return res.status(403).type("text").send("Forbidden");
    const payload = {
      churchId: cid,
      createdByUserId: userId(req),
      messageId: req.body.message_id || null,
      env,
      ...composerFromBody(req.body),
    };
    const result = await saveDraft(getPool(), payload);
    if (result.status !== STATUS.OK) {
      return res.redirect(303, `/hq/broadcasts/new?error=${encodeURIComponent(result.reason || "invalid")}`);
    }
    return res.redirect(303, `/hq/broadcasts/${result.message.id}?notice=draft_saved`);
  });

  router.post("/hq/broadcasts/send", rejectApex, requireHq, async (req, res) => {
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
      return res.status(403).type("text").send("Invalid CSRF token");
    }
    const cid = churchId(req);
    if (!cid) return res.status(403).type("text").send("Forbidden");
    const result = await sendMessage(getPool(), {
      churchId: cid,
      createdByUserId: userId(req),
      messageId: req.body.message_id || null,
      env,
      ...composerFromBody(req.body),
    });
    if (result.status === STATUS.EMPTY_AUDIENCE) {
      return res.redirect(303, `/hq/broadcasts/new?error=empty_audience`);
    }
    if (result.status === STATUS.CONFLICT) {
      return res.redirect(
        303,
        `/hq/broadcasts/${req.body.message_id || ""}?error=${encodeURIComponent(result.reason || "conflict")}`
      );
    }
    if (result.status !== STATUS.OK) {
      return res.redirect(303, `/hq/broadcasts/new?error=${encodeURIComponent(result.reason || "invalid")}`);
    }
    return res.redirect(303, `/hq/broadcasts/${result.message.id}?notice=sent`);
  });

  router.post("/hq/broadcasts/:broadcastId/send", rejectApex, requireHq, async (req, res) => {
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
      return res.status(403).type("text").send("Invalid CSRF token");
    }
    const cid = churchId(req);
    const id = String(req.params.broadcastId || "");
    if (!cid || !isUuid(id)) return res.status(404).type("text").send("Not found");
    const result = await sendMessage(getPool(), {
      churchId: cid,
      messageId: id,
      createdByUserId: userId(req),
      env,
      skipComposerValidation: true,
    });
    if (result.status === STATUS.EMPTY_AUDIENCE) {
      return res.redirect(303, `/hq/broadcasts/${id}?error=empty_audience`);
    }
    if (result.status === STATUS.CONFLICT) {
      return res.redirect(303, `/hq/broadcasts/${id}?error=${encodeURIComponent(result.reason || "conflict")}`);
    }
    if (result.status !== STATUS.OK) {
      return res.redirect(303, `/hq/broadcasts/${id}?error=${encodeURIComponent(result.reason || "invalid")}`);
    }
    return res.redirect(303, `/hq/broadcasts/${id}?notice=sent`);
  });

  router.post("/hq/broadcasts/:broadcastId/cancel", rejectApex, requireHq, async (req, res) => {
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
      return res.status(403).type("text").send("Invalid CSRF token");
    }
    const cid = churchId(req);
    const id = String(req.params.broadcastId || "");
    if (!cid || !isUuid(id)) return res.status(404).type("text").send("Not found");
    const result = await cancelMessage(getPool(), { churchId: cid, messageId: id });
    if (result.status !== STATUS.OK) {
      return res.redirect(303, `/hq/broadcasts/${id}?error=cancel_failed`);
    }
    return res.redirect(303, `/hq/broadcasts/${id}?notice=cancelled`);
  });

  router.post("/hq/broadcasts/estimate-audience", rejectApex, requireHq, async (req, res) => {
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
      return res.status(403).json({ ok: false, error: "csrf" });
    }
    const cid = churchId(req);
    if (!cid) return res.status(403).json({ ok: false, error: "forbidden" });
    const audiences = parseAudiencesFromBody(req.body);
    const result = await estimateAudience(getPool(), { churchId: cid, audiences });
    if (result.status !== STATUS.OK) {
      return res.status(400).json({ ok: false, error: result.reason || "invalid" });
    }
    return res.json({
      ok: true,
      estimatedRecipients: result.estimatedRecipients,
      excludedInactive: result.excludedInactive,
    });
  });

  return router;
}

module.exports = {
  createBroadcastAdminRouter,
  parseAudiencesFromBody,
  composerFromBody,
  CSRF_FIELD,
};
