"use strict";

const crypto = require("crypto");
const {
  listAddableSectionTypes,
  resolveSectionTypeDefinition,
  isSingletonViolation,
} = require("./sectionRegistry");
const { PRODUCT_CODE } = require("./publicWebsiteUrl");
const { saveStructuredDraft } = require("../../blessboard/services/websiteStructuredDraftService");
const contentRepo = require("../../blessboard/repositories/publicContentRepository");
const cmsService = require("../../activeclinic/website/clinicWebsiteCmsService");
const { pageIdFor } = require("../../activeclinic/website/activeClinicSectionActionService");

function uniqueSectionKey(prefix) {
  const safe = String(prefix || "section")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${safe || "section"}_${crypto.randomBytes(3).toString("hex")}`;
}

async function listBlessBoardExistingSectionKeys(db, input) {
  const pageKey = String(input.pageKey || "home").trim() || "home";
  const page = await contentRepo.findPageByScope(db, {
    churchId: input.churchId,
    branchId: input.branchId || null,
    pageKey,
  });
  if (!page) return [];
  const sections = await contentRepo.listSectionsForPage(db, page.id, {});
  return (sections || []).map((s) => String(s.sectionKey || s.sectionType || ""));
}

async function listActiveClinicExistingSectionTypes(db, input) {
  const pageId = pageIdFor(input.pageKey);
  const listed = await cmsService.listSections(db, {
    organizationId: input.organizationId,
    instanceId: input.instanceId,
    clinicId: input.clinicId,
    pageId,
    grantedPermissions: input.grantedPermissions,
  });
  if (!listed.ok) return [];
  return (listed.sections || []).map((s) => String(s.type));
}

async function listAddableSections(db, input) {
  const productCode = String(input.productCode || "").trim().toLowerCase();
  const pageKey = String(input.pageKey || "home").trim() || "home";
  let existing = [];
  if (productCode === PRODUCT_CODE.BLESSBOARD) {
    existing = await listBlessBoardExistingSectionKeys(db, input);
  } else if (productCode === PRODUCT_CODE.ACTIVECLINIC) {
    existing = await listActiveClinicExistingSectionTypes(db, input);
  }
  return {
    ok: true,
    sections: listAddableSectionTypes(productCode, pageKey, existing),
    existing,
  };
}

async function addBlessBoardSection(db, input) {
  const pageKey = String(input.pageKey || "home").trim() || "home";
  const type = String(input.type || "").trim();
  const def = resolveSectionTypeDefinition(PRODUCT_CODE.BLESSBOARD, type, pageKey);
  if (!def) return { ok: false, code: "invalid_section_type" };
  const existing = await listBlessBoardExistingSectionKeys(db, input);
  if (isSingletonViolation(PRODUCT_CODE.BLESSBOARD, type, existing)) {
    return { ok: false, code: "singleton_exists" };
  }
  const sectionKey = uniqueSectionKey(def.keyPrefix || type);
  const page = await contentRepo.findPageByScope(db, {
    churchId: input.churchId,
    branchId: input.branchId || null,
    pageKey,
  });
  const baseOrder = page
    ? (await contentRepo.listSectionsForPage(db, page.id, {})).length
    : 0;
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
      heading: String(input.heading || def.defaultHeading || ""),
      bodyText: String(input.bodyText || def.defaultBody || ""),
      sortOrder: (baseOrder + 1) * 10,
      layout: def.layout || null,
    },
    previousPayload: null,
  });
  return { ok: true, sectionKey, sectionType: type, published: false };
}

async function addActiveClinicSection(db, input) {
  const pageKey = String(input.pageKey || "home").trim() || "home";
  const type = String(input.type || "").trim();
  const def = resolveSectionTypeDefinition(PRODUCT_CODE.ACTIVECLINIC, type, pageKey);
  if (!def) return { ok: false, code: "invalid_section_type" };
  const existing = await listActiveClinicExistingSectionTypes(db, input);
  if (isSingletonViolation(PRODUCT_CODE.ACTIVECLINIC, type, existing)) {
    return { ok: false, code: "singleton_exists" };
  }
  const pageId = pageIdFor(pageKey);
  const added = await cmsService.addSection(db, {
    organizationId: input.organizationId,
    instanceId: input.instanceId,
    clinicId: input.clinicId,
    pageId,
    type,
    title: String(input.title || def.label || type),
    heading: String(input.heading || ""),
    body: String(input.body || input.bodyText || ""),
    grantedPermissions: input.grantedPermissions,
  });
  if (!added.ok) return added;
  return {
    ok: true,
    section: added.section,
    sectionKey: String(added.section && added.section.type) || type,
    published: false,
  };
}

async function addWebsiteSection(db, input) {
  const productCode = String(input.productCode || "").trim().toLowerCase();
  if (productCode === PRODUCT_CODE.BLESSBOARD) {
    return addBlessBoardSection(db, input);
  }
  if (productCode === PRODUCT_CODE.ACTIVECLINIC) {
    return addActiveClinicSection(db, input);
  }
  return { ok: false, code: "invalid_product" };
}

module.exports = {
  listAddableSections,
  addWebsiteSection,
};
