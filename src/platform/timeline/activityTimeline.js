"use strict";

/**
 * Shared activity timeline composer.
 * Products pass already-scoped event streams; this only normalizes / merges.
 * Not a shared domain event store.
 */

/**
 * @param {{
 *   at: string|Date,
 *   kind: string,
 *   title: string,
 *   summary?: string|null,
 *   actorLabel?: string|null,
 *   meta?: object|null,
 *   source?: string|null,
 * }} input
 */
function buildTimelineEntry(input) {
  const src = input && typeof input === "object" ? input : {};
  const kind = String(src.kind || "").trim();
  const title = String(src.title || "").trim();
  if (!kind || !title) {
    return { ok: false, code: "invalid_timeline_entry", entry: null };
  }
  const at =
    src.at instanceof Date
      ? src.at.toISOString()
      : src.at
        ? String(src.at)
        : new Date().toISOString();
  const entry = {
    at,
    kind: kind.slice(0, 80),
    title: title.slice(0, 200),
    summary:
      src.summary == null || src.summary === ""
        ? null
        : String(src.summary).trim().slice(0, 500),
    actorLabel:
      src.actorLabel == null || src.actorLabel === ""
        ? null
        : String(src.actorLabel).trim().slice(0, 120),
    source:
      src.source == null || src.source === ""
        ? null
        : String(src.source).trim().slice(0, 80),
  };
  if (src.meta && typeof src.meta === "object" && !Array.isArray(src.meta)) {
    entry.meta = src.meta;
  }
  return { ok: true, code: "ok", entry };
}

/**
 * Map status-history rows into timeline entries.
 * @param {Array<object>} history
 * @param {{ source?: string, kind?: string }} [opts]
 */
function timelineFromStatusHistory(history, opts) {
  const options = opts || {};
  const rows = Array.isArray(history) ? history : [];
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const built = buildTimelineEntry({
      at: row.at || row.createdAt || row.created_at,
      kind: options.kind || "status_change",
      title: row.to
        ? `Status → ${row.to}`
        : String(row.title || "Status change"),
      summary: row.note || (row.from ? `From ${row.from}` : null),
      actorLabel: row.by || row.actorLabel || null,
      source: options.source || "status_history",
      meta: { from: row.from || null, to: row.to || null },
    });
    if (built.ok) out.push(built.entry);
  }
  return out;
}

/**
 * Merge multiple timeline streams, newest first.
 * @param {Array<Array<object>>} streams
 * @param {{ limit?: number }} [opts]
 */
function mergeTimelineStreams(streams, opts) {
  const options = opts || {};
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
  const flat = [];
  for (const stream of Array.isArray(streams) ? streams : []) {
    if (!Array.isArray(stream)) continue;
    for (const entry of stream) {
      if (entry && typeof entry === "object" && entry.at && entry.title) {
        flat.push(entry);
      }
    }
  }
  flat.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return flat.slice(0, limit);
}

module.exports = {
  buildTimelineEntry,
  timelineFromStatusHistory,
  mergeTimelineStreams,
};
