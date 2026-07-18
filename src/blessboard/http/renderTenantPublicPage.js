"use strict";

/**
 * Render V5 tenant public pages (EJS + external CSS; no inline scripts).
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");

const TEMPLATE_CACHE = new Map();

/**
 * @param {string} relativePath
 */
function loadTemplate(relativePath) {
  if (TEMPLATE_CACHE.has(relativePath)) return TEMPLATE_CACHE.get(relativePath);
  const filename = path.join(VIEWS_ROOT, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  TEMPLATE_CACHE.set(relativePath, { source, filename });
  return TEMPLATE_CACHE.get(relativePath);
}

/**
 * @param {string} relativePath
 * @param {object} data
 */
function renderView(relativePath, data) {
  const tpl = loadTemplate(relativePath);
  return ejs.render(tpl.source, data, { filename: tpl.filename });
}

/**
 * Format a date for display (plain text).
 * @param {Date|string|null} value
 * @param {string} [timezone]
 */
function formatWhen(value, timezone) {
  if (!value) return "";
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const opts = {
      dateStyle: "medium",
      timeStyle: "short",
    };
    if (timezone) opts.timeZone = timezone;
    return new Intl.DateTimeFormat("en-GB", opts).format(d);
  } catch {
    return "";
  }
}

/**
 * @param {object} model - from loadTenantPublicPageModel
 */
function renderTenantPublicPage(model) {
  return renderView("public/page.ejs", {
    ...model,
    formatWhen,
  });
}

module.exports = {
  renderTenantPublicPage,
  formatWhen,
};
