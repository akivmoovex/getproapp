"use strict";

/**
 * Product-aware allowed section types for Add Section (Wave 4B-2).
 */

const { PRODUCT_CODE } = require("./publicWebsiteUrl");

const BLESSBOARD_SECTION_TYPES = Object.freeze([
  {
    type: "plain_text",
    label: "Text block",
    description: "Heading and body copy for this page.",
    pages: Object.freeze(["home", "about", "contact", "giving"]),
    singleton: false,
    keyPrefix: "text",
    defaultHeading: "New section",
    defaultBody: "",
  },
  {
    type: "plain_text",
    label: "Call to action",
    description: "Short promotional band with button text.",
    pages: Object.freeze(["home", "about", "giving"]),
    singleton: false,
    keyPrefix: "cta",
    defaultHeading: "Take the next step",
    defaultBody: "",
    layout: "cta",
  },
]);

const ACTIVECLINIC_SECTION_TYPES = Object.freeze([
  {
    type: "text",
    label: "Text",
    description: "Heading and paragraph content.",
    pages: Object.freeze(["home", "about", "services", "contact", "pricing", "location"]),
    singleton: false,
  },
  {
    type: "image_text",
    label: "Image + Text",
    description: "Side-by-side image and copy.",
    pages: Object.freeze(["home", "about", "services"]),
    singleton: false,
  },
  {
    type: "cta",
    label: "Call to Action",
    description: "Prominent button and short message.",
    pages: Object.freeze(["home", "about", "services", "pricing"]),
    singleton: false,
  },
  {
    type: "services",
    label: "Services",
    description: "Clinic services from your catalogue.",
    pages: Object.freeze(["home", "services"]),
    singleton: true,
    domainBacked: true,
  },
  {
    type: "doctors",
    label: "Doctors",
    description: "Doctor profiles from your catalogue.",
    pages: Object.freeze(["home", "doctors", "about"]),
    singleton: true,
    domainBacked: true,
  },
  {
    type: "hours",
    label: "Opening Hours",
    description: "Clinic opening hours block.",
    pages: Object.freeze(["home", "location", "contact"]),
    singleton: true,
  },
  {
    type: "contact",
    label: "Contact",
    description: "Contact details and form placement.",
    pages: Object.freeze(["home", "contact"]),
    singleton: true,
  },
]);

const SINGLETON_KEYS = Object.freeze({
  [PRODUCT_CODE.BLESSBOARD]: Object.freeze(["hero", "service_times", "services", "worship_times"]),
  [PRODUCT_CODE.ACTIVECLINIC]: Object.freeze(["hero", "promo", "faq"]),
});

function registryForProduct(productCode) {
  const product = String(productCode || "").trim().toLowerCase();
  if (product === PRODUCT_CODE.ACTIVECLINIC) return ACTIVECLINIC_SECTION_TYPES;
  if (product === PRODUCT_CODE.BLESSBOARD) return BLESSBOARD_SECTION_TYPES;
  return [];
}

function normalizePageKey(pageKey) {
  const key = String(pageKey || "home").trim().toLowerCase();
  return key || "home";
}

/**
 * @param {string} productCode
 * @param {string} pageKey
 * @param {string[]} existingTypesOrKeys
 */
function listAddableSectionTypes(productCode, pageKey, existingTypesOrKeys) {
  const page = normalizePageKey(pageKey);
  const existing = new Set((existingTypesOrKeys || []).map((v) => String(v)));
  const singletons = SINGLETON_KEYS[String(productCode || "").trim().toLowerCase()] || [];
  return registryForProduct(productCode)
    .filter((def) => def.pages.includes(page))
    .filter((def) => {
      if (!def.singleton) return true;
      if (existing.has(def.type)) return false;
      return !singletons.includes(def.type);
    })
    .map((def) => ({
      type: def.type,
      label: def.label,
      description: def.description,
      singleton: def.singleton === true,
      domainBacked: def.domainBacked === true,
      keyPrefix: def.keyPrefix || null,
      defaultHeading: def.defaultHeading || "",
      defaultBody: def.defaultBody || "",
      layout: def.layout || null,
    }));
}

/**
 * @param {string} productCode
 * @param {string} type
 * @param {string} pageKey
 */
function resolveSectionTypeDefinition(productCode, type, pageKey) {
  const page = normalizePageKey(pageKey);
  const found = registryForProduct(productCode).find(
    (def) => String(def.type) === String(type) && def.pages.includes(page)
  );
  return found || null;
}

function isSingletonViolation(productCode, type, existingTypesOrKeys) {
  const def = registryForProduct(productCode).find((item) => String(item.type) === String(type));
  if (!def || !def.singleton) return false;
  const existing = new Set((existingTypesOrKeys || []).map((v) => String(v)));
  return existing.has(String(type));
}

module.exports = {
  BLESSBOARD_SECTION_TYPES,
  ACTIVECLINIC_SECTION_TYPES,
  SINGLETON_KEYS,
  listAddableSectionTypes,
  resolveSectionTypeDefinition,
  isSingletonViolation,
};
