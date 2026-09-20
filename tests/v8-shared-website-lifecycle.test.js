"use strict";

/**
 * V8 shared website publish / media lifecycle — draft isolation, concurrency,
 * authz, CDN hydration, V7 media namespace compatibility.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  CODE_MOOVEX_PLATFORM_TESTING,
  CODE_MOOVEX_PLATFORM_V8_TESTING,
} = require("../src/platform/config/deploymentProfiles");
const {
  registerActiveClinicWebsiteTemplate,
  ACTIVECLINIC_TEMPLATE_ID,
  ACTIVECLINIC_TEMPLATE_VERSION,
} = require("../src/activeclinic/website/activeClinicWebsiteTemplate");
const { provisionWebsiteInstance } = require("../src/platform/website/provisionService");
const contentService = require("../src/platform/website/contentService");
const publicationService = require("../src/platform/website/publicationService");
const versionService = require("../src/platform/website/versionService");
const resolver = require("../src/platform/website/resolver");
const mediaService = require("../src/platform/website/mediaService");
const { PERMISSIONS } = require("../src/platform/website/permissions");
const {
  assertStorageKeyWritable,
  assertStorageKeyReadable,
  buildHostingerStorageKey,
  resolveMediaEnvironment,
} = require("../src/platform/media/hostingerMediaConfig");
const { createHostingerMediaStorage } = require("../src/platform/media/hostingerMediaStorage");
const {
  presentCdnUrl,
  resolveCdnPublicBaseUrl,
  storageKeyFromLegacyMediaSrc,
} = require("../src/platform/media/cdnMediaPresentation");
const {
  assertDraftRowsV7CompatibleForPublish,
  assertSnapshotV7Compatible,
} = require("../src/platform/website/v7CompatibleWebsitePublish");

let pool = null;
let skipReason = null;
let stamp = 0;
let mediaRoot = null;

function jpegBuffer(size) {
  const buf = Buffer.alloc(Math.max(size, 16), 0);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xd9;
  return buf;
}

async function seedInstance(suffix) {
  stamp += 1;
  registerActiveClinicWebsiteTemplate();
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `v8wl_ac_${suffix}_${stamp}`,
    displayName: `V8 Website Lifecycle ${suffix}`,
    productKey: "activeclinic",
    productTenantKey: `v8wl-ac-${suffix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  const provisioned = await provisionWebsiteInstance(pool, {
    organizationId: org.records.organization.id,
    templateId: ACTIVECLINIC_TEMPLATE_ID,
    templateVersion: ACTIVECLINIC_TEMPLATE_VERSION,
    slug: `v8wl-ac-${suffix}-${stamp}`,
    status: "coming_soon",
  });
  assert.equal(provisioned.ok, true, JSON.stringify(provisioned));
  return {
    organizationId: org.records.organization.id,
    instance: provisioned.instance,
  };
}

describe("V8 shared website lifecycle — media namespace / CDN", () => {
  it("lets V8 read V7 testing keys while refusing V7→V8 and production cross-writes", () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const mediaId = "22222222-2222-4222-8222-222222222222";
    const v7Key = buildHostingerStorageKey({
      environment: "testing",
      productCode: "blessboard",
      organizationId: orgId,
      mediaId,
      mimeType: "image/jpeg",
    });
    const v8Key = buildHostingerStorageKey({
      environment: "testing-v8",
      productCode: "blessboard",
      organizationId: orgId,
      mediaId,
      mimeType: "image/jpeg",
    });
    assert.doesNotThrow(() => assertStorageKeyReadable("testing-v8", v7Key));
    assert.doesNotThrow(() => assertStorageKeyReadable("testing-v8", v8Key));
    assert.doesNotThrow(() => assertStorageKeyReadable("testing", v7Key));
    assert.throws(
      () => assertStorageKeyReadable("testing", v8Key),
      (err) => err && err.code === "REFUSED_V8_MEDIA_NAMESPACE"
    );
    assert.throws(
      () => assertStorageKeyWritable("testing-v8", v7Key),
      (err) => err && err.code === "MEDIA_ENVIRONMENT_MISMATCH"
    );
    assert.throws(
      () => assertStorageKeyWritable("testing", v8Key),
      (err) => err && err.code === "REFUSED_V8_MEDIA_NAMESPACE"
    );
  });

  it("presents testing-v8 CDN URLs and V8 testing fallback base", () => {
    const key =
      "testing-v8/blessboard/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg";
    assert.equal(
      storageKeyFromLegacyMediaSrc(`/media/${key}`),
      key
    );
    const cdn = presentCdnUrl(key, {
      MEDIA_PUBLIC_BASE_URL: "https://cdn.test.invalid/media",
    });
    assert.equal(cdn, `https://cdn.test.invalid/media/${key}`);
    assert.equal(
      resolveCdnPublicBaseUrl({
        DEPLOYMENT_ENV: "testing",
        PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
      }),
      "https://blessboard.neuniversity.org/media"
    );
    assert.equal(
      resolveMediaEnvironment({
        PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
        DEPLOYMENT_ENV: "testing",
      }),
      "testing-v8"
    );
    assert.equal(
      resolveMediaEnvironment({
        PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
        DEPLOYMENT_ENV: "testing",
      }),
      "testing"
    );
  });

  it("blocks V8-only section formats from shared V7 publish", () => {
    const blocked = assertDraftRowsV7CompatibleForPublish([
      {
        contentKey: "home.sections",
        draftValue: {
          sections: [{ type: "image_text", v8Format: true, heading: "X", formatVersion: 2 }],
        },
        publishedValue: null,
      },
    ]);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, "v8_incompatible_publish");
    assert.ok(blocked.blockers.length >= 1);

    const ok = assertSnapshotV7Compatible({
      sections: [{ type: "image_text", heading: "Hello", bodyText: "Body" }],
    });
    assert.equal(ok.ok, true);
  });
});

describe("V8 shared website lifecycle — draft / publish / restore", () => {
  before(async () => {
    try {
      mediaRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "v8-website-media-"));
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
      pool = null;
    }
  });

  after(async () => {
    if (pool && typeof pool.end === "function") await pool.end().catch(() => {});
    if (mediaRoot) {
      await fsp.rm(mediaRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  function requireDb() {
    return Boolean(pool) && !skipReason;
  }

  it("draft save does not alter published pages; refresh reloads draft", async (t) => {
    if (!requireDb()) return t.skip(skipReason || "no db");
    const ctx = await seedInstance("draft");
    const key = "home.hero.title";
    const published = await contentService.saveWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: key,
      value: "Published Title",
      grantedPermissions: [PERMISSIONS.EDIT],
    });
    assert.equal(published.ok, true, JSON.stringify(published));
    const pub = await publicationService.publishWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      grantedPermissions: [PERMISSIONS.PUBLISH],
      actorIdentityId: null,
      allowEmpty: true,
    });
    assert.equal(pub.ok, true, JSON.stringify(pub));

    const draftSave = await contentService.saveWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: key,
      value: "Draft Only Title",
      grantedPermissions: [PERMISSIONS.EDIT],
    });
    assert.equal(draftSave.ok, true);

    const live = await resolver.resolveWebsiteContent(pool, {
      organizationId: ctx.organizationId,
      instance: ctx.instance,
      mode: resolver.MODE.LIVE,
    });
    const preview = await resolver.resolveWebsiteContent(pool, {
      organizationId: ctx.organizationId,
      instance: ctx.instance,
      mode: resolver.MODE.DRAFT,
    });
    assert.equal(live.values[key], "Published Title");
    assert.equal(preview.values[key], "Draft Only Title");

    const reloaded = await contentService.getWebsiteContentRow(
      pool,
      ctx.instance.id,
      ctx.organizationId,
      key
    );
    assert.equal(reloaded.draftValue, "Draft Only Title");
    assert.equal(reloaded.publishedValue, "Published Title");
  });

  it("rejects stale concurrent draft overwrites when expectedUpdatedAt is set", async (t) => {
    if (!requireDb()) return t.skip(skipReason || "no db");
    const ctx = await seedInstance("conflict");
    const key = "home.hero.subtitle";
    const first = await contentService.saveWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: key,
      value: "Revision A",
      grantedPermissions: [PERMISSIONS.EDIT],
    });
    assert.equal(first.ok, true);
    const stampA = first.content.updatedAt;

    const second = await contentService.saveWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: key,
      value: "Revision B",
      grantedPermissions: [PERMISSIONS.EDIT],
      expectedUpdatedAt: stampA,
    });
    assert.equal(second.ok, true);

    const stale = await contentService.saveWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: key,
      value: "Stale overwrite",
      grantedPermissions: [PERMISSIONS.EDIT],
      expectedUpdatedAt: stampA,
    });
    assert.equal(stale.ok, false);
    assert.equal(stale.code, "conflict");
    assert.equal(stale.content.draftValue, "Revision B");
  });

  it("rejects unauthorized publish and foreign tenant instance", async (t) => {
    if (!requireDb()) return t.skip(skipReason || "no db");
    const a = await seedInstance("authz-a");
    const b = await seedInstance("authz-b");
    await contentService.saveWebsiteDraft(pool, {
      organizationId: a.organizationId,
      instanceId: a.instance.id,
      contentKey: "home.hero.title",
      value: "A",
      grantedPermissions: [PERMISSIONS.EDIT],
    });
    const forbidden = await publicationService.publishWebsiteDraft(pool, {
      organizationId: a.organizationId,
      instanceId: a.instance.id,
      grantedPermissions: [PERMISSIONS.EDIT],
    });
    assert.equal(forbidden.ok, false);
    assert.equal(forbidden.code, "forbidden");

    const cross = await publicationService.publishWebsiteDraft(pool, {
      organizationId: b.organizationId,
      instanceId: a.instance.id,
      grantedPermissions: [PERMISSIONS.PUBLISH],
    });
    assert.equal(cross.ok, false);
  });

  it("blocks publish of V8-only draft shapes into shared snapshots", async (t) => {
    if (!requireDb()) return t.skip(skipReason || "no db");
    const ctx = await seedInstance("v8fmt");
    const key = "home.hero.title";
    await contentService.saveWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: key,
      value: { text: "Hello", v8Format: true, formatVersion: 2 },
      grantedPermissions: [PERMISSIONS.EDIT],
    });
    // Direct content validation may wrap/reject; force-compatible path via raw update.
    await pool.query(
      `UPDATE platform.website_content
          SET draft_value = $4::jsonb
        WHERE instance_id = $1 AND organization_id = $2 AND content_key = $3`,
      [
        ctx.instance.id,
        ctx.organizationId,
        key,
        JSON.stringify({ v: { text: "Hello", v8Format: true, formatVersion: 2 } }),
      ]
    );
    const blocked = await publicationService.publishWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      grantedPermissions: [PERMISSIONS.PUBLISH],
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, "v8_incompatible_publish");
  });

  it("publish/restore-as-draft preserves history and published until live restore", async (t) => {
    if (!requireDb()) return t.skip(skipReason || "no db");
    const ctx = await seedInstance("restore");
    const key = "home.hero.title";
    await contentService.saveWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: key,
      value: "V1 Live",
      grantedPermissions: [PERMISSIONS.EDIT],
    });
    const v1 = await publicationService.publishWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      grantedPermissions: [PERMISSIONS.PUBLISH],
      allowEmpty: true,
    });
    assert.equal(v1.ok, true, JSON.stringify(v1));

    await contentService.saveWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: key,
      value: "V2 Live",
      grantedPermissions: [PERMISSIONS.EDIT],
    });
    const v2 = await publicationService.publishWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      grantedPermissions: [PERMISSIONS.PUBLISH],
    });
    assert.equal(v2.ok, true, JSON.stringify(v2));

    await contentService.saveWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: key,
      value: "Unpublished WIP",
      grantedPermissions: [PERMISSIONS.EDIT],
    });

    const restoredDraft = await publicationService.restoreWebsiteVersionToDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      versionId: v1.version.id,
      grantedPermissions: [PERMISSIONS.RESTORE, PERMISSIONS.EDIT],
    });
    assert.equal(restoredDraft.ok, true, JSON.stringify(restoredDraft));
    assert.equal(restoredDraft.publishedUnchanged, true);

    const row = await contentService.getWebsiteContentRow(
      pool,
      ctx.instance.id,
      ctx.organizationId,
      key
    );
    assert.equal(row.draftValue, "V1 Live");
    assert.equal(row.publishedValue, "V2 Live");

    const listed = await versionService.listWebsiteVersions(pool, {
      instanceId: ctx.instance.id,
      organizationId: ctx.organizationId,
    });
    assert.ok((listed.versions || []).length >= 2);
  });

  it("hydrates mediaId to CDN URL; archive refuses draft/published refs; V8 cannot delete V7 bytes", async (t) => {
    if (!requireDb()) return t.skip(skipReason || "no db");
    const ctx = await seedInstance("media");
    const env = {
      NODE_ENV: "test",
      MEDIA_STORAGE_ROOT: mediaRoot,
      MEDIA_PUBLIC_BASE_URL: "https://cdn.test.invalid/media",
      MEDIA_STORAGE_DISABLE: "0",
      PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
      DEPLOYMENT_ENV: "testing",
    };
    const uploaded = await mediaService.registerWebsiteMedia(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      buffer: jpegBuffer(64),
      mimeType: "image/jpeg",
      originalFilename: "hero.jpg",
      actorIdentityId: null,
      env,
    });
    assert.equal(uploaded.ok, true, JSON.stringify(uploaded));
    assert.match(String(uploaded.media.storageKey || ""), /^testing-v8\//);

    const key = "home.hero.image";
    const saved = await contentService.saveWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: key,
      value: { mediaId: uploaded.media.id, alt: "Hero" },
      grantedPermissions: [PERMISSIONS.EDIT],
      env,
    });
    assert.equal(saved.ok, true, JSON.stringify(saved));

    const hydrated = await mediaService.hydrateWebsiteImageValue(pool, {
      organizationId: ctx.organizationId,
      instance: ctx.instance,
      value: { mediaId: uploaded.media.id, alt: "Hero" },
      env,
    });
    assert.match(String(hydrated && hydrated.src), /^https:\/\/cdn\.test\.invalid\/media\/testing-v8\//);
    assert.equal(hydrated.mediaId, uploaded.media.id);

    const blockedDraft = await mediaService.archiveWebsiteMedia(pool, {
      organizationId: ctx.organizationId,
      mediaId: uploaded.media.id,
    });
    assert.equal(blockedDraft.ok, false);
    assert.ok(
      blockedDraft.code === "media_in_use_draft" ||
        blockedDraft.code === "media_in_use" ||
        blockedDraft.code === "media_in_use_published"
    );

    const pub = await publicationService.publishWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      grantedPermissions: [PERMISSIONS.PUBLISH],
      allowEmpty: true,
    });
    assert.equal(pub.ok, true, JSON.stringify(pub));

    const blockedPub = await mediaService.archiveWebsiteMedia(pool, {
      organizationId: ctx.organizationId,
      mediaId: uploaded.media.id,
    });
    assert.equal(blockedPub.ok, false);

    // V7-shaped bytes under testing/ must remain readable by V8 but not deletable.
    const orgId = ctx.organizationId;
    const v7MediaId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const v7Key = `testing/activeclinic/${orgId}/${v7MediaId}.jpg`;
    const abs = path.join(mediaRoot, ...v7Key.split("/"));
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, jpegBuffer(32));
    const v8Storage = createHostingerMediaStorage(env);
    assert.equal(v8Storage.mediaExists(v7Key), true);
    const bytes = await v8Storage.readMedia(v7Key);
    assert.ok(Buffer.isBuffer(bytes) && bytes.length >= 4);
    await assert.rejects(
      () => v8Storage.deleteMedia({ storageKey: v7Key }),
      (err) => err && err.code === "MEDIA_ENVIRONMENT_MISMATCH"
    );
    assert.equal(fs.existsSync(abs), true);
  });

  it("broken media hydration fails closed without inventing local asset paths", async (t) => {
    if (!requireDb()) return t.skip(skipReason || "no db");
    const ctx = await seedInstance("broken-media");
    const missing = await mediaService.hydrateWebsiteImageValue(pool, {
      organizationId: ctx.organizationId,
      instance: ctx.instance,
      value: { mediaId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", alt: "gone" },
      env: {
        MEDIA_PUBLIC_BASE_URL: "https://cdn.test.invalid/media",
        PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
      },
    });
    assert.equal(missing.src, null);
    assert.doesNotMatch(String(missing.src || ""), /\/church\/images\/|\/activeclinic\/assets\//);
  });
});
