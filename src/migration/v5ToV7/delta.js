"use strict";

const fs = require("fs");

const DEFAULT_WATERMARK = Object.freeze({
  blessboard: {},
  activeclinic: {},
  capturedAt: null,
  previousCapturedAt: null,
});

/** Tables that always reconcile on delta even when updated_at exists. */
const FULL_RECONCILE_ON_DELTA = Object.freeze([
  "blessboard.page_sections",
  "platform.identity_product_profiles",
]);

function loadWatermark(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { ...DEFAULT_WATERMARK };
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveWatermark(filePath, watermark) {
  if (!filePath) return;
  fs.mkdirSync(require("path").dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(watermark, null, 2));
}

/**
 * Build SQL predicate for rows changed since watermark.
 */
function updatedSinceClause(alias, sinceIso) {
  if (!sinceIso) return { sql: "", params: [] };
  const col = alias ? `${alias}.updated_at` : "updated_at";
  return { sql: ` AND ${col} > $1`, params: [sinceIso] };
}

function usesFullReconcileOnDelta(qualifiedTable) {
  return FULL_RECONCILE_ON_DELTA.includes(qualifiedTable);
}

function beginWatermarkCycle(existing) {
  const startedAt = new Date().toISOString();
  return {
    ...existing,
    previousCapturedAt: existing.capturedAt || null,
    cycleStartedAt: startedAt,
  };
}

function finalizeWatermarkCycle(watermark) {
  return {
    ...watermark,
    capturedAt: watermark.cycleStartedAt || new Date().toISOString(),
    cycleStartedAt: null,
  };
}

module.exports = {
  DEFAULT_WATERMARK,
  FULL_RECONCILE_ON_DELTA,
  loadWatermark,
  saveWatermark,
  updatedSinceClause,
  usesFullReconcileOnDelta,
  beginWatermarkCycle,
  finalizeWatermarkCycle,
};
