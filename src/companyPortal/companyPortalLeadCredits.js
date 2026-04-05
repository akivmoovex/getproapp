/**
 * Company (provider) portal: lead credit / balance rules.
 * Threshold applies only where tenant budget currency is ZMW (Zambia).
 */

const { getBudgetMetaForTenant } = require("../intake/clientProjectIntake");

/** Below this balance (ZMW), providers cannot accept leads (interested / callback). */
const PORTAL_LEAD_CREDIT_BLOCK_THRESHOLD_ZMW = -200;

const ACCEPT_ACTIONS = new Set(["interested", "callback"]);

/**
 * @param {unknown} raw
 * @returns {number}
 */
function normalizePortalLeadCreditsBalance(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} tenantId
 */
function tenantUsesZmwLeadCredits(db, tenantId) {
  const meta = getBudgetMetaForTenant(db, Number(tenantId));
  return meta && String(meta.code || "").toUpperCase() === "ZMW";
}

/**
 * When true, Interested / Request callback must be disabled server- and client-side.
 * @param {import("better-sqlite3").Database} db
 * @param {number} tenantId
 * @param {unknown} portalLeadCreditsBalance
 */
function isLeadAcceptanceBlockedByCredit(db, tenantId, portalLeadCreditsBalance) {
  if (!tenantUsesZmwLeadCredits(db, tenantId)) return false;
  const b = normalizePortalLeadCreditsBalance(portalLeadCreditsBalance);
  return b < PORTAL_LEAD_CREDIT_BLOCK_THRESHOLD_ZMW;
}

/**
 * @param {string} action interested | decline | callback
 */
function isLeadAcceptanceAction(action) {
  return ACCEPT_ACTIONS.has(String(action || "").trim().toLowerCase());
}

module.exports = {
  PORTAL_LEAD_CREDIT_BLOCK_THRESHOLD_ZMW,
  normalizePortalLeadCreditsBalance,
  tenantUsesZmwLeadCredits,
  isLeadAcceptanceBlockedByCredit,
  isLeadAcceptanceAction,
};
