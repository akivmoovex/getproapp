"use strict";

/**
 * Canonical website presentation component types (V2.04 Phase 1).
 * Presentation-only — not domain entities, not storage keys.
 */

const PRESENTATION_COMPONENT_TYPES = Object.freeze({
  BRANDING: "branding",
  NAVIGATION: "navigation",
  HERO: "hero",
  SECTION_HEADING: "section_heading",
  RICH_TEXT: "rich_text",
  IMAGE_TEXT: "image_text",
  CTA: "cta",
  PERSON: "person",
  COLLECTION_CARD: "collection_card",
  CONTACT: "contact",
  HOURS: "hours",
  LOCATION: "location",
  SOCIAL_LINKS: "social_links",
  GALLERY: "gallery",
  VIDEO: "video",
  ANNOUNCEMENT: "announcement",
  SEO: "seo",
  FOOTER: "footer",
});

const PRESENTATION_COMPONENT_TYPE_SET = new Set(Object.values(PRESENTATION_COMPONENT_TYPES));

const PRESENTATION_COMPONENT_TYPE_LIST = Object.freeze(Object.values(PRESENTATION_COMPONENT_TYPES));

function isPresentationComponentType(value) {
  return PRESENTATION_COMPONENT_TYPE_SET.has(String(value || "").trim());
}

module.exports = {
  PRESENTATION_COMPONENT_TYPES,
  PRESENTATION_COMPONENT_TYPE_SET,
  PRESENTATION_COMPONENT_TYPE_LIST,
  isPresentationComponentType,
};
