"use strict";

const JOIN_REQUEST_STATUSES = ["submitted", "approved", "rejected", "more_info_needed"];
const MEMBER_VISIBLE_VISIBILITIES = ["public", "members", "leaders"];

const JOIN_REQUEST_FILTERS = ["all", "submitted", "approved", "rejected", "more_info_needed"];

const LEADER_RECOMMENDATIONS = ["recommend_approval", "do_not_recommend", "more_info_needed"];
const LEADER_REVIEW_FILTERS = [
  "all",
  "not_reviewed",
  "recommend_approval",
  "do_not_recommend",
  "more_info_needed",
];

function joinRequestStatusLabel(status) {
  const map = {
    submitted: "Submitted",
    approved: "Approved",
    rejected: "Rejected",
    more_info_needed: "More info needed",
  };
  return map[status] || status;
}

function leaderRecommendationLabel(value) {
  const map = {
    recommend_approval: "Recommend approval",
    do_not_recommend: "Do not recommend",
    more_info_needed: "More info needed",
  };
  return map[value] || "Not reviewed";
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

function validateLeaderJoinRecommendationBody(body) {
  const recommendation = String((body && body.recommendation) || "").trim();
  const leaderComment = String((body && body.leader_comment) || "").trim().slice(0, 2000);
  const form = { recommendation, leader_comment: leaderComment };
  if (!LEADER_RECOMMENDATIONS.includes(recommendation)) {
    return { ok: false, error: "Please choose a valid recommendation.", form };
  }
  if (
    (recommendation === "do_not_recommend" || recommendation === "more_info_needed") &&
    !leaderComment
  ) {
    return { ok: false, error: "Please enter a comment for this recommendation.", form };
  }
  return {
    ok: true,
    data: { recommendation, leader_comment: leaderComment || null },
    form,
  };
}

function canLeaderReviewJoinRequest(status) {
  return status === "submitted" || status === "more_info_needed";
}

module.exports = {
  JOIN_REQUEST_STATUSES,
  JOIN_REQUEST_FILTERS,
  LEADER_RECOMMENDATIONS,
  LEADER_REVIEW_FILTERS,
  MEMBER_VISIBLE_VISIBILITIES,
  joinRequestStatusLabel,
  leaderRecommendationLabel,
  memberRelationshipStatusLabel,
  isMinistryVisibleToMember,
  resolveMemberRelationshipStatus,
  canMemberRequestJoin,
  canLeaderReviewJoinRequest,
  validateJoinRequestBody,
  validateJoinRequestReviewComment,
  validateLeaderJoinRecommendationBody,
};
