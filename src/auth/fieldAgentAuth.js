"use strict";

const bcrypt = require("bcryptjs");
const { getPgPool } = require("../db/pg");
const fieldAgentsRepo = require("../db/pg/fieldAgentsRepo");

const SESSION_KEY = "fieldAgent";

/**
 * @returns {{ id: number, tenantId: number, username: string, displayName: string } | null}
 */
function getFieldAgentSession(req) {
  const s = req.session && req.session[SESSION_KEY];
  if (!s || typeof s.id !== "number" || typeof s.tenantId !== "number") {
    return null;
  }
  return {
    id: s.id,
    tenantId: s.tenantId,
    username: String(s.username || ""),
    displayName: String(s.displayName || ""),
  };
}

function setFieldAgentSession(req, payload) {
  if (!req.session) return;
  req.session[SESSION_KEY] = {
    id: payload.id,
    tenantId: payload.tenantId,
    username: payload.username,
    displayName: payload.displayName || "",
  };
}

function clearFieldAgentSession(req) {
  if (req.session && req.session[SESSION_KEY]) {
    delete req.session[SESSION_KEY];
  }
}

function fieldAgentTenantMatchesRequest(req, session) {
  if (!req.tenant || !session) return false;
  return Number(req.tenant.id) === Number(session.tenantId);
}

async function authenticateFieldAgent(pool, username, password, tenantId) {
  const u = await fieldAgentsRepo.getByUsernameAndTenant(pool, String(username || "").trim(), tenantId);
  if (!u || u.enabled === false) return null;
  const ok = await bcrypt.compare(String(password || ""), u.password_hash);
  if (!ok) return null;
  return u;
}

async function requireFieldAgent(req, res, next) {
  const s = getFieldAgentSession(req);
  if (!s) {
    const prefix = req.tenantUrlPrefix != null ? String(req.tenantUrlPrefix) : "";
    return res.redirect(302, `${prefix}/field-agent/login`);
  }
  if (!fieldAgentTenantMatchesRequest(req, s)) {
    clearFieldAgentSession(req);
    const prefix = req.tenantUrlPrefix != null ? String(req.tenantUrlPrefix) : "";
    return res.redirect(302, `${prefix}/field-agent/login`);
  }
  try {
    const pool = getPgPool();
    const row = await fieldAgentsRepo.getByIdAndTenant(pool, s.id, req.tenant.id);
    if (!row || row.enabled === false || Number(row.enabled) === 0) {
      clearFieldAgentSession(req);
      const prefix = req.tenantUrlPrefix != null ? String(req.tenantUrlPrefix) : "";
      return res.redirect(302, `${prefix}/field-agent/login`);
    }
  } catch (e) {
    return next(e);
  }
  return next();
}

module.exports = {
  SESSION_KEY,
  getFieldAgentSession,
  setFieldAgentSession,
  clearFieldAgentSession,
  fieldAgentTenantMatchesRequest,
  authenticateFieldAgent,
  requireFieldAgent,
};
