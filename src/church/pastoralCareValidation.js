"use strict";

const CONTACT_ATTEMPTS = [
  { value: "phone_call", label: "Phone call" },
  { value: "visit", label: "Visit" },
  { value: "email", label: "Email" },
  { value: "text_message", label: "Text message" },
  { value: "other", label: "Other" },
];

function parseOptionalDate(value, label) {
  const raw = String(value || "").trim();
  if (!raw) return { ok: true, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { ok: false, error: `Please enter a valid ${label}.` };
  }
  return { ok: true, value: raw };
}

function validateAssignPrayerBody(body) {
  const assigneeId = Number.parseInt(String(body.assigned_admin_id || "").trim(), 10);
  if (!Number.isFinite(assigneeId) || assigneeId <= 0) {
    return { ok: false, error: "Please select a pastoral assignee." };
  }
  return { ok: true, data: { assigned_admin_id: assigneeId } };
}

function validatePrayerFollowUpBody(body) {
  const nextAction = String(body.next_action || "").trim().slice(0, 500);
  const adminComment = String(body.admin_comment || "").trim().slice(0, 2000);
  const due = parseOptionalDate(body.due_date, "due date");
  if (!due.ok) return due;
  if (!nextAction) {
    return { ok: false, error: "Please describe the next action." };
  }
  return { ok: true, data: { next_action: nextAction, due_date: due.value, admin_comment: adminComment } };
}

function validatePrayerCloseBody(body) {
  const closureOutcome = String(body.closure_outcome || "").trim().slice(0, 500);
  const closureReason = String(body.closure_reason || "").trim().slice(0, 2000);
  const adminComment = String(body.admin_comment || "").trim().slice(0, 2000);
  if (!closureOutcome) {
    return { ok: false, error: "Please enter a closure outcome." };
  }
  return {
    ok: true,
    data: { closure_outcome: closureOutcome, closure_reason: closureReason, admin_comment: adminComment },
  };
}

function validateOpenPastoralCaseBody(body) {
  const memberId = Number.parseInt(String(body.member_id || "").trim(), 10);
  const title = String(body.title || "").trim().slice(0, 200);
  const summary = String(body.summary || "").trim().slice(0, 4000);
  const nextAction = String(body.next_action || "").trim().slice(0, 500);
  const assigneeRaw = String(body.assigned_admin_id || "").trim();
  const assigneeId = assigneeRaw ? Number.parseInt(assigneeRaw, 10) : null;
  const due = parseOptionalDate(body.due_date, "due date");
  const prayerRequestIdRaw = String(body.prayer_request_id || "").trim();
  const prayerRequestId = prayerRequestIdRaw ? Number.parseInt(prayerRequestIdRaw, 10) : null;
  if (!due.ok) return due;
  if (!Number.isFinite(memberId) || memberId <= 0) {
    return { ok: false, error: "Please select a member." };
  }
  if (!title) return { ok: false, error: "Please enter a case title." };
  return {
    ok: true,
    data: {
      member_id: memberId,
      title,
      summary,
      next_action: nextAction,
      assigned_admin_id: Number.isFinite(assigneeId) && assigneeId > 0 ? assigneeId : null,
      due_date: due.value,
      prayer_request_id: Number.isFinite(prayerRequestId) && prayerRequestId > 0 ? prayerRequestId : null,
    },
  };
}

function validateCaseFollowUpBody(body) {
  const contactAttempt = String(body.contact_attempt || "").trim();
  const outcome = String(body.outcome || "").trim().slice(0, 1000);
  const nextAction = String(body.next_action || "").trim().slice(0, 500);
  const notes = String(body.notes || "").trim().slice(0, 4000);
  const due = parseOptionalDate(body.due_date, "due date");
  if (!due.ok) return due;
  if (!CONTACT_ATTEMPTS.some((c) => c.value === contactAttempt)) {
    return { ok: false, error: "Please select a contact attempt type." };
  }
  if (!outcome) return { ok: false, error: "Please enter the contact outcome." };
  return {
    ok: true,
    data: { contact_attempt: contactAttempt, outcome, next_action: nextAction, notes, due_date: due.value },
  };
}

function validateClosePastoralCaseBody(body) {
  const outcome = String(body.outcome || "").trim().slice(0, 1000);
  const closureReason = String(body.closure_reason || "").trim().slice(0, 2000);
  if (!outcome) return { ok: false, error: "Please enter a case outcome." };
  return { ok: true, data: { outcome, closure_reason: closureReason } };
}

function validateSafeguardingIncidentBody(body) {
  const summary = String(body.summary || "").trim().slice(0, 4000);
  const memberIdRaw = String(body.member_id || "").trim();
  const memberId = memberIdRaw ? Number.parseInt(memberIdRaw, 10) : null;
  if (!summary || summary.length < 10) {
    return { ok: false, error: "Please provide an incident summary (at least 10 characters)." };
  }
  return {
    ok: true,
    data: {
      summary,
      member_id: Number.isFinite(memberId) && memberId > 0 ? memberId : null,
    },
  };
}

function pastoralCaseStatusLabel(status) {
  const map = {
    open: "Open",
    in_follow_up: "In follow-up",
    closed: "Closed",
    paused: "Paused",
    pending_supervisor_ack: "Pending supervisor acknowledgement",
    escalated: "Escalated",
  };
  return map[status] || status;
}

module.exports = {
  CONTACT_ATTEMPTS,
  validateAssignPrayerBody,
  validatePrayerFollowUpBody,
  validatePrayerCloseBody,
  validateOpenPastoralCaseBody,
  validateCaseFollowUpBody,
  validateClosePastoralCaseBody,
  validateSafeguardingIncidentBody,
  pastoralCaseStatusLabel,
};
