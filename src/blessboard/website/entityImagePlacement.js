"use strict";

/**
 * Persist entity image placement without a schema migration.
 * Stores validated placement maps on public_pages.layout_metadata.entityImagePlacements.
 */

const { validateImagePlacement } = require("../../platform/website/imagePlacement");

/**
 * @param {object|null|undefined} pageLayout
 * @param {string} kind
 * @param {string} entityKey
 * @param {unknown} placement
 */
function mergeEntityImagePlacement(pageLayout, kind, entityKey, placement) {
  const base =
    pageLayout && typeof pageLayout === "object" && !Array.isArray(pageLayout)
      ? { ...pageLayout }
      : {};
  const map =
    base.entityImagePlacements &&
    typeof base.entityImagePlacements === "object" &&
    !Array.isArray(base.entityImagePlacements)
      ? { ...base.entityImagePlacements }
      : {};
  const key = `${String(kind)}:${String(entityKey)}`;
  const checked = validateImagePlacement(placement);
  if (!checked.ok || !checked.value) {
    delete map[key];
  } else {
    map[key] = checked.value;
  }
  base.entityImagePlacements = map;
  return base;
}

/**
 * @param {object|null|undefined} pageLayout
 * @param {string} kind
 * @param {string} entityKey
 */
function readEntityImagePlacement(pageLayout, kind, entityKey) {
  const map =
    pageLayout &&
    pageLayout.entityImagePlacements &&
    typeof pageLayout.entityImagePlacements === "object"
      ? pageLayout.entityImagePlacements
      : null;
  if (!map) return null;
  const key = `${String(kind)}:${String(entityKey)}`;
  const raw = map[key];
  const checked = validateImagePlacement(raw);
  return checked.ok ? checked.value : null;
}

/**
 * Attach imagePlacement onto entity rows from page layout metadata.
 * @param {object[]} items
 * @param {object|null|undefined} pageLayout
 * @param {string} kind
 */
function attachEntityImagePlacements(items, pageLayout, kind) {
  if (!Array.isArray(items) || !items.length) return items;
  return items.map((item) => {
    if (!item || typeof item !== "object") return item;
    const key = String(item.id || item._draftKey || "");
    if (!key) return item;
    const fromDraft = item.placement || item.imagePlacement || null;
    const fromPage = readEntityImagePlacement(pageLayout, kind, key);
    const placement = fromDraft || fromPage;
    if (!placement) return item;
    return { ...item, imagePlacement: placement, placement };
  });
}

module.exports = {
  mergeEntityImagePlacement,
  readEntityImagePlacement,
  attachEntityImagePlacements,
};
