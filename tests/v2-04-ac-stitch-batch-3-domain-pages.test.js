"use strict";

/**
 * V2.04 Batch 3 — AC Stitch domain public pages R04–R08.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const adapter = require("../src/activeclinic/website/activeClinicWebsitePresentationAdapter");
const {
  buildActiveClinicStitchPublicPage,
  isStitchPublicTemplate,
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
    doctorsPageTitle: "Meet Our Doctors",
    doctorsIntro: "Published clinicians only.",
    contactPageTitle: "Contact Demo Clinic",
    contactIntro: "Send a message during business hours.",
    contactEyebrow: "Contact",
    bookIntro: "Choose the care you need.",
    locationHoursOverlay: "Mon–Fri 8:00–18:00",
    locationAddressOverlay: "Blue gate opposite the filling station",
    locationDirectionsNote: "Blue gate opposite the filling station",
    facilities: [
      {
        isPrimary: true,
        addressLine1: "1 Medical Arts Tower",
        city: "Lusaka",
        countryCode: "ZM",
        publicHours: { Mon: "08:00–18:00" },
      },
    ],
    publicPagePaths: {
      home: "/clinics/demo-clinic",
      about: "/clinics/demo-clinic/about",
      services: "/clinics/demo-clinic/services",
      doctors: "/clinics/demo-clinic/doctors",
      contact: "/clinics/demo-clinic/contact",
      location: "/clinics/demo-clinic/location",
      book: "/clinics/demo-clinic/book",
      pricing: "/clinics/demo-clinic/pricing",
    },
    websiteContent: {},
    doctors: [
      {
        id: "d1",
        staffKey: "ada",
        displayName: "Dr Ada",
        title: "GP",
        specialty: "Family medicine",
        bio: "Experienced clinician",
        photoUrl: "/media/ada.jpg",
      },
    ],
    services: [
      {
        id: "s1",
        serviceKey: "dental",
        displayName: "Dental",
        summary: "Dental care",
        body: "Comprehensive dental assessments.",
        bookable: true,
      },
    ],
  };
}

describe("V2.04 AC Stitch Batch 3 domain public pages", () => {
  it("wires R04–R08 templates alongside R01–R03", () => {
    assert.equal(isStitchPublicTemplate("tenant/doctors"), true);
    assert.equal(isStitchPublicTemplate("tenant/doctor-profile"), true);
    assert.equal(isStitchPublicTemplate("tenant/service-detail"), true);
    assert.equal(isStitchPublicTemplate("tenant/contact"), true);
    assert.equal(isStitchPublicTemplate("booking/consultation-type"), true);
    assert.equal(WIRED_TEMPLATES["tenant/doctors"], "R04");
    assert.equal(WIRED_TEMPLATES["booking/consultation-type"], "R08");
    assert.deepEqual(adapter.STEP.wiredPublicScreens, [
      "R01",
      "R02",
      "R03",
      "R04",
      "R05",
      "R06",
      "R07",
      "R08",
    ]);
  });

  it("R04 doctors list uses PersonPresentation grid from AC doctor domain", () => {
    const clinic = sampleClinic();
    const page = buildActiveClinicStitchPublicPage({
      template: "tenant/doctors",
      clinic,
      doctors: clinic.doctors,
    });
    assert.equal(page.ok, true);
    assert.equal(page.screenId, "R04");
    assert.match(page.html.header, /Meet Our Doctors/);
    assert.match(page.html.doctors, /data-gp-website-component="person_grid"/);
    assert.match(page.html.doctors, /Dr Ada/);
    assert.match(page.html.doctors, /\/clinics\/demo-clinic\/doctors\/ada/);
    assert.doesNotMatch(page.html.doctors, /MD FRCS|Board Certified|Fake Specialty/);
    assert.equal(page.html.empty, "");
  });

  it("R05 doctor profile reuses PersonPresentation without inventing credentials", () => {
    const clinic = sampleClinic();
    const profile = clinic.doctors[0];
    const page = buildActiveClinicStitchPublicPage({
      template: "tenant/doctor-profile",
      clinic,
      profile,
    });
    assert.equal(page.screenId, "R05");
    assert.match(page.html.person, /data-gp-website-component="person_card"/);
    assert.match(page.html.person, /Dr Ada/);
    assert.match(page.html.person, /Experienced clinician/);
    assert.match(page.html.person, /\/clinics\/demo-clinic\/book\?doctor=ada/);
    assert.doesNotMatch(page.html.person, /Board Certified|invented|MD FRCS/);
    assert.doesNotMatch(page.html.person, /gp-website-pc__badge/);
  });

  it("R06 service detail uses collection presentation from existing service row", () => {
    const clinic = sampleClinic();
    const service = clinic.services[0];
    const page = buildActiveClinicStitchPublicPage({
      template: "tenant/service-detail",
      clinic,
      service,
      serviceKind: "consultation",
    });
    assert.equal(page.screenId, "R06");
    assert.match(page.html.header, /Dental/);
    assert.match(page.html.service, /data-gp-website-component="collection_card"/);
    assert.match(page.html.service, /Comprehensive dental assessments|Dental care/);
    assert.match(page.html.cta, /\/clinics\/demo-clinic\/book\?service=dental/);
  });

  it("R07 contact prefers canonical facility address over directions overlay", () => {
    const clinic = sampleClinic();
    const page = buildActiveClinicStitchPublicPage({
      template: "tenant/contact",
      clinic,
    });
    assert.equal(page.screenId, "R07");
    assert.match(page.html.header, /Contact Demo Clinic/);
    assert.match(page.html.contact, /data-gp-website-component="contact"/);
    assert.match(page.html.contact, /\+1 555 0100/);
    assert.match(page.html.contact, /care@demo\.example/);
    assert.match(page.html.contact, /1 Medical Arts Tower/);
    assert.doesNotMatch(page.html.contact, /Blue gate opposite the filling station/);
    assert.match(page.html.location, /1 Medical Arts Tower/);
    assert.match(page.html.location, /Blue gate opposite the filling station/);
  });

  it("R08 booking entry is presentation chrome only into existing book route", () => {
    const clinic = sampleClinic();
    const page = buildActiveClinicStitchPublicPage({
      template: "booking/consultation-type",
      clinic,
      services: clinic.services,
    });
    assert.equal(page.screenId, "R08");
    assert.match(page.html.header, /Select service/);
    assert.match(page.html.header, /Choose the care you need/);
    assert.match(page.html.cta, /\/clinics\/demo-clinic\/contact/);
    const bookingTpl = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/booking/consultation-type.ejs"),
      "utf8"
    );
    assert.match(bookingTpl, /action="\/clinics\/<%= clinic\.clinicKey %>\/book"/);
    assert.match(bookingTpl, /data-ac-stitch-screen="R08"/);
    assert.doesNotMatch(bookingTpl, /createBookingEngine|new booking engine/i);
    const bookingRoutes = fs.readFileSync(
      path.join(ROOT, "src/activeclinic/http/activeClinicPublicBookingRoutes.js"),
      "utf8"
    );
    assert.match(bookingRoutes, /withBookingEntryPresentation/);
    assert.match(bookingRoutes, /buildActiveClinicStitchPublicPage/);
  });

  it("desktop/mobile share one implementation per logical page", () => {
    const files = [
      "views/activeclinic/tenant/doctors.ejs",
      "views/activeclinic/tenant/doctor-profile.ejs",
      "views/activeclinic/tenant/service-detail.ejs",
      "views/activeclinic/tenant/contact.ejs",
      "views/activeclinic/booking/consultation-type.ejs",
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      assert.doesNotMatch(src, /ac-stitch-page--mobile-only|desktop-only-template/);
      assert.match(src, /websitePresentation/);
    }
    const css = fs.readFileSync(path.join(ROOT, "public/activeclinic/ac-stitch-public.css"), "utf8");
    assert.match(css, /ac-stitch-page--r04/);
    assert.match(css, /ac-stitch-page--r08/);
    assert.match(css, /overflow-x:\s*clip/);
  });

  it("does not invent fake clinical data in page builder outputs", () => {
    const clinic = {
      ...sampleClinic(),
      doctors: [{ id: "d2", staffKey: "bea", displayName: "Dr Bea", title: null, specialty: null, bio: null }],
      services: [{ id: "s2", serviceKey: "gp", displayName: "GP visit", summary: null }],
      facilities: [],
      locationAddressOverlay: "Landmark only",
      publicPhoneDisplay: null,
      publicEmailDisplay: null,
    };
    const doctorsPage = buildActiveClinicStitchPublicPage({
      template: "tenant/doctors",
      clinic,
      doctors: clinic.doctors,
    });
    assert.match(doctorsPage.html.doctors, /Dr Bea/);
    assert.doesNotMatch(doctorsPage.html.doctors, /Cardiology|MRCP|15 years/);

    const profilePage = buildActiveClinicStitchPublicPage({
      template: "tenant/doctor-profile",
      clinic,
      profile: clinic.doctors[0],
    });
    assert.doesNotMatch(profilePage.html.person, /MRCP|invented schedule|Mon–Fri clinic roster/);

    const contactPage = buildActiveClinicStitchPublicPage({
      template: "tenant/contact",
      clinic,
    });
    assert.doesNotMatch(contactPage.html.contact || "", /1 Medical Arts Tower/);
    // Directions overlay must not become facility address substitute.
    if (contactPage.html.location) {
      assert.doesNotMatch(
        contactPage.html.location.replace(/Landmark only/g, ""),
        /data-gp-website-component="location"[\s\S]*Landmark only[\s\S]*<\/p>\s*<p class="gp-website-pc__body">Landmark only/
      );
    }
  });
});
