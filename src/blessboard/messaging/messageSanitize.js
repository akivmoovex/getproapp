"use strict";

/**
 * Safe message body formatting for unified messaging.
 * Plain text + limited markdown-lite; never arbitrary HTML.
 */

const HTML_HINT = /<\/?[a-z][\s\S]*>/i;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function rejectHtml(value, field) {
  if (value == null) return { ok: true, value: null };
  const s = String(value);
  if (HTML_HINT.test(s)) return { ok: false, reason: `${field}_html_not_allowed` };
  return { ok: true, value: s };
}

/**
 * Validate CTA / related absolute or relative https/path URLs.
 * @param {unknown} value
 * @param {string} field
 */
function validateSafeUrl(value, field) {
  if (value == null || value === "") return { ok: true, value: null };
  const html = rejectHtml(value, field);
  if (!html.ok) return html;
  const raw = String(html.value).trim();
  if (!raw || raw.length > 2000) return { ok: false, reason: `${field}_url` };
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    if (raw.includes("\\") || raw.includes("\0") || raw.includes("..")) {
      return { ok: false, reason: `${field}_url` };
    }
    return { ok: true, value: raw };
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") {
      return { ok: false, reason: `${field}_https_required` };
    }
    if (!parsed.hostname) return { ok: false, reason: `${field}_url` };
    return { ok: true, value: parsed.toString() };
  } catch (_err) {
    return { ok: false, reason: `${field}_url` };
  }
}

/**
 * Render stored body to safe HTML (paragraphs, bold, italic, lists, links).
 * @param {unknown} body
 */
function renderSafeMessageBodyHtml(body) {
  const raw = String(body == null ? "" : body).replace(/\r\n/g, "\n").trim();
  if (!raw) return "";

  const blocks = raw.split(/\n{2,}/);
  const out = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trimEnd());
    const isList = lines.length > 0 && lines.every((l) => /^[-*]\s+/.test(l.trim()));
    if (isList) {
      out.push("<ul>");
      for (const line of lines) {
        const item = line.trim().replace(/^[-*]\s+/, "");
        out.push(`<li>${formatInline(item)}</li>`);
      }
      out.push("</ul>");
      continue;
    }
    out.push(`<p>${lines.map((l) => formatInline(l)).join("<br/>")}</p>`);
  }
  return out.join("");
}

function formatInline(text) {
  let s = escapeHtml(text);
  // Links: [label](https://...)
  s = s.replace(
    /\[([^\]]{1,120})\]\((https:\/\/[^)\s]{1,1800})\)/g,
    (_m, label, href) => {
      const safeHref = validateSafeUrl(href, "link");
      if (!safeHref.ok || !safeHref.value) return escapeHtml(`[${label}](${href})`);
      return `<a href="${escapeHtml(safeHref.value)}" rel="noopener noreferrer">${label}</a>`;
    }
  );
  // Bold **text**
  s = s.replace(/\*\*([^*\n]{1,200})\*\*/g, "<strong>$1</strong>");
  // Italic _text_
  s = s.replace(/(^|[\s(])_([^_\n]{1,200})_(?=[\s).,!?]|$)/g, "$1<em>$2</em>");
  return s;
}

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Partially mask email for preference UI.
 * @param {unknown} email
 */
function maskEmail(email) {
  const raw = String(email || "").trim().toLowerCase();
  if (!raw || !raw.includes("@")) return "";
  const [local, domain] = raw.split("@");
  if (!local || !domain) return "";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

/**
 * Partially mask E.164-ish phone.
 * @param {unknown} phone
 */
function maskPhone(phone) {
  const raw = String(phone || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return "••••••••";
  return `+${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

module.exports = {
  HTML_HINT,
  UUID_RE,
  escapeHtml,
  rejectHtml,
  validateSafeUrl,
  renderSafeMessageBodyHtml,
  isUuid,
  maskEmail,
  maskPhone,
};
