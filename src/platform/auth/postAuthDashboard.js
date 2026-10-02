"use strict";

/**
 * V2.05 Task 1 — Post-auth Admin Console Dashboard landings.
 * Reuses existing auth/session/tenant/RBAC. No new auth system.
 *
 * BB register/login → /hq
 * AC register/login → /app
 * Dashboard first; Website is a later nav destination.
 */

const { PRODUCT_CODE } = require("../website/publicWebsiteUrl");

const POST_AUTH_DASHBOARD = Object.freeze({
  pattern: "PostAuthDashboard",
  [PRODUCT_CODE.BLESSBOARD]: "/hq",
  [PRODUCT_CODE.ACTIVECLINIC]: "/app",
  blessboard: "/hq",
  activeclinic: "/app",
});

/**
 * Canonical post-auth / post-registration Admin Console home.
 * @param {string} productCode
 * @returns {string}
 */
function postAuthDashboardPath(productCode) {
  const code = String(productCode || "")
    .trim()
    .toLowerCase();
  if (code === PRODUCT_CODE.BLESSBOARD || code === "blessboard") {
    return POST_AUTH_DASHBOARD.blessboard;
  }
  if (code === PRODUCT_CODE.ACTIVECLINIC || code === "activeclinic") {
    return POST_AUTH_DASHBOARD.activeclinic;
  }
  return null;
}

/**
 * True when a redirect target is the product Admin Console dashboard
 * (not Website Management, not registration success detours).
 * @param {string} location
 * @param {string} productCode
 */
function isPostAuthDashboardRedirect(location, productCode) {
  const loc = String(location || "").trim();
  const home = postAuthDashboardPath(productCode);
  if (!home) return false;
  if (!(loc === home || loc.startsWith(`${home}?`))) return false;
  if (/\/website(?:\/|$|\?)/.test(loc)) return false;
  if (/register-(?:church|clinic)\/success/.test(loc)) return false;
  return true;
}

module.exports = {
  POST_AUTH_DASHBOARD,
  postAuthDashboardPath,
  isPostAuthDashboardRedirect,
};
