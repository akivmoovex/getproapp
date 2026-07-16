"use strict";

const { hashMemberPassword, verifyMemberPassword } = require("./memberAuth");
const {
  normalizeSecurityVersion,
  stampSecurityVersion,
  sessionMatchesSecurityVersion,
  rejectStaleSecuritySession,
} = require("./accountSecurityVersion");

const SESSION_KEY = "churchBranchAdmin";

/**
 * @returns {{ admin_id: number, organization_id: number, branch_id: number, full_name: string, role: string, status: string, security_version: number } | null}
 */
function getChurchBranchAdminSession(req) {
  const s = req.session && req.session[SESSION_KEY];
  if (!s || typeof s.admin_id !== "number" || typeof s.branch_id !== "number") {
    return null;
  }
  return {
    admin_id: s.admin_id,
    organization_id: s.organization_id,
    branch_id: s.branch_id,
    full_name: String(s.full_name || ""),
    role: String(s.role || ""),
    status: String(s.status || ""),
    security_version: normalizeSecurityVersion(s.security_version),
  };
}

function setChurchBranchAdminSession(req, payload) {
  if (!req.session) return;
  const prev = req.session[SESSION_KEY];
  req.session[SESSION_KEY] = stampSecurityVersion(
    {
      admin_id: payload.admin_id,
      organization_id: payload.organization_id,
      branch_id: payload.branch_id,
      full_name: payload.full_name,
      role: payload.role,
      status: payload.status,
    },
    payload,
    prev && prev.security_version
  );
}

function clearChurchBranchAdminSession(req) {
  if (req.session && req.session[SESSION_KEY]) {
    delete req.session[SESSION_KEY];
  }
}

async function requireChurchBranchAdminSession(req, res, next) {
  const admin = getChurchBranchAdminSession(req);
  if (!admin) {
    const { wantsJson, renderChurchFailureState } = require("./churchFailureStates");
    if (wantsJson(req)) {
      return renderChurchFailureState(req, res, "unauthenticated", {
        shell: "branch",
        forceJson: true,
      });
    }
    return res.redirect("/branch/login");
  }
  const branch = req.churchContext && req.churchContext.branch;
  if (!branch || Number(branch.id) !== Number(admin.branch_id)) {
    clearChurchBranchAdminSession(req);
    return res.redirect("/branch/login");
  }

  const { isChurchLogoutPath } = require("./churchStatusAccess");
  if (isChurchLogoutPath(req.path)) {
    req.churchBranchAdmin = admin;
    return next();
  }

  try {
    const { getPgPool } = require("../db/pg");
    const branchAdminsRepo = require("../db/pg/church/branchAdminsRepo");
    const { wantsJson } = require("./churchFailureStates");
    const row = await branchAdminsRepo.findBranchAdminById(getPgPool(), admin.admin_id);
    if (!row || row.status !== "active" || Number(row.branch_id) !== Number(admin.branch_id)) {
      clearChurchBranchAdminSession(req);
      return res.redirect("/branch/login");
    }
    if (!sessionMatchesSecurityVersion(admin, row)) {
      return rejectStaleSecuritySession(req, res, {
        loginPath: "/branch/login",
        clearFn: clearChurchBranchAdminSession,
        wantsJson,
      });
    }
    req.churchBranchAdmin = stampSecurityVersion(
      {
        admin_id: row.id,
        organization_id: row.organization_id,
        branch_id: row.branch_id,
        full_name: row.full_name || row.display_name || "Branch Admin",
        role: row.role || "branch_admin",
        status: row.status,
        can_view_finance: Boolean(row.can_view_finance),
        can_export_reports: row.can_export_reports !== false,
        can_correct_attendance: Boolean(row.can_correct_attendance),
        can_access_pastoral: Boolean(row.can_access_pastoral),
        can_access_safeguarding: Boolean(row.can_access_safeguarding),
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
  getChurchBranchAdminSession,
  setChurchBranchAdminSession,
  clearChurchBranchAdminSession,
  requireChurchBranchAdminSession,
  hashBranchAdminPassword: hashMemberPassword,
  verifyBranchAdminPassword: verifyMemberPassword,
};
