"use strict";

/**
 * Safe, redacted pastoral/welfare notifications.
 * Never includes case titles, note bodies, or welfare narratives.
 */

const notificationRepo = require("../repositories/memberNotificationRepository");

const SAFE_TITLES = Object.freeze({
  "pastoral.case.created": "Pastoral care update",
  "pastoral.case.assigned": "Pastoral care update",
  "pastoral.case.escalated": "Pastoral care update",
  "pastoral.case.closed": "Pastoral care update",
  "welfare.request.created": "Welfare update",
  "welfare.request.approved": "Welfare update",
  "welfare.request.rejected": "Welfare update",
  "welfare.distribution.recorded": "Welfare update",
});

const SAFE_BODIES = Object.freeze({
  "pastoral.case.created": "A pastoral care item was recorded.",
  "pastoral.case.assigned": "A pastoral care assignment was updated.",
  "pastoral.case.escalated": "A pastoral care item was escalated.",
  "pastoral.case.closed": "A pastoral care item was closed.",
  "welfare.request.created": "A welfare assistance request was submitted.",
  "welfare.request.approved": "A welfare assistance request was approved.",
  "welfare.request.rejected": "A welfare assistance request was rejected.",
  "welfare.distribution.recorded": "A welfare distribution was recorded.",
});

async function notifyPastoralSafe(client, input) {
  const memberId = input.memberId ? String(input.memberId).trim() : "";
  const churchId = String(input.churchId || "").trim();
  const eventKey = String(input.eventKey || "").trim();
  if (!memberId || !churchId || !SAFE_TITLES[eventKey]) {
    return { ok: false, skipped: true };
  }

  const member = await client.query(
    `SELECT id FROM blessboard.members WHERE id = $1 AND church_id = $2 AND status = 'active' LIMIT 1`,
    [memberId, churchId]
  );
  if (!member.rows[0]) return { ok: false, skipped: true };

  try {
    await notificationRepo.insertNotification(client, {
      churchId,
      memberId,
      sourceType: "system",
      sourceId: null,
      category: "administrative",
      title: SAFE_TITLES[eventKey],
      previewText: SAFE_BODIES[eventKey],
      body: SAFE_BODIES[eventKey],
      senderDisplayName: "BlessBoard",
      messageType: "administrative_notice",
      priority: "normal",
      relatedEntityType: null,
      relatedEntityId: null,
    });
    return { ok: true };
  } catch {
    return { ok: false, skipped: true };
  }
}

module.exports = {
  SAFE_TITLES,
  SAFE_BODIES,
  notifyPastoralSafe,
};
