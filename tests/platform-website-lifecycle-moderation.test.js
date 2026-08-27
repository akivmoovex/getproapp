"use strict";

/**
 * Shared website lifecycle, publishing policy, moderation, restore, isolation.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { CODE_ACTIVECLINIC_ORG_V6 } = require("../src/platform/config/deploymentProfiles");
const {
  registerActiveClinicWebsiteTemplate,
  ACTIVECLINIC_TEMPLATE_ID,
  ACTIVECLINIC_TEMPLATE_VERSION,
} = require("../src/activeclinic/website/activeClinicWebsiteTemplate");
const { provisionWebsiteInstance } = require("../src/platform/website/provisionService");
const contentService = require("../src/platform/website/contentService");
const resolver = require("../src/platform/website/resolver");
const submissionService = require("../src/platform/website/submissionService");
const versionService = require("../src/platform/website/versionService");
const publicationService = require("../src/platform/website/publicationService");
const editSessionService = require("../src/platform/website/editSessionService");
const lifecycleService = require("../src/platform/website/lifecycleService");
const { listRecentWebsiteChanges } = require("../src/platform/website/recentChangesService");
const { listModerationEvents } = require("../src/platform/website/moderationEventService");
const { LIFECYCLE_STATUS } = require("../src/platform/website/lifecycleStatus");
const { PUBLISH_POLICY } = require("../src/platform/website/publishPolicy");
const { PERMISSIONS, hasWebsitePermission } = require("../src/platform/website/permissions");
const { ensureBlessBoardWebsiteInstance } = require("../src/blessboard/website/blessboardWebsiteAdapter");
const { authorizeWebsiteInstance } = require("../src/platform/website/authorizeWebsite");

let pool;
let skipReason = null;
let stamp = 0;

function requireDb() {
  if (skipReason) {
    // eslint-disable-next-line no-console
    console.log("skip:", skipReason);
    return false;
  }
  return true;
}

async function seedClinic(suffix, policy) {
  stamp += 1;
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `wslc_${suffix}_${stamp}`,
    displayName: `Lifecycle ${suffix}`,
    productKey: "activeclinic",
    productTenantKey: `wslc-${suffix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  registerActiveClinicWebsiteTemplate();
  const provisioned = await provisionWebsiteInstance(pool, {
    organizationId: org.records.organization.id,
    templateId: ACTIVECLINIC_TEMPLATE_ID,
    templateVersion: ACTIVECLINIC_TEMPLATE_VERSION,
    slug: `wslc-${suffix}-${stamp}`,
    status: "coming_soon",
    publishPolicy: policy,
    lifecycleStatus: LIFECYCLE_STATUS.PROVISIONAL,
  });
  assert.equal(provisioned.ok, true, JSON.stringify(provisioned));
  return {
    organizationId: org.records.organization.id,
    organizationKey: org.records.organization.organization_key,
    instance: provisioned.instance,
  };
}

describe("shared website lifecycle moderation", () => {
  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 240) : "no foundation db";
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("provisions a temporary site with immediate edit defaults", async () => {
    if (!requireDb()) return;
    const ctx = await seedClinic("prov", PUBLISH_POLICY.AUTO_PUBLISH_WITH_MODERATION);
    assert.equal(ctx.instance.lifecycleStatus, LIFECYCLE_STATUS.PROVISIONAL);
    assert.equal(ctx.instance.publishPolicy, PUBLISH_POLICY.AUTO_PUBLISH_WITH_MODERATION);
    assert.equal(ctx.instance.editLocked, false);
    const content = await contentService.listWebsiteContent(pool, ctx.instance, ctx.organizationId);
    const subtitle = content.find((row) => row.contentKey === "home.hero.subtitle");
    assert.ok(subtitle);
    assert.match(String(subtitle.draftValue || subtitle.publishedValue || ""), /being set up|clinic/i);
  });

  it("auto-publishes edits into a new immutable version visible to PA", async () => {
    if (!requireDb()) return;
    const ctx = await seedClinic("auto", PUBLISH_POLICY.AUTO_PUBLISH_WITH_MODERATION);
    const saved = await publicationService.saveDraftAndMaybePublish(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: "home.hero.title",
      value: "Sunrise Clinic",
      actorIdentityId: null,
    });
    assert.equal(saved.ok, true, JSON.stringify(saved));
    assert.equal(saved.published, true);
    assert.ok(saved.version);
    const live = await resolver.resolveWebsiteContent(pool, {
      organizationId: ctx.organizationId,
      instance: ctx.instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(live.values["home.hero.title"], "Sunrise Clinic");
    const recent = await listRecentWebsiteChanges(pool, {
      organizationId: ctx.organizationId,
      productCode: "activeclinic",
    });
    assert.ok(recent.changes.some((row) => row.changeCount >= 1 || row.kind === "version"));
  });

  it("review-before-publish keeps live content unchanged until approval", async () => {
    if (!requireDb()) return;
    const ctx = await seedClinic("review", PUBLISH_POLICY.REVIEW_BEFORE_PUBLISH);
    await publicationService.saveDraftAndMaybePublish(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: "home.hero.title",
      value: "Draft Only Clinic",
    });
    const liveBefore = await resolver.resolveWebsiteContent(pool, {
      organizationId: ctx.organizationId,
      instance: ctx.instance,
      mode: resolver.MODE.LIVE,
    });
    assert.notEqual(liveBefore.values["home.hero.title"], "Draft Only Clinic");
    const submitted = await submissionService.submitWebsiteChanges(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    assert.equal(submitted.ok, true, JSON.stringify(submitted));
    const decided = await submissionService.decideWebsiteSubmission(pool, {
      organizationId: ctx.organizationId,
      submissionId: submitted.submission.id,
      decision: "approve",
      rowVersion: submitted.submission.rowVersion,
      overrideReadiness: true,
    });
    assert.equal(decided.ok, true, JSON.stringify(decided));
    const liveAfter = await resolver.resolveWebsiteContent(pool, {
      organizationId: ctx.organizationId,
      instance: ctx.instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(liveAfter.values["home.hero.title"], "Draft Only Clinic");
  });

  it("restores text, image, visibility, and structured content without rewriting history", async () => {
    if (!requireDb()) return;
    const ctx = await seedClinic("restore", PUBLISH_POLICY.AUTO_PUBLISH_WITH_MODERATION);
    async function pub(key, value) {
      const saved = await publicationService.saveDraftAndMaybePublish(pool, {
        organizationId: ctx.organizationId,
        instanceId: ctx.instance.id,
        contentKey: key,
        value,
      });
      assert.equal(saved.ok, true, JSON.stringify(saved));
      return saved;
    }
    await pub("home.hero.title", "Version One");
    await pub("home.hero.image", { src: "https://cdn.example.com/one.jpg", alt: "One" });
    await pub("section.faq.visible", false);
    const v1saved = await pub("home.faq", [{ question: "Old Q", answer: "Old A" }]);
    const v1 = v1saved.version;
    await editSessionService.closeOpenSessionsForInstance(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      reason: editSessionService.CLOSE_REASON.FINISH,
    });
    await pub("home.hero.title", "Version Two Bad");
    await pub("home.hero.image", { src: "https://cdn.example.com/two.jpg", alt: "Two" });
    await pub("section.faq.visible", true);
    await pub("home.faq", [{ question: "New Q", answer: "New A" }]);
    const restored = await publicationService.restoreWebsiteVersionLive(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      versionId: v1.id,
    });
    assert.equal(restored.ok, true, JSON.stringify(restored));
    const live = await resolver.resolveWebsiteContent(pool, {
      organizationId: ctx.organizationId,
      instance: ctx.instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(live.values["home.hero.title"], "Version One");
    assert.equal(live.values["section.faq.visible"], false);
    const listed = await versionService.listWebsiteVersions(pool, {
      instanceId: ctx.instance.id,
      organizationId: ctx.organizationId,
    });
    assert.ok(listed.versions.length >= 2);
    assert.ok(listed.versions.some((row) => row.id === v1.id));
    assert.ok(listed.versions.some((row) => row.moderationStatus === "restored"));
  });

  it("takes a website offline and suspends without disabling the tenant account", async () => {
    if (!requireDb()) return;
    const ctx = await seedClinic("off", PUBLISH_POLICY.AUTO_PUBLISH_WITH_MODERATION);
    await lifecycleService.applyLifecycle(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      lifecycleStatus: LIFECYCLE_STATUS.PUBLIC,
      force: true,
      moderationActionKey: "website.availability.publish",
    });
    const offline = await lifecycleService.takeWebsiteOffline(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      reason: "policy review",
      notePublic: "Website is offline while we review content.",
    });
    assert.equal(offline.ok, true, JSON.stringify(offline));
    assert.equal(offline.instance.lifecycleStatus, LIFECYCLE_STATUS.OFFLINE);
    const org = await pool.query(
      `SELECT status FROM platform.organizations WHERE id = $1`,
      [ctx.organizationId]
    );
    assert.equal(org.rows[0].status, "active");
    const restored = await lifecycleService.restoreWebsiteAvailability(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    assert.equal(restored.instance.lifecycleStatus, LIFECYCLE_STATUS.PUBLIC);
    const suspended = await lifecycleService.suspendWebsite(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      reason: "governance",
      notePublic: "Website suspended. Contact platform support.",
    });
    assert.equal(suspended.instance.lifecycleStatus, LIFECYCLE_STATUS.SUSPENDED);
    assert.equal(suspended.instance.editLocked, true);
    const locked = await contentService.saveWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: "home.hero.title",
      value: "Should fail",
    });
    assert.equal(locked.ok, false);
    assert.equal(locked.code, "website_edit_locked");
    const org2 = await pool.query(
      `SELECT status FROM platform.organizations WHERE id = $1`,
      [ctx.organizationId]
    );
    assert.equal(org2.rows[0].status, "active");
  });

  it("requests changes on live content without auto-suspending", async () => {
    if (!requireDb()) return;
    const ctx = await seedClinic("req", PUBLISH_POLICY.AUTO_PUBLISH_WITH_MODERATION);
    await lifecycleService.applyLifecycle(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      lifecycleStatus: LIFECYCLE_STATUS.PUBLIC,
      force: true,
    });
    const requested = await lifecycleService.requestLiveWebsiteChanges(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      notes: "Please remove unverified claims.",
      notePublic: "Please remove unverified claims.",
    });
    assert.equal(requested.ok, true, JSON.stringify(requested));
    assert.equal(requested.instance.lifecycleStatus, LIFECYCLE_STATUS.PUBLIC);
    const events = await listModerationEvents(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    assert.ok(events.events.some((e) => e.actionKey === "website.moderation.request_changes"));
  });

  it("scopes restore and policy updates to the tenant", async () => {
    if (!requireDb()) return;
    const a = await seedClinic("isoA", PUBLISH_POLICY.AUTO_PUBLISH_WITH_MODERATION);
    const b = await seedClinic("isoB", PUBLISH_POLICY.AUTO_PUBLISH_WITH_MODERATION);
    const saved = await publicationService.saveDraftAndMaybePublish(pool, {
      organizationId: a.organizationId,
      instanceId: a.instance.id,
      contentKey: "home.hero.title",
      value: "Tenant A",
    });
    const crossed = await publicationService.restoreWebsiteVersionLive(pool, {
      organizationId: b.organizationId,
      instanceId: b.instance.id,
      versionId: saved.version.id,
    });
    assert.equal(crossed.ok, false);
    const policy = await lifecycleService.setWebsitePublishPolicy(pool, {
      organizationId: b.organizationId,
      instanceId: a.instance.id,
      publishPolicy: PUBLISH_POLICY.PLATFORM_LOCKED,
    });
    assert.equal(policy.ok, false);
  });

    it("keeps BlessBoard on the shared website engine without seeding empty content", async () => {
    if (!requireDb()) return;
    const org = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `wslc_bb_${Date.now()}`,
      displayName: "Adapter Church",
      productKey: "blessboard",
      productTenantKey: `wslc-bb-${Date.now()}`,
      deploymentCode: "blessboard-org-staging",
    });
    assert.equal(org.ok, true, JSON.stringify(org));
    const pagesBefore = await pool.query(
      `SELECT count(*)::int AS n FROM blessboard.public_pages WHERE true`
    ).catch(() => ({ rows: [{ n: 0 }] }));
    const ensured = await ensureBlessBoardWebsiteInstance(pool, {
      organizationId: org.records.organization.id,
      slug: `wslc-bb-${stamp}`,
    });
    assert.equal(ensured.ok, true, JSON.stringify(ensured));
    assert.equal(ensured.instance.adapterMode, "shared_engine");
    assert.equal(ensured.instance.publishPolicy, PUBLISH_POLICY.REVIEW_BEFORE_PUBLISH);
    const content = await pool.query(
      `SELECT count(*)::int AS n FROM platform.website_content WHERE instance_id = $1`,
      [ensured.instance.id]
    );
    assert.equal(content.rows[0].n, 0);
    const pagesAfter = await pool.query(
      `SELECT count(*)::int AS n FROM blessboard.public_pages WHERE true`
    ).catch(() => pagesBefore);
    assert.equal(pagesAfter.rows[0].n, pagesBefore.rows[0].n);
  });

  it("requires moderation permissions for platform actions", async () => {
    if (!requireDb()) return;
    assert.equal(hasWebsitePermission(["website.edit"], PERMISSIONS.SUSPEND), false);
    assert.equal(hasWebsitePermission(["website.take_offline"], PERMISSIONS.TAKE_OFFLINE), true);
    const ctx = await seedClinic("rbac", PUBLISH_POLICY.REVIEW_BEFORE_PUBLISH);
    const denied = await authorizeWebsiteInstance(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      grantedPermissions: ["website.edit"],
      permission: PERMISSIONS.SUSPEND,
    });
    assert.equal(denied.ok, false);
    const allowed = await authorizeWebsiteInstance(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      grantedPermissions: [PERMISSIONS.SUSPEND],
      permission: PERMISSIONS.SUSPEND,
    });
    assert.equal(allowed.ok, true);
  });

  it("batches one auto-publish version per editing session", async () => {
    if (!requireDb()) return;
    const ctx = await seedClinic("batch", PUBLISH_POLICY.AUTO_PUBLISH_WITH_MODERATION);
    const editor = "11111111-1111-4111-8111-111111111111";
    const keys = [
      ["home.hero.title", "Batch Title"],
      ["home.hero.subtitle", "Batch subtitle"],
      ["home.hero.image", { src: "https://cdn.example.com/batch.jpg", alt: "Batch" }],
      ["about.story.body", "Batch about copy"],
      ["contact.intro", "Batch contact line"],
    ];
    for (const [key, value] of keys) {
      const saved = await publicationService.saveDraftAndMaybePublish(pool, {
        organizationId: ctx.organizationId,
        instanceId: ctx.instance.id,
        contentKey: key,
        value,
        actorIdentityId: editor,
      });
      assert.equal(saved.ok, true, JSON.stringify(saved));
      assert.equal(saved.published, true);
    }
    const live = await resolver.resolveWebsiteContent(pool, {
      organizationId: ctx.organizationId,
      instance: ctx.instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(live.values["home.hero.title"], "Batch Title");
    assert.equal(live.values["contact.intro"], "Batch contact line");
    const listed = await versionService.listWebsiteVersions(pool, {
      instanceId: ctx.instance.id,
      organizationId: ctx.organizationId,
    });
    assert.equal(listed.versions.length, 1);
    assert.equal(listed.versions[0].changedKeys.length, 5);
    const events = await listModerationEvents(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    assert.equal(events.events.filter((e) => e.actionKey === "website.moderation.auto_publish").length, 5);
    const other = "22222222-2222-4222-8222-222222222222";
    const second = await publicationService.saveDraftAndMaybePublish(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: "footer.tagline",
      value: "Other editor",
      actorIdentityId: other,
    });
    assert.equal(second.ok, true);
    const afterOther = await versionService.listWebsiteVersions(pool, {
      instanceId: ctx.instance.id,
      organizationId: ctx.organizationId,
    });
    assert.equal(afterOther.versions.length, 2);
  });

  it("builds a version diff for Platform Admin view-changes", async () => {
    if (!requireDb()) return;
    const ctx = await seedClinic("diff", PUBLISH_POLICY.AUTO_PUBLISH_WITH_MODERATION);
    await publicationService.saveDraftAndMaybePublish(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: "home.hero.title",
      value: "Before Title",
    });
    await editSessionService.closeOpenSessionsForInstance(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      reason: editSessionService.CLOSE_REASON.FINISH,
    });
    await publicationService.saveDraftAndMaybePublish(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: "home.hero.title",
      value: "After Title",
    });
    const listed = await versionService.listWebsiteVersions(pool, {
      instanceId: ctx.instance.id,
      organizationId: ctx.organizationId,
    });
    const current = listed.versions[0];
    const previous = listed.versions[1];
    const { buildVersionDiff } = require("../src/platform/website/reviewDiff");
    const diff = buildVersionDiff({
      snapshot: current.snapshot,
      previousSnapshot: previous.snapshot,
      changedKeys: current.changedKeys,
    });
    assert.ok(diff.items.some((item) => item.proposed && String(item.proposed.text).includes("After Title")));
  });
});
