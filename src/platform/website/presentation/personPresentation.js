"use strict";

/**
 * PersonPresentation — website card DTO only.
 *
 * Doctor domain → PersonPresentation → PersonCard
 * Pastor/Leader domain → PersonPresentation → PersonCard
 *
 * Never merge clinical doctor rows with church leadership rows.
 */

const PERSON_PRESENTATION_FIELDS = Object.freeze([
  "image",
  "name",
  "title",
  "subtitle",
  "description",
  "cta",
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
 * @typedef {object} PersonPresentation
 * @property {object|string|null} [image]
 * @property {string} name
 * @property {string|null} [title]
 * @property {string|null} [subtitle]
 * @property {string|null} [description]
 * @property {PersonCta|null} [cta]
 * @property {number} [displayOrder]
 * @property {boolean} [visibility]
 * @property {boolean} [featured]
 * @property {string|null} [sourceProduct] product code that produced this DTO
 * @property {string|null} [sourceDomain] e.g. doctor | pastor_leader (metadata only)
 * @property {string|null} [sourceId] product domain id (opaque to platform)
 */

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

  let cta = null;
  if (raw.cta != null) {
    if (typeof raw.cta !== "object" || Array.isArray(raw.cta)) {
      return { ok: false, code: "invalid_person_cta" };
    }
    cta = {
      label: raw.cta.label == null ? null : String(raw.cta.label).trim().slice(0, 80) || null,
      url: raw.cta.url == null ? null : String(raw.cta.url).trim().slice(0, 500) || null,
    };
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

  /** @type {PersonPresentation} */
  const value = {
    image: raw.image == null ? null : raw.image,
    name,
    title,
    subtitle,
    description,
    cta,
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
  validatePersonPresentation,
  createPersonPresentation,
};
