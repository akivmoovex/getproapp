"use strict";

/**
 * Shared append-only status-history helpers.
 * Products keep their own tables / columns; this only normalizes entries
 * and optional transition checks. Not a shared domain status machine.
 */

/**
 * @param {{
 *   from?: string|null,
 *   to: string,
 *   by?: string|null,
 *   at?: string|Date|null,
 *   note?: string|null,
 *   meta?: object|null,
 * }} input
 */
function buildStatusHistoryEntry(input) {
  const src = input && typeof input === "object" ? input : {};
  const to = String(src.to == null ? "" : src.to).trim();
  if (!to) {
    return { ok: false, code: "invalid_status", entry: null };
  }
  const from =
    src.from == null || src.from === ""
      ? null
      : String(src.from).trim() || null;
  const at =
    src.at instanceof Date
      ? src.at.toISOString()
      : src.at
        ? String(src.at)
        : new Date().toISOString();
  const entry = {
    at,
    from,
    to,
    by: src.by == null || src.by === "" ? null : String(src.by),
  };
  if (src.note != null && String(src.note).trim()) {
    entry.note = String(src.note).trim().slice(0, 500);
  }
  if (src.meta && typeof src.meta === "object" && !Array.isArray(src.meta)) {
    entry.meta = src.meta;
  }
  return { ok: true, code: "ok", entry };
}

/**
 * Append one history entry to an existing JSON array (immutable).
 * @param {unknown} existing
 * @param {object} entry
 * @param {{ maxEntries?: number }} [opts]
 */
function appendStatusHistory(existing, entry, opts) {
  const options = opts || {};
  const maxEntries = Math.min(
    Math.max(Number(options.maxEntries) || 500, 1),
    5000
  );
  const base = Array.isArray(existing) ? existing.slice() : [];
  if (!entry || typeof entry !== "object") {
    return { ok: false, code: "invalid_entry", history: base };
  }
  base.push(entry);
  if (base.length > maxEntries) {
    return {
      ok: true,
      code: "ok",
      history: base.slice(base.length - maxEntries),
      truncated: true,
    };
  }
  return { ok: true, code: "ok", history: base, truncated: false };
}

/**
 * @param {string|null|undefined} from
 * @param {string} to
 * @param {Record<string, string[]>} allowedMap - fromStatus -> allowed next statuses
 *   Use "*" key for transitions from null/unknown.
 */
function assertStatusTransition(from, to, allowedMap) {
  const map = allowedMap && typeof allowedMap === "object" ? allowedMap : null;
  if (!map) {
    return { ok: false, code: "invalid_transition_map" };
  }
  const next = String(to == null ? "" : to).trim();
  if (!next) {
    return { ok: false, code: "invalid_status" };
  }
  const current =
    from == null || from === "" ? null : String(from).trim() || null;
  const key = current == null ? "*" : current;
  const allowed = Array.isArray(map[key])
    ? map[key]
    : Array.isArray(map["*"])
      ? map["*"]
      : null;
  if (!allowed) {
    return { ok: false, code: "transition_not_allowed", from: current, to: next };
  }
  if (!allowed.map(String).includes(next)) {
    return { ok: false, code: "transition_not_allowed", from: current, to: next };
  }
  return { ok: true, code: "ok", from: current, to: next };
}

/**
 * Convenience: build + append in one step.
 */
function appendBuiltStatusHistory(existing, input, opts) {
  const built = buildStatusHistoryEntry(input);
  if (!built.ok) return built;
  return appendStatusHistory(existing, built.entry, opts);
}

module.exports = {
  buildStatusHistoryEntry,
  appendStatusHistory,
  assertStatusTransition,
  appendBuiltStatusHistory,
};
