"use strict";

const ORG_BRANCH_STATUSES = ["active", "suspended", "archived"];
const REASON_MIN_LENGTH = 3;
const REASON_MAX_LENGTH = 2000;

function normalizeStatusReason(raw) {
  return String(raw || "")
    .trim()
    .slice(0, REASON_MAX_LENGTH);
}

function validateSuspendBody(body) {
  const reason = normalizeStatusReason(body && body.status_reason);
  if (reason.length < REASON_MIN_LENGTH) {
    return {
      ok: false,
      error: "Please enter a reason for suspending (at least 3 characters).",
      reason,
    };
  }
  return { ok: true, reason };
}

function validateArchiveBody(body) {
  const reason = normalizeStatusReason(body && body.status_reason);
  if (reason.length < REASON_MIN_LENGTH) {
    return {
      ok: false,
      error: "Please enter a reason for archiving (at least 3 characters).",
      reason,
    };
  }
  return { ok: true, reason };
}

function validateReactivateBody(body) {
  const reason = normalizeStatusReason(body && body.status_reason);
  return { ok: true, reason: reason || null };
}

function validateAdminDeactivateBody(body) {
  const reason = normalizeStatusReason(body && (body.status_reason || body.reason));
  if (reason.length < REASON_MIN_LENGTH) {
    return {
      ok: false,
      error: "Please enter a reason for deactivating (at least 3 characters).",
      reason,
    };
  }
  return { ok: true, reason };
}

function validateAdminActivateBody(body) {
  const reason = normalizeStatusReason(body && (body.status_reason || body.reason));
  return { ok: true, reason: reason || null };
}

function assertCanSuspendOrganization(org) {
  if (!org) return { ok: false, error: "Organization not found." };
  if (org.status !== "active") {
    return { ok: false, error: "Only active organizations can be suspended." };
  }
  return { ok: true };
}

function assertCanArchiveOrganization(org) {
  if (!org) return { ok: false, error: "Organization not found." };
  if (org.status === "archived") {
    return { ok: false, error: "Organization is already archived." };
  }
  if (org.status === "active") {
    return { ok: false, error: "Suspend the organization before archiving." };
  }
  if (org.status !== "suspended") {
    return { ok: false, error: "Only suspended organizations can be archived." };
  }
  return { ok: true };
}

function assertCanReactivateOrganization(org) {
  if (!org) return { ok: false, error: "Organization not found." };
  if (org.status === "archived") {
    return {
      ok: false,
      error: "Archived organizations cannot be reactivated in this release.",
    };
  }
  if (org.status !== "suspended") {
    return { ok: false, error: "Only suspended organizations can be reactivated." };
  }
  return { ok: true };
}

function assertCanSuspendBranch(branch) {
  if (!branch) return { ok: false, error: "Branch not found." };
  if (branch.status !== "active") {
    return { ok: false, error: "Only active branches can be suspended." };
  }
  return { ok: true };
}

function assertCanArchiveBranch(branch) {
  if (!branch) return { ok: false, error: "Branch not found." };
  if (branch.status === "archived") {
    return { ok: false, error: "Branch is already archived." };
  }
  if (branch.status === "active") {
    return { ok: false, error: "Suspend the branch before archiving." };
  }
  if (branch.status !== "suspended") {
    return { ok: false, error: "Only suspended branches can be archived." };
  }
  return { ok: true };
}

function assertCanReactivateBranch(branch) {
  if (!branch) return { ok: false, error: "Branch not found." };
  if (branch.status === "archived") {
    return {
      ok: false,
      error: "Archived branches cannot be reactivated in this release.",
    };
  }
  if (branch.status !== "suspended") {
    return { ok: false, error: "Only suspended branches can be reactivated." };
  }
  return { ok: true };
}

function parseOrganizationStatusFilter(raw) {
  const s = String(raw || "all")
    .trim()
    .toLowerCase();
  if (s === "all" || !s) return "all";
  if (ORG_BRANCH_STATUSES.includes(s)) return s;
  return "all";
}

function parseBranchStatusFilter(raw) {
  return parseOrganizationStatusFilter(raw);
}

module.exports = {
  ORG_BRANCH_STATUSES,
  REASON_MIN_LENGTH,
  REASON_MAX_LENGTH,
  normalizeStatusReason,
  validateSuspendBody,
  validateArchiveBody,
  validateReactivateBody,
  validateAdminDeactivateBody,
  validateAdminActivateBody,
  assertCanSuspendOrganization,
  assertCanArchiveOrganization,
  assertCanReactivateOrganization,
  assertCanSuspendBranch,
  assertCanArchiveBranch,
  assertCanReactivateBranch,
  parseOrganizationStatusFilter,
  parseBranchStatusFilter,
};
