"use strict";

/**
 * V2.05 Task 5 — Unpublished change counter + PublishNudge.
 * Meaningful saved mutations only (Change Manager). Keystrokes do not count.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { PRODUCT_CODE } = require("../src/platform/website/publicWebsiteUrl");
const {
  buildWebsiteManagementHub,
  defaultAcWebsiteHubPaths,
  defaultBbWebsiteHubPaths,
} = require("../src/platform/website/websiteManagementHub");
const {
  PUBLISH_NUDGE,
  REMINDER_THRESHOLD,
  normalizePendingCount,
  publishNudgeTitle,
  publishNudgeCopy,
  publishNudgeSessionDismissKey,
  shouldShowPublishNudge,
  buildPublishNudge,
  attachPublishNudgeToHub,
} = require("../src/platform/website/publishNudge");
const {
  reminderShouldOffer,
  reminderCopy,
  applyChangeManagerToolbar,
} = require("../src/platform/website-engine/changeManagerUi");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2.05 PublishNudge Batch5", () => {
  it("FINAL=V205_PUBLISH_NUDGE_DONE", () => {
    assert.equal(PUBLISH_NUDGE.pattern, "PublishNudge");
    assert.equal(PUBLISH_NUDGE.threshold, 5);
    assert.equal(PUBLISH_NUDGE.countsKeystrokes, false);
    assert.equal(PUBLISH_NUDGE.countsMeaningfulSavesOnly, true);
    assert.equal(PUBLISH_NUDGE.forcesPublish, false);
    assert.equal(PUBLISH_NUDGE.blocking, false);
    assert.ok(PUBLISH_NUDGE.surfaces.includes("admin_console_website"));
    assert.ok(PUBLISH_NUDGE.surfaces.includes("website_editor"));
    assert.equal(REMINDER_THRESHOLD, 5);
  });

  it("0–4 changes = no reminder; 5th meaningful change = reminder", () => {
    for (let n = 0; n <= 4; n += 1) {
      assert.equal(shouldShowPublishNudge(n), false, `count ${n}`);
      assert.equal(reminderShouldOffer(n), false, `cm count ${n}`);
      assert.equal(buildPublishNudge({ unpublishedChangeCount: n }).visible, false);
    }
    assert.equal(shouldShowPublishNudge(5), true);
    assert.equal(reminderShouldOffer(5), true);
    assert.equal(buildPublishNudge({ unpublishedChangeCount: 5 }).visible, true);
    assert.equal(publishNudgeTitle(5), "You have 5 unpublished changes.");
  });

  it("keystrokes do not increment — count is Change Manager draft-vs-published only", () => {
    const nudge = buildPublishNudge({ unpublishedChangeCount: 3 });
    assert.equal(nudge.countsKeystrokes, false);
    assert.equal(nudge.countsMeaningfulSavesOnly, true);
    assert.equal(nudge.source, "change_manager_draft_vs_published");
    assert.equal(normalizePendingCount("3"), 3);

    const inline = read("public/platform/website-inline-edit.js");
    const uiJs = read("public/platform/website-change-manager-ui.js");
    const service = read("src/platform/website/websiteChangeManagerService.js");
    assert.match(inline, /Do not locally invent pending counts/);
    assert.match(inline, /pendingChangeCount/);
    assert.match(uiJs, /gp:website-save-success/);
    assert.doesNotMatch(uiJs, /keydown[\s\S]{0,80}pendingChangeCount|pendingChangeCount[\s\S]{0,80}keydown/);
    assert.match(service, /distinct content keys|Distinct by content key|pendingChangeCount: distinct\.size/);
  });

  it("save success path increments from server pendingChangeCount only", () => {
    const uiJs = read("public/platform/website-change-manager-ui.js");
    const inline = read("public/platform/website-inline-edit.js");
    assert.match(uiJs, /onMeaningfulSave/);
    assert.match(uiJs, /detail\.pendingChangeCount/);
    assert.match(inline, /gp:website-save-success/);
    assert.match(inline, /pendingChangeCount/);
  });

  it("dismiss works for session and does not reappear every edit", () => {
    assert.equal(shouldShowPublishNudge(6, { sessionDismissed: true }), false);
    assert.equal(shouldShowPublishNudge(8, { sessionDismissed: true }), false);
    assert.equal(shouldShowPublishNudge(6, { sessionDismissed: false }), true);
    const key = publishNudgeSessionDismissKey("activeclinic:org:inst");
    assert.match(key, /^gp_cm_publish_nudge_session_/);

    const uiJs = read("public/platform/website-change-manager-ui.js");
    assert.match(uiJs, /sessionDismiss:\s*true/);
    assert.match(uiJs, /dismissedThisSession/);
    assert.match(uiJs, /sessionStorage/);

    const hubPartial = read("views/platform/website-engine/publish-nudge.ejs");
    assert.match(hubPartial, /data-gp-publish-nudge-dismiss/);
    assert.match(hubPartial, /sessionStorage/);
  });

  it("publish resets / recalculates when pending count returns to zero", () => {
    const uiJs = read("public/platform/website-change-manager-ui.js");
    assert.match(uiJs, /clearReminderDismissal/);
    assert.match(uiJs, /if \(n < 1\)/);
    assert.match(uiJs, /sessionRemove|sessionStorage\.removeItem/);

    const afterPublish = buildPublishNudge({ unpublishedChangeCount: 0 });
    assert.equal(afterPublish.visible, false);
    assert.equal(afterPublish.unpublishedChangeCount, 0);
  });

  it("PublishNudge actions are Review Changes, Preview, Publish, Dismiss — never forced", () => {
    const copy = publishNudgeCopy(5);
    assert.equal(copy.reviewChangesCta, "Review Changes");
    assert.equal(copy.previewCta, "Preview");
    assert.equal(copy.publishCta, "Publish");
    assert.equal(copy.dismissCta, "Dismiss");

    const nudge = buildPublishNudge({
      unpublishedChangeCount: 5,
      canPublish: true,
      previewHref: "/preview",
      publishHref: "/publish",
      reviewHref: "/changes",
    });
    assert.equal(nudge.forcesPublish, false);
    assert.equal(nudge.actions.preview.publishes, false);
    assert.equal(nudge.actions.publish.forcesPublish, false);
    assert.equal(nudge.actions.publish.available, true);
    assert.equal(nudge.actions.reviewChanges.href, "/changes");
    assert.equal(nudge.actions.dismiss.sessionOnly, true);

    const denied = buildPublishNudge({
      unpublishedChangeCount: 5,
      canPublish: false,
      publishHref: "/publish",
    });
    assert.equal(denied.actions.publish.available, false);
    assert.equal(denied.actions.publish.href, null);

    const reminder = read("views/platform/website-engine/publishing-reminder.ejs");
    assert.match(reminder, /data-website-reminder-review/);
    assert.match(reminder, /data-website-reminder-preview/);
    assert.match(reminder, /data-website-reminder-publish/);
    assert.match(reminder, /data-website-reminder-dismiss/);
    assert.doesNotMatch(reminder, /type="submit"/);
  });

  it("Admin Console Website displays continuous unpublished count + PublishNudge (AC + BB)", () => {
    const ac = buildWebsiteManagementHub({
      productCode: PRODUCT_CODE.ACTIVECLINIC,
      paths: defaultAcWebsiteHubPaths({
        clinicKey: "demo",
        actions: {
          editWebsite: "/clinics/demo?website_edit=1",
          preview: "/clinics/demo?website_mode=draft",
          publishPath: "/app/settings/website/publish",
        },
      }),
      capabilities: { canEdit: true, canPublish: true },
      draftChangesCount: 5,
      unpublishedChanges: true,
      exists: true,
    });
    assert.equal(ac.status.draftChangesCount, 5);
    assert.equal(ac.status.continuousUnpublishedCount, 5);
    assert.equal(ac.publishNudge.pattern, "PublishNudge");
    assert.equal(ac.publishNudge.visible, true);
    assert.equal(ac.publishNudge.title, "You have 5 unpublished changes.");

    const bb = buildWebsiteManagementHub({
      productCode: PRODUCT_CODE.BLESSBOARD,
      paths: defaultBbWebsiteHubPaths({
        actions: {
          editWebsite: "/c/demo?website_edit=1",
          preview: "/hq/content/preview/home",
          publishPath: "/hq/website/publish/review",
        },
      }),
      capabilities: { canEdit: true, canPublish: true },
      draftChangesCount: 2,
    });
    assert.equal(bb.status.continuousUnpublishedCount, 2);
    assert.equal(bb.publishNudge.visible, false);

    const acHub = read("views/activeclinic/app/settings-website-content.ejs");
    const bbHub = read("views/blessboard/v5/hq/website-management.ejs");
    assert.match(acHub, /publish-nudge/);
    assert.match(bbHub, /publish-nudge/);
    assert.match(acHub, /data-gp-continuous-unpublished-count/);
    assert.match(bbHub, /data-gp-continuous-unpublished-count/);
    assert.match(acHub, /data-gp-unpublished-change-count/);
    assert.match(bbHub, /data-gp-unpublished-change-count/);
  });

  it("website editor shares the same PublishNudge / Change Manager count model", () => {
    const shell = applyChangeManagerToolbar(
      {
        productCode: "activeclinic",
        unpublishedCount: 5,
        canPublish: true,
        publishPath: "/publish",
        previewHref: "/preview",
        organizationId: "org",
        instanceId: "inst",
      },
      {}
    );
    assert.equal(shell.changeManager.reminder.pattern, "PublishNudge");
    assert.equal(shell.changeManager.reminder.enabled, true);
    assert.equal(shell.changeManager.reminder.forcesPublish, false);
    assert.ok(shell.changeManager.reminder.sessionDismissKey);
    assert.equal(reminderCopy(5).title, "You have 5 unpublished changes.");

    const chrome = read("views/platform/website-engine/editor-chrome.ejs");
    assert.match(chrome, /data-website-pending-pill/);
    assert.match(read("views/platform/website-engine/editor-overlays.ejs"), /publishing-reminder/);
  });

  it("attachPublishNudgeToHub is idempotent over Change Manager counts", () => {
    const hub = attachPublishNudgeToHub(
      {
        productCode: PRODUCT_CODE.ACTIVECLINIC,
        modules: [{ key: "changeManager", href: "/changes" }],
        status: { draftChangesCount: 5 },
      },
      { canPublish: true, publishHref: "/publish", previewHref: "/preview" }
    );
    assert.equal(hub.publishNudge.unpublishedChangeCount, 5);
    assert.equal(hub.publishNudge.actions.reviewChanges.href, "/changes");
  });
});
