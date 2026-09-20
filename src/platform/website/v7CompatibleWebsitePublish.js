"use strict";

/**
 * Guard shared V7 publish snapshots against V8-only content shapes.
 * Drafts may hold experimental formats; publishing into the shared representation
 * is blocked until a compatible adapter exists.
 *
 * Only explicit V8 markers / format versions are blocked — do not invent
 * allowlists of every legacy CMS `type` field (false positives break BB/AC publish).
 */

const V8_ONLY_MARKERS = Object.freeze([
  "v8Format",
  "v8_format",
  "v8Only",
  "v8_only",
]);

/**
 * @param {unknown} value
 * @param {string[]} path
 * @param {{ contentKey?: string, blockers: object[] }} acc
 */
function walkForIncompatiblePublishShapes(value, path, acc) {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      walkForIncompatiblePublishShapes(value[i], path.concat(String(i)), acc);
    }
    return;
  }
  if (typeof value !== "object") return;

  for (const marker of V8_ONLY_MARKERS) {
    if (value[marker] === true || value[marker] === "true" || value[marker] === 1) {
      acc.blockers.push({
        contentKey: acc.contentKey || null,
        path: path.concat(marker).join("."),
        reason: "v8_only_marker",
        marker,
      });
    }
  }

  const formatVersion = value.formatVersion != null ? value.formatVersion : value.schemaVersion;
  if (formatVersion != null) {
    const n = Number(formatVersion);
    if (Number.isFinite(n) && n > 1) {
      acc.blockers.push({
        contentKey: acc.contentKey || null,
        path: path
          .concat(value.formatVersion != null ? "formatVersion" : "schemaVersion")
          .join("."),
        reason: "incompatible_format_version",
        formatVersion: n,
      });
    }
  }

  for (const [k, v] of Object.entries(value)) {
    if (V8_ONLY_MARKERS.includes(k)) continue;
    walkForIncompatiblePublishShapes(v, path.concat(k), acc);
  }
}

/**
 * @param {Array<{ contentKey?: string, draftValue?: unknown, publishedValue?: unknown }>} rows
 * @returns {{ ok: true } | { ok: false, code: string, blockers: object[] }}
 */
function assertDraftRowsV7CompatibleForPublish(rows) {
  const blockers = [];
  for (const row of rows || []) {
    const draft = row && row.draftValue;
    const published = row && row.publishedValue;
    if (draft == null) continue;
    try {
      if (JSON.stringify(draft) === JSON.stringify(published)) continue;
    } catch {
      /* fall through and inspect */
    }
    const acc = { contentKey: row.contentKey || null, blockers: [] };
    walkForIncompatiblePublishShapes(draft, [], acc);
    for (const b of acc.blockers) blockers.push(b);
  }
  if (blockers.length) {
    return {
      ok: false,
      code: "v8_incompatible_publish",
      blockers,
    };
  }
  return { ok: true };
}

/**
 * @param {unknown} snapshot
 */
function assertSnapshotV7Compatible(snapshot) {
  const acc = { contentKey: null, blockers: [] };
  walkForIncompatiblePublishShapes(snapshot, [], acc);
  if (acc.blockers.length) {
    return { ok: false, code: "v8_incompatible_publish", blockers: acc.blockers };
  }
  return { ok: true };
}

module.exports = {
  V8_ONLY_MARKERS,
  assertDraftRowsV7CompatibleForPublish,
  assertSnapshotV7Compatible,
  walkForIncompatiblePublishShapes,
};
