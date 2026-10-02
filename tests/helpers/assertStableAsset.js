"use strict";

/**
 * Stable UI asset contracts for V2.03 Wave 3.
 *
 * Protects: correct stylesheet/script path, required presence, cache-bust query
 * presence — without pinning volatile ?v=<fingerprint> integers/tokens.
 */

const assert = require("node:assert/strict");

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches `asset.css` or `asset.css?v=<non-empty cache-bust token>`. */
function assetWithOptionalCacheBust(assetFileName) {
  const base = escapeRegExp(assetFileName);
  return new RegExp(`${base}(?:\\?v=[^"'\\s>]+)?`);
}

/** Requires a non-empty cache-bust query (preferred for production shells). */
function assetWithCacheBust(assetFileName) {
  const base = escapeRegExp(assetFileName);
  return new RegExp(`${base}\\?v=[^"'\\s>]+`);
}

/**
 * @param {string} haystack HTML or source
 * @param {string} assetFileName e.g. tenant-public.css
 * @param {{ requireCacheBust?: boolean, message?: string }} [opts]
 */
function assertAssetPresent(haystack, assetFileName, opts) {
  const requireCacheBust = !opts || opts.requireCacheBust !== false;
  const re = requireCacheBust
    ? assetWithCacheBust(assetFileName)
    : assetWithOptionalCacheBust(assetFileName);
  assert.match(
    String(haystack || ""),
    re,
    opts && opts.message
      ? opts.message
      : `expected asset ${assetFileName}${requireCacheBust ? " with cache-bust ?v=" : ""}`
  );
}

/**
 * Extract cache-bust token for an asset, or null.
 * @param {string} haystack
 * @param {string} assetFileName
 */
function extractCacheBust(haystack, assetFileName) {
  const re = new RegExp(`${escapeRegExp(assetFileName)}\\?v=([^"'\\s>]+)`);
  const m = String(haystack || "").match(re);
  return m ? m[1] : null;
}

/**
 * Assert the same asset uses the same cache-bust token across sources
 * (consistency without pinning a specific revision).
 * @param {string[]} sources
 * @param {string} assetFileName
 */
function assertCacheBustConsistent(sources, assetFileName) {
  const tokens = sources.map((src) => extractCacheBust(src, assetFileName));
  assert.ok(
    tokens.every((t) => t),
    `missing ${assetFileName}?v= in one or more sources: ${JSON.stringify(tokens)}`
  );
  const first = tokens[0];
  for (const t of tokens) {
    assert.equal(t, first, `${assetFileName} cache-bust must match across shells/models`);
  }
}

module.exports = {
  escapeRegExp,
  assetWithOptionalCacheBust,
  assetWithCacheBust,
  assertAssetPresent,
  extractCacheBust,
  assertCacheBustConsistent,
};
