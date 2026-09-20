"use strict";

/**
 * Stable section identifiers and deterministic ordering helpers.
 */

const crypto = require("crypto");

const SECTION_KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/;

/**
 * Allocate a stable, immutable section key (BlessBoard section_key / AC custom id).
 * @param {string} [prefix]
 * @param {{ bytes?: number, style?: 'bb'|'ac' }} [opts]
 */
function allocateStableSectionId(prefix, opts) {
  const options = opts || {};
  const style = options.style === "ac" ? "ac" : "bb";
  const bytes = Number.isFinite(options.bytes) ? Math.max(2, Math.min(8, options.bytes)) : 3;
  const safe = String(prefix || "section")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  const hex = crypto.randomBytes(bytes).toString("hex");
  if (style === "ac") {
    return `s${hex}`;
  }
  const key = `${safe || "section"}_${hex}`;
  if (!SECTION_KEY_RE.test(key)) {
    return `section_${hex}`;
  }
  return key;
}

/**
 * Sort sections deterministically by sortOrder / sort_order then stable id.
 * @param {object[]} sections
 * @param {{ idKey?: string, orderKey?: string }} [opts]
 */
function sortSectionsDeterministically(sections, opts) {
  const options = opts || {};
  const idKey = options.idKey || "sectionKey";
  const orderKey = options.orderKey || "sortOrder";
  return (sections || [])
    .slice()
    .sort((a, b) => {
      const ao = Number(
        a && (a[orderKey] != null ? a[orderKey] : a.sort_order != null ? a.sort_order : 0)
      );
      const bo = Number(
        b && (b[orderKey] != null ? b[orderKey] : b.sort_order != null ? b.sort_order : 0)
      );
      if (ao !== bo) return ao - bo;
      const ai = String(
        (a && (a[idKey] || a.sectionKey || a.id || "")) || ""
      ).toLowerCase();
      const bi = String(
        (b && (b[idKey] || b.sectionKey || b.id || "")) || ""
      ).toLowerCase();
      if (ai < bi) return -1;
      if (ai > bi) return 1;
      return 0;
    });
}

/**
 * Re-number sort orders as 10, 20, 30… following the given id order.
 * Unmentioned sections keep relative order after the listed ones.
 * @param {object[]} sections
 * @param {string[]} orderIds
 * @param {{ idKey?: string }} [opts]
 */
function applyDeterministicOrder(sections, orderIds, opts) {
  const idKey = (opts && opts.idKey) || "sectionKey";
  const list = Array.isArray(sections) ? sections.slice() : [];
  const byId = new Map();
  for (const section of list) {
    const id = String(
      (section && (section[idKey] || section.sectionKey || section.id)) || ""
    );
    if (id) byId.set(id, section);
  }
  const ordered = [];
  const seen = new Set();
  for (const id of orderIds || []) {
    const key = String(id || "");
    if (!key || seen.has(key) || !byId.has(key)) continue;
    ordered.push(byId.get(key));
    seen.add(key);
  }
  const remainder = sortSectionsDeterministically(
    list.filter((s) => {
      const id = String((s && (s[idKey] || s.sectionKey || s.id)) || "");
      return id && !seen.has(id);
    }),
    { idKey }
  );
  const merged = ordered.concat(remainder);
  return merged.map((section, index) => ({
    ...section,
    sortOrder: (index + 1) * 10,
    sort_order: String((index + 1) * 10),
  }));
}

module.exports = {
  SECTION_KEY_RE,
  allocateStableSectionId,
  sortSectionsDeterministically,
  applyDeterministicOrder,
};
