"use strict";

/**
 * PersonPresentation — website card DTO only.
 *
 * Doctor domain → PersonPresentation → PersonCard
 * Pastor/Leader domain → PersonPresentation → PersonCard
 *
 * Never merge clinical doctor rows with church leadership rows.
 * Never invent clinical credentials — badges only when adapters supply data.
 */

const PERSON_MEDIA_VARIANTS = Object.freeze({
  AVATAR: "avatar",
  PORTRAIT: "portrait",
});

const PERSON_PRESENTATION_FIELDS = Object.freeze([
  "image",
  "name",
  "title",
  "subtitle",
  "description",
  "cta",
  "secondaryCta",
  "badges",
  "mediaVariant",
  "metaLine",
  "displayOrder",
  "visibility",
  "featured",
]);

/**
 * @typedef {object} PersonCta
 * @property {string|null} [label]
 * @property {string|null} [url]
 */

/**
 * @typedef {object} PersonBadge
 * @property {string} label
 * @property {string|null} [tone]
 */

/**
 * @typedef {object} PersonPresentation
 * @property {object|string|null} [image]
 * @property {string} name
 * @property {string|null} [title]
 * @property {string|null} [subtitle]
 * @property {string|null} [description]
 * @property {PersonCta|null} [cta]
 * @property {PersonCta|null} [secondaryCta]
 * @property {PersonBadge[]} [badges]
 * @property {string} [mediaVariant]
 * @property {string|null} [metaLine] optional status/availability line — never invent clinical data
 * @property {number} [displayOrder]
 * @property {boolean} [visibility]
 * @property {boolean} [featured]
 * @property {string|null} [sourceProduct] product code that produced this DTO
 * @property {string|null} [sourceDomain] e.g. doctor | pastor_leader (metadata only)
 * @property {string|null} [sourceId] product domain id (opaque to platform)
 */

function optionalCta(raw, code) {
  if (raw == null) return { ok: true, value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, code: code || "invalid_person_cta" };
  }
  return {
    ok: true,
    value: {
      label: raw.label == null ? null : String(raw.label).trim().slice(0, 80) || null,
      url: raw.url == null ? null : String(raw.url).trim().slice(0, 500) || null,
    },
  };
}

function normalizeBadges(raw) {
  if (raw == null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, code: "invalid_person_badges" };
  const badges = [];
  for (const item of raw.slice(0, 12)) {
    if (item == null) continue;
    if (typeof item === "string") {
      const label = String(item).trim().slice(0, 80);
      if (label) badges.push({ label, tone: null });
      continue;
    }
    if (typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, code: "invalid_person_badge" };
    }
    const label = item.label == null ? "" : String(item.label).trim().slice(0, 80);
    if (!label) continue;
    badges.push({
      label,
      tone: item.tone == null ? null : String(item.tone).trim().slice(0, 40) || null,
    });
  }
  return { ok: true, value: badges };
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: PersonPresentation } | { ok: false, code: string, message?: string }}
 */
function validatePersonPresentation(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, code: "invalid_person_presentation" };
  }
  const name = String(raw.name == null ? "" : raw.name).trim();
  if (!name || name.length > 200) {
    return { ok: false, code: "invalid_person_name" };
  }

  const title = raw.title == null ? null : String(raw.title).trim().slice(0, 160) || null;
  const subtitle = raw.subtitle == null ? null : String(raw.subtitle).trim().slice(0, 200) || null;
  const description =
    raw.description == null ? null : String(raw.description).trim().slice(0, 4000) || null;

  const cta = optionalCta(raw.cta, "invalid_person_cta");
  if (!cta.ok) return cta;
  const secondaryCta = optionalCta(raw.secondaryCta, "invalid_person_secondary_cta");
  if (!secondaryCta.ok) return secondaryCta;

  const badges = normalizeBadges(raw.badges);
  if (!badges.ok) return badges;

  let mediaVariant = PERSON_MEDIA_VARIANTS.AVATAR;
  if (raw.mediaVariant != null && raw.mediaVariant !== "") {
    const variant = String(raw.mediaVariant).trim();
    if (!Object.values(PERSON_MEDIA_VARIANTS).includes(variant)) {
      return { ok: false, code: "invalid_person_media_variant" };
    }
    mediaVariant = variant;
  }

  let displayOrder = 0;
  if (raw.displayOrder != null && raw.displayOrder !== "") {
    const n = Number(raw.displayOrder);
    if (!Number.isFinite(n) || n < 0 || n > 100000) {
      return { ok: false, code: "invalid_person_display_order" };
    }
    displayOrder = Math.floor(n);
  }

  const visibility = raw.visibility === false ? false : true;
  const featured = raw.featured === true;
  const metaLine =
    raw.metaLine == null || raw.metaLine === ""
      ? null
      : String(raw.metaLine).trim().slice(0, 160) || null;

  /** @type {PersonPresentation} */
  const value = {
    image: raw.image == null ? null : raw.image,
    name,
    title,
    subtitle,
    description,
    cta: cta.value,
    secondaryCta: secondaryCta.value,
    badges: badges.value,
    mediaVariant,
    metaLine,
    displayOrder,
    visibility,
    featured,
    sourceProduct: raw.sourceProduct == null ? null : String(raw.sourceProduct).trim() || null,
    sourceDomain: raw.sourceDomain == null ? null : String(raw.sourceDomain).trim() || null,
    sourceId: raw.sourceId == null ? null : String(raw.sourceId).trim() || null,
  };
  return { ok: true, value };
}

/**
 * Build a PersonPresentation from a product adapter payload (already mapped).
 * @param {object} input
 * @returns {{ ok: true, value: PersonPresentation } | { ok: false, code: string }}
 */
function createPersonPresentation(input) {
  return validatePersonPresentation(input);
}

module.exports = {
  PERSON_PRESENTATION_FIELDS,
  PERSON_MEDIA_VARIANTS,
  validatePersonPresentation,
  createPersonPresentation,
};
