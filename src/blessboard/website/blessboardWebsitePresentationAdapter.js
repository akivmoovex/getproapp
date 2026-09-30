"use strict";

/**
 * BlessBoard → platform website presentation adapter (V2.04 Phase 3).
 *
 * Maps already-resolved BB website / catalogue rows into platform presentation
 * DTOs. Does NOT query church domain tables. Does NOT implement draft, publish,
 * version, restore, media upload, or inline editor engines.
 *
 * Flow:
 *   BB DOMAIN (product-owned loaders)
 *     → BB PRESENTATION ADAPTER (this module)
 *     → PLATFORM PRESENTATION MODEL
 *     → SHARED COMPONENT (Phase 4 cutover)
 *
 * Church-specific surfaces (sermon player, giving widgets, HQ/branch policy UX)
 * remain BB_DOMAIN_ONLY — not forced into generic platform primitives.
 */

const presentation = require("../../platform/website/presentation");
const {
  PRESENTATION_COMPONENT_TYPES,
  validatePresentationComponent,
  validateCollectionPresentation,
  adaptLeaderToPersonPresentation,
  adaptMinistryToOfferingCard,
  COLLECTION_CARD_KINDS,
  COLLECTION_LAYOUT_VARIANTS,
} = presentation;

const PRODUCT_CODE = "blessboard";

const STEP = Object.freeze({
  id: "v2_04_phase_3",
  name: "blessboard_website_presentation_adapter",
  wiredToPublicRender: true,
  wiredPublicSurfaces: Object.freeze([
    "leader_card_person",
    "cta_band",
    "service_times_hours",
  ]),
  wiredToEditorMutation: false,
});

/** Content keys that stay church-owned (not universal field vocabulary). */
const PRODUCT_SPECIFIC_CONTENT_KEYS = Object.freeze([
  "sermon.video_url",
  "sermon.audio_url",
  "giving.embed_url",
  "giving.instructions",
  "event.rsvp_url",
  "ministry.join_form",
  "branch.pastor_message",
  "hq.branch_directory_note",
]);

/**
 * Pastor / leader row → PersonPresentation.
 * @param {object} leader
 */
function toPersonPresentation(leader) {
  return adaptLeaderToPersonPresentation(leader, { productCode: PRODUCT_CODE });
}

/**
 * Ministry row → offering CollectionCard.
 * @param {object} ministry
 */
function toMinistryCard(ministry) {
  return adaptMinistryToOfferingCard(ministry, { productCode: PRODUCT_CODE });
}

/**
 * Ministry list → CollectionPresentation.
 * @param {object} input
 */
function toMinistryCollection(input) {
  const row = input && typeof input === "object" ? input : {};
  const items = Array.isArray(row.items)
    ? row.items
        .map((m) => {
          const card = toMinistryCard(m);
          return card && card.ok ? card.value : null;
        })
        .filter(Boolean)
    : [];
  return validateCollectionPresentation({
    cardKind: COLLECTION_CARD_KINDS.OFFERING,
    layoutVariant: row.layoutVariant || COLLECTION_LAYOUT_VARIANTS.GRID,
    intro: row.intro || {
      title: row.title || "Ministries",
      lead: row.lead || null,
    },
    emptyState: row.emptyState || null,
    manageHref: row.manageHref || null,
    items,
  });
}

/**
 * Generic hero section payload → platform Hero.
 * @param {object} hero
 */
function toHero(hero) {
  const row = hero && typeof hero === "object" ? hero : {};
  return validatePresentationComponent(PRESENTATION_COMPONENT_TYPES.HERO, {
    eyebrow: row.eyebrow || null,
    title: row.title || row.heading || "",
    subtitle: row.subtitle || row.description || row.body || null,
    image: row.imageUrl != null ? row.imageUrl : row.image != null ? row.image : row.mediaUrl,
    primaryCta:
      row.primaryCta ||
      (row.primaryLabel || row.ctaLabel
        ? { label: row.primaryLabel || row.ctaLabel, url: row.primaryUrl || row.ctaUrl || null }
        : null),
    secondaryCta:
      row.secondaryCta ||
      (row.secondaryLabel
        ? { label: row.secondaryLabel, url: row.secondaryUrl || null }
        : null),
  });
}

/**
 * Generic CTA band → platform CTA.
 * @param {object} cta
 */
function toCta(cta) {
  const row = cta && typeof cta === "object" ? cta : {};
  return validatePresentationComponent(PRESENTATION_COMPONENT_TYPES.CTA, {
    heading: row.heading || row.title || "",
    body: row.body || row.description || null,
    primaryCta:
      row.primaryCta ||
      (row.primaryLabel
        ? { label: row.primaryLabel, url: row.primaryUrl || null }
        : row.label
          ? { label: row.label, url: row.url || null }
          : null),
    secondaryCta:
      row.secondaryCta ||
      (row.secondaryLabel
        ? { label: row.secondaryLabel, url: row.secondaryUrl || null }
        : null),
  });
}

/**
 * Service / worship times → platform Hours (when semantically compatible).
 * @param {object} hours
 */
function toHours(hours) {
  const row = hours && typeof hours === "object" ? hours : {};
  if (Array.isArray(row.rows)) {
    return validatePresentationComponent(PRESENTATION_COMPONENT_TYPES.HOURS, {
      heading: row.heading || row.title || null,
      rows: row.rows,
      text: row.text || null,
    });
  }
  // Flat church service_times: [{ day, time, label }] or body text.
  if (Array.isArray(row.times)) {
    return validatePresentationComponent(PRESENTATION_COMPONENT_TYPES.HOURS, {
      heading: row.heading || row.title || "Service times",
      rows: row.times.map((t, index) => ({
        label: (t && (t.label || t.name)) || null,
        days: (t && (t.days || t.day)) || null,
        open: (t && (t.open || t.time || t.value || t.hours)) || null,
        close: (t && t.close) || null,
        note: (t && t.note) || null,
        displayOrder: index,
      })),
      text: null,
    });
  }
  return validatePresentationComponent(PRESENTATION_COMPONENT_TYPES.HOURS, {
    heading: row.heading || row.title || null,
    rows: [],
    text: row.text || row.body || row.description || null,
  });
}

/**
 * Generic gallery / media strip → platform Gallery.
 * @param {object} gallery
 */
function toGallery(gallery) {
  const row = gallery && typeof gallery === "object" ? gallery : {};
  const items = Array.isArray(row.items)
    ? row.items.map((img, index) => {
        if (!img || typeof img !== "object") {
          if (typeof img === "string") return { image: img, displayOrder: index };
          return null;
        }
        return {
          image: img.image != null ? img.image : img.src || img.url || img.imageUrl || null,
          caption: img.caption || img.alt || null,
          displayOrder: img.displayOrder != null ? img.displayOrder : index,
          visibility: img.visibility !== false,
        };
      })
    : Array.isArray(row.images)
      ? row.images.map((img, index) =>
          typeof img === "string"
            ? { image: img, displayOrder: index }
            : {
                image: img && (img.image || img.src || img.url || img.imageUrl),
                caption: img && (img.caption || img.alt),
                displayOrder: index,
              }
        )
      : [];
  return validatePresentationComponent(PRESENTATION_COMPONENT_TYPES.GALLERY, {
    heading: row.heading || row.title || null,
    items: items.filter(Boolean),
  });
}

/**
 * Leadership roster → PersonPresentation[].
 * @param {object[]} leaders
 */
function toLeadershipPeople(leaders) {
  return (Array.isArray(leaders) ? leaders : [])
    .map((l) => {
      const person = toPersonPresentation(l);
      return person && person.ok ? person.value : null;
    })
    .filter(Boolean);
}

function isProductSpecificContentKey(key) {
  return PRODUCT_SPECIFIC_CONTENT_KEYS.includes(String(key || "").trim());
}

module.exports = {
  PRODUCT_CODE,
  STEP,
  PRODUCT_SPECIFIC_CONTENT_KEYS,
  isProductSpecificContentKey,
  toPersonPresentation,
  toMinistryCard,
  toMinistryCollection,
  toHero,
  toCta,
  toHours,
  toGallery,
  toLeadershipPeople,
  PRESENTATION_COMPONENT_TYPES,
};
