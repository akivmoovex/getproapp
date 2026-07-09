"use strict";

const JOIN_REQUEST_STATUSES = ["submitted", "approved", "rejected", "more_info_needed"];
const MEMBER_VISIBLE_VISIBILITIES = ["public", "members", "leaders"];

const JOIN_REQUEST_FILTERS = ["all", "submitted", "approved", "rejected", "more_info_needed"];

function joinRequestStatusLabel(status) {
  const map = {
    submitted: "Submitted",
    approved: "Approved",
    rejected: "Rejected",
    more_info_needed: "More info needed",
  };
  return map[status] || status;
}

function memberRelationshipStatusLabel(status) {
  const map = {
    active: "Active",
    submitted: "Request submitted",
    more_info_needed: "More info needed",
    rejected: "Request rejected",
    not_joined: "Not joined",
  };
  return map[status] || status;
}

function isMinistryVisibleToMember(ministry) {
  if (!ministry) return false;
  if (ministry.status !== "published") return false;
  return MEMBER_VISIBLE_VISIBILITIES.includes(ministry.visibility);
}

function resolveMemberRelationshipStatus(activeMembership, openRequest, latestRequest) {
  if (activeMembership) return "active";
  if (openRequest) return openRequest.status;
  if (latestRequest && latestRequest.status === "rejected") return "rejected";
  return "not_joined";
}

function canMemberRequestJoin(relationshipStatus) {
  return relationshipStatus === "not_joined" || relationshipStatus === "rejected";
}

function validateJoinRequestBody(body) {
  const message = String((body && body.message) || "").trim().slice(0, 2000);
  return { ok: true, data: { message: message || null }, form: { message } };
}

function validateJoinRequestReviewComment(body, { required }) {
  const adminComment = String((body && body.admin_comment) || "").trim().slice(0, 2000);
  if (required && !adminComment) {
    return { ok: false, error: "Please enter a comment for this action." };
  }
  return { ok: true, adminComment };
}

module.exports = {
  JOIN_REQUEST_STATUSES,
  JOIN_REQUEST_FILTERS,
  MEMBER_VISIBLE_VISIBILITIES,
  joinRequestStatusLabel,
  memberRelationshipStatusLabel,
  isMinistryVisibleToMember,
  resolveMemberRelationshipStatus,
  canMemberRequestJoin,
  validateJoinRequestBody,
  validateJoinRequestReviewComment,
};
