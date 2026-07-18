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
 * Date-only display (sermons / badges).
 * @param {Date|string|null} value
 * @param {string} [timezone]
 */
function formatDate(value, timezone) {
  if (!value) return "";
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const opts = { dateStyle: "medium" };
    if (timezone) opts.timeZone = timezone;
    return new Intl.DateTimeFormat("en-GB", opts).format(d);
  } catch {
    return "";
  }
}

/**
 * Parts for event date chrome (timezone-aware).
 * @param {Date|string|null} value
 * @param {string} [timezone]
 * @param {Date|string|null} [endsAt]
 */
function formatEventParts(value, timezone, endsAt) {
  const empty = { day: "", month: "", weekday: "", time: "", timeRange: "", full: "" };
  if (!value) return empty;
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return empty;
    const tz = timezone ? { timeZone: timezone } : {};
    const day = new Intl.DateTimeFormat("en-GB", { day: "2-digit", ...tz }).format(d);
    const month = new Intl.DateTimeFormat("en-GB", { month: "short", ...tz }).format(d);
    const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long", ...tz }).format(d);
    const timeFmt = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      ...tz,
    });
    const time = timeFmt.format(d);
    let timeRange = time;
    if (endsAt) {
      const end = endsAt instanceof Date ? endsAt : new Date(endsAt);
      if (!Number.isNaN(end.getTime())) {
        const endTime = timeFmt.format(end);
        if (endTime && endTime !== time) timeRange = `${time} – ${endTime}`;
      }
    }
    return {
      day,
      month,
      weekday,
      time,
      timeRange,
      full: formatWhen(d, timezone),
    };
  } catch {
    return empty;
  }
}

/**
 * Accessible label kind for a sermon media URL (no fabricated streams).
 * @param {string|null|undefined} url
 * @returns {"audio"|"video"|"media"}
 */
function sermonMediaKind(url) {
  const u = String(url || "").toLowerCase();
  if (!u) return "media";
  if (/\.(mp3|m4a|aac|wav|ogg|flac)(\?|#|$)/.test(u) || u.includes("soundcloud")) {
    return "audio";
  }
  if (
    /\.(mp4|webm|mov|m4v)(\?|#|$)/.test(u) ||
    u.includes("youtube") ||
    u.includes("youtu.be") ||
    u.includes("vimeo")
  ) {
    return "video";
  }
  return "media";
}

/**
 * Initials for avatar fallback (max 2 letters).
 * @param {string} name
 */
function initials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

/**
 * @param {object} model - from loadTenantPublicPageModel
 */
function renderTenantPublicPage(model) {
  return renderView("public/page.ejs", {
    ...model,
    formatWhen,
    formatDate,
    formatEventParts,
    sermonMediaKind,
    initials,
  });
}

module.exports = {
  renderTenantPublicPage,
  formatWhen,
  formatDate,
  formatEventParts,
  sermonMediaKind,
  initials,
};
