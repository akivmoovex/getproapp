"use strict";

/**
 * V2.04 Overnight Step 2 — platform website presentation component library.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const presentation = require("../src/platform/website/presentation");

const ROOT = path.join(__dirname, "..");
const COMPONENTS_CSS = path.join(ROOT, "public/platform/website-presentation-components.css");
const BRIDGE_CSS = path.join(ROOT, "public/platform/website-presentation-token-bridge.css");
const INLINE_EDIT_JS = path.join(ROOT, "public/platform/website-inline-edit.js");

describe("V2.04 shared website presentation component library", () => {
  it("registers 23 shared components with on-disk partials", () => {
    assert.equal(presentation.SHARED_COMPONENT_COUNT, 23);
    assert.equal(presentation.listSharedComponents().length, 23);
    for (const id of presentation.SHARED_COMPONENT_IDS) {
      const file = presentation.partialPath(id);
      assert.ok(file && fs.existsSync(file), `missing partial for ${id}`);
    }
    assert.ok(fs.existsSync(path.join(ROOT, "views/platform/website/components/editable-field.ejs")));
    assert.ok(fs.existsSync(path.join(ROOT, "views/platform/website/components/editable-image.ejs")));
  });

  it("keeps a single shared inline editor engine", () => {
    assert.ok(fs.existsSync(INLINE_EDIT_JS));
    assert.equal(presentation.SHARED_EDITOR_ENGINE_COUNT, 1);
    assert.equal(presentation.SHARED_EDITOR_ENGINE_PATH, "/platform/website-inline-edit.js");
    assert.equal(presentation.ASSET_PATHS.componentsCss, "/platform/website-presentation-components.css");
    assert.match(fs.readFileSync(INLINE_EDIT_JS, "utf8"), /GpUniversalImageEditor|data-website-inline/);
  });

  it("records component shareability before/after Step 2 and Batch 1", () => {
    assert.equal(presentation.COMPONENT_SHAREABILITY_BEFORE, "74%");
    assert.equal(presentation.COMPONENT_SHAREABILITY_AFTER, "100%");
    assert.equal(presentation.COMPONENT_SHAREABILITY.beforePercent, 74);
    assert.equal(presentation.COMPONENT_SHAREABILITY.afterPercent, 100);
    assert.equal(presentation.COMPONENT_SHAREABILITY.auditedComponentCount, 19);
    assert.equal(presentation.COMPONENT_SHAREABILITY.shareableCandidatesBefore, 14);
    assert.equal(presentation.COMPONENT_SHAREABILITY.sharedPresentationCoverageAfter, 19);
    assert.ok(presentation.COMPONENT_SHAREABILITY.afterPercent > presentation.COMPONENT_SHAREABILITY.beforePercent);
    assert.equal(presentation.BATCH_1_COMPONENT_PARITY.newSharedComponents, 5);
    assert.equal(presentation.BATCH_1_COMPONENT_PARITY.newAcOnlyComponents, 0);
    assert.equal(presentation.BATCH_1_COMPONENT_PARITY.sharedComponentsExtended, 4);
    assert.equal(presentation.BATCH_1_COMPONENT_PARITY.desktopMobileShared, true);
  });

  it("renders hero with editable WE01 hooks from presentation data", () => {
    const result = presentation.renderPresentationComponent(
      "hero",
      {
        eyebrow: "Welcome",
        title: "Care for everyone",
        subtitle: "Visit us today",
        image: { src: "/media/hero.jpg", alt: "Clinic" },
        primaryCta: { label: "Book", url: "/book" },
      },
      {
        editEnabled: true,
        edit: {
          keys: {
            title: "home.hero.title",
            subtitle: "home.hero.subtitle",
            image: "home.hero.image",
            primaryLabel: "home.hero.button_label",
          },
        },
      }
    );
    assert.equal(result.ok, true, result.message || result.code);
    assert.match(result.html, /data-gp-website-component="hero"/);
    assert.match(result.html, /data-website-inline="1"/);
    assert.match(result.html, /data-website-key="home\.hero\.title"/);
    assert.match(result.html, /data-website-type="image"/);
    assert.match(result.html, /Care for everyone/);
    assert.doesNotMatch(result.html, /pastor|doctor|ministry|sermon/i);
  });

  it("renders person card from Doctor and Pastor adapters without domain merge", () => {
    const doctor = presentation.adaptDoctorToPersonPresentation({
      id: "D9",
      public_display_name: "Dr Ada",
      public_title: "GP",
      public_bio: "Family medicine",
    });
    const pastor = presentation.adaptLeaderToPersonPresentation({
      id: "L9",
      displayName: "Pastor Jane",
      roleTitle: "Lead Pastor",
      biography: "Serves the church",
    });
    assert.equal(doctor.ok, true);
    assert.equal(pastor.ok, true);

    const doctorHtml = presentation.renderPresentationComponent("person_card", doctor.value);
    const pastorHtml = presentation.renderPresentationComponent("person_card", pastor.value);
    assert.equal(doctorHtml.ok, true, doctorHtml.message);
    assert.equal(pastorHtml.ok, true, pastorHtml.message);
    assert.match(doctorHtml.html, /Dr Ada/);
    assert.match(doctorHtml.html, /data-gp-source-domain="doctor"/);
    assert.match(pastorHtml.html, /Pastor Jane/);
    assert.match(pastorHtml.html, /data-gp-source-domain="pastor_leader"/);
    assert.doesNotMatch(doctorHtml.html, /pastor_leader|blessboard\.leaders/i);
    assert.doesNotMatch(pastorHtml.html, /\bdoctor\b|clinical/i);

    assert.equal(presentation.assertDomainBoundary("doctor", "pastor_leader").ok, false);
  });

  it("renders collection grid from ministry and service adapters", () => {
    const ministry = presentation.adaptMinistryToOfferingCard({
      id: "M1",
      name: "Youth",
      summary: "Youth ministry",
    });
    const service = presentation.adaptServiceToOfferingCard({
      id: "S1",
      display_name: "Dental",
      public_summary: "Dental care",
    });
    assert.equal(ministry.ok, true);
    assert.equal(service.ok, true);

    const grid = presentation.renderPresentationComponent("collection_grid", {
      cardKind: "offering",
      layoutVariant: "grid",
      intro: "Offerings",
      items: [ministry.value, service.value],
    });
    assert.equal(grid.ok, true, grid.message);
    assert.match(grid.html, /Youth/);
    assert.match(grid.html, /Dental/);
    assert.match(grid.html, /data-gp-website-component="collection_grid"/);
  });

  it("renders remaining core components from validated presentation models", () => {
    const samples = {
      section_header: { title: "About", lead: "Our story" },
      rich_text: { heading: "Story", body: "Body copy" },
      image_text: { heading: "Visit", body: "Come by", imagePosition: "start", image: { src: "/a.jpg" } },
      cta: { heading: "Ready?", primaryCta: { label: "Start", url: "/start" } },
      contact: { phone: "+1 555", email: "a@b.co", address: "1 Main" },
      hours: { heading: "Hours", text: "Mon–Fri", rows: [{ label: "Weekdays", open: "09:00", close: "17:00" }] },
      location: { heading: "Find us", address: "1 Main", mapUrl: "https://maps.example/1" },
      gallery: { heading: "Photos", items: [{ image: { src: "/g.jpg" }, caption: "Lobby" }] },
      video: { title: "Tour", url: "https://youtube.com/watch?v=1" },
      announcement: { title: "Notice", body: "Closed Monday", cta: { label: "Details", url: "/n" } },
      navigation: { items: [{ key: "about", label: "About", href: "/about" }] },
      footer: { tagline: "Care", legal: "Not advice" },
      seo: { title: "Site", description: "Desc", robots: "index", sitemapInclude: true },
    };

    for (const [id, model] of Object.entries(samples)) {
      const rendered = presentation.renderPresentationComponent(id, model);
      assert.equal(rendered.ok, true, `${id}: ${rendered.code} ${rendered.message || ""}`);
      assert.ok(rendered.html.length > 0, id);
      if (id !== "seo") {
        assert.match(rendered.html, new RegExp(`data-gp-website-component="${id}"`));
      } else {
        assert.match(rendered.html, /<meta name="description"/);
        assert.match(rendered.html, /gp-website-sitemap-include/);
      }
    }
  });

  it("person grid uses PersonPresentation items only", () => {
    const grid = presentation.renderPresentationComponent("person_grid", {
      intro: "Team",
      items: [
        { name: "Ada", title: "GP", displayOrder: 1 },
        { name: "Jane", title: "Pastor", displayOrder: 2 },
      ],
    });
    assert.equal(grid.ok, true, grid.message);
    assert.match(grid.html, /Ada/);
    assert.match(grid.html, /Jane/);
    assert.match(grid.html, /data-gp-website-component="person_grid"/);
  });

  it("platform component CSS has no BB/AC token leakage or product hex brands", () => {
    const css = fs.readFileSync(COMPONENTS_CSS, "utf8");
    // Ignore comments when checking for token identifiers.
    const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
    assert.equal(presentation.findThemeTokenLeaks(code, "activeclinic").length, 0);
    assert.equal(presentation.findThemeTokenLeaks(code, "blessboard").length, 0);
    assert.doesNotMatch(code, /--bb-/);
    assert.doesNotMatch(code, /--ac-/);
    assert.match(code, /--gp-website-color-primary/);
  });

  it("token bridge scopes BB and AC mappings separately", () => {
    const bridge = fs.readFileSync(BRIDGE_CSS, "utf8");
    assert.match(bridge, /body\.bb-tp-body/);
    assert.match(bridge, /body\.ac-public-body/);
    assert.match(bridge, /--gp-website-color-primary:\s*var\(--bb-color-primary/);
    assert.match(bridge, /--gp-website-color-primary:\s*var\(--ac-color-primary/);
    // Bridge may reference product tokens, but component CSS must stay clean.
    const componentCss = fs.readFileSync(COMPONENTS_CSS, "utf8");
    assert.equal(presentation.findThemeTokenLeaks(componentCss, "activeclinic").length, 0);
    assert.equal(presentation.findThemeTokenLeaks(componentCss, "blessboard").length, 0);
  });

  it("does not wire components into live public product templates yet", () => {
    assert.equal(presentation.PHASE.wiredToPublicRender, false);
    assert.equal(presentation.PHASE.step1Prerequisite, "PASS");
    assert.equal(presentation.PHASE.componentLibraryAvailable, true);
    const bbHero = fs.readFileSync(path.join(ROOT, "views/blessboard/v5/public/partials/page-hero.ejs"), "utf8");
    const acDoctors = fs.readFileSync(path.join(ROOT, "views/activeclinic/tenant/doctors.ejs"), "utf8");
    assert.doesNotMatch(bbHero, /platform\/website\/components\/hero/);
    assert.doesNotMatch(acDoctors, /platform\/website\/components\/person/);
  });

  it("exposes BB and AC theme token bridges without product hex in component CSS", () => {
    const bridge = fs.readFileSync(BRIDGE_CSS, "utf8");
    const componentCss = fs.readFileSync(COMPONENTS_CSS, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.match(bridge, /--gp-website-color-primary:\s*var\(--bb-color-primary/);
    assert.match(bridge, /--gp-website-color-primary:\s*var\(--ac-color-primary/);
    assert.equal(presentation.findThemeTokenLeaks(componentCss, "blessboard").length, 0);
    assert.equal(presentation.findThemeTokenLeaks(componentCss, "activeclinic").length, 0);
    for (const token of presentation.PLATFORM_THEME_TOKENS) {
      assert.match(bridge, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("rejects domain entities passed where presentation DTOs are required", () => {
    const bad = presentation.renderPresentationComponent("person_card", {
      // missing name — domain-ish payload without presentation shape
      public_display_name: "Dr X",
      staffId: "1",
    });
    assert.equal(bad.ok, false);
  });

  it("Batch 1: person card renders portrait, badges, and dual CTAs from adapters", () => {
    const doctor = presentation.adaptDoctorToPersonPresentation({
      id: "D-batch1",
      public_display_name: "Dr Ada",
      public_title: "General Practitioner",
      subtitle: "Family medicine",
      public_bio: "Experienced clinician",
      ctaUrl: "/doctors/ada",
      bookingUrl: "/book?doctor=ada",
      qualifications: ["MBBS"],
    });
    const html = presentation.renderPresentationComponent("person_card", doctor.value);
    assert.equal(html.ok, true, html.message);
    assert.match(html.html, /data-gp-media-variant="portrait"/);
    assert.match(html.html, /View Profile/);
    assert.match(html.html, /Book Appointment/);
    assert.match(html.html, /MBBS/);
    assert.doesNotMatch(html.html, /MD \(invented\)|fake credential/i);
  });

  it("Batch 1: service card renders icon tile variant", () => {
    const service = presentation.adaptServiceToOfferingCard({
      id: "S-batch1",
      display_name: "Dental",
      public_summary: "Dental care",
      iconUrl: "/icons/dental.svg",
      ctaUrl: "/services/dental",
    });
    const card = presentation.renderPresentationComponent("collection_card", {
      cardKind: "offering",
      items: [service.value],
    });
    assert.equal(card.ok, true, card.message);
    assert.match(card.html, /data-gp-media-variant="icon"/);
    assert.match(card.html, /gp-website-pc__img--icon/);
    assert.match(card.html, /Dental/);
  });

  it("Batch 1: new shared Stitch families render without AC-only partials", () => {
    const samples = {
      fact_strip: {
        heading: "Quick info",
        items: [
          { label: "Open", value: "Today 8–6" },
          { label: "Phone", value: "+1 555", href: "tel:+1555" },
        ],
      },
      stepper: {
        heading: "Care journey",
        steps: [
          { title: "Book", body: "Choose a slot" },
          { title: "Visit", body: "Arrive prepared" },
        ],
      },
      faq_list: {
        heading: "FAQ",
        items: [{ question: "Insurance?", answer: "Call us" }],
      },
      settings_shell: {
        title: "Website hub",
        activeKey: "media",
        navItems: [
          { key: "media", label: "Media", href: "/media", description: "Library" },
          { key: "branding", label: "Brand", href: "/branding" },
        ],
        actions: [{ label: "Publish", url: "/publish" }],
      },
      data_list: {
        heading: "Clinic facts",
        rows: [{ label: "Email", value: "care@example.test", href: "mailto:care@example.test" }],
      },
    };
    for (const [id, model] of Object.entries(samples)) {
      const rendered = presentation.renderPresentationComponent(id, model);
      assert.equal(rendered.ok, true, `${id}: ${rendered.code} ${rendered.message || ""}`);
      assert.match(rendered.html, new RegExp(`data-gp-website-component="${id}"`));
    }
  });

  it("Batch 1: desktop and 390px share one component CSS (no mobile duplicate partials)", () => {
    const css = fs.readFileSync(COMPONENTS_CSS, "utf8");
    assert.match(css, /@media \(max-width:\s*390px\)/);
    assert.doesNotMatch(css, /person-card-mobile|collection-card-mobile/);
    assert.equal(fs.existsSync(path.join(ROOT, "views/platform/website/components/person-card-mobile.ejs")), false);
    assert.equal(fs.existsSync(path.join(ROOT, "views/platform/website/components/fact-strip-mobile.ejs")), false);
  });

  it("Batch 1: BB pastor still renders on shared person card (regression)", () => {
    const pastor = presentation.adaptLeaderToPersonPresentation({
      id: "L-reg",
      displayName: "Pastor Jane",
      roleTitle: "Lead Pastor",
      biography: "Serves the church",
      seniorLeader: true,
    });
    const ministry = presentation.adaptMinistryToOfferingCard({
      id: "M-reg",
      name: "Youth",
      summary: "Youth ministry",
      joinUrl: "/join",
    });
    const pastorHtml = presentation.renderPresentationComponent("person_card", pastor.value);
    const ministryHtml = presentation.renderPresentationComponent("collection_card", {
      cardKind: "offering",
      items: [ministry.value],
    });
    assert.equal(pastorHtml.ok, true);
    assert.equal(ministryHtml.ok, true);
    assert.match(pastorHtml.html, /Pastor Jane/);
    assert.match(pastorHtml.html, /data-gp-source-domain="pastor_leader"/);
    assert.match(ministryHtml.html, /Youth/);
    assert.match(ministryHtml.html, /data-gp-source-domain="ministry"/);
    assert.doesNotMatch(pastorHtml.html, /Book Appointment/);
  });

  it("Batch 1: theme isolation keeps AC primary on token bridge without BB leakage", () => {
    const bridge = fs.readFileSync(BRIDGE_CSS, "utf8");
    const componentCss = fs.readFileSync(COMPONENTS_CSS, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.match(bridge, /body\.ac-public-body[\s\S]*--gp-website-color-primary:\s*var\(--ac-color-primary/);
    assert.match(bridge, /body\.bb-tp-body[\s\S]*--gp-website-color-primary:\s*var\(--bb-color-primary/);
    assert.doesNotMatch(componentCss, /#006068|#6[cC]5[cC][eE]7/);
    assert.doesNotMatch(componentCss, /--bb-/);
    assert.doesNotMatch(componentCss, /--ac-/);
    assert.equal(presentation.findThemeTokenLeaks(componentCss, "activeclinic").length, 0);
    assert.equal(presentation.findThemeTokenLeaks(componentCss, "blessboard").length, 0);
  });
});
