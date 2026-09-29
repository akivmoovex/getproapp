"use strict";

/**
 * Generic ordered-list draft mutators (PC11).
 *
 * Platform owns id-keyed list rewrite mechanics used when a CMS stores an
 * array under one website_content draft key. Product adapters own item
 * shape, catalogues, validation, and which content keys are used.
 *
 * No product conditionals — callers supply lists and ids.
 */

/**
 * @param {unknown} value
 * @returns {Array}
 */
function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Reorder items so `orderedIds` come first (stable), then any remainder.
 * Assigns `sortField` to "0".."n-1" by default (string, matching AC CMS).
 *
 * @param {Array<object>} items
 * @param {Array<string|number>} orderedIds
 * @param {{ idField?: string, sortField?: string, stringifySort?: boolean }} [opts]
 * @returns {Array<object>}
 */
function reorderByIds(items, orderedIds, opts) {
  const idField = (opts && opts.idField) || "id";
  const sortField = (opts && opts.sortField) || "sort_order";
  const stringifySort = !(opts && opts.stringifySort === false);
  const ids = Array.isArray(orderedIds) ? orderedIds.map(String) : [];
  const byId = new Map(asArray(items).map((item) => [String(item[idField]), item]));
  const ordered = [];
  ids.forEach((id, index) => {
    const item = byId.get(id);
    if (item) {
      ordered.push({
        ...item,
        [sortField]: stringifySort ? String(index) : index,
      });
      byId.delete(id);
    }
  });
  byId.forEach((item) => {
    ordered.push({
      ...item,
      [sortField]: stringifySort ? String(ordered.length) : ordered.length,
    });
  });
  return ordered;
}

/**
 * @param {Array<object>} items
 * @param {string|number} id
 * @param {string} [idField]
 * @returns {Array<object>}
 */
function removeById(items, id, idField) {
  const field = idField || "id";
  const wanted = String(id);
  return asArray(items).filter((item) => String(item[field]) !== wanted);
}

/**
 * Replace the item with matching id, or append if missing.
 * @param {Array<object>} items
 * @param {object} next
 * @param {string} [idField]
 * @returns {Array<object>}
 */
function upsertById(items, next, idField) {
  const field = idField || "id";
  if (!next || next[field] == null) return asArray(items);
  const wanted = String(next[field]);
  let found = false;
  const mapped = asArray(items).map((item) => {
    if (String(item[field]) === wanted) {
      found = true;
      return next;
    }
    return item;
  });
  return found ? mapped : mapped.concat([next]);
}

module.exports = {
  asArray,
  reorderByIds,
  removeById,
  upsertById,
};
