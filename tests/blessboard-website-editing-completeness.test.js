"use strict";

/**
 * BlessBoard V5 — public website editing completeness (registry + draft apply).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveEditableField,
  listEditableFieldsForPage,
  validateFieldValue,
  validateSafeUrl,
} = require("../src/blessboard/services/websiteInlineEditableFields");
const {
  validateStructuredPayload,
  DRAFT_KINDS,
} = require("../src/blessboard/services/websiteStructuredDraftValidation");

describe("website editing completeness — registry", () => {
  it("registers home teaser and footer fields", () => {
    for (const section of [
      "ministries_intro",
      "events_intro",
      "sermons_intro",
      "leadership_intro",
      "giving_cta",
      "contact_intro",
      "footer",
    ]) {
      const headingOrTagline =
        section === "footer"
          ? resolveEditableField("home", "footer", "tagline")
          : resolveEditableField("home", section, "heading");
      assert.ok(headingOrTagline, `missing home::${section}`);
    }
    assert.equal(resolveEditableField("home", "footer", "tagline").maxLength, 200);
  });

  it("registers about values, beliefs, community, gallery, visitor CTA", () => {
    assert.ok(resolveEditableField("about", "values", "heading"));
    assert.ok(resolveEditableField("about", "value_presence", "heading"));
    assert.ok(resolveEditableField("about", "value_presence", "bodyText"));
    assert.ok(resolveEditableField("about", "beliefs", "bodyText"));
    assert.ok(resolveEditableField("about", "community", "heading"));
    assert.ok(resolveEditableField("about", "gallery", "heading"));
    assert.ok(resolveEditableField("about", "visitor_cta", "buttonText"));
  });

  it("registers contact guidance, office hours, and message copy", () => {
    assert.ok(resolveEditableField("contact", "visitor_guidance", "heading"));
    assert.ok(resolveEditableField("contact", "visitor_guidance", "bodyText"));
    assert.ok(resolveEditableField("contact", "office_hours", "bodyText"));
    assert.ok(resolveEditableField("contact", "message", "heading"));
    assert.ok(resolveEditableField("contact", "message", "bodyText"));
    // Contact form routing / recipient email must not be editable here.
    assert.equal(resolveEditableField("contact", "message", "recipientEmail"), null);
  });

  it("registers giving chrome fields including why cards and assistance", () => {
    assert.ok(resolveEditableField("giving", "why", "heading"));
    assert.ok(resolveEditableField("giving", "why_impact", "bodyText"));
    assert.ok(resolveEditableField("giving", "ways", "heading"));
    assert.ok(resolveEditableField("giving", "accountability", "bodyText"));
    assert.ok(resolveEditableField("giving", "assistance", "buttonText"));
  });

  it("rejects unknown page/section/field keys", () => {
    assert.equal(resolveEditableField("home", "not_a_section", "heading"), null);
    assert.equal(resolveEditableField("about", "beliefs", "secret"), null);
    assert.equal(resolveEditableField("unknown_page", "hero", "heading"), null);
  });

  it("rejects unsafe button URLs and image-like protocols via validators", () => {
    assert.equal(validateSafeUrl("javascript:alert(1)").ok, false);
    assert.equal(validateSafeUrl("https://example.org/ok").ok, true);
    assert.equal(validateSafeUrl("/contact").ok, true);
    const field = resolveEditableField("home", "hero", "buttonUrl");
    assert.equal(validateFieldValue(field, "data:text/html,hi").ok, false);
  });

  it("lists editable fields per page without duplicates", () => {
    const home = listEditableFieldsForPage("home");
    const keys = home.map((f) => `${f.sectionKey}::${f.fieldKey}`);
    assert.equal(keys.length, new Set(keys).size);
    assert.ok(home.length >= 10);
  });
});

describe("website editing completeness — giving methods", () => {
  it("includes giving_method in structured draft kinds", () => {
    assert.ok(DRAFT_KINDS.includes("giving_method"));
  });

  it("rejects invalid giving method kinds and unsafe URLs", () => {
    const badKind = validateStructuredPayload(
      "giving_method",
      {
        methodType: "!!!",
        label: "Bad",
      },
      "upsert"
    );
    assert.equal(badKind.ok, false);

    const badUrl = validateStructuredPayload(
      "giving_method",
      {
        methodType: "bank_transfer",
        label: "Bank",
        externalUrl: "javascript:alert(1)",
      },
      "upsert"
    );
    assert.equal(badUrl.ok, false);

    const badQr = validateStructuredPayload(
      "giving_method",
      {
        methodType: "online",
        label: "Online",
        qrImageUrl: "javascript:alert(1)",
      },
      "upsert"
    );
    assert.equal(badQr.ok, false);
  });

  it("accepts a complete giving method payload with QR media path", () => {
    const ok = validateStructuredPayload(
      "giving_method",
      {
        methodType: "bank_transfer",
        label: "Main account",
        description: "Sunday offering",
        accountDetails: "ACC-001",
        instructions: "Use published details only.",
        externalUrl: "https://example.org/give",
        buttonLabel: "Give online",
        qrImageUrl: "/church/images/tenant-public/home-desktop-hero.jpg",
        visible: true,
        sortOrder: 10,
      },
      "upsert"
    );
    assert.equal(ok.ok, true, ok.error);
    assert.equal(ok.payload.label, "Main account");
    assert.ok(ok.payload.qrImageUrl);
  });
});
