"use strict";

const { hashMemberPassword, verifyMemberPassword } = require("./memberAuth");
const {
  normalizeSecurityVersion,
  stampSecurityVersion,
  sessionMatchesSecurityVersion,
  rejectStaleSecuritySession,
} = require("./accountSecurityVersion");

const SESSION_KEY = "churchLeader";

/**
 * @returns {{ leader_id: number, organization_id: number, branch_id: number, ministry_id: number | null, full_name: string, role: string, status: string, security_version: number } | null}
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
    security_version: normalizeSecurityVersion(s.security_version),
  };
}

function setChurchLeaderSession(req, payload) {
  if (!req.session) return;
  const prev = req.session[SESSION_KEY];
  req.session[SESSION_KEY] = stampSecurityVersion(
    {
      leader_id: payload.leader_id,
      organization_id: payload.organization_id,
      branch_id: payload.branch_id,
      ministry_id: payload.ministry_id ?? null,
      full_name: payload.full_name,
      role: payload.role,
      status: payload.status,
    },
    payload,
    prev && prev.security_version
  );
}

function clearChurchLeaderSession(req) {
  if (req.session && req.session[SESSION_KEY]) {
    delete req.session[SESSION_KEY];
  }
}

async function requireChurchLeaderSession(req, res, next) {
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

  try {
    const { getPgPool } = require("../db/pg");
    const ministryLeadersRepo = require("../db/pg/church/ministryLeadersRepo");
    const { wantsJson } = require("./churchFailureStates");
    const pool = getPgPool();
    if (!pool) {
      req.churchLeader = leader;
      return next();
    }
    const row = await ministryLeadersRepo.findLeaderById(pool, leader.leader_id);
    if (!row || row.status !== "active" || Number(row.branch_id) !== Number(leader.branch_id)) {
      clearChurchLeaderSession(req);
      return res.redirect("/leader/login");
    }
    if (!sessionMatchesSecurityVersion(leader, row)) {
      return rejectStaleSecuritySession(req, res, {
        loginPath: "/leader/login",
        clearFn: clearChurchLeaderSession,
        wantsJson,
      });
    }
    req.churchLeader = stampSecurityVersion(
      {
        leader_id: row.id,
        organization_id: row.organization_id,
        branch_id: row.branch_id,
        ministry_id: row.ministry_id || null,
        full_name: row.full_name,
        role: row.role || "ministry_leader",
        status: row.status,
      },
      row
    );
    return next();
  } catch (err) {
    return next(err);
  }
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
