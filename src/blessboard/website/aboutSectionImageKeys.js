"use strict";

/**
 * About-page section image identity helpers.
 * Keeps the Life Together featured image isolated from the three-slot gallery grid.
 */

const LIFE_TOGETHER_SECTION_KEYS = Object.freeze(["life_together", "gallery"]);
const GALLERY_SLOT_RE = /^gallery_(\d+)$/i;

function normalizeSectionKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isLifeTogetherSectionKey(sectionKey) {
  const key = normalizeSectionKey(sectionKey);
  if (!key) return false;
  if (GALLERY_SLOT_RE.test(key)) return false;
  return LIFE_TOGETHER_SECTION_KEYS.includes(key);
}

function isAboutGallerySlotKey(sectionKey) {
  return GALLERY_SLOT_RE.test(normalizeSectionKey(sectionKey));
}

function aboutGallerySlotIndex(sectionKey) {
  const m = normalizeSectionKey(sectionKey).match(GALLERY_SLOT_RE);
  if (!m) return -1;
  const idx = Number(m[1]) - 1;
  return Number.isInteger(idx) && idx >= 0 ? idx : -1;
}

/** Canonical section key for new Life Together writes. */
const LIFE_TOGETHER_SECTION_KEY = "life_together";

/** Max independent gallery-grid slots on About. */
const ABOUT_GALLERY_SLOT_COUNT = 3;

/**
 * Collect ordered gallery-grid URLs from About sections.
 * Only gallery_1..gallery_N participate — never Life Together / visitor / other media.
 * @param {Array<{ sectionKey?: string, mediaUrl?: string|null }>|null|undefined} sections
 * @param {{ maxSlots?: number }} [options]
 * @returns {string[]}
 */
function collectAboutGallerySlotUrls(sections, options) {
  const maxSlots = Math.max(
    1,
    Number(options && options.maxSlots) || ABOUT_GALLERY_SLOT_COUNT
  );
  const bySlot = new Map();
  for (const section of sections || []) {
    if (!section) continue;
    const idx = aboutGallerySlotIndex(section.sectionKey);
    if (idx < 0 || idx >= maxSlots) continue;
    const src = section.mediaUrl != null ? String(section.mediaUrl).trim() : "";
    if (!src) continue;
    bySlot.set(idx, src);
  }
  const out = [];
  for (let i = 0; i < maxSlots; i += 1) {
    if (bySlot.has(i)) out.push(bySlot.get(i));
  }
  return out;
}

module.exports = {
  LIFE_TOGETHER_SECTION_KEY,
  LIFE_TOGETHER_SECTION_KEYS,
  ABOUT_GALLERY_SLOT_COUNT,
  isLifeTogetherSectionKey,
  isAboutGallerySlotKey,
  aboutGallerySlotIndex,
  collectAboutGallerySlotUrls,
  normalizeSectionKey,
};
