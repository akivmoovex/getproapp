"use strict";

/**
 * Safe, redacted journey notifications for linked members.
 * Never includes phone, email, notes, return reasons, or referral text.
 */

const notificationRepo = require("../repositories/memberNotificationRepository");

const SAFE_TITLES = Object.freeze({
  "journey.handover.submitted": "Journey update",
  "journey.handover.accepted": "Journey update",
  "journey.handover.returned": "Journey update",
  "journey.handover.assigned": "Journey update",
  "class.member.enrolled": "Class update",
  "class.completion.approved": "Class update",
  "cell.member.transferred": "Cell update",
  "cell.member.assigned": "Cell update",
});

const SAFE_BODIES = Object.freeze({
  "journey.handover.submitted": "A journey step was submitted for review.",
  "journey.handover.accepted": "A journey step was accepted.",
  "journey.handover.returned": "A journey step needs attention.",
  "journey.handover.assigned": "A journey step was assigned.",
  "class.member.enrolled": "You were enrolled in a class.",
  "class.completion.approved": "A class completion was recorded.",
  "cell.member.transferred": "Your cell assignment was updated.",
  "cell.member.assigned": "You were assigned to a cell.",
});

/**
 * @param {{ query: Function }} client
 * @param {{
 *   churchId: string,
 *   memberId: string | null | undefined,
 *   eventKey: string,
 *   branchId?: string | null,
 * }} input
 */
async function notifyLinkedMemberSafe(client, input) {
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
  notifyLinkedMemberSafe,
};
