"use strict";

/**
 * Minimal shared section-management contract for BlessBoard + ActiveClinic.
 * Backed by sectionRegistry + product action services — not a page builder.
 */

const {
  BLESSBOARD_SECTION_TYPES,
  ACTIVECLINIC_SECTION_TYPES,
  listAddableSectionTypes,
  describeAddSectionAvailability,
  collectionPageGuidance,
} = require("../sectionRegistry");
const { PRODUCT_CODE } = require("../publicWebsiteUrl");

const SHARED_OPERATIONS = Object.freeze([
  "add_section",
  "edit",
  "move_up",
  "move_down",
  "hide",
  "show",
  "restore_default",
  "remove",
]);

const ITEM_OPERATIONS = Object.freeze({
  blessboard_collections: Object.freeze(["add_item", "edit_item", "remove_item", "reorder_items"]),
  activeclinic_faq: Object.freeze(["add_item", "edit_item", "remove_item", "reorder_items"]),
});

function mapBlessBoardDef(def) {
  return {
    type: def.type,
    label: def.label,
    kind: def.kind || (def.layout === "cta" ? "text" : null),
    products: Object.freeze([PRODUCT_CODE.BLESSBOARD]),
    pages: def.pages,
    singleton: def.singleton === true,
    domainBacked: false,
    editableFields: Object.freeze(
      def.kind === "image"
        ? ["heading", "mediaUrl", "altText"]
        : def.kind === "image_text"
          ? ["heading", "bodyText", "mediaUrl", "altText"]
          : ["heading", "bodyText"]
    ),
    itemOperations: Object.freeze([]),
    visibility: true,
    ordering: true,
    removable: true,
  };
}

function mapActiveClinicDef(def) {
  const domain = def.domainBacked === true;
  return {
    type: def.type,
    label: def.label,
    kind: domain ? "domain" : def.type === "image_text" ? "image_text" : "text",
    products: Object.freeze([PRODUCT_CODE.ACTIVECLINIC]),
    pages: def.pages,
    singleton: def.singleton === true,
    domainBacked: domain,
    editableFields: Object.freeze(
      domain
        ? ["heading", "body"]
        : def.type === "image_text"
          ? ["heading", "body", "image"]
          : ["heading", "body"]
    ),
    itemOperations: Object.freeze([]),
    visibility: true,
    ordering: !domain,
    removable: !domain,
  };
}

/**
 * @param {string} [productCode]
 * @returns {object[]}
 */
function listSupportedSectionTypes(productCode) {
  const product = String(productCode || "").trim().toLowerCase();
  if (product === PRODUCT_CODE.BLESSBOARD) {
    return BLESSBOARD_SECTION_TYPES.map(mapBlessBoardDef);
  }
  if (product === PRODUCT_CODE.ACTIVECLINIC) {
    return ACTIVECLINIC_SECTION_TYPES.map(mapActiveClinicDef);
  }
  return BLESSBOARD_SECTION_TYPES.map(mapBlessBoardDef).concat(
    ACTIVECLINIC_SECTION_TYPES.map(mapActiveClinicDef)
  );
}

/**
 * @param {string} productCode
 * @param {string} pageKey
 * @param {string[]} [existing]
 */
function describePageSectionSupport(productCode, pageKey, existing) {
  const availability = describeAddSectionAvailability(productCode, pageKey, existing || []);
  const guidance = collectionPageGuidance(pageKey);
  return {
    productCode: String(productCode || "").trim().toLowerCase(),
    pageKey: String(pageKey || "home").trim() || "home",
    sharedOperations: SHARED_OPERATIONS,
    canAddSection: availability.canAddSection,
    addableTypes: listAddableSectionTypes(productCode, pageKey, existing || []),
    emptyHint: availability.emptyHint,
    memberAction: availability.memberAction,
    collectionManaged: Boolean(guidance),
    itemOperations: guidance
      ? ITEM_OPERATIONS.blessboard_collections
      : String(productCode).toLowerCase() === PRODUCT_CODE.ACTIVECLINIC &&
          String(pageKey).toLowerCase() === "home"
        ? ITEM_OPERATIONS.activeclinic_faq
        : Object.freeze([]),
    unsupportedNote:
      "Arbitrary new section types, drag-and-drop library columns, and theme-pack section catalogs are not supported. Use registry types only.",
  };
}

module.exports = {
  SHARED_OPERATIONS,
  ITEM_OPERATIONS,
  listSupportedSectionTypes,
  describePageSectionSupport,
};
