"use strict";

/**
 * Presentation component shape contracts (V2.04 Phase 1).
 * Pure validation — not wired into public render paths yet.
 */

const { PRESENTATION_COMPONENT_TYPES, isPresentationComponentType } = require("./componentTypes");
const { validatePersonPresentation } = require("./personPresentation");
const { validateCollectionPresentation } = require("./collectionPresentation");

function asTrimmedString(value, max) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, max);
}

function optionalCta(raw) {
  if (raw == null) return { ok: true, value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, code: "invalid_cta" };
  }
  return {
    ok: true,
    value: {
      label: asTrimmedString(raw.label, 80),
      url: asTrimmedString(raw.url, 500),
    },
  };
}

/**
 * Field schemas describing each presentation component (documentation + validation).
 */
const COMPONENT_CONTRACTS = Object.freeze({
  [PRESENTATION_COMPONENT_TYPES.BRANDING]: Object.freeze({
    type: PRESENTATION_COMPONENT_TYPES.BRANDING,
    fields: Object.freeze(["logo", "favicon", "primaryColor", "accentColor", "themeId", "siteName"]),
  }),
  [PRESENTATION_COMPONENT_TYPES.NAVIGATION]: Object.freeze({
    type: PRESENTATION_COMPONENT_TYPES.NAVIGATION,
    fields: Object.freeze(["items"]),
    itemFields: Object.freeze(["key", "label", "href", "visible", "displayOrder"]),
  }),
  [PRESENTATION_COMPONENT_TYPES.HERO]: Object.freeze({
    type: PRESENTATION_COMPONENT_TYPES.HERO,
    fields: Object.freeze([
      "eyebrow",
      "title",
      "subtitle",
      "image",
      "primaryCta",
      "secondaryCta",
    ]),
  }),
  [PRESENTATION_COMPONENT_TYPES.SECTION_HEADING]: Object.freeze({
    type: PRESENTATION_COMPONENT_TYPES.SECTION_HEADING,
    fields: Object.freeze(["eyebrow", "title", "lead", "cta"]),
  }),
  [PRESENTATION_COMPONENT_TYPES.RICH_TEXT]: Object.freeze({
    type: PRESENTATION_COMPONENT_TYPES.RICH_TEXT,
    fields: Object.freeze(["heading", "body"]),
  }),
  [PRESENTATION_COMPONENT_TYPES.IMAGE_TEXT]: Object.freeze({
    type: PRESENTATION_COMPONENT_TYPES.IMAGE_TEXT,
    fields: Object.freeze(["heading", "body", "image", "imagePosition", "cta"]),
  }),
  [PRESENTATION_COMPONENT_TYPES.CTA]: Object.freeze({
    type: PRESENTATION_COMPONENT_TYPES.CTA,
    fields: Object.freeze(["heading", "body", "primaryCta", "secondaryCta"]),
  }),
  [PRESENTATION_COMPONENT_TYPES.PERSON]: Object.freeze({
    type: PRESENTATION_COMPONENT_TYPES.PERSON,
    fields: Object.freeze([
      "image",
      "name",
      "title",
      "subtitle",
      "description",
      "cta",
      "displayOrder",
      "visibility",
      "featured",
    ]),
  }),
  [PRESENTATION_COMPONENT_TYPES.COLLECTION_CARD]: Object.freeze({
    type: PRESENTATION_COMPONENT_TYPES.COLLECTION_CARD,
    fields: Object.freeze([
      "cardKind",
      "layoutVariant",
      "intro",
      "emptyState",
      "manageHref",
      "items",
    ]),
  }),
  [PRESENTATION_COMPONENT_TYPES.CONTACT]: Object.freeze({
    type: PRESENTATION_COMPONENT_TYPES.CONTACT,
    fields: Object.freeze(["phone", "email", "address", "intro", "asideHeading"]),
  }),
  [PRESENTATION_COMPONENT_TYPES.HOURS]: Object.freeze({
    type: PRESENTATION_COMPONENT_TYPES.HOURS,
    fields: Object.freeze(["heading", "rows", "text"]),
    rowFields: Object.freeze(["label", "days", "open", "close", "note", "enabled", "displayOrder"]),
  }),
  [PRESENTATION_COMPONENT_TYPES.LOCATION]: Object.freeze({
    type: PRESENTATION_COMPONENT_TYPES.LOCATION,
    fields: Object.freeze(["heading", "address", "mapUrl", "directions", "landmark"]),
  }),
  [PRESENTATION_COMPONENT_TYPES.SOCIAL_LINKS]: Object.freeze({
    type: PRESENTATION_COMPONENT_TYPES.SOCIAL_LINKS,
    fields: Object.freeze(["links"]),
    itemFields: Object.freeze(["network", "label", "url", "displayOrder", "visibility"]),
  }),
  [PRESENTATION_COMPONENT_TYPES.GALLERY]: Object.freeze({
    type: PRESENTATION_COMPONENT_TYPES.GALLERY,
    fields: Object.freeze(["heading", "items"]),
    itemFields: Object.freeze(["image", "caption", "displayOrder", "visibility"]),
  }),
  [PRESENTATION_COMPONENT_TYPES.VIDEO]: Object.freeze({
    type: PRESENTATION_COMPONENT_TYPES.VIDEO,
    fields: Object.freeze(["title", "url", "poster"]),
  }),
  [PRESENTATION_COMPONENT_TYPES.ANNOUNCEMENT]: Object.freeze({
    type: PRESENTATION_COMPONENT_TYPES.ANNOUNCEMENT,
    fields: Object.freeze(["title", "body", "cta", "visibility", "displayOrder"]),
    notes: "Presentation chrome only; BlessBoard announcements domain stays product-owned",
  }),
  [PRESENTATION_COMPONENT_TYPES.SEO]: Object.freeze({
    type: PRESENTATION_COMPONENT_TYPES.SEO,
    fields: Object.freeze([
      "title",
      "description",
      "image",
      "canonicalUrl",
      "robots",
      "sitemapInclude",
    ]),
  }),
  [PRESENTATION_COMPONENT_TYPES.FOOTER]: Object.freeze({
    type: PRESENTATION_COMPONENT_TYPES.FOOTER,
    fields: Object.freeze(["tagline", "legal", "showContact"]),
  }),
});

/**
 * Class B component/product-semantic concepts mapped to presentation components.
 * Not a storage migration — vocabulary for adapters + Stitch.
 */
const COMPONENT_SEMANTIC_CONCEPTS = Object.freeze([
  Object.freeze({ concept: "site_name", component: PRESENTATION_COMPONENT_TYPES.BRANDING, field: "siteName" }),
  Object.freeze({ concept: "theme_id", component: PRESENTATION_COMPONENT_TYPES.BRANDING, field: "themeId" }),
  Object.freeze({ concept: "favicon", component: PRESENTATION_COMPONENT_TYPES.BRANDING, field: "favicon" }),
  Object.freeze({ concept: "nav_label", component: PRESENTATION_COMPONENT_TYPES.NAVIGATION, field: "items.label" }),
  Object.freeze({ concept: "page_visibility", component: PRESENTATION_COMPONENT_TYPES.NAVIGATION, field: "items.visible" }),
  Object.freeze({ concept: "section_visibility", component: PRESENTATION_COMPONENT_TYPES.COLLECTION_CARD, field: "items.visibility" }),
  Object.freeze({ concept: "header_show_logo", component: PRESENTATION_COMPONENT_TYPES.BRANDING, field: "logo" }),
  Object.freeze({ concept: "header_show_nav", component: PRESENTATION_COMPONENT_TYPES.NAVIGATION, field: "items" }),
  Object.freeze({ concept: "header_show_phone", component: PRESENTATION_COMPONENT_TYPES.CONTACT, field: "phone" }),
  Object.freeze({ concept: "hero_primary_cta_label", component: PRESENTATION_COMPONENT_TYPES.HERO, field: "primaryCta.label" }),
  Object.freeze({ concept: "hero_primary_cta_url", component: PRESENTATION_COMPONENT_TYPES.HERO, field: "primaryCta.url" }),
  Object.freeze({ concept: "about_image", component: PRESENTATION_COMPONENT_TYPES.IMAGE_TEXT, field: "image" }),
  Object.freeze({ concept: "about_eyebrow", component: PRESENTATION_COMPONENT_TYPES.SECTION_HEADING, field: "eyebrow" }),
  Object.freeze({ concept: "contact_address", component: PRESENTATION_COMPONENT_TYPES.CONTACT, field: "address" }),
  Object.freeze({ concept: "location_hours", component: PRESENTATION_COMPONENT_TYPES.HOURS, field: "text" }),
  Object.freeze({ concept: "social_links", component: PRESENTATION_COMPONENT_TYPES.SOCIAL_LINKS, field: "links" }),
  Object.freeze({ concept: "person_card", component: PRESENTATION_COMPONENT_TYPES.PERSON, field: null }),
  Object.freeze({ concept: "offering_card", component: PRESENTATION_COMPONENT_TYPES.COLLECTION_CARD, field: "items" }),
  Object.freeze({ concept: "promo_heading", component: PRESENTATION_COMPONENT_TYPES.CTA, field: "heading" }),
  Object.freeze({ concept: "promo_body", component: PRESENTATION_COMPONENT_TYPES.CTA, field: "body" }),
  Object.freeze({ concept: "cms_pages", component: PRESENTATION_COMPONENT_TYPES.NAVIGATION, field: "items" }),
  Object.freeze({ concept: "cms_section_heading", component: PRESENTATION_COMPONENT_TYPES.SECTION_HEADING, field: "title" }),
  Object.freeze({ concept: "cms_section_body", component: PRESENTATION_COMPONENT_TYPES.RICH_TEXT, field: "body" }),
  Object.freeze({ concept: "cms_section_image", component: PRESENTATION_COMPONENT_TYPES.IMAGE_TEXT, field: "image" }),
  Object.freeze({ concept: "cms_section_button", component: PRESENTATION_COMPONENT_TYPES.CTA, field: "primaryCta" }),
  Object.freeze({ concept: "gallery_items", component: PRESENTATION_COMPONENT_TYPES.GALLERY, field: "items" }),
  Object.freeze({ concept: "video_embed", component: PRESENTATION_COMPONENT_TYPES.VIDEO, field: "url" }),
  Object.freeze({ concept: "announcement_chrome", component: PRESENTATION_COMPONENT_TYPES.ANNOUNCEMENT, field: null }),
  Object.freeze({ concept: "footer_show_contact", component: PRESENTATION_COMPONENT_TYPES.FOOTER, field: "showContact" }),
  Object.freeze({ concept: "location_heading", component: PRESENTATION_COMPONENT_TYPES.LOCATION, field: "heading" }),
  Object.freeze({ concept: "location_map", component: PRESENTATION_COMPONENT_TYPES.LOCATION, field: "mapUrl" }),
  Object.freeze({ concept: "hours_rows", component: PRESENTATION_COMPONENT_TYPES.HOURS, field: "rows" }),
  Object.freeze({ concept: "collection_intro", component: PRESENTATION_COMPONENT_TYPES.COLLECTION_CARD, field: "intro" }),
  Object.freeze({ concept: "collection_empty", component: PRESENTATION_COMPONENT_TYPES.COLLECTION_CARD, field: "emptyState" }),
  Object.freeze({ concept: "collection_order", component: PRESENTATION_COMPONENT_TYPES.COLLECTION_CARD, field: "items.displayOrder" }),
  Object.freeze({ concept: "collection_visibility", component: PRESENTATION_COMPONENT_TYPES.COLLECTION_CARD, field: "items.visibility" }),
  Object.freeze({ concept: "collection_image", component: PRESENTATION_COMPONENT_TYPES.COLLECTION_CARD, field: "items.image" }),
  Object.freeze({ concept: "collection_title", component: PRESENTATION_COMPONENT_TYPES.COLLECTION_CARD, field: "items.title" }),
  Object.freeze({ concept: "collection_subtitle", component: PRESENTATION_COMPONENT_TYPES.COLLECTION_CARD, field: "items.subtitle" }),
  Object.freeze({ concept: "collection_description", component: PRESENTATION_COMPONENT_TYPES.COLLECTION_CARD, field: "items.description" }),
  Object.freeze({ concept: "collection_cta", component: PRESENTATION_COMPONENT_TYPES.COLLECTION_CARD, field: "items.cta" }),
  Object.freeze({ concept: "collection_layout", component: PRESENTATION_COMPONENT_TYPES.COLLECTION_CARD, field: "layoutVariant" }),
]);

const COMPONENT_SEMANTIC_CONCEPT_COUNT = COMPONENT_SEMANTIC_CONCEPTS.length;

function validateHero(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, code: "invalid_hero" };
  const primary = optionalCta(raw.primaryCta);
  if (!primary.ok) return primary;
  const secondary = optionalCta(raw.secondaryCta);
  if (!secondary.ok) return secondary;
  return {
    ok: true,
    value: {
      type: PRESENTATION_COMPONENT_TYPES.HERO,
      eyebrow: asTrimmedString(raw.eyebrow, 80),
      title: asTrimmedString(raw.title, 160),
      subtitle: asTrimmedString(raw.subtitle, 800),
      image: raw.image == null ? null : raw.image,
      primaryCta: primary.value,
      secondaryCta: secondary.value,
    },
  };
}

function validateBranding(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, code: "invalid_branding" };
  return {
    ok: true,
    value: {
      type: PRESENTATION_COMPONENT_TYPES.BRANDING,
      logo: raw.logo == null ? null : raw.logo,
      favicon: raw.favicon == null ? null : raw.favicon,
      primaryColor: asTrimmedString(raw.primaryColor, 40),
      accentColor: asTrimmedString(raw.accentColor, 40),
      themeId: asTrimmedString(raw.themeId, 80),
      siteName: asTrimmedString(raw.siteName, 160),
    },
  };
}

function validateNavigation(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, code: "invalid_navigation" };
  if (!Array.isArray(raw.items)) return { ok: false, code: "invalid_navigation_items" };
  const items = [];
  for (const item of raw.items) {
    if (!item || typeof item !== "object") return { ok: false, code: "invalid_navigation_item" };
    const label = asTrimmedString(item.label, 60);
    if (!label) return { ok: false, code: "invalid_navigation_label" };
    items.push({
      key: asTrimmedString(item.key, 80),
      label,
      href: asTrimmedString(item.href, 500),
      visible: item.visible === false ? false : true,
      displayOrder: Number.isFinite(Number(item.displayOrder)) ? Math.floor(Number(item.displayOrder)) : 0,
    });
  }
  items.sort((a, b) => a.displayOrder - b.displayOrder);
  return { ok: true, value: { type: PRESENTATION_COMPONENT_TYPES.NAVIGATION, items } };
}

function validateSectionHeading(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, code: "invalid_section_heading" };
  const cta = optionalCta(raw.cta);
  if (!cta.ok) return cta;
  return {
    ok: true,
    value: {
      type: PRESENTATION_COMPONENT_TYPES.SECTION_HEADING,
      eyebrow: asTrimmedString(raw.eyebrow, 80),
      title: asTrimmedString(raw.title, 160),
      lead: asTrimmedString(raw.lead, 800),
      cta: cta.value,
    },
  };
}

function validateRichText(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, code: "invalid_rich_text" };
  return {
    ok: true,
    value: {
      type: PRESENTATION_COMPONENT_TYPES.RICH_TEXT,
      heading: asTrimmedString(raw.heading, 160),
      body: asTrimmedString(raw.body, 8000),
    },
  };
}

function validateImageText(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, code: "invalid_image_text" };
  const cta = optionalCta(raw.cta);
  if (!cta.ok) return cta;
  const position = String(raw.imagePosition || "start").trim();
  if (position !== "start" && position !== "end") {
    return { ok: false, code: "invalid_image_position" };
  }
  return {
    ok: true,
    value: {
      type: PRESENTATION_COMPONENT_TYPES.IMAGE_TEXT,
      heading: asTrimmedString(raw.heading, 160),
      body: asTrimmedString(raw.body, 8000),
      image: raw.image == null ? null : raw.image,
      imagePosition: position,
      cta: cta.value,
    },
  };
}

function validateCta(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, code: "invalid_cta_section" };
  const primary = optionalCta(raw.primaryCta);
  if (!primary.ok) return primary;
  const secondary = optionalCta(raw.secondaryCta);
  if (!secondary.ok) return secondary;
  return {
    ok: true,
    value: {
      type: PRESENTATION_COMPONENT_TYPES.CTA,
      heading: asTrimmedString(raw.heading, 160),
      body: asTrimmedString(raw.body, 800),
      primaryCta: primary.value,
      secondaryCta: secondary.value,
    },
  };
}

function validateContact(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, code: "invalid_contact" };
  return {
    ok: true,
    value: {
      type: PRESENTATION_COMPONENT_TYPES.CONTACT,
      phone: asTrimmedString(raw.phone, 40),
      email: asTrimmedString(raw.email, 254),
      address: asTrimmedString(raw.address, 500),
      intro: asTrimmedString(raw.intro, 1000),
      asideHeading: asTrimmedString(raw.asideHeading, 120),
    },
  };
}

function validateHours(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, code: "invalid_hours" };
  const rows = [];
  if (raw.rows != null) {
    if (!Array.isArray(raw.rows)) return { ok: false, code: "invalid_hours_rows" };
    for (const row of raw.rows) {
      if (!row || typeof row !== "object") return { ok: false, code: "invalid_hours_row" };
      rows.push({
        label: asTrimmedString(row.label, 80),
        days: asTrimmedString(row.days, 80),
        open: asTrimmedString(row.open, 40),
        close: asTrimmedString(row.close, 40),
        note: asTrimmedString(row.note, 200),
        enabled: row.enabled === false ? false : true,
        displayOrder: Number.isFinite(Number(row.displayOrder))
          ? Math.floor(Number(row.displayOrder))
          : 0,
      });
    }
  }
  return {
    ok: true,
    value: {
      type: PRESENTATION_COMPONENT_TYPES.HOURS,
      heading: asTrimmedString(raw.heading, 120),
      text: asTrimmedString(raw.text, 2000),
      rows,
    },
  };
}

function validateLocation(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, code: "invalid_location" };
  return {
    ok: true,
    value: {
      type: PRESENTATION_COMPONENT_TYPES.LOCATION,
      heading: asTrimmedString(raw.heading, 120),
      address: asTrimmedString(raw.address, 500),
      mapUrl: asTrimmedString(raw.mapUrl, 500),
      directions: asTrimmedString(raw.directions, 1000),
      landmark: asTrimmedString(raw.landmark, 200),
    },
  };
}

function validateSocialLinks(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, code: "invalid_social_links" };
  if (!Array.isArray(raw.links)) return { ok: false, code: "invalid_social_links_items" };
  const links = [];
  for (const link of raw.links) {
    if (!link || typeof link !== "object") return { ok: false, code: "invalid_social_link" };
    const url = asTrimmedString(link.url, 500);
    if (!url) return { ok: false, code: "invalid_social_url" };
    links.push({
      network: asTrimmedString(link.network, 40),
      label: asTrimmedString(link.label, 80),
      url,
      displayOrder: Number.isFinite(Number(link.displayOrder))
        ? Math.floor(Number(link.displayOrder))
        : 0,
      visibility: link.visibility === false ? false : true,
    });
  }
  return { ok: true, value: { type: PRESENTATION_COMPONENT_TYPES.SOCIAL_LINKS, links } };
}

function validateGallery(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, code: "invalid_gallery" };
  if (!Array.isArray(raw.items)) return { ok: false, code: "invalid_gallery_items" };
  const items = raw.items.map((item, index) => {
    if (!item || typeof item !== "object") return null;
    return {
      image: item.image == null ? null : item.image,
      caption: asTrimmedString(item.caption, 200),
      displayOrder: Number.isFinite(Number(item.displayOrder))
        ? Math.floor(Number(item.displayOrder))
        : index,
      visibility: item.visibility === false ? false : true,
    };
  });
  if (items.some((item) => item == null)) return { ok: false, code: "invalid_gallery_item" };
  return {
    ok: true,
    value: {
      type: PRESENTATION_COMPONENT_TYPES.GALLERY,
      heading: asTrimmedString(raw.heading, 120),
      items,
    },
  };
}

function validateVideo(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, code: "invalid_video" };
  return {
    ok: true,
    value: {
      type: PRESENTATION_COMPONENT_TYPES.VIDEO,
      title: asTrimmedString(raw.title, 160),
      url: asTrimmedString(raw.url, 500),
      poster: raw.poster == null ? null : raw.poster,
    },
  };
}

function validateAnnouncement(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, code: "invalid_announcement" };
  const cta = optionalCta(raw.cta);
  if (!cta.ok) return cta;
  return {
    ok: true,
    value: {
      type: PRESENTATION_COMPONENT_TYPES.ANNOUNCEMENT,
      title: asTrimmedString(raw.title, 160),
      body: asTrimmedString(raw.body, 2000),
      cta: cta.value,
      visibility: raw.visibility === false ? false : true,
      displayOrder: Number.isFinite(Number(raw.displayOrder))
        ? Math.floor(Number(raw.displayOrder))
        : 0,
    },
  };
}

function validateSeo(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, code: "invalid_seo" };
  return {
    ok: true,
    value: {
      type: PRESENTATION_COMPONENT_TYPES.SEO,
      title: asTrimmedString(raw.title, 80),
      description: asTrimmedString(raw.description, 160),
      image: raw.image == null ? null : raw.image,
      canonicalUrl: asTrimmedString(raw.canonicalUrl, 500),
      robots: asTrimmedString(raw.robots, 40),
      sitemapInclude: raw.sitemapInclude === false ? false : true,
    },
  };
}

function validateFooter(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, code: "invalid_footer" };
  return {
    ok: true,
    value: {
      type: PRESENTATION_COMPONENT_TYPES.FOOTER,
      tagline: asTrimmedString(raw.tagline, 200),
      legal: asTrimmedString(raw.legal, 2000),
      showContact: raw.showContact === false ? false : true,
    },
  };
}

const VALIDATORS = Object.freeze({
  [PRESENTATION_COMPONENT_TYPES.BRANDING]: validateBranding,
  [PRESENTATION_COMPONENT_TYPES.NAVIGATION]: validateNavigation,
  [PRESENTATION_COMPONENT_TYPES.HERO]: validateHero,
  [PRESENTATION_COMPONENT_TYPES.SECTION_HEADING]: validateSectionHeading,
  [PRESENTATION_COMPONENT_TYPES.RICH_TEXT]: validateRichText,
  [PRESENTATION_COMPONENT_TYPES.IMAGE_TEXT]: validateImageText,
  [PRESENTATION_COMPONENT_TYPES.CTA]: validateCta,
  [PRESENTATION_COMPONENT_TYPES.PERSON]: validatePersonPresentation,
  [PRESENTATION_COMPONENT_TYPES.COLLECTION_CARD]: validateCollectionPresentation,
  [PRESENTATION_COMPONENT_TYPES.CONTACT]: validateContact,
  [PRESENTATION_COMPONENT_TYPES.HOURS]: validateHours,
  [PRESENTATION_COMPONENT_TYPES.LOCATION]: validateLocation,
  [PRESENTATION_COMPONENT_TYPES.SOCIAL_LINKS]: validateSocialLinks,
  [PRESENTATION_COMPONENT_TYPES.GALLERY]: validateGallery,
  [PRESENTATION_COMPONENT_TYPES.VIDEO]: validateVideo,
  [PRESENTATION_COMPONENT_TYPES.ANNOUNCEMENT]: validateAnnouncement,
  [PRESENTATION_COMPONENT_TYPES.SEO]: validateSeo,
  [PRESENTATION_COMPONENT_TYPES.FOOTER]: validateFooter,
});

/**
 * @param {string} type
 * @param {unknown} payload
 */
function validatePresentationComponent(type, payload) {
  const componentType = String(type || "").trim();
  if (!isPresentationComponentType(componentType)) {
    return { ok: false, code: "unknown_presentation_component" };
  }
  const validator = VALIDATORS[componentType];
  if (!validator) {
    return { ok: false, code: "missing_validator" };
  }
  const result = validator(payload);
  if (!result.ok) return result;
  // Person validator returns value without type; normalize.
  if (componentType === PRESENTATION_COMPONENT_TYPES.PERSON && result.value) {
    return { ok: true, value: { type: componentType, ...result.value } };
  }
  return result;
}

function listPresentationComponentTypes() {
  return Object.keys(COMPONENT_CONTRACTS);
}

module.exports = {
  COMPONENT_CONTRACTS,
  COMPONENT_SEMANTIC_CONCEPTS,
  COMPONENT_SEMANTIC_CONCEPT_COUNT,
  validatePresentationComponent,
  listPresentationComponentTypes,
  VALIDATORS,
};
