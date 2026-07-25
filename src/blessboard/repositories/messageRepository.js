"use strict";

/**
 * SQL repository for blessboard.messages + message_audiences + delivery attempts.
 */

const MESSAGE_COLS = `
  id, church_id, branch_id, created_by_user_id, sender_display_name, message_type,
  title, preview_text, body, priority, related_entity_type, related_entity_id,
  call_to_action_label, call_to_action_url, status,
  channel_in_app, channel_email, channel_sms, channel_push,
  scheduled_at, sent_at, cancelled_at, send_idempotency_key,
  recipient_count, in_app_created_count, excluded_inactive_count,
  created_at, updated_at
`;

function mapMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    branchId: row.branch_id || null,
    createdByUserId: row.created_by_user_id || null,
    senderDisplayName: row.sender_display_name,
    messageType: row.message_type,
    title: row.title,
    previewText: row.preview_text || null,
    body: row.body,
    priority: row.priority,
    relatedEntityType: row.related_entity_type || null,
    relatedEntityId: row.related_entity_id || null,
    callToActionLabel: row.call_to_action_label || null,
    callToActionUrl: row.call_to_action_url || null,
    status: row.status,
    channelInApp: Boolean(row.channel_in_app),
    channelEmail: Boolean(row.channel_email),
    channelSms: Boolean(row.channel_sms),
    channelPush: Boolean(row.channel_push),
    scheduledAt: row.scheduled_at || null,
    sentAt: row.sent_at || null,
    cancelledAt: row.cancelled_at || null,
    sendIdempotencyKey: row.send_idempotency_key || null,
    recipientCount: Number(row.recipient_count || 0),
    inAppCreatedCount: Number(row.in_app_created_count || 0),
    excludedInactiveCount: Number(row.excluded_inactive_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    creatorDisplayName: row.creator_display_name || null,
  };
}

function mapAudience(row) {
  if (!row) return null;
  return {
    id: row.id,
    messageId: row.message_id,
    audienceType: row.audience_type,
    branchId: row.branch_id || null,
    ministryId: row.ministry_id || null,
    roleKey: row.role_key || null,
    memberId: row.member_id || null,
    metadataJson: row.metadata_json || {},
    createdAt: row.created_at,
  };
}

/**
 * @param {{ query: Function }} client
 * @param {object} input
 */
async function insertMessage(client, input) {
  const result = await client.query(
    `INSERT INTO blessboard.messages (
       church_id, branch_id, created_by_user_id, sender_display_name, message_type,
       title, preview_text, body, priority, related_entity_type, related_entity_id,
       call_to_action_label, call_to_action_url, status,
       channel_in_app, channel_email, channel_sms, channel_push, scheduled_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
     )
     RETURNING ${MESSAGE_COLS}`,
    [
      input.churchId,
      input.branchId || null,
      input.createdByUserId || null,
      input.senderDisplayName,
      input.messageType,
      input.title,
      input.previewText || null,
      input.body,
      input.priority || "normal",
      input.relatedEntityType || null,
      input.relatedEntityId || null,
      input.callToActionLabel || null,
      input.callToActionUrl || null,
      input.status || "draft",
      input.channelInApp !== false,
      Boolean(input.channelEmail),
      Boolean(input.channelSms),
      Boolean(input.channelPush),
      input.scheduledAt || null,
    ]
  );
  return mapMessage(result.rows[0]);
}

async function updateMessageDraft(client, input) {
  const result = await client.query(
    `UPDATE blessboard.messages SET
       branch_id = $3,
       sender_display_name = $4,
       message_type = $5,
       title = $6,
       preview_text = $7,
       body = $8,
       priority = $9,
       related_entity_type = $10,
       related_entity_id = $11,
       call_to_action_label = $12,
       call_to_action_url = $13,
       channel_in_app = $14,
       channel_email = $15,
       channel_sms = $16,
       channel_push = $17,
       scheduled_at = $18,
       status = CASE
         WHEN $18::timestamptz IS NOT NULL AND status = 'draft' THEN 'scheduled'
         WHEN $18::timestamptz IS NULL AND status = 'scheduled' THEN 'draft'
         ELSE status
       END
     WHERE id = $1 AND church_id = $2 AND status IN ('draft', 'scheduled')
     RETURNING ${MESSAGE_COLS}`,
    [
      input.id,
      input.churchId,
      input.branchId || null,
      input.senderDisplayName,
      input.messageType,
      input.title,
      input.previewText || null,
      input.body,
      input.priority || "normal",
      input.relatedEntityType || null,
      input.relatedEntityId || null,
      input.callToActionLabel || null,
      input.callToActionUrl || null,
      input.channelInApp !== false,
      Boolean(input.channelEmail),
      Boolean(input.channelSms),
      Boolean(input.channelPush),
      input.scheduledAt || null,
    ]
  );
  return mapMessage(result.rows[0] || null);
}

async function replaceAudiences(client, messageId, audiences) {
  await client.query(`DELETE FROM blessboard.message_audiences WHERE message_id = $1`, [
    messageId,
  ]);
  const rows = [];
  for (const a of audiences || []) {
    const result = await client.query(
      `INSERT INTO blessboard.message_audiences (
         message_id, audience_type, branch_id, ministry_id, role_key, member_id, metadata_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
       RETURNING id, message_id, audience_type, branch_id, ministry_id, role_key, member_id,
                 metadata_json, created_at`,
      [
        messageId,
        a.audienceType,
        a.branchId || null,
        a.ministryId || null,
        a.roleKey || null,
        a.memberId || null,
        JSON.stringify(a.metadataJson || {}),
      ]
    );
    rows.push(mapAudience(result.rows[0]));
  }
  return rows;
}

async function listAudiences(client, messageId) {
  const result = await client.query(
    `SELECT id, message_id, audience_type, branch_id, ministry_id, role_key, member_id,
            metadata_json, created_at
       FROM blessboard.message_audiences
      WHERE message_id = $1
      ORDER BY created_at ASC`,
    [messageId]
  );
  return result.rows.map(mapAudience);
}

async function getMessageByIdForChurch(client, { churchId, messageId }) {
  const result = await client.query(
    `SELECT m.id, m.church_id, m.branch_id, m.created_by_user_id, m.sender_display_name,
            m.message_type, m.title, m.preview_text, m.body, m.priority,
            m.related_entity_type, m.related_entity_id, m.call_to_action_label,
            m.call_to_action_url, m.status, m.channel_in_app, m.channel_email,
            m.channel_sms, m.channel_push, m.scheduled_at, m.sent_at, m.cancelled_at,
            m.send_idempotency_key, m.recipient_count, m.in_app_created_count,
            m.excluded_inactive_count, m.created_at, m.updated_at,
            u.display_name AS creator_display_name
       FROM blessboard.messages m
       LEFT JOIN blessboard.users u ON u.id = m.created_by_user_id
      WHERE m.id = $1 AND m.church_id = $2`,
    [messageId, churchId]
  );
  return mapMessage(result.rows[0] || null);
}

async function listMessages(client, opts) {
  const params = [opts.churchId];
  const clauses = ["m.church_id = $1"];

  if (opts.status) {
    params.push(opts.status);
    clauses.push(`m.status = $${params.length}`);
  }
  if (opts.messageType) {
    params.push(opts.messageType);
    clauses.push(`m.message_type = $${params.length}`);
  }
  if (opts.channel) {
    const ch = String(opts.channel);
    if (ch === "email") clauses.push("m.channel_email = TRUE");
    else if (ch === "sms") clauses.push("m.channel_sms = TRUE");
    else if (ch === "push") clauses.push("m.channel_push = TRUE");
    else if (ch === "in_app") clauses.push("m.channel_in_app = TRUE");
  }
  if (opts.branchId) {
    params.push(opts.branchId);
    clauses.push(`m.branch_id = $${params.length}`);
  }
  if (opts.q) {
    params.push(`%${String(opts.q).toLowerCase()}%`);
    clauses.push(
      `(lower(m.title) LIKE $${params.length} OR lower(coalesce(m.preview_text,'')) LIKE $${params.length})`
    );
  }
  if (opts.audienceType) {
    params.push(opts.audienceType);
    clauses.push(`EXISTS (
      SELECT 1 FROM blessboard.message_audiences a
       WHERE a.message_id = m.id AND a.audience_type = $${params.length}
    )`);
  }

  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 100);
  const offset = Math.max(Number(opts.offset) || 0, 0);
  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const where = clauses.join(" AND ");
  const countResult = await client.query(
    `SELECT count(*)::int AS n FROM blessboard.messages m WHERE ${where}`,
    params.slice(0, params.length - 2)
  );
  const listResult = await client.query(
    `SELECT m.id, m.church_id, m.branch_id, m.created_by_user_id, m.sender_display_name,
            m.message_type, m.title, m.preview_text, m.body, m.priority,
            m.related_entity_type, m.related_entity_id, m.call_to_action_label,
            m.call_to_action_url, m.status, m.channel_in_app, m.channel_email,
            m.channel_sms, m.channel_push, m.scheduled_at, m.sent_at, m.cancelled_at,
            m.send_idempotency_key, m.recipient_count, m.in_app_created_count,
            m.excluded_inactive_count, m.created_at, m.updated_at,
            u.display_name AS creator_display_name
       FROM blessboard.messages m
       LEFT JOIN blessboard.users u ON u.id = m.created_by_user_id
      WHERE ${where}
      ORDER BY coalesce(m.sent_at, m.scheduled_at, m.created_at) DESC, m.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );
  return {
    total: Number(countResult.rows[0] && countResult.rows[0].n) || 0,
    items: listResult.rows.map(mapMessage),
  };
}

async function countMessagesByStatus(client, churchId) {
  const result = await client.query(
    `SELECT status, count(*)::int AS n
       FROM blessboard.messages
      WHERE church_id = $1
      GROUP BY status`,
    [churchId]
  );
  const counts = {
    draft: 0,
    scheduled: 0,
    sending: 0,
    sent: 0,
    partially_delivered: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const row of result.rows) {
    counts[row.status] = Number(row.n) || 0;
  }
  const recent = await client.query(
    `SELECT count(*)::int AS n
       FROM blessboard.messages
      WHERE church_id = $1
        AND status IN ('sent', 'partially_delivered')
        AND sent_at >= now() - interval '7 days'`,
    [churchId]
  );
  return {
    ...counts,
    sentRecently: Number(recent.rows[0] && recent.rows[0].n) || 0,
    needsAttention: (counts.failed || 0) + (counts.partially_delivered || 0),
  };
}

async function markSending(client, { churchId, messageId, idempotencyKey }) {
  const result = await client.query(
    `UPDATE blessboard.messages
        SET status = 'sending',
            send_idempotency_key = coalesce(send_idempotency_key, $3)
      WHERE id = $1 AND church_id = $2
        AND status IN ('draft', 'scheduled')
      RETURNING id, church_id, branch_id, created_by_user_id, sender_display_name,
                message_type, title, preview_text, body, priority,
                related_entity_type, related_entity_id, call_to_action_label,
                call_to_action_url, status, channel_in_app, channel_email,
                channel_sms, channel_push, scheduled_at, sent_at, cancelled_at,
                send_idempotency_key, recipient_count, in_app_created_count,
                excluded_inactive_count, created_at, updated_at`,
    [messageId, churchId, idempotencyKey || null]
  );
  return mapMessage(result.rows[0] || null);
}

async function finalizeSend(client, input) {
  const result = await client.query(
    `UPDATE blessboard.messages
        SET status = $3,
            sent_at = now(),
            recipient_count = $4,
            in_app_created_count = $5,
            excluded_inactive_count = $6,
            send_idempotency_key = coalesce(send_idempotency_key, $7)
      WHERE id = $1 AND church_id = $2 AND status = 'sending'
      RETURNING id, church_id, branch_id, created_by_user_id, sender_display_name,
                message_type, title, preview_text, body, priority,
                related_entity_type, related_entity_id, call_to_action_label,
                call_to_action_url, status, channel_in_app, channel_email,
                channel_sms, channel_push, scheduled_at, sent_at, cancelled_at,
                send_idempotency_key, recipient_count, in_app_created_count,
                excluded_inactive_count, created_at, updated_at`,
    [
      input.messageId,
      input.churchId,
      input.status,
      input.recipientCount || 0,
      input.inAppCreatedCount || 0,
      input.excludedInactiveCount || 0,
      input.idempotencyKey || null,
    ]
  );
  return mapMessage(result.rows[0] || null);
}

async function cancelScheduled(client, { churchId, messageId }) {
  const result = await client.query(
    `UPDATE blessboard.messages
        SET status = 'cancelled', cancelled_at = now()
      WHERE id = $1 AND church_id = $2 AND status = 'scheduled'
      RETURNING id, church_id, branch_id, created_by_user_id, sender_display_name,
                message_type, title, preview_text, body, priority,
                related_entity_type, related_entity_id, call_to_action_label,
                call_to_action_url, status, channel_in_app, channel_email,
                channel_sms, channel_push, scheduled_at, sent_at, cancelled_at,
                send_idempotency_key, recipient_count, in_app_created_count,
                excluded_inactive_count, created_at, updated_at`,
    [messageId, churchId]
  );
  return mapMessage(result.rows[0] || null);
}

async function listDueScheduled(client, { limit } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const result = await client.query(
    `SELECT id, church_id, branch_id, created_by_user_id, sender_display_name,
            message_type, title, preview_text, body, priority,
            related_entity_type, related_entity_id, call_to_action_label,
            call_to_action_url, status, channel_in_app, channel_email,
            channel_sms, channel_push, scheduled_at, sent_at, cancelled_at,
            send_idempotency_key, recipient_count, in_app_created_count,
            excluded_inactive_count, created_at, updated_at
       FROM blessboard.messages
      WHERE status = 'scheduled'
        AND scheduled_at IS NOT NULL
        AND scheduled_at <= now()
      ORDER BY scheduled_at ASC
      LIMIT $1`,
    [lim]
  );
  return result.rows.map(mapMessage);
}

async function insertDeliveryAttempt(client, input) {
  const result = await client.query(
    `INSERT INTO blessboard.message_delivery_attempts (
       church_id, message_id, member_id, channel, status,
       provider_reference, failure_code, delivered_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (message_id, member_id, channel) DO UPDATE SET
       status = EXCLUDED.status,
       provider_reference = EXCLUDED.provider_reference,
       failure_code = EXCLUDED.failure_code,
       delivered_at = EXCLUDED.delivered_at,
       attempted_at = now()
     RETURNING id, church_id, message_id, member_id, channel, status,
               provider_reference, failure_code, attempted_at, delivered_at`,
    [
      input.churchId,
      input.messageId,
      input.memberId,
      input.channel,
      input.status,
      input.providerReference || null,
      input.failureCode || null,
      input.deliveredAt || null,
    ]
  );
  const row = result.rows[0];
  return {
    id: row.id,
    churchId: row.church_id,
    messageId: row.message_id,
    memberId: row.member_id,
    channel: row.channel,
    status: row.status,
    providerReference: row.provider_reference || null,
    failureCode: row.failure_code || null,
    attemptedAt: row.attempted_at,
    deliveredAt: row.delivered_at || null,
  };
}

async function summarizeDelivery(client, messageId) {
  const result = await client.query(
    `SELECT channel, status, count(*)::int AS n
       FROM blessboard.message_delivery_attempts
      WHERE message_id = $1
      GROUP BY channel, status`,
    [messageId]
  );
  return result.rows.map((r) => ({
    channel: r.channel,
    status: r.status,
    count: Number(r.n) || 0,
  }));
}

async function countInAppReads(client, messageId) {
  const result = await client.query(
    `SELECT
       count(*) FILTER (WHERE read_at IS NOT NULL)::int AS read_count,
       count(*)::int AS total
       FROM blessboard.member_notifications
      WHERE message_id = $1 AND archived_at IS NULL`,
    [messageId]
  );
  const row = result.rows[0] || { read_count: 0, total: 0 };
  return {
    readCount: Number(row.read_count) || 0,
    total: Number(row.total) || 0,
  };
}

module.exports = {
  mapMessage,
  mapAudience,
  insertMessage,
  updateMessageDraft,
  replaceAudiences,
  listAudiences,
  getMessageById: getMessageByIdForChurch,
  listMessages,
  countMessagesByStatus,
  markSending,
  finalizeSend,
  cancelScheduled,
  listDueScheduled,
  insertDeliveryAttempt,
  summarizeDelivery,
  countInAppReads,
};
