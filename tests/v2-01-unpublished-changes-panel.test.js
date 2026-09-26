"use strict";

/**
 * V2.01 Unpublished Changes Panel —
 * page grouping, count, comparisons, navigation, empty state, permissions,
 * tenant isolation wiring, 390px parity.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  presentUnpublishedChangesPanel,
  STITCH_PANEL_SCREEN,
  relativeSavedLabel,
  splitContentKey,
} = require("../src/platform/website-engine/unpublishedChangesPanel");
const { CONTENT_TYPES } = require("../src/platform/website/contentTypes");
const changeManager = require("../src/platform/website/websiteChangeManagerService");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2.01 Unpublished Changes Panel", () => {
  it("groups pending changes by actual website page and counts accurately", () => {
    const panel = presentUnpublishedChangesPanel({
      changes: [
        {
          contentKey: "home.hero.heading",
          contentType: CONTENT_TYPES.SHORT_TEXT,
          oldValue: "Old home",
          proposedValue: "New home",
          changeType: "changed",
          updatedAt: new Date(Date.now() - 4 * 60000).toISOString(),
        },
        {
          contentKey: "home.hero.image",
          contentType: CONTENT_TYPES.IMAGE,
          oldValue: { src: "/a.jpg", alt: "A" },
          proposedValue: { src: "/b.jpg", alt: "B" },
          changeType: "changed",
        },
        {
          contentKey: "about.intro.body",
          contentType: CONTENT_TYPES.LONG_TEXT,
          oldValue: "About live",
          proposedValue: "About draft",
          changeType: "changed",
        },
      ],
      canPublish: true,
      canEdit: true,
      canRevert: true,
      previewHref: "/preview",
      publishPath: "/publish",
      discardPath: "/discard",
      pages: [
        { key: "home", label: "Home", icon: "home", editHref: "/edit/home" },
        { key: "about", label: "About", icon: "info", editHref: "/edit/about" },
      ],
      now: new Date(),
    });

    assert.equal(panel.pendingChangeCount, 3);
    assert.equal(panel.empty, false);
    assert.equal(panel.groups.length, 2);
    const home = panel.groups.find((g) => g.pageKey === "home");
    const about = panel.groups.find((g) => g.pageKey === "about");
    assert.ok(home);
    assert.ok(about);
    assert.equal(home.changeCount, 2);
    assert.equal(about.changeCount, 1);
    assert.match(panel.title, /Unpublished Changes \(3\)/);
    assert.equal(panel.publishLabel, "Publish All (3) Changes");
    assert.equal(panel.statusReadyLabel, "Ready for public visitors");
    assert.equal(panel.statusPendingLabel, "3 pending edits verified");
  });

  it("presents readable live-vs-draft text and image previews", () => {
    const panel = presentUnpublishedChangesPanel({
      changes: [
        {
          contentKey: "home.hero.heading",
          contentType: CONTENT_TYPES.SHORT_TEXT,
          oldValue: "Sunday 9:30",
          proposedValue: "Sunday 10:00",
        },
        {
          contentKey: "home.hero.image",
          contentType: CONTENT_TYPES.IMAGE,
          oldValue: { src: "https://cdn.example/live.jpg", alt: "Live hall" },
          proposedValue: { src: "https://cdn.example/draft.jpg", alt: "Draft hall" },
        },
      ],
      discardPath: "/discard",
      canEdit: true,
    });
    const text = panel.items.find((i) => i.contentKey === "home.hero.heading");
    const image = panel.items.find((i) => i.contentKey === "home.hero.image");
    assert.equal(text.liveText, "Sunday 9:30");
    assert.equal(text.draftText, "Sunday 10:00");
    assert.equal(text.typeLabel, "Text");
    assert.equal(image.isMedia, true);
    assert.equal(image.typeLabel, "Media");
    assert.equal(image.live.kind, "image");
    assert.ok(image.live.src);
    assert.ok(image.draft.src);
  });

  it("exposes navigation targets to the field editor per page", () => {
    const panel = presentUnpublishedChangesPanel({
      changes: [
        {
          contentKey: "contact.details.email",
          contentType: CONTENT_TYPES.EMAIL,
          oldValue: "a@x.com",
          proposedValue: "b@x.com",
        },
      ],
      pages: [{ key: "contact", label: "Contact", editHref: "/c/demo/contact?website_edit=1" }],
    });
    assert.equal(panel.items[0].editHref, "/c/demo/contact?website_edit=1");
    assert.equal(panel.items[0].canOpenEditor, true);
    assert.equal(splitContentKey("contact.details.email").pageKey, "contact");
  });

  it("renders a clear empty state when there are no pending changes", () => {
    const panel = presentUnpublishedChangesPanel({
      changes: [],
      previewHref: "/preview",
      publishPath: "/publish",
      canPublish: true,
    });
    assert.equal(panel.empty, true);
    assert.equal(panel.pendingChangeCount, 0);
    assert.equal(panel.groups.length, 0);
    assert.match(panel.emptyTitle, /No unpublished changes/i);
    assert.equal(panel.publishLabel, "Publish All Changes");
  });

  it("gates Publish and Revert by permissions / available safe discard", () => {
    const noPublish = presentUnpublishedChangesPanel({
      changes: [
        {
          contentKey: "home.a",
          contentType: CONTENT_TYPES.SHORT_TEXT,
          oldValue: "1",
          proposedValue: "2",
        },
      ],
      canPublish: false,
      publishPath: "/publish",
      previewHref: "/preview",
      discardPath: null,
      canEdit: true,
    });
    assert.equal(noPublish.showPublish, false);
    assert.equal(noPublish.publishLabel, null);
    assert.equal(noPublish.showRevert, false);
    assert.equal(noPublish.showPreview, true);

    const withRevert = presentUnpublishedChangesPanel({
      changes: [
        {
          contentKey: "home.a",
          contentType: CONTENT_TYPES.SHORT_TEXT,
          oldValue: "1",
          proposedValue: "2",
        },
      ],
      canPublish: true,
      canEdit: true,
      publishPath: "/publish",
      discardPath: "/discard",
    });
    assert.equal(withRevert.showPublish, true);
    assert.equal(withRevert.showRevert, true);
    assert.equal(withRevert.items[0].canRevert, true);
  });

  it("never invents a destructive revert when discard path is unavailable", () => {
    const panel = presentUnpublishedChangesPanel({
      changes: [
        {
          contentKey: "home.a",
          contentType: CONTENT_TYPES.SHORT_TEXT,
          oldValue: "1",
          proposedValue: "2",
        },
      ],
      canEdit: true,
      canRevert: true,
      discardPath: "",
    });
    assert.equal(panel.showRevert, false);
    assert.equal(panel.discardPath, null);
  });

  it("formats save status labels from updatedAt", () => {
    const now = new Date("2026-09-25T12:00:00Z");
    assert.equal(relativeSavedLabel(new Date("2026-09-25T11:56:00Z"), now), "Saved 4 mins ago");
    assert.equal(relativeSavedLabel(null, now), "Saved to draft");
  });

  it("wires shared panel into BB + AC shells and APIs with tenant-scoped URLs", () => {
    const panelEjs = read("views/platform/website-engine/unpublished-changes-panel.ejs");
    const overlays = read("views/platform/website-engine/editor-overlays.ejs");
    const js = read("public/platform/website-change-manager-ui.js");
    const css = read("public/platform/website-change-manager-ui.css");
    const bbRoutes = read("src/blessboard/http/blessboardWebsiteEditorRoutes.js");
    const acRoutes = read("src/activeclinic/http/activeClinicWebsiteRoutes.js");
    const bbChrome = read("src/blessboard/http/attachWebsiteAdminChrome.js");
    const acChrome = read("src/activeclinic/http/attachActiveClinicWebsiteChrome.js");

    assert.match(panelEjs, /data-website-unpublished-panel/);
    assert.match(panelEjs, /Draft Safe/);
    assert.match(panelEjs, /Visitors see live version/);
    assert.match(panelEjs, /data-website-panel-status/);
    assert.match(panelEjs, /Ready for public visitors/);
    assert.doesNotMatch(panelEjs, /org-switcher|select-organization/i);
    assert.match(overlays, /unpublished-changes-panel/);

    assert.match(js, /openUnpublishedPanel|openPanel/);
    assert.match(js, /data-website-pending-pill/);
    assert.match(js, /Preview Full Context/);
    assert.match(js, /data-website-panel-revert/);
    assert.match(js, /statusPendingLabel/);
    assert.match(css, /gp-cm-panel/);
    assert.match(css, /gp-cm-panel__status/);
    assert.match(css, /max-width:\s*430px/);

    assert.match(bbRoutes, /website\/unpublished-changes/);
    assert.match(bbRoutes, /getUnpublishedChangesPanel/);
    assert.match(bbRoutes, /revertFieldToPublished/);
    assert.match(acRoutes, /website\/unpublished-changes/);
    assert.match(acRoutes, /getUnpublishedChangesPanel/);
    assert.match(acRoutes, /revertFieldToPublished/);

    assert.match(bbChrome, /unpublishedChangesUrl/);
    assert.match(acChrome, /unpublishedChangesUrl/);
    assert.equal(STITCH_PANEL_SCREEN, "d205f226463c4e38b797b4757338404e");
    assert.equal(typeof changeManager.getUnpublishedChangesPanel, "function");
    assert.equal(typeof changeManager.revertFieldToPublished, "function");
  });

  it("keeps Preview and Publish All as separate permissioned actions", () => {
    const panel = presentUnpublishedChangesPanel({
      changes: [
        {
          contentKey: "home.a",
          contentType: CONTENT_TYPES.SHORT_TEXT,
          oldValue: "1",
          proposedValue: "2",
        },
      ],
      canPublish: true,
      previewHref: "/preview-only",
      publishPath: "/publish-all",
    });
    assert.equal(panel.previewHref, "/preview-only");
    assert.equal(panel.publishPath, "/publish-all");
    assert.match(panel.publishLabel, /Publish All/);
    assert.notEqual(panel.previewHref, panel.publishPath);
  });
});
