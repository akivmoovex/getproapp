"use strict";

/**
 * V2.04 Batch 5 — AC Stitch inline editor E01/E02.
 * Asserts singular WE01 + media engines, public component edit parity, concurrency gates.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const presentation = require("../src/platform/website/presentation");
const mediaContract = require("../src/platform/website/websiteMediaEditingContract");
const { INLINE_SAVE_PUBLISHES } = require("../src/platform/website/inlineEditorContract");
const adapter = require("../src/activeclinic/website/activeClinicWebsitePresentationAdapter");
const {
  buildActiveClinicStitchPublicPage,
  EDIT_KEYS,
} = require("../src/activeclinic/website/activeClinicStitchPublicPages");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function sampleClinic() {
  return {
    clinicKey: "demo-clinic",
    publicName: "Demo Clinic",
    publicBookingEnabled: true,
    publicPhoneDisplay: "+1 555 0100",
    publicEmailDisplay: "care@demo.example",
    heroTitle: "Healthcare that puts you first",
    heroSubtitle: "Compassionate medicine.",
    websiteHeroUrl: "/media/hero.jpg",
    aboutHeading: "About Demo Clinic",
    aboutBody: "We provide primary care.",
    aboutStoryImageSrc: "/media/about.jpg",
    showPromo: true,
    promoHeading: "Plan your visit",
    promoBody: "Book online.",
    locationHoursOverlay: "Mon–Fri 8:00–18:00",
    locationAddressOverlay: "Blue gate",
    facilities: [
      {
        isPrimary: true,
        addressLine1: "1 Medical Arts Tower",
        city: "Lusaka",
      },
    ],
    doctors: [
      {
        id: "d1",
        staffKey: "ada",
        displayName: "Dr Ada",
        title: "GP",
        specialty: "Family medicine",
        photoUrl: "/media/ada.jpg",
      },
    ],
    services: [
      {
        id: "s1",
        serviceKey: "dental",
        displayName: "Dental",
        summary: "Dental care",
      },
    ],
    publicPagePaths: {
      home: "/clinics/demo-clinic",
      book: "/clinics/demo-clinic/book",
      contact: "/clinics/demo-clinic/contact",
      location: "/clinics/demo-clinic/location",
      services: "/clinics/demo-clinic/services",
      doctors: "/clinics/demo-clinic/doctors",
    },
    websiteContent: {
      "contact.phone": "+1 555 0100",
      "contact.email": "care@demo.example",
    },
  };
}

describe("V2.04 AC Stitch Batch 5 inline editor E01–E02", () => {
  it("keeps singular shared editor and upload engines", () => {
    assert.equal(presentation.SHARED_EDITOR_ENGINE_COUNT, 1);
    assert.equal(presentation.SHARED_EDITOR_ENGINE_PATH, "/platform/website-inline-edit.js");
    assert.equal(mediaContract.SHARED_UPLOAD_ENGINE_COUNT, 1);
    assert.match(mediaContract.SHARED_UPLOAD_ENGINE, /registerWebsiteMedia/);
    assert.equal(INLINE_SAVE_PUBLISHES, false);
    assert.equal(adapter.STEP.wiredToEditorMutation, true);

    const inlineJs = read("public/platform/website-inline-edit.js");
    const inlineCss = read("public/platform/website-inline-edit.css");
    assert.match(inlineJs, /bottom sheet \(mobile E02\)|bottom sheet \(mobile\)/);
    assert.match(inlineCss, /@media \(max-width: 390px\)/);
    assert.match(inlineCss, /--gp-website-touch/);
    assert.doesNotMatch(inlineJs, /createActiveClinicEditorEngine|new AcInlineEditor/);

    const acShell = read("views/activeclinic/layouts/public-shell.ejs");
    assert.match(acShell, /website-inline-edit\.js/);
    assert.match(acShell, /website-inline-edit\.css/);
    assert.equal((acShell.match(/website-inline-edit\.js/g) || []).length, 1);
  });

  it("E01/E02 stitch markers mount on shared editor chrome (no separate editor templates)", () => {
    const chrome = read("views/activeclinic/partials/website-editor-chrome.ejs");
    assert.match(chrome, /data-ac-stitch-editor="E01"/);
    assert.match(chrome, /data-ac-stitch-editor-mobile="E02"/);
    assert.match(chrome, /platform\/website-engine\/editor-chrome/);
    assert.doesNotMatch(chrome, /tenant\/editor-only|ac-editor-page\.ejs/);

    const css = read("public/activeclinic/ac-stitch-public.css");
    assert.match(css, /data-ac-stitch-editor-mobile="E02"/);
    assert.match(css, /gp-website-editable__pencil/);
  });

  it("PUBLIC_EDITOR_COMPONENT_PARITY: R01 edit mode wires WE01 hooks on shared components", () => {
    const clinic = sampleClinic();
    const page = buildActiveClinicStitchPublicPage({
      template: "tenant/home",
      clinic,
      doctors: clinic.doctors,
      services: clinic.services,
      websiteEdit: true,
    });
    assert.equal(page.ok, true);
    assert.equal(page.editEnabled, true);

    assert.match(page.html.hero, /data-website-inline="1"/);
    assert.match(page.html.hero, /data-website-key="home\.hero\.title"/);
    assert.match(page.html.hero, /data-website-key="home\.hero\.image"|data-website-type="image"/);
    assert.match(page.html.about, /data-website-key="about\.story\.heading"|data-website-key="about\.story\.body"/);
    assert.match(page.html.promo, /data-website-key="home\.promo\.heading"|data-website-key="home\.promo\.body"/);
    assert.match(page.html.contact, /data-website-key="contact\.phone"/);
    assert.match(page.html.contact, /data-website-key="contact\.email"/);
    assert.match(page.html.hours, /data-website-key="location\.hours"/);
    assert.match(page.html.doctors, /data-gp-website-component="person_grid"/);
    assert.match(page.html.services, /data-gp-website-component="collection_grid"/);

    // Facility address must remain non-editable via location.address WE01.
    assert.doesNotMatch(page.html.location || "", /data-website-key="location\.address"/);
    assert.match(page.html.location || page.html.contact, /1 Medical Arts Tower/);

    assert.equal(EDIT_KEYS.hero.title, "home.hero.title");
    assert.equal(EDIT_KEYS.contactFacts.phone, "contact.phone");
    assert.equal(EDIT_KEYS.hoursFacts.text, "location.hours");
  });

  it("media field contract remains the single upload/library/replace/remove/alt path", () => {
    const mediaField = read("public/platform/website-media-field.js");
    const editableImage = read("views/platform/website/components/editable-image.ejs");
    assert.match(mediaField, /data-gp-we-media-open-library|open-library/);
    assert.match(mediaField, /data-gp-we-media-remove|remove/);
    assert.match(mediaField, /data-gp-we-media-alt|alt/);
    assert.match(editableImage, /data-website-inline="1"/);
    assert.doesNotMatch(mediaField, /acGalleryUploadEngine/);
  });

  it("mobile E02 density uses bottom-sheet field editor without horizontal overflow", () => {
    const css = read("public/platform/website-inline-edit.css");
    assert.match(css, /@media \(max-width: 767px\)[\s\S]*align-items:\s*flex-end/);
    assert.match(css, /border-radius:\s*16px 16px 0 0/);
    assert.match(css, /@media \(max-width: 390px\)[\s\S]*overflow-x:\s*hidden/);
    assert.match(css, /gp-website-editable__pencil[\s\S]*min-width:\s*var\(--gp-website-touch/);
    assert.match(css, /Keep ≥44px touch targets on 390px/);
  });

  it("concurrency contract: sequential token sync + conflict UX remain in shared editor", () => {
    const inline = read("public/platform/website-inline-edit.js");
    assert.match(inline, /applyFieldUpdatedAt\(fieldEl, next\)/);
    assert.match(inline, /rememberFieldUpdatedAt/);
    assert.match(inline, /code === "conflict"/);
    assert.match(inline, /expectedUpdatedAt|updatedAt/);

    const repeatTest = read("tests/v2-04-mini-website-repeat-edit.test.js");
    assert.match(repeatTest, /AC_SAVE_\$\{i \+ 1\}|AC_SAVE_/);
    assert.match(repeatTest, /V1→V2→V3 sequential saves/);
    assert.match(repeatTest, /sessionB\.code, "conflict"/);
    assert.match(repeatTest, /false-conflict|false conflict/i);
  });

  it("lifecycle remains singular: draft save never publishes; publish authz stays on shared ops", () => {
    assert.equal(INLINE_SAVE_PUBLISHES, false);
    const routes = read("src/activeclinic/http/activeClinicWebsiteRoutes.js");
    assert.match(routes, /websiteEditorSharedOperations|websiteEditorHttpUtils/);
    assert.doesNotMatch(routes, /createActiveClinicPublishEngine|duplicatePublish/);
    const publishPolicy = read("src/platform/website/publishPolicy.js");
    assert.match(publishPolicy, /PUBLISH_POLICY|TENANT_PUBLISH|PLATFORM/);
  });

  it("does not invent a second editor engine file for ActiveClinic", () => {
    const websiteDir = fs.readdirSync(path.join(ROOT, "public/activeclinic"));
    assert.ok(!websiteDir.includes("ac-inline-edit.js"));
    assert.ok(!websiteDir.includes("website-inline-edit.js"));
    const adapterSrc = read("src/activeclinic/website/activeClinicWebsitePresentationAdapter.js");
    assert.doesNotMatch(adapterSrc, /website-inline-edit\.js/);
  });
});
