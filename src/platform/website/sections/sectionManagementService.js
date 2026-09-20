"use strict";

/**
 * Shared website section lifecycle facade (V8 Prompt 10).
 * Dispatches to product adapters; never writes published content directly.
 * Every mutation requires website.edit (via grantedPermissions / requireEdit).
 */

const { PRODUCT_CODE } = require("../publicWebsiteUrl");
const { PERMISSIONS, hasWebsitePermission } = require("../permissions");
const {
  listAddableSectionTypes,
  resolveSectionTypeDefinition,
  isSingletonViolation,
} = require("../sectionRegistry");
const {
  validateSectionContent,
  validateSectionOrder,
} = require("./sectionValidation");
const {
  allocateStableSectionId,
  sortSectionsDeterministically,
  applyDeterministicOrder,
} = require("./sectionOrdering");

const RESULT = Object.freeze({
  OK: "ok",
  FORBIDDEN: "forbidden",
  INVALID_INPUT: "invalid_input",
  INVALID_TYPE: "invalid_section_type",
  INVALID_PRODUCT: "invalid_product",
  SINGLETON: "singleton_exists",
  LOCKED: "locked_item",
  NOT_FOUND: "not_found",
  MALFORMED: "malformed_content",
});

function requireEditPermission(grantedPermissions) {
  if (!hasWebsitePermission(grantedPermissions || [], PERMISSIONS.EDIT)) {
    return { ok: false, code: RESULT.FORBIDDEN, published: false };
  }
  return { ok: true };
}

function listConfiguredSectionTypes(productCode, pageKey, existing) {
  return listAddableSectionTypes(productCode, pageKey, existing || []);
}

/**
 * Unified section mutation entrypoint.
 * @param {{ query: Function }} db
 * @param {{
 *   productCode: string,
 *   action: string,
 *   pageKey?: string,
 *   grantedPermissions?: string[],
 *   organizationId?: string,
 *   churchId?: string,
 *   branchId?: string|null,
 *   instanceId?: string,
 *   clinicId?: string,
 *   editorUserId?: string,
 *   actorRole?: string|null,
 *   type?: string,
 *   sectionKey?: string,
 *   sectionId?: string,
 *   order?: string[],
 *   heading?: string,
 *   bodyText?: string,
 *   body?: string,
 *   mediaUrl?: string,
 *   image?: object|null,
 *   title?: string,
 *   buttonLabel?: string,
 *   buttonUrl?: string,
 * }} input
 */
async function manageWebsiteSection(db, input) {
  const src = input && typeof input === "object" ? input : {};
  const productCode = String(src.productCode || "").trim().toLowerCase();
  const action = String(src.action || "").trim().toLowerCase();
  const pageKey = String(src.pageKey || "home").trim() || "home";

  if (!productCode) return { ok: false, code: RESULT.INVALID_PRODUCT, published: false };
  if (!action) return { ok: false, code: RESULT.INVALID_INPUT, published: false };

  const gate = requireEditPermission(src.grantedPermissions);
  if (!gate.ok) return gate;

  if (action === "list_types") {
    return {
      ok: true,
      code: RESULT.OK,
      published: false,
      sections: listConfiguredSectionTypes(productCode, pageKey, src.existing || []),
    };
  }

  if (action === "add") {
    return addSection(db, { ...src, productCode, pageKey });
  }
  if (action === "update" || action === "update_section") {
    return updateSection(db, { ...src, productCode, pageKey });
  }
  if (action === "remove" || action === "delete") {
    return removeSection(db, { ...src, productCode, pageKey });
  }
  if (action === "reorder") {
    return reorderSection(db, { ...src, productCode, pageKey });
  }

  // Product adapters handle hide/show/restore/move via existing action services.
  if (productCode === PRODUCT_CODE.BLESSBOARD) {
    const bb = require("../../../blessboard/website/blessboardSectionActionService");
    const result = await bb.applySectionAction(db, {
      ...src,
      action,
      pageKey,
    });
    return { ...result, published: false };
  }
  if (productCode === PRODUCT_CODE.ACTIVECLINIC) {
    const ac = require("../../../activeclinic/website/activeClinicSectionActionService");
    const result = await ac.applySectionAction(db, {
      ...src,
      action,
      pageKey,
    });
    return { ...result, published: false };
  }
  return { ok: false, code: RESULT.INVALID_PRODUCT, published: false };
}

async function addSection(db, input) {
  const type = String(input.type || "").trim();
  const def = resolveSectionTypeDefinition(input.productCode, type, input.pageKey);
  if (!def) return { ok: false, code: RESULT.INVALID_TYPE, published: false };

  const content = validateSectionContent({
    productCode: input.productCode,
    sectionType: type,
    heading: input.heading != null ? input.heading : def.defaultHeading,
    bodyText: input.bodyText != null ? input.bodyText : input.body != null ? input.body : def.defaultBody,
    mediaUrl: input.mediaUrl,
    image: input.image,
    title: input.title || def.label,
    buttonLabel: input.buttonLabel,
    buttonUrl: input.buttonUrl,
  });
  if (!content.ok) {
    return { ok: false, code: RESULT.MALFORMED, error: content.error, published: false };
  }

  if (input.productCode === PRODUCT_CODE.BLESSBOARD) {
    const { addWebsiteSection } = require("../websiteAddSectionService");
    return addWebsiteSection(db, {
      ...input,
      type,
      heading: content.payload.heading || def.defaultHeading || "New section",
      bodyText: content.payload.bodyText,
      mediaUrl: content.payload.mediaUrl,
    });
  }
  if (input.productCode === PRODUCT_CODE.ACTIVECLINIC) {
    const { addWebsiteSection } = require("../websiteAddSectionService");
    return addWebsiteSection(db, {
      ...input,
      type,
      title: content.payload.title || def.label || type,
      heading: content.payload.heading || "",
      body: content.payload.body || "",
      image: content.payload.image,
      buttonLabel: content.payload.buttonLabel || "",
      buttonUrl: content.payload.buttonUrl || "",
    });
  }
  return { ok: false, code: RESULT.INVALID_PRODUCT, published: false };
}

async function updateSection(db, input) {
  const content = validateSectionContent({
    productCode: input.productCode,
    sectionType: input.type || input.sectionType || "text",
    heading: input.heading,
    bodyText: input.bodyText != null ? input.bodyText : input.body,
    mediaUrl: input.mediaUrl,
    image: input.image,
    title: input.title,
    buttonLabel: input.buttonLabel,
    buttonUrl: input.buttonUrl,
  });
  if (!content.ok) {
    return { ok: false, code: RESULT.MALFORMED, error: content.error, published: false };
  }

  if (input.productCode === PRODUCT_CODE.BLESSBOARD) {
    const bb = require("../../../blessboard/website/blessboardSectionActionService");
    return bb.updateSectionContent(db, {
      ...input,
      heading: content.payload.heading,
      bodyText: content.payload.bodyText,
      mediaUrl: content.payload.mediaUrl,
    });
  }
  if (input.productCode === PRODUCT_CODE.ACTIVECLINIC) {
    const cmsService = require("../../../activeclinic/website/clinicWebsiteCmsService");
    const sectionId = String(input.sectionId || input.sectionKey || "").trim();
    if (!sectionId) return { ok: false, code: RESULT.INVALID_INPUT, published: false };
    const updated = await cmsService.updateSection(db, {
      organizationId: input.organizationId,
      instanceId: input.instanceId,
      clinicId: input.clinicId,
      sectionId,
      title: content.payload.title,
      heading: content.payload.heading,
      body: content.payload.body,
      image: content.payload.image,
      buttonLabel: content.payload.buttonLabel,
      buttonUrl: content.payload.buttonUrl,
      grantedPermissions: input.grantedPermissions,
    });
    if (!updated.ok) return { ...updated, published: false };
    return { ok: true, code: RESULT.OK, section: updated.section, published: false };
  }
  return { ok: false, code: RESULT.INVALID_PRODUCT, published: false };
}

async function removeSection(db, input) {
  if (input.productCode === PRODUCT_CODE.BLESSBOARD) {
    const bb = require("../../../blessboard/website/blessboardSectionActionService");
    return bb.applySectionAction(db, { ...input, action: "remove" });
  }
  if (input.productCode === PRODUCT_CODE.ACTIVECLINIC) {
    const ac = require("../../../activeclinic/website/activeClinicSectionActionService");
    return ac.applySectionAction(db, { ...input, action: "remove" });
  }
  return { ok: false, code: RESULT.INVALID_PRODUCT, published: false };
}

async function reorderSection(db, input) {
  const orderCheck = validateSectionOrder(input.order);
  if (!orderCheck.ok) {
    return { ok: false, code: RESULT.INVALID_INPUT, error: orderCheck.error, published: false };
  }
  if (input.productCode === PRODUCT_CODE.BLESSBOARD) {
    const bb = require("../../../blessboard/website/blessboardSectionActionService");
    return bb.applySectionAction(db, {
      ...input,
      action: "reorder",
      order: orderCheck.order,
    });
  }
  if (input.productCode === PRODUCT_CODE.ACTIVECLINIC) {
    const ac = require("../../../activeclinic/website/activeClinicSectionActionService");
    return ac.applySectionAction(db, {
      ...input,
      action: "reorder",
      order: orderCheck.order,
    });
  }
  return { ok: false, code: RESULT.INVALID_PRODUCT, published: false };
}

module.exports = {
  RESULT,
  requireEditPermission,
  listConfiguredSectionTypes,
  manageWebsiteSection,
  allocateStableSectionId,
  sortSectionsDeterministically,
  applyDeterministicOrder,
  validateSectionContent,
  validateSectionOrder,
  isSingletonViolation,
  resolveSectionTypeDefinition,
};
