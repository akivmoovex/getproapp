"use strict";

const { normalizeHostFromRequest } = require("./host");
const { isBlessBoardApexDomain, getBlessBoardAdminUrl } = require("./blessBoardEnv");

/**
 * True for configured BlessBoard apex hosts (canonical + configured aliases).
 * @param {import("express").Request} req
 */
function isBlessBoardApexHost(req) {
  return isBlessBoardApexDomain(normalizeHostFromRequest(req));
}

/**
 * True for *.{canonical} branch hosts (demo, kafuebaptist, etc.) — not apex/www.
 * @param {import("express").Request} req
 */
function isBlessBoardBranchHost(req) {
  if (!req.isChurchHost || !req.churchContext) return false;
  return req.churchContext.kind === "branch";
}

function blessBoardAdminBaseUrl() {
  return getBlessBoardAdminUrl();
}

function blessBoardAdminUrl(path) {
  const base = blessBoardAdminBaseUrl();
  const p = String(path || "").startsWith("/") ? path : `/${path || ""}`;
  return `${base}${p}`;
}

module.exports = {
  isBlessBoardApexHost,
  isBlessBoardBranchHost,
  blessBoardAdminBaseUrl,
  blessBoardAdminUrl,
};
