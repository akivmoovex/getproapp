"use strict";

const { normalizeHostFromRequest } = require("./host");
const { isBlessBoardApexHost, blessBoardAdminUrl } = require("./blessBoardApexHost");
const {
  mapLegacyGetProChurchAdminPathToBlessBoard,
  isBlessBoardPlatformAdminPath,
} = require("./blessboardAdminPaths");

function isGetProPlatformApexHost(req) {
  const base = String(process.env.BASE_DOMAIN || "")
    .toLowerCase()
    .trim();
  if (!base) return false;
  const host = normalizeHostFromRequest(req);
  return host === base || host === `www.${base}`;
}

function shouldRedirectGetProChurchAdmin(req) {
  if (isBlessBoardApexHost(req)) return false;
  if (!isGetProPlatformApexHost(req)) return false;
  const fullPath = `/admin${req.path === "/" ? "" : req.path}`;
  return (
    fullPath.startsWith("/admin/church") ||
    fullPath === "/admin/churches" ||
    fullPath.startsWith("/admin/churches/") ||
    fullPath === "/admin/diagnostics"
  );
}

function redirectGetProChurchAdminToBlessBoard(req, res) {
  const fullPath = `/admin${req.path === "/" ? "" : req.path}`;
  const mapped = mapLegacyGetProChurchAdminPathToBlessBoard(fullPath);
  const targetPath = mapped || "/admin/dashboard";
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  return res.redirect(302, blessBoardAdminUrl(`${targetPath}${qs}`));
}

function shouldBlockBlessBoardAdminOnBranchHost(req) {
  if (isBlessBoardApexHost(req)) return false;
  if (!req.isChurchHost || !req.churchContext || req.churchContext.kind !== "branch") {
    return false;
  }
  return isBlessBoardPlatformAdminPath(req.path);
}

module.exports = {
  isGetProPlatformApexHost,
  shouldRedirectGetProChurchAdmin,
  redirectGetProChurchAdminToBlessBoard,
  shouldBlockBlessBoardAdminOnBranchHost,
};
