"use strict";

const { normalizeHostFromRequest, getChurchHostDomain } = require("./host");
const { BLESSBOARD_PUBLIC_URL } = require("./branding");

/**
 * True for blessboard.com and www.blessboard.com (platform admin + landing apex).
 * @param {import("express").Request} req
 */
function isBlessBoardApexHost(req) {
  const host = normalizeHostFromRequest(req);
  const domain = getChurchHostDomain();
  return host === domain || host === `www.${domain}`;
}

/**
 * True for *.blessboard.com branch hosts (demo, kafuebaptist, etc.) — not apex/www.
 * @param {import("express").Request} req
 */
function isBlessBoardBranchHost(req) {
  if (!req.isChurchHost || !req.churchContext) return false;
  return req.churchContext.kind === "branch";
}

function blessBoardAdminBaseUrl() {
  return String(process.env.BLESSBOARD_ADMIN_URL || BLESSBOARD_PUBLIC_URL).replace(/\/$/, "");
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
