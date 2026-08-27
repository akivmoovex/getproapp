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
const {
  CMS_KEYS,
  PAGE_ITEM_SCHEMA,
  SECTION_ITEM_SCHEMA,
  BLOCK_ITEM_SCHEMA,
  LIBRARY_ITEM_SCHEMA,
  PLACEMENT_ITEM_SCHEMA,
  defaultPages,
  defaultHomeSections,
} = require("./clinicWebsiteCms");

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
  "services.page_title": { type: T.SHORT_TEXT, maxLen: 120, group: "services", description: "Services page title" },
  "services.empty_heading": { type: T.SHORT_TEXT, maxLen: 160, group: "services", description: "Services empty-state heading" },
  "services.empty_body": { type: T.LONG_TEXT, maxLen: 1000, group: "services", description: "Services empty-state body" },
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
  "doctors.page_title": { type: T.SHORT_TEXT, maxLen: 120, group: "doctors", description: "Doctors page title" },
  "doctors.empty_heading": { type: T.SHORT_TEXT, maxLen: 160, group: "doctors", description: "Doctors empty-state heading" },
  "doctors.empty_body": { type: T.LONG_TEXT, maxLen: 1000, group: "doctors", description: "Doctors empty-state body" },
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
  "location.eyebrow": { type: T.SHORT_TEXT, maxLen: 80, group: "location", description: "Location eyebrow" },
  "location.page_title": { type: T.SHORT_TEXT, maxLen: 120, group: "location", description: "Location page title" },
  "contact.eyebrow": { type: T.SHORT_TEXT, maxLen: 80, group: "contact", description: "Contact eyebrow" },
  "contact.page_title": { type: T.SHORT_TEXT, maxLen: 160, group: "contact", description: "Contact page title" },
  "contact.aside_heading": { type: T.SHORT_TEXT, maxLen: 120, group: "contact", description: "Contact aside heading" },
  "about.eyebrow": { type: T.SHORT_TEXT, maxLen: 80, group: "about", description: "About eyebrow" },
  "pricing.page_title": { type: T.SHORT_TEXT, maxLen: 120, group: "pricing", description: "Pricing page title" },
  "pricing.intro": { type: T.LONG_TEXT, maxLen: 1000, group: "pricing", description: "Pricing page intro" },
  "home.faq_heading": { type: T.SHORT_TEXT, maxLen: 120, group: "home", description: "Home FAQ heading" },
  "home.preview.services_heading": { type: T.SHORT_TEXT, maxLen: 80, group: "home", description: "Home services card heading" },
  "home.preview.doctors_heading": { type: T.SHORT_TEXT, maxLen: 80, group: "home", description: "Home doctors card heading" },
  "home.preview.visit_heading": { type: T.SHORT_TEXT, maxLen: 80, group: "home", description: "Home visit card heading" },
  "patient.info_title": { type: T.SHORT_TEXT, maxLen: 160, group: "patientInformation", description: "Patient information title" },
  "patient.info_body": { type: T.LONG_TEXT, maxLen: 4000, group: "patientInformation", description: "Patient information body" },
  "nav.about.label": { type: T.SHORT_TEXT, maxLen: 40, group: "nav", description: "About menu label" },
  "nav.services.label": { type: T.SHORT_TEXT, maxLen: 40, group: "nav", description: "Services menu label" },
  "nav.doctors.label": { type: T.SHORT_TEXT, maxLen: 40, group: "nav", description: "Doctors menu label" },
  "nav.contact.label": { type: T.SHORT_TEXT, maxLen: 40, group: "nav", description: "Contact menu label" },
  "nav.location.label": { type: T.SHORT_TEXT, maxLen: 40, group: "nav", description: "Location menu label" },
  "nav.pricing.label": { type: T.SHORT_TEXT, maxLen: 40, group: "nav", description: "Pricing menu label" },
  "nav.patient_information.label": { type: T.SHORT_TEXT, maxLen: 60, group: "nav", description: "Patient information menu label" },
  "page.patient_information.visible": { type: T.BOOLEAN, group: "patientInformation", description: "Show patient information page" },
  "site.name": {
    type: T.SHORT_TEXT,
    maxLen: 120,
    group: "site",
    inline: false,
    description: "Website display name overlay",
  },
  "brand.primary_color": {
    type: T.SHORT_TEXT,
    maxLen: 7,
    group: "brand",
    inline: false,
    description: "Primary brand colour",
  },
  "brand.accent_color": {
    type: T.SHORT_TEXT,
    maxLen: 7,
    group: "brand",
    inline: false,
    description: "Accent brand colour",
  },
  "header.show_logo": { type: T.BOOLEAN, group: "header", description: "Show logo in header" },
  "header.show_nav": { type: T.BOOLEAN, group: "header", description: "Show navigation in header" },
  "header.show_phone": { type: T.BOOLEAN, group: "header", description: "Show phone in header" },
  "footer.show_contact": { type: T.BOOLEAN, group: "footer", description: "Show contact in footer" },
  "social.facebook_url": { type: T.URL, maxLen: 500, group: "social", inline: false, description: "Facebook URL" },
  "social.instagram_url": { type: T.URL, maxLen: 500, group: "social", inline: false, description: "Instagram URL" },
  "social.whatsapp_url": { type: T.URL, maxLen: 500, group: "social", inline: false, description: "WhatsApp URL" },
  "social.x_url": { type: T.URL, maxLen: 500, group: "social", inline: false, description: "X URL" },
  "seo.title": { type: T.SHORT_TEXT, maxLen: 70, group: "seo", inline: false, description: "Search and sharing title" },
  "seo.description": { type: T.LONG_TEXT, maxLen: 200, group: "seo", inline: false, description: "Search and sharing description" },
  "seo.image": { type: T.IMAGE, maxLen: 500, group: "seo", inline: false, description: "Social sharing image" },
  "seo.canonical_url": { type: T.URL, maxLen: 500, group: "seo", inline: false, description: "Canonical URL override" },
  "seo.robots": { type: T.ENUM, enumValues: ["index", "noindex"], group: "seo", inline: false, description: "Search engine indexing" },
  "seo.sitemap_include": { type: T.BOOLEAN, group: "seo", inline: false, description: "Include in sitemap.xml" },
  [CMS_KEYS.PAGES]: {
    type: T.STRUCTURED,
    group: "cms",
    description: "Clinic website pages",
    itemSchema: PAGE_ITEM_SCHEMA,
  },
  [CMS_KEYS.SECTIONS]: {
    type: T.STRUCTURED,
    group: "cms",
    description: "Clinic website sections",
    itemSchema: SECTION_ITEM_SCHEMA,
  },
  [CMS_KEYS.BLOCKS]: {
    type: T.STRUCTURED,
    group: "cms",
    description: "Clinic page content blocks",
    itemSchema: BLOCK_ITEM_SCHEMA,
  },
  [CMS_KEYS.LIBRARY]: {
    type: T.STRUCTURED,
    group: "cms",
    description: "Reusable clinic website content",
    itemSchema: LIBRARY_ITEM_SCHEMA,
  },
  [CMS_KEYS.PLACEMENTS]: {
    type: T.STRUCTURED,
    group: "cms",
    description: "Where reusable website content is used",
    itemSchema: PLACEMENT_ITEM_SCHEMA,
  },
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
    enumValues: def.enumValues || null,
    inline:
      def.inline === false
        ? false
        : def.type !== CONTENT_TYPES.BOOLEAN && def.type !== CONTENT_TYPES.STRUCTURED,
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
