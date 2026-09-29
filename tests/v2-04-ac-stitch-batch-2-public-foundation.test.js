"use strict";

/**
 * V2.04 Batch 2 — AC Stitch public foundation R01–R03.
 * Focused presentation + template wiring tests (no DB required for core page builder).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const presentation = require("../src/platform/website/presentation");
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
    websiteDisplayName: "Demo Clinic",
    publicBookingEnabled: true,
    publicPhoneDisplay: "+1 555 0100",
    publicEmailDisplay: "care@demo.example",
    websiteTagline: "Community care",
    heroEyebrow: "Accredited care",
    heroTitle: "Healthcare that puts you first",
    heroSubtitle: "Compassionate medicine for our community.",
    websiteHeroUrl: "/media/hero.jpg",
    aboutHeading: "About Demo Clinic",
    aboutBody: "We provide primary and specialty care.",
    aboutStoryImageSrc: "/media/about.jpg",
    aboutEyebrow: "Our story",
    servicesPageTitle: "Our Services",
    servicesIntro: "Care designed around patients.",
    homePreviewServicesHeading: "Our Services",
    homePreviewDoctorsHeading: "Meet Our Doctors",
    locationHoursOverlay: "Mon–Fri 8:00–18:00",
    locationAddressOverlay: "1 Medical Arts Tower",
    locationDirectionsNote: "Level 3",
    faqHeading: "Questions",
    faq: [{ question: "Do you take walk-ins?", answer: "Yes, when capacity allows." }],
    showFaq: true,
    showPromo: true,
    promoHeading: "Plan your visit",
    promoBody: "Book online in minutes.",
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
    websiteContent: {
      "home.hero.title": "Healthcare that puts you first",
      "about.story.body": "We provide primary and specialty care.",
      "contact.phone": "+1 555 0100",
    },
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
        iconUrl: "/icons/dental.svg",
      },
      {
        id: "s2",
        serviceKey: "physio",
        displayName: "Physiotherapy",
        summary: "Rehab support",
      },
    ],
  };
}

describe("V2.04 AC Stitch Batch 2 public foundation", () => {
  it("wires R01–R08 templates", () => {
    assert.equal(isStitchPublicTemplate("tenant/home"), true);
    assert.equal(isStitchPublicTemplate("tenant/about"), true);
    assert.equal(isStitchPublicTemplate("tenant/services"), true);
    assert.equal(isStitchPublicTemplate("tenant/doctors"), true);
    assert.equal(isStitchPublicTemplate("tenant/doctor-profile"), true);
    assert.equal(isStitchPublicTemplate("tenant/service-detail"), true);
    assert.equal(isStitchPublicTemplate("tenant/contact"), true);
    assert.equal(isStitchPublicTemplate("booking/consultation-type"), true);
    assert.deepEqual(Object.values(WIRED_TEMPLATES).sort(), [
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

  it("R01 homepage renders shared hero, trust, services, doctors, CTA from domain data", () => {
    const clinic = sampleClinic();
    const page = buildActiveClinicStitchPublicPage({
      template: "tenant/home",
      clinic,
      doctors: clinic.doctors,
      services: clinic.services,
      websiteEdit: false,
    });
    assert.equal(page.ok, true);
    assert.equal(page.screenId, "R01");
    assert.match(page.html.hero, /data-gp-website-component="hero"/);
    assert.match(page.html.hero, /Healthcare that puts you first/);
    assert.match(page.html.hero, /Book Appointment/);
    assert.match(page.html.trust, /data-gp-website-component="fact_strip"/);
    assert.match(page.html.trust, /Opening hours|Reception|Location/);
    assert.match(page.html.services, /data-gp-website-component="collection_grid"/);
    assert.match(page.html.services, /Dental/);
    assert.match(page.html.doctors, /data-gp-website-component="person_grid"/);
    assert.match(page.html.doctors, /Dr Ada/);
    assert.match(page.html.conversion, /data-gp-website-component="cta"/);
    assert.match(page.html.faq, /Do you take walk-ins\?/);
    assert.doesNotMatch(page.html.hero, /15\+ Years|Sydney NSW|Emergency Direct Dial: 000/);
    assert.ok(page.metrics.sharedComponentsUsed >= 5);
  });

  it("R01 keeps WE01 editable keys when websiteEdit is enabled", () => {
    const clinic = sampleClinic();
    const page = buildActiveClinicStitchPublicPage({
      template: "tenant/home",
      clinic,
      doctors: clinic.doctors,
      services: clinic.services,
      websiteEdit: true,
    });
    assert.match(page.html.hero, /data-website-inline="1"/);
    assert.match(page.html.hero, /data-website-key="home\.hero\.title"/);
    assert.match(page.html.about, /data-website-key="about\.story\.heading"|data-website-key="about\.story\.body"/);
  });

  it("R02 about uses image_text / mission strip only when data exists", () => {
    const clinic = sampleClinic();
    const page = buildActiveClinicStitchPublicPage({
      template: "tenant/about",
      clinic,
      websiteEdit: false,
    });
    assert.equal(page.screenId, "R02");
    assert.match(page.html.header, /data-gp-website-component="section_header"/);
    assert.match(page.html.story, /data-gp-website-component="image_text"/);
    assert.match(page.html.story, /We provide primary and specialty care/);
    assert.equal(page.html.mission, "");
    assert.match(page.html.cta, /data-gp-website-component="cta"/);

    const withMission = buildActiveClinicStitchPublicPage({
      template: "tenant/about",
      clinic: {
        ...clinic,
        websiteContent: {
          ...clinic.websiteContent,
          "about.mission": "Serve with compassion",
          "about.vision": "Healthy communities",
        },
      },
    });
    assert.match(withMission.html.mission, /Mission/);
    assert.match(withMission.html.mission, /Serve with compassion/);
  });

  it("R03 services reuses AC catalogue via collection presentation", () => {
    const clinic = sampleClinic();
    const page = buildActiveClinicStitchPublicPage({
      template: "tenant/services",
      clinic,
      services: clinic.services,
      procedures: [
        {
          id: "p1",
          procedureKey: "xray",
          displayName: "X-Ray",
          summary: "Imaging",
        },
      ],
    });
    assert.equal(page.screenId, "R03");
    assert.match(page.html.header, /Our Services/);
    assert.match(page.html.services, /Dental/);
    assert.match(page.html.services, /Physiotherapy/);
    assert.match(page.html.services, /data-gp-media-variant="icon"/);
    assert.match(page.html.procedures, /X-Ray/);
    assert.match(page.html.cta, /Book Appointment/);
    assert.equal(page.metrics.servicesCount, 2);
    assert.equal(page.metrics.proceduresCount, 1);
  });

  it("does not invent demo medical credentials or hard-coded Stitch copy", () => {
    const bare = buildActiveClinicStitchPublicPage({
      template: "tenant/home",
      clinic: {
        clinicKey: "bare",
        publicName: "Bare Clinic",
        publicBookingEnabled: false,
        publicPagePaths: { book: "/clinics/bare/book", contact: "/clinics/bare/contact" },
        doctors: [],
        services: [],
      },
    });
    const blob = JSON.stringify(bare.html);
    assert.doesNotMatch(blob, /MBBS|MRCGP|Board-certified|Emergency Direct Dial/);
    assert.match(bare.html.hero, /Request Appointment|Contact the clinic/);
  });

  it("desktop/mobile share one implementation (no mobile-only templates)", () => {
    assert.equal(fs.existsSync(path.join(ROOT, "views/activeclinic/tenant/home-mobile.ejs")), false);
    assert.equal(fs.existsSync(path.join(ROOT, "views/activeclinic/tenant/about-mobile.ejs")), false);
    assert.equal(fs.existsSync(path.join(ROOT, "views/activeclinic/tenant/services-mobile.ejs")), false);
    const css = fs.readFileSync(path.join(ROOT, "public/activeclinic/ac-stitch-public.css"), "utf8");
    assert.match(css, /@media \(max-width:\s*390px\)/);
    assert.doesNotMatch(css, /#006068|#6[cC]5[cC][eE]7/);
    assert.equal(presentation.findThemeTokenLeaks(css, "activeclinic").length, 0);
  });

  it("shell loads presentation CSS + bridge for tenant public pages", () => {
    const shell = fs.readFileSync(path.join(ROOT, "views/activeclinic/layouts/public-shell.ejs"), "utf8");
    assert.match(shell, /website-presentation-token-bridge\.css/);
    assert.match(shell, /website-presentation-components\.css/);
    assert.match(shell, /ac-stitch-public\.css/);
  });

  it("routes prefer existing public paths and keep singular engines", () => {
    const routes = fs.readFileSync(
      path.join(ROOT, "src/activeclinic/http/activeClinicPublicRoutes.js"),
      "utf8"
    );
    assert.match(routes, /buildActiveClinicStitchPublicPage/);
    assert.match(routes, /\/clinics\/:clinicKey\/about/);
    assert.match(routes, /\/clinics\/:clinicKey\/services/);
    assert.doesNotMatch(routes, /\/clinics\/:clinicKey\/stitch-home/);
    assert.equal(presentation.SHARED_EDITOR_ENGINE_COUNT, 1);
    assert.equal(adapter.STEP.wiredToEditorMutation, false);
  });

  it("keeps BB shared person/collection rendering intact", () => {
    const pastor = presentation.adaptLeaderToPersonPresentation({
      id: "L1",
      displayName: "Pastor Jane",
      roleTitle: "Lead Pastor",
      biography: "Serves the church",
    });
    const html = presentation.renderPresentationComponent("person_card", pastor.value);
    assert.equal(html.ok, true);
    assert.match(html.html, /Pastor Jane/);
    assert.match(html.html, /data-gp-source-domain="pastor_leader"/);
  });
});
