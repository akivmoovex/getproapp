"use strict";

/**
 * Global write-maintenance middleware for BlessBoard V5.
 * Blocks state-changing HTTP methods when BLESSBOARD_WRITE_MAINTENANCE is on.
 * Host-agnostic (apex, tenant subdomain, custom domain).
 */

const path = require("path");
const fs = require("fs");
const {
  isWriteMaintenanceEnabled,
  isWriteAllowedDuringMaintenance,
  PUBLIC_REASON,
  USER_MESSAGE,
} = require("../config/writeMaintenance");

let cachedHtml = null;

function loadMaintenanceHtml() {
  if (cachedHtml) return cachedHtml;
  const filePath = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "views",
    "blessboard",
    "v5",
    "maintenance",
    "write-maintenance.html"
  );
  try {
    cachedHtml = fs.readFileSync(filePath, "utf8");
  } catch {
    cachedHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Maintenance · BlessBoard</title></head><body><p>${USER_MESSAGE}</p></body></html>`;
  }
  return cachedHtml;
}

/**
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function prefersJson(req) {
  const accept = String((req.headers && req.headers.accept) || "").toLowerCase();
  if (accept.includes("application/json")) return true;
  const xhr = String((req.headers && req.headers["x-requested-with"]) || "").toLowerCase();
  if (xhr === "xmlhttprequest") return true;
  const pathName = String((req.path || req.url || "").split("?")[0] || "");
  if (pathName.includes("/media/upload")) return true;
  if (pathName.startsWith("/api/") || pathName.startsWith("/_bb/api/")) return true;
  return false;
}

/**
 * @param {{
 *   getEnv?: () => NodeJS.ProcessEnv,
 *   getHtml?: () => string,
 * }} [deps]
 */
function createWriteMaintenanceMiddleware(deps) {
  const options = deps || {};
  const getEnv = options.getEnv || (() => process.env);
  const getHtml = options.getHtml || loadMaintenanceHtml;

  return function writeMaintenanceMiddleware(req, res, next) {
    if (!isWriteMaintenanceEnabled(getEnv())) {
      return next();
    }
    const method = req.method || "GET";
    const pathName = req.path || (req.url || "/").split("?")[0] || "/";
    if (isWriteAllowedDuringMaintenance(method, pathName)) {
      return next();
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");

    if (prefersJson(req)) {
      return res.status(503).json({
        ok: false,
        error: PUBLIC_REASON,
        message: USER_MESSAGE,
      });
    }

    return res.status(503).type("html").send(getHtml());
  };
}

/** Test helper */
function resetMaintenanceHtmlCacheForTests() {
  cachedHtml = null;
}

module.exports = {
  createWriteMaintenanceMiddleware,
  prefersJson,
  loadMaintenanceHtml,
  resetMaintenanceHtmlCacheForTests,
};
