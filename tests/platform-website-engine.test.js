"use strict";

/**
 * Shared website engine: provision, drafts, readiness, concurrency, media.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../src/platform/config/deploymentProfiles");
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
const mediaService = require("../src/platform/website/mediaService");
const checklistService = require("../src/platform/website/checklistService");
const { evaluatePublicationReadiness } = require("../src/platform/website/checklistService");
const { getWebsiteTemplate } = require("../src/platform/website/templateRegistry");

let pool;
let skipReason = null;

function jpegBuffer(size) {
  const buf = Buffer.alloc(Math.max(size, 12), 0);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf;
}

async function seedOrg(stamp) {
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `webeng_${stamp}`,
    displayName: "Website Engine Clinic",
    productKey: "activeclinic",
    productTenantKey: `webeng-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  registerActiveClinicWebsiteTemplate();
  const provisioned = await provisionWebsiteInstance(pool, {
    organizationId: org.records.organization.id,
    templateId: ACTIVECLINIC_TEMPLATE_ID,
    templateVersion: ACTIVECLINIC_TEMPLATE_VERSION,
    slug: `webeng-${stamp}`,
    status: "coming_soon",
  });
  assert.equal(provisioned.ok, true, JSON.stringify(provisioned));
  return { organizationId: org.records.organization.id, instance: provisioned.instance };
}

async function save(ctx, key, value) {
  return contentService.saveWebsiteDraft(pool, {
    organizationId: ctx.organizationId,
    instanceId: ctx.instance.id,
    contentKey: key,
    value,
  });
}

async function fillMandatory(ctx) {
  const results = await Promise.all([
    save(ctx, "home.hero.title", "Welcome to Test Clinic"),
    save(ctx, "home.hero.subtitle", "Professional care in Lusaka"),
    save(ctx, "about.story.body", "We provide primary care."),
    save(ctx, "location.hours", "Mon-Fri 08:00-17:00"),
    save(ctx, "contact.phone", "+260970000001"),
    save(ctx, "location.address", "Cairo Road, Lusaka"),
  ]);
  for (const r of results) assert.equal(r.ok, true, JSON.stringify(r));
}

describe("platform website engine", () => {
  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipReason) {
      // eslint-disable-next-line no-console
      console.log("skip:", skipReason);
      return false;
    }
    return true;
  }

  it("H02 first publication is blocked until mandatory fields are filled", async () => {
    if (!requireDb()) return;
    const ctx = await seedOrg(`r${Date.now().toString(36)}`);
    const template = getWebsiteTemplate(ACTIVECLINIC_TEMPLATE_ID, ACTIVECLINIC_TEMPLATE_VERSION);
    const resolved = await resolver.resolveWebsiteContent(pool, {
      organizationId: ctx.organizationId,
      instance: ctx.instance,
      mode: resolver.MODE.DRAFT,
    });
    const blocked = evaluatePublicationReadiness({
      template,
      resolved,
      operational: { clinic_name: "Test Clinic", booking: false },
      firstPublication: true,
      hasPublishedVersion: false,
    });
    assert.equal(blocked.blocksFirstPublication, true);
    assert.ok(blocked.mandatory.length > 0);
    assert.ok(Array.isArray(blocked.codes));
    assert.ok(Array.isArray(blocked.userMessages));
    assert.notEqual(blocked.checklistPercent, null);

    const submitted = await submissionService.submitWebsiteChanges(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    assert.equal(submitted.ok, true, JSON.stringify(submitted));
    const denied = await submissionService.decideWebsiteSubmission(pool, {
      organizationId: ctx.organizationId,
      submissionId: submitted.submission.id,
      decision: "approve",
      rowVersion: submitted.submission.rowVersion,
      operational: { clinic_name: "Test Clinic", booking: false },
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.code, "publication_not_ready");
    assert.ok(denied.readiness);
    assert.ok(denied.readiness.codes.length > 0);

    const override = await submissionService.decideWebsiteSubmission(pool, {
      organizationId: ctx.organizationId,
      submissionId: submitted.submission.id,
      decision: "approve",
      rowVersion: submitted.submission.rowVersion,
      overrideReadiness: true,
      operational: { clinic_name: "Test Clinic", booking: false },
    });
    assert.equal(override.ok, true, JSON.stringify(override));
    const audit = await pool.query(
      `SELECT action_key FROM platform.website_audit_events
        WHERE instance_id = $1 AND action_key = 'website.publish.override'`,
      [ctx.instance.id]
    );
    assert.ok(audit.rowCount >= 1);

    const readyCtx = await seedOrg(`rdy${Date.now().toString(36)}`);
    await fillMandatory(readyCtx);
    const readyResolved = await resolver.resolveWebsiteContent(pool, {
      organizationId: readyCtx.organizationId,
      instance: readyCtx.instance,
      mode: resolver.MODE.DRAFT,
    });
    const ready = evaluatePublicationReadiness({
      template,
      resolved: readyResolved,
      operational: {
        clinic_name: "Test Clinic",
        phone: "+260970000001",
        address: "Cairo Road, Lusaka",
        hours: "Mon-Fri 08:00-17:00",
        booking: false,
      },
      firstPublication: true,
      hasPublishedVersion: false,
    });
    assert.equal(ready.blocksFirstPublication, false);
    const readySubmit = await submissionService.submitWebsiteChanges(pool, {
      organizationId: readyCtx.organizationId,
      instanceId: readyCtx.instance.id,
    });
    assert.equal(readySubmit.ok, true, JSON.stringify(readySubmit));
    const published = await submissionService.decideWebsiteSubmission(pool, {
      organizationId: readyCtx.organizationId,
      submissionId: readySubmit.submission.id,
      decision: "approve",
      rowVersion: readySubmit.submission.rowVersion,
      operational: {
        clinic_name: "Test Clinic",
        phone: "+260970000001",
        address: "Cairo Road, Lusaka",
        hours: "Mon-Fri 08:00-17:00",
        booking: false,
      },
    });
    assert.equal(published.ok, true, JSON.stringify(published));

    const later = evaluatePublicationReadiness({
      template,
      resolved: readyResolved,
      operational: {
        clinic_name: "Test Clinic",
        phone: "+260970000001",
        address: "Cairo Road",
        hours: "open",
        booking: false,
      },
      firstPublication: false,
      hasPublishedVersion: true,
    });
    later.recommended.push({ key: "logo", label: "Logo" });
    assert.equal(later.blocksFirstPublication, false);
  });

  it("H06 concurrent edits, snapshot immutability, and duplicate decisions", async () => {
    if (!requireDb()) return;
    const ctx = await seedOrg(`c${Date.now().toString(36)}`);
    await fillMandatory(ctx);
    const [a, b] = await Promise.all([
      save(ctx, "home.hero.title", "Title A"),
      save(ctx, "footer.tagline", "Tagline B"),
    ]);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);

    const [sameA, sameB] = await Promise.all([
      save(ctx, "home.hero.subtitle", "Same key one"),
      save(ctx, "home.hero.subtitle", "Same key two"),
    ]);
    assert.equal(sameA.ok, true);
    assert.equal(sameB.ok, true);
    const row = await contentService.getWebsiteContentRow(
      pool,
      ctx.instance.id,
      ctx.organizationId,
      "home.hero.subtitle"
    );
    assert.ok(row.draftValue === "Same key one" || row.draftValue === "Same key two");

    const submitted = await submissionService.submitWebsiteChanges(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    assert.equal(submitted.ok, true, JSON.stringify(submitted));
    const snapshotTitle = submitted.submission.snapshot.values["home.hero.title"];
    assert.ok(Array.isArray(submitted.submission.snapshot.changes));
    assert.ok(
      submitted.submission.snapshot.changes.some((c) => c.changeType === "added" || c.changeType === "changed")
    );
    const reviewDiff = require("../src/platform/website/reviewDiff").buildWebsiteReviewDiff({
      snapshot: submitted.submission.snapshot,
      template: getWebsiteTemplate(ACTIVECLINIC_TEMPLATE_ID, ACTIVECLINIC_TEMPLATE_VERSION),
      changedKeys: submitted.submission.changedKeys,
    });
    assert.equal(reviewDiff.source, "submission_snapshot");
    assert.ok(reviewDiff.items.some((item) => item.contentKey === "home.hero.title"));

    await save(ctx, "home.hero.title", "Edited after submit");
    const secondSubmit = await submissionService.submitWebsiteChanges(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    assert.equal(secondSubmit.ok, false);
    assert.equal(secondSubmit.code, "open_submission_exists");

    const approved = await submissionService.decideWebsiteSubmission(pool, {
      organizationId: ctx.organizationId,
      submissionId: submitted.submission.id,
      decision: "approve",
      rowVersion: submitted.submission.rowVersion,
      overrideReadiness: true,
      operational: { clinic_name: "Test Clinic", booking: false },
    });
    assert.equal(approved.ok, true, JSON.stringify(approved));

    const live = await resolver.resolveWebsiteContent(pool, {
      organizationId: ctx.organizationId,
      instance: ctx.instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(live.values["home.hero.title"], snapshotTitle);
    assert.notEqual(live.values["home.hero.title"], "Edited after submit");

    const again = await submissionService.decideWebsiteSubmission(pool, {
      organizationId: ctx.organizationId,
      submissionId: submitted.submission.id,
      decision: "approve",
      rowVersion: submitted.submission.rowVersion,
    });
    assert.equal(again.ok, false);
    assert.ok(again.code === "invalid_submission_status" || again.code === "submission_conflict");

    await save(ctx, "contact.intro", "Round two");
    const next = await submissionService.submitWebsiteChanges(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    assert.equal(next.ok, true, JSON.stringify(next));
    const [approveRace, rejectRace] = await Promise.all([
      submissionService.decideWebsiteSubmission(pool, {
        organizationId: ctx.organizationId,
        submissionId: next.submission.id,
        decision: "approve",
        rowVersion: next.submission.rowVersion,
        overrideReadiness: true,
        operational: { clinic_name: "Test Clinic", booking: false },
      }),
      submissionService.decideWebsiteSubmission(pool, {
        organizationId: ctx.organizationId,
        submissionId: next.submission.id,
        decision: "reject",
        rowVersion: next.submission.rowVersion,
      }),
    ]);
    const outcomes = [approveRace, rejectRace];
    assert.equal(outcomes.filter((o) => o.ok).length, 1);
    assert.equal(outcomes.filter((o) => !o.ok && o.code === "submission_conflict" || (!o.ok && o.code === "invalid_submission_status")).length, 1);

    const versions = await versionService.listWebsiteVersions(pool, {
      instanceId: ctx.instance.id,
      organizationId: ctx.organizationId,
    });
    assert.ok(versions.versions.length >= 1);
    const first = versions.versions[versions.versions.length - 1];
    await save(ctx, "home.hero.title", "Draft after publish");
    const restored = await versionService.restoreWebsiteVersionToDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      versionId: first.id,
    });
    assert.equal(restored.ok, true, JSON.stringify(restored));
    const afterRestoreLive = await resolver.resolveWebsiteContent(pool, {
      organizationId: ctx.organizationId,
      instance: ctx.instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(afterRestoreLive.values["home.hero.title"], snapshotTitle);
  });

  it("H07 media lifecycle rejects unsafe files and protects published assets", async () => {
    if (!requireDb()) return;
    const ctx = await seedOrg(`m${Date.now().toString(36)}`);
    const jpeg = await mediaService.registerWebsiteMedia(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      mediaKind: "image",
      originalFilename: "hero.jpg",
      mimeType: "image/jpeg",
      buffer: jpegBuffer(1200),
      altText: "Clinic exterior",
    });
    assert.equal(jpeg.ok, true, JSON.stringify(jpeg));

    const svg = await mediaService.registerWebsiteMedia(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      mediaKind: "image",
      originalFilename: "x.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg></svg>"),
    });
    assert.equal(svg.ok, false);
    assert.equal(svg.code, "unsafe_media_type");

    const huge = await mediaService.registerWebsiteMedia(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      mediaKind: "image",
      originalFilename: "big.jpg",
      mimeType: "image/jpeg",
      buffer: jpegBuffer(5 * 1024 * 1024 + 10),
    });
    assert.equal(huge.ok, false);
    assert.equal(huge.code, "media_too_large");

    const lie = await mediaService.registerWebsiteMedia(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      mediaKind: "image",
      originalFilename: "not-png.png",
      mimeType: "image/png",
      buffer: jpegBuffer(200),
    });
    assert.equal(lie.ok, false);

    const video = await mediaService.registerWebsiteMedia(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      mediaKind: "video_url",
      externalUrl: "https://www.youtube.com/watch?v=dQw4w9wgGcQ",
      altText: "Intro video",
    });
    assert.equal(video.ok, true, JSON.stringify(video));
    const badVideo = await mediaService.registerWebsiteMedia(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      mediaKind: "video_url",
      externalUrl: "javascript:alert(1)",
    });
    assert.equal(badVideo.ok, false);

    const saved = await save(ctx, "home.hero.image", {
      src: "/media/hero.jpg",
      alt: "Clinic exterior",
      mediaId: jpeg.media.id,
    });
    assert.equal(saved.ok, true, JSON.stringify(saved));
    await fillMandatory(ctx);
    const submitted = await submissionService.submitWebsiteChanges(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    assert.equal(submitted.ok, true, JSON.stringify(submitted));
    const approved = await submissionService.decideWebsiteSubmission(pool, {
      organizationId: ctx.organizationId,
      submissionId: submitted.submission.id,
      decision: "approve",
      rowVersion: submitted.submission.rowVersion,
      overrideReadiness: true,
      operational: { clinic_name: "Test Clinic", booking: false },
    });
    assert.equal(approved.ok, true, JSON.stringify(approved));

    const blocked = await mediaService.archiveWebsiteMedia(pool, {
      organizationId: ctx.organizationId,
      mediaId: jpeg.media.id,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, "media_in_use_published");

    const otherOrg = await seedOrg(`x${Date.now().toString(36)}`);
    const cross = await mediaService.getWebsiteMedia(pool, {
      organizationId: otherOrg.organizationId,
      mediaId: jpeg.media.id,
    });
    assert.equal(cross.ok, false);

    const payload = await mediaService.getWebsiteMediaPayload(pool, {
      mediaId: jpeg.media.id,
      organizationId: ctx.organizationId,
    });
    assert.equal(payload.ok, true);
    assert.ok(Buffer.isBuffer(payload.buffer));
    assert.equal(payload.mimeType, "image/jpeg");

    const orphans = mediaService.listOrphanCandidates();
    assert.equal(orphans.autoDelete, false);
    assert.equal(orphans.strategy, "manual_review");
  });

  it("LIVE resolver never returns draft-only values", async () => {
    if (!requireDb()) return;
    const ctx = await seedOrg(`l${Date.now().toString(36)}`);
    await save(ctx, "home.hero.title", "SECRET DRAFT TITLE");
    const live = await resolver.resolveWebsiteContent(pool, {
      organizationId: ctx.organizationId,
      instance: ctx.instance,
      mode: resolver.MODE.LIVE,
    });
    assert.notEqual(live.values["home.hero.title"], "SECRET DRAFT TITLE");
    const draft = await resolver.resolveWebsiteContent(pool, {
      organizationId: ctx.organizationId,
      instance: ctx.instance,
      mode: resolver.MODE.DRAFT,
    });
    assert.equal(draft.values["home.hero.title"], "SECRET DRAFT TITLE");
  });
});
