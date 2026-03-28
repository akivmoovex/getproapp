const bcrypt = require("bcryptjs");
const clientIntake = require("./clientProjectIntake");

const SESSION_KEY = "companyPersonnel";

/**
 * @returns {{ userId: number, tenantId: number, companyId: number, fullName: string }|null}
 */
function getCompanyPersonnelSession(req) {
  const s = req.session && req.session[SESSION_KEY];
  if (!s || typeof s.userId !== "number" || typeof s.tenantId !== "number" || typeof s.companyId !== "number") {
    return null;
  }
  return {
    userId: s.userId,
    tenantId: s.tenantId,
    companyId: s.companyId,
    fullName: String(s.fullName || ""),
  };
}

function setCompanyPersonnelSession(req, payload) {
  if (!req.session) return;
  req.session[SESSION_KEY] = {
    userId: payload.userId,
    tenantId: payload.tenantId,
    companyId: payload.companyId,
    fullName: payload.fullName,
  };
}

function clearCompanyPersonnelSession(req) {
  if (req.session && req.session[SESSION_KEY]) {
    delete req.session[SESSION_KEY];
  }
}

/**
 * Tenant must match host-resolved region; prevents session reuse across regional hosts.
 */
function requireCompanyPersonnelAuth(req, res, next) {
  const cp = getCompanyPersonnelSession(req);
  if (!cp) {
    return res.redirect("/company/login");
  }
  const tenant = req.tenant;
  if (!tenant || Number(tenant.id) !== Number(cp.tenantId)) {
    clearCompanyPersonnelSession(req);
    return res.redirect("/company/login");
  }
  req.companyPersonnel = cp;
  return next();
}

/**
 * Phone or username (company portal only). Usernames are stored lowercase; try username when the
 * identifier contains a letter, otherwise try phone digits first.
 * @returns {Promise<object|null>} user row joined to company (no password_hash in return) or null
 */
async function authenticateCompanyPersonnel(db, tenantId, identifierRaw, password) {
  const ident = String(identifierRaw || "").trim();
  if (!ident || !String(password || "")) return null;
  const tid = Number(tenantId);
  const phoneNorm = clientIntake.normalizeDigits(ident);
  const hasLetter = /[a-zA-Z]/.test(ident);

  let row = null;
  if (hasLetter) {
    const u = ident.toLowerCase().slice(0, 80);
    row = db
      .prepare(
        `
        SELECT cpu.id, cpu.company_id, cpu.full_name, cpu.password_hash, cpu.is_active
        FROM company_personnel_users cpu
        INNER JOIN companies c ON c.id = cpu.company_id AND c.tenant_id = cpu.tenant_id
        WHERE cpu.tenant_id = ? AND length(trim(cpu.username)) > 0 AND lower(trim(cpu.username)) = ?
        `
      )
      .get(tid, u);
  }
  if (!row && phoneNorm.length > 0) {
    row = db
      .prepare(
        `
        SELECT cpu.id, cpu.company_id, cpu.full_name, cpu.password_hash, cpu.is_active
        FROM company_personnel_users cpu
        INNER JOIN companies c ON c.id = cpu.company_id AND c.tenant_id = cpu.tenant_id
        WHERE cpu.tenant_id = ? AND cpu.phone_normalized = ?
        `
      )
      .get(tid, phoneNorm);
  }
  if (!row || Number(row.is_active) !== 1) return null;
  const ok = await bcrypt.compare(String(password), String(row.password_hash));
  if (!ok) return null;
  return {
    id: row.id,
    company_id: row.company_id,
    full_name: row.full_name,
  };
}

module.exports = {
  SESSION_KEY,
  getCompanyPersonnelSession,
  setCompanyPersonnelSession,
  clearCompanyPersonnelSession,
  requireCompanyPersonnelAuth,
  authenticateCompanyPersonnel,
};
