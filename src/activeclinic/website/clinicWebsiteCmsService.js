"use strict";

/**
 * ActiveClinic website CMS service — pages, sections, blocks, navigation.
 * Mutates only shared platform.website_content through contentService.
 */

const contentService = require("../../platform/website/contentService");
const instanceRepo = require("../../platform/website/instanceRepository");
const mediaService = require("../../platform/website/mediaService");
const { PERMISSIONS, hasWebsitePermission } = require("../../platform/website/permissions");
const {
  CMS_KEYS,
  PAGE_KIND,
  PAGE_STATUS,
  newCmsId,
  sortKey,
  boolValue,
  validateCustomSlug,
  defaultPages,
  defaultHomeSections,
  starterBlocksForTemplate,
  sortByOrder,
  publicPageHref,
  isAddableSectionType,
  isKnownBlockType,
  RESERVED_SLUGS,
  publishedCustomPages,
  navCustomPages,
  findCustomPageBySlug,
  findDraftCustomPageBySlug,
} = require("./clinicWebsiteCms");
const { registerActiveClinicWebsiteTemplate } = require("./activeClinicWebsiteTemplate");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  RESERVED_SLUG: "reserved_slug",
  DUPLICATE_SLUG: "duplicate_slug",
  INVALID_SLUG: "invalid_slug",
  LOCKED: "locked_item",
  UNKNOWN_TYPE: "unknown_type",
});

const MAX_PAGES = 40;
const MAX_SECTIONS = 40;
const MAX_BLOCKS = 80;
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

const SETTINGS_KEYS = Object.freeze({
  website: Object.freeze(["site.name", "contact.phone", "contact.email", "location.hours"]),
  branding: Object.freeze(["home.logo", "brand.primary_color", "brand.accent_color", "home.hero.image"]),
  chrome: Object.freeze([
    "header.show_logo",
    "header.show_nav",
    "header.show_phone",
    "footer.show_contact",
    "footer.tagline",
    "footer.legal",
    "social.facebook_url",
    "social.instagram_url",
    "social.whatsapp_url",
    "social.x_url",
  ]),
  seo: Object.freeze(["seo.title", "seo.description", "seo.image"]),
});

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function granted(input) {
  return Array.isArray(input && input.grantedPermissions) ? input.grantedPermissions : [];
}

function requireEdit(input) {
  if (!hasWebsitePermission(granted(input), PERMISSIONS.EDIT)) {
    return { ok: false, code: RESULT.FORBIDDEN };
  }
  return { ok: true };
}

async function loadInstance(db, input) {
  registerActiveClinicWebsiteTemplate();
  const organizationId = String((input && input.organizationId) || "");
  const instance =
    input.instance ||
    (await instanceRepo.findWebsiteInstanceByOrgProduct(db, {
      organizationId,
      productCode: "activeclinic",
    }));
  if (!instance || instance.organizationId !== organizationId) {
    return { ok: false, code: "website_instance_not_found", instance: null };
  }
  return { ok: true, instance, organizationId };
}

function draftList(row) {
  if (!row) return [];
  return asArray(row.draftValue);
}

async function loadCmsState(db, instance, organizationId) {
  const [pagesRow, sectionsRow, blocksRow] = await Promise.all([
    contentService.getWebsiteContentRow(db, instance.id, organizationId, CMS_KEYS.PAGES),
    contentService.getWebsiteContentRow(db, instance.id, organizationId, CMS_KEYS.SECTIONS),
    contentService.getWebsiteContentRow(db, instance.id, organizationId, CMS_KEYS.BLOCKS),
  ]);
  return {
    pages: sortByOrder(draftList(pagesRow).length ? draftList(pagesRow) : defaultPages()),
    sections: sortByOrder(draftList(sectionsRow).length ? draftList(sectionsRow) : defaultHomeSections()),
    blocks: sortByOrder(draftList(blocksRow)),
    seeded: {
      pages: !pagesRow || !draftList(pagesRow).length,
      sections: !sectionsRow || !draftList(sectionsRow).length,
    },
  };
}

async function saveKey(db, input, contentKey, value) {
  return contentService.saveWebsiteDraft(db, {
    organizationId: input.organizationId,
    instanceId: input.instanceId,
    expectedProductCode: "activeclinic",
    contentKey,
    value,
    actorIdentityId: input.actorIdentityId || null,
    grantedPermissions: granted(input),
  });
}

function normalizeHexColor(raw) {
  const trimmed = String(raw == null ? "" : raw).trim();
  if (!trimmed) return { ok: true, value: null };
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (!HEX_COLOR_RE.test(withHash)) return { ok: false, code: "invalid_hex" };
  return { ok: true, value: withHash.toLowerCase() };
}

function imageValueFromParts(src, alt, mediaId) {
  const nextSrc = String(src || "").trim();
  const nextId = String(mediaId || "").trim();
  const nextAlt = String(alt || "").trim();
  if (!nextSrc && !nextId) return null;
  return { src: nextSrc || null, alt: nextAlt || null, mediaId: nextId || null };
}

function draftMap(rows, keys) {
  const values = {};
  keys.forEach((key, index) => {
    values[key] = rows[index] ? rows[index].draftValue : null;
  });
  return values;
}

async function loadSiteSettings(db, input, keys) {
  const loaded = await loadInstance(db, input);
  if (!loaded.ok) return loaded;
  const list = Array.isArray(keys) ? keys : [];
  const rows = await Promise.all(
    list.map((key) =>
      contentService.getWebsiteContentRow(db, loaded.instance.id, loaded.organizationId, key)
    )
  );
  return {
    ok: true,
    instance: loaded.instance,
    values: draftMap(rows, list),
  };
}

async function saveSiteSettings(db, input, entries) {
  const edit = requireEdit(input);
  if (!edit.ok) return edit;
  const loaded = await loadInstance(db, input);
  if (!loaded.ok) return loaded;
  const saveInput = { ...input, instanceId: loaded.instance.id };
  const list = Array.isArray(entries) ? entries : [];
  for (let i = 0; i < list.length; i += 1) {
    const entry = list[i];
    if (!entry || !entry.key) continue;
    const saved = await saveKey(db, saveInput, entry.key, entry.value);
    if (!saved.ok) return saved;
  }
  return { ok: true };
}

async function ensureCmsSeeded(db, input) {
  const loaded = await loadInstance(db, input);
  if (!loaded.ok) return loaded;
  const { instance, organizationId } = loaded;
  const state = await loadCmsState(db, instance, organizationId);
  const actor = input.actorIdentityId || null;
  if (state.seeded.pages) {
    await contentService.seedWebsiteContent(
      db,
      instance,
      [{ contentKey: CMS_KEYS.PAGES, value: defaultPages(), publish: true }],
      actor
    );
  }
  if (state.seeded.sections) {
    await contentService.seedWebsiteContent(
      db,
      instance,
      [{ contentKey: CMS_KEYS.SECTIONS, value: defaultHomeSections(), publish: true }],
      actor
    );
  }
  const blocksRow = await contentService.getWebsiteContentRow(
    db,
    instance.id,
    organizationId,
    CMS_KEYS.BLOCKS
  );
  if (!blocksRow) {
    await contentService.seedWebsiteContent(
      db,
      instance,
      [{ contentKey: CMS_KEYS.BLOCKS, value: [], publish: true }],
      actor
    );
  }
  const next = await loadCmsState(db, instance, organizationId);
  return { ok: true, instance, organizationId, ...next };
}

function pageById(pages, id) {
  return (pages || []).find((page) => page && page.id === id) || null;
}

function slugTaken(pages, slug, exceptId) {
  const wanted = String(slug || "").toLowerCase();
  return (pages || []).some(
    (page) => page && page.id !== exceptId && String(page.slug || "").toLowerCase() === wanted
  );
}

async function assertOwnedImages(db, instance, items) {
  for (const item of items || []) {
    if (!item || !item.image || typeof item.image !== "object") continue;
    const owned = await mediaService.assertOwnedWebsiteImageValue(db, {
      organizationId: instance.organizationId,
      instance,
      value: item.image,
    });
    if (!owned.ok) return owned;
    item.image = owned.value;
  }
  return { ok: true };
}

function presentPage(page, clinicKey) {
  if (!page) return null;
  return {
    ...page,
    href: publicPageHref(clinicKey, page),
    canDelete: page.kind === PAGE_KIND.CUSTOM && page.locked !== true,
    canRename: page.kind === PAGE_KIND.CUSTOM || page.hideable === true,
  };
}

async function listPages(db, input) {
  const seeded = await ensureCmsSeeded(db, input);
  if (!seeded.ok) return seeded;
  return {
    ok: true,
    pages: seeded.pages.map((page) => presentPage(page, input.clinicKey)),
    instance: seeded.instance,
  };
}

async function createPage(db, input) {
  const edit = requireEdit(input);
  if (!edit.ok) return edit;
  const seeded = await ensureCmsSeeded(db, input);
  if (!seeded.ok) return seeded;
  if (seeded.pages.length >= MAX_PAGES) {
    return { ok: false, code: RESULT.INVALID_INPUT, reason: "too_many_pages" };
  }
  const title = String((input && input.title) || "").trim().slice(0, 120);
  if (!title) return { ok: false, code: RESULT.INVALID_INPUT, reason: "title_required" };
  const slugCheck = validateCustomSlug(input.slug || title);
  if (!slugCheck.ok) return { ok: false, code: slugCheck.code === "reserved_slug" ? RESULT.RESERVED_SLUG : RESULT.INVALID_SLUG };
  if (slugTaken(seeded.pages, slugCheck.slug)) {
    return { ok: false, code: RESULT.DUPLICATE_SLUG, slug: slugCheck.slug };
  }
  const templateKey = String((input && input.templateKey) || "blank").trim() || "blank";
  const id = newCmsId("p");
  const nextOrder = seeded.pages.reduce((max, page) => Math.max(max, sortKey(page.sort_order)), 0) + 1;
  const page = {
    id,
    kind: PAGE_KIND.CUSTOM,
    template_key: templateKey,
    slug: slugCheck.slug,
    title,
    nav_label: String((input && input.navLabel) || title).trim().slice(0, 40),
    status:
      input.status === PAGE_STATUS.DRAFT || input.status === PAGE_STATUS.HIDDEN
        ? input.status
        : PAGE_STATUS.PUBLISHED,
    in_nav: boolValue(input.inNav, true),
    locked: false,
    hideable: true,
    sort_order: String(nextOrder),
    meta_title: String((input && input.metaTitle) || "").trim().slice(0, 160),
    meta_description: String((input && input.metaDescription) || "").trim().slice(0, 320),
  };
  const pages = seeded.pages.concat([page]);
  const starter = starterBlocksForTemplate(id, templateKey);
  const blocks = seeded.blocks.concat(starter);
  const savedPages = await saveKey(
    db,
    { ...input, instanceId: seeded.instance.id },
    CMS_KEYS.PAGES,
    pages
  );
  if (!savedPages.ok) return savedPages;
  if (starter.length) {
    const savedBlocks = await saveKey(
      db,
      { ...input, instanceId: seeded.instance.id },
      CMS_KEYS.BLOCKS,
      blocks
    );
    if (!savedBlocks.ok) return savedBlocks;
  }
  return { ok: true, page: presentPage(page, input.clinicKey), pages };
}

async function updatePage(db, input) {
  const edit = requireEdit(input);
  if (!edit.ok) return edit;
  const seeded = await ensureCmsSeeded(db, input);
  if (!seeded.ok) return seeded;
  const current = pageById(seeded.pages, input.pageId);
  if (!current) return { ok: false, code: RESULT.NOT_FOUND };
  const next = { ...current };
  if (input.title != null) {
    const title = String(input.title).trim().slice(0, 120);
    if (!title) return { ok: false, code: RESULT.INVALID_INPUT, reason: "title_required" };
    next.title = title;
    if (!input.navLabel) next.nav_label = title.slice(0, 40);
  }
  if (input.navLabel != null) next.nav_label = String(input.navLabel).trim().slice(0, 40);
  if (input.metaTitle != null) next.meta_title = String(input.metaTitle).trim().slice(0, 160);
  if (input.metaDescription != null) {
    next.meta_description = String(input.metaDescription).trim().slice(0, 320);
  }
  if (input.status != null) {
    const status = String(input.status);
    if (![PAGE_STATUS.DRAFT, PAGE_STATUS.PUBLISHED, PAGE_STATUS.HIDDEN].includes(status)) {
      return { ok: false, code: RESULT.INVALID_INPUT, reason: "invalid_status" };
    }
    if (current.locked === true && current.kind === PAGE_KIND.TEMPLATE && status === PAGE_STATUS.HIDDEN && current.hideable !== true) {
      return { ok: false, code: RESULT.LOCKED };
    }
    next.status = status;
  }
  if (input.inNav != null) next.in_nav = boolValue(input.inNav, next.in_nav);
  if (input.slug != null && current.kind === PAGE_KIND.CUSTOM) {
    const slugCheck = validateCustomSlug(input.slug);
    if (!slugCheck.ok) {
      return { ok: false, code: slugCheck.code === "reserved_slug" ? RESULT.RESERVED_SLUG : RESULT.INVALID_SLUG };
    }
    if (slugTaken(seeded.pages, slugCheck.slug, current.id)) {
      return { ok: false, code: RESULT.DUPLICATE_SLUG, slug: slugCheck.slug };
    }
    next.slug = slugCheck.slug;
  }
  const pages = seeded.pages.map((page) => (page.id === current.id ? next : page));
  const saved = await saveKey(db, { ...input, instanceId: seeded.instance.id }, CMS_KEYS.PAGES, pages);
  if (!saved.ok) return saved;
  return { ok: true, page: presentPage(next, input.clinicKey), pages };
}

async function deletePage(db, input) {
  const edit = requireEdit(input);
  if (!edit.ok) return edit;
  const seeded = await ensureCmsSeeded(db, input);
  if (!seeded.ok) return seeded;
  const current = pageById(seeded.pages, input.pageId);
  if (!current) return { ok: false, code: RESULT.NOT_FOUND };
  if (current.kind !== PAGE_KIND.CUSTOM || current.locked === true) {
    return { ok: false, code: RESULT.LOCKED };
  }
  const pages = seeded.pages.filter((page) => page.id !== current.id);
  const blocks = seeded.blocks.filter((block) => block.page_id !== current.id);
  const savedPages = await saveKey(db, { ...input, instanceId: seeded.instance.id }, CMS_KEYS.PAGES, pages);
  if (!savedPages.ok) return savedPages;
  const savedBlocks = await saveKey(db, { ...input, instanceId: seeded.instance.id }, CMS_KEYS.BLOCKS, blocks);
  if (!savedBlocks.ok) return savedBlocks;
  return { ok: true, pages };
}

async function reorderPages(db, input) {
  const edit = requireEdit(input);
  if (!edit.ok) return edit;
  const seeded = await ensureCmsSeeded(db, input);
  if (!seeded.ok) return seeded;
  const ids = Array.isArray(input.pageIds) ? input.pageIds.map(String) : [];
  if (!ids.length) return { ok: false, code: RESULT.INVALID_INPUT };
  const byId = new Map(seeded.pages.map((page) => [page.id, page]));
  const ordered = [];
  ids.forEach((id, index) => {
    const page = byId.get(id);
    if (page) {
      ordered.push({ ...page, sort_order: String(index) });
      byId.delete(id);
    }
  });
  byId.forEach((page) => {
    ordered.push({ ...page, sort_order: String(ordered.length) });
  });
  const saved = await saveKey(db, { ...input, instanceId: seeded.instance.id }, CMS_KEYS.PAGES, ordered);
  if (!saved.ok) return saved;
  return { ok: true, pages: ordered };
}

async function listSections(db, input) {
  const seeded = await ensureCmsSeeded(db, input);
  if (!seeded.ok) return seeded;
  const pageId = String((input && input.pageId) || "tpl_home");
  return {
    ok: true,
    pageId,
    sections: seeded.sections.filter((section) => section.page_id === pageId),
    all: seeded.sections,
    instance: seeded.instance,
  };
}

async function addSection(db, input) {
  const edit = requireEdit(input);
  if (!edit.ok) return edit;
  const seeded = await ensureCmsSeeded(db, input);
  if (!seeded.ok) return seeded;
  const type = String((input && input.type) || "").trim();
  if (!isAddableSectionType(type)) return { ok: false, code: RESULT.UNKNOWN_TYPE };
  const pageId = String((input && input.pageId) || "tpl_home");
  const pageSections = seeded.sections.filter((section) => section.page_id === pageId);
  if (pageSections.length >= MAX_SECTIONS) {
    return { ok: false, code: RESULT.INVALID_INPUT, reason: "too_many_sections" };
  }
  const nextOrder = pageSections.reduce((max, section) => Math.max(max, sortKey(section.sort_order)), -1) + 1;
  const section = {
    id: newCmsId("s"),
    page_id: pageId,
    type,
    title: String((input && input.title) || type).trim().slice(0, 80) || type,
    visible: true,
    locked: false,
    sort_order: String(nextOrder),
    heading: String((input && input.heading) || "").trim().slice(0, 160),
    body: String((input && input.body) || "").trim().slice(0, 4000),
    image: input.image && typeof input.image === "object" ? input.image : null,
    button_label: String((input && input.buttonLabel) || "").trim().slice(0, 60),
    button_url: String((input && input.buttonUrl) || "").trim().slice(0, 500),
  };
  const owned = await assertOwnedImages(db, seeded.instance, [section]);
  if (!owned.ok) return owned;
  const sections = seeded.sections.concat([section]);
  const saved = await saveKey(db, { ...input, instanceId: seeded.instance.id }, CMS_KEYS.SECTIONS, sections);
  if (!saved.ok) return saved;
  return { ok: true, section, sections };
}

async function updateSection(db, input) {
  const edit = requireEdit(input);
  if (!edit.ok) return edit;
  const seeded = await ensureCmsSeeded(db, input);
  if (!seeded.ok) return seeded;
  const current = seeded.sections.find((section) => section.id === input.sectionId);
  if (!current) return { ok: false, code: RESULT.NOT_FOUND };
  const next = { ...current };
  if (input.title != null) next.title = String(input.title).trim().slice(0, 80);
  if (input.heading != null) next.heading = String(input.heading).trim().slice(0, 160);
  if (input.body != null) next.body = String(input.body).trim().slice(0, 4000);
  if (input.buttonLabel != null) next.button_label = String(input.buttonLabel).trim().slice(0, 60);
  if (input.buttonUrl != null) next.button_url = String(input.buttonUrl).trim().slice(0, 500);
  if (input.visible != null) next.visible = boolValue(input.visible, next.visible);
  if (input.image !== undefined) next.image = input.image && typeof input.image === "object" ? input.image : null;
  const owned = await assertOwnedImages(db, seeded.instance, [next]);
  if (!owned.ok) return owned;
  const sections = seeded.sections.map((section) => (section.id === current.id ? next : section));
  const saved = await saveKey(db, { ...input, instanceId: seeded.instance.id }, CMS_KEYS.SECTIONS, sections);
  if (!saved.ok) return saved;
  return { ok: true, section: next, sections };
}

async function deleteSection(db, input) {
  const edit = requireEdit(input);
  if (!edit.ok) return edit;
  const seeded = await ensureCmsSeeded(db, input);
  if (!seeded.ok) return seeded;
  const current = seeded.sections.find((section) => section.id === input.sectionId);
  if (!current) return { ok: false, code: RESULT.NOT_FOUND };
  if (current.locked === true) return { ok: false, code: RESULT.LOCKED };
  const sections = seeded.sections.filter((section) => section.id !== current.id);
  const saved = await saveKey(db, { ...input, instanceId: seeded.instance.id }, CMS_KEYS.SECTIONS, sections);
  if (!saved.ok) return saved;
  return { ok: true, sections };
}

async function reorderSections(db, input) {
  const edit = requireEdit(input);
  if (!edit.ok) return edit;
  const seeded = await ensureCmsSeeded(db, input);
  if (!seeded.ok) return seeded;
  const pageId = String((input && input.pageId) || "tpl_home");
  const ids = Array.isArray(input.sectionIds) ? input.sectionIds.map(String) : [];
  const others = seeded.sections.filter((section) => section.page_id !== pageId);
  const pageSections = seeded.sections.filter((section) => section.page_id === pageId);
  const byId = new Map(pageSections.map((section) => [section.id, section]));
  const ordered = [];
  ids.forEach((id, index) => {
    const section = byId.get(id);
    if (section) {
      ordered.push({ ...section, sort_order: String(index) });
      byId.delete(id);
    }
  });
  byId.forEach((section) => {
    ordered.push({ ...section, sort_order: String(ordered.length) });
  });
  const sections = others.concat(ordered);
  const saved = await saveKey(db, { ...input, instanceId: seeded.instance.id }, CMS_KEYS.SECTIONS, sections);
  if (!saved.ok) return saved;
  return { ok: true, sections: ordered };
}

async function listBlocks(db, input) {
  const seeded = await ensureCmsSeeded(db, input);
  if (!seeded.ok) return seeded;
  const pageId = String((input && input.pageId) || "");
  const page = pageById(seeded.pages, pageId);
  return {
    ok: true,
    page: page ? presentPage(page, input.clinicKey) : null,
    blocks: seeded.blocks.filter((block) => block.page_id === pageId),
    instance: seeded.instance,
  };
}

function normalizeBlockInput(input, pageId, sortOrder) {
  const type = String((input && input.type) || "").trim();
  return {
    id: input.id || newCmsId("b"),
    page_id: pageId,
    type,
    sort_order: String(sortOrder),
    heading: String((input && input.heading) || "").trim().slice(0, 160),
    body: String((input && input.body) || "").trim().slice(0, 4000),
    image: input.image && typeof input.image === "object" ? input.image : null,
    button_label: String((input && (input.buttonLabel || input.button_label)) || "").trim().slice(0, 60),
    button_url: String((input && (input.buttonUrl || input.button_url)) || "").trim().slice(0, 500),
    library_item_id: String((input && (input.libraryItemId || input.library_item_id)) || "").trim().slice(0, 40),
  };
}

async function addBlock(db, input) {
  const edit = requireEdit(input);
  if (!edit.ok) return edit;
  const seeded = await ensureCmsSeeded(db, input);
  if (!seeded.ok) return seeded;
  const page = pageById(seeded.pages, input.pageId);
  if (!page) return { ok: false, code: RESULT.NOT_FOUND };
  if (!isKnownBlockType(input.type)) return { ok: false, code: RESULT.UNKNOWN_TYPE };
  const pageBlocks = seeded.blocks.filter((block) => block.page_id === page.id);
  if (pageBlocks.length >= MAX_BLOCKS) {
    return { ok: false, code: RESULT.INVALID_INPUT, reason: "too_many_blocks" };
  }
  const nextOrder = pageBlocks.reduce((max, block) => Math.max(max, sortKey(block.sort_order)), -1) + 1;
  const block = normalizeBlockInput(input, page.id, nextOrder);
  const owned = await assertOwnedImages(db, seeded.instance, [block]);
  if (!owned.ok) return owned;
  const blocks = seeded.blocks.concat([block]);
  const saved = await saveKey(db, { ...input, instanceId: seeded.instance.id }, CMS_KEYS.BLOCKS, blocks);
  if (!saved.ok) return saved;
  return { ok: true, block, blocks };
}

async function updateBlock(db, input) {
  const edit = requireEdit(input);
  if (!edit.ok) return edit;
  const seeded = await ensureCmsSeeded(db, input);
  if (!seeded.ok) return seeded;
  const current = seeded.blocks.find((block) => block.id === input.blockId);
  if (!current) return { ok: false, code: RESULT.NOT_FOUND };
  const merged = { ...current, ...input, type: input.type || current.type };
  if (input.image === undefined) merged.image = current.image;
  const next = normalizeBlockInput(merged, current.page_id, current.sort_order);
  next.id = current.id;
  const owned = await assertOwnedImages(db, seeded.instance, [next]);
  if (!owned.ok) return owned;
  const blocks = seeded.blocks.map((block) => (block.id === current.id ? next : block));
  const saved = await saveKey(db, { ...input, instanceId: seeded.instance.id }, CMS_KEYS.BLOCKS, blocks);
  if (!saved.ok) return saved;
  return { ok: true, block: next, blocks };
}

async function duplicateBlock(db, input) {
  const edit = requireEdit(input);
  if (!edit.ok) return edit;
  const seeded = await ensureCmsSeeded(db, input);
  if (!seeded.ok) return seeded;
  const current = seeded.blocks.find((block) => block.id === input.blockId);
  if (!current) return { ok: false, code: RESULT.NOT_FOUND };
  const copy = {
    ...current,
    id: newCmsId("b"),
    sort_order: String(sortKey(current.sort_order) + 1),
  };
  const shifted = seeded.blocks.map((block) => {
    if (block.page_id === current.page_id && sortKey(block.sort_order) > sortKey(current.sort_order)) {
      return { ...block, sort_order: String(sortKey(block.sort_order) + 1) };
    }
    return block;
  });
  const blocks = shifted.concat([copy]);
  const saved = await saveKey(db, { ...input, instanceId: seeded.instance.id }, CMS_KEYS.BLOCKS, blocks);
  if (!saved.ok) return saved;
  return { ok: true, block: copy, blocks };
}

async function deleteBlock(db, input) {
  const edit = requireEdit(input);
  if (!edit.ok) return edit;
  const seeded = await ensureCmsSeeded(db, input);
  if (!seeded.ok) return seeded;
  const current = seeded.blocks.find((block) => block.id === input.blockId);
  if (!current) return { ok: false, code: RESULT.NOT_FOUND };
  const blocks = seeded.blocks.filter((block) => block.id !== current.id);
  const saved = await saveKey(db, { ...input, instanceId: seeded.instance.id }, CMS_KEYS.BLOCKS, blocks);
  if (!saved.ok) return saved;
  return { ok: true, blocks };
}

async function reorderBlocks(db, input) {
  const edit = requireEdit(input);
  if (!edit.ok) return edit;
  const seeded = await ensureCmsSeeded(db, input);
  if (!seeded.ok) return seeded;
  const pageId = String((input && input.pageId) || "");
  const ids = Array.isArray(input.blockIds) ? input.blockIds.map(String) : [];
  const others = seeded.blocks.filter((block) => block.page_id !== pageId);
  const pageBlocks = seeded.blocks.filter((block) => block.page_id === pageId);
  const byId = new Map(pageBlocks.map((block) => [block.id, block]));
  const ordered = [];
  ids.forEach((id, index) => {
    const block = byId.get(id);
    if (block) {
      ordered.push({ ...block, sort_order: String(index) });
      byId.delete(id);
    }
  });
  byId.forEach((block) => {
    ordered.push({ ...block, sort_order: String(ordered.length) });
  });
  const blocks = others.concat(ordered);
  const saved = await saveKey(db, { ...input, instanceId: seeded.instance.id }, CMS_KEYS.BLOCKS, blocks);
  if (!saved.ok) return saved;
  return { ok: true, blocks: ordered };
}

async function loadWebsiteHubStats(db, input) {
  const empty = {
    ok: true,
    hiddenPages: 0,
    draftPages: 0,
    missingContent: 0,
    pageCount: 0,
    builderHref: "/app/settings/website/pages",
  };
  try {
    const seeded = await ensureCmsSeeded(db, input);
    if (!seeded.ok) return empty;
    const pages = seeded.pages || [];
    const blocks = seeded.blocks || [];
    const custom = pages.filter((page) => page && page.kind === PAGE_KIND.CUSTOM);
    const builderPage = custom[0] || null;
    return {
      ok: true,
      hiddenPages: pages.filter((page) => page && page.status === PAGE_STATUS.HIDDEN).length,
      draftPages: pages.filter((page) => page && page.status === PAGE_STATUS.DRAFT).length,
      missingContent: custom.filter((page) => !blocks.some((block) => block && block.page_id === page.id)).length,
      pageCount: pages.length,
      builderHref: builderPage
        ? `/app/settings/website/pages/${builderPage.id}/builder`
        : "/app/settings/website/pages",
    };
  } catch {
    return empty;
  }
}

module.exports = {
  RESULT,
  CMS_KEYS,
  SETTINGS_KEYS,
  HEX_COLOR_RE,
  normalizeHexColor,
  imageValueFromParts,
  loadSiteSettings,
  saveSiteSettings,
  loadInstance,
  ensureCmsSeeded,
  loadCmsState,
  listPages,
  createPage,
  updatePage,
  deletePage,
  reorderPages,
  listSections,
  addSection,
  updateSection,
  deleteSection,
  reorderSections,
  listBlocks,
  addBlock,
  updateBlock,
  duplicateBlock,
  deleteBlock,
  reorderBlocks,
  publishedCustomPages,
  navCustomPages,
  findCustomPageBySlug,
  findDraftCustomPageBySlug,
  presentPage,
  loadWebsiteHubStats,
};
