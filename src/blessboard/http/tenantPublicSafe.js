"use strict";

/**
 * Safe URL allowlist for V5 public website rendering.
 * Only http(s), mailto, tel, and same-site relative paths.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function safeExternalUrl(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  // Same-site relative path (not protocol-relative).
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    if (raw.includes("\\") || raw.includes("\0")) return null;
    return raw;
  }

  try {
    const parsed = new URL(raw);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      if (!parsed.hostname) return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escape for use inside HTML attribute double quotes.
 * @param {unknown} value
 */
function escapeAttr(value) {
  return escapeHtml(value);
}

/**
 * Collapse whitespace for meta descriptions; strip angle brackets.
 * @param {unknown} value
 * @param {number} [max=160]
 */
function plainMetaText(value, max = 160) {
  const s = String(value == null ? "" : value)
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trim()}…`;
}

module.exports = {
  ALLOWED_PROTOCOLS,
  safeExternalUrl,
  escapeHtml,
  escapeAttr,
  plainMetaText,
};
