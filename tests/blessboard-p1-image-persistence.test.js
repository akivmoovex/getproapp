"use strict";

/**
 * BB-BUG-002 / BB-1.1-017 — website image persistence across
 * upload → draft save → refresh/reopen → publish → public render → replace.
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const instanceRepo = require("../src/platform/website/instanceRepository");
const contentService = require("../src/platform/website/contentService");
const publicationService = require("../src/platform/website/publicationService");
const resolver = require("../src/platform/website/resolver");
const mediaService = require("../src/platform/website/mediaService");
const { presentImageValue } = require("../src/platform/media/cdnMediaPresentation");
const { initializeOrganizationWebsite } = require("../src/platform/registration/initializeOrganizationWebsite");
const {
  ensureChurchSettingsInitialized,
} = require("../src/blessboard/services/blessBoardSettingsService");
const { PROVIDER_HOSTINGER } = require("../src/platform/media/hostingerMediaConfig");

const IDENTITY_KEY = "blessboard-platform-v5";
const APEX = "blessboard.org";
const ORG_KEY = "imgpersistp1";
const HOST = `${ORG_KEY}.blessboard.org`;
const PASS = "correct-horse-battery-staple";
const CDN_BASE = "https://cdn.test.invalid/media";
const EDIT = `/c/${ORG_KEY}/hq?website_edit=1&website_mode=draft`;

function jpegBuffer(size) {
  const buf = Buffer.alloc(Math.max(size, 12), 0);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf;
}

function extractCsrf(html) {
  const m = String(html || "").match(
    /name="_csrf"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="_csrf"/
  );
  return (m && (m[1] || m[2])) || null;
}

function cookieHeader(...parts) {
  const tokens = [];
  for (const part of parts) {
    if (!part) continue;
    if (typeof part === "string") tokens.push(part);
    else if (part.headers && part.headers["set-cookie"]) {
      const raw = part.headers["set-cookie"];
      const list = Array.isArray(raw) ? raw : [raw];
      tokens.push(...list.map((line) => String(line).split(";")[0]));
    }
  }
  return tokens.filter(Boolean).join("; ");
}

describe("BB-P1 image persistence (BB-BUG-002 / BB-1.1-017)", () => {
  let pool;
  let mediaRoot;
  let skipReason = "";
  let organizationId;
  let userId;
  let instance;
  let sessionToken;
  let env;
  let app;

  before(async () => {
    mediaRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "bb-p1-img-"));
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
      await provisionPlatformTenant(pool, {
        organizationKey: ORG_KEY,
        displayName: "Img Persist P1",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: ORG_KEY,
        hostname: HOST,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      await provisionBlessBoardChurch(pool, {
        organizationKey: ORG_KEY,
        churchKey: ORG_KEY,
        displayName: "Img Persist P1 Church",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      organizationId = (
        await pool.query(`SELECT id FROM platform.organizations WHERE organization_key=$1`, [ORG_KEY])
      ).rows[0].id;
      const created = await createBlessBoardUser(pool, {
        email: `hq@${ORG_KEY}.test`,
        displayName: "HQ",
        password: PASS,
      });
      userId = created.user.id;
      await assignBlessBoardRole(pool, {
        email: `hq@${ORG_KEY}.test`,
        organizationKey: ORG_KEY,
        roleKey: "church_hq_admin",
        churchKey: ORG_KEY,
      });
      const session = await createV5Session(pool, {
        deploymentCode: "blessboard-org-staging",
        userId,
        organizationId,
      });
      sessionToken = session.rawToken;
      await initializeOrganizationWebsite(pool, {
        organizationId,
        productCode: "blessboard",
        slug: ORG_KEY,
        actorIdentityId: userId,
      });
      instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
        organizationId,
        productCode: "blessboard",
      });
      env = {
        NODE_ENV: "test",
        PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
        DATABASE_URL: databaseUrl,
        SESSION_SECRET: "a".repeat(40),
        BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
        BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
        DEPLOYMENT_ENV: "testing",
        MEDIA_STORAGE_ROOT: mediaRoot,
        MEDIA_PUBLIC_BASE_URL: CDN_BASE,
      };
      process.env.MEDIA_STORAGE_ROOT = mediaRoot;
      process.env.MEDIA_PUBLIC_BASE_URL = CDN_BASE;
      process.env.DEPLOYMENT_ENV = "testing";
      app = createV5FoundationApp({ getPool: () => pool, env });
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 200) : "db unavailable";
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
    if (mediaRoot) await fsp.rm(mediaRoot, { recursive: true, force: true }).catch(() => {});
  });

  async function editorCookies() {
    const sid = `${DEFAULT_V5_COOKIE}=${sessionToken}`;
    const edit = await request(app).get(EDIT).set("Host", APEX).set("Cookie", sid);
    assert.equal(edit.status, 200, edit.text && edit.text.slice(0, 300));
    const csrf = extractCsrf(edit.text);
    assert.ok(csrf, "csrf token");
    return { sid, csrf, cookies: cookieHeader(sid, edit), edit };
  }

  async function uploadImage(cookies, csrf, filename, altText) {
    const uploaded = await request(app)
      .post(`/c/${ORG_KEY}/website/media`)
      .set("Host", APEX)
      .set("Cookie", cookies)
      .field(CSRF_FIELD, csrf)
      .field("altText", altText)
      .attach("file", jpegBuffer(48), { filename, contentType: "image/jpeg" });
    assert.equal(uploaded.status, 200, uploaded.text);
    assert.equal(uploaded.body.ok, true);
    assert.equal(uploaded.body.media.storageProvider, PROVIDER_HOSTINGER);
    assert.match(String(uploaded.body.media.publicSrc || ""), new RegExp(`^${CDN_BASE}/`));
    assert.doesNotMatch(String(uploaded.body.media.publicSrc || ""), /^(blob:|data:)/i);
    assert.doesNotMatch(String(uploaded.body.media.publicSrc || ""), /\/website\/media\//);
    return uploaded.body.media;
  }

  it("upload → save draft → refresh/reopen → publish → public → replace", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const { sid, csrf, cookies } = await editorCookies();

    // Upload
    const media = await uploadImage(cookies, csrf, "logo-a.jpg", "Logo A");
    const mediaId = media.id;

    // Save draft with app-mediated src (client historically sent this)
    const saved = await request(app)
      .post(`/c/${ORG_KEY}/website/drafts`)
      .set("Host", APEX)
      .set("Cookie", cookies)
      .set("Accept", "application/json")
      .send({
        [CSRF_FIELD]: csrf,
        contentKey: "home.logo",
        value: {
          alt: "Logo A",
          mediaId,
          src: `/c/${ORG_KEY}/website/media/${mediaId}`,
        },
      });
    assert.equal(saved.status, 200, saved.text);
    assert.equal(saved.body.ok, true);
    assert.equal(saved.body.published, false);
    const draftValue = saved.body.content && saved.body.content.draftValue;
    assert.equal(draftValue.mediaId, mediaId);
    assert.match(String(draftValue.src || ""), new RegExp(`^${CDN_BASE}/`));
    assert.doesNotMatch(String(draftValue.src || ""), /^(blob:|data:)/i);
    assert.doesNotMatch(String(draftValue.src || ""), /\/website\/media\//);

    const row = await pool.query(
      `SELECT draft_value FROM platform.website_content
        WHERE organization_id=$1 AND content_key='home.logo'`,
      [organizationId]
    );
    const stored = row.rows[0].draft_value && row.rows[0].draft_value.v;
    assert.equal(stored.mediaId, mediaId);
    assert.match(String(stored.src || ""), new RegExp(`^${CDN_BASE}/`));

    // Refresh / reopen editor — CDN logo must survive (not placeholder/default)
    const reload = await request(app).get(EDIT).set("Host", APEX).set("Cookie", sid);
    assert.equal(reload.status, 200);
    assert.match(reload.text, new RegExp(`data-website-media-id="${mediaId}"`));
    assert.match(
      reload.text,
      new RegExp(
        `data-website-key="home\\.logo"[\\s\\S]{0,500}src="${CDN_BASE.replace(/\./g, "\\.")}/testing/blessboard/`
      )
    );
    assert.doesNotMatch(
      reload.text,
      /data-website-key="home\.logo"[\s\S]{0,400}data-website-image-placeholder="1"/
    );

    // Hydration recovers mediaId-only rows (historical null-src drafts)
    await contentService.saveWebsiteDraft(pool, {
      organizationId,
      instanceId: instance.id,
      contentKey: "home.logo",
      value: { alt: "Logo A", mediaId, src: null },
      grantedPermissions: ["website.edit"],
      actorIdentityId: userId,
      env,
    });
    // Force a null src past assertOwned by direct update to simulate legacy rows
    await pool.query(
      `UPDATE platform.website_content
          SET draft_value = $1::jsonb
        WHERE organization_id = $2 AND content_key = 'home.logo'`,
      [JSON.stringify({ v: { alt: "Logo A", mediaId, src: null } }), organizationId]
    );
    const hydrated = await mediaService.hydrateWebsiteImageValue(pool, {
      organizationId,
      instance,
      env,
      value: { alt: "Logo A", mediaId, src: null },
    });
    assert.match(String(hydrated.src || ""), new RegExp(`^${CDN_BASE}/`));
    assert.equal(hydrated.mediaId, mediaId);

    const reopen = await request(app).get(EDIT).set("Host", APEX).set("Cookie", sid);
    assert.match(reopen.text, new RegExp(`data-website-media-id="${mediaId}"`));
    assert.match(reopen.text, new RegExp(`${CDN_BASE.replace(/\./g, "\\.")}/testing/blessboard/`));

    // Restore CDN src for publish path
    await contentService.saveWebsiteDraft(pool, {
      organizationId,
      instanceId: instance.id,
      contentKey: "home.logo",
      value: { alt: "Logo A", mediaId, src: media.publicSrc },
      grantedPermissions: ["website.edit"],
      actorIdentityId: userId,
      env,
    });

    const published = await publicationService.publishWebsiteDraft(pool, {
      organizationId,
      instanceId: instance.id,
      grantedPermissions: ["website.publish"],
      actorIdentityId: userId,
      allowEmpty: true,
    });
    assert.equal(published.ok, true, JSON.stringify(published));

    const live = await resolver.resolveWebsiteContent(pool, {
      organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(live.values["home.logo"].mediaId, mediaId);
    assert.match(String(live.values["home.logo"].src || ""), new RegExp(`^${CDN_BASE}/`));

    await instanceRepo.updateWebsiteInstance(pool, {
      instanceId: instance.id,
      organizationId,
      status: "published",
      publishedAt: new Date().toISOString(),
    });
    const churchId = (
      await pool.query(`SELECT id FROM blessboard.churches WHERE organization_id = $1 LIMIT 1`, [
        organizationId,
      ])
    ).rows[0].id;
    await ensureChurchSettingsInitialized(pool, churchId);
    await pool.query(
      `INSERT INTO blessboard.church_settings (church_id, public_name, website_status)
       VALUES ($1, $2, 'published')
       ON CONFLICT (church_id) DO UPDATE SET website_status = 'published', updated_at = now()`,
      [churchId, "Img Persist P1 Church"]
    );
    const statusRow = await pool.query(
      `SELECT website_status FROM blessboard.church_settings WHERE church_id = $1`,
      [churchId]
    );
    assert.equal(statusRow.rows[0].website_status, "published");

    const publicPage = await request(app).get(`/c/${ORG_KEY}/hq`).set("Host", APEX);
    assert.equal(publicPage.status, 200, publicPage.text.slice(0, 200));
    assert.doesNotMatch(publicPage.text, /Website coming soon/);
    assert.match(publicPage.text, new RegExp(`${CDN_BASE.replace(/\./g, "\\.")}/testing/blessboard/`));
    assert.match(publicPage.text, new RegExp(mediaId));

    // Replace existing image
    const media2 = await uploadImage(cookies, csrf, "logo-b.jpg", "Logo B");
    const replaced = await request(app)
      .post(`/c/${ORG_KEY}/website/drafts`)
      .set("Host", APEX)
      .set("Cookie", cookies)
      .set("Accept", "application/json")
      .send({
        [CSRF_FIELD]: csrf,
        contentKey: "home.logo",
        value: {
          alt: "Logo B",
          mediaId: media2.id,
          src: `/c/${ORG_KEY}/website/media/${media2.id}`,
        },
      });
    assert.equal(replaced.status, 200, replaced.text);
    assert.equal(replaced.body.content.draftValue.mediaId, media2.id);
    assert.match(String(replaced.body.content.draftValue.src || ""), new RegExp(`^${CDN_BASE}/`));
    assert.notEqual(replaced.body.content.draftValue.src, live.values["home.logo"].src);

    const afterReplace = await request(app).get(EDIT).set("Host", APEX).set("Cookie", sid);
    assert.match(afterReplace.text, new RegExp(`data-website-media-id="${media2.id}"`));
    assert.doesNotMatch(afterReplace.text, new RegExp(`data-website-media-id="${mediaId}"`));

    // Sync presentImageValue must not invent blob/data URLs
    const presented = presentImageValue(replaced.body.content.draftValue, env);
    assert.match(String(presented.src || ""), new RegExp(`^${CDN_BASE}/`));
    assert.doesNotMatch(String(presented.src || ""), /^(blob:|data:)/i);
  });

  it("hero image shares the same CDN persistence path", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const { sid, csrf, cookies } = await editorCookies();
    const media = await uploadImage(cookies, csrf, "hero.jpg", "Hero");
    const saved = await request(app)
      .post(`/c/${ORG_KEY}/website/drafts`)
      .set("Host", APEX)
      .set("Cookie", cookies)
      .set("Accept", "application/json")
      .send({
        [CSRF_FIELD]: csrf,
        contentKey: "home.hero.image",
        value: {
          alt: "Hero",
          mediaId: media.id,
          src: `/c/${ORG_KEY}/website/media/${media.id}`,
        },
      });
    assert.equal(saved.status, 200, saved.text);
    assert.match(String(saved.body.content.draftValue.src || ""), new RegExp(`^${CDN_BASE}/`));

    const reload = await request(app).get(EDIT).set("Host", APEX).set("Cookie", sid);
    assert.match(reload.text, new RegExp(media.id));
    assert.match(reload.text, new RegExp(`${CDN_BASE.replace(/\./g, "\\.")}/testing/blessboard/`));
  });
});
