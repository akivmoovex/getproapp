"use strict";

const fs = require("fs");
const path = require("path");

let cached;

/**
 * Application version from repo root package.json (single source of truth for display + cache tokens).
 */
function getAppVersion() {
  if (cached) return cached;
  try {
    const pkgPath = path.join(__dirname, "..", "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    cached = String(pkg.version || "0.0.0").trim() || "0.0.0";
  } catch {
    cached = "0.0.0";
  }
  return cached;
}

module.exports = { getAppVersion };
