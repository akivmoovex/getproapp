"use strict";

/**
 * Minimal safe HTML for notification templates (no external sanitizer dependency).
 * Allows only p, br, strong, em, a[href=http(s)]. Strips scripts/event handlers.
 */

const ALLOWED_TAGS = new Set(["p", "br", "strong", "em", "a"]);

function escapeText(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeHref(raw) {
  const href = String(raw || "").trim();
  // Preserve allowlisted merge placeholders until render (post-merge re-sanitises).
  if (/^\{\{\s*[a-z0-9_]+\s*\}\}$/i.test(href)) return href;
  if (!/^https?:\/\//i.test(href)) return null;
  if (/[\s<>"'`]/.test(href)) return null;
  if (/javascript:/i.test(href)) return null;
  return href;
}

/**
 * Sanitise a small HTML subset for templates.
 * Unknown tags are stripped (contents kept as text when safe).
 */
function sanitizeNotificationHtml(input) {
  if (input == null || String(input).trim() === "") return null;
  let html = String(input);
  // Remove dangerous blocks outright
  html = html.replace(/<(script|style|iframe|object|embed|link|meta|svg|math)[^>]*>[\s\S]*?<\/\1>/gi, "");
  html = html.replace(/<(script|style|iframe|object|embed|link|meta|svg|math)[^>]*\/?>/gi, "");
  html = html.replace(/\son[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, "");
  html = html.replace(/javascript:/gi, "");

  // Tokenise tags
  const parts = html.split(/(<\/?[a-zA-Z][^>]*>)/g);
  let out = "";
  for (const part of parts) {
    const open = /^<([a-zA-Z]+)([^>]*)>$/.exec(part);
    const close = /^<\/([a-zA-Z]+)\s*>$/.exec(part);
    const selfBr = /^<(br)\s*\/?>$/i.exec(part);
    if (selfBr) {
      out += "<br>";
      continue;
    }
    if (close) {
      const tag = close[1].toLowerCase();
      if (ALLOWED_TAGS.has(tag) && tag !== "br") out += `</${tag}>`;
      continue;
    }
    if (open) {
      const tag = open[1].toLowerCase();
      if (!ALLOWED_TAGS.has(tag) || tag === "br") continue;
      if (tag === "a") {
        const hrefMatch = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(open[2] || "");
        const rawHref = hrefMatch ? hrefMatch[2] || hrefMatch[3] || hrefMatch[4] : "";
        const href = sanitizeHref(rawHref);
        if (!href) continue;
        out += `<a href="${escapeText(href)}">`;
      } else {
        out += `<${tag}>`;
      }
      continue;
    }
    out += escapeText(part);
  }
  return out.trim() || null;
}

module.exports = {
  ALLOWED_TAGS,
  escapeText,
  sanitizeHref,
  sanitizeNotificationHtml,
};
