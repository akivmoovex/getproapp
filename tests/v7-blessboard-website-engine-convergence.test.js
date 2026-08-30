"use strict";

/**
 * BlessBoard website lifecycle on the shared engine:
 * registration unpublished → draft in platform.website_content → tenant publish
 * → platform.website_versions → public /c/:key reads published values only.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const {
  publishChurchWebsite,
  acknowledgeWebsitePreview,
} = require("../src/blessboard/services/churchWebsitePublishService");
const {
  saveInlineFieldDraft,
} = require("../src/blessboard/services/websiteInlineDraftService");
const { SNAPSHOT_KEY } = require("../src/platform/website-engine/productSchemaRegistry");
const contentService = require("../src/platform/website/contentService");
const instanceRepo = require("../src/platform/website/instanceRepository");
const versionService = require("../src/platform/website/versionService");
const publicationService = require("../src/platform/website/publicationService");
const { PERMISSIONS } = require("../src/platform/website/permissions");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const APEX = "blessboard.org";
const HERO_KEY = "home.hero.heading";
const PUBLIC_SUFFIXES = [
  "",
  "/about",
  "/leadership",
  "/ministries",
  "/events",
  "/sermons",
  "/contact",
  "/giving",
];

let pool;
let skipReason = null;
let app;

function requireDb() {
  if (skipReason) {
    // eslint-disable-next-line no-console
    console.log("skip:", skipReason);
    return false;
  }
  return true;
}

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

async function provisionChurch(prefix) {
  const key = uniq(prefix || "bbconv");
  const row = await appRepo.createApplication(pool, {
    church_name: `Engine Conv ${key}`,
    country: "Zambia",
    city: "Lusaka",
    contact_name: "Site Admin",
    contact_email: `${key}@example.org`,
    contact_phone: `+26097${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
    selected_plan: "foundation",
    consent_terms: true,
    branch_name: "Main Campus",
  });
  const result = await provisionRegisteredBlessBoardChurch(pool, {
    applicationId: row.id,
    administratorPassword: PASSWORD,
    requestId: `req-${key}`,
    actorContext: {
      type: "test",
      source: "unit",
      dataEnvironment: "testing",
      deploymentCode: "blessboard-org-staging",
    },
  });
  assert.equal(result.ok, true, result.message || result.status);
  return result.records;
}

async function instanceFor(organizationId) {
  const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
    organizationId,
    productCode: "blessboard",
    scopeRef: null,
  });
  assert.ok(instance, "website instance missing");
  return instance;
}

async function publishReady(rec) {
  await acknowledgeWebsitePreview(pool, {
    organizationId: rec.organizationId,
    actorUserId: rec.administratorUserId,
  });
  const published = await publishChurchWebsite(pool, {
    churchId: rec.churchId,
    actorUserId: rec.administratorUserId,
    deferServiceTimes: true,
    confirmPublish: true,
  });
  assert.equal(published.ok, true, JSON.stringify(published));
  return published;
}

describe("v7 BlessBoard website engine convergence", () => {
  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
      app = createV5FoundationApp({
        getPool: () => pool,
        env: {
          NODE_ENV: "test",
          PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
          SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
          SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
          BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
          BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
        },
      });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : "no_foundation_db";
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  it("registration creates an unpublished shared-engine website", async () => {
    if (!requireDb()) return;
    const rec = await provisionChurch("reg");
    const instance = await instanceFor(rec.organizationId);
    assert.equal(instance.status, "coming_soon");
    assert.equal(instance.publishPolicy, "TENANT_PUBLISH");
    assert.equal(instance.lifecycleStatus, "provisional");

    const settings = await pool.query(
      `SELECT website_status FROM blessboard.church_settings WHERE church_id = $1`,
      [rec.churchId]
    );
    assert.equal(settings.rows[0].website_status, "draft");

    const versions = await pool.query(
      `SELECT count(*)::int AS n FROM platform.website_versions WHERE instance_id = $1`,
      [instance.id]
    );
    assert.equal(versions.rows[0].n, 0);

    const fields = await pool.query(
      `SELECT count(*)::int AS n
         FROM platform.website_content
        WHERE instance_id = $1 AND content_key <> $2`,
      [instance.id, SNAPSHOT_KEY]
    );
    assert.ok(fields.rows[0].n > 0, "engine field keys missing");

    const publicRes = await request(app)
      .get(`/c/${rec.organizationKey}`)
      .set("Host", APEX);
    assert.equal(publicRes.status, 200);
    assert.match(publicRes.text, /not public yet/i);
  });

  it("drafts store in the shared engine and leave the public site unchanged", async () => {
    if (!requireDb()) return;
    const rec = await provisionChurch("draft");
    const heading = `Draft heading ${uniq("h")}`;
    await saveInlineFieldDraft(pool, {
      organizationId: rec.organizationId,
      churchId: rec.churchId,
      editorUserId: rec.administratorUserId,
      pageKey: "home",
      sectionKey: "hero",
      fieldKey: "heading",
      newValue: heading,
      grantedPermissions: ["website.edit"],
    });

    const instance = await instanceFor(rec.organizationId);
    const row = await contentService.getWebsiteContentRow(
      pool,
      instance.id,
      rec.organizationId,
      HERO_KEY
    );
    assert.ok(row);
    assert.equal(String(row.draftValue || ""), heading);
    assert.notEqual(String(row.publishedValue || ""), heading);

    const cms = await pool.query(
      `SELECT ps.heading
         FROM blessboard.page_sections ps
         JOIN blessboard.public_pages pp ON pp.id = ps.page_id
        WHERE pp.church_id = $1 AND pp.page_key = 'home' AND ps.section_key = 'hero'`,
      [rec.churchId]
    );
    assert.notEqual(String(cms.rows[0].heading || ""), heading);

    const publicRes = await request(app)
      .get(`/c/${rec.organizationKey}`)
      .set("Host", APEX);
    assert.match(publicRes.text, /not public yet/i);
    assert.doesNotMatch(publicRes.text, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("tenant admin can publish; version is created; public site updates", async () => {
    if (!requireDb()) return;
    const rec = await provisionChurch("pub");
    const heading = `Live heading ${uniq("h")}`;
    await saveInlineFieldDraft(pool, {
      organizationId: rec.organizationId,
      churchId: rec.churchId,
      editorUserId: rec.administratorUserId,
      pageKey: "home",
      sectionKey: "hero",
      fieldKey: "heading",
      newValue: heading,
      grantedPermissions: ["website.edit"],
    });
    await publishReady(rec);

    const instance = await instanceFor(rec.organizationId);
    const versions = await versionService.listWebsiteVersions(pool, {
      instanceId: instance.id,
      organizationId: rec.organizationId,
    });
    assert.ok((versions.versions || []).length >= 1, "platform.website_versions missing");

    const row = await contentService.getWebsiteContentRow(
      pool,
      instance.id,
      rec.organizationId,
      HERO_KEY
    );
    assert.equal(String(row.publishedValue || ""), heading);

    const live = await request(app).get(`/c/${rec.organizationKey}`).set("Host", APEX);
    assert.equal(live.status, 200);
    assert.doesNotMatch(live.text, /not public yet/i);
    assert.match(live.text, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("church A cannot edit church B", async () => {
    if (!requireDb()) return;
    const a = await provisionChurch("isoA");
    const b = await provisionChurch("isoB");
    const heading = `Only A ${uniq("h")}`;
    await saveInlineFieldDraft(pool, {
      organizationId: a.organizationId,
      churchId: a.churchId,
      editorUserId: a.administratorUserId,
      pageKey: "home",
      sectionKey: "hero",
      fieldKey: "heading",
      newValue: heading,
      grantedPermissions: ["website.edit"],
    });

    const instanceB = await instanceFor(b.organizationId);
    const rowB = await contentService.getWebsiteContentRow(
      pool,
      instanceB.id,
      b.organizationId,
      HERO_KEY
    );
    assert.notEqual(String((rowB && rowB.draftValue) || ""), heading);

    const instanceA = await instanceFor(a.organizationId);
    const rowA = await contentService.getWebsiteContentRow(
      pool,
      instanceA.id,
      a.organizationId,
      HERO_KEY
    );
    assert.equal(String(rowA.draftValue || ""), heading);
  });

  it("retains previous versions and restore-as-new recreates live content", async () => {
    if (!requireDb()) return;
    const rec = await provisionChurch("hist");
    const first = `Version one ${uniq("h")}`;
    const second = `Version two ${uniq("h")}`;
    await saveInlineFieldDraft(pool, {
      organizationId: rec.organizationId,
      churchId: rec.churchId,
      editorUserId: rec.administratorUserId,
      pageKey: "home",
      sectionKey: "hero",
      fieldKey: "heading",
      newValue: first,
      grantedPermissions: ["website.edit"],
    });
    await publishReady(rec);

    await saveInlineFieldDraft(pool, {
      organizationId: rec.organizationId,
      churchId: rec.churchId,
      editorUserId: rec.administratorUserId,
      pageKey: "home",
      sectionKey: "hero",
      fieldKey: "heading",
      newValue: second,
      grantedPermissions: ["website.edit"],
    });
    await acknowledgeWebsitePreview(pool, {
      organizationId: rec.organizationId,
      actorUserId: rec.administratorUserId,
    });
    const secondPub = await publishChurchWebsite(pool, {
      churchId: rec.churchId,
      actorUserId: rec.administratorUserId,
      deferServiceTimes: true,
      confirmPublish: true,
      forcePublishVersion: true,
    });
    assert.equal(secondPub.ok, true, JSON.stringify(secondPub));

    const instance = await instanceFor(rec.organizationId);
    const listed = await versionService.listWebsiteVersions(pool, {
      instanceId: instance.id,
      organizationId: rec.organizationId,
    });
    const all = listed.versions || [];
    assert.ok(all.length >= 2, "previous published version not retained");
    const v1 = all.slice().sort((a, b) => Number(a.versionNumber) - Number(b.versionNumber))[0];

    const restored = await publicationService.restoreWebsiteVersionLive(pool, {
      organizationId: rec.organizationId,
      instanceId: instance.id,
      versionId: v1.id,
      grantedPermissions: [PERMISSIONS.ROLLBACK, PERMISSIONS.RESTORE],
    });
    assert.equal(restored.ok, true, JSON.stringify(restored));
    assert.ok(Number(restored.version.versionNumber) > Number(v1.versionNumber));

    const historic = await versionService.getWebsiteVersion(pool, {
      versionId: v1.id,
      organizationId: rec.organizationId,
    });
    const historicHeading =
      historic.version &&
      historic.version.snapshot &&
      historic.version.snapshot.values &&
      historic.version.snapshot.values[HERO_KEY];
    assert.equal(String(historicHeading || ""), first);

    const live = await request(app).get(`/c/${rec.organizationKey}`).set("Host", APEX);
    assert.match(live.text, new RegExp(first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(live.text, new RegExp(second.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("published public church routes still render product pages", async () => {
    if (!requireDb()) return;
    const rec = await provisionChurch("routes");
    await publishReady(rec);
    for (const suffix of PUBLIC_SUFFIXES) {
      const res = await request(app)
        .get(`/c/${rec.organizationKey}${suffix}`)
        .set("Host", APEX);
      assert.equal(res.status, 200, `${suffix || "/"} → ${res.status}`);
      assert.doesNotMatch(res.text, /not public yet/i);
    }
  });
});
