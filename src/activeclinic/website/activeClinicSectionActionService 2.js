"use strict";

const cmsService = require("./clinicWebsiteCmsService");
const { presentSectionManifest } = require("../../platform/website-engine/presentSectionManifest");
const { DEFAULT_HOME_SECTIONS, DEFAULT_PAGE_SECTIONS, defaultHomeSections } = require("./clinicWebsiteCms");

const PAGE_ID_BY_KEY = Object.freeze({
  home: "tpl_home",
  about: "tpl_about",
  services: "tpl_services",
  doctors: "tpl_doctors",
  contact: "tpl_contact",
  location: "tpl_location",
  pricing: "tpl_pricing",
  book: "tpl_book",
});

const CMS_TYPE_BY_SECTION_KEY = Object.freeze(
  Object.fromEntries(DEFAULT_HOME_SECTIONS.map((section) => [section.key, section.type]))
);

function cmsTypeForSectionKey(sectionKey) {
  const key = String(sectionKey || "").trim();
  return CMS_TYPE_BY_SECTION_KEY[key] || key;
}

function sectionKeyForCmsType(cmsType) {
  const type = String(cmsType || "").trim();
  const match = DEFAULT_HOME_SECTIONS.find((section) => String(section.type) === type);
  return match ? match.key : type;
}

function pageIdFor(pageKey) {
  return PAGE_ID_BY_KEY[String(pageKey || "home")] || `tpl_${String(pageKey || "home")}`;
}

function homeSectionSelector(type) {
  return `[data-ac-home-section="${type}"]`;
}

function pageSectionSelector(pageKey, type) {
  if (String(pageKey || "home") === "home") return homeSectionSelector(type);
  return `[data-ac-page-section="${pageKey}-${type}"]`;
}

function buildPageManifest(pageKey, cmsSections, defaults, selectorAttr) {
  const pageId = pageIdFor(pageKey);
  const sections = Array.isArray(cmsSections) ? cmsSections : [];
  const pageSections = sections
    .filter((s) => s && (s.page_id === pageId || (!s.page_id && pageKey === "home")))
    .slice()
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  const orderedDefaults = defaults
    .slice()
    .sort((a, b) => {
      const aFound = pageSections.find((s) => String(s.type) === String(a.type));
      const bFound = pageSections.find((s) => String(s.type) === String(b.type));
      const aOrder = aFound ? Number(aFound.sort_order || 0) : Number(a.sortOrder || 0);
      const bOrder = bFound ? Number(bFound.sort_order || 0) : Number(b.sortOrder || 0);
      return aOrder - bOrder;
    });
  const capabilities = orderedDefaults.map((def, index) => {
    const found = pageSections.find(
      (s) => String(s.type) === String(def.type) || String(s.type) === String(def.key)
    );
    const locked = def.locked === true;
    const isHidden = found ? found.visible === false : false;
    const sectionId = found ? String(found.id) : `sec_${pageKey}_${def.key}`;
    return {
      sectionKey: def.key,
      sectionId,
      pageKey,
      label: def.title,
      canEdit: !def.domainBacked,
      canReorder: !locked && orderedDefaults.length > 1,
      canHide: !locked,
      canRestoreDefault: !locked && !def.domainBacked,
      isHidden,
      isDefault: false,
      sortIndex: index,
      selector: pageSectionSelector(pageKey, def.key),
      domainBacked: def.domainBacked === true,
    };
  });
  return presentSectionManifest({
    pageKey,
    selectorAttr,
    sections: capabilities,
  });
}

function buildHomeManifest(pageKey, cmsSections) {
  return buildPageManifest(pageKey, cmsSections, DEFAULT_HOME_SECTIONS, "data-ac-home-section");
}

function buildManifest(pageKey, cmsSections) {
  const key = String(pageKey || "home").trim() || "home";
  if (key === "home") {
    return buildHomeManifest(key, cmsSections);
  }
  const defaults = DEFAULT_PAGE_SECTIONS[key];
  if (!defaults) {
    return presentSectionManifest({ pageKey: key, selectorAttr: "data-ac-page-section", sections: [] });
  }
  return buildPageManifest(key, cmsSections, defaults, "data-ac-page-section");
}

async function findSectionByKey(db, input, sectionKey) {
  const pageId = pageIdFor(input.pageKey);
  const listed = await cmsService.listSections(db, { ...input, pageId });
  if (!listed.ok) return null;
  const key = String(sectionKey || "");
  const cmsType = cmsTypeForSectionKey(key);
  return (listed.sections || []).find(
    (s) =>
      String(s.type) === cmsType ||
      String(s.type) === key ||
      String(s.id) === key ||
      String(s.title || "").toLowerCase() === key
  );
}

async function reorderByKeys(db, input) {
  const pageId = pageIdFor(input.pageKey);
  const listed = await cmsService.listSections(db, { ...input, pageId });
  if (!listed.ok) return listed;
  const order = Array.isArray(input.order) ? input.order.map(String) : [];
  const byType = new Map((listed.sections || []).map((s) => [String(s.type), s]));
  const ids = order
    .map((k) => {
      const cmsType = cmsTypeForSectionKey(k);
      return byType.get(cmsType) || byType.get(k);
    })
    .filter(Boolean)
    .map((section) => section.id);
  if (!ids.length) return { ok: false, code: "not_found" };
  return cmsService.reorderSections(db, { ...input, pageId, sectionIds: ids });
}

async function applySectionAction(db, input) {
  const action = String(input.action || "").trim();
  const pageKey = String(input.pageKey || "home").trim() || "home";
  const sectionKey = String(input.sectionKey || "").trim();
  const pageId = pageIdFor(pageKey);

  if (action === "reorder" && Array.isArray(input.order)) {
    return reorderByKeys(db, { ...input, pageKey });
  }

  if (action === "move_up" || action === "move_down") {
    const listed = await cmsService.listSections(db, { ...input, pageId });
    if (!listed.ok) return listed;
    const order = (listed.sections || [])
      .slice()
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
      .map((s) => sectionKeyForCmsType(String(s.type)));
    const idx = order.indexOf(sectionKey);
    if (idx < 0) return { ok: false, code: "not_found" };
    const next = order.slice();
    const swap = action === "move_up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= next.length) return { ok: true };
    const tmp = next[idx];
    next[idx] = next[swap];
    next[swap] = tmp;
    return reorderByKeys(db, { ...input, pageKey, order: next });
  }

  const section = await findSectionByKey(db, { ...input, pageKey }, sectionKey);
  if (!section) {
    if (action === "hide" || action === "show") {
      const cmsType = cmsTypeForSectionKey(sectionKey);
      const seeded = defaultHomeSections().find((s) => String(s.type) === cmsType);
      if (!seeded) return { ok: false, code: "not_found" };
      const added = await cmsService.addSection(db, {
        ...input,
        pageId,
        type: seeded.type,
        title: seeded.title,
        visible: action === "show",
      });
      if (!added.ok) return added;
      if (action === "show") return added;
      return cmsService.updateSection(db, { ...input, sectionId: added.section.id, visible: false });
    }
    return { ok: false, code: "not_found" };
  }

  if (action === "hide") {
    if (section.locked === true) return { ok: false, code: "locked_item" };
    return cmsService.updateSection(db, { ...input, sectionId: section.id, visible: false });
  }
  if (action === "show") {
    return cmsService.updateSection(db, { ...input, sectionId: section.id, visible: true });
  }
  if (action === "restore_default") {
    if (section.locked === true) return { ok: false, code: "locked_item" };
    const def = defaultHomeSections().find((s) => String(s.type) === String(section.type));
    if (!def) return { ok: false, code: "no_default" };
    return cmsService.updateSection(db, {
      ...input,
      sectionId: section.id,
      heading: def.heading || "",
      body: def.body || "",
      visible: def.visible !== false,
      image: def.image || null,
      buttonLabel: def.button_label || "",
      buttonUrl: def.button_url || "",
    });
  }

  return { ok: false, code: "invalid_action" };
}

module.exports = {
  buildManifest,
  applySectionAction,
  pageIdFor,
};
