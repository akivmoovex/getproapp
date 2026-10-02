"use strict";

/**
 * V2.05 QA12 — Home sermons_intro ("Full library") participates in the shared
 * website section contract: edit chrome, draft persistence, preview, publish, hide.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildManifest,
  ensureSermonsIntroPresentationSection,
  applyVisibilityDrafts,
  SERMONS_INTRO_SECTION_KEY,
} = require("../src/blessboard/website/blessboardSectionActionService");
const {
  applyStructuredDraftsToModel,
} = require("../src/blessboard/services/websiteStructuredDraftService");
const {
  resolveEditableField,
} = require("../src/blessboard/services/websiteInlineEditableFields");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2.05 QA12 sermons_intro section editability", () => {
  it("registers heading/body/buttonText on the home sermons_intro contract", () => {
    assert.ok(resolveEditableField("home", SERMONS_INTRO_SECTION_KEY, "heading"));
    assert.ok(resolveEditableField("home", SERMONS_INTRO_SECTION_KEY, "bodyText"));
    assert.ok(resolveEditableField("home", SERMONS_INTRO_SECTION_KEY, "buttonText"));
  });

  it("soft-ensures sermons_intro presentation section when sermon teasers render without CMS row", () => {
    const model = {
      pageKey: "home",
      sections: [{ sectionKey: "hero", sectionType: "hero", sortOrder: 0, status: "published" }],
      homeTeasers: {
        sermons: [{ id: "demo-1", title: "Grace for Today", speakerName: "Pastor" }],
      },
      homeDemoFallback: {
        sermonIntroHeading: "Latest Sermon",
        sermonIntroBody: "Watch recent teachings",
      },
    };
    ensureSermonsIntroPresentationSection(model, []);
    const section = model.sections.find((s) => s.sectionKey === SERMONS_INTRO_SECTION_KEY);
    assert.ok(section, "soft presentation stub missing");
    assert.equal(section._softPresentation, true);
    assert.equal(section.sectionType, "text");
    assert.equal(section.heading, "Latest Sermon");
    assert.equal(section.layoutMetadata.buttonText, "Full library");

    const manifest = buildManifest("home", model.sections, []);
    const cap = manifest.sections.find((s) => s.sectionKey === SERMONS_INTRO_SECTION_KEY);
    assert.ok(cap, "manifest missing sermons_intro");
    assert.equal(cap.canEdit, true);
    assert.equal(cap.canHide, true);
    assert.equal(cap.selector, '[data-section="sermons_intro"]');
  });

  it("does not re-add sermons_intro after a remove draft", () => {
    const model = {
      pageKey: "home",
      sections: [],
      homeTeasers: { sermons: [{ id: "s1", title: "One" }] },
      homeDemoFallback: {},
    };
    ensureSermonsIntroPresentationSection(model, [
      {
        draftKind: "page_section",
        pageKey: "home",
        op: "remove",
        sectionKey: SERMONS_INTRO_SECTION_KEY,
        payload: { sectionKey: SERMONS_INTRO_SECTION_KEY },
      },
    ]);
    assert.equal(
      model.sections.some((s) => s.sectionKey === SERMONS_INTRO_SECTION_KEY),
      false
    );
  });

  it("exposes section edit chrome wiring for sermons_intro on the home template", () => {
    const home = read("views/blessboard/v5/public/home.ejs");
    const chrome = read("src/blessboard/http/attachWebsiteAdminChrome.js");
    const actions = read("public/platform/website-section-actions.js");
    assert.match(home, /data-section="sermons_intro"/);
    assert.match(home, /editSectionKey:\s*'sermons_intro'/);
    assert.match(home, /Full library/);
    assert.match(home, /showSectionInPreview\(sermonsIntroSec\)/);
    assert.match(home, /suppressedHomeTeaserKeys/);
    assert.match(chrome, /ensureSermonsIntroPresentationSection/);
    assert.match(actions, /data-website-section-trigger/);
    assert.match(actions, /canEdit/);
    assert.match(actions, /canHide/);
  });

  it("hide draft marks sermons_intro hidden for preview while public model stays visible until publish", () => {
    const sections = [
      {
        sectionKey: SERMONS_INTRO_SECTION_KEY,
        sectionType: "text",
        heading: "Latest Sermon",
        status: "published",
        sortOrder: 40,
        layoutMetadata: { buttonText: "Full library" },
      },
    ];
    const hideDrafts = [
      {
        draftKind: "page_section",
        pageKey: "home",
        op: "visibility",
        sectionKey: SERMONS_INTRO_SECTION_KEY,
        payload: { sectionKey: SERMONS_INTRO_SECTION_KEY, hidden: true },
      },
    ];
    const draftView = applyVisibilityDrafts(sections, hideDrafts, "home");
    assert.equal(draftView[0]._draftHidden, true);
    assert.equal(draftView[0].status, "archived");

    const publicView = applyVisibilityDrafts(sections, [], "home");
    assert.equal(publicView[0]._draftHidden, false);
    assert.equal(publicView[0].status, "published");

    const previewManifest = buildManifest("home", sections, hideDrafts);
    const cap = previewManifest.sections.find((s) => s.sectionKey === SERMONS_INTRO_SECTION_KEY);
    assert.ok(cap);
    assert.equal(cap.isHidden, true);
    assert.equal(cap.canEdit, true);
    assert.equal(cap.canHide, true);
  });

  it("heading edit via update_section draft overlays the presentation section without touching sermon entities", () => {
    const model = {
      pageKey: "home",
      sections: [
        {
          sectionKey: SERMONS_INTRO_SECTION_KEY,
          sectionType: "text",
          heading: "Latest Sermon",
          bodyText: "",
          sortOrder: 40,
          status: "published",
          layoutMetadata: { buttonText: "Full library" },
        },
      ],
      homeTeasers: {
        sermons: [{ id: "sermon-live", title: "Keep This Title", speakerName: "A" }],
      },
      entities: [],
    };
    applyStructuredDraftsToModel(model, [
      {
        draftKind: "page_section",
        pageKey: "home",
        op: "update_section",
        sectionKey: SERMONS_INTRO_SECTION_KEY,
        payload: {
          sectionKey: SERMONS_INTRO_SECTION_KEY,
          heading: "Full Teaching Library",
          bodyText: "Browse our archive",
        },
      },
    ]);
    const section = model.sections.find((s) => s.sectionKey === SERMONS_INTRO_SECTION_KEY);
    assert.equal(section.heading, "Full Teaching Library");
    assert.equal(section.bodyText, "Browse our archive");
    assert.equal(model.homeTeasers.sermons[0].title, "Keep This Title");
  });

  it("publish apply path materializes soft sermons_intro on hide (contract source check)", () => {
    const applySrc = read("src/blessboard/services/websiteDraftApplyService.js");
    assert.match(applySrc, /sectionKey === "sermons_intro"/);
    assert.match(applySrc, /ensureSection\(client, page, sectionKey, "text"\)/);
    assert.match(applySrc, /status: payload\.hidden === true \? "archived" : "published"/);
  });
});
