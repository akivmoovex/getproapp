"use strict";

const { hashMemberPassword, verifyMemberPassword } = require("./memberAuth");

const SESSION_KEY = "churchHqAdmin";

/**
 * @returns {{ hq_admin_id: number, organization_id: number, full_name: string, role: string, status: string } | null}
 */
function getChurchHqAdminSession(req) {
  const s = req.session && req.session[SESSION_KEY];
  if (!s || typeof s.hq_admin_id !== "number" || typeof s.organization_id !== "number") {
    return null;
  }
  return {
    hq_admin_id: s.hq_admin_id,
    organization_id: s.organization_id,
    full_name: String(s.full_name || ""),
    role: String(s.role || ""),
    status: String(s.status || ""),
  };
}

function setChurchHqAdminSession(req, payload) {
  if (!req.session) return;
  req.session[SESSION_KEY] = {
    hq_admin_id: payload.hq_admin_id,
    organization_id: payload.organization_id,
    full_name: payload.full_name,
    role: payload.role,
    status: payload.status,
  };
}

function clearChurchHqAdminSession(req) {
  if (req.session && req.session[SESSION_KEY]) {
    delete req.session[SESSION_KEY];
  }
}

async function requireChurchHqAdminSession(req, res, next) {
  const admin = getChurchHqAdminSession(req);
  if (!admin) {
    return res.redirect("/hq/login");
  }
  const org = req.churchContext && req.churchContext.organization;
  if (!org || Number(org.id) !== Number(admin.organization_id)) {
    clearChurchHqAdminSession(req);
    return res.redirect("/hq/login");
  }

  try {
    const { getPgPool } = require("../db/pg");
    const hqAdminsRepo = require("../db/pg/church/hqAdminsRepo");
    const row = await hqAdminsRepo.findHqAdminById(getPgPool(), admin.hq_admin_id);
    if (!row || row.status !== "active" || Number(row.organization_id) !== Number(admin.organization_id)) {
      clearChurchHqAdminSession(req);
      return res.redirect("/hq/login");
    }
    req.churchHqAdmin = {
      hq_admin_id: row.id,
      organization_id: row.organization_id,
      full_name: row.full_name || row.display_name || "HQ Admin",
      role: row.role || "hq_admin",
      status: row.status,
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  SESSION_KEY,
  getChurchHqAdminSession,
  setChurchHqAdminSession,
  clearChurchHqAdminSession,
  requireChurchHqAdminSession,
  hashHqAdminPassword: hashMemberPassword,
  verifyHqAdminPassword: verifyMemberPassword,
};
