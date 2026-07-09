"use strict";

const {
  hashMemberPassword,
  verifyMemberPassword,
} = require("./memberAuth");

const SESSION_KEY = "churchLeader";

/**
 * @returns {{ leader_id: number, organization_id: number, branch_id: number, ministry_id: number | null, full_name: string, role: string, status: string } | null}
 */
function getChurchLeaderSession(req) {
  const s = req.session && req.session[SESSION_KEY];
  if (!s || typeof s.leader_id !== "number" || typeof s.branch_id !== "number") {
    return null;
  }
  return {
    leader_id: s.leader_id,
    organization_id: s.organization_id,
    branch_id: s.branch_id,
    ministry_id: s.ministry_id != null ? Number(s.ministry_id) : null,
    full_name: String(s.full_name || ""),
    role: String(s.role || ""),
    status: String(s.status || ""),
  };
}

function setChurchLeaderSession(req, payload) {
  if (!req.session) return;
  req.session[SESSION_KEY] = {
    leader_id: payload.leader_id,
    organization_id: payload.organization_id,
    branch_id: payload.branch_id,
    ministry_id: payload.ministry_id ?? null,
    full_name: payload.full_name,
    role: payload.role,
    status: payload.status,
  };
}

function clearChurchLeaderSession(req) {
  if (req.session && req.session[SESSION_KEY]) {
    delete req.session[SESSION_KEY];
  }
}

function requireChurchLeaderSession(req, res, next) {
  const leader = getChurchLeaderSession(req);
  if (!leader) {
    return res.redirect("/leader/login");
  }
  const branch = req.churchContext && req.churchContext.branch;
  if (!branch || Number(branch.id) !== Number(leader.branch_id)) {
    clearChurchLeaderSession(req);
    return res.redirect("/leader/login");
  }
  if (leader.status !== "active") {
    clearChurchLeaderSession(req);
    return res.redirect("/leader/login");
  }
  req.churchLeader = leader;
  return next();
}

module.exports = {
  SESSION_KEY,
  getChurchLeaderSession,
  setChurchLeaderSession,
  clearChurchLeaderSession,
  requireChurchLeaderSession,
  hashLeaderPassword: hashMemberPassword,
  verifyLeaderPassword: verifyMemberPassword,
};
