"use strict";

/**
 * Shared baseline keying + JSON baseline loading for check-components.js and check-css-boundaries.js.
 */

const fs = require("fs");
const path = require("path");

const REPORT_VERSION = 2;
const KEY_SCHEMA = "file|rule|snippetHash";

function norm(p) {
  return p.split(path.sep).join("/");
}

function relFromRoot(repoRoot, absPath) {
  return norm(path.relative(repoRoot, absPath));
}

function normalizeSnippetForHash(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** FNV-1a 32-bit; return fixed-width hex (stable across Node versions). */
function hashString(s) {
  let h = 2166136261 >>> 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function snippetHashFromSnippet(snippet) {
  return hashString(normalizeSnippetForHash(snippet));
}

/** Stable baseline / dedupe key (line-independent). */
function violationKey(v) {
  const h = snippetHashFromSnippet(v.snippet || "");
  return `${v.file}|${v.rule}|${h}`;
}

/** v1 baseline compatibility: same as old violationKey. */
function legacyLineViolationKey(v) {
  return `${v.file}|${Number(v.line)}|${v.rule}`;
}

function dedupeViolations(list) {
  const seen = new Set();
  const out = [];
  for (const v of list) {
    const k = violationKey(v);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

function loadBaselineKeys(baselinePath) {
  if (!fs.existsSync(baselinePath)) {
    return { ok: false, keys: new Set(), error: `Baseline file not found: ${baselinePath}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  } catch (e) {
    return { ok: false, keys: new Set(), error: `Invalid baseline JSON: ${e.message}` };
  }
  const rows = parsed.violations || [];
  const keys = new Set();
  const version = Number(parsed.version) || 1;

  for (const v of rows) {
    if (v.file == null || v.rule == null) continue;

    const storedHash =
      typeof v.snippetHash === "string" && /^[0-9a-f]{8}$/i.test(v.snippetHash)
        ? v.snippetHash.toLowerCase()
        : null;
    if (storedHash) {
      keys.add(`${v.file}|${v.rule}|${storedHash}`);
    } else if (v.snippet != null && String(v.snippet).trim() !== "") {
      keys.add(`${v.file}|${v.rule}|${snippetHashFromSnippet(v.snippet)}`);
    }

    if (version < 2 && v.line != null) {
      keys.add(legacyLineViolationKey(v));
    }
  }
  return { ok: true, keys, error: null };
}

module.exports = {
  REPORT_VERSION,
  KEY_SCHEMA,
  norm,
  relFromRoot,
  normalizeSnippetForHash,
  hashString,
  snippetHashFromSnippet,
  violationKey,
  legacyLineViolationKey,
  dedupeViolations,
  loadBaselineKeys,
};
