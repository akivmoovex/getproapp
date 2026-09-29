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
  it("registers 18 shared components with on-disk partials", () => {
    assert.equal(presentation.SHARED_COMPONENT_COUNT, 18);
    assert.equal(presentation.listSharedComponents().length, 18);
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

  it("records component shareability before/after Step 2", () => {
    assert.equal(presentation.COMPONENT_SHAREABILITY_BEFORE, "74%");
    assert.equal(presentation.COMPONENT_SHAREABILITY_AFTER, "89%");
    assert.equal(presentation.COMPONENT_SHAREABILITY.beforePercent, 74);
    assert.equal(presentation.COMPONENT_SHAREABILITY.afterPercent, 89);
    assert.equal(presentation.COMPONENT_SHAREABILITY.auditedComponentCount, 19);
    assert.equal(presentation.COMPONENT_SHAREABILITY.shareableCandidatesBefore, 14);
    assert.equal(presentation.COMPONENT_SHAREABILITY.sharedPresentationCoverageAfter, 17);
    assert.ok(presentation.COMPONENT_SHAREABILITY.afterPercent > presentation.COMPONENT_SHAREABILITY.beforePercent);
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
});
