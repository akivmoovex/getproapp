"use strict";

/**
 * V2.01 Editor Toolbar + Friendly Publishing Reminder —
 * count, threshold, dismissal, navigation, save status, permissions, mobile, BB+AC.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  REMINDER_THRESHOLD,
  STITCH_PROJECT_ID,
  STITCH_TOOLBAR_SCREEN,
  STITCH_REMINDER_SCREEN,
  SAVE_STATUS,
  normalizePendingCount,
  publishButtonLabel,
  pendingChangesPillLabel,
  reminderShouldOffer,
  reminderCopy,
  reminderDismissTodayKey,
  reminderSuppressKey,
  mayShowSavedStatus,
  saveStatusLabel,
  websiteScopeKeyFor,
  applyChangeManagerToolbar,
} = require("../src/platform/website-engine/changeManagerUi");
const { presentEditorShell } = require("../src/platform/website-engine/editorShell");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2.01 Change Manager toolbar + reminders", () => {
  it("normalizes pending counts and never invents negative values", () => {
    assert.equal(normalizePendingCount(undefined), 0);
    assert.equal(normalizePendingCount(-3), 0);
    assert.equal(normalizePendingCount("4.9"), 4);
    assert.equal(normalizePendingCount(NaN), 0);
  });

  it("formats pending pill and publish labels from distinct-field counts", () => {
    assert.equal(pendingChangesPillLabel(1), "1 unpublished change");
    assert.equal(pendingChangesPillLabel(5), "5 unpublished changes");
    assert.equal(publishButtonLabel(0, "Publish"), "Publish");
    assert.equal(publishButtonLabel(5, "Publish"), "Publish (5)");
  });

  it("uses reminder threshold of five meaningful unpublished changes", () => {
    assert.equal(REMINDER_THRESHOLD, 5);
    assert.equal(reminderShouldOffer(4), false);
    assert.equal(reminderShouldOffer(5), true);
    assert.equal(reminderShouldOffer(6, { saving: true }), false);
    assert.equal(reminderShouldOffer(6, { uploading: true }), false);
    assert.equal(reminderShouldOffer(6, { dismissedForToday: true }), false);
    assert.equal(
      reminderShouldOffer(6, { suppressedUntilCountChanges: true, lastShownAtCount: 6 }),
      false
    );
    assert.equal(
      reminderShouldOffer(7, { suppressedUntilCountChanges: true, lastShownAtCount: 6 }),
      true
    );
  });

  it("scopes dismissal keys per website and UTC day", () => {
    const keyA = reminderDismissTodayKey("blessboard:orgA:inst1", "2026-09-25T12:00:00Z");
    const keyB = reminderDismissTodayKey("blessboard:orgB:inst1", "2026-09-25T12:00:00Z");
    const keyNextDay = reminderDismissTodayKey("blessboard:orgA:inst1", "2026-09-26T01:00:00Z");
    assert.notEqual(keyA, keyB);
    assert.notEqual(keyA, keyNextDay);
    assert.match(keyA, /2026-09-25/);
    assert.equal(reminderSuppressKey("ac:org:inst"), "gp_cm_reminder_suppress_ac:org:inst");
  });

  it("never treats saving/failed as Drafts saved", () => {
    assert.equal(mayShowSavedStatus(SAVE_STATUS.SAVED), true);
    assert.equal(mayShowSavedStatus(SAVE_STATUS.SAVING), false);
    assert.equal(mayShowSavedStatus(SAVE_STATUS.UPLOADING), false);
    assert.equal(mayShowSavedStatus(SAVE_STATUS.FAILED), false);
    assert.equal(saveStatusLabel(SAVE_STATUS.SAVED), "Drafts saved");
    assert.equal(saveStatusLabel(SAVE_STATUS.SAVING), "Saving…");
  });

  it("reminder copy offers Preview Changes without publish language", () => {
    const copy = reminderCopy(5);
    assert.equal(copy.previewCta, "Preview Changes");
    assert.equal(copy.keepEditingCta, "Keep Editing");
    assert.match(copy.dontShowToday, /Don't show this reminder again today/i);
    assert.match(copy.compactNav, /never automatic/i);
    assert.doesNotMatch(copy.body, /auto-?publish/i);
  });

  it("respects website.publish — Publish omitted when canPublish is false", () => {
    const denied = presentEditorShell({
      productCode: "blessboard",
      unpublishedCount: 5,
      canPublish: false,
      publishPath: "/publish",
      previewHref: "/preview",
      historyHref: "/history",
      organizationId: "org-bb",
      instanceId: "inst-bb",
    });
    assert.equal(denied.canPublish, false);
    assert.equal(denied.changeManager.showPublish, false);
    assert.equal(denied.changeManager.publishLabel, null);
    assert.equal(denied.changeManager.showHistory, true);
    assert.equal(denied.changeManager.showPreview, true);
    assert.equal(denied.changeManager.reminder.enabled, true);
    assert.equal(denied.changeManager.reminder.previewOnly, true);

    const allowed = presentEditorShell({
      productCode: "activeclinic",
      unpublishedCount: 2,
      canPublish: true,
      publishPath: "/publish",
      previewHref: "/preview",
      organizationId: "org-ac",
      instanceId: "inst-ac",
    });
    assert.equal(allowed.changeManager.showPublish, true);
    assert.equal(allowed.changeManager.publishLabel, "Publish (2)");
    // Idempotent when toolbar helper is applied twice.
    assert.equal(
      applyChangeManagerToolbar(allowed).changeManager.publishLabel,
      "Publish (2)"
    );
  });

  it("builds website-scoped keys for BB and AC without org switcher", () => {
    const bb = websiteScopeKeyFor("blessboard", "org1", "inst1");
    const ac = websiteScopeKeyFor("activeclinic", "org2", "inst2");
    assert.equal(bb, "blessboard:org1:inst1");
    assert.equal(ac, "activeclinic:org2:inst2");
    assert.notEqual(bb, ac);
  });

  it("wires shared Stitch chrome, reminder, and assets into BB + AC shells", () => {
    const chrome = read("views/platform/website-engine/editor-chrome.ejs");
    const reminder = read("views/platform/website-engine/publishing-reminder.ejs");
    const overlays = read("views/platform/website-engine/editor-overlays.ejs");
    const bbStart = read("views/blessboard/v5/partials/tenant-public-shell-start.ejs");
    const bbEnd = read("views/blessboard/v5/partials/tenant-public-shell-end.ejs");
    const acShell = read("views/activeclinic/layouts/public-shell.ejs");
    const uiJs = read("public/platform/website-change-manager-ui.js");
    const inline = read("public/platform/website-inline-edit.js");
    const css = read("public/platform/website-change-manager-ui.css");

    assert.match(chrome, /data-website-engine-history/);
    assert.match(chrome, /data-website-engine-preview/);
    assert.match(chrome, /data-website-publish-label/);
    assert.match(chrome, /data-website-pending-pill/);
    assert.match(chrome, /data-website-save-status/);
    assert.match(chrome, /data-website-nav-reminder/);
    assert.match(chrome, /data-website-scope-key/);
    assert.doesNotMatch(chrome, /org-switcher|select-organization/i);

    assert.match(reminder, /data-website-publishing-reminder/);
    assert.match(reminder, /Preview Changes/);
    assert.match(reminder, /Keep Editing/);
    assert.match(reminder, /Don't show this reminder again today/);
    assert.match(reminder, /data-website-reminder-preview/);
    assert.doesNotMatch(reminder, /confirm_publish|name="makePublic"|type="submit"/i);
    assert.doesNotMatch(reminder, /org-switcher|select-organization/i);

    assert.match(overlays, /publishing-reminder/);
    assert.match(bbStart, /website-change-manager-ui\.css/);
    assert.match(bbEnd, /website-change-manager-ui\.js/);
    assert.match(acShell, /website-change-manager-ui\.css/);
    assert.match(acShell, /website-change-manager-ui\.js/);

    assert.match(uiJs, /gp:website-save-start/);
    assert.match(uiJs, /gp:website-save-success/);
    assert.match(uiJs, /gp:website-save-error/);
    assert.match(uiJs, /Never show "Drafts saved"/);
    assert.match(uiJs, /Preview only — never submit publish/);
    assert.match(inline, /gp:website-save-start/);
    assert.match(inline, /pendingChangeCount/);
    assert.match(inline, /Do not locally invent pending counts/);

    assert.match(css, /max-width:\s*430px/);
    assert.match(css, /#004357/);
    assert.match(css, /#ffdcc3/);
    assert.equal(STITCH_PROJECT_ID, "12538817760086591589");
    assert.equal(STITCH_TOOLBAR_SCREEN, "863c719271a242e696406112b9f80ee9");
    assert.equal(STITCH_REMINDER_SCREEN, "d9f101c607e3469b84fdbcdcd6d0c062");
  });

  it("returns pendingChangeCount from BB and AC draft save routes", () => {
    const bb = read("src/blessboard/http/blessboardWebsiteEditorRoutes.js");
    const ac = read("src/activeclinic/http/activeClinicWebsiteRoutes.js");
    assert.match(bb, /pendingChangeCount/);
    assert.match(bb, /getPendingChangeSummary/);
    assert.match(ac, /pendingChangeCount/);
    assert.match(ac, /getPendingChangeSummary/);
  });

  it("attaches websiteScopeKey from BB and AC chrome attachers", () => {
    const bb = read("src/blessboard/http/attachWebsiteAdminChrome.js");
    const ac = read("src/activeclinic/http/attachActiveClinicWebsiteChrome.js");
    assert.match(bb, /websiteScopeKeyFor/);
    assert.match(bb, /getPendingChangeSummary/);
    assert.match(ac, /websiteScopeKeyFor/);
    assert.match(ac, /websiteScopeKey:/);
  });

  it("compact page-navigation reminder markup is present for both products via shared chrome", () => {
    const chrome = read("views/platform/website-engine/editor-chrome.ejs");
    const bbChrome = read("views/blessboard/v5/partials/website-admin-chrome.ejs");
    const acChrome = read("views/activeclinic/partials/website-editor-chrome.ejs");
    assert.match(chrome, /data-website-nav-reminder/);
    assert.match(chrome, /data-website-nav-reminder-preview/);
    assert.match(bbChrome, /platform\/website-engine\/editor-chrome/);
    assert.match(acChrome, /platform\/website-engine\/editor-chrome/);
  });
});
