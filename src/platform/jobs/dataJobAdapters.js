"use strict";

/**
 * Product adapters for platform data jobs.
 * entity_key is product-configured (e.g. "bb.members", "ac.patients") —
 * not a shared generic entity model.
 */

/** @type {Map<string, object>} */
const adapters = new Map();

function adapterKey(productCode, entityKey) {
  return `${String(productCode).toLowerCase()}::${String(entityKey)}`;
}

/**
 * @param {{
 *   productCode: string,
 *   entityKey: string,
 *   jobKinds?: Array<'import'|'export'>,
 *   previewImport?: Function,
 *   commitImport?: Function,
 *   buildExport?: Function,
 * }} adapter
 */
function registerDataJobAdapter(adapter) {
  const src = adapter && typeof adapter === "object" ? adapter : {};
  const productCode = String(src.productCode || "")
    .trim()
    .toLowerCase();
  const entityKey = String(src.entityKey || "").trim();
  if (productCode !== "blessboard" && productCode !== "activeclinic") {
    return { ok: false, code: "invalid_product_code" };
  }
  if (!entityKey || entityKey.length > 120) {
    return { ok: false, code: "invalid_entity_key" };
  }
  const jobKinds = Array.isArray(src.jobKinds)
    ? src.jobKinds.map(String)
    : ["import", "export"];
  adapters.set(adapterKey(productCode, entityKey), {
    productCode,
    entityKey,
    jobKinds,
    previewImport: typeof src.previewImport === "function" ? src.previewImport : null,
    commitImport: typeof src.commitImport === "function" ? src.commitImport : null,
    buildExport: typeof src.buildExport === "function" ? src.buildExport : null,
  });
  return { ok: true, code: "ok", productCode, entityKey };
}

function clearDataJobAdapters() {
  adapters.clear();
}

function getDataJobAdapter(productCode, entityKey) {
  return adapters.get(adapterKey(productCode, entityKey)) || null;
}

function listDataJobAdapters(productCode) {
  const code = productCode
    ? String(productCode).trim().toLowerCase()
    : null;
  const out = [];
  for (const adapter of adapters.values()) {
    if (code && adapter.productCode !== code) continue;
    out.push({
      productCode: adapter.productCode,
      entityKey: adapter.entityKey,
      jobKinds: adapter.jobKinds.slice(),
    });
  }
  return out.sort((a, b) =>
    `${a.productCode}:${a.entityKey}`.localeCompare(`${b.productCode}:${b.entityKey}`)
  );
}

module.exports = {
  registerDataJobAdapter,
  clearDataJobAdapters,
  getDataJobAdapter,
  listDataJobAdapters,
};
