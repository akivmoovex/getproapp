"use strict";

const STATUS_LABELS = {
  submitted: "Submitted",
  reviewed: "Reviewed",
  reset_completed: "Reset Completed",
  rejected: "Rejected",
};

const TYPE_LABELS = {
  member: "Member",
  ministry_leader: "Ministry Leader",
  branch_admin: "Branch Admin",
  hq_admin: "HQ Admin",
};

function getResetRequestStatusLabel(status) {
  return STATUS_LABELS[String(status || "")] || String(status || "");
}

function getResetRequestStatusClass(status) {
  const map = {
    submitted: "church-status-submitted",
    reviewed: "church-status-reviewed",
    reset_completed: "church-status-completed",
    rejected: "church-status-rejected",
  };
  return map[String(status || "")] || "church-status-submitted";
}

function getResetRequestTypeLabel(type) {
  return TYPE_LABELS[String(type || "")] || String(type || "");
}

function getResetRequestTypeClass(type) {
  const map = {
    member: "church-type-member",
    ministry_leader: "church-type-ministry-leader",
    branch_admin: "church-type-branch-admin",
    hq_admin: "church-type-hq-admin",
  };
  return map[String(type || "")] || "church-type-member";
}

function formatResetRequestCounts(counts) {
  const c = counts && typeof counts === "object" ? counts : {};
  const member = Number(c.member) || 0;
  const ministryLeader = Number(c.ministry_leader) || 0;
  const branchAdmin = Number(c.branch_admin) || 0;
  const hqAdmin = Number(c.hq_admin) || 0;
  const submittedTotal =
    Number(c.submitted_total) ||
    Number(c.pending_total) ||
    Number(c.submitted) ||
    member + ministryLeader + branchAdmin + hqAdmin;
  return {
    submitted_total: submittedTotal,
    member,
    ministry_leader: ministryLeader,
    branch_admin: branchAdmin,
    hq_admin: hqAdmin,
  };
}

module.exports = {
  getResetRequestStatusLabel,
  getResetRequestStatusClass,
  getResetRequestTypeLabel,
  getResetRequestTypeClass,
  formatResetRequestCounts,
};
