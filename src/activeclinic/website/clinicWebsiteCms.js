"use strict";

/**
 * ActiveClinic clinic mini-website CMS helpers.
 * Stores pages/sections/blocks as structured keys on the shared website engine.
 * Does not introduce a second CMS schema.
 */

const crypto = require("crypto");

const CMS_KEYS = Object.freeze({
  PAGES: "cms.pages",
  SECTIONS: "cms.sections",
  BLOCKS: "cms.blocks",
});

const PAGE_KIND = Object.freeze({
  TEMPLATE: "template",
  CUSTOM: "custom",
});

const PAGE_STATUS = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
  HIDDEN: "hidden",
});

const PAGE_TEMPLATES = Object.freeze([
  { key: "blank", label: "Blank Page", description: "Start from scratch with an empty canvas." },
  { key: "about", label: "About Us", description: "Introduce your clinic, doctors, and mission." },
  { key: "services", label: "Services", description: "Grid layout ideal for detailing treatments." },
  { key: "faq", label: "FAQ", description: "Accordion list for common patient questions." },
  { key: "pricing", label: "Pricing", description: "Clear comparison tables for self-pay services." },
]);

const SECTION_TYPES = Object.freeze([
  { key: "hero", label: "Hero", group: "essentials", addable: false },
  { key: "text", label: "Text", group: "essentials", addable: true },
  { key: "image_text", label: "Image + Text", group: "essentials", addable: true },
  { key: "cta", label: "Call to Action", group: "essentials", addable: true },
  { key: "services", label: "Services", group: "clinic", addable: true },
  { key: "doctors", label: "Doctors", group: "clinic", addable: true },
  { key: "hours", label: "Opening Hours", group: "clinic", addable: true },
  { key: "contact", label: "Contact", group: "clinic", addable: true },
  { key: "promo", label: "Promo", group: "clinic", addable: false },
  { key: "faq", label: "FAQ", group: "clinic", addable: false },
]);

const BLOCK_TYPES = Object.freeze([
  { key: "heading", label: "Heading", group: "basic" },
  { key: "text", label: "Text Block", group: "basic" },
  { key: "buttons", label: "Buttons", group: "basic" },
  { key: "image", label: "Image", group: "media" },
  { key: "image_text", label: "Image + Text", group: "media" },
]);

const TEMPLATE_PAGES = Object.freeze([
  {
    key: "home",
    slug: "home",
    title: "Homepage",
    status: PAGE_STATUS.PUBLISHED,
    inNav: false,
    locked: true,
    hideable: false,
    sortOrder: 0,
  },
  {
    key: "about",
    slug: "about",
    title: "About Clinic",
    status: PAGE_STATUS.PUBLISHED,
    inNav: true,
    locked: true,
    hideable: false,
    sortOrder: 1,
  },
  {
    key: "services",
    slug: "services",
    title: "Services",
    status: PAGE_STATUS.PUBLISHED,
    inNav: true,
    locked: true,
    hideable: false,
    sortOrder: 2,
  },
  {
    key: "doctors",
    slug: "doctors",
    title: "Our Doctors",
    status: PAGE_STATUS.PUBLISHED,
    inNav: true,
    locked: false,
    hideable: true,
    sortOrder: 3,
  },
  {
    key: "contact",
    slug: "contact",
    title: "Contact",
    status: PAGE_STATUS.PUBLISHED,
    inNav: true,
    locked: true,
    hideable: false,
    sortOrder: 4,
  },
  {
    key: "location",
    slug: "location",
    title: "Location & Hours",
    status: PAGE_STATUS.PUBLISHED,
    inNav: false,
    locked: true,
    hideable: false,
    sortOrder: 5,
  },
  {
    key: "pricing",
    slug: "pricing",
    title: "Pricing",
    status: PAGE_STATUS.PUBLISHED,
    inNav: true,
    locked: false,
    hideable: true,
    sortOrder: 6,
  },
  {
    key: "book",
    slug: "book",
    title: "Book appointment",
    status: PAGE_STATUS.PUBLISHED,
    inNav: false,
    locked: true,
    hideable: false,
    sortOrder: 7,
  },
]);

const DEFAULT_HOME_SECTIONS = Object.freeze([
  { key: "hero", type: "hero", title: "Hero", locked: true, visible: true, sortOrder: 0 },
  { key: "introduction", type: "text", title: "Introduction", locked: false, visible: true, sortOrder: 1 },
  { key: "services", type: "services", title: "Services", locked: false, visible: true, sortOrder: 2 },
  { key: "doctors", type: "doctors", title: "Doctors", locked: false, visible: true, sortOrder: 3 },
  { key: "hours", type: "hours", title: "Opening Hours", locked: false, visible: true, sortOrder: 4 },
  { key: "contact", type: "contact", title: "Contact Form", locked: false, visible: true, sortOrder: 5 },
  { key: "promo", type: "promo", title: "Promo", locked: false, visible: true, sortOrder: 6 },
  { key: "faq", type: "faq", title: "FAQ", locked: false, visible: true, sortOrder: 7 },
]);

const RESERVED_SLUGS = Object.freeze(
  new Set([
    "home",
    "index",
    "about",
    "services",
    "doctors",
    "pricing",
    "insurance",
    "location",
    "contact",
    "book",
    "privacy",
    "terms",
    "patient-information",
    "patient",
    "patients",
    "website",
    "media",
    "preview",
    "drafts",
    "versions",
    "history",
    "procedures",
    "login",
    "register",
    "my-booking",
    "p",
    "app",
    "admin",
    "api",
    "assets",
    "static",
    "favicon.ico",
    "robots.txt",
  ])
);

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

const PAGE_ITEM_SCHEMA = Object.freeze({
  id: { type: "short_text", maxLen: 40 },
  kind: { type: "enum", enumValues: [PAGE_KIND.TEMPLATE, PAGE_KIND.CUSTOM] },
  template_key: { type: "short_text", maxLen: 40 },
  slug: { type: "short_text", maxLen: 64 },
  title: { type: "short_text", maxLen: 120 },
  nav_label: { type: "short_text", maxLen: 40 },
  status: { type: "enum", enumValues: [PAGE_STATUS.DRAFT, PAGE_STATUS.PUBLISHED, PAGE_STATUS.HIDDEN] },
  in_nav: { type: "boolean" },
  locked: { type: "boolean" },
  hideable: { type: "boolean" },
  sort_order: { type: "short_text", maxLen: 8 },
  meta_title: { type: "short_text", maxLen: 160 },
  meta_description: { type: "long_text", maxLen: 320 },
});

const SECTION_ITEM_SCHEMA = Object.freeze({
  id: { type: "short_text", maxLen: 40 },
  page_id: { type: "short_text", maxLen: 40 },
  type: {
    type: "enum",
    enumValues: SECTION_TYPES.map((item) => item.key),
  },
  title: { type: "short_text", maxLen: 80 },
  visible: { type: "boolean" },
  locked: { type: "boolean" },
  sort_order: { type: "short_text", maxLen: 8 },
  heading: { type: "short_text", maxLen: 160 },
  body: { type: "long_text", maxLen: 4000 },
  image: { type: "image", maxLen: 500 },
  button_label: { type: "short_text", maxLen: 60 },
  button_url: { type: "url", maxLen: 500 },
});

const BLOCK_ITEM_SCHEMA = Object.freeze({
  id: { type: "short_text", maxLen: 40 },
  page_id: { type: "short_text", maxLen: 40 },
  type: {
    type: "enum",
    enumValues: BLOCK_TYPES.map((item) => item.key),
  },
  sort_order: { type: "short_text", maxLen: 8 },
  heading: { type: "short_text", maxLen: 160 },
  body: { type: "long_text", maxLen: 4000 },
  image: { type: "image", maxLen: 500 },
  button_label: { type: "short_text", maxLen: 60 },
  button_url: { type: "url", maxLen: 500 },
});

function newCmsId(prefix) {
  const raw = crypto.randomBytes(6).toString("hex");
  return `${prefix}${raw}`.slice(0, 20);
}

function sortKey(value) {
  const n = Number.parseInt(String(value == null ? "0" : value), 10);
  return Number.isFinite(n) ? n : 0;
}

function boolValue(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === "on" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "off" || value === "no") return false;
  return fallback;
}

function normalizeSlug(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function validateCustomSlug(raw, options) {
  const opts = options && typeof options === "object" ? options : {};
  const slug = normalizeSlug(raw);
  if (!slug || !SLUG_RE.test(slug)) {
    return { ok: false, code: "invalid_slug", slug: slug || "" };
  }
  if (RESERVED_SLUGS.has(slug) && opts.allowReserved !== true) {
    return { ok: false, code: "reserved_slug", slug };
  }
  return { ok: true, slug };
}

function defaultPages() {
  return TEMPLATE_PAGES.map((page) => ({
    id: `tpl_${page.key}`.slice(0, 20),
    kind: PAGE_KIND.TEMPLATE,
    template_key: page.key,
    slug: page.slug,
    title: page.title,
    nav_label: page.title,
    status: page.status,
    in_nav: page.inNav === true,
    locked: page.locked === true,
    hideable: page.hideable === true,
    sort_order: String(page.sortOrder),
    meta_title: "",
    meta_description: "",
  }));
}

function defaultHomeSections() {
  return DEFAULT_HOME_SECTIONS.map((section) => ({
    id: `sec_${section.key}`.slice(0, 20),
    page_id: "tpl_home",
    type: section.type,
    title: section.title,
    visible: section.visible !== false,
    locked: section.locked === true,
    sort_order: String(section.sortOrder),
    heading: "",
    body: "",
    image: null,
    button_label: "",
    button_url: "",
  }));
}

function emptyImage() {
  return null;
}

function starterBlocksForTemplate(pageId, templateKey) {
  const id = pageId;
  if (templateKey === "about") {
    return [
      {
        id: newCmsId("b"),
        page_id: id,
        type: "heading",
        sort_order: "0",
        heading: "About our clinic",
        body: "",
        image: emptyImage(),
        button_label: "",
        button_url: "",
      },
      {
        id: newCmsId("b"),
        page_id: id,
        type: "text",
        sort_order: "1",
        heading: "",
        body: "Tell patients who you are, what to expect on a visit, and how to get in touch.",
        image: emptyImage(),
        button_label: "",
        button_url: "",
      },
    ];
  }
  if (templateKey === "services") {
    return [
      {
        id: newCmsId("b"),
        page_id: id,
        type: "heading",
        sort_order: "0",
        heading: "Our services",
        body: "",
        image: emptyImage(),
        button_label: "",
        button_url: "",
      },
      {
        id: newCmsId("b"),
        page_id: id,
        type: "text",
        sort_order: "1",
        heading: "",
        body: "Describe the care this clinic publishes for patients.",
        image: emptyImage(),
        button_label: "",
        button_url: "",
      },
    ];
  }
  if (templateKey === "faq") {
    return [
      {
        id: newCmsId("b"),
        page_id: id,
        type: "heading",
        sort_order: "0",
        heading: "Frequently asked questions",
        body: "",
        image: emptyImage(),
        button_label: "",
        button_url: "",
      },
      {
        id: newCmsId("b"),
        page_id: id,
        type: "text",
        sort_order: "1",
        heading: "",
        body: "Add common questions patients ask before a visit.",
        image: emptyImage(),
        button_label: "",
        button_url: "",
      },
    ];
  }
  if (templateKey === "pricing") {
    return [
      {
        id: newCmsId("b"),
        page_id: id,
        type: "heading",
        sort_order: "0",
        heading: "Pricing",
        body: "",
        image: emptyImage(),
        button_label: "",
        button_url: "",
      },
      {
        id: newCmsId("b"),
        page_id: id,
        type: "text",
        sort_order: "1",
        heading: "",
        body: "Share self-pay guidance. Operational price lists remain in clinic billing.",
        image: emptyImage(),
        button_label: "",
        button_url: "",
      },
    ];
  }
  return [];
}

function sortByOrder(items) {
  return [...(items || [])].sort((a, b) => sortKey(a.sort_order) - sortKey(b.sort_order));
}

function publicPageHref(clinicKey, page) {
  const key = String(clinicKey || "").trim();
  if (!key || !page) return "";
  if (page.kind === PAGE_KIND.TEMPLATE || RESERVED_SLUGS.has(String(page.slug || ""))) {
    const slug = String(page.slug || page.template_key || "");
    if (!slug || slug === "home") return `/clinics/${key}`;
    return `/clinics/${key}/${slug}`;
  }
  return `/clinics/${key}/p/${encodeURIComponent(page.slug)}`;
}

function publishedCustomPages(pages) {
  return (pages || []).filter(
    (page) =>
      page &&
      page.kind === PAGE_KIND.CUSTOM &&
      page.status === PAGE_STATUS.PUBLISHED &&
      page.slug &&
      !RESERVED_SLUGS.has(String(page.slug))
  );
}

function navCustomPages(pages) {
  return publishedCustomPages(pages)
    .filter((page) => page.in_nav === true)
    .sort((a, b) => sortKey(a.sort_order) - sortKey(b.sort_order));
}

function findCustomPageBySlug(pages, slug) {
  const wanted = String(slug || "").trim().toLowerCase();
  return publishedCustomPages(pages).find((page) => String(page.slug || "").toLowerCase() === wanted) || null;
}

function findDraftCustomPageBySlug(pages, slug) {
  const wanted = String(slug || "").trim().toLowerCase();
  return (
    (pages || []).find(
      (page) =>
        page &&
        page.kind === PAGE_KIND.CUSTOM &&
        String(page.slug || "").toLowerCase() === wanted &&
        page.status !== PAGE_STATUS.HIDDEN
    ) || null
  );
}

function sectionTypeLabel(type) {
  const found = SECTION_TYPES.find((item) => item.key === type);
  return (found && found.label) || type;
}

function blockTypeLabel(type) {
  const found = BLOCK_TYPES.find((item) => item.key === type);
  return (found && found.label) || type;
}

function isAddableSectionType(type) {
  const found = SECTION_TYPES.find((item) => item.key === type);
  return Boolean(found && found.addable);
}

function isKnownBlockType(type) {
  return BLOCK_TYPES.some((item) => item.key === type);
}

module.exports = {
  CMS_KEYS,
  PAGE_KIND,
  PAGE_STATUS,
  PAGE_TEMPLATES,
  SECTION_TYPES,
  BLOCK_TYPES,
  TEMPLATE_PAGES,
  DEFAULT_HOME_SECTIONS,
  RESERVED_SLUGS,
  PAGE_ITEM_SCHEMA,
  SECTION_ITEM_SCHEMA,
  BLOCK_ITEM_SCHEMA,
  newCmsId,
  sortKey,
  boolValue,
  normalizeSlug,
  validateCustomSlug,
  defaultPages,
  defaultHomeSections,
  starterBlocksForTemplate,
  sortByOrder,
  publicPageHref,
  publishedCustomPages,
  navCustomPages,
  findCustomPageBySlug,
  findDraftCustomPageBySlug,
  sectionTypeLabel,
  blockTypeLabel,
  isAddableSectionType,
  isKnownBlockType,
};
