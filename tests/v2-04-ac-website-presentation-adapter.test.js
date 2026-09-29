"use strict";

/**
 * V2.04 Overnight Step 3 — ActiveClinic website presentation adapter.
 * Pure unit tests; no DB; does not change public render paths.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const adapter = require("../src/activeclinic/website/activeClinicWebsitePresentationAdapter");
const presentation = require("../src/platform/website/presentation");

const ROOT = path.join(__dirname, "..");
const ADAPTER_FILE = path.join(
  ROOT,
  "src/activeclinic/website/activeClinicWebsitePresentationAdapter.js"
);

function sampleClinic() {
  return {
    publicName: "Demo Clinic",
    websiteDisplayName: "Demo Clinic",
    publicPhoneDisplay: "+1 555 0100",
    publicEmailDisplay: "hello@demo.example",
    publicBookingEnabled: true,
    websiteLogoUrl: "/media/logo.png",
    websiteHeroUrl: "/media/hero.jpg",
    heroTitle: "Welcome to Demo Clinic",
    heroSubtitle: "Quality care nearby",
    heroEyebrow: "Community clinic",
    aboutHeading: "About our clinic",
    aboutBody: "We serve families.",
    aboutStoryImageSrc: "/media/about.jpg",
    headerPhone: "+1 555 0100",
    footerTagline: "Care you can trust",
    footerLegal: "Not emergency care.",
    footerShowContact: true,
    seoTitle: "Demo Clinic",
    seoDescription: "Local clinic website",
    seoImageUrl: "/media/og.jpg",
    brandPrimary: "#006068",
    brandAccent: "#0f766e",
    locationPageTitle: "Location & hours",
    locationAddressOverlay: "1 Main St",
    locationHoursOverlay: "Mon–Fri 9–5",
    locationIntro: "Find us downtown",
    doctorsIntro: "Meet our doctors",
    doctorsEmptyHeading: "No doctors yet",
    doctorsEmptyBody: "Publish profiles to list them.",
    servicesIntro: "Our services",
    servicesEmptyHeading: "No services yet",
    servicesEmptyBody: "Publish services to list them.",
    showPricing: true,
    showDoctors: true,
    showPatientInformation: true,
    promoHeading: "Book today",
    promoBody: "Request a visit online.",
    faqHeading: "Questions",
    faq: [{ question: "Do you take walk-ins?", answer: "Please call first." }],
    testimonials: [{ quote: "Great care", attribution: "Alex" }],
    socialFacebookUrl: "https://facebook.com/demo",
    publicPagePaths: {
      about: "/clinics/demo/about",
      services: "/clinics/demo/services",
      doctors: "/clinics/demo/doctors",
      contact: "/clinics/demo/contact",
      location: "/clinics/demo/location",
      book: "/clinics/demo/book",
    },
    websiteContent: {
      "home.logo": { src: "/media/logo.png" },
      "home.hero.title": "Welcome to Demo Clinic",
      "home.hero.subtitle": "Quality care nearby",
      "home.hero.eyebrow": "Community clinic",
      "home.hero.image": { src: "/media/hero.jpg" },
      "about.story.heading": "About our clinic",
      "about.story.body": "We serve families.",
      "about.story.image": { src: "/media/about.jpg" },
      "brand.primary_color": "#006068",
      "brand.accent_color": "#0f766e",
      "contact.phone": "+1 555 0100",
      "contact.email": "hello@demo.example",
      "footer.tagline": "Care you can trust",
      "footer.legal": "Not emergency care.",
      "seo.title": "Demo Clinic",
      "seo.description": "Local clinic website",
      "seo.image": { src: "/media/og.jpg" },
      "seo.canonical_url": "https://demo.example/",
      "seo.robots": "index",
      "seo.sitemap_include": true,
      "site.name": "Demo Clinic",
      "location.hours": "Mon–Fri 9–5",
      "location.address": "1 Main St",
      "book.intro": "Request an appointment",
      "patient.info_title": "Patient information",
      "patient.info_body": "Bring your ID.",
      "pricing.intro": "Self-pay options",
      "nav.about.label": "About",
      "nav.services.label": "Services",
      "nav.doctors.label": "Doctors",
      "nav.contact.label": "Contact",
      "nav.location.label": "Location",
    },
    operational: {
      clinic_name: "Demo Clinic",
      phone: "+1 555 0100",
      email: "hello@demo.example",
      address: "1 Main St",
      hours: "Mon–Fri 9–5",
      booking: true,
    },
  };
}

describe("V2.04 ActiveClinic website presentation adapter", () => {
  it("requires Step 1 + Step 2 and stays unwired to public render/editor mutation", () => {
    assert.equal(adapter.STEP.step1Prerequisite, "PASS");
    assert.equal(adapter.STEP.step2Prerequisite, "PASS");
    assert.equal(adapter.STEP.wiredToPublicRender, false);
    assert.equal(adapter.STEP.wiredToEditorMutation, false);
    assert.equal(presentation.PHASE.step1Prerequisite, "PASS");
    assert.equal(presentation.PHASE.componentLibraryAvailable, true);
    assert.equal(presentation.SHARED_COMPONENT_COUNT, 23);
    assert.equal(presentation.SHARED_EDITOR_ENGINE_COUNT, 1);
  });

  it("does not import DB or visibility domain loaders (platform never queries AC tables)", () => {
    const src = fs.readFileSync(ADAPTER_FILE, "utf8");
    assert.doesNotMatch(src, /activeClinicPublicVisibilityService/);
    assert.doesNotMatch(src, /require\(["'].*repositories/);
    assert.doesNotMatch(src, /\.query\(/);
    assert.match(src, /platform\/website\/presentation/);
    assert.match(src, /wiredToPublicRender: false/);
  });

  it("maps all 18 universal fields from AC content + clinic fallbacks", () => {
    const clinic = sampleClinic();
    const universal = adapter.countMappedUniversalFields(clinic.websiteContent, clinic);
    assert.equal(universal.total, 18);
    assert.equal(universal.count, 18);
    assert.equal(adapter.PRODUCT_CODE, "activeclinic");
  });

  it("adapts doctors to PersonPresentation without leaking clinical domain into platform", () => {
    const person = adapter.adaptActiveClinicDoctorToPerson({
      id: "doc-1",
      staffKey: "ada",
      displayName: "Dr Ada",
      title: "General Practitioner",
      specialty: "Family medicine",
      bio: "Experienced clinician",
      photoUrl: "/media/ada.jpg",
      featured: true,
      profileHref: "/doctors/ada",
      bookingUrl: "/book?doctor=ada",
      qualifications: ["MBBS"],
    });
    assert.equal(person.ok, true);
    assert.equal(person.value.name, "Dr Ada");
    assert.equal(person.value.title, "General Practitioner");
    assert.equal(person.value.subtitle, "Family medicine");
    assert.equal(person.value.sourceDomain, "doctor");
    assert.equal(person.value.sourceProduct, "activeclinic");
    assert.equal(person.value.cta.label, "View Profile");
    assert.equal(person.value.secondaryCta.label, "Book Appointment");
    assert.equal(person.value.badges[0].label, "MBBS");
    assert.equal(person.value.mediaVariant, "portrait");

    const html = presentation.renderPresentationComponent("person_card", person.value);
    assert.equal(html.ok, true);
    assert.match(html.html, /Dr Ada/);
    assert.match(html.html, /View Profile/);
    assert.match(html.html, /Book Appointment/);
    assert.doesNotMatch(html.html, /staff_members|public_profile_enabled/i);
  });

  it("adapts services to CollectionPresentation offering cards", () => {
    const card = adapter.adaptActiveClinicServiceToCard({
      id: "svc-1",
      serviceKey: "dental",
      displayName: "Dental",
      summary: "Dental care",
      iconUrl: "/media/dental.png",
      detailHref: "/services/dental",
      bookingUrl: "/book?service=dental",
    });
    assert.equal(card.ok, true);
    assert.equal(card.value.title, "Dental");
    assert.equal(card.value.sourceDomain, "clinical_service");
    assert.equal(card.value.mediaVariant, "icon");
    assert.equal(card.value.secondaryCta.label, "Book");

    const collection = adapter.adaptActiveClinicServicesCollection({
      clinic: sampleClinic(),
      services: [
        { id: "1", displayName: "Dental", summary: "Teeth", iconUrl: "/i.svg" },
        { id: "2", displayName: "Physio", summary: "Rehab" },
      ],
    });
    assert.equal(collection.ok, true);
    assert.equal(collection.value.items.length, 2);
    assert.equal(collection.value.cardKind, "offering");
    assert.equal(collection.value.items[0].mediaVariant, "icon");
  });

  it("builds full presentation bundle with shareable collections and preserved product fields", () => {
    const clinic = sampleClinic();
    const bundle = adapter.buildActiveClinicWebsitePresentation({
      clinic,
      doctors: [
        {
          id: "d1",
          staffKey: "ada",
          displayName: "Dr Ada",
          title: "GP",
          bio: "Bio",
          photoUrl: "/a.jpg",
        },
      ],
      services: [{ id: "s1", serviceKey: "dental", displayName: "Dental", summary: "Care" }],
    });

    assert.equal(bundle.ok, true, JSON.stringify(bundle.failed));
    assert.equal(bundle.wiredToPublicRender, false);
    assert.equal(bundle.wiredToEditorMutation, false);
    assert.equal(bundle.step.id, "v2_04_overnight_step_3");
    assert.equal(bundle.metrics.universalFieldsMapped, 18);
    assert.ok(bundle.metrics.collectionsAdapted >= 5);
    assert.equal(bundle.metrics.doctorPersonAdapter, true);
    assert.equal(bundle.metrics.serviceCollectionAdapter, true);
    assert.ok(bundle.metrics.productSpecificFieldsPreserved >= 3);
    assert.ok(Object.prototype.hasOwnProperty.call(bundle.productSpecific, "book.intro"));
    assert.ok(Object.prototype.hasOwnProperty.call(bundle.productSpecific, "patient.info_body"));
    assert.equal(bundle.productSpecific.__domain.bookingEnabled, true);
    assert.equal(bundle.productSpecific.__domain.doctorsDomain, "doctor");
    assert.equal(bundle.productSpecific.__domain.servicesDomain, "clinical_service");

    assert.equal(bundle.components.hero.ok, true);
    assert.equal(bundle.components.branding.ok, true);
    assert.equal(bundle.components.about.ok, true);
    assert.equal(bundle.components.contact.ok, true);
    assert.equal(bundle.components.hours.ok, true);
    assert.equal(bundle.components.location.ok, true);
    assert.equal(bundle.components.navigation.ok, true);
    assert.equal(bundle.components.seo.ok, true);
    assert.equal(bundle.components.footer.ok, true);
    assert.equal(bundle.components.social.ok, true);
    assert.equal(bundle.components.gallery.ok, true);
    assert.equal(bundle.collections.doctors.value.items[0].name, "Dr Ada");
    assert.equal(bundle.collections.services.value.items[0].title, "Dental");
    assert.equal(bundle.collections.faq.value.items[0].title, "Do you take walk-ins?");
    assert.equal(bundle.collections.testimonials.value.items[0].description, "Great care");
  });

  it("adapts gallery rows into shared gallery presentation without querying media tables", () => {
    const gallery = adapter.adaptActiveClinicGallery({
      clinic: sampleClinic(),
      gallery: [
        { image: { src: "/g1.jpg" }, caption: "Lobby" },
        { src: "/g2.jpg", alt: "Reception" },
      ],
    });
    assert.equal(gallery.ok, true, gallery.code);
    assert.equal(gallery.value.items.length, 2);
    const html = presentation.renderPresentationComponent("gallery", gallery.value);
    assert.equal(html.ok, true);
    assert.match(html.html, /Lobby/);
  });

  it("keeps doctor/pastor domain boundary intact", () => {
    assert.equal(presentation.assertDomainBoundary("doctor", "pastor_leader").ok, false);
    assert.equal(presentation.assertDomainBoundary("clinical_service", "ministry").ok, false);
  });

  it("does not alter live AC public templates (visual regression guard)", () => {
    const doctors = fs.readFileSync(path.join(ROOT, "views/activeclinic/tenant/doctors.ejs"), "utf8");
    const home = fs.readFileSync(path.join(ROOT, "views/activeclinic/tenant/home.ejs"), "utf8");
    assert.doesNotMatch(doctors, /activeClinicWebsitePresentationAdapter/);
    assert.doesNotMatch(home, /buildActiveClinicWebsitePresentation/);
    assert.doesNotMatch(home, /platform\/website\/components\/hero/);
  });

  it("preserves the single WE01 editor engine (editor regression guard)", () => {
    const inlineEdit = path.join(ROOT, "public/platform/website-inline-edit.js");
    assert.ok(fs.existsSync(inlineEdit));
    assert.equal(presentation.SHARED_EDITOR_ENGINE_COUNT, 1);
    const editorAdapter = fs.readFileSync(
      path.join(ROOT, "src/activeclinic/website/activeClinicWebsiteEditorAdapter.js"),
      "utf8"
    );
    assert.doesNotMatch(editorAdapter, /buildActiveClinicWebsitePresentation/);
    assert.doesNotMatch(fs.readFileSync(ADAPTER_FILE, "utf8"), /website-inline-edit\.js/);
  });

  it("does not modify BlessBoard website sources", () => {
    const adapterDir = fs.readdirSync(path.join(ROOT, "src/activeclinic/website"));
    assert.ok(adapterDir.includes("activeClinicWebsitePresentationAdapter.js"));
    const bbWebsite = path.join(ROOT, "src/blessboard/website");
    if (fs.existsSync(bbWebsite)) {
      const names = fs.readdirSync(bbWebsite);
      assert.ok(!names.includes("blessboardWebsitePresentationAdapter.js"));
    }
  });
});
