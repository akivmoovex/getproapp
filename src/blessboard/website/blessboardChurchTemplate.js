"use strict";

const { registerWebsiteTemplate } = require("../../platform/website/templateRegistry");
const { CONTENT_TYPES } = require("../../platform/website/contentTypes");
const {
  registerEditableField,
  STORAGE_KIND,
  PRODUCT_CODE,
} = require("../../platform/website/editableFieldSchema");
const { PERMISSIONS } = require("../../platform/website/permissions");
const { SNAPSHOT_KEY } = require("../../platform/website-engine/productSchemaRegistry");
const { KEY_DEFS, VALUE_TYPES } = require("../services/websiteSettingKeyRegistry");
const { EDITABLE_FIELDS } = require("../services/websiteInlineEditableFields");

const TYPE_MAP = Object.freeze({
  [VALUE_TYPES.SHORT_TEXT]: CONTENT_TYPES.SHORT_TEXT,
  [VALUE_TYPES.LONG_TEXT]: CONTENT_TYPES.LONG_TEXT,
  [VALUE_TYPES.EMAIL]: CONTENT_TYPES.EMAIL,
  [VALUE_TYPES.PHONE]: CONTENT_TYPES.PHONE,
  [VALUE_TYPES.URL]: CONTENT_TYPES.URL,
  [VALUE_TYPES.IMAGE_URL]: CONTENT_TYPES.IMAGE,
  [VALUE_TYPES.BOOLEAN]: CONTENT_TYPES.BOOLEAN,
  [VALUE_TYPES.ENUM]: CONTENT_TYPES.ENUM,
  [VALUE_TYPES.SOCIAL_LINKS]: CONTENT_TYPES.STRUCTURED,
});

function settingKeys() {
  const keys = {};
  for (const [key, def] of Object.entries(KEY_DEFS)) {
    keys[key] = {
      type: TYPE_MAP[def.type] || CONTENT_TYPES.SHORT_TEXT,
      maxLen: def.maxLen,
      enumValues: def.enumValues,
      group: def.group,
      hideable: def.hideable === true,
      description: def.description,
    };
  }
  return keys;
}

function inlineFieldKeys() {
  const keys = {};
  const fields = Array.isArray(EDITABLE_FIELDS) ? EDITABLE_FIELDS : [];
  for (const field of fields) {
    const fieldKey = String(field.fieldKey || "")
      .replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`)
      .replace(/^_/, "");
    const key = `${field.pageKey}.${field.sectionKey}.${fieldKey}`;
    const type =
      field.type === "buttonUrl"
        ? CONTENT_TYPES.URL
        : field.type === "paragraph"
          ? CONTENT_TYPES.LONG_TEXT
          : field.type === "image"
            ? CONTENT_TYPES.IMAGE
            : field.type === "contactText" && field.fieldKey === "email"
              ? CONTENT_TYPES.EMAIL
              : field.type === "contactText" && field.fieldKey === "phone"
                ? CONTENT_TYPES.PHONE
                : CONTENT_TYPES.SHORT_TEXT;
    keys[key] = {
      type,
      maxLen: field.maxLength || 500,
      group: field.pageKey,
      description: field.guidance || key,
    };
  }
  return keys;
}

let registered = null;

function registerBlessBoardWebsiteTemplate() {
  if (!registered) {
    registered = registerWebsiteTemplate({
    templateId: "blessboard_church",
    productCode: "blessboard",
    version: 1,
    label: "BlessBoard church website",
    pages: [
      { key: "home", label: "Home", mandatory: true },
      { key: "about", label: "About", mandatory: true },
      { key: "leadership", label: "Leadership", mandatory: false },
      { key: "ministries", label: "Ministries", mandatory: false },
      { key: "events", label: "Events", mandatory: false },
      { key: "sermons", label: "Sermons", mandatory: false },
      { key: "giving", label: "Giving", mandatory: false },
      { key: "contact", label: "Contact", mandatory: true },
    ],
    keys: {
      ...settingKeys(),
      ...inlineFieldKeys(),
      [SNAPSHOT_KEY]: {
        type: CONTENT_TYPES.STRUCTURED,
        acceptObject: true,
        maxBytes: 512000,
        group: "cms",
        description: "Church website publication snapshot",
      },
    },
    requiredPublishKeys: [],
    mandatoryPages: ["home", "about", "contact"],
    defaults: {},
  });
  }
  registerSnapshotEditableField();
  return registered;
}

function registerSnapshotEditableField() {
  registerEditableField({
    productCode: PRODUCT_CODE.BLESSBOARD,
    key: SNAPSHOT_KEY,
    type: CONTENT_TYPES.STRUCTURED,
    acceptObject: true,
    maxBytes: 512000,
    permission: PERMISSIONS.EDIT,
    storage: { kind: STORAGE_KIND.PLATFORM_CONTENT_KEY, contentKey: SNAPSHOT_KEY },
    description: "Church website publication snapshot",
  });
}

module.exports = {
  registerBlessBoardWebsiteTemplate,
  BLESSBOARD_TEMPLATE_ID: "blessboard_church",
  BLESSBOARD_TEMPLATE_VERSION: 1,
};
