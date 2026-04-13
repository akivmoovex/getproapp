/**
 * Company (provider) portal: lead credit / balance rules (tenant commerce settings).
 */

const {
  getCommerceSettingsForTenant,
  creditBalanceOkForDealOffer,
} = require("../tenants/tenantCommerceSettings");

/** @deprecated Legacy constant; use tenant commerce `minimum_credit_balance` (see {@link getCommerceSettingsForTenant}). */
const PORTAL_LEAD_CREDIT_BLOCK_THRESHOLD_ZMW = 0;

/** @deprecated Legacy constant; use tenant commerce `starting_credit_balance`. */
const DEFAULT_SP_CREDIT_START_ZMW = 250;

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
 * @param {number|null|undefined} [dealPrice] for this lead (or worst-case for list views)
 */
async function isLeadAcceptanceBlockedByCreditWithStore(pool, tenantId, portalLeadCreditsBalance, dealPrice) {
  const cs = await getCommerceSettingsForTenant(pool, Number(tenantId));
  const b = normalizePortalLeadCreditsBalance(portalLeadCreditsBalance);
  const dp = dealPrice != null && Number.isFinite(Number(dealPrice)) ? Number(dealPrice) : 0;
  return !creditBalanceOkForDealOffer(b, dp, cs.minimum_credit_balance);
}

/**
 * Portal credit / balance UI applies when the tenant has commerce settings (all regions after migration).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 */
async function tenantUsesPortalLeadCreditsWithStore(pool, tenantId) {
  await getCommerceSettingsForTenant(pool, Number(tenantId));
  return true;
}

/** @deprecated Use {@link tenantUsesPortalLeadCreditsWithStore}. */
const tenantUsesZmwLeadCreditsWithStore = tenantUsesPortalLeadCreditsWithStore;

/**
 * Initial `companies.portal_lead_credits_balance` for a newly created listing.
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @returns {Promise<number>}
 */
async function getDefaultPortalLeadCreditsBalanceForNewCompany(pool, tenantId) {
  const cs = await getCommerceSettingsForTenant(pool, Number(tenantId));
  return cs.starting_credit_balance;
}

/**
 * @param {string} action interested | decline | callback
 */
function isLeadAcceptanceAction(action) {
  return ACCEPT_ACTIONS.has(String(action || "").trim().toLowerCase());
}

module.exports = {
  PORTAL_LEAD_CREDIT_BLOCK_THRESHOLD_ZMW,
  DEFAULT_SP_CREDIT_START_ZMW,
  normalizePortalLeadCreditsBalance,
  tenantUsesPortalLeadCreditsWithStore,
  tenantUsesZmwLeadCreditsWithStore,
  getDefaultPortalLeadCreditsBalanceForNewCompany,
  isLeadAcceptanceBlockedByCreditWithStore,
  isLeadAcceptanceAction,
};
