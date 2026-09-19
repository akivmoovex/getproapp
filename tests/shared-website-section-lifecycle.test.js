"use strict";

/**
 * Shared website section lifecycle — add → edit → remove for Text / Image+Text.
 * BUG-007 regression coverage for AC + BB adapters on the shared platform.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  presentSectionCapability,
  presentSectionManifest,
} = require("../src/platform/website-engine/presentSectionManifest");
const {
  parseCmsSectionFieldKey,
  customCmsSectionCapabilities,
  cmsSectionEditableField,
} = require("../src/platform/website-engine/sectionLifecycle");
const {
  buildManifest: buildActiveClinicManifest,
} = require("../src/activeclinic/website/activeClinicSectionActionService");
const {
  buildManifest: buildBlessBoardManifest,
} = require("../src/blessboard/website/blessboardSectionActionService");
const {
  assertEditableMutation,
  ensureProductFieldsRegistered,
  PRODUCT_CODE,
} = require("../src/platform/website/editableFieldSchema");
const { applyStructuredDraftsToModel } = require("../src/blessboard/services/websiteStructuredDraftService");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("shared website section lifecycle (BUG-007)", () => {
  it("shared menu and client expose remove with confirmation", () => {
    const menu = read("views/platform/website-engine/section-action-menu.ejs");
    const js = read("public/platform/website-section-actions.js");
    const labels = read("src/platform/website-engine/sectionActionLabels.js");
    assert.match(menu, /data-website-section-action="remove"/);
    assert.match(menu, /data-website-section-menu-panel="remove"/);
    assert.match(menu, /data-website-section-confirm-remove/);
    assert.match(js, /action === "remove"/);
    assert.match(js, /data-website-section-confirm-remove/);
    assert.match(js, /data-ac-section-id/);
    assert.match(labels, /removeConfirmAction/);
  });

  it("presentSectionCapability includes canRemove", () => {
    const cap = presentSectionCapability({
      sectionKey: "sabc",
      canEdit: true,
      canRemove: true,
      isCustom: true,
    });
    assert.equal(cap.canRemove, true);
    assert.equal(cap.isCustom, true);
  });

  it("cms.section field keys resolve for ActiveClinic inline edits", () => {
    ensureProductFieldsRegistered(PRODUCT_CODE.ACTIVECLINIC);
    const parsed = parseCmsSectionFieldKey("cms.section.sabc123def.heading");
    assert.equal(parsed.sectionId, "sabc123def");
    assert.equal(parsed.field, "heading");
    const field = cmsSectionEditableField("cms.section.sabc123def.body");
    assert.ok(field);
    assert.equal(field.storage.field, "body");
    const ok = assertEditableMutation({
      productCode: PRODUCT_CODE.ACTIVECLINIC,
      key: "cms.section.sabc123def.heading",
      value: "Hello clinic",
      grantedPermissions: ["website.edit"],
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.value, "Hello clinic");
  });

  it("AC manifest includes user-added text and image_text sections with remove", () => {
    const cmsSections = [
      {
        id: "sec_hero",
        page_id: "tpl_home",
        type: "hero",
        title: "Hero",
        visible: true,
        locked: true,
        sort_order: "0",
      },
      {
        id: "sec_introduction",
        page_id: "tpl_home",
        type: "text",
        title: "Introduction",
        visible: true,
        locked: false,
        sort_order: "1",
      },
      {
        id: "stext001abc",
        page_id: "tpl_home",
        type: "text",
        title: "Text",
        heading: "Added text",
        body: "Body copy",
        visible: true,
        locked: false,
        sort_order: "20",
      },
      {
        id: "simg002def",
        page_id: "tpl_home",
        type: "image_text",
        title: "Image + Text",
        heading: "Side by side",
        body: "With image",
        visible: true,
        locked: false,
        sort_order: "21",
        image: { src: "https://cdn.example/a.jpg" },
      },
    ];
    const manifest = buildActiveClinicManifest("home", cmsSections);
    assert.ok(manifest.sections.some((s) => s.sectionKey === "hero"));
    const text = manifest.sections.find((s) => s.sectionId === "stext001abc");
    const imageText = manifest.sections.find((s) => s.sectionId === "simg002def");
    assert.ok(text, "added text section missing from manifest");
    assert.ok(imageText, "added image_text section missing from manifest");
    assert.equal(text.canRemove, true);
    assert.equal(imageText.canRemove, true);
    assert.equal(text.canEdit, true);
    assert.equal(text.selector, '[data-ac-section-id="stext001abc"]');
    assert.equal(imageText.selector, '[data-ac-section-id="simg002def"]');
    const intro = manifest.sections.find((s) => s.sectionKey === "introduction");
    assert.ok(intro);
    assert.equal(intro.canRemove, false);
  });

  it("customCmsSectionCapabilities skips seeded sec_* rows", () => {
    const custom = customCmsSectionCapabilities({
      pageKey: "home",
      defaultCapabilities: [{ sectionId: "sec_hero" }],
      pageSections: [
        { id: "sec_hero", type: "hero", title: "Hero" },
        { id: "scustom1", type: "text", title: "Custom", locked: false },
      ],
    });
    assert.equal(custom.length, 1);
    assert.equal(custom[0].sectionId, "scustom1");
    assert.equal(custom[0].canRemove, true);
  });

  it("AC home template wires unique section ids and cms.section field keys", () => {
    const home = read("views/activeclinic/tenant/home.ejs");
    assert.match(home, /data-ac-section-id="<%= section\.id %>"/);
    assert.match(home, /cms\.section\.' \+ section\.id \+ '\.heading/);
    assert.match(home, /cms\.section\.' \+ section\.id \+ '\.body/);
    assert.match(home, /cms\.section\.' \+ section\.id \+ '\.image/);
  });

  it("BB draft add then remove updates the section model", () => {
    const model = {
      pageKey: "about",
      sections: [{ sectionKey: "story", sectionType: "story", heading: "Story", sortOrder: 10 }],
    };
    const withAdd = applyStructuredDraftsToModel(model, [
      {
        draftKind: "page_section",
        pageKey: "about",
        op: "add_section",
        sectionKey: "text_abc123",
        payload: {
          sectionKey: "text_abc123",
          sectionType: "plain_text",
          heading: "New section",
          bodyText: "Hello",
          sortOrder: 20,
        },
      },
    ]);
    assert.ok(withAdd.sections.some((s) => s.sectionKey === "text_abc123" && s._isDraftNew === true));
    const manifest = buildBlessBoardManifest("about", withAdd.sections, []);
    const added = manifest.sections.find((s) => s.sectionKey === "text_abc123");
    assert.ok(added);
    assert.equal(added.canRemove, true);
    assert.equal(added.canEdit, true);

    const withRemove = applyStructuredDraftsToModel(withAdd, [
      {
        draftKind: "page_section",
        pageKey: "about",
        op: "remove",
        sectionKey: "text_abc123",
        payload: { sectionKey: "text_abc123" },
      },
    ]);
    assert.ok(!withRemove.sections.some((s) => s.sectionKey === "text_abc123"));
  });

  it("BB allowlists dynamic text_/cta_ section field locators", () => {
    ensureProductFieldsRegistered(PRODUCT_CODE.BLESSBOARD);
    const ok = assertEditableMutation({
      productCode: PRODUCT_CODE.BLESSBOARD,
      pageKey: "about",
      sectionKey: "text_deadbeef",
      fieldKey: "heading",
      value: "Fresh heading",
      grantedPermissions: ["website.edit"],
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.value, "Fresh heading");
  });

  it("BB about/page templates expose editable wrappers for generic sections", () => {
    const about = read("views/blessboard/v5/public/about.ejs");
    const page = read("views/blessboard/v5/public/page.ejs");
    assert.match(about, /editFieldKey: 'heading'/);
    assert.match(about, /editFieldKey: 'bodyText'/);
    assert.match(page, /editFieldKey: 'heading'/);
    assert.match(page, /editFieldKey: 'bodyText'/);
  });

  it("presentSectionManifest keeps product selector attrs", () => {
    const manifest = presentSectionManifest({
      pageKey: "home",
      selectorAttr: "data-ac-section-id",
      sections: [{ sectionKey: "a", canRemove: true }],
    });
    assert.equal(manifest.selectorAttr, "data-ac-section-id");
    assert.equal(manifest.sections[0].canRemove, true);
  });
});
