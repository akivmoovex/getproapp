"use strict";

const REQUEST_STATUS_TRANSITIONS = {
  submitted: ["in_review", "approved", "rejected", "more_info_needed"],
  in_review: ["approved", "rejected", "more_info_needed"],
  approved: ["completed"],
  more_info_needed: ["in_review"],
  rejected: [],
  completed: [],
};

const PRAYER_STATUS_TRANSITIONS = {
  submitted: ["reviewed", "closed"],
  reviewed: ["closed"],
  closed: [],
};

const MEMBER_REQUEST_ACTIONS = {
  "start-review": { status: "in_review", audit: "member_request_in_review", commentRequired: false },
  approve: { status: "approved", audit: "member_request_approved", commentRequired: false },
  reject: { status: "rejected", audit: "member_request_rejected", commentRequired: true },
  "request-more-info": { status: "more_info_needed", audit: "member_request_more_info_requested", commentRequired: true },
  complete: { status: "completed", audit: "member_request_completed", commentRequired: false },
};

function memberRequestStatusLabel(status) {
  const map = {
    submitted: "Submitted",
    in_review: "In review",
    more_info_needed: "More info needed",
    approved: "Approved",
    rejected: "Rejected",
    completed: "Completed",
  };
  return map[status] || status;
}

function prayerRequestStatusLabel(status) {
  const map = {
    submitted: "Submitted",
    reviewed: "Reviewed",
    closed: "Closed",
  };
  return map[status] || status;
}

function privacyLevelLabel(level) {
  const map = {
    private_to_pastor: "Private to pastor",
    prayer_team: "Prayer team",
    anonymous_summary: "Anonymous summary",
  };
  return map[level] || level;
}

function canTransitionRequest(fromStatus, toStatus) {
  const allowed = REQUEST_STATUS_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
}

function canTransitionPrayer(fromStatus, toStatus) {
  const allowed = PRAYER_STATUS_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
}

/**
 * Mask member identity for anonymous_summary for all branch admins in MVP.
 */
function showPrayerMemberIdentity(row, adminRole) {
  if (!row) return false;
  if (row.privacy_level === "anonymous_summary") return false;
  return true;
}

function showPrayerDetails(row, adminRole) {
  if (!row) return false;
  return true;
}

function resolveMemberRequestAction(action) {
  return MEMBER_REQUEST_ACTIONS[action] || null;
}

module.exports = {
  REQUEST_STATUS_TRANSITIONS,
  PRAYER_STATUS_TRANSITIONS,
  MEMBER_REQUEST_ACTIONS,
  memberRequestStatusLabel,
  prayerRequestStatusLabel,
  privacyLevelLabel,
  canTransitionRequest,
  canTransitionPrayer,
  showPrayerMemberIdentity,
  showPrayerDetails,
  resolveMemberRequestAction,
};
