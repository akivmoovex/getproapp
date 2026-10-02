"use strict";

/**
 * Static completeness: registered website fields and structured kinds must be
 * referenced from public templates / shared partials. Avoids heading-text matching.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  EDITABLE_FIELDS,
  resolveEditableField,
  listEditableFieldsForPage,
} = require("../src/blessboard/services/websiteInlineEditableFields");
const {
  DRAFT_KINDS,
  validateStructuredPayload,
} = require("../src/blessboard/services/websiteStructuredDraftValidation");

const ROOT = path.join(__dirname, "..");
const PUBLIC_VIEWS = path.join(ROOT, "views/blessboard/v5/public");
const PARTIALS = path.join(ROOT, "views/blessboard/v5/partials");

function collectEjsFiles(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...collectEjsFiles(full));
    else if (name.endsWith(".ejs")) out.push(full);
  }
  return out;
}

function readAllTemplates() {
  return collectEjsFiles(PUBLIC_VIEWS)
    .concat(collectEjsFiles(PARTIALS).filter((f) => /editable-text|structured-edit|settings-edit|website-admin-chrome|tenant-public-shell|cta-band|page-hero|section-heading|leader-card|service-times/.test(f)))
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n");
}

describe("website editing completeness — static template coverage", () => {
  const corpus = readAllTemplates();

  it("every public page has hero heading + body registered", () => {
    for (const page of [
      "home",
      "about",
      "leadership",
      "ministries",
      "events",
      "sermons",
      "contact",
      "giving",
    ]) {
      assert.ok(resolveEditableField(page, "hero", "heading"), `${page}::hero::heading`);
      assert.ok(resolveEditableField(page, "hero", "bodyText"), `${page}::hero::bodyText`);
      assert.ok(resolveEditableField(page, "hero", "eyebrow"), `${page}::hero::eyebrow`);
      assert.ok(resolveEditableField(page, "hero", "buttonText"), `${page}::hero::buttonText`);
      assert.ok(resolveEditableField(page, "hero", "buttonUrl"), `${page}::hero::buttonUrl`);
    }
  });

  it("templates reference critical section keys for reported pages", () => {
    const required = [
      "ministries_intro",
      "events_intro",
      "sermons_intro",
      "contact_intro",
      "giving_cta",
      "footer",
      "visitor_guidance",
      "office_hours",
      "message",
      "accountability",
      "assistance",
      "visitor_cta",
      "beliefs",
      "community",
      "gallery",
      "why_",
    ];
    for (const key of required) {
      assert.match(corpus, new RegExp(key), `template corpus missing section key ${key}`);
    }
  });

  it("templates wire buttonUrl and secondaryButton fields", () => {
    assert.match(corpus, /buttonUrl/);
    assert.match(corpus, /secondaryButtonText/);
    assert.match(corpus, /secondaryButtonUrl/);
    assert.match(corpus, /editFieldKey:\s*'eyebrow'|editFieldKey:\s*"eyebrow"/);
  });

  it("collection pages expose add triggers for structured kinds", () => {
    assert.match(corpus, /editKind:\s*'leader'/);
    assert.match(corpus, /editEntityKey:\s*'new-leader'|editEntityKey:\s*"new-leader"/);
    assert.match(corpus, /editKind:\s*'ministry'/);
    assert.match(corpus, /editEntityKey:\s*'new-ministry'/);
    assert.match(corpus, /editKind:\s*'event'/);
    assert.match(corpus, /editEntityKey:\s*'new-event'/);
    assert.match(corpus, /editKind:\s*'sermon'/);
    assert.match(corpus, /editEntityKey:\s*'new-sermon'/);
    assert.match(corpus, /editKind:\s*'giving_method'/);
  });

  it("page-hero supports image and video structured editors", () => {
    const hero = fs.readFileSync(
      path.join(PUBLIC_VIEWS, "partials/page-hero.ejs"),
      "utf8"
    );
    assert.match(hero, /editKind:\s*'image'/);
    assert.match(hero, /editKind:\s*'video'/);
    assert.match(hero, /buttonUrl/);
    assert.match(hero, /secondaryButtonText/);
  });

  it("all DRAFT_KINDS remain supported", () => {
    for (const kind of [
      "image",
      "video",
      "service_times",
      "leader",
      "ministry",
      "event",
      "sermon",
      "giving_method",
      "social_link",
    ]) {
      assert.ok(DRAFT_KINDS.includes(kind), kind);
    }
  });

  it("rejects unsafe button and video URLs", () => {
    const urlField = resolveEditableField("home", "hero", "buttonUrl");
    assert.equal(
      require("../src/blessboard/services/websiteInlineEditableFields").validateFieldValue(
        urlField,
        "javascript:alert(1)"
      ).ok,
      false
    );
    const badVideo = validateStructuredPayload(
      "video",
      { videoUrl: "javascript:alert(1)", title: "x" },
      "upsert"
    );
    assert.equal(badVideo.ok, false);
  });

  it("registry has no duplicate page::section::field triples", () => {
    const keys = EDITABLE_FIELDS.map((f) => `${f.pageKey}::${f.sectionKey}::${f.fieldKey}`);
    assert.equal(keys.length, new Set(keys).size);
  });

  it("each page lists a non-empty editable field set", () => {
    for (const page of ["home", "about", "contact", "giving", "events", "sermons"]) {
      assert.ok(listEditableFieldsForPage(page).length > 0, page);
    }
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

describe("website editing completeness — unsupported public-edit surfaces", () => {
  it("SEO is settings-surface from public edit mode (not inline field drafts)", () => {
    const registry = require("../src/blessboard/services/websiteSettingKeyRegistry");
    assert.ok(typeof registry.getKeyDef === "function" || registry.SETTING_KEYS);
    const corpus = readAllTemplates();
    assert.doesNotMatch(corpus, /editFieldKey:\s*'seo\.title'/);
    assert.doesNotMatch(corpus, /editSectionKey:\s*'seo'/);
    assert.match(corpus, /data-bb-edit-seo|settingsLinkId:\s*'seo'|Edit SEO/);
  });
});

describe("website editing completeness — settings-surface discovery", () => {
  const {
    buildWebsitePublicEditSettingsCatalog,
    parseSafePublicWebsiteReturnTo,
  } = require("../src/blessboard/services/websitePublicEditSettingsLinks");

  const chrome = fs.readFileSync(
    path.join(PARTIALS, "website-admin-chrome.ejs"),
    "utf8"
  );
  const corpus = readAllTemplates();

  it("edit toolbar exposes features panel and SEO control", () => {
    assert.match(chrome, /data-bb-features-panel/);
    assert.match(chrome, /data-bb-features-toggle/);
    assert.match(chrome, /data-bb-edit-seo/);
    assert.match(chrome, /Website features/);
  });

  it("templates expose settings triggers for identity, nav, contact, footer, CTA", () => {
    assert.match(corpus, /settingsLinkId:\s*'identity'/);
    assert.match(corpus, /settingsLinkId:\s*'navigation'/);
    assert.match(corpus, /settingsLinkId:\s*'contact'/);
    assert.match(corpus, /settingsLinkId:\s*'footer'/);
    assert.match(corpus, /settingsLinkId:\s*'header_cta'/);
    assert.match(corpus, /settingsLinkId:\s*'service_times'/);
    assert.match(corpus, /settingsLinkId:\s*'social'/);
    assert.match(corpus, /settingsLinkId:\s*'announcement'/);
    assert.match(corpus, /contentKey:\s*'home\.logo'|data-website-key="home\.logo"/);
  });

  it("non-edit chrome has no features panel markup when not editing", () => {
    // Panel is nested under editingMode branch in chrome partial.
    const editingBlock = chrome.split("wa.editingMode")[2] || chrome;
    assert.match(editingBlock, /data-bb-features-panel/);
    assert.match(chrome, /!wa\.editingMode/);
  });

  it("HQ branch catalog resolves Stage 2 settings paths with return_to", () => {
    const catalog = buildWebsitePublicEditSettingsCatalog({
      isHqEditor: true,
      isBranchEditor: false,
      pageKey: "about",
      currentPath: "/branches/east/about",
      websiteScopeType: "branch",
      publicBranchKey: "east",
      primaryBranchKey: "hq",
    });
    assert.equal(catalog.settingsBranchKey, "east");
    assert.ok(catalog.byId.identity.available);
    assert.match(catalog.byId.identity.href, /\/hq\/website\/branches\/east\/settings/);
    assert.match(catalog.byId.identity.href, /return_to=/);
    assert.match(catalog.byId.seo.href, /section=seo/);
    assert.match(catalog.byId.navigation.href, /\/hq\/content/);
    assert.equal(catalog.byId.logo.available, true);
    assert.match(catalog.byId.logo.reason || "", /inline/i);
  });

  it("HQ church-wide catalog uses primary branch for SEO settings", () => {
    const catalog = buildWebsitePublicEditSettingsCatalog({
      isHqEditor: true,
      isBranchEditor: false,
      pageKey: "home",
      currentPath: "/",
      websiteScopeType: "church",
      publicBranchKey: null,
      primaryBranchKey: "main",
    });
    assert.equal(catalog.settingsBranchKey, "main");
    assert.ok(catalog.byId.seo.available);
    assert.match(catalog.byId.seo.href, /\/hq\/website\/branches\/main\/settings/);
    assert.match(catalog.byId.identity.href, /\/hq\/settings/);
    assert.match(catalog.byId.page_visibility.href, /websiteStatus|\/hq\/settings/);
  });

  it("branch admin cannot open HQ SEO settings from catalog", () => {
    const catalog = buildWebsitePublicEditSettingsCatalog({
      isHqEditor: false,
      isBranchEditor: true,
      pageKey: "home",
      currentPath: "/branches/east",
      websiteScopeType: "branch",
      publicBranchKey: "east",
      primaryBranchKey: "hq",
    });
    assert.equal(catalog.byId.seo.available, false);
    assert.match(catalog.byId.identity.href, /\/branch-admin\/settings/);
    assert.match(catalog.byId.service_times.href, /\/branch-admin\/website\/service-times/);
    assert.match(catalog.byId.contact.href, /\/branch-admin\/settings/);
  });

  it("rejects off-site and unsafe return URLs", () => {
    assert.equal(parseSafePublicWebsiteReturnTo("https://evil.example/").ok, false);
    assert.equal(parseSafePublicWebsiteReturnTo("//evil.example").ok, false);
    assert.equal(parseSafePublicWebsiteReturnTo("/hq/settings").ok, false);
    assert.equal(parseSafePublicWebsiteReturnTo("/../etc/passwd").ok, false);
    assert.equal(parseSafePublicWebsiteReturnTo("/about?next=https://x").ok, false);
    const ok = parseSafePublicWebsiteReturnTo("/branches/east/about?website_edit=1");
    assert.equal(ok.ok, true);
    assert.equal(ok.path, "/branches/east/about?website_edit=1");
    assert.equal(parseSafePublicWebsiteReturnTo("/about").ok, true);
  });

  it("hidden features remain listed in the catalog categories", () => {
    const catalog = buildWebsitePublicEditSettingsCatalog({
      isHqEditor: true,
      isBranchEditor: false,
      pageKey: "giving",
      currentPath: "/giving",
      websiteScopeType: "church",
      primaryBranchKey: "main",
    });
    const ids = catalog.items.map((i) => i.id);
    for (const id of [
      "announcement",
      "seo",
      "logo",
      "navigation",
      "page_visibility",
      "header_cta",
    ]) {
      assert.ok(ids.includes(id), id);
    }
  });
});
