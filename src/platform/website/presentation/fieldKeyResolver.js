"use strict";

/**
 * Resolve product storage keys ↔ canonical presentation keys.
 * Read-only vocabulary helpers — does not mutate website_content.
 */

const {
  PRODUCT_CODE,
  UNIVERSAL_FIELDS,
  productStorageKeyFor,
  presentationKeyForProductStorage,
  getUniversalField,
} = require("./universalFieldVocabulary");
const {
  resolveLegacyToPresentationKey,
  findLegacyField,
} = require("./legacyFieldMap");

/**
 * Map a content key bag (product storage keys) into presentation-key bag
 * for universal fields only. Unknown keys are left under `__unmapped`.
 *
 * @param {string} productCode
 * @param {Record<string, unknown>} contentByStorageKey
 * @returns {{ presentation: Record<string, unknown>, unmapped: Record<string, unknown> }}
 */
function mapUniversalContentToPresentation(productCode, contentByStorageKey) {
  const source = contentByStorageKey && typeof contentByStorageKey === "object" ? contentByStorageKey : {};
  const presentation = {};
  const unmapped = {};
  const consumed = new Set();

  for (const field of UNIVERSAL_FIELDS) {
    const storageKey = productStorageKeyFor(productCode, field.presentationKey);
    if (!storageKey) continue;
    if (Object.prototype.hasOwnProperty.call(source, storageKey)) {
      presentation[field.presentationKey] = source[storageKey];
      consumed.add(storageKey);
    }
  }

  for (const [key, value] of Object.entries(source)) {
    if (consumed.has(key)) continue;
    const legacyTarget = resolveLegacyToPresentationKey(productCode, key);
    if (legacyTarget && presentation[legacyTarget] == null) {
      presentation[legacyTarget] = value;
      consumed.add(key);
      continue;
    }
    unmapped[key] = value;
  }

  return { presentation, unmapped };
}

/**
 * Inverse: presentation keys → product storage keys for universal fields.
 * @param {string} productCode
 * @param {Record<string, unknown>} presentationByKey
 * @returns {Record<string, unknown>}
 */
function mapPresentationToProductStorage(productCode, presentationByKey) {
  const source = presentationByKey && typeof presentationByKey === "object" ? presentationByKey : {};
  const out = {};
  for (const [presentationKey, value] of Object.entries(source)) {
    const storageKey = productStorageKeyFor(productCode, presentationKey);
    if (storageKey) {
      out[storageKey] = value;
    }
  }
  return out;
}

/**
 * Resolve any known key (universal or legacy) to a presentation key.
 * @param {string} productCode
 * @param {string} key
 * @returns {{ presentationKey: string|null, source: "universal"|"legacy"|"unknown", field?: object }}
 */
function resolveToPresentationKey(productCode, key) {
  const fromUniversal = presentationKeyForProductStorage(productCode, key);
  if (fromUniversal) {
    return {
      presentationKey: fromUniversal,
      source: "universal",
      field: getUniversalField(fromUniversal),
    };
  }
  const legacy = findLegacyField(productCode, key);
  if (legacy) {
    return {
      presentationKey: legacy.canonicalPresentationKey,
      source: "legacy",
      field: legacy,
    };
  }
  // Exact presentation key passthrough
  if (getUniversalField(key)) {
    return { presentationKey: key, source: "universal", field: getUniversalField(key) };
  }
  return { presentationKey: null, source: "unknown" };
}

module.exports = {
  PRODUCT_CODE,
  mapUniversalContentToPresentation,
  mapPresentationToProductStorage,
  resolveToPresentationKey,
  productStorageKeyFor,
  presentationKeyForProductStorage,
};
