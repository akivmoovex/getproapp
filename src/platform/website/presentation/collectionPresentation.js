"use strict";

/**
 * Collection / card presentation contracts.
 *
 * Platform owns: ordering, visibility, image, title, subtitle, description,
 * CTA, layout variant.
 * Product adapters supply domain-specific data and labels.
 */

const { validatePersonPresentation } = require("./personPresentation");
const { PRESENTATION_COMPONENT_TYPES } = require("./componentTypes");

const COLLECTION_CARD_KINDS = Object.freeze({
  PERSON: "person",
  OFFERING: "offering",
  GENERIC: "generic",
  QUOTE: "quote",
  FAQ: "faq",
});

const COLLECTION_LAYOUT_VARIANTS = Object.freeze({
  GRID: "grid",
  LIST: "list",
  CAROUSEL: "carousel",
});

const COLLECTION_MEDIA_VARIANTS = Object.freeze({
  IMAGE: "image",
  ICON: "icon",
});

const COLLECTION_CARD_FIELDS = Object.freeze([
  "image",
  "icon",
  "title",
  "subtitle",
  "description",
  "cta",
  "secondaryCta",
  "detailHref",
  "mediaVariant",
  "displayOrder",
  "visibility",
  "featured",
  "layoutVariant",
]);

/**
 * @typedef {object} CollectionCardPresentation
 * @property {string} [kind]
 * @property {object|string|null} [image]
 * @property {string} title
 * @property {string|null} [subtitle]
 * @property {string|null} [description]
 * @property {{ label?: string|null, url?: string|null }|null} [cta]
 * @property {number} [displayOrder]
 * @property {boolean} [visibility]
 * @property {boolean} [featured]
 * @property {string|null} [sourceProduct]
 * @property {string|null} [sourceDomain]
 * @property {string|null} [sourceId]
 */

/**
 * @typedef {object} CollectionPresentation
 * @property {string} cardKind
 * @property {string} [layoutVariant]
 * @property {string|null} [intro]
 * @property {{ heading?: string|null, body?: string|null }|null} [emptyState]
 * @property {string|null} [manageHref]
 * @property {CollectionCardPresentation[]|PersonPresentation[]} items
 */

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: CollectionCardPresentation } | { ok: false, code: string }}
 */
function validateCollectionCardPresentation(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, code: "invalid_collection_card" };
  }
  const title = String(raw.title == null ? "" : raw.title).trim();
  if (!title || title.length > 200) {
    return { ok: false, code: "invalid_collection_card_title" };
  }
  const kind = String(raw.kind || COLLECTION_CARD_KINDS.GENERIC).trim();
  if (!Object.values(COLLECTION_CARD_KINDS).includes(kind)) {
    return { ok: false, code: "invalid_collection_card_kind" };
  }

  let displayOrder = 0;
  if (raw.displayOrder != null && raw.displayOrder !== "") {
    const n = Number(raw.displayOrder);
    if (!Number.isFinite(n) || n < 0 || n > 100000) {
      return { ok: false, code: "invalid_collection_card_order" };
    }
    displayOrder = Math.floor(n);
  }

  let cta = null;
  if (raw.cta != null) {
    if (typeof raw.cta !== "object" || Array.isArray(raw.cta)) {
      return { ok: false, code: "invalid_collection_card_cta" };
    }
    cta = {
      label: raw.cta.label == null ? null : String(raw.cta.label).trim().slice(0, 80) || null,
      url: raw.cta.url == null ? null : String(raw.cta.url).trim().slice(0, 500) || null,
    };
  }

  let secondaryCta = null;
  if (raw.secondaryCta != null) {
    if (typeof raw.secondaryCta !== "object" || Array.isArray(raw.secondaryCta)) {
      return { ok: false, code: "invalid_collection_card_secondary_cta" };
    }
    secondaryCta = {
      label:
        raw.secondaryCta.label == null
          ? null
          : String(raw.secondaryCta.label).trim().slice(0, 80) || null,
      url:
        raw.secondaryCta.url == null
          ? null
          : String(raw.secondaryCta.url).trim().slice(0, 500) || null,
    };
  }

  let mediaVariant = COLLECTION_MEDIA_VARIANTS.IMAGE;
  if (raw.mediaVariant != null && raw.mediaVariant !== "") {
    const variant = String(raw.mediaVariant).trim();
    if (!Object.values(COLLECTION_MEDIA_VARIANTS).includes(variant)) {
      return { ok: false, code: "invalid_collection_media_variant" };
    }
    mediaVariant = variant;
  } else if (raw.icon != null && raw.image == null) {
    mediaVariant = COLLECTION_MEDIA_VARIANTS.ICON;
  }

  return {
    ok: true,
    value: {
      kind,
      image: raw.image == null ? null : raw.image,
      icon: raw.icon == null ? null : raw.icon,
      title,
      subtitle: raw.subtitle == null ? null : String(raw.subtitle).trim().slice(0, 200) || null,
      description:
        raw.description == null ? null : String(raw.description).trim().slice(0, 4000) || null,
      cta,
      secondaryCta,
      detailHref:
        raw.detailHref == null ? null : String(raw.detailHref).trim().slice(0, 500) || null,
      mediaVariant,
      displayOrder,
      visibility: raw.visibility === false ? false : true,
      featured: raw.featured === true,
      sourceProduct: raw.sourceProduct == null ? null : String(raw.sourceProduct).trim() || null,
      sourceDomain: raw.sourceDomain == null ? null : String(raw.sourceDomain).trim() || null,
      sourceId: raw.sourceId == null ? null : String(raw.sourceId).trim() || null,
    },
  };
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: CollectionPresentation } | { ok: false, code: string, message?: string }}
 */
function validateCollectionPresentation(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, code: "invalid_collection_presentation" };
  }
  const cardKind = String(raw.cardKind || COLLECTION_CARD_KINDS.GENERIC).trim();
  if (!Object.values(COLLECTION_CARD_KINDS).includes(cardKind)) {
    return { ok: false, code: "invalid_collection_card_kind" };
  }
  const layoutVariant = String(raw.layoutVariant || COLLECTION_LAYOUT_VARIANTS.GRID).trim();
  if (!Object.values(COLLECTION_LAYOUT_VARIANTS).includes(layoutVariant)) {
    return { ok: false, code: "invalid_collection_layout" };
  }
  if (!Array.isArray(raw.items)) {
    return { ok: false, code: "invalid_collection_items" };
  }

  const items = [];
  for (let i = 0; i < raw.items.length; i += 1) {
    const item = raw.items[i];
    if (cardKind === COLLECTION_CARD_KINDS.PERSON) {
      const person = validatePersonPresentation(item);
      if (!person.ok) {
        return { ok: false, code: person.code, message: `items[${i}]` };
      }
      items.push(person.value);
    } else {
      const card = validateCollectionCardPresentation({
        ...item,
        kind: item && item.kind ? item.kind : cardKind,
      });
      if (!card.ok) {
        return { ok: false, code: card.code, message: `items[${i}]` };
      }
      items.push(card.value);
    }
  }

  items.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  let emptyState = null;
  if (raw.emptyState != null) {
    if (typeof raw.emptyState !== "object" || Array.isArray(raw.emptyState)) {
      return { ok: false, code: "invalid_collection_empty_state" };
    }
    emptyState = {
      heading:
        raw.emptyState.heading == null
          ? null
          : String(raw.emptyState.heading).trim().slice(0, 160) || null,
      body:
        raw.emptyState.body == null
          ? null
          : String(raw.emptyState.body).trim().slice(0, 1000) || null,
    };
  }

  return {
    ok: true,
    value: {
      cardKind,
      layoutVariant,
      intro: raw.intro == null ? null : String(raw.intro).trim().slice(0, 2000) || null,
      emptyState,
      manageHref:
        raw.manageHref == null ? null : String(raw.manageHref).trim().slice(0, 500) || null,
      items,
      componentType: PRESENTATION_COMPONENT_TYPES.COLLECTION_CARD,
    },
  };
}

module.exports = {
  COLLECTION_CARD_KINDS,
  COLLECTION_LAYOUT_VARIANTS,
  COLLECTION_MEDIA_VARIANTS,
  COLLECTION_CARD_FIELDS,
  validateCollectionCardPresentation,
  validateCollectionPresentation,
};
