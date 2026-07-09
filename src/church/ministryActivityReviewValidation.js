"use strict";

const REVIEW_STATUSES = ["submitted", "reviewed", "follow_up_requested"];

function reviewStatusLabel(status) {
  const map = {
    submitted: "Submitted",
    reviewed: "Reviewed",
    follow_up_requested: "Follow-up requested",
  };
  return map[status] || status;
}

function validateMarkReviewedBody(body) {
  const adminComment = String((body && body.admin_comment) || "").trim().slice(0, 2000);
  return { ok: true, adminComment: adminComment || null };
}

function validateFollowUpBody(body) {
  const adminComment = String((body && body.admin_comment) || "").trim().slice(0, 2000);
  if (!adminComment) {
    return { ok: false, error: "Admin comment is required when requesting follow-up.", adminComment: "" };
  }
  return { ok: true, adminComment };
}

module.exports = {
  REVIEW_STATUSES,
  reviewStatusLabel,
  validateMarkReviewedBody,
  validateFollowUpBody,
};
