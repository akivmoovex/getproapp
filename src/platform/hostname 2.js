"use strict";

/**
 * Shared hostname normalizer for platform.domains lookups.
 * Rules align with platform.domains CHECK constraints and normalize trigger:
 * lowercase, trim, strip trailing dots; reject protocol/path/port/query/fragment/
 * embedded whitespace/empty/malformed labels. Never extracts a host from a URL.
 */

const HOSTNAME_LABEL_PATTERN =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/**
 * @param {unknown} input
 * @returns {{ ok: true, hostname: string } | { ok: false, reason: string }}
 */
function normalizeHostname(input) {
  if (input == null) {
    return { ok: false, reason: "empty" };
  }
  const raw = String(input);
  if (!raw) {
    return { ok: false, reason: "empty" };
  }

  // Reject URL-like and structural characters before any extraction.
  if (/:\/\//i.test(raw)) {
    return { ok: false, reason: "protocol" };
  }
  if (raw.includes("/")) {
    return { ok: false, reason: "path" };
  }
  if (raw.includes("?")) {
    return { ok: false, reason: "query" };
  }
  if (raw.includes("#")) {
    return { ok: false, reason: "fragment" };
  }
  if (raw.includes(":")) {
    return { ok: false, reason: "port" };
  }

  let normalized = raw.toLowerCase().trim();
  while (normalized.endsWith(".")) {
    normalized = normalized.slice(0, -1);
  }

  if (!normalized) {
    return { ok: false, reason: "empty" };
  }
  if (/\s/.test(normalized)) {
    return { ok: false, reason: "whitespace" };
  }
  if (normalized.length > 253) {
    return { ok: false, reason: "too_long" };
  }
  if (!HOSTNAME_LABEL_PATTERN.test(normalized)) {
    return { ok: false, reason: "malformed" };
  }

  return { ok: true, hostname: normalized };
}

module.exports = {
  normalizeHostname,
  HOSTNAME_LABEL_PATTERN,
};
