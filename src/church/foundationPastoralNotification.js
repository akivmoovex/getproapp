"use strict";

/**
 * Notification subjects must never include prayer topics, names, or case details.
 * @param {string} kind
 */
function safePastoralNotificationSubject(kind) {
  const subjects = {
    prayer_submitted: "New prayer request received",
    prayer_acknowledged: "Prayer request acknowledged",
    prayer_assigned: "Prayer request assigned",
    prayer_follow_up: "Prayer follow-up scheduled",
    prayer_closed: "Prayer request closed",
    pastoral_case_opened: "Pastoral case opened",
    pastoral_case_follow_up: "Pastoral follow-up recorded",
    pastoral_case_closed: "Pastoral case closed",
    safeguarding_incident_opened: "Safeguarding incident recorded",
  };
  return subjects[kind] || "Pastoral care update";
}

/**
 * Strip confidential content from notification body previews.
 * @param {string} text
 */
function safePastoralNotificationPreview(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  return "A confidential pastoral item was updated. Sign in to view details.";
}

module.exports = {
  safePastoralNotificationSubject,
  safePastoralNotificationPreview,
};
