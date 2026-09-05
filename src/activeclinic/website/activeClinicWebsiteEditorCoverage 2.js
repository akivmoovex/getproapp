"use strict";

/**
 * Canonical clinic-website editor coverage.
 * Every visible public section is classified. Tests iterate this matrix so
 * new pages cannot silently ship uneditable clinic-owned copy.
 */

const C = Object.freeze({
  EDITABLE_CONTENT: "EDITABLE_CONTENT",
  OPERATIONAL_DATA: "OPERATIONAL_DATA",
  PLATFORM_CONTROLLED: "PLATFORM_CONTROLLED",
});

const COVERAGE = Object.freeze([
  { page: "home", section: "Hero eyebrow", classification: C.EDITABLE_CONTENT, contentKey: "home.hero.eyebrow", editable: true, source: "website draft" },
  { page: "home", section: "Hero title", classification: C.EDITABLE_CONTENT, contentKey: "home.hero.title", editable: true, source: "website draft" },
  { page: "home", section: "Hero description", classification: C.EDITABLE_CONTENT, contentKey: "home.hero.subtitle", editable: true, source: "website draft" },
  { page: "home", section: "Hero image", classification: C.EDITABLE_CONTENT, contentKey: "home.hero.image", editable: true, source: "website draft" },
  { page: "home", section: "Hero booking CTA", classification: C.PLATFORM_CONTROLLED, contentKey: null, editable: false, source: "booking capability" },
  { page: "home", section: "Hero phone CTA", classification: C.OPERATIONAL_DATA, contentKey: null, editable: false, source: "clinic profile", manageHref: "/app/settings/organization" },
  { page: "home", section: "Listed on ActiveClinic badge", classification: C.PLATFORM_CONTROLLED, contentKey: null, editable: false, source: "platform branding" },
  { page: "home", section: "Trust strip", classification: C.PLATFORM_CONTROLLED, contentKey: null, editable: false, source: "platform listing facts" },
  { page: "home", section: "Services preview heading", classification: C.EDITABLE_CONTENT, contentKey: "home.preview.services_heading", editable: true, source: "website draft" },
  { page: "home", section: "Services preview intro", classification: C.EDITABLE_CONTENT, contentKey: "services.intro", editable: true, source: "website draft" },
  { page: "home", section: "Doctors preview heading", classification: C.EDITABLE_CONTENT, contentKey: "home.preview.doctors_heading", editable: true, source: "website draft" },
  { page: "home", section: "Doctors preview intro", classification: C.EDITABLE_CONTENT, contentKey: "doctors.intro", editable: true, source: "website draft" },
  { page: "home", section: "Visit preview heading", classification: C.EDITABLE_CONTENT, contentKey: "home.preview.visit_heading", editable: true, source: "website draft" },
  { page: "home", section: "Visit preview address", classification: C.OPERATIONAL_DATA, contentKey: null, editable: false, source: "clinic facilities", manageHref: "/app/facilities" },
  { page: "home", section: "Plan your visit heading", classification: C.EDITABLE_CONTENT, contentKey: "home.promo.heading", editable: true, source: "website draft" },
  { page: "home", section: "Plan your visit body", classification: C.EDITABLE_CONTENT, contentKey: "home.promo.body", editable: true, source: "website draft" },
  { page: "home", section: "FAQ heading", classification: C.EDITABLE_CONTENT, contentKey: "home.faq_heading", editable: true, source: "website draft" },
  { page: "home", section: "FAQ items", classification: C.EDITABLE_CONTENT, contentKey: "home.faq", editable: true, source: "website draft", collection: true },
  { page: "about", section: "Eyebrow", classification: C.EDITABLE_CONTENT, contentKey: "about.eyebrow", editable: true, source: "website draft" },
  { page: "about", section: "Heading", classification: C.EDITABLE_CONTENT, contentKey: "about.story.heading", editable: true, source: "website draft" },
  { page: "about", section: "Story", classification: C.EDITABLE_CONTENT, contentKey: "about.story.body", editable: true, source: "website draft" },
  { page: "about", section: "Photo", classification: C.EDITABLE_CONTENT, contentKey: "about.story.image", editable: true, source: "website draft" },
  { page: "about", section: "Contact details", classification: C.OPERATIONAL_DATA, contentKey: null, editable: false, source: "clinic profile", manageHref: "/app/settings/organization" },
  { page: "services", section: "Page title", classification: C.EDITABLE_CONTENT, contentKey: "services.page_title", editable: true, source: "website draft" },
  { page: "services", section: "Intro", classification: C.EDITABLE_CONTENT, contentKey: "services.intro", editable: true, source: "website draft" },
  { page: "services", section: "Empty-state heading", classification: C.EDITABLE_CONTENT, contentKey: "services.empty_heading", editable: true, source: "website draft" },
  { page: "services", section: "Empty-state body", classification: C.EDITABLE_CONTENT, contentKey: "services.empty_body", editable: true, source: "website draft" },
  { page: "services", section: "Actual service list", classification: C.OPERATIONAL_DATA, contentKey: null, editable: false, source: "appointment types (no catalogue screen)", manageHref: null },
  { page: "services", section: "Actual procedure list", classification: C.OPERATIONAL_DATA, contentKey: null, editable: false, source: "clinic procedures (no catalogue screen)", manageHref: null },
  { page: "services", section: "Pricing honesty note", classification: C.PLATFORM_CONTROLLED, contentKey: null, editable: false, source: "platform" },
  { page: "doctors", section: "Page title", classification: C.EDITABLE_CONTENT, contentKey: "doctors.page_title", editable: true, source: "website draft" },
  { page: "doctors", section: "Intro", classification: C.EDITABLE_CONTENT, contentKey: "doctors.intro", editable: true, source: "website draft" },
  { page: "doctors", section: "Empty-state heading", classification: C.EDITABLE_CONTENT, contentKey: "doctors.empty_heading", editable: true, source: "website draft" },
  { page: "doctors", section: "Empty-state body", classification: C.EDITABLE_CONTENT, contentKey: "doctors.empty_body", editable: true, source: "website draft" },
  { page: "doctors", section: "Actual clinician list", classification: C.OPERATIONAL_DATA, contentKey: null, editable: false, source: "staff public profiles", manageHref: "/app/staff" },
  { page: "contact", section: "Eyebrow", classification: C.EDITABLE_CONTENT, contentKey: "contact.eyebrow", editable: true, source: "website draft" },
  { page: "contact", section: "Page title", classification: C.EDITABLE_CONTENT, contentKey: "contact.page_title", editable: true, source: "website draft" },
  { page: "contact", section: "Intro", classification: C.EDITABLE_CONTENT, contentKey: "contact.intro", editable: true, source: "website draft" },
  { page: "contact", section: "Contact section heading", classification: C.EDITABLE_CONTENT, contentKey: "contact.aside_heading", editable: true, source: "website draft" },
  { page: "contact", section: "Phone", classification: C.OPERATIONAL_DATA, contentKey: "contact.phone", editable: false, source: "clinic profile / website overlay", manageHref: "/app/settings/organization" },
  { page: "contact", section: "Email", classification: C.OPERATIONAL_DATA, contentKey: "contact.email", editable: false, source: "clinic profile / website overlay", manageHref: "/app/settings/organization" },
  { page: "contact", section: "Contact form labels", classification: C.PLATFORM_CONTROLLED, contentKey: null, editable: false, source: "platform form" },
  { page: "contact", section: "Form honesty note", classification: C.PLATFORM_CONTROLLED, contentKey: null, editable: false, source: "platform" },
  { page: "location", section: "Eyebrow", classification: C.EDITABLE_CONTENT, contentKey: "location.eyebrow", editable: true, source: "website draft" },
  { page: "location", section: "Page title", classification: C.EDITABLE_CONTENT, contentKey: "location.page_title", editable: true, source: "website draft" },
  { page: "location", section: "Intro", classification: C.EDITABLE_CONTENT, contentKey: "location.intro", editable: true, source: "website draft" },
  { page: "location", section: "Facilities", classification: C.OPERATIONAL_DATA, contentKey: null, editable: false, source: "clinic facilities", manageHref: "/app/facilities" },
  { page: "location", section: "Address overlay", classification: C.EDITABLE_CONTENT, contentKey: "location.address", editable: true, source: "website draft overlay" },
  { page: "location", section: "Hours overlay", classification: C.EDITABLE_CONTENT, contentKey: "location.hours", editable: true, source: "website draft overlay" },
  { page: "pricing", section: "Page title", classification: C.EDITABLE_CONTENT, contentKey: "pricing.page_title", editable: true, source: "website draft" },
  { page: "pricing", section: "Intro", classification: C.EDITABLE_CONTENT, contentKey: "pricing.intro", editable: true, source: "website draft" },
  { page: "pricing", section: "Insurance intro", classification: C.EDITABLE_CONTENT, contentKey: "insurance.intro", editable: true, source: "website draft" },
  { page: "pricing", section: "Published fees", classification: C.OPERATIONAL_DATA, contentKey: null, editable: false, source: "clinic price patterns" },
  { page: "pricing", section: "Fee honesty notes", classification: C.PLATFORM_CONTROLLED, contentKey: null, editable: false, source: "platform" },
  { page: "patient-information", section: "Page title", classification: C.EDITABLE_CONTENT, contentKey: "patient.info_title", editable: true, source: "website draft" },
  { page: "patient-information", section: "Body", classification: C.EDITABLE_CONTENT, contentKey: "patient.info_body", editable: true, source: "website draft" },
  { page: "book", section: "Intro", classification: C.EDITABLE_CONTENT, contentKey: "book.intro", editable: true, source: "website draft" },
  { page: "book", section: "Booking wizard", classification: C.PLATFORM_CONTROLLED, contentKey: null, editable: false, source: "platform booking" },
  { page: "chrome", section: "Logo", classification: C.EDITABLE_CONTENT, contentKey: "home.logo", editable: true, source: "website draft" },
  { page: "chrome", section: "Footer tagline", classification: C.EDITABLE_CONTENT, contentKey: "footer.tagline", editable: true, source: "website draft" },
  { page: "chrome", section: "Footer legal", classification: C.EDITABLE_CONTENT, contentKey: "footer.legal", editable: true, source: "website draft" },
  { page: "chrome", section: "Nav About label", classification: C.EDITABLE_CONTENT, contentKey: "nav.about.label", editable: true, source: "website draft" },
  { page: "chrome", section: "Nav Services label", classification: C.EDITABLE_CONTENT, contentKey: "nav.services.label", editable: true, source: "website draft" },
  { page: "chrome", section: "Nav Doctors label", classification: C.EDITABLE_CONTENT, contentKey: "nav.doctors.label", editable: true, source: "website draft" },
  { page: "chrome", section: "Nav Contact label", classification: C.EDITABLE_CONTENT, contentKey: "nav.contact.label", editable: true, source: "website draft" },
  { page: "chrome", section: "Nav Location label", classification: C.EDITABLE_CONTENT, contentKey: "nav.location.label", editable: true, source: "website draft" },
  { page: "chrome", section: "Nav Pricing label", classification: C.EDITABLE_CONTENT, contentKey: "nav.pricing.label", editable: true, source: "website draft" },
  { page: "chrome", section: "Nav Patient information label", classification: C.EDITABLE_CONTENT, contentKey: "nav.patient_information.label", editable: true, source: "website draft" },
  { page: "chrome", section: "Website display name", classification: C.EDITABLE_CONTENT, contentKey: "site.name", editable: false, source: "website settings", manageHref: "/app/settings/website/settings" },
  { page: "chrome", section: "Primary brand colour", classification: C.EDITABLE_CONTENT, contentKey: "brand.primary_color", editable: false, source: "website branding", manageHref: "/app/settings/website/branding" },
  { page: "chrome", section: "Accent brand colour", classification: C.EDITABLE_CONTENT, contentKey: "brand.accent_color", editable: false, source: "website branding", manageHref: "/app/settings/website/branding" },
  { page: "chrome", section: "SEO title", classification: C.EDITABLE_CONTENT, contentKey: "seo.title", editable: false, source: "website SEO settings", manageHref: "/app/settings/website/seo" },
  { page: "chrome", section: "SEO description", classification: C.EDITABLE_CONTENT, contentKey: "seo.description", editable: false, source: "website SEO settings", manageHref: "/app/settings/website/seo" },
  { page: "chrome", section: "Social sharing image", classification: C.EDITABLE_CONTENT, contentKey: "seo.image", editable: false, source: "website SEO settings", manageHref: "/app/settings/website/seo" },
  { page: "chrome", section: "Header logo visibility", classification: C.EDITABLE_CONTENT, contentKey: "header.show_logo", editable: false, source: "header settings", manageHref: "/app/settings/website/chrome" },
  { page: "chrome", section: "Social Facebook URL", classification: C.EDITABLE_CONTENT, contentKey: "social.facebook_url", editable: false, source: "header and footer settings", manageHref: "/app/settings/website/chrome" },
  { page: "chrome", section: "Login / patient portal", classification: C.PLATFORM_CONTROLLED, contentKey: null, editable: false, source: "platform auth" },
  { page: "chrome", section: "Book appointment control", classification: C.PLATFORM_CONTROLLED, contentKey: null, editable: false, source: "platform booking" },
  { page: "chrome", section: "Find a clinic", classification: C.PLATFORM_CONTROLLED, contentKey: null, editable: false, source: "disabled public capability" },
  { page: "terms", section: "Legal copy", classification: C.PLATFORM_CONTROLLED, contentKey: null, editable: false, source: "platform legal" },
  { page: "privacy", section: "Legal copy", classification: C.PLATFORM_CONTROLLED, contentKey: null, editable: false, source: "platform legal" },
]);

const PUBLIC_PAGES = Object.freeze([
  "home",
  "about",
  "services",
  "doctors",
  "contact",
  "location",
  "pricing",
  "patient-information",
  "book",
]);

function coverageForPage(page) {
  return COVERAGE.filter((row) => row.page === page || row.page === "chrome");
}

function expectedInlineKeysForPage(page) {
  return coverageForPage(page)
    .filter((row) => row.editable && row.contentKey && row.classification === C.EDITABLE_CONTENT && !row.collection)
    .map((row) => row.contentKey);
}

function unclassifiedRows() {
  return COVERAGE.filter((row) => !row.classification || row.classification === "BUG_UNCLASSIFIED");
}

module.exports = {
  CLASSIFICATION: C,
  COVERAGE,
  PUBLIC_PAGES,
  coverageForPage,
  expectedInlineKeysForPage,
  unclassifiedRows,
};
