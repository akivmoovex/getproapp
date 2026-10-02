"use strict";

/**
 * V2.04 Phase 1 — platform website presentation contracts.
 * Pure unit tests; no DB; does not touch public render paths.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const presentation = require("../src/platform/website/presentation");
const websiteIndex = require("../src/platform/website");

describe("V2.04 platform website presentation foundation", () => {
  it("exports presentation from platform website barrel and marks Step 2 unwired", () => {
    assert.ok(websiteIndex.presentation);
    assert.equal(websiteIndex.presentation.PHASE.wiredToPublicRender, false);
    assert.equal(websiteIndex.presentation.PHASE.wiredToEditorMutation, false);
    assert.equal(presentation.PHASE.step1Prerequisite, "PASS");
    assert.equal(presentation.PHASE.id, "v2_04_overnight_step_2");
    assert.equal(presentation.PHASE.wiredToPublicRender, false);
    assert.equal(presentation.PHASE.componentLibraryAvailable, true);
  });

  it("records the audit field inventory (18/42/175/25)", () => {
    assert.deepEqual(presentation.AUDIT_FIELD_INVENTORY, {
      universal: 18,
      componentSemantic: 42,
      productSpecific: 175,
      legacyDuplicates: 25,
    });
    assert.equal(presentation.AUDIT_FIELD_TOTAL, 260);
  });

  it("defines exactly 18 universal presentation fields with BB/AC maps", () => {
    assert.equal(presentation.UNIVERSAL_FIELD_COUNT, 18);
    assert.equal(presentation.UNIVERSAL_FIELDS.length, 18);
    const keys = presentation.listUniversalPresentationKeys();
    assert.deepEqual(keys, [
      "home.logo",
      "brand.primary_color",
      "brand.accent_color",
      "home.hero.image",
      "home.hero.eyebrow",
      "home.hero.title",
      "home.hero.subtitle",
      "about.story.heading",
      "about.story.body",
      "contact.phone",
      "contact.email",
      "footer.tagline",
      "seo.title",
      "seo.description",
      "seo.image",
      "seo.canonical_url",
      "seo.robots",
      "seo.sitemap_include",
    ]);
  });

  it("maps divergent BB/AC storage keys to canonical presentation keys", () => {
    assert.equal(
      presentation.productStorageKeyFor("blessboard", "home.hero.title"),
      "home.hero.heading"
    );
    assert.equal(
      presentation.productStorageKeyFor("activeclinic", "home.hero.title"),
      "home.hero.title"
    );
    assert.equal(
      presentation.presentationKeyForProductStorage("blessboard", "home.hero.body_text"),
      "home.hero.subtitle"
    );
    assert.equal(
      presentation.presentationKeyForProductStorage("blessboard", "about.story.body_text"),
      "about.story.body"
    );
    assert.equal(
      presentation.presentationKeyForProductStorage("blessboard", "contact.details.phone"),
      "contact.phone"
    );
    assert.equal(
      presentation.presentationKeyForProductStorage("blessboard", "seo.og_image_url"),
      "seo.image"
    );
    assert.equal(
      presentation.presentationKeyForProductStorage("blessboard", "home.footer.tagline"),
      "footer.tagline"
    );
  });

  it("mapUniversalContentToPresentation normalizes product bags without dropping unmapped keys", () => {
    const mapped = presentation.mapUniversalContentToPresentation("blessboard", {
      "home.hero.heading": "Welcome",
      "home.hero.body_text": "Join us",
      "giving.hero.heading": "Give",
      "seo.title": "Church",
    });
    assert.equal(mapped.presentation["home.hero.title"], "Welcome");
    assert.equal(mapped.presentation["home.hero.subtitle"], "Join us");
    assert.equal(mapped.presentation["seo.title"], "Church");
    assert.equal(mapped.unmapped["giving.hero.heading"], "Give");

    const ac = presentation.mapUniversalContentToPresentation("activeclinic", {
      "home.hero.title": "Care",
      "book.intro": "Book a visit",
    });
    assert.equal(ac.presentation["home.hero.title"], "Care");
    assert.equal(ac.unmapped["book.intro"], "Book a visit");
  });

  it("round-trips presentation keys back to product storage keys", () => {
    const storage = presentation.mapPresentationToProductStorage("blessboard", {
      "home.hero.title": "Hello",
      "about.story.body": "Story",
      "seo.image": { src: "/x.jpg" },
    });
    assert.equal(storage["home.hero.heading"], "Hello");
    assert.equal(storage["about.story.body_text"], "Story");
    assert.deepEqual(storage["seo.og_image_url"], { src: "/x.jpg" });
  });

  it("documents legacy duplicates without removing them", () => {
    assert.equal(presentation.LEGACY_DUPLICATE_FIELD_COUNT, 25);
    assert.equal(presentation.LEGACY_DUPLICATE_FIELDS.length, 25);
    const heroTitle = presentation.findLegacyField("blessboard", "identity.hero_title");
    assert.ok(heroTitle);
    assert.equal(heroTitle.canonicalPresentationKey, "home.hero.title");
    assert.equal(heroTitle.status, presentation.LEGACY_STATUS.ALIAS);
    assert.equal(
      presentation.resolveLegacyToPresentationKey("blessboard", "seo.noindex"),
      "seo.robots"
    );
  });

  it("exposes 18 core presentation types plus Batch 1 Stitch families", () => {
    assert.equal(presentation.CORE_PRESENTATION_COMPONENT_TYPE_COUNT, 18);
    assert.equal(presentation.PRESENTATION_COMPONENT_TYPE_LIST.length, 23);
    const types = presentation.listPresentationComponentTypes();
    assert.equal(types.length, 23);
    for (const type of presentation.PRESENTATION_COMPONENT_TYPE_LIST) {
      assert.ok(presentation.COMPONENT_CONTRACTS[type], `missing contract for ${type}`);
      assert.equal(presentation.isPresentationComponentType(type), true);
    }
    assert.equal(presentation.isPresentationComponentType("fact_strip"), true);
    assert.equal(presentation.isPresentationComponentType("settings_shell"), true);
  });

  it("maps Class B semantic concepts onto presentation components", () => {
    assert.equal(presentation.COMPONENT_SEMANTIC_CONCEPT_COUNT, 42);
    assert.equal(
      presentation.COMPONENT_SEMANTIC_CONCEPT_COUNT,
      presentation.AUDIT_FIELD_INVENTORY.componentSemantic
    );
    assert.ok(presentation.COMPONENT_SEMANTIC_CONCEPTS.some((c) => c.concept === "person_card"));
    assert.ok(presentation.COMPONENT_SEMANTIC_CONCEPTS.some((c) => c.concept === "offering_card"));
    assert.ok(presentation.COMPONENT_SEMANTIC_CONCEPTS.some((c) => c.concept === "social_links"));
  });

  it("validates each presentation component type with a minimal payload", () => {
    const samples = {
      branding: { logo: null, primaryColor: "#123456", siteName: "Clinic" },
      navigation: { items: [{ key: "about", label: "About", href: "/about", displayOrder: 1 }] },
      hero: { title: "Hello", subtitle: "World", primaryCta: { label: "Go", url: "/x" } },
      section_heading: { title: "Section", lead: "Lead" },
      rich_text: { heading: "H", body: "Body" },
      image_text: { heading: "H", body: "B", imagePosition: "end" },
      cta: { heading: "Act", primaryCta: { label: "Book", url: "/book" } },
      person: { name: "Dr Ada", title: "GP", description: "Bio" },
      collection_card: {
        cardKind: "offering",
        layoutVariant: "grid",
        items: [{ title: "Service A", description: "Summary" }],
      },
      contact: { phone: "+1 555", email: "a@b.co" },
      hours: { text: "Mon–Fri 9–5", rows: [{ label: "Weekday", open: "09:00", close: "17:00" }] },
      location: { address: "1 Main St", mapUrl: "https://maps.example/1" },
      social_links: { links: [{ network: "facebook", url: "https://facebook.com/x" }] },
      gallery: { heading: "Photos", items: [{ image: { src: "/a.jpg" }, caption: "A" }] },
      video: { title: "Tour", url: "https://youtube.com/watch?v=1" },
      announcement: { title: "Notice", body: "Details", visibility: true },
      seo: { title: "Site", description: "Desc", robots: "index", sitemapInclude: true },
      footer: { tagline: "Care", legal: "Not medical advice", showContact: true },
      fact_strip: {
        heading: "At a glance",
        items: [{ label: "Phone", value: "+1 555", displayOrder: 1 }],
      },
      stepper: {
        heading: "Your visit",
        steps: [{ title: "Book", body: "Choose a time", displayOrder: 1 }],
      },
      faq_list: {
        heading: "FAQ",
        items: [{ question: "Do you take walk-ins?", answer: "Yes", displayOrder: 1 }],
      },
      settings_shell: {
        title: "Website",
        navItems: [{ key: "branding", label: "Branding", href: "/branding" }],
      },
      data_list: {
        heading: "Details",
        rows: [{ label: "Phone", value: "+1 555" }],
      },
    };

    for (const [type, payload] of Object.entries(samples)) {
      const result = presentation.validatePresentationComponent(type, payload);
      assert.equal(result.ok, true, `${type}: ${result.code || "ok"}`);
      assert.ok(result.value);
    }
  });

  it("rejects invalid presentation payloads", () => {
    assert.equal(presentation.validatePresentationComponent("hero", null).ok, false);
    assert.equal(presentation.validatePresentationComponent("nope", {}).ok, false);
    assert.equal(presentation.validatePersonPresentation({ name: "" }).ok, false);
    assert.equal(
      presentation.validateCollectionPresentation({ cardKind: "offering", items: "x" }).ok,
      false
    );
  });

  it("adapts doctor and pastor to PersonPresentation without merging domains", () => {
    const pastor = presentation.adaptLeaderToPersonPresentation({
      id: "L1",
      displayName: "Pastor Jane",
      roleTitle: "Lead Pastor",
      biography: "Serves the church",
      sortOrder: 1,
      seniorLeader: true,
    });
    assert.equal(pastor.ok, true);
    assert.equal(pastor.value.name, "Pastor Jane");
    assert.equal(pastor.value.sourceDomain, "pastor_leader");

    const doctor = presentation.adaptDoctorToPersonPresentation({
      id: "D1",
      public_display_name: "Dr Ada",
      public_title: "General Practitioner",
      public_bio: "Family medicine",
      sort_order: 2,
      featured: true,
    });
    assert.equal(doctor.ok, true);
    assert.equal(doctor.value.name, "Dr Ada");
    assert.equal(doctor.value.sourceDomain, "doctor");

    const merge = presentation.assertDomainBoundary("doctor", "pastor_leader");
    assert.equal(merge.ok, false);
    assert.equal(merge.code, "forbidden_domain_merge");
    assert.equal(presentation.isForbiddenDomainMerge("doctor_pastor"), true);
    assert.equal(presentation.assertDomainBoundary("doctor", "doctor").ok, true);
  });

  it("adapts ministry and clinical service to offering cards with separate domains", () => {
    const ministry = presentation.adaptMinistryToOfferingCard({
      id: "M1",
      name: "Youth",
      summary: "Youth ministry",
      joinUrl: "/join",
    });
    assert.equal(ministry.ok, true);
    assert.equal(ministry.value.sourceDomain, "ministry");

    const service = presentation.adaptServiceToOfferingCard({
      id: "S1",
      display_name: "Dental",
      public_summary: "Dental care",
    });
    assert.equal(service.ok, true);
    assert.equal(service.value.sourceDomain, "clinical_service");

    assert.equal(
      presentation.assertDomainBoundary("clinical_service", "ministry").ok,
      false
    );
    assert.equal(
      presentation.assertDomainBoundary("appointment_booking", "church_event").ok,
      false
    );
    assert.equal(presentation.assertDomainBoundary("sermon", "clinical_content").ok, false);
  });

  it("adapts doctor with dual CTAs and badges only when data exists", () => {
    const doctor = presentation.adaptDoctorToPersonPresentation({
      id: "D2",
      public_display_name: "Dr Ada",
      public_title: "General Practitioner",
      subtitle: "Family medicine",
      public_bio: "Family medicine",
      ctaUrl: "/doctors/ada",
      bookingUrl: "/book?doctor=ada",
      qualifications: ["MBBS", "MRCGP"],
      sort_order: 1,
    });
    assert.equal(doctor.ok, true);
    assert.equal(doctor.value.cta.label, "View Profile");
    assert.equal(doctor.value.secondaryCta.label, "Book Appointment");
    assert.equal(doctor.value.mediaVariant, "portrait");
    assert.equal(doctor.value.badges.length, 2);
    assert.equal(doctor.value.badges[0].label, "MBBS");

    const bare = presentation.adaptDoctorToPersonPresentation({
      id: "D3",
      public_display_name: "Dr Bo",
      public_title: "GP",
    });
    assert.equal(bare.ok, true);
    assert.equal(bare.value.badges.length, 0);
    assert.equal(bare.value.cta, null);
  });

  it("adapts clinical service with icon tile media variant", () => {
    const service = presentation.adaptServiceToOfferingCard({
      id: "S2",
      display_name: "Dental",
      public_summary: "Dental care",
      iconUrl: "/icons/dental.svg",
      ctaUrl: "/services/dental",
      bookingUrl: "/book?service=dental",
    });
    assert.equal(service.ok, true);
    assert.equal(service.value.mediaVariant, "icon");
    assert.equal(service.value.cta.label, "Learn more");
    assert.equal(service.value.secondaryCta.label, "Book");
  });

  it("keeps collection presentation ordered and visible by default", () => {
    const collection = presentation.validateCollectionPresentation({
      cardKind: "person",
      layoutVariant: "grid",
      intro: "Our team",
      emptyState: { heading: "None yet", body: "Add people" },
      items: [
        { name: "B", displayOrder: 2 },
        { name: "A", displayOrder: 1 },
      ],
    });
    assert.equal(collection.ok, true);
    assert.equal(collection.value.items[0].name, "A");
    assert.equal(collection.value.items[1].name, "B");
    assert.equal(collection.value.items[0].visibility, true);
  });
});
