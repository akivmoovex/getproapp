"use strict";

const { setChurchMemberSession, clearChurchMemberSession, getChurchMemberSession } = require("./memberAuth");
const { setChurchLeaderSession, clearChurchLeaderSession, getChurchLeaderSession } = require("./leaderAuth");
const {
  setChurchBranchAdminSession,
  clearChurchBranchAdminSession,
  getChurchBranchAdminSession,
} = require("./branchAdminAuth");
const { setChurchHqAdminSession, clearChurchHqAdminSession, getChurchHqAdminSession } = require("./hqAuth");
const { destinationForRole } = require("../services/church/tenantUnifiedLoginService");

const PORTAL_CHOICE_KEY = "churchPortalChoice";
/** Short-lived authenticated role-choice window (ms). */
const PORTAL_CHOICE_TTL_MS = 15 * 60 * 1000;

function clearAllChurchRoleSessions(req) {
  clearChurchMemberSession(req);
  clearChurchLeaderSession(req);
  clearChurchBranchAdminSession(req);
  clearChurchHqAdminSession(req);
  clearPortalChoice(req);
}

function applyRoleSession(req, role) {
  if (!role || !role.type) return;
  if (role.type === "member") {
    setChurchMemberSession(req, role.sessionPayload);
    return;
  }
  if (role.type === "ministry_leader") {
    setChurchLeaderSession(req, role.sessionPayload);
    return;
  }
  if (role.type === "branch_admin") {
    setChurchBranchAdminSession(req, role.sessionPayload);
    return;
  }
  if (role.type === "hq_admin") {
    setChurchHqAdminSession(req, role.sessionPayload);
  }
}

/**
 * Store only safe server-derived portal candidates (no credentials / hashes / session payloads).
 * Call only after session regeneration.
 */
function storePortalChoice(req, { roles, organizationId, branchId }) {
  if (!req.session) return;
  const safeRoles = (roles || []).map((r) => ({
    type: r.type,
    accountId: Number(r.accountId),
    status: r.status || null,
    label: r.label || r.type,
    destination: destinationForRole(r),
  }));
  req.session[PORTAL_CHOICE_KEY] = {
    organization_id: Number(organizationId),
    branch_id: Number(branchId),
    roles: safeRoles,
    created_at: Date.now(),
    expires_at: Date.now() + PORTAL_CHOICE_TTL_MS,
  };
}

function getPortalChoice(req) {
  const raw = req.session && req.session[PORTAL_CHOICE_KEY];
  if (!raw || !Array.isArray(raw.roles) || raw.roles.length < 2) return null;
  const expiresAt = Number(raw.expires_at || 0);
  const createdAt = Number(raw.created_at || 0);
  const expired =
    (expiresAt > 0 && Date.now() > expiresAt) ||
    (expiresAt <= 0 && Date.now() - createdAt > PORTAL_CHOICE_TTL_MS);
  if (expired) {
    delete req.session[PORTAL_CHOICE_KEY];
    return null;
  }
  // Reject any accidental credential-shaped fields if present in older sessions.
  for (const role of raw.roles) {
    if (role && (role.password != null || role.password_hash != null || role.sessionPayload != null)) {
      delete req.session[PORTAL_CHOICE_KEY];
      return null;
    }
  }
  return raw;
}

/**
 * Read and immediately clear portal-choice state (prevents replay).
 */
function consumePortalChoice(req) {
  const choice = getPortalChoice(req);
  clearPortalChoice(req);
  return choice;
}

function clearPortalChoice(req) {
  if (req.session) delete req.session[PORTAL_CHOICE_KEY];
}

/**
 * If already signed in for this host, return destination; else null.
 */
function existingSessionDestination(req) {
  const org = req.churchContext && req.churchContext.organization;
  const branch = req.churchContext && req.churchContext.branch;
  if (!org || !branch) return null;

  const hq = getChurchHqAdminSession(req);
  if (hq && Number(hq.organization_id) === Number(org.id)) {
    return "/hq/dashboard";
  }

  const branchAdmin = getChurchBranchAdminSession(req);
  if (
    branchAdmin &&
    Number(branchAdmin.organization_id) === Number(org.id) &&
    Number(branchAdmin.branch_id) === Number(branch.id)
  ) {
    return "/branch/dashboard";
  }

  const leader = getChurchLeaderSession(req);
  if (
    leader &&
    Number(leader.organization_id) === Number(org.id) &&
    Number(leader.branch_id) === Number(branch.id)
  ) {
    return "/leader/dashboard";
  }

  const member = getChurchMemberSession(req);
  if (member && Number(member.branch_id) === Number(branch.id)) {
    if (member.status === "verified") return "/member/dashboard";
    if (member.status === "pending") return "/waiting-verification";
  }

  return null;
}

function allowedPortalTypes(choice) {
  return new Set((choice.roles || []).map((r) => r.type));
}

function findChosenRole(choice, roleType) {
  const type = String(roleType || "").trim();
  return (choice.roles || []).find((r) => r.type === type) || null;
}

function portalChoiceContainsSecrets(choice) {
  if (!choice || !Array.isArray(choice.roles)) return false;
  const blob = JSON.stringify(choice);
  return /password|password_hash|sessionPayload/i.test(blob);
}

module.exports = {
  PORTAL_CHOICE_KEY,
  PORTAL_CHOICE_TTL_MS,
  clearAllChurchRoleSessions,
  applyRoleSession,
  storePortalChoice,
  getPortalChoice,
  consumePortalChoice,
  clearPortalChoice,
  existingSessionDestination,
  allowedPortalTypes,
  findChosenRole,
  destinationForRole,
  portalChoiceContainsSecrets,
};
