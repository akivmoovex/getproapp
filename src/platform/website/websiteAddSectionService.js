"use strict";

const {
  listAddableSectionTypes,
  resolveSectionTypeDefinition,
  isSingletonViolation,
} = require("./sectionRegistry");
const { PRODUCT_CODE } = require("./publicWebsiteUrl");
const { getWebsiteAddSectionHandler } = require("../contracts/productRuntimeRegistry");
const { allocateStableSectionId } = require("./sections/sectionOrdering");
const { validateSectionContent } = require("./sections/sectionValidation");
const { PERMISSIONS, hasWebsitePermission } = require("./permissions");

function requireEdit(input) {
  if (!hasWebsitePermission(input && input.grantedPermissions, PERMISSIONS.EDIT)) {
    return { ok: false, code: "forbidden", published: false };
  }
  return { ok: true };
}

async function listExistingForProduct(db, input, productCode) {
  const handler = getWebsiteAddSectionHandler(productCode);
  if (!handler) return [];
  if (productCode === PRODUCT_CODE.BLESSBOARD && typeof handler.listExistingSectionKeys === "function") {
    return handler.listExistingSectionKeys(db, input);
  }
  if (
    productCode === PRODUCT_CODE.ACTIVECLINIC &&
    typeof handler.listExistingSectionTypes === "function"
  ) {
    return handler.listExistingSectionTypes(db, input);
  }
  return [];
}

async function listAddableSections(db, input) {
  const gate = requireEdit(input);
  if (!gate.ok) return gate;
  const productCode = String(input.productCode || "").trim().toLowerCase();
  const pageKey = String(input.pageKey || "home").trim() || "home";
  const existing = await listExistingForProduct(db, input, productCode);
  return {
    ok: true,
    sections: listAddableSectionTypes(productCode, pageKey, existing),
    existing,
    published: false,
    ...(() => {
      const {
        describeAddSectionAvailability,
      } = require("./sectionRegistry");
      const availability = describeAddSectionAvailability(productCode, pageKey, existing);
      return {
        canAddSection: availability.canAddSection,
        emptyHint: availability.emptyHint,
        memberAction: availability.memberAction,
        collectionManaged: availability.collectionManaged,
      };
    })(),
  };
}

async function addBlessBoardSection(db, input) {
  const handler = getWebsiteAddSectionHandler(PRODUCT_CODE.BLESSBOARD);
  if (!handler || typeof handler.saveStructuredDraft !== "function" || !handler.contentRepo) {
    return { ok: false, code: "invalid_product", published: false };
  }
  const { saveStructuredDraft, contentRepo } = handler;
  const pageKey = String(input.pageKey || "home").trim() || "home";
  const type = String(input.type || "").trim();
  const def = resolveSectionTypeDefinition(PRODUCT_CODE.BLESSBOARD, type, pageKey);
  if (!def) return { ok: false, code: "invalid_section_type", published: false };
  const existing = await listExistingForProduct(db, input, PRODUCT_CODE.BLESSBOARD);
  if (isSingletonViolation(PRODUCT_CODE.BLESSBOARD, type, existing)) {
    return { ok: false, code: "singleton_exists", published: false };
  }
  const content = validateSectionContent({
    productCode: PRODUCT_CODE.BLESSBOARD,
    sectionType: type,
    heading: input.heading != null ? input.heading : def.defaultHeading,
    bodyText: input.bodyText != null ? input.bodyText : def.defaultBody,
    mediaUrl: input.mediaUrl,
    image: input.image,
  });
  if (!content.ok) {
    return { ok: false, code: "malformed_content", error: content.error, published: false };
  }
  const sectionKey = allocateStableSectionId(def.keyPrefix || type, { style: "bb" });
  const page = await contentRepo.findPageByScope(db, {
    churchId: input.churchId,
    branchId: input.branchId || null,
    pageKey,
  });
  const baseOrder = page
    ? (await contentRepo.listSectionsForPage(db, page.id, {})).length
    : 0;
  const headingRaw = content.payload.heading || def.defaultHeading || "New section";
  await saveStructuredDraft(db, {
    organizationId: input.organizationId,
    churchId: input.churchId,
    branchId: input.branchId || null,
    editorUserId: input.editorUserId,
    actorRole: input.actorRole || null,
    draftKind: "page_section",
    pageKey,
    sectionKey,
    entityKey: `section:${sectionKey}:add`,
    op: "add_section",
    payload: {
      sectionKey,
      sectionType: type,
      heading: headingRaw,
      bodyText: content.payload.bodyText,
      mediaUrl: content.payload.mediaUrl,
      sortOrder: (baseOrder + 1) * 10,
      layout: def.layout || null,
    },
    previousPayload: null,
  });
  return {
    ok: true,
    sectionKey,
    sectionType: type,
    published: false,
  };
}

async function addActiveClinicSection(db, input) {
  const handler = getWebsiteAddSectionHandler(PRODUCT_CODE.ACTIVECLINIC);
  if (!handler || !handler.cmsService || typeof handler.pageIdFor !== "function") {
    return { ok: false, code: "invalid_product", published: false };
  }
  const { cmsService, pageIdFor } = handler;
  const pageKey = String(input.pageKey || "home").trim() || "home";
  const type = String(input.type || "").trim();
  const def = resolveSectionTypeDefinition(PRODUCT_CODE.ACTIVECLINIC, type, pageKey);
  if (!def) return { ok: false, code: "invalid_section_type", published: false };
  const existing = await listExistingForProduct(db, input, PRODUCT_CODE.ACTIVECLINIC);
  if (isSingletonViolation(PRODUCT_CODE.ACTIVECLINIC, type, existing)) {
    return { ok: false, code: "singleton_exists", published: false };
  }
  const content = validateSectionContent({
    productCode: PRODUCT_CODE.ACTIVECLINIC,
    sectionType: type,
    heading: input.heading,
    body: input.body != null ? input.body : input.bodyText,
    image: input.image,
    title: input.title || def.label,
    buttonLabel: input.buttonLabel,
    buttonUrl: input.buttonUrl,
  });
  if (!content.ok) {
    return { ok: false, code: "malformed_content", error: content.error, published: false };
  }
  const pageId = pageIdFor(pageKey);
  const added = await cmsService.addSection(db, {
    organizationId: input.organizationId,
    instanceId: input.instanceId,
    clinicId: input.clinicId,
    pageId,
    type,
    title: content.payload.title || def.label || type,
    heading: content.payload.heading || "",
    body: content.payload.body || "",
    image: content.payload.image,
    buttonLabel: content.payload.buttonLabel || "",
    buttonUrl: content.payload.buttonUrl || "",
    grantedPermissions: input.grantedPermissions,
  });
  if (!added.ok) return { ...added, published: false };
  return {
    ok: true,
    section: added.section,
    sectionKey: String((added.section && added.section.id) || type),
    sectionId: String((added.section && added.section.id) || ""),
    published: false,
  };
}

async function addWebsiteSection(db, input) {
  const gate = requireEdit(input);
  if (!gate.ok) return gate;
  const productCode = String(input.productCode || "").trim().toLowerCase();
  if (productCode === PRODUCT_CODE.BLESSBOARD) {
    return addBlessBoardSection(db, input);
  }
  if (productCode === PRODUCT_CODE.ACTIVECLINIC) {
    return addActiveClinicSection(db, input);
  }
  return { ok: false, code: "invalid_product", published: false };
}

module.exports = {
  listAddableSections,
  addWebsiteSection,
};
