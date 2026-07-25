"use strict";

/**
 * Canonical member notification inbox repository.
 */

function mapNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    memberId: row.member_id,
    messageId: row.message_id || null,
    sourceType: row.source_type,
    sourceId: row.source_id || null,
    category: row.category,
    title: row.title,
    previewText: row.preview_text || null,
    body: row.body,
    senderDisplayName: row.sender_display_name,
    messageType: row.message_type,
    priority: row.priority,
    relatedEntityType: row.related_entity_type || null,
    relatedEntityId: row.related_entity_id || null,
    callToActionLabel: row.call_to_action_label || null,
    callToActionUrl: row.call_to_action_url || null,
    readAt: row.read_at || null,
    archivedAt: row.archived_at || null,
    createdAt: row.created_at,
    unread: !row.read_at,
  };
}

async function insertNotification(client, input) {
  const result = await client.query(
    `INSERT INTO blessboard.member_notifications (
       church_id, member_id, message_id, source_type, source_id, category,
       title, preview_text, body, sender_display_name, message_type, priority,
       related_entity_type, related_entity_id, call_to_action_label, call_to_action_url
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
     )
     ON CONFLICT DO NOTHING
     RETURNING id, church_id, member_id, message_id, source_type, source_id, category,
               title, preview_text, body, sender_display_name, message_type, priority,
               related_entity_type, related_entity_id, call_to_action_label,
               call_to_action_url, read_at, archived_at, created_at`,
    [
      input.churchId,
      input.memberId,
      input.messageId || null,
      input.sourceType,
      input.sourceId || null,
      input.category,
      input.title,
      input.previewText || null,
      input.body,
      input.senderDisplayName,
      input.messageType,
      input.priority || "normal",
      input.relatedEntityType || null,
      input.relatedEntityId || null,
      input.callToActionLabel || null,
      input.callToActionUrl || null,
    ]
  );
  return mapNotification(result.rows[0] || null);
}

async function listForMember(client, opts) {
  const params = [opts.churchId, opts.memberId];
  const clauses = [
    "n.church_id = $1",
    "n.member_id = $2",
    "n.archived_at IS NULL",
  ];

  if (opts.category && opts.category !== "all") {
    params.push(opts.category);
    clauses.push(`n.category = $${params.length}`);
  }
  if (opts.unreadOnly) {
    clauses.push("n.read_at IS NULL");
  }

  const limit = Math.min(Math.max(Number(opts.limit) || 30, 1), 100);
  const offset = Math.max(Number(opts.offset) || 0, 0);
  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const where = clauses.join(" AND ");
  const countResult = await client.query(
    `SELECT count(*)::int AS n FROM blessboard.member_notifications n WHERE ${where}`,
    params.slice(0, params.length - 2)
  );
  const unreadResult = await client.query(
    `SELECT count(*)::int AS n
       FROM blessboard.member_notifications n
      WHERE n.church_id = $1 AND n.member_id = $2
        AND n.archived_at IS NULL AND n.read_at IS NULL`,
    [opts.churchId, opts.memberId]
  );
  const listResult = await client.query(
    `SELECT n.id, n.church_id, n.member_id, n.message_id, n.source_type, n.source_id,
            n.category, n.title, n.preview_text, n.body, n.sender_display_name,
            n.message_type, n.priority, n.related_entity_type, n.related_entity_id,
            n.call_to_action_label, n.call_to_action_url, n.read_at, n.archived_at,
            n.created_at
       FROM blessboard.member_notifications n
      WHERE ${where}
      ORDER BY n.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );
  return {
    total: Number(countResult.rows[0] && countResult.rows[0].n) || 0,
    unreadCount: Number(unreadResult.rows[0] && unreadResult.rows[0].n) || 0,
    items: listResult.rows.map(mapNotification),
  };
}

async function getForMember(client, { churchId, memberId, notificationId }) {
  const result = await client.query(
    `SELECT id, church_id, member_id, message_id, source_type, source_id, category,
            title, preview_text, body, sender_display_name, message_type, priority,
            related_entity_type, related_entity_id, call_to_action_label,
            call_to_action_url, read_at, archived_at, created_at
       FROM blessboard.member_notifications
      WHERE id = $1 AND church_id = $2 AND member_id = $3`,
    [notificationId, churchId, memberId]
  );
  return mapNotification(result.rows[0] || null);
}

async function markRead(client, { churchId, memberId, notificationId }) {
  const result = await client.query(
    `UPDATE blessboard.member_notifications
        SET read_at = coalesce(read_at, now())
      WHERE id = $1 AND church_id = $2 AND member_id = $3 AND archived_at IS NULL
      RETURNING id, church_id, member_id, message_id, source_type, source_id, category,
                title, preview_text, body, sender_display_name, message_type, priority,
                related_entity_type, related_entity_id, call_to_action_label,
                call_to_action_url, read_at, archived_at, created_at`,
    [notificationId, churchId, memberId]
  );
  return mapNotification(result.rows[0] || null);
}

async function markUnread(client, { churchId, memberId, notificationId }) {
  const result = await client.query(
    `UPDATE blessboard.member_notifications
        SET read_at = NULL
      WHERE id = $1 AND church_id = $2 AND member_id = $3 AND archived_at IS NULL
      RETURNING id, church_id, member_id, message_id, source_type, source_id, category,
                title, preview_text, body, sender_display_name, message_type, priority,
                related_entity_type, related_entity_id, call_to_action_label,
                call_to_action_url, read_at, archived_at, created_at`,
    [notificationId, churchId, memberId]
  );
  return mapNotification(result.rows[0] || null);
}

async function markAllRead(client, { churchId, memberId }) {
  const result = await client.query(
    `UPDATE blessboard.member_notifications
        SET read_at = coalesce(read_at, now())
      WHERE church_id = $1 AND member_id = $2
        AND archived_at IS NULL AND read_at IS NULL`,
    [churchId, memberId]
  );
  return { updated: result.rowCount || 0 };
}

async function archive(client, { churchId, memberId, notificationId }) {
  const result = await client.query(
    `UPDATE blessboard.member_notifications
        SET archived_at = coalesce(archived_at, now()),
            read_at = coalesce(read_at, now())
      WHERE id = $1 AND church_id = $2 AND member_id = $3
      RETURNING id, church_id, member_id, message_id, source_type, source_id, category,
                title, preview_text, body, sender_display_name, message_type, priority,
                related_entity_type, related_entity_id, call_to_action_label,
                call_to_action_url, read_at, archived_at, created_at`,
    [notificationId, churchId, memberId]
  );
  return mapNotification(result.rows[0] || null);
}

module.exports = {
  mapNotification,
  insertNotification,
  listForMember,
  getForMember,
  markRead,
  markUnread,
  markAllRead,
  archive,
};
