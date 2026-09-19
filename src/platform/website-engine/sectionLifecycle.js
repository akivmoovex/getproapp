"use strict";

/**
 * Shared section lifecycle helpers for the V7 website editor.
 * Product adapters supply section records; presentation and remove/edit
 * capabilities stay consistent across ActiveClinic and BlessBoard.
 */

const { CONTENT_TYPES } = require("../website/contentTypes");
const { PERMISSIONS } = require("../website/permissions");
const { PRODUCT_CODE } = require("../website/publicWebsiteUrl");

const CMS_SECTION_FIELD_RE =
  /^cms\.section\.([a-z0-9][a-z0-9_-]{0,39})\.(heading|body|button_label|button_url|image)$/i;

const CMS_SECTION_FIELD_META = Object.freeze({
  heading: { type: CONTENT_TYPES.SHORT_TEXT, maxLen: 160 },
  body: { type: CONTENT_TYPES.LONG_TEXT, maxLen: 4000 },
  button_label: { type: CONTENT_TYPES.SHORT_TEXT, maxLen: 60 },
  button_url: { type: CONTENT_TYPES.URL, maxLen: 500 },
  image: { type: CONTENT_TYPES.IMAGE, maxLen: 500 },
});

/**
 * Parse ActiveClinic CMS section field keys used for inline edit of added sections.
 * @param {string} contentKey
 * @returns {{ sectionId: string, field: string, contentKey: string }|null}
 */
function parseCmsSectionFieldKey(contentKey) {
  const raw = String(contentKey || "").trim().toLowerCase();
  const match = CMS_SECTION_FIELD_RE.exec(raw);
  if (!match) return null;
  return {
    sectionId: match[1],
    field: match[2].toLowerCase(),
    contentKey: raw,
  };
}

/**
 * Synthetic editable-field descriptor for cms.section.* keys.
 * @param {string} contentKey
 */
function cmsSectionEditableField(contentKey) {
  const parsed = parseCmsSectionFieldKey(contentKey);
  if (!parsed) return null;
  const meta = CMS_SECTION_FIELD_META[parsed.field];
  if (!meta) return null;
  return {
    productCode: PRODUCT_CODE.ACTIVECLINIC,
    key: parsed.contentKey,
    type: meta.type,
    maxLen: meta.maxLen,
    permission: PERMISSIONS.EDIT,
    validationMode: "content_types",
    inline: true,
    storage: {
      kind: "activeclinic_cms_section",
      sectionId: parsed.sectionId,
      field: parsed.field,
    },
  };
}

/**
 * Whether a CMS section row is a seeded default (sec_*) vs user-added.
 * @param {object} section
 */
function isSeededCmsSection(section) {
  return String((section && section.id) || "").indexOf("sec_") === 0;
}

/**
 * Build capability records for user-added CMS sections missing from defaults.
 * @param {{
 *   pageKey: string,
 *   pageSections: object[],
 *   defaultCapabilities: object[],
 *   selectorForSection: (section: object) => string,
 * }} input
 */
function customCmsSectionCapabilities(input) {
  const pageKey = String((input && input.pageKey) || "home").trim() || "home";
  const pageSections = Array.isArray(input && input.pageSections) ? input.pageSections : [];
  const defaults = Array.isArray(input && input.defaultCapabilities) ? input.defaultCapabilities : [];
  const claimedIds = new Set(defaults.map((c) => String(c.sectionId || "")));
  const selectorForSection =
    typeof (input && input.selectorForSection) === "function"
      ? input.selectorForSection
      : (section) => `[data-ac-section-id="${section.id}"]`;

  const custom = [];
  pageSections
    .slice()
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .forEach((section, index) => {
      if (!section || !section.id) return;
      if (claimedIds.has(String(section.id))) return;
      if (isSeededCmsSection(section)) return;
      const locked = section.locked === true;
      custom.push({
        sectionKey: String(section.id),
        sectionId: String(section.id),
        pageKey,
        label: section.title || section.heading || section.type || "Section",
        title: section.title || section.heading || null,
        canEdit: true,
        canReorder: !locked,
        canHide: !locked,
        canRestoreDefault: false,
        canRemove: !locked,
        isHidden: section.visible === false,
        isDefault: false,
        isCustom: true,
        sortIndex: defaults.length + index,
        selector: selectorForSection(section),
        domainBacked: false,
        sectionType: String(section.type || ""),
      });
    });
  return custom;
}

module.exports = {
  parseCmsSectionFieldKey,
  cmsSectionEditableField,
  isSeededCmsSection,
  customCmsSectionCapabilities,
  CMS_SECTION_FIELD_META,
};
