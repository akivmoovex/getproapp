"use strict";

const bcrypt = require("bcryptjs");
const {
  normalizeSecurityVersion,
  stampSecurityVersion,
  sessionMatchesSecurityVersion,
  rejectStaleSecuritySession,
} = require("./accountSecurityVersion");

const SESSION_KEY = "churchMember";

function getPgPoolSafe() {
  try {
    return require("../db/pg").getPgPool();
  } catch {
    return null;
  }
}

/**
 * @returns {{ member_id: number, organization_id: number, branch_id: number, status: string, full_name: string, security_version: number } | null}
 */
function getChurchMemberSession(req) {
  const s = req.session && req.session[SESSION_KEY];
  if (!s || typeof s.member_id !== "number" || typeof s.branch_id !== "number") {
    return null;
  }
  return {
    member_id: s.member_id,
    organization_id: s.organization_id,
    branch_id: s.branch_id,
    status: String(s.status || ""),
    full_name: String(s.full_name || ""),
    security_version: normalizeSecurityVersion(s.security_version),
  };
}

function setChurchMemberSession(req, payload) {
  if (!req.session) return;
  const prev = req.session[SESSION_KEY];
  req.session[SESSION_KEY] = stampSecurityVersion(
    {
      member_id: payload.member_id,
      organization_id: payload.organization_id,
      branch_id: payload.branch_id,
      status: payload.status,
      full_name: payload.full_name,
    },
    payload,
    prev && prev.security_version
  );
}

function clearChurchMemberSession(req) {
  if (req.session && req.session[SESSION_KEY]) {
    delete req.session[SESSION_KEY];
  }
}

function requireChurchMemberSession(req, res, next) {
  const member = getChurchMemberSession(req);
  if (!member) {
    const { wantsJson, renderChurchFailureState } = require("./churchFailureStates");
    if (wantsJson(req)) {
      return renderChurchFailureState(req, res, "unauthenticated", {
        shell: "member",
        forceJson: true,
      });
    }
    return res.redirect("/login");
  }
  const branch = req.churchContext && req.churchContext.branch;
  if (!branch || Number(branch.id) !== Number(member.branch_id)) {
    clearChurchMemberSession(req);
    return res.redirect("/login");
  }
  req.churchMember = member;
  return next();
}

function requireVerifiedMemberSession(req, res, next) {
  const member = getChurchMemberSession(req);
  if (!member) {
    return res.redirect("/login");
  }
  const branch = req.churchContext && req.churchContext.branch;
  if (!branch || Number(branch.id) !== Number(member.branch_id)) {
    clearChurchMemberSession(req);
    return res.redirect("/login");
  }
  if (member.status === "pending") {
    return res.redirect("/waiting-verification");
  }
  if (member.status !== "verified") {
    clearChurchMemberSession(req);
    return res.redirect("/login");
  }
  req.churchMember = member;
  return next();
}

async function ensureMemberAccountActive(req, res, next) {
  try {
    const pool = getPgPoolSafe();
    if (!pool) return next();
    const membersRepo = require("../db/pg/church/membersRepo");
    const { wantsJson } = require("./churchFailureStates");
    const row = await membersRepo.findMemberByIdForBranch(
      pool,
      req.churchMember.member_id,
      req.churchMember.branch_id
    );
    if (!row) {
      clearChurchMemberSession(req);
      return res.redirect("/login");
    }
    if (!sessionMatchesSecurityVersion(req.churchMember, row)) {
      return rejectStaleSecuritySession(req, res, {
        loginPath: "/login",
        clearFn: clearChurchMemberSession,
        wantsJson,
      });
    }
    if (row.status === "pending") {
      return res.redirect("/waiting-verification");
    }
    if (row.status !== "verified") {
      clearChurchMemberSession(req);
      return res.redirect("/login");
    }
    req.churchMember = stampSecurityVersion(
      {
        member_id: row.id,
        organization_id: row.organization_id,
        branch_id: row.branch_id,
        status: row.status,
        full_name: row.full_name,
      },
      row
    );
    return next();
  } catch (e) {
    return next(e);
  }
}

async function hashMemberPassword(plain) {
  return bcrypt.hash(String(plain || ""), 12);
}

async function verifyMemberPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(String(plain || ""), String(hash));
}

module.exports = {
  SESSION_KEY,
  getChurchMemberSession,
  setChurchMemberSession,
  clearChurchMemberSession,
  requireChurchMemberSession,
  requireVerifiedMemberSession,
  ensureMemberAccountActive,
  hashMemberPassword,
  verifyMemberPassword,
};
