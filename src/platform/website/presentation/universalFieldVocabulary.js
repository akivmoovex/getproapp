"use strict";

/**
 * Canonical vocabulary for the 18 audited PLATFORM UNIVERSAL (Class A) fields.
 *
 * Presentation keys are the platform contract. Product storage keys remain as-is
 * until a later migration phase. Resolvers map product → presentation only.
 *
 * Source: docs/qa/V2_04_AC_WEBSITE_PLATFORM_REUSE_AUDIT.md §5–§6
 */

const PRODUCT_CODE = Object.freeze({
  BLESSBOARD: "blessboard",
  ACTIVECLINIC: "activeclinic",
});

/**
 * @typedef {object} UniversalFieldDef
 * @property {string} presentationKey
 * @property {string} concept
 * @property {string} type
 * @property {string|null} blessboardKey
 * @property {string|null} activeclinicKey
 * @property {string} [notes]
 */

/** @type {readonly UniversalFieldDef[]} */
const UNIVERSAL_FIELDS = Object.freeze([
  Object.freeze({
    presentationKey: "home.logo",
    concept: "logo",
    type: "image",
    blessboardKey: "home.logo",
    activeclinicKey: "home.logo",
  }),
  Object.freeze({
    presentationKey: "brand.primary_color",
    concept: "brand_primary",
    type: "short_text",
    blessboardKey: "brand.primary_color",
    activeclinicKey: "brand.primary_color",
  }),
  Object.freeze({
    presentationKey: "brand.accent_color",
    concept: "brand_accent",
    type: "short_text",
    blessboardKey: "brand.accent_color",
    activeclinicKey: "brand.accent_color",
  }),
  Object.freeze({
    presentationKey: "home.hero.image",
    concept: "hero_image",
    type: "image",
    blessboardKey: "home.hero.image",
    activeclinicKey: "home.hero.image",
  }),
  Object.freeze({
    presentationKey: "home.hero.eyebrow",
    concept: "hero_eyebrow",
    type: "short_text",
    blessboardKey: "home.hero.eyebrow",
    activeclinicKey: "home.hero.eyebrow",
  }),
  Object.freeze({
    presentationKey: "home.hero.title",
    concept: "hero_title",
    type: "short_text",
    blessboardKey: "home.hero.heading",
    activeclinicKey: "home.hero.title",
    notes: "BB stores heading; presentation canonical is title",
  }),
  Object.freeze({
    presentationKey: "home.hero.subtitle",
    concept: "hero_subtitle",
    type: "long_text",
    blessboardKey: "home.hero.body_text",
    activeclinicKey: "home.hero.subtitle",
    notes: "BB stores body_text; presentation canonical is subtitle",
  }),
  Object.freeze({
    presentationKey: "about.story.heading",
    concept: "about_heading",
    type: "short_text",
    blessboardKey: "about.story.heading",
    activeclinicKey: "about.story.heading",
  }),
  Object.freeze({
    presentationKey: "about.story.body",
    concept: "about_body",
    type: "long_text",
    blessboardKey: "about.story.body_text",
    activeclinicKey: "about.story.body",
    notes: "BB stores body_text; presentation canonical is body",
  }),
  Object.freeze({
    presentationKey: "contact.phone",
    concept: "contact_phone",
    type: "phone",
    blessboardKey: "contact.details.phone",
    activeclinicKey: "contact.phone",
    notes: "BB also has settings contact.phone (legacy duplicate)",
  }),
  Object.freeze({
    presentationKey: "contact.email",
    concept: "contact_email",
    type: "email",
    blessboardKey: "contact.details.email",
    activeclinicKey: "contact.email",
    notes: "BB also has settings contact.email (legacy duplicate)",
  }),
  Object.freeze({
    presentationKey: "footer.tagline",
    concept: "footer_tagline",
    type: "short_text",
    blessboardKey: "home.footer.tagline",
    activeclinicKey: "footer.tagline",
  }),
  Object.freeze({
    presentationKey: "seo.title",
    concept: "seo_title",
    type: "short_text",
    blessboardKey: "seo.title",
    activeclinicKey: "seo.title",
  }),
  Object.freeze({
    presentationKey: "seo.description",
    concept: "seo_description",
    type: "long_text",
    blessboardKey: "seo.description",
    activeclinicKey: "seo.description",
  }),
  Object.freeze({
    presentationKey: "seo.image",
    concept: "seo_image",
    type: "image",
    blessboardKey: "seo.og_image_url",
    activeclinicKey: "seo.image",
    notes: "BB stores og_image_url; presentation canonical is seo.image",
  }),
  Object.freeze({
    presentationKey: "seo.canonical_url",
    concept: "seo_canonical",
    type: "url",
    blessboardKey: "seo.canonical_url",
    activeclinicKey: "seo.canonical_url",
  }),
  Object.freeze({
    presentationKey: "seo.robots",
    concept: "seo_robots",
    type: "enum",
    blessboardKey: "seo.robots",
    activeclinicKey: "seo.robots",
  }),
  Object.freeze({
    presentationKey: "seo.sitemap_include",
    concept: "seo_sitemap_include",
    type: "boolean",
    blessboardKey: "seo.sitemap_include",
    activeclinicKey: "seo.sitemap_include",
  }),
]);

const BY_PRESENTATION_KEY = new Map(UNIVERSAL_FIELDS.map((f) => [f.presentationKey, f]));
const BY_CONCEPT = new Map(UNIVERSAL_FIELDS.map((f) => [f.concept, f]));

const UNIVERSAL_FIELD_COUNT = UNIVERSAL_FIELDS.length;

/**
 * @param {string} productCode
 * @param {string} presentationKey
 * @returns {string|null}
 */
function productStorageKeyFor(productCode, presentationKey) {
  const field = BY_PRESENTATION_KEY.get(String(presentationKey || "").trim());
  if (!field) return null;
  const product = String(productCode || "").trim().toLowerCase();
  if (product === PRODUCT_CODE.BLESSBOARD) return field.blessboardKey;
  if (product === PRODUCT_CODE.ACTIVECLINIC) return field.activeclinicKey;
  return null;
}

/**
 * Resolve a product storage key to the canonical presentation key (or null).
 * @param {string} productCode
 * @param {string} storageKey
 * @returns {string|null}
 */
function presentationKeyForProductStorage(productCode, storageKey) {
  const key = String(storageKey || "").trim();
  if (!key) return null;
  const product = String(productCode || "").trim().toLowerCase();
  for (const field of UNIVERSAL_FIELDS) {
    if (product === PRODUCT_CODE.BLESSBOARD && field.blessboardKey === key) {
      return field.presentationKey;
    }
    if (product === PRODUCT_CODE.ACTIVECLINIC && field.activeclinicKey === key) {
      return field.presentationKey;
    }
  }
  return null;
}

/**
 * @param {string} presentationKey
 * @returns {UniversalFieldDef|null}
 */
function getUniversalField(presentationKey) {
  return BY_PRESENTATION_KEY.get(String(presentationKey || "").trim()) || null;
}

/**
 * @returns {string[]}
 */
function listUniversalPresentationKeys() {
  return UNIVERSAL_FIELDS.map((f) => f.presentationKey);
}

module.exports = {
  PRODUCT_CODE,
  UNIVERSAL_FIELDS,
  UNIVERSAL_FIELD_COUNT,
  BY_PRESENTATION_KEY,
  BY_CONCEPT,
  productStorageKeyFor,
  presentationKeyForProductStorage,
  getUniversalField,
  listUniversalPresentationKeys,
};
