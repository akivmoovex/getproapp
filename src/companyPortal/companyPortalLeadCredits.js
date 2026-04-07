/**
 * Company (provider) portal: lead credit / balance rules.
 * Threshold applies only where tenant budget currency is ZMW (Zambia).
 */

const { getBudgetMetaForTenantWithStore } = require("../intake/clientProjectIntake");

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
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {unknown} portalLeadCreditsBalance
 */
async function isLeadAcceptanceBlockedByCreditWithStore(pool, tenantId, portalLeadCreditsBalance) {
  const meta = await getBudgetMetaForTenantWithStore(pool, tenantId);
  if (!meta || String(meta.code || "").toUpperCase() !== "ZMW") return false;
  const b = normalizePortalLeadCreditsBalance(portalLeadCreditsBalance);
  return b < PORTAL_LEAD_CREDIT_BLOCK_THRESHOLD_ZMW;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 */
async function tenantUsesZmwLeadCreditsWithStore(pool, tenantId) {
  const meta = await getBudgetMetaForTenantWithStore(pool, Number(tenantId));
  return !!(meta && String(meta.code || "").toUpperCase() === "ZMW");
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
  tenantUsesZmwLeadCreditsWithStore,
  isLeadAcceptanceBlockedByCreditWithStore,
  isLeadAcceptanceAction,
};
