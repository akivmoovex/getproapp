"use strict";

/**
 * Legacy / duplicate (Class D) website field map.
 *
 * Phase 1: document and resolve aliases only. Do NOT remove or rewrite storage.
 * Source: docs/qa/V2_04_AC_WEBSITE_PLATFORM_REUSE_AUDIT.md §6
 */

const LEGACY_STATUS = Object.freeze({
  ALIAS: "alias",
  OVERLAP: "overlap",
  SEED_OVERLAY: "seed_overlay",
  COARSE_BLOB: "coarse_blob",
  RETAIN: "retain",
});

/**
 * @typedef {object} LegacyFieldEntry
 * @property {string} id
 * @property {string} productCode
 * @property {string} legacyKey
 * @property {string|null} canonicalPresentationKey
 * @property {string} status
 * @property {string} notes
 */

/** @type {readonly LegacyFieldEntry[]} */
const LEGACY_DUPLICATE_FIELDS = Object.freeze([
  // BB Stage-1 coarse setting blobs
  Object.freeze({
    id: "bb_coarse_branch_display_identity",
    productCode: "blessboard",
    legacyKey: "branch_display_identity",
    canonicalPresentationKey: "site.name",
    status: LEGACY_STATUS.COARSE_BLOB,
    notes: "Stage-1 compat blob; prefer identity.branch_display_name / site.name",
  }),
  Object.freeze({
    id: "bb_coarse_hero_content",
    productCode: "blessboard",
    legacyKey: "hero_content",
    canonicalPresentationKey: "home.hero.title",
    status: LEGACY_STATUS.COARSE_BLOB,
    notes: "Overlaps home.hero.* inline keys",
  }),
  Object.freeze({
    id: "bb_coarse_contact_details",
    productCode: "blessboard",
    legacyKey: "contact_details",
    canonicalPresentationKey: "contact.phone",
    status: LEGACY_STATUS.COARSE_BLOB,
    notes: "Overlaps contact.details.* / contact.*",
  }),
  Object.freeze({
    id: "bb_coarse_address_and_map",
    productCode: "blessboard",
    legacyKey: "address_and_map",
    canonicalPresentationKey: "contact.address",
    status: LEGACY_STATUS.COARSE_BLOB,
    notes: "Structured address settings preferred",
  }),
  Object.freeze({
    id: "bb_coarse_service_times",
    productCode: "blessboard",
    legacyKey: "service_times",
    canonicalPresentationKey: "location.hours",
    status: LEGACY_STATUS.COARSE_BLOB,
    notes: "Entity service_times remain product-owned; blob is legacy",
  }),
  Object.freeze({
    id: "bb_coarse_social_links",
    productCode: "blessboard",
    legacyKey: "social_links",
    canonicalPresentationKey: "social.links",
    status: LEGACY_STATUS.COARSE_BLOB,
    notes: "Prefer social.links settings array",
  }),
  Object.freeze({
    id: "bb_coarse_seo",
    productCode: "blessboard",
    legacyKey: "seo",
    canonicalPresentationKey: "seo.title",
    status: LEGACY_STATUS.COARSE_BLOB,
    notes: "Prefer discrete seo.* keys",
  }),
  Object.freeze({
    id: "bb_coarse_page_visibility",
    productCode: "blessboard",
    legacyKey: "page_visibility",
    canonicalPresentationKey: null,
    status: LEGACY_STATUS.COARSE_BLOB,
    notes: "Prefer per-page visibility registry",
  }),
  Object.freeze({
    id: "bb_coarse_website_presentation",
    productCode: "blessboard",
    legacyKey: "website_presentation",
    canonicalPresentationKey: null,
    status: LEGACY_STATUS.COARSE_BLOB,
    notes: "Multi-site presentation labels stay product-local",
  }),

  // BB identity.hero_* vs home.hero.*
  Object.freeze({
    id: "bb_identity_hero_title",
    productCode: "blessboard",
    legacyKey: "identity.hero_title",
    canonicalPresentationKey: "home.hero.title",
    status: LEGACY_STATUS.ALIAS,
    notes: "Duplicate of home.hero.heading",
  }),
  Object.freeze({
    id: "bb_identity_hero_description",
    productCode: "blessboard",
    legacyKey: "identity.hero_description",
    canonicalPresentationKey: "home.hero.subtitle",
    status: LEGACY_STATUS.ALIAS,
    notes: "Duplicate of home.hero.body_text",
  }),
  Object.freeze({
    id: "bb_identity_hero_image_url",
    productCode: "blessboard",
    legacyKey: "identity.hero_image_url",
    canonicalPresentationKey: "home.hero.image",
    status: LEGACY_STATUS.ALIAS,
    notes: "Duplicate of home.hero.image",
  }),
  Object.freeze({
    id: "bb_identity_hero_primary_action_label",
    productCode: "blessboard",
    legacyKey: "identity.hero_primary_action_label",
    canonicalPresentationKey: "home.hero.button_label",
    status: LEGACY_STATUS.ALIAS,
    notes: "Duplicate of home.hero.button_text",
  }),
  Object.freeze({
    id: "bb_identity_hero_primary_action_url",
    productCode: "blessboard",
    legacyKey: "identity.hero_primary_action_url",
    canonicalPresentationKey: "home.hero.button_url",
    status: LEGACY_STATUS.ALIAS,
    notes: "Duplicate of home.hero.button_url",
  }),
  Object.freeze({
    id: "bb_identity_hero_secondary_action_label",
    productCode: "blessboard",
    legacyKey: "identity.hero_secondary_action_label",
    canonicalPresentationKey: null,
    status: LEGACY_STATUS.RETAIN,
    notes: "BB-only secondary CTA; product-owned until CTA component unifies",
  }),

  // BB contact dual paths
  Object.freeze({
    id: "bb_settings_contact_phone",
    productCode: "blessboard",
    legacyKey: "contact.phone",
    canonicalPresentationKey: "contact.phone",
    status: LEGACY_STATUS.OVERLAP,
    notes: "Settings path overlaps contact.details.phone",
  }),
  Object.freeze({
    id: "bb_settings_contact_email",
    productCode: "blessboard",
    legacyKey: "contact.email",
    canonicalPresentationKey: "contact.email",
    status: LEGACY_STATUS.OVERLAP,
    notes: "Settings path overlaps contact.details.email",
  }),

  // SEO duplicates
  Object.freeze({
    id: "bb_seo_noindex",
    productCode: "blessboard",
    legacyKey: "seo.noindex",
    canonicalPresentationKey: "seo.robots",
    status: LEGACY_STATUS.OVERLAP,
    notes: "Boolean overlaps seo.robots enum; prefer robots",
  }),
  Object.freeze({
    id: "bb_seo_og_image_url",
    productCode: "blessboard",
    legacyKey: "seo.og_image_url",
    canonicalPresentationKey: "seo.image",
    status: LEGACY_STATUS.ALIAS,
    notes: "Mapped in universal vocabulary",
  }),

  // About gallery vs life_together
  Object.freeze({
    id: "bb_about_gallery",
    productCode: "blessboard",
    legacyKey: "about.gallery",
    canonicalPresentationKey: null,
    status: LEGACY_STATUS.ALIAS,
    notes: "Legacy alias of about.life_together; product-owned gallery slots",
  }),
  Object.freeze({
    id: "bb_about_gallery_heading",
    productCode: "blessboard",
    legacyKey: "about.gallery_heading.heading",
    canonicalPresentationKey: null,
    status: LEGACY_STATUS.RETAIN,
    notes: "Retained gallery chrome; not removed in Phase 1",
  }),

  // AC seed overlays
  Object.freeze({
    id: "ac_services_examples",
    productCode: "activeclinic",
    legacyKey: "services.examples",
    canonicalPresentationKey: null,
    status: LEGACY_STATUS.SEED_OVERLAY,
    notes: "Seed examples; live catalogue uses ops + library",
  }),
  Object.freeze({
    id: "ac_doctors_examples",
    productCode: "activeclinic",
    legacyKey: "doctors.examples",
    canonicalPresentationKey: null,
    status: LEGACY_STATUS.SEED_OVERLAY,
    notes: "Seed examples; live doctors use ops + library",
  }),

  // Footer path naming (BB home.footer vs footer)
  Object.freeze({
    id: "bb_home_footer_tagline",
    productCode: "blessboard",
    legacyKey: "home.footer.tagline",
    canonicalPresentationKey: "footer.tagline",
    status: LEGACY_STATUS.ALIAS,
    notes: "Universal map uses footer.tagline; BB storage remains home.footer.tagline",
  }),
  Object.freeze({
    id: "bb_about_story_body_text",
    productCode: "blessboard",
    legacyKey: "about.story.body_text",
    canonicalPresentationKey: "about.story.body",
    status: LEGACY_STATUS.ALIAS,
    notes: "Universal map; BB storage remains body_text",
  }),
]);

const LEGACY_DUPLICATE_FIELD_COUNT = LEGACY_DUPLICATE_FIELDS.length;

/**
 * @param {string} productCode
 * @param {string} legacyKey
 * @returns {LegacyFieldEntry|null}
 */
function findLegacyField(productCode, legacyKey) {
  const product = String(productCode || "").trim().toLowerCase();
  const key = String(legacyKey || "").trim();
  return (
    LEGACY_DUPLICATE_FIELDS.find(
      (entry) => entry.productCode === product && entry.legacyKey === key
    ) || null
  );
}

/**
 * @param {string} productCode
 * @param {string} legacyKey
 * @returns {string|null}
 */
function resolveLegacyToPresentationKey(productCode, legacyKey) {
  const entry = findLegacyField(productCode, legacyKey);
  return entry ? entry.canonicalPresentationKey : null;
}

module.exports = {
  LEGACY_STATUS,
  LEGACY_DUPLICATE_FIELDS,
  LEGACY_DUPLICATE_FIELD_COUNT,
  findLegacyField,
  resolveLegacyToPresentationKey,
};
