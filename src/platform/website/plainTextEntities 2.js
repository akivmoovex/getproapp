"use strict";

/**
 * Plain-text CMS fields must be stored unescaped and escaped once at render
 * (EJS <%= %> or attribute helpers). Historical bugs double-escaped values into
 * storage (e.g. Zambia's → Zambia&#39;s → Zambia&amp;#39;s). Decode known
 * entities back to plain text before display/persist — never treat as HTML.
 */

const NAMED = Object.freeze({
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
});

/**
 * Decode a single pass of common HTML entities in plain text.
 * @param {string} input
 * @returns {string}
 */
function decodeHtmlEntitiesOnce(input) {
  return String(input)
    .replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos|nbsp);/g, (match, body) => {
      if (body[0] === "#") {
        const code =
          body[1] === "x" || body[1] === "X"
            ? parseInt(body.slice(2), 16)
            : parseInt(body.slice(1), 10);
        if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      return Object.prototype.hasOwnProperty.call(NAMED, body) ? NAMED[body] : match;
    });
}

/**
 * Collapse double/triple-encoded plain-text entities to readable text.
 * Stops when stable or after a few passes (guards against odd input).
 * @param {unknown} value
 * @returns {string}
 */
function normalizePlainTextEntities(value) {
  if (value == null) return "";
  let out = String(value);
  if (!out.includes("&")) return out;
  for (let i = 0; i < 4; i += 1) {
    const next = decodeHtmlEntitiesOnce(out);
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * True when value still contains escaped entity forms that should not appear
 * in visitor-visible plain text after normalization.
 * @param {unknown} value
 */
function looksDoubleEncodedPlainText(value) {
  const s = String(value == null ? "" : value);
  return /&amp;|#39;|&lt;|&gt;|&quot;/.test(s) && /&(?:amp|lt|gt|quot|#\d+|#x[0-9a-fA-F]+);/i.test(s);
}

module.exports = {
  decodeHtmlEntitiesOnce,
  normalizePlainTextEntities,
  looksDoubleEncodedPlainText,
};
