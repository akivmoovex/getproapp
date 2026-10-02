"use strict";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

function safeExternalUrl(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    if (raw.includes("\\") || raw.includes("\0")) return null;
    return raw;
  }
  try {
    const parsed = new URL(raw);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;
    if ((parsed.protocol === "http:" || parsed.protocol === "https:") && !parsed.hostname) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

module.exports = {
  ALLOWED_PROTOCOLS,
  safeExternalUrl,
  escapeHtml,
};
