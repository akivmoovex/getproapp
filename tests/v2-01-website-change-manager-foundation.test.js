"use strict";

/**
 * V2.01 Website Change Manager foundation —
 * draft-vs-published distinct field counts, history audit, BB+AC isolation.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
  foundationDbUnavailableSkipReason,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  CODE_ORG_STAGING,
} = require("../src/platform/config/deploymentProfiles");
const {
  registerActiveClinicWebsiteTemplate,
  ACTIVECLINIC_TEMPLATE_ID,
  ACTIVECLINIC_TEMPLATE_VERSION,
} = require("../src/activeclinic/website/activeClinicWebsiteTemplate");
const {
  registerBlessBoardWebsiteTemplate,
  BLESSBOARD_TEMPLATE_ID,
  BLESSBOARD_TEMPLATE_VERSION,
} = require("../src/blessboard/website/blessboardChurchTemplate");
const { provisionWebsiteInstance } = require("../src/platform/website/provisionService");
const contentService = require("../src/platform/website/contentService");
const publicationService = require("../src/platform/website/publicationService");
const { PERMISSIONS } = require("../src/platform/website/permissions");
const { PUBLISH_POLICY } = require("../src/platform/website/publishPolicy");
const changeManager = require("../src/platform/website/websiteChangeManagerService");
const versionService = require("../src/platform/website/versionService");

let pool = null;
let skipReason = null;
let stamp = 0;

const VIEW_EDIT = [PERMISSIONS.VIEW, PERMISSIONS.EDIT];
const VIEW_EDIT_PUBLISH = [PERMISSIONS.VIEW, PERMISSIONS.EDIT, PERMISSIONS.PUBLISH];

async function seedActiveClinic(suffix) {
  stamp += 1;
  registerActiveClinicWebsiteTemplate();
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `cm_ac_${suffix}_${stamp}`,
    displayName: `Change Manager AC ${suffix}`,
    productKey: "activeclinic",
    productTenantKey: `cm-ac-${suffix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  const provisioned = await provisionWebsiteInstance(pool, {
    organizationId: org.records.organization.id,
    templateId: ACTIVECLINIC_TEMPLATE_ID,
    templateVersion: ACTIVECLINIC_TEMPLATE_VERSION,
    slug: `cm-ac-${suffix}-${stamp}`,
    status: "coming_soon",
    publishPolicy: PUBLISH_POLICY.TENANT_PUBLISH,
  });
  assert.equal(provisioned.ok, true, JSON.stringify(provisioned));
  return {
    organizationId: org.records.organization.id,
    instance: provisioned.instance,
    productCode: "activeclinic",
  };
}

async function seedBlessBoard(suffix) {
  stamp += 1;
  registerBlessBoardWebsiteTemplate();
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `cm_bb_${suffix}_${stamp}`,
    displayName: `Change Manager BB ${suffix}`,
    productKey: "blessboard",
    productTenantKey: `cm-bb-${suffix}-${stamp}`,
    deploymentCode: CODE_ORG_STAGING,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  const provisioned = await provisionWebsiteInstance(pool, {
    organizationId: org.records.organization.id,
    templateId: BLESSBOARD_TEMPLATE_ID,
    templateVersion: BLESSBOARD_TEMPLATE_VERSION,
    slug: `cm-bb-${suffix}-${stamp}`,
    status: "coming_soon",
    scopeKind: "church_wide",
    publishPolicy: PUBLISH_POLICY.TENANT_PUBLISH,
    seedDefaults: false,
  });
  assert.equal(provisioned.ok, true, JSON.stringify(provisioned));
  return {
    organizationId: org.records.organization.id,
    instance: provisioned.instance,
    productCode: "blessboard",
  };
}

async function saveAc(ctx, key, value) {
  const saved = await contentService.saveWebsiteDraft(pool, {
    organizationId: ctx.organizationId,
    instanceId: ctx.instance.id,
    contentKey: key,
    value,
    grantedPermissions: VIEW_EDIT,
  });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  return saved;
}

async function saveBb(ctx, key, value) {
  const saved = await contentService.saveWebsiteDraft(pool, {
    organizationId: ctx.organizationId,
    instanceId: ctx.instance.id,
    contentKey: key,
    value,
    grantedPermissions: VIEW_EDIT,
  });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  return saved;
}

async function publishAc(ctx) {
  const published = await publicationService.publishWebsiteDraft(pool, {
    organizationId: ctx.organizationId,
    instanceId: ctx.instance.id,
    grantedPermissions: VIEW_EDIT_PUBLISH,
    actorIdentityId: null,
  });
  assert.equal(published.ok, true, JSON.stringify(published));
  return published;
}

describe("V2.01 Website Change Manager foundation", () => {
  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = foundationDbUnavailableSkipReason(err && err.message ? err.message : err);
      pool = null;
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb(t) {
    if (!pool || skipReason) {
      t.skip(skipReason || "no db");
      return false;
    }
    return true;
  }

  it("counts one distinct field when changed once", async (t) => {
    if (!requireDb(t)) return;
    const ctx = await seedActiveClinic("one");
    await saveAc(ctx, "home.hero.title", "Published title");
    await publishAc(ctx);

    let summary = await changeManager.getPendingChangeSummary(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      grantedPermissions: VIEW_EDIT,
    });
    assert.equal(summary.ok, true);
    assert.equal(summary.pendingChangeCount, 0);

    await saveAc(ctx, "home.hero.title", "Edited once");
    summary = await changeManager.getPendingChangeSummary(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      grantedPermissions: VIEW_EDIT,
    });
    assert.equal(summary.pendingChangeCount, 1);
    assert.deepEqual(summary.changedKeys, ["home.hero.title"]);
  });

  it("counts one when the same field is saved repeatedly", async (t) => {
    if (!requireDb(t)) return;
    const ctx = await seedActiveClinic("repeat");
    await saveAc(ctx, "home.hero.title", "Base");
    await publishAc(ctx);

    await saveAc(ctx, "home.hero.title", "Edit A");
    await saveAc(ctx, "home.hero.title", "Edit B");
    await saveAc(ctx, "home.hero.title", "Edit C");

    const compared = await changeManager.compareDraftToPublished(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      grantedPermissions: VIEW_EDIT,
    });
    assert.equal(compared.ok, true);
    assert.equal(compared.pendingChangeCount, 1, "repeated saves must not inflate count");
    assert.equal(compared.changes.length, 1);
  });

  it("counts multiple distinct fields correctly", async (t) => {
    if (!requireDb(t)) return;
    const ctx = await seedActiveClinic("multi");
    await saveAc(ctx, "home.hero.title", "Title");
    await saveAc(ctx, "home.hero.subtitle", "Subtitle");
    await publishAc(ctx);

    await saveAc(ctx, "home.hero.title", "Title 2");
    await saveAc(ctx, "home.hero.subtitle", "Subtitle 2");
    await saveAc(ctx, "home.hero.title", "Title 3");

    const summary = await changeManager.getPendingChangeSummary(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      grantedPermissions: VIEW_EDIT,
    });
    assert.equal(summary.pendingChangeCount, 2);
    assert.deepEqual(summary.changedKeys, ["home.hero.subtitle", "home.hero.title"]);
  });

  it("decreases count when a field is reverted to published", async (t) => {
    if (!requireDb(t)) return;
    const ctx = await seedActiveClinic("revert");
    await saveAc(ctx, "home.hero.title", "Live");
    await saveAc(ctx, "home.hero.subtitle", "Live sub");
    await publishAc(ctx);

    await saveAc(ctx, "home.hero.title", "Draft title");
    await saveAc(ctx, "home.hero.subtitle", "Draft sub");

    let summary = await changeManager.getPendingChangeSummary(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      grantedPermissions: VIEW_EDIT,
    });
    assert.equal(summary.pendingChangeCount, 2);

    const reverted = await changeManager.revertFieldToPublished(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: "home.hero.title",
      grantedPermissions: VIEW_EDIT,
    });
    assert.equal(reverted.ok, true);
    assert.equal(reverted.pendingChangeCount, 1);
    assert.deepEqual(reverted.changedKeys, ["home.hero.subtitle"]);
  });

  it("clears pending changes after publish", async (t) => {
    if (!requireDb(t)) return;
    const ctx = await seedActiveClinic("publish");
    await saveAc(ctx, "home.hero.title", "v1");
    await publishAc(ctx);
    await saveAc(ctx, "home.hero.title", "v2");
    await saveAc(ctx, "home.hero.subtitle", "extra");

    let summary = await changeManager.getPendingChangeSummary(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      grantedPermissions: VIEW_EDIT,
    });
    assert.ok(summary.pendingChangeCount >= 2);

    const published = await publishAc(ctx);
    assert.equal(published.published, true);

    summary = await changeManager.getPendingChangeSummary(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      grantedPermissions: VIEW_EDIT,
    });
    assert.equal(summary.pendingChangeCount, 0);
    assert.equal(summary.hasPendingChanges, false);
  });

  it("isolates pending counts between BlessBoard and ActiveClinic tenants", async (t) => {
    if (!requireDb(t)) return;
    const ac = await seedActiveClinic("iso");
    const bb = await seedBlessBoard("iso");

    await saveAc(ac, "home.hero.title", "AC live");
    await publishAc(ac);
    await saveAc(ac, "home.hero.title", "AC draft");

    await saveBb(bb, "brand.primary_color", "#111111");
    const bbPub = await publicationService.publishWebsiteDraft(pool, {
      organizationId: bb.organizationId,
      instanceId: bb.instance.id,
      grantedPermissions: VIEW_EDIT_PUBLISH,
      allowEmpty: true,
    });
    assert.equal(bbPub.ok, true, JSON.stringify(bbPub));
    await saveBb(bb, "brand.primary_color", "#222222");
    await saveBb(bb, "brand.accent_color", "#333333");

    const acSummary = await changeManager.getPendingChangeSummary(pool, {
      organizationId: ac.organizationId,
      instanceId: ac.instance.id,
      expectedProductCode: "activeclinic",
      grantedPermissions: VIEW_EDIT,
    });
    const bbSummary = await changeManager.getPendingChangeSummary(pool, {
      organizationId: bb.organizationId,
      instanceId: bb.instance.id,
      expectedProductCode: "blessboard",
      grantedPermissions: VIEW_EDIT,
    });
    assert.equal(acSummary.pendingChangeCount, 1);
    assert.equal(bbSummary.pendingChangeCount, 2);

    const crossed = await changeManager.compareDraftToPublished(pool, {
      organizationId: ac.organizationId,
      instanceId: bb.instance.id,
      expectedProductCode: "activeclinic",
      grantedPermissions: VIEW_EDIT,
    });
    assert.equal(crossed.ok, false);
    assert.ok(
      crossed.code === "tenant_mismatch" ||
        crossed.code === "website_instance_not_found" ||
        crossed.code === changeManager.RESULT.TENANT_MISMATCH ||
        crossed.code === changeManager.RESULT.NOT_FOUND
    );
  });

  it("denies unauthorized history and comparison", async (t) => {
    if (!requireDb(t)) return;
    const ctx = await seedActiveClinic("authz");
    await saveAc(ctx, "home.hero.title", "Secret");
    await publishAc(ctx);
    await saveAc(ctx, "home.hero.title", "Draft");

    const denied = await changeManager.compareDraftToPublished(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      grantedPermissions: [],
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.code, changeManager.RESULT.FORBIDDEN);

    const historyDenied = await changeManager.listFieldHistory(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: "home.hero.title",
      grantedPermissions: [],
    });
    assert.equal(historyDenied.ok, false);
    assert.equal(historyDenied.code, changeManager.RESULT.FORBIDDEN);

    const auditDenied = await changeManager.auditWebsiteChangeHistory(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      grantedPermissions: ["unrelated.permission"],
    });
    assert.equal(auditDenied.ok, false);
  });

  it("audits published versions without mutating historical snapshots", async (t) => {
    if (!requireDb(t)) return;
    const ctx = await seedActiveClinic("hist");
    await saveAc(ctx, "home.hero.title", "v1");
    await publishAc(ctx);
    await saveAc(ctx, "home.hero.title", "v2");
    await publishAc(ctx);
    await saveAc(ctx, "home.hero.title", "draft tip");

    const before = await versionService.listWebsiteVersions(pool, {
      instanceId: ctx.instance.id,
      organizationId: ctx.organizationId,
    });
    const snapshotBefore = JSON.stringify(
      (before.versions || []).map((v) => ({
        id: v.id,
        n: v.versionNumber,
        snap: v.snapshot,
        keys: v.changedKeys,
      }))
    );

    const audit = await changeManager.auditWebsiteChangeHistory(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      grantedPermissions: VIEW_EDIT,
    });
    assert.equal(audit.ok, true);
    assert.equal(audit.pendingChangeCount, 1);
    assert.ok(audit.versionCount >= 2);
    assert.equal(audit.historyStorage.migrationRequired, false);
    assert.equal(audit.historyStorage.independentCounter, false);
    assert.ok(audit.supportedFieldHistoryContentTypes.includes("short_text"));
    assert.ok(audit.supportedFieldHistoryContentTypes.includes("image"));

    const fieldHist = await changeManager.listFieldHistory(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: "home.hero.title",
      grantedPermissions: VIEW_EDIT,
    });
    assert.equal(fieldHist.ok, true);
    assert.equal(fieldHist.supportsFieldHistory, true);
    assert.ok(fieldHist.entryCount >= 1);
    assert.ok(fieldHist.entries.some((e) => e.kind === "current_draft"));
    assert.ok(
      fieldHist.entries.filter((e) => e.kind === "published_version").every((e) => e.immutable === true)
    );

    const after = await versionService.listWebsiteVersions(pool, {
      instanceId: ctx.instance.id,
      organizationId: ctx.organizationId,
    });
    const snapshotAfter = JSON.stringify(
      (after.versions || []).map((v) => ({
        id: v.id,
        n: v.versionNumber,
        snap: v.snapshot,
        keys: v.changedKeys,
      }))
    );
    assert.equal(snapshotAfter, snapshotBefore, "historical published versions must stay immutable");
  });

  it("keeps existing publish path green after Change Manager reads", async (t) => {
    if (!requireDb(t)) return;
    const ctx = await seedActiveClinic("compat");
    await saveAc(ctx, "home.hero.title", "compat");
    await changeManager.compareDraftToPublished(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      grantedPermissions: VIEW_EDIT,
    });
    const published = await publishAc(ctx);
    assert.equal(published.ok, true);
    assert.ok(published.version);
    const summary = await changeManager.getPendingChangeSummary(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      grantedPermissions: VIEW_EDIT,
    });
    assert.equal(summary.pendingChangeCount, 0);
  });
});
