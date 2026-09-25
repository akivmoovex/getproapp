"use strict";

/**
 * V2.01 Field History and Restore —
 * choices, restores, missing history/media, unrelated draft preservation,
 * counter, concurrency wiring, tenant isolation, auth, no auto-publish, BB+AC.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  presentFieldHistoryRestore,
  CHOICE,
  STITCH_HISTORY_SCREEN,
} = require("../src/platform/website-engine/fieldHistoryRestore");
const { CONTENT_TYPES } = require("../src/platform/website/contentTypes");
const changeManager = require("../src/platform/website/websiteChangeManagerService");
const contentService = require("../src/platform/website/contentService");
const publicationService = require("../src/platform/website/publicationService");
const { PERMISSIONS } = require("../src/platform/website/permissions");
const { PUBLISH_POLICY } = require("../src/platform/website/publishPolicy");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2.01 Field History and Restore — presentation", () => {
  it("offers undo / currently published / earlier published when data exists; previously saved unavailable", () => {
    const panel = presentFieldHistoryRestore({
      canEdit: true,
      history: {
        contentKey: "home.hero.title",
        contentType: CONTENT_TYPES.SHORT_TEXT,
        supportsFieldHistory: true,
        entries: [
          {
            kind: "published_version",
            versionId: "v-old",
            versionNumber: 1,
            publishedAt: "2024-10-01T09:00:00Z",
            newValue: "Earlier copy",
            contentType: CONTENT_TYPES.SHORT_TEXT,
          },
          {
            kind: "published_version",
            versionId: "v-live",
            versionNumber: 2,
            publishedAt: "2024-10-14T09:00:00Z",
            newValue: "Live copy",
            contentType: CONTENT_TYPES.SHORT_TEXT,
          },
          {
            kind: "current_draft",
            newValue: "Draft copy",
            oldValue: "Live copy",
          },
        ],
      },
      row: {
        contentKey: "home.hero.title",
        contentType: CONTENT_TYPES.SHORT_TEXT,
        draftValue: "Draft copy",
        publishedValue: "Live copy",
        updatedAt: "2026-09-25T12:00:00Z",
      },
    });

    assert.equal(panel.stitchScreenId, STITCH_HISTORY_SCREEN);
    assert.equal(panel.hasPendingChanges, true);
    assert.match(panel.confirmLabel, /Does Not Publish/i);

    const byChoice = Object.fromEntries(panel.choices.map((c) => [c.choice === CHOICE.EARLIER_PUBLISHED ? c.id : c.choice, c]));
    assert.equal(byChoice[CHOICE.UNDO_CURRENT_EDIT].restorable, true);
    assert.equal(byChoice[CHOICE.PREVIOUSLY_SAVED].available, false);
    assert.equal(byChoice[CHOICE.PREVIOUSLY_SAVED].restorable, false);
    assert.match(byChoice[CHOICE.PREVIOUSLY_SAVED].unavailableReason, /not stored/i);
    assert.equal(byChoice[CHOICE.CURRENTLY_PUBLISHED].restorable, true);
    assert.ok(byChoice["earlier_published:v-old"]);
    assert.equal(byChoice["earlier_published:v-old"].restorable, true);
    assert.equal(byChoice["earlier_published:v-old"].preview.text, "Earlier copy");
    assert.equal(panel.draftPreview.text, "Draft copy");
    assert.equal(panel.publishedPreview.text, "Live copy");
  });

  it("never fabricates previously saved draft history", () => {
    const panel = presentFieldHistoryRestore({
      canEdit: true,
      history: {
        contentKey: "home.a",
        contentType: CONTENT_TYPES.SHORT_TEXT,
        supportsFieldHistory: true,
        entries: [],
      },
      row: {
        contentKey: "home.a",
        draftValue: "x",
        publishedValue: "x",
      },
    });
    const prev = panel.choices.find((c) => c.choice === CHOICE.PREVIOUSLY_SAVED);
    assert.equal(prev.available, false);
    assert.equal(prev.value, null);
  });

  it("marks historical media unavailable when ownership check fails", () => {
    const panel = presentFieldHistoryRestore({
      canEdit: true,
      history: {
        contentKey: "home.hero.image",
        contentType: CONTENT_TYPES.IMAGE,
        supportsFieldHistory: true,
        entries: [
          {
            kind: "published_version",
            versionId: "v1",
            versionNumber: 1,
            newValue: { mediaId: "00000000-0000-4000-8000-000000000001", src: "/gone.jpg" },
          },
          {
            kind: "published_version",
            versionId: "v2",
            versionNumber: 2,
            newValue: { mediaId: "00000000-0000-4000-8000-000000000002", src: "/live.jpg" },
          },
        ],
      },
      row: {
        contentKey: "home.hero.image",
        contentType: CONTENT_TYPES.IMAGE,
        draftValue: { mediaId: "00000000-0000-4000-8000-000000000002", src: "/live.jpg" },
        publishedValue: { mediaId: "00000000-0000-4000-8000-000000000002", src: "/live.jpg" },
      },
      mediaAvailability: {
        "earlier_published:v1": { ok: false, code: "media_not_found" },
      },
    });
    const earlier = panel.choices.find((c) => c.id === "earlier_published:v1");
    assert.equal(earlier.available, false);
    assert.equal(earlier.restorable, false);
    assert.match(earlier.unavailableReason, /media/i);
  });

  it("hides restore when edit permission is missing", () => {
    const panel = presentFieldHistoryRestore({
      canEdit: false,
      history: {
        contentKey: "home.a",
        contentType: CONTENT_TYPES.SHORT_TEXT,
        supportsFieldHistory: true,
        entries: [],
      },
      row: {
        draftValue: "draft",
        publishedValue: "live",
      },
    });
    assert.ok(panel.choices.every((c) => c.restorable !== true));
  });

  it("wires History beside pencil and restore APIs for BB + AC", () => {
    const bbText = read("views/blessboard/v5/partials/editable-text.ejs");
    const bbImage = read("views/blessboard/v5/partials/editable-image.ejs");
    const acText = read("views/activeclinic/partials/website-editable-field.ejs");
    const acImage = read("views/activeclinic/partials/website-editable-image.ejs");
    const overlays = read("views/platform/website-engine/editor-overlays.ejs");
    const histEjs = read("views/platform/website-engine/field-history-restore.ejs");
    const js = read("public/platform/website-change-manager-ui.js");
    const css = read("public/platform/website-change-manager-ui.css");
    const bbRoutes = read("src/blessboard/http/blessboardWebsiteEditorRoutes.js");
    const acRoutes = read("src/activeclinic/http/activeClinicWebsiteRoutes.js");
    const inline = read("public/platform/website-inline-edit.js");

    assert.match(bbText, /data-website-field-history-open/);
    assert.match(bbImage, /data-website-field-history-open/);
    assert.match(acText, /data-website-field-history-open/);
    assert.match(acImage, /data-website-field-history-open/);
    assert.match(overlays, /field-history-restore/);
    assert.match(histEjs, /Restore This Version to Draft \(Does Not Publish\)/);
    assert.doesNotMatch(histEjs, /confirm_publish|makePublic/);
    assert.match(js, /openFieldHistory/);
    assert.match(js, /expectedUpdatedAt/);
    assert.match(css, /gp-cm-history/);
    assert.match(css, /max-width:\s*430px/);
    assert.match(bbRoutes, /field-history\/restore/);
    assert.match(bbRoutes, /restoreFieldRevisionToDraft/);
    assert.match(acRoutes, /field-history\/restore/);
    assert.match(acRoutes, /expectedUpdatedAt/);
    assert.match(inline, /expectedUpdatedAt/);
    assert.equal(typeof changeManager.restoreFieldRevisionToDraft, "function");
    assert.equal(typeof changeManager.getFieldHistoryRestorePanel, "function");
  });
});

describe("V2.01 Field History and Restore — service", () => {
  let pool = null;
  let skipReason = null;
  let stamp = 0;

  before(async () => {
    try {
      const {
        resetFoundationDatabase,
        createFoundationPool,
        foundationDbUnavailableSkipReason,
      } = require("./helpers/foundationDb");
      skipReason = foundationDbUnavailableSkipReason();
      if (skipReason) return;
      await resetFoundationDatabase();
      const { migrate } = require("../db/scripts/lib/migrator");
      pool = createFoundationPool();
      await migrate({ connectionString: process.env.DATABASE_URL || process.env.FOUNDATION_DATABASE_URL });
    } catch (err) {
      skipReason = String((err && err.message) || err);
      pool = null;
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  async function seedTenant(suffix) {
    stamp += 1;
    const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
    const { CODE_ACTIVECLINIC_ORG_V6 } = require("../src/platform/config/deploymentProfiles");
    const {
      registerActiveClinicWebsiteTemplate,
      ACTIVECLINIC_TEMPLATE_ID,
      ACTIVECLINIC_TEMPLATE_VERSION,
    } = require("../src/activeclinic/website/activeClinicWebsiteTemplate");
    const { provisionWebsiteInstance } = require("../src/platform/website/provisionService");
    registerActiveClinicWebsiteTemplate();
    const org = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `fh_${suffix}_${stamp}`,
      displayName: `Field History ${suffix}`,
      productKey: "activeclinic",
      productTenantKey: `fh-${suffix}-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(org.ok, true, JSON.stringify(org));
    const provisioned = await provisionWebsiteInstance(pool, {
      organizationId: org.records.organization.id,
      templateId: ACTIVECLINIC_TEMPLATE_ID,
      templateVersion: ACTIVECLINIC_TEMPLATE_VERSION,
      slug: `fh-${suffix}-${stamp}`,
      status: "coming_soon",
      publishPolicy: PUBLISH_POLICY.TENANT_PUBLISH,
    });
    assert.equal(provisioned.ok, true, JSON.stringify(provisioned));
    return {
      organizationId: org.records.organization.id,
      instance: provisioned.instance,
    };
  }

  it("restores currently published / undo without publishing; preserves unrelated drafts; updates count", async (t) => {
    if (skipReason || !pool) return t.skip(skipReason || "no foundation db");
    const tenant = await seedTenant("restore");
    const grants = [PERMISSIONS.VIEW, PERMISSIONS.EDIT, PERMISSIONS.PUBLISH];
    const keyA = "home.hero.title";
    const keyB = "home.hero.subtitle";

    await contentService.saveWebsiteDraft(pool, {
      organizationId: tenant.organizationId,
      instanceId: tenant.instance.id,
      contentKey: keyA,
      value: "Published A",
      grantedPermissions: grants,
    });
    await contentService.saveWebsiteDraft(pool, {
      organizationId: tenant.organizationId,
      instanceId: tenant.instance.id,
      contentKey: keyB,
      value: "Published B",
      grantedPermissions: grants,
    });
    const published = await publicationService.publishWebsiteDraft(pool, {
      organizationId: tenant.organizationId,
      instanceId: tenant.instance.id,
      actorIdentityId: null,
      grantedPermissions: grants,
    });
    assert.equal(published.ok, true, JSON.stringify(published));

    await contentService.saveWebsiteDraft(pool, {
      organizationId: tenant.organizationId,
      instanceId: tenant.instance.id,
      contentKey: keyA,
      value: "Draft A",
      grantedPermissions: grants,
    });
    await contentService.saveWebsiteDraft(pool, {
      organizationId: tenant.organizationId,
      instanceId: tenant.instance.id,
      contentKey: keyB,
      value: "Draft B kept",
      grantedPermissions: grants,
    });

    let summary = await changeManager.getPendingChangeSummary(pool, {
      organizationId: tenant.organizationId,
      instanceId: tenant.instance.id,
      grantedPermissions: grants,
    });
    assert.equal(summary.pendingChangeCount, 2);

    const restored = await changeManager.restoreFieldRevisionToDraft(pool, {
      organizationId: tenant.organizationId,
      instanceId: tenant.instance.id,
      contentKey: keyA,
      choice: "undo_current_edit",
      grantedPermissions: grants,
    });
    assert.equal(restored.ok, true, JSON.stringify(restored));
    assert.equal(restored.published, false);
    assert.equal(restored.pendingChangeCount, 1);

    const rowA = await contentService.getWebsiteContentRow(
      pool,
      tenant.instance.id,
      tenant.organizationId,
      keyA
    );
    const rowB = await contentService.getWebsiteContentRow(
      pool,
      tenant.instance.id,
      tenant.organizationId,
      keyB
    );
    assert.equal(rowA.draftValue, "Published A");
    assert.equal(rowB.draftValue, "Draft B kept");
  });

  it("restores earlier published version into draft only; rejects previously_saved; denies unauthorized", async (t) => {
    if (skipReason || !pool) return t.skip(skipReason || "no foundation db");
    const tenant = await seedTenant("earlier");
    const grants = [PERMISSIONS.VIEW, PERMISSIONS.EDIT, PERMISSIONS.PUBLISH];
    const key = "home.hero.title";

    await contentService.saveWebsiteDraft(pool, {
      organizationId: tenant.organizationId,
      instanceId: tenant.instance.id,
      contentKey: key,
      value: "Version One",
      grantedPermissions: grants,
    });
    const pub1 = await publicationService.publishWebsiteDraft(pool, {
      organizationId: tenant.organizationId,
      instanceId: tenant.instance.id,
      grantedPermissions: grants,
    });
    assert.equal(pub1.ok, true);

    await contentService.saveWebsiteDraft(pool, {
      organizationId: tenant.organizationId,
      instanceId: tenant.instance.id,
      contentKey: key,
      value: "Version Two",
      grantedPermissions: grants,
    });
    const pub2 = await publicationService.publishWebsiteDraft(pool, {
      organizationId: tenant.organizationId,
      instanceId: tenant.instance.id,
      grantedPermissions: grants,
    });
    assert.equal(pub2.ok, true);

    await contentService.saveWebsiteDraft(pool, {
      organizationId: tenant.organizationId,
      instanceId: tenant.instance.id,
      contentKey: key,
      value: "Current Draft",
      grantedPermissions: grants,
    });

    const history = await changeManager.listFieldHistory(pool, {
      organizationId: tenant.organizationId,
      instanceId: tenant.instance.id,
      contentKey: key,
      grantedPermissions: grants,
    });
    assert.equal(history.ok, true);
    const earlier = (history.entries || []).find(
      (e) => e.kind === "published_version" && e.newValue === "Version One"
    );
    assert.ok(earlier, "earlier published entry missing");

    const denied = await changeManager.restoreFieldRevisionToDraft(pool, {
      organizationId: tenant.organizationId,
      instanceId: tenant.instance.id,
      contentKey: key,
      choice: "earlier_published",
      versionId: earlier.versionId,
      grantedPermissions: [],
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.code, "forbidden");

    const unavailable = await changeManager.restoreFieldRevisionToDraft(pool, {
      organizationId: tenant.organizationId,
      instanceId: tenant.instance.id,
      contentKey: key,
      choice: "previously_saved",
      grantedPermissions: grants,
    });
    assert.equal(unavailable.ok, false);
    assert.equal(unavailable.code, "history_unavailable");
    assert.equal(unavailable.published, false);

    const rowBefore = await contentService.getWebsiteContentRow(
      pool,
      tenant.instance.id,
      tenant.organizationId,
      key
    );
    const restored = await changeManager.restoreFieldRevisionToDraft(pool, {
      organizationId: tenant.organizationId,
      instanceId: tenant.instance.id,
      contentKey: key,
      choice: "earlier_published",
      versionId: earlier.versionId,
      expectedUpdatedAt: rowBefore.updatedAt,
      grantedPermissions: grants,
    });
    assert.equal(restored.ok, true, JSON.stringify(restored));
    assert.equal(restored.published, false);

    const row = await contentService.getWebsiteContentRow(
      pool,
      tenant.instance.id,
      tenant.organizationId,
      key
    );
    assert.equal(row.draftValue, "Version One");
    assert.equal(row.publishedValue, "Version Two");

    const conflict = await changeManager.restoreFieldRevisionToDraft(pool, {
      organizationId: tenant.organizationId,
      instanceId: tenant.instance.id,
      contentKey: key,
      choice: "earlier_published",
      versionId: earlier.versionId,
      expectedUpdatedAt: rowBefore.updatedAt,
      grantedPermissions: grants,
    });
    assert.equal(conflict.ok, false);
    assert.equal(conflict.code, "conflict");
    assert.equal(conflict.published, false);
  });

  it("isolates tenants and does not auto-publish on restore", async (t) => {
    if (skipReason || !pool) return t.skip(skipReason || "no foundation db");
    const a = await seedTenant("iso_a");
    const b = await seedTenant("iso_b");
    const grants = [PERMISSIONS.VIEW, PERMISSIONS.EDIT, PERMISSIONS.PUBLISH];
    const key = "home.hero.title";

    await contentService.saveWebsiteDraft(pool, {
      organizationId: a.organizationId,
      instanceId: a.instance.id,
      contentKey: key,
      value: "A live",
      grantedPermissions: grants,
    });
    await publicationService.publishWebsiteDraft(pool, {
      organizationId: a.organizationId,
      instanceId: a.instance.id,
      grantedPermissions: grants,
    });
    await contentService.saveWebsiteDraft(pool, {
      organizationId: a.organizationId,
      instanceId: a.instance.id,
      contentKey: key,
      value: "A draft",
      grantedPermissions: grants,
    });

    const cross = await changeManager.restoreFieldRevisionToDraft(pool, {
      organizationId: b.organizationId,
      instanceId: a.instance.id,
      contentKey: key,
      choice: "currently_published",
      grantedPermissions: grants,
    });
    assert.equal(cross.ok, false);

    const ok = await changeManager.restoreFieldRevisionToDraft(pool, {
      organizationId: a.organizationId,
      instanceId: a.instance.id,
      contentKey: key,
      choice: "currently_published",
      grantedPermissions: grants,
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.published, false);
    const row = await contentService.getWebsiteContentRow(
      pool,
      a.instance.id,
      a.organizationId,
      key
    );
    assert.equal(row.publishedValue, "A live");
    assert.equal(row.draftValue, "A live");
  });
});
