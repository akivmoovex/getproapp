"use strict";

/**
 * BlessBoard V5 unified messaging service (HQ Broadcast Center).
 * In-app notifications are canonical; external channels stay honest.
 */

const crypto = require("crypto");
const messageRepo = require("../repositories/messageRepository");
const notificationRepo = require("../repositories/memberNotificationRepository");
const preferenceRepo = require("../repositories/notificationPreferenceRepository");
const {
  MANUAL_MESSAGE_TYPES,
  MESSAGE_TYPE_TO_INBOX_CATEGORY,
  MESSAGE_TYPE_TO_PREFERENCE_CATEGORY,
  PRIORITIES,
  AUDIENCE_TYPES,
} = require("../messaging/messageConstants");
const {
  rejectHtml,
  validateSafeUrl,
  isUuid,
} = require("../messaging/messageSanitize");
const {
  getDeliveryChannelAvailability,
} = require("../messaging/deliveryChannelAvailability");
const { areBlessBoardJobsEnabled } = require("../../church/blessBoardEnv");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  CONFLICT: "conflict",
  EMPTY_AUDIENCE: "empty_audience",
  UNAVAILABLE: "unavailable",
});

const HTML_HINT = /<\/?[a-z][\s\S]*>/i;

async function withClient(db, fn) {
  let client = null;
  let owned = false;
  try {
    if (db && typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    return await fn(client);
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

function plainText(value, field, { required, max, min }) {
  if (value == null || value === "") {
    if (required) return { ok: false, reason: field };
    return { ok: true, value: null };
  }
  const html = rejectHtml(value, field);
  if (!html.ok) return html;
  const s = String(html.value).trim();
  if (!s) {
    if (required) return { ok: false, reason: field };
    return { ok: true, value: null };
  }
  const lo = min != null ? min : 1;
  if (s.length < lo || s.length > max) return { ok: false, reason: `${field}_length` };
  return { ok: true, value: s };
}

function parseBool(value) {
  return value === true || value === "1" || value === "on" || value === "true";
}

function normalizeAudiences(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return [raw];
}

/**
 * Validate composer payload.
 */
function validateComposerInput(input, { allowSystemTypes } = {}) {
  const title = plainText(input.title, "title", { required: true, max: 200 });
  if (!title.ok) return title;
  const body = plainText(input.body, "body", { required: true, max: 20000 });
  if (!body.ok) return body;
  const preview = plainText(input.previewText || input.preview_text, "preview_text", {
    required: false,
    max: 500,
  });
  if (!preview.ok) return preview;
  const sender = plainText(
    input.senderDisplayName || input.sender_display_name,
    "sender_display_name",
    { required: true, max: 120 }
  );
  if (!sender.ok) return sender;

  const messageType = String(input.messageType || input.message_type || "").trim();
  const allowed = allowSystemTypes
    ? [...MANUAL_MESSAGE_TYPES, "system_notice", "giving_receipt"]
    : MANUAL_MESSAGE_TYPES;
  if (!allowed.includes(messageType)) {
    return { ok: false, reason: "message_type" };
  }
  if (!allowSystemTypes && (messageType === "system_notice" || messageType === "giving_receipt")) {
    return { ok: false, reason: "message_type_reserved" };
  }

  const priority = String(input.priority || "normal").trim();
  if (!PRIORITIES.includes(priority)) return { ok: false, reason: "priority" };

  let relatedEntityType = input.relatedEntityType || input.related_entity_type || null;
  let relatedEntityId = input.relatedEntityId || input.related_entity_id || null;
  if (relatedEntityType) relatedEntityType = String(relatedEntityType).trim();
  if (relatedEntityId) relatedEntityId = String(relatedEntityId).trim();
  if ((relatedEntityType && !relatedEntityId) || (!relatedEntityType && relatedEntityId)) {
    return { ok: false, reason: "related_entity" };
  }
  if (relatedEntityId && !isUuid(relatedEntityId)) {
    return { ok: false, reason: "related_entity_id" };
  }
  if (
    relatedEntityType &&
    !["event", "ministry", "branch", "sermon", "giving_receipt"].includes(relatedEntityType)
  ) {
    return { ok: false, reason: "related_entity_type" };
  }

  const ctaLabel = plainText(
    input.callToActionLabel || input.call_to_action_label,
    "call_to_action_label",
    { required: false, max: 100 }
  );
  if (!ctaLabel.ok) return ctaLabel;
  const ctaUrl = validateSafeUrl(
    input.callToActionUrl || input.call_to_action_url,
    "call_to_action_url"
  );
  if (!ctaUrl.ok) return ctaUrl;
  if ((ctaLabel.value && !ctaUrl.value) || (!ctaLabel.value && ctaUrl.value)) {
    return { ok: false, reason: "call_to_action_pair" };
  }

  const audiences = normalizeAudiences(input.audiences || input.audience);
  if (!audiences.length) return { ok: false, reason: "audience" };

  const normalizedAudiences = [];
  for (const a of audiences) {
    const audienceType = String(a.audienceType || a.audience_type || "").trim();
    if (!AUDIENCE_TYPES.includes(audienceType)) {
      return { ok: false, reason: "audience_type" };
    }
    const row = {
      audienceType,
      branchId: a.branchId || a.branch_id || null,
      ministryId: a.ministryId || a.ministry_id || null,
      roleKey: a.roleKey || a.role_key || null,
      memberId: a.memberId || a.member_id || null,
      metadataJson: a.metadataJson || a.metadata_json || {},
    };
    if (row.branchId && !isUuid(row.branchId)) return { ok: false, reason: "branch_id" };
    if (row.ministryId && !isUuid(row.ministryId)) return { ok: false, reason: "ministry_id" };
    if (row.memberId && !isUuid(row.memberId)) return { ok: false, reason: "member_id" };
    if (audienceType === "branches" && !row.branchId) {
      return { ok: false, reason: "audience_branch" };
    }
    if (audienceType === "ministries" && !row.ministryId) {
      return { ok: false, reason: "audience_ministry" };
    }
    if (audienceType === "members" && !row.memberId) {
      return { ok: false, reason: "audience_member" };
    }
    if (audienceType === "roles" && !row.roleKey) {
      return { ok: false, reason: "audience_role" };
    }
    if (audienceType === "event_attendees") {
      const eventId =
        row.metadataJson.eventId ||
        row.metadataJson.event_id ||
        input.relatedEntityId ||
        input.related_entity_id;
      if (!eventId || !isUuid(String(eventId))) {
        return { ok: false, reason: "audience_event" };
      }
      row.metadataJson = { ...row.metadataJson, eventId: String(eventId) };
    }
    normalizedAudiences.push(row);
  }

  let scheduledAt = input.scheduledAt || input.scheduled_at || null;
  if (scheduledAt) {
    const d = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
    if (Number.isNaN(d.getTime())) return { ok: false, reason: "scheduled_at" };
    if (d.getTime() <= Date.now() - 60_000) return { ok: false, reason: "scheduled_at_past" };
    scheduledAt = d;
  }

  const channelInApp = input.channelInApp != null
    ? parseBool(input.channelInApp)
    : input.channel_in_app != null
      ? parseBool(input.channel_in_app)
      : true;
  if (!channelInApp) return { ok: false, reason: "in_app_required" };

  return {
    ok: true,
    value: {
      title: title.value,
      body: body.value,
      previewText: preview.value,
      senderDisplayName: sender.value,
      messageType,
      priority,
      relatedEntityType,
      relatedEntityId,
      callToActionLabel: ctaLabel.value,
      callToActionUrl: ctaUrl.value,
      audiences: normalizedAudiences,
      scheduledAt,
      channelInApp: true,
      channelEmail: parseBool(input.channelEmail || input.channel_email),
      channelSms: parseBool(input.channelSms || input.channel_sms),
      channelPush: parseBool(input.channelPush || input.channel_push),
      branchId: input.branchId || input.branch_id || null,
    },
  };
}

/**
 * Resolve eligible active member IDs for audiences (organization/church scoped).
 */
async function resolveAudienceMembers(client, { churchId, audiences }) {
  const memberIds = new Set();
  let excludedInactive = 0;

  for (const a of audiences) {
    if (a.audienceType === "all_active_members") {
      const result = await client.query(
        `SELECT id FROM blessboard.members
          WHERE church_id = $1 AND status = 'active'`,
        [churchId]
      );
      for (const row of result.rows) memberIds.add(row.id);
      continue;
    }

    if (a.audienceType === "branches" && a.branchId) {
      const branchOk = await client.query(
        `SELECT id FROM blessboard.branches WHERE id = $1 AND church_id = $2`,
        [a.branchId, churchId]
      );
      if (!branchOk.rows.length) continue;
      const result = await client.query(
        `SELECT m.id, m.status
           FROM blessboard.members m
           INNER JOIN blessboard.member_branch_memberships mb
             ON mb.member_id = m.id
          WHERE m.church_id = $1
            AND mb.branch_id = $2
            AND mb.membership_status = 'active'`,
        [churchId, a.branchId]
      );
      for (const row of result.rows) {
        if (row.status === "active") memberIds.add(row.id);
        else excludedInactive += 1;
      }
      continue;
    }

    if (a.audienceType === "ministries" && a.ministryId) {
      const ministryOk = await client.query(
        `SELECT id FROM blessboard.ministries
          WHERE id = $1 AND church_id = $2 AND status IN ('draft', 'published')`,
        [a.ministryId, churchId]
      );
      if (!ministryOk.rows.length) continue;
      const result = await client.query(
        `SELECT m.id, m.status
           FROM blessboard.members m
           INNER JOIN blessboard.ministry_memberships mm
             ON mm.member_id = m.id
          WHERE m.church_id = $1
            AND mm.ministry_id = $2
            AND mm.status = 'active'`,
        [churchId, a.ministryId]
      );
      for (const row of result.rows) {
        if (row.status === "active") memberIds.add(row.id);
        else excludedInactive += 1;
      }
      continue;
    }

    if (a.audienceType === "members" && a.memberId) {
      const result = await client.query(
        `SELECT id, status FROM blessboard.members
          WHERE id = $1 AND church_id = $2`,
        [a.memberId, churchId]
      );
      if (!result.rows.length) {
        return {
          ok: false,
          reason: "member_outside_organization",
          memberIds: [],
          excludedInactive: 0,
        };
      }
      if (result.rows[0].status === "active") memberIds.add(result.rows[0].id);
      else excludedInactive += 1;
      continue;
    }

    if (a.audienceType === "roles" && a.roleKey) {
      // Roles map to users with user_roles; link to members via members.user_id.
      const result = await client.query(
        `SELECT m.id, m.status
           FROM blessboard.members m
           INNER JOIN blessboard.user_roles ur ON ur.user_id = m.user_id
          WHERE m.church_id = $1
            AND ur.church_id = $1
            AND ur.role_key = $2
            AND ur.status = 'active'`,
        [churchId, a.roleKey]
      );
      for (const row of result.rows) {
        if (row.status === "active") memberIds.add(row.id);
        else excludedInactive += 1;
      }
      continue;
    }

    if (a.audienceType === "event_attendees") {
      const eventId = a.metadataJson && (a.metadataJson.eventId || a.metadataJson.event_id);
      if (!eventId) continue;
      const eventOk = await client.query(
        `SELECT id FROM blessboard.events WHERE id = $1 AND church_id = $2`,
        [eventId, churchId]
      );
      if (!eventOk.rows.length) continue;
      const result = await client.query(
        `SELECT m.id, m.status
           FROM blessboard.members m
           INNER JOIN blessboard.event_registrations er ON er.member_id = m.id
          WHERE m.church_id = $1
            AND er.event_id = $2
            AND er.status = 'registered'`,
        [churchId, eventId]
      );
      for (const row of result.rows) {
        if (row.status === "active") memberIds.add(row.id);
        else excludedInactive += 1;
      }
    }
  }

  return {
    ok: true,
    memberIds: [...memberIds],
    excludedInactive,
  };
}

async function estimateAudience(db, { churchId, audiences }) {
  return withClient(db, async (client) => {
    const resolved = await resolveAudienceMembers(client, { churchId, audiences });
    if (!resolved.ok) {
      return { status: STATUS.INVALID_INPUT, reason: resolved.reason };
    }
    return {
      status: STATUS.OK,
      estimatedRecipients: resolved.memberIds.length,
      excludedInactive: resolved.excludedInactive,
      memberIds: resolved.memberIds,
    };
  });
}

/**
 * Create canonical in-app notifications and record external channel attempts honestly.
 */
async function createMemberNotificationsForMessage(client, { message, env }) {
  const audiences = await messageRepo.listAudiences(client, message.id);
  const resolved = await resolveAudienceMembers(client, {
    churchId: message.churchId,
    audiences,
  });
  if (!resolved.ok) {
    return { ok: false, reason: resolved.reason };
  }
  if (!resolved.memberIds.length) {
    return { ok: false, reason: "empty_audience", excludedInactive: resolved.excludedInactive };
  }

  const availability = getDeliveryChannelAvailability(env);
  const category = MESSAGE_TYPE_TO_INBOX_CATEGORY[message.messageType] || "church";
  const prefCategory =
    MESSAGE_TYPE_TO_PREFERENCE_CATEGORY[message.messageType] || "church_announcements";

  let inAppCreated = 0;
  const deliveryStats = {
    in_app: { delivered: 0, failed: 0, unavailable: 0, suppressed: 0 },
    email: { delivered: 0, failed: 0, unavailable: 0, suppressed: 0 },
    sms: { delivered: 0, failed: 0, unavailable: 0, suppressed: 0 },
    push: { delivered: 0, failed: 0, unavailable: 0, suppressed: 0 },
  };

  for (const memberId of resolved.memberIds) {
    const prefs = await preferenceRepo.listPreferences(client, {
      churchId: message.churchId,
      memberId,
    });
    const pref = prefs.find((p) => p.category === prefCategory) || {
      inAppEnabled: true,
      emailEnabled: false,
      smsEnabled: false,
      pushEnabled: false,
    };

    const memberRow = await client.query(
      `SELECT id, email_normalized, phone_normalized, status
         FROM blessboard.members WHERE id = $1 AND church_id = $2`,
      [memberId, message.churchId]
    );
    const member = memberRow.rows[0];
    if (!member || member.status !== "active") continue;

    // In-app is canonical — still create even if preference toggle off for non-critical?
    // Spec: in-app normally remains enabled; preferences control eligible external delivery.
    // For in-app: if preference disables in-app, still create for system/admin/giving/direct safety.
    const forceInApp =
      message.messageType === "system_notice" ||
      message.messageType === "administrative_notice" ||
      message.messageType === "giving_receipt" ||
      message.messageType === "direct_message" ||
      message.messageType === "service_update";
    const allowInApp = forceInApp || pref.inAppEnabled !== false;

    if (allowInApp && message.channelInApp !== false) {
      const created = await notificationRepo.insertNotification(client, {
        churchId: message.churchId,
        memberId,
        messageId: message.id,
        sourceType: "message",
        sourceId: message.id,
        category,
        title: message.title,
        previewText: message.previewText,
        body: message.body,
        senderDisplayName: message.senderDisplayName,
        messageType: message.messageType,
        priority: message.priority,
        relatedEntityType: message.relatedEntityType,
        relatedEntityId: message.relatedEntityId,
        callToActionLabel: message.callToActionLabel,
        callToActionUrl: message.callToActionUrl,
      });
      if (created) {
        inAppCreated += 1;
        await messageRepo.insertDeliveryAttempt(client, {
          churchId: message.churchId,
          messageId: message.id,
          memberId,
          channel: "in_app",
          status: "delivered",
          deliveredAt: new Date(),
        });
        deliveryStats.in_app.delivered += 1;
      }
    } else {
      await messageRepo.insertDeliveryAttempt(client, {
        churchId: message.churchId,
        messageId: message.id,
        memberId,
        channel: "in_app",
        status: "suppressed_by_preference",
      });
      deliveryStats.in_app.suppressed += 1;
    }

    async function recordExternal(channel, requested, eligibleContact, prefEnabled, available) {
      if (!requested) {
        await messageRepo.insertDeliveryAttempt(client, {
          churchId: message.churchId,
          messageId: message.id,
          memberId,
          channel,
          status: "not_requested",
        });
        return;
      }
      if (!prefEnabled) {
        await messageRepo.insertDeliveryAttempt(client, {
          churchId: message.churchId,
          messageId: message.id,
          memberId,
          channel,
          status: "suppressed_by_preference",
        });
        deliveryStats[channel].suppressed += 1;
        return;
      }
      if (!eligibleContact) {
        await messageRepo.insertDeliveryAttempt(client, {
          churchId: message.churchId,
          messageId: message.id,
          memberId,
          channel,
          status: "suppressed_by_consent",
          failureCode: "contact_unavailable",
        });
        deliveryStats[channel].suppressed += 1;
        return;
      }
      if (!available) {
        await messageRepo.insertDeliveryAttempt(client, {
          churchId: message.churchId,
          messageId: message.id,
          memberId,
          channel,
          status: "unavailable",
          failureCode: "provider_not_configured",
        });
        deliveryStats[channel].unavailable += 1;
        return;
      }
      // Provider configured but no real send adapter wired for member messaging.
      await messageRepo.insertDeliveryAttempt(client, {
        churchId: message.churchId,
        messageId: message.id,
        memberId,
        channel,
        status: "unavailable",
        failureCode: "provider_adapter_missing",
      });
      deliveryStats[channel].unavailable += 1;
    }

    await recordExternal(
      "email",
      message.channelEmail,
      Boolean(member.email_normalized),
      Boolean(pref.emailEnabled),
      availability.email.available
    );
    await recordExternal(
      "sms",
      message.channelSms,
      Boolean(member.phone_normalized),
      Boolean(pref.smsEnabled),
      availability.sms.available
    );
    await recordExternal(
      "push",
      message.channelPush,
      false, // no device registration table
      Boolean(pref.pushEnabled),
      availability.push.available
    );
  }

  return {
    ok: true,
    recipientCount: resolved.memberIds.length,
    inAppCreatedCount: inAppCreated,
    excludedInactive: resolved.excludedInactive,
    deliveryStats,
  };
}

async function saveDraft(db, input) {
  const validated = validateComposerInput(input);
  if (!validated.ok) {
    return { status: STATUS.INVALID_INPUT, reason: validated.reason };
  }
  const v = validated.value;
  if (v.branchId && !isUuid(v.branchId)) {
    return { status: STATUS.INVALID_INPUT, reason: "branch_id" };
  }

  return withClient(db, async (client) => {
    await client.query("BEGIN");
    try {
      let message;
      if (input.messageId && isUuid(input.messageId)) {
        message = await messageRepo.updateMessageDraft(client, {
          id: input.messageId,
          churchId: input.churchId,
          ...v,
          status: v.scheduledAt ? "scheduled" : "draft",
        });
        if (!message) {
          await client.query("ROLLBACK");
          return { status: STATUS.NOT_FOUND };
        }
      } else {
        message = await messageRepo.insertMessage(client, {
          churchId: input.churchId,
          createdByUserId: input.createdByUserId,
          ...v,
          status: v.scheduledAt ? "scheduled" : "draft",
        });
      }
      if (v.scheduledAt && !areBlessBoardJobsEnabled(input.env || process.env)) {
        // Allow saving scheduled status but surface that jobs gate is off.
        message.jobsEnabled = false;
      }
      await messageRepo.replaceAudiences(client, message.id, v.audiences);
      const audiences = await messageRepo.listAudiences(client, message.id);
      await client.query("COMMIT");
      return { status: STATUS.OK, message, audiences };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}

async function sendMessage(db, input) {
  const hasExistingId = Boolean(input.messageId && isUuid(input.messageId));
  const validated = hasExistingId && input.skipComposerValidation
    ? { ok: false }
    : validateComposerInput(input);
  if (!hasExistingId && !validated.ok) {
    return { status: STATUS.INVALID_INPUT, reason: validated.reason };
  }

  return withClient(db, async (client) => {
    await client.query("BEGIN");
    try {
      let messageId = input.messageId;
      if (!messageId) {
        const v = validated.value;
        const created = await messageRepo.insertMessage(client, {
          churchId: input.churchId,
          createdByUserId: input.createdByUserId,
          ...v,
          status: "draft",
        });
        await messageRepo.replaceAudiences(client, created.id, v.audiences);
        messageId = created.id;
      } else if (validated.ok) {
        const updated = await messageRepo.updateMessageDraft(client, {
          id: messageId,
          churchId: input.churchId,
          ...validated.value,
        });
        if (updated) {
          await messageRepo.replaceAudiences(client, messageId, validated.value.audiences);
        }
      }

      const existing = await messageRepo.getMessageById(client, {
        churchId: input.churchId,
        messageId,
      });
      if (!existing) {
        await client.query("ROLLBACK");
        return { status: STATUS.NOT_FOUND };
      }
      if (["sent", "sending", "partially_delivered", "failed"].includes(existing.status)) {
        await client.query("ROLLBACK");
        return { status: STATUS.CONFLICT, reason: "already_sent", message: existing };
      }
      if (existing.status === "cancelled") {
        await client.query("ROLLBACK");
        return { status: STATUS.CONFLICT, reason: "cancelled" };
      }

      const idempotencyKey =
        input.idempotencyKey ||
        existing.sendIdempotencyKey ||
        crypto.randomUUID();

      const sending = await messageRepo.markSending(client, {
        churchId: input.churchId,
        messageId,
        idempotencyKey,
      });
      if (!sending) {
        await client.query("ROLLBACK");
        return { status: STATUS.CONFLICT, reason: "duplicate_send" };
      }

      const fanout = await createMemberNotificationsForMessage(client, {
        message: sending,
        env: input.env,
      });
      if (!fanout.ok) {
        await messageRepo.finalizeSend(client, {
          churchId: input.churchId,
          messageId,
          status: "failed",
          recipientCount: 0,
          inAppCreatedCount: 0,
          excludedInactiveCount: fanout.excludedInactive || 0,
          idempotencyKey,
        });
        await client.query("COMMIT");
        return {
          status: fanout.reason === "empty_audience" ? STATUS.EMPTY_AUDIENCE : STATUS.INVALID_INPUT,
          reason: fanout.reason,
        };
      }

      let finalStatus = "sent";
      const hasUnavailable =
        fanout.deliveryStats.email.unavailable > 0 ||
        fanout.deliveryStats.sms.unavailable > 0 ||
        fanout.deliveryStats.push.unavailable > 0;
      if (fanout.inAppCreatedCount === 0) finalStatus = "failed";
      else if (hasUnavailable && sending.channelEmail) finalStatus = "partially_delivered";

      const finalized = await messageRepo.finalizeSend(client, {
        churchId: input.churchId,
        messageId,
        status: finalStatus,
        recipientCount: fanout.recipientCount,
        inAppCreatedCount: fanout.inAppCreatedCount,
        excludedInactiveCount: fanout.excludedInactive,
        idempotencyKey,
      });
      await client.query("COMMIT");
      return {
        status: STATUS.OK,
        message: finalized,
        fanout,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}

async function cancelMessage(db, { churchId, messageId }) {
  return withClient(db, async (client) => {
    const cancelled = await messageRepo.cancelScheduled(client, { churchId, messageId });
    if (!cancelled) return { status: STATUS.NOT_FOUND };
    return { status: STATUS.OK, message: cancelled };
  });
}

async function getBroadcastCenter(db, opts) {
  return withClient(db, async (client) => {
    const [summary, listed] = await Promise.all([
      messageRepo.countMessagesByStatus(client, opts.churchId),
      messageRepo.listMessages(client, opts),
    ]);
    return {
      status: STATUS.OK,
      summary,
      total: listed.total,
      items: listed.items,
      channelAvailability: getDeliveryChannelAvailability(opts.env),
    };
  });
}

async function getBroadcastDetail(db, { churchId, messageId, env }) {
  return withClient(db, async (client) => {
    const message = await messageRepo.getMessageById(client, { churchId, messageId });
    if (!message) return { status: STATUS.NOT_FOUND };
    const audiences = await messageRepo.listAudiences(client, messageId);
    const delivery = await messageRepo.summarizeDelivery(client, messageId);
    const reads = await messageRepo.countInAppReads(client, messageId);
    return {
      status: STATUS.OK,
      message,
      audiences,
      delivery,
      inAppReads: reads,
      channelAvailability: getDeliveryChannelAvailability(env),
    };
  });
}

async function processDueScheduledMessages(db, { env, limit } = {}) {
  if (!areBlessBoardJobsEnabled(env || process.env)) {
    return { status: STATUS.OK, skipped: true, reason: "BLESSBOARD_JOBS_ENABLED=false", processed: 0 };
  }
  return withClient(db, async (client) => {
    const due = await messageRepo.listDueScheduled(client, { limit });
    const results = [];
    for (const msg of due) {
      const sent = await sendMessage(db, {
        churchId: msg.churchId,
        messageId: msg.id,
        createdByUserId: msg.createdByUserId,
        env,
        skipComposerValidation: true,
      });
      results.push({ messageId: msg.id, status: sent.status, reason: sent.reason || null });
    }
    return { status: STATUS.OK, processed: results.length, results };
  });
}

module.exports = {
  STATUS,
  validateComposerInput,
  resolveAudienceMembers,
  estimateAudience,
  createMemberNotificationsForMessage,
  saveDraft,
  sendMessage,
  cancelMessage,
  getBroadcastCenter,
  getBroadcastDetail,
  processDueScheduledMessages,
};
