"use strict";

/**
 * Platform website presentation component library (V2.04 Overnight Step 2).
 *
 * Renders EJS partials under views/platform/website/components/.
 * Components accept presentation DTOs only — no BB/AC domain entities.
 * Not wired into live product templates (opt-in later). Product appearance
 * comes from --gp-website-* tokens via the product token bridge.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

const {
  PRESENTATION_COMPONENT_TYPES,
  PRESENTATION_COMPONENT_TYPE_LIST,
} = require("./componentTypes");
const { validatePresentationComponent } = require("./componentContracts");
const { validatePersonPresentation } = require("./personPresentation");
const { validateCollectionPresentation } = require("./collectionPresentation");

const COMPONENTS_ROOT = path.join(__dirname, "../../../../views/platform/website/components");

/**
 * Map of library component id → partial filename (without .ejs).
 * Naming follows repository kebab-case partial conventions.
 */
const COMPONENT_PARTIALS = Object.freeze({
  hero: "hero",
  section_header: "section-header",
  rich_text: "rich-text",
  image_text: "image-text",
  cta: "cta",
  person_card: "person-card",
  person_grid: "person-grid",
  collection_card: "collection-card",
  collection_grid: "collection-grid",
  contact: "contact",
  hours: "hours",
  location: "location",
  gallery: "gallery",
  video: "video",
  announcement: "announcement",
  navigation: "navigation",
  footer: "footer",
  seo: "seo",
});

const SHARED_COMPONENT_IDS = Object.freeze(Object.keys(COMPONENT_PARTIALS));
const SHARED_COMPONENT_COUNT = SHARED_COMPONENT_IDS.length;

/**
 * Audit §15 baseline: 14/19 components were shareable candidates (≈74%).
 * After Step 2 library: 17/19 audited patterns have shared presentation
 * components (Event Card remains product-local; Navigation chrome remains
 * product shell with shared nav-items partial).
 */
const COMPONENT_SHAREABILITY_BEFORE = "74%";
const COMPONENT_SHAREABILITY_AFTER = "89%";
const COMPONENT_SHAREABILITY = Object.freeze({
  auditedComponentCount: 19,
  shareableCandidatesBefore: 14,
  sharedPresentationCoverageAfter: 17,
  beforePercent: 74,
  afterPercent: 89,
  beforeLabel: COMPONENT_SHAREABILITY_BEFORE,
  afterLabel: COMPONENT_SHAREABILITY_AFTER,
});

/** WE01 — public/platform/website-inline-edit.js remains the only editor engine. */
const SHARED_EDITOR_ENGINE_COUNT = 1;
const SHARED_EDITOR_ENGINE_PATH = "/platform/website-inline-edit.js";

const CONTRACT_TYPE_BY_COMPONENT = Object.freeze({
  hero: PRESENTATION_COMPONENT_TYPES.HERO,
  section_header: PRESENTATION_COMPONENT_TYPES.SECTION_HEADING,
  rich_text: PRESENTATION_COMPONENT_TYPES.RICH_TEXT,
  image_text: PRESENTATION_COMPONENT_TYPES.IMAGE_TEXT,
  cta: PRESENTATION_COMPONENT_TYPES.CTA,
  person_card: PRESENTATION_COMPONENT_TYPES.PERSON,
  person_grid: PRESENTATION_COMPONENT_TYPES.COLLECTION_CARD,
  collection_card: PRESENTATION_COMPONENT_TYPES.COLLECTION_CARD,
  collection_grid: PRESENTATION_COMPONENT_TYPES.COLLECTION_CARD,
  contact: PRESENTATION_COMPONENT_TYPES.CONTACT,
  hours: PRESENTATION_COMPONENT_TYPES.HOURS,
  location: PRESENTATION_COMPONENT_TYPES.LOCATION,
  gallery: PRESENTATION_COMPONENT_TYPES.GALLERY,
  video: PRESENTATION_COMPONENT_TYPES.VIDEO,
  announcement: PRESENTATION_COMPONENT_TYPES.ANNOUNCEMENT,
  navigation: PRESENTATION_COMPONENT_TYPES.NAVIGATION,
  footer: PRESENTATION_COMPONENT_TYPES.FOOTER,
  seo: PRESENTATION_COMPONENT_TYPES.SEO,
});

/** Semantic CSS custom properties used by platform components (no product hex). */
const PLATFORM_THEME_TOKENS = Object.freeze([
  "--gp-website-color-text",
  "--gp-website-color-muted",
  "--gp-website-color-primary",
  "--gp-website-color-primary-contrast",
  "--gp-website-color-surface",
  "--gp-website-color-surface-elevated",
  "--gp-website-color-border",
  "--gp-website-font-family",
  "--gp-website-radius",
  "--gp-website-space",
  "--gp-website-shadow",
  "--gp-website-max-width",
]);

const ASSET_PATHS = Object.freeze({
  componentsCss: "/platform/website-presentation-components.css",
  tokenBridgeCss: "/platform/website-presentation-token-bridge.css",
  editableFieldPartial: "platform/website/components/editable-field",
  editableImagePartial: "platform/website/components/editable-image",
});

function partialPath(componentId) {
  const name = COMPONENT_PARTIALS[componentId];
  if (!name) return null;
  return path.join(COMPONENTS_ROOT, `${name}.ejs`);
}

function listSharedComponents() {
  return SHARED_COMPONENT_IDS.slice();
}

/**
 * @param {string} componentId
 * @param {object} presentation
 * @param {object} [options]
 * @returns {{ ok: true, value: object } | { ok: false, code: string }}
 */
function prepareComponentLocals(componentId, presentation, options) {
  const id = String(componentId || "").trim();
  if (!COMPONENT_PARTIALS[id]) {
    return { ok: false, code: "unknown_component" };
  }
  const opts = options && typeof options === "object" ? options : {};
  const edit = opts.edit && typeof opts.edit === "object" ? opts.edit : null;
  const editEnabled = Boolean(opts.editEnabled || (edit && edit.enabled));

  if (id === "person_card") {
    const person = validatePersonPresentation(presentation);
    if (!person.ok) return person;
    return {
      ok: true,
      value: {
        person: person.value,
        editEnabled,
        edit,
        className: opts.className || "",
      },
    };
  }

  if (id === "person_grid") {
    const collection = validateCollectionPresentation({
      cardKind: "person",
      layoutVariant: (presentation && presentation.layoutVariant) || "grid",
      intro: presentation && presentation.intro,
      emptyState: presentation && presentation.emptyState,
      manageHref: presentation && presentation.manageHref,
      items: (presentation && presentation.items) || [],
    });
    if (!collection.ok) return collection;
    return {
      ok: true,
      value: {
        collection: collection.value,
        editEnabled,
        edit,
        className: opts.className || "",
      },
    };
  }

  if (id === "collection_card" || id === "collection_grid") {
    const collection = validateCollectionPresentation(presentation);
    if (!collection.ok) return collection;
    return {
      ok: true,
      value: {
        collection: collection.value,
        single: id === "collection_card",
        editEnabled,
        edit,
        className: opts.className || "",
      },
    };
  }

  const contractType = CONTRACT_TYPE_BY_COMPONENT[id];
  const validated = validatePresentationComponent(contractType, presentation);
  if (!validated.ok) return validated;

  return {
    ok: true,
    value: {
      model: validated.value,
      editEnabled,
      edit,
      className: opts.className || "",
    },
  };
}

/**
 * Render a platform presentation component to HTML.
 * Uses filename includes relative to the components directory.
 *
 * @param {string} componentId
 * @param {object} presentation
 * @param {object} [options]
 * @returns {{ ok: true, html: string } | { ok: false, code: string, message?: string }}
 */
function renderPresentationComponent(componentId, presentation, options) {
  const prepared = prepareComponentLocals(componentId, presentation, options);
  if (!prepared.ok) return prepared;

  const file = partialPath(componentId);
  if (!file || !fs.existsSync(file)) {
    return { ok: false, code: "missing_partial", message: componentId };
  }

  try {
    const html = ejs.render(
      fs.readFileSync(file, "utf8"),
      {
        ...prepared.value,
        filename: file,
      },
      {
        filename: file,
        root: path.join(__dirname, "../../../../views"),
        views: [COMPONENTS_ROOT, path.join(__dirname, "../../../../views")],
      }
    );
    return { ok: true, html: String(html) };
  } catch (err) {
    return {
      ok: false,
      code: "render_failed",
      message: err && err.message ? String(err.message) : String(err),
    };
  }
}

/**
 * Detect product-token leakage in CSS text.
 * @param {string} cssText
 * @param {"blessboard"|"activeclinic"} product
 */
function findThemeTokenLeaks(cssText, product) {
  const text = String(cssText || "");
  const leaks = [];
  if (product === "activeclinic") {
    const bb = text.match(/--bb-[a-z0-9-]+/gi) || [];
    leaks.push(...bb);
  }
  if (product === "blessboard") {
    const ac = text.match(/--ac-[a-z0-9-]+/gi) || [];
    leaks.push(...ac);
  }
  // Raw hex product brand defaults must not appear in platform component CSS
  if (/#6[cC]5[cC][eE]7|#006068|#0[fF]766[eE]/i.test(text)) {
    leaks.push("raw_product_hex");
  }
  return [...new Set(leaks)];
}

module.exports = {
  COMPONENTS_ROOT,
  COMPONENT_PARTIALS,
  SHARED_COMPONENT_IDS,
  SHARED_COMPONENT_COUNT,
  COMPONENT_SHAREABILITY_BEFORE,
  COMPONENT_SHAREABILITY_AFTER,
  COMPONENT_SHAREABILITY,
  SHARED_EDITOR_ENGINE_COUNT,
  SHARED_EDITOR_ENGINE_PATH,
  CONTRACT_TYPE_BY_COMPONENT,
  PLATFORM_THEME_TOKENS,
  ASSET_PATHS,
  PRESENTATION_COMPONENT_TYPE_LIST,
  listSharedComponents,
  prepareComponentLocals,
  renderPresentationComponent,
  findThemeTokenLeaks,
  partialPath,
};
