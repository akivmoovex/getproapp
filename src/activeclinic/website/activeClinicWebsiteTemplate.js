"use strict";

const { registerWebsiteTemplate } = require("../../platform/website/templateRegistry");
const { CONTENT_TYPES } = require("../../platform/website/contentTypes");
const { PERMISSIONS } = require("../../platform/website/permissions");
const {
  registerProductEditableFields,
  STORAGE_KIND,
  VALIDATION_MODE,
  PRODUCT_CODE,
} = require("../../platform/website/editableFieldSchema");
const { buildActiveClinicWebsiteTemplateContent } = require("./activeClinicWebsiteTemplateContent");

const T = CONTENT_TYPES;

const KEYS = {
  "home.hero.title": { type: T.SHORT_TEXT, maxLen: 160, group: "home", description: "Hero title" },
  "home.hero.subtitle": { type: T.LONG_TEXT, maxLen: 800, group: "home", description: "Hero subtitle" },
  "home.hero.image": { type: T.IMAGE, maxLen: 500, group: "home", description: "Hero image" },
  "home.hero.eyebrow": { type: T.SHORT_TEXT, maxLen: 80, group: "home", description: "Hero eyebrow" },
  "home.logo": { type: T.IMAGE, maxLen: 500, group: "home", description: "Clinic logo" },
  "about.story.body": { type: T.LONG_TEXT, maxLen: 8000, group: "about", description: "About / story" },
  "about.story.heading": { type: T.SHORT_TEXT, maxLen: 120, group: "about", description: "About heading" },
  "about.story.image": { type: T.IMAGE, maxLen: 500, group: "about", description: "About photo" },
  "contact.phone": { type: T.PHONE, maxLen: 40, group: "contact", hideable: true, description: "Marketing phone overlay" },
  "contact.email": { type: T.EMAIL, maxLen: 254, group: "contact", hideable: true, description: "Marketing email overlay" },
  "contact.intro": { type: T.LONG_TEXT, maxLen: 1000, group: "contact", description: "Contact intro" },
  "location.address": { type: T.LONG_TEXT, maxLen: 500, group: "location", hideable: true, description: "Marketing address overlay" },
  "location.hours": { type: T.LONG_TEXT, maxLen: 1000, group: "location", hideable: true, description: "Marketing hours overlay" },
  "footer.legal": { type: T.LONG_TEXT, maxLen: 2000, group: "footer", description: "Footer legal" },
  "footer.tagline": { type: T.SHORT_TEXT, maxLen: 200, group: "footer", description: "Footer tagline" },
  "book.intro": { type: T.LONG_TEXT, maxLen: 1000, group: "book", description: "Booking intro" },
  "home.promo.heading": { type: T.SHORT_TEXT, maxLen: 120, group: "home", hideable: true, description: "Promo heading" },
  "home.promo.body": { type: T.LONG_TEXT, maxLen: 800, group: "home", hideable: true, description: "Promo body" },
  "home.testimonials": {
    type: T.STRUCTURED,
    group: "home",
    hideable: true,
    itemSchema: {
      quote: { type: T.LONG_TEXT, maxLen: 600 },
      attribution: { type: T.SHORT_TEXT, maxLen: 120 },
    },
  },
  "home.faq": {
    type: T.STRUCTURED,
    group: "home",
    hideable: true,
    itemSchema: {
      question: { type: T.SHORT_TEXT, maxLen: 200 },
      answer: { type: T.LONG_TEXT, maxLen: 2000 },
    },
  },
  "page.pricing.visible": { type: T.BOOLEAN, group: "pricing", description: "Show pricing page" },
  "page.doctors.visible": { type: T.BOOLEAN, group: "doctors", description: "Show doctors page" },
  "page.insurance.visible": { type: T.BOOLEAN, group: "insurance", description: "Show insurance page" },
  "section.testimonials.visible": { type: T.BOOLEAN, group: "home" },
  "section.faq.visible": { type: T.BOOLEAN, group: "home" },
  "section.promo.visible": { type: T.BOOLEAN, group: "home" },
  "insurance.intro": { type: T.LONG_TEXT, maxLen: 2000, group: "insurance", hideable: true },
  "services.intro": { type: T.LONG_TEXT, maxLen: 2000, group: "services", description: "Services page intro" },
  "services.examples": {
    type: T.STRUCTURED,
    group: "services",
    hideable: true,
    itemSchema: {
      name: { type: T.SHORT_TEXT, maxLen: 120 },
      summary: { type: T.LONG_TEXT, maxLen: 400 },
    },
  },
  "doctors.intro": { type: T.LONG_TEXT, maxLen: 2000, group: "doctors", description: "Doctors page intro" },
  "doctors.examples": {
    type: T.STRUCTURED,
    group: "doctors",
    hideable: true,
    itemSchema: {
      name: { type: T.SHORT_TEXT, maxLen: 120 },
      title: { type: T.SHORT_TEXT, maxLen: 160 },
      bio: { type: T.LONG_TEXT, maxLen: 800 },
    },
  },
  "location.intro": { type: T.LONG_TEXT, maxLen: 1000, group: "location", description: "Location page intro" },
};

const DEFAULTS = Object.freeze(buildActiveClinicWebsiteTemplateContent());

let registeredV1 = null;
let registeredV2 = null;

function editableFieldsFromKeys(templateId, version) {
  return Object.entries(KEYS).map(([key, def]) => ({
    key,
    productCode: PRODUCT_CODE.ACTIVECLINIC,
    templateId,
    templateVersion: version,
    type: def.type,
    maxLen: def.maxLen,
    hideable: def.hideable === true,
    group: def.group || null,
    description: def.description || key,
    permission: PERMISSIONS.EDIT,
    validationMode: VALIDATION_MODE.CONTENT_TYPES,
    itemSchema: def.itemSchema || null,
    inline: def.type !== CONTENT_TYPES.BOOLEAN && def.type !== CONTENT_TYPES.STRUCTURED,
    storage: { kind: STORAGE_KIND.PLATFORM_CONTENT_KEY, contentKey: key },
  }));
}

function registerActiveClinicEditableFields() {
  registerProductEditableFields(PRODUCT_CODE.ACTIVECLINIC, editableFieldsFromKeys("activeclinic_clinic", 1));
}

function registerActiveClinicWebsiteTemplate() {
  registerActiveClinicEditableFields();
  if (registeredV1) return registeredV1;
  registeredV1 = registerWebsiteTemplate({
    templateId: "activeclinic_clinic",
    productCode: "activeclinic",
    version: 1,
    label: "ActiveClinic clinic website",
    pages: [
      { key: "home", label: "Home", mandatory: true },
      { key: "about", label: "About", mandatory: true },
      { key: "services", label: "Services", mandatory: true },
      { key: "doctors", label: "Doctors", mandatory: false },
      { key: "pricing", label: "Pricing / Insurance", mandatory: false },
      { key: "location", label: "Location & Hours", mandatory: true },
      { key: "contact", label: "Contact", mandatory: true },
      { key: "book", label: "Book Appointment", mandatory: true },
    ],
    keys: KEYS,
    requiredPublishKeys: ["operational.clinic_name"],
    mandatoryPages: ["home", "about", "services", "location", "contact", "book"],
    operationalBindings: {
      "operational.clinic_name": "healthcare_organizations.public_name",
      "operational.phone": "healthcare_organizations.public_phone_display",
      "operational.email": "healthcare_organizations.public_email_display",
      "operational.address": "facilities.address",
      "operational.hours": "facilities.public_hours_json",
      "operational.doctors": "staff_members.public_profile",
      "operational.services": "public services catalogue",
      "operational.booking": "public_booking_enabled",
    },
    defaults: DEFAULTS,
  });
  registeredV2 = registerWebsiteTemplate({
    templateId: "activeclinic_clinic",
    productCode: "activeclinic",
    version: 2,
    label: "ActiveClinic clinic website",
    pages: [
      ...registeredV1.pages,
      { key: "insurance", label: "Insurance", mandatory: false },
      { key: "faq", label: "FAQ", mandatory: false },
    ],
    keys: KEYS,
    requiredPublishKeys: registeredV1.requiredPublishKeys,
    mandatoryPages: registeredV1.mandatoryPages,
    operationalBindings: registeredV1.operationalBindings,
    defaults: {
      ...DEFAULTS,
      "page.insurance.visible": false,
      "section.faq.visible": false,
    },
  });
  return registeredV1;
}

function registerActiveClinicWebsiteTemplateV2() {
  registerActiveClinicWebsiteTemplate();
  return registeredV2;
}

module.exports = {
  registerActiveClinicWebsiteTemplate,
  registerActiveClinicWebsiteTemplateV2,
  ACTIVECLINIC_TEMPLATE_ID: "activeclinic_clinic",
  ACTIVECLINIC_TEMPLATE_VERSION: 1,
  ACTIVECLINIC_TEMPLATE_V2: 2,
  ACTIVECLINIC_WEBSITE_KEYS: KEYS,
  ACTIVECLINIC_WEBSITE_DEFAULTS: DEFAULTS,
  registerActiveClinicEditableFields,
};
