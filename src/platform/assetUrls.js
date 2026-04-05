"use strict";

const fs = require("fs");
const path = require("path");

const ASSET_MAP_PATH = path.join(__dirname, "..", "..", "public", "build", "asset-map.json");

/** Public URL paths when built assets are disabled (source files under /public). */
const LEGACY_HREF = {
  styles: "/styles.css",
  scripts: "/scripts.js",
  "theme-prefs": "/theme-prefs.js",
  "ui-guard": "/js/ui-guard.js",
  autocomplete: "/autocomplete.js",
  join: "/join.js",
  "directory-empty-callback": "/directory-empty-callback.js",
  "company-profile": "/company-profile.js",
  "company-portal": "/company-portal.js",
  "admin-dashboard": "/admin-dashboard.js",
  "admin-crm-kanban": "/admin-crm-kanban.js",
  "admin-company-workspace": "/admin-company-workspace.js",
  "admin-settings-hub": "/admin-settings-hub.js",
  "admin-form-edit-mode": "/admin-form-edit-mode.js",
  "admin-tenant-settings-list": "/admin-tenant-settings-list.js",
};

let cachedMap = null;
let cachedMapLoaded = false;

function loadAssetMap() {
  if (cachedMapLoaded) return cachedMap;
  cachedMapLoaded = true;
  try {
    const raw = fs.readFileSync(ASSET_MAP_PATH, "utf8");
    cachedMap = JSON.parse(raw);
  } catch {
    cachedMap = {};
  }
  return cachedMap;
}

function shouldUseBuiltAssets() {
  if (process.env.GETPRO_USE_BUILD_ASSETS === "0") return false;
  const map = loadAssetMap();
  const hasMap = map && Object.keys(map).length > 0;
  if (!hasMap) return false;
  if (process.env.GETPRO_USE_BUILD_ASSETS === "1") return true;
  return process.env.NODE_ENV === "production";
}

/**
 * @param {string} stylesVersion fallback query param when serving legacy /public/*.js|css
 */
function createAssetUrl(stylesVersion) {
  const v = stylesVersion || "1";
  const useBuilt = shouldUseBuiltAssets();
  const map = loadAssetMap();

  return function asset(logicalName) {
    const key = String(logicalName || "").trim();
    if (!key) return "";
    if (useBuilt && map[key]) {
      return map[key];
    }
    const base = LEGACY_HREF[key];
    if (!base) {
      return `/${key}?v=${encodeURIComponent(v)}`;
    }
    return `${base}?v=${encodeURIComponent(v)}`;
  };
}

module.exports = {
  createAssetUrl,
  loadAssetMap,
  shouldUseBuiltAssets,
  LEGACY_HREF,
};
