"use strict";

/**
 * Field inventory from docs/qa/V2_04_AC_WEBSITE_PLATFORM_REUSE_AUDIT.md §6.
 * Presentation code maps Class A + B; Class C stays product-owned; Class D is
 * documented only (no overnight migration).
 */

const AUDIT_FIELD_INVENTORY = Object.freeze({
  /** PLATFORM_UNIVERSAL_FIELDS (Class A) */
  universal: 18,
  /** PLATFORM_COMPONENT_PRODUCT_SEMANTIC_FIELDS (Class B) */
  componentSemantic: 42,
  /** PRODUCT_SPECIFIC_FIELDS (Class C) — preserve; do not force into universal keys */
  productSpecific: 175,
  /** Legacy / duplicate (Class D) — map only; do not migrate overnight */
  legacyDuplicates: 25,
});

const AUDIT_FIELD_TOTAL =
  AUDIT_FIELD_INVENTORY.universal +
  AUDIT_FIELD_INVENTORY.componentSemantic +
  AUDIT_FIELD_INVENTORY.productSpecific +
  AUDIT_FIELD_INVENTORY.legacyDuplicates;

module.exports = {
  AUDIT_FIELD_INVENTORY,
  AUDIT_FIELD_TOTAL,
};
