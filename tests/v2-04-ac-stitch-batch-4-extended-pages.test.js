"use strict";

/**
 * V2.04 Batch 4 — AC Stitch extended public pages R09–R12.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const mediaContract = require("../src/platform/website/websiteMediaEditingContract");
const adapter = require("../src/activeclinic/website/activeClinicWebsitePresentationAdapter");
const {
  buildActiveClinicStitchPublicPage,
  isStitchPublicTemplate,
  isGalleryPageSlug,
  WIRED_TEMPLATES,
} = require("../src/activeclinic/website/activeClinicStitchPublicPages");

const ROOT = path.join(__dirname, "..");

function sampleClinic() {
  return {
    clinicKey: "demo-clinic",
    publicName: "Demo Clinic",
    publicBookingEnabled: true,
    publicPhoneDisplay: "+1 555 0100",
    publicEmailDisplay: "care@demo.example",
    locationEyebrow: "Visit us",
    locationPageTitle: "Facilities & clinic info",
    locationIntro: "Published facility addresses and hours.",
    locationDirectionsNote: "Blue gate opposite the filling station",
    locationAddressOverlay: "Blue gate opposite the filling station",
    locationHoursOverlay: "Mon–Fri 8:00–18:00",
    galleryHeading: "Clinic environment",
    patientInformationTitle: "Patient information",
    patientInformationBody: "Please bring a valid identity document when the clinic requests it.",
    facilities: [
      {
        facilityKey: "main",
        displayName: "Main campus",
        isPrimary: true,
        addressLine1: "1 Medical Arts Tower",
        city: "Lusaka",
        countryCode: "ZM",
        phoneDisplay: "+260 211 000000",
        publicHours: { Mon: "08:00–18:00" },
      },
    ],
    gallery: [
      { image: { src: "/clinics/demo-clinic/website/media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, caption: "Lobby" },
      { src: "/clinics/demo-clinic/website/media/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", caption: "Waiting area" },
    ],
    services: [
      { id: "s1", serviceKey: "dental", displayName: "Dental", summary: "Dental care" },
    ],
    websiteContent: {
      "patient.checklist": ["Arrive 10 minutes early", "Bring your insurance card if you have one"],
      "patient.faq": [{ question: "Do I need a referral?", answer: "Only when your insurer requires one." }],
      "patient.announcement": { title: "Hours notice", body: "Reception closes at 17:30 on Fridays." },
    },
    publicPagePaths: {
      home: "/clinics/demo-clinic",
      location: "/clinics/demo-clinic/location",
      contact: "/clinics/demo-clinic/contact",
      book: "/clinics/demo-clinic/book",
      patientInformation: "/clinics/demo-clinic/patient-information",
      gallery: "/clinics/demo-clinic/p/gallery",
    },
  };
}

describe("V2.04 AC Stitch Batch 4 extended public pages", () => {
  it("wires R09–R12 templates and keeps shared upload engine singular", () => {
    assert.equal(isStitchPublicTemplate("tenant/location"), true);
    assert.equal(isStitchPublicTemplate("tenant/gallery"), true);
    assert.equal(isStitchPublicTemplate("tenant/patient-information"), true);
    assert.equal(isStitchPublicTemplate("tenant/custom-page"), true);
    assert.equal(WIRED_TEMPLATES["tenant/location"], "R09");
    assert.equal(WIRED_TEMPLATES["tenant/gallery"], "R10");
    assert.equal(WIRED_TEMPLATES["tenant/patient-information"], "R11");
    assert.equal(WIRED_TEMPLATES["tenant/custom-page"], "R12");
    assert.ok(adapter.STEP.wiredPublicScreens.includes("R09"));
    assert.ok(adapter.STEP.wiredPublicScreens.includes("R12"));
    assert.equal(mediaContract.SHARED_UPLOAD_ENGINE_COUNT, 1);
    assert.match(mediaContract.SHARED_UPLOAD_ENGINE, /mediaService\.registerWebsiteMedia/);
    assert.equal(isGalleryPageSlug("gallery"), true);
    assert.equal(isGalleryPageSlug("clinic-environment"), true);
    assert.equal(isGalleryPageSlug("about"), false);
  });

  it("R09 facilities page reuses canonical facility data + shared location/hours/contact", () => {
    const clinic = sampleClinic();
    const page = buildActiveClinicStitchPublicPage({
      template: "tenant/location",
      clinic,
      services: clinic.services,
      gallery: clinic.gallery,
    });
    assert.equal(page.screenId, "R09");
    assert.match(page.html.header, /Facilities &amp; clinic info|Facilities & clinic info/);
    assert.match(page.html.facilities, /data-gp-website-component="data_list"/);
    assert.match(page.html.facilities, /1 Medical Arts Tower/);
    assert.match(page.html.location, /1 Medical Arts Tower/);
    assert.match(page.html.contact, /\+1 555 0100/);
    assert.match(page.html.hours, /Mon–Fri 8:00–18:00|Opening hours|Hours/);
    assert.match(page.html.gallery, /data-gp-website-component="gallery"/);
    assert.match(page.html.services, /Dental/);
    const tpl = fs.readFileSync(path.join(ROOT, "views/activeclinic/tenant/location.ejs"), "utf8");
    assert.match(tpl, /data-ac-facility-address="1"/);
    assert.match(tpl, /data-ac-stitch-screen="R09"/);
  });

  it("R10 gallery uses shared gallery component and website media paths", () => {
    const clinic = sampleClinic();
    const page = buildActiveClinicStitchPublicPage({
      template: "tenant/gallery",
      clinic,
      gallery: clinic.gallery,
    });
    assert.equal(page.screenId, "R10");
    assert.match(page.html.gallery, /data-gp-website-component="gallery"/);
    assert.match(page.html.gallery, /Lobby/);
    assert.match(page.html.gallery, /\/website\/media\//);
    assert.doesNotMatch(page.html.gallery, /registerWebsiteMedia|uploadEngine/);
    const routes = fs.readFileSync(
      path.join(ROOT, "src/activeclinic/http/activeClinicPublicRoutes.js"),
      "utf8"
    );
    assert.match(routes, /isGalleryPageSlug/);
    assert.doesNotMatch(routes, /acGalleryUpload|createActiveClinicGalleryEngine/);
  });

  it("R11 patient guidance composes optional shared components without Stitch sample hard-coding", () => {
    const clinic = sampleClinic();
    const page = buildActiveClinicStitchPublicPage({
      template: "tenant/patient-information",
      clinic,
    });
    assert.equal(page.screenId, "R11");
    assert.match(page.html.header, /Patient information/);
    assert.match(page.html.body, /data-gp-website-component="rich_text"/);
    assert.match(page.html.body, /valid identity document/);
    assert.match(page.html.checklist, /data-gp-website-component="data_list"/);
    assert.match(page.html.checklist, /Arrive 10 minutes early/);
    assert.match(page.html.faq, /data-gp-website-component="faq_list"/);
    assert.match(page.html.faq, /<details/);
    assert.match(page.html.faq, /Do I need a referral\?/);
    assert.match(page.html.announcement, /data-gp-website-component="announcement"/);
    assert.match(page.html.cta, /Book Appointment/);
    assert.doesNotMatch(JSON.stringify(page.html), /Bring your Medicare card and referral letter from Stitch/i);
  });

  it("R11 does not invent checklist/FAQ when product content is absent", () => {
    const clinic = {
      ...sampleClinic(),
      websiteContent: {},
      patientInformationBody: "Clinic-specific guidance only.",
    };
    const page = buildActiveClinicStitchPublicPage({
      template: "tenant/patient-information",
      clinic,
    });
    assert.match(page.html.body, /Clinic-specific guidance only/);
    assert.equal(page.html.checklist, "");
    assert.equal(page.html.faq, "");
    assert.equal(page.html.announcement, "");
  });

  it("R12 modular page composes shared components from CMS blocks (no R12 framework)", () => {
    const clinic = sampleClinic();
    const page = buildActiveClinicStitchPublicPage({
      template: "tenant/custom-page",
      clinic,
      customPage: {
        id: "p1",
        slug: "wellness",
        title: "Wellness guidance",
        summary: "Practical visit tips",
      },
      pageBlocks: [
        { type: "text", heading: "What to expect", body: "Arrive a little early." },
        {
          type: "image",
          heading: "Reception",
          image: { src: "/clinics/demo-clinic/website/media/cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
        },
        { type: "buttons", button_label: "Contact us", button_url: "/clinics/demo-clinic/contact" },
        { type: "video", heading: "Tour", video_url: "https://example.com/tour" },
      ],
    });
    assert.equal(page.screenId, "R12");
    assert.ok(Array.isArray(page.html.modules));
    assert.ok(page.html.modules.length >= 3);
    const blob = page.html.modules.map((m) => m.html).join("\n");
    assert.match(blob, /data-gp-website-component="hero"|data-gp-website-component="rich_text"/);
    assert.match(blob, /data-gp-website-component="gallery"|data-gp-website-component="cta"/);
    assert.match(blob, /data-gp-website-component="video"/);
    assert.doesNotMatch(blob, /"type":\s*"text"/);
    const tpl = fs.readFileSync(path.join(ROOT, "views/activeclinic/tenant/custom-page.ejs"), "utf8");
    assert.match(tpl, /data-ac-modular-page="1"/);
    assert.match(tpl, /data-ac-stitch-screen="R12"/);
    assert.doesNotMatch(tpl, /r12-framework|ac-modular-engine/);
  });

  it("desktop/mobile share one implementation and avoid horizontal overflow chrome", () => {
    const files = [
      "views/activeclinic/tenant/location.ejs",
      "views/activeclinic/tenant/gallery.ejs",
      "views/activeclinic/tenant/patient-information.ejs",
      "views/activeclinic/tenant/custom-page.ejs",
      "public/activeclinic/ac-stitch-public.css",
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      assert.doesNotMatch(src, /mobile-only-template|desktop-only-template/);
    }
    const css = fs.readFileSync(path.join(ROOT, "public/activeclinic/ac-stitch-public.css"), "utf8");
    assert.match(css, /ac-stitch-page--r09/);
    assert.match(css, /ac-stitch-page--r12/);
    assert.match(css, /overflow-x:\s*clip/);
    assert.match(css, /@media \(max-width: 390px\)/);
  });
});
