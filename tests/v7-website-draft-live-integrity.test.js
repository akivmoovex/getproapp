"use strict";

/**
 * V7 website draft/live integrity for ActiveClinic and BlessBoard.
 * Saving a field never publishes. Public visitors see published content only.
 * Publish/restore create new immutable versions.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const request = require("supertest");
const crypto = require("crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const {
  submitAndProvisionClinicRegistration,
} = require("../src/activeclinic/services/submitClinicRegistrationService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, CSRF_COOKIE, issueCsrfToken } = require("../src/platform/http/v5Csrf");
const instanceRepo = require("../src/platform/website/instanceRepository");
const contentService = require("../src/platform/website/contentService");
const publicationService = require("../src/platform/website/publicationService");
const versionService = require("../src/platform/website/versionService");
const resolver = require("../src/platform/website/resolver");
const mediaService = require("../src/platform/website/mediaService");
const { INLINE_SAVE_PUBLISHES } = require("../src/platform/website/inlineEditorContract");
const {
  setClinicWebsiteAvailability,
} = require("../src/activeclinic/services/clinicWebsiteAvailabilityService");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  provisionEmptyPublicPages,
  createPageSection,
  updatePublicPage,
} = require("../src/blessboard/services/publicContentAdminService");
const draftRepo = require("../src/blessboard/repositories/websiteInlineFieldDraftRepository");
const {
  saveInlineFieldDraft,
} = require("../src/blessboard/services/websiteInlineDraftService");
const {
  saveStructuredDraft,
} = require("../src/blessboard/services/websiteStructuredDraftService");
const {
  recordPublishVersionInTransaction,
  createRestoredDraft,
} = require("../src/blessboard/services/websitePublicationVersionService");
const versionRepo = require("../src/blessboard/repositories/websitePublicationVersionRepository");

const IDENTITY_KEY = "blessboard-platform-v5";
const AC_PASSWORD = "clinic-admin-pass-12";
const BB_PASSWORD = "correct-horse-battery-staple";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});
const HOST_A = "dli-a.blessboard.org";
const HOST_B = "dli-b.blessboard.org";

function jpegBuffer(size) {
  const buf = Buffer.alloc(Math.max(size, 12), 0);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf;
}

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

function cookieHeader(...parts) {
  return parts.filter(Boolean).join("; ");
}

describe("v7 website draft/live integrity — contract", () => {
  it("✓ save never publishes in the shared contract or client JS", () => {
    assert.equal(INLINE_SAVE_PUBLISHES, false);
    const acJs = fs.readFileSync(
      path.join(__dirname, "../public/platform/website-inline-edit.js"),
      "utf8"
    );
    const bbJs = fs.readFileSync(
      path.join(__dirname, "../public/blessboard/v5/website-inline-edit.js"),
      "utf8"
    );
    assert.match(acJs, /function cancel\(\)/);
    assert.doesNotMatch(acJs.slice(acJs.indexOf("function cancel()"), acJs.indexOf("function cancel()") + 220), /postJson|fetch\(/);
    assert.match(bbJs, /data-bb-inline-cancel/);
    assert.match(bbJs, /exitEdit\(cancelRoot, prior\)/);
    assert.doesNotMatch(bbJs, /saveAndPublishField/);
    const cancelFn = bbJs.slice(
      bbJs.indexOf("var cancel = event.target.closest(\"[data-bb-inline-cancel='1']\")"),
      bbJs.indexOf("function onKeydown")
    );
    assert.doesNotMatch(cancelFn, /fetch\(|saveField\(/);
  });
});

describe("v7 website draft/live integrity — ActiveClinic", () => {
  let pool;
  let skipReason = null;
  let stamp = 0;
  let phoneSeq = 770000000;

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
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 240) : "no foundation db";
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

  function nextPhone() {
    phoneSeq += 1;
    return `+2609${String(phoneSeq).slice(-8)}`;
  }

  function clinicPayload() {
    stamp += 1;
    return {
      clinicName: `DLI Clinic ${stamp}`,
      contactName: "Website Admin",
      contactEmail: `dli-${stamp}@example.invalid`,
      contactPhone: nextPhone(),
      province: "Lusaka Province",
      city: "Lusaka",
      address: "1 Independence Avenue",
      countryCode: "ZM",
      notes: "draft live integrity",
      password: AC_PASSWORD,
      passwordConfirm: AC_PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    };
  }

  async function sessionCookie(identityId, orgId) {
    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: identityId,
      organizationId: orgId,
    });
    assert.equal(session.ok, true, JSON.stringify(session));
    return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
  }

  function makeApp() {
    return createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
  }

  function extractCsrf(res) {
    const html = String(res.text || "");
    const meta = html.match(/name="csrf-token"\s+content="([^"]+)"/);
    if (meta) return meta[1];
    const field = html.match(new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"`));
    return field ? field[1] : issueCsrfToken(MINIMAL_AC);
  }

  async function seedLiveClinic() {
    const result = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    assert.equal(result.ok, true, JSON.stringify(result));
    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: result.organizationId,
      productCode: "activeclinic",
    });
    const published = await publicationService.publishWebsiteDraft(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      allowEmpty: true,
    });
    assert.equal(published.ok, true, JSON.stringify(published));
    const availability = await setClinicWebsiteAvailability(pool, {
      organizationKey: result.slug,
      public: true,
      overrideReadiness: true,
      reason: "integrity_test",
    });
    assert.equal(availability.ok, true, JSON.stringify(availability));
    return { result, instance, published };
  }

  it("1 anonymous visitors cannot read unpublished clinics or later drafts", async () => {
    if (!requireDb()) return;
    const unpublished = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    const app = makeApp();
    const hidden = await request(app).get(`/clinics/${unpublished.slug}`);
    assert.equal(hidden.status, 403);

    const { result, instance } = await seedLiveClinic();
    const liveTitle = (
      await resolver.resolveWebsiteContent(pool, {
        organizationId: result.organizationId,
        instance,
        mode: resolver.MODE.LIVE,
      })
    ).values["home.hero.title"];
    const saved = await contentService.saveWebsiteDraft(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      contentKey: "home.hero.title",
      value: "SECRET_DRAFT_TITLE_AC",
    });
    assert.equal(saved.ok, true);
    assert.equal(saved.content.publishedValue, liveTitle);
    const anon = await request(app).get(`/clinics/${result.slug}?website_edit=1&website_mode=draft`);
    assert.equal(anon.status, 200);
    assert.match(anon.text, new RegExp(liveTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(anon.text, /SECRET_DRAFT_TITLE_AC/);
  });

  it("2-5 text and image ✓ write draft only; preview reads draft; cancel JS does not write", async () => {
    if (!requireDb()) return;
    const { result, instance } = await seedLiveClinic();
    const app = makeApp();
    const adminCookie = await sessionCookie(result.identityId, result.organizationId);
    const editPage = await request(app)
      .get(`/clinics/${result.slug}?website_edit=1&website_mode=draft`)
      .set("Cookie", adminCookie);
    assert.equal(editPage.status, 200);
    const csrf = extractCsrf(editPage);
    const cookies = cookieHeader(adminCookie, ...(editPage.headers["set-cookie"] || []));

    const textSave = await request(app)
      .post(`/clinics/${result.slug}/website/drafts`)
      .set("Cookie", cookies)
      .send({ [CSRF_FIELD]: csrf, contentKey: "home.hero.title", value: "Draft Title After Live" });
    assert.equal(textSave.status, 200, textSave.text);
    const textBody = JSON.parse(textSave.text);
    assert.equal(textBody.ok, true);
    assert.equal(textBody.published, false);

    const jpeg = await mediaService.registerWebsiteMedia(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      mediaKind: "image",
      originalFilename: "hero.jpg",
      mimeType: "image/jpeg",
      buffer: jpegBuffer(64),
      altText: "Draft hero",
    });
    assert.equal(jpeg.ok, true, JSON.stringify(jpeg));
    const imageSave = await request(app)
      .post(`/clinics/${result.slug}/website/drafts`)
      .set("Cookie", cookies)
      .send({
        [CSRF_FIELD]: csrf,
        contentKey: "home.hero.image",
        value: {
          alt: "Draft hero",
          mediaId: jpeg.media.id,
          src: `/clinics/${result.slug}/website/media/${jpeg.media.id}`,
        },
      });
    assert.equal(imageSave.status, 200, imageSave.text);
    assert.equal(JSON.parse(imageSave.text).published, false);

    const live = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    assert.notEqual(live.values["home.hero.title"], "Draft Title After Live");
    const liveImage = live.values["home.hero.image"];
    const liveMediaId =
      liveImage && typeof liveImage === "object" ? liveImage.mediaId : null;
    assert.notEqual(liveMediaId, jpeg.media.id);

    const draft = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.DRAFT,
    });
    assert.equal(draft.values["home.hero.title"], "Draft Title After Live");
    assert.equal(draft.values["home.hero.image"].mediaId, jpeg.media.id);

    const preview = await request(app)
      .get(`/clinics/${result.slug}/website/preview`)
      .set("Cookie", cookies);
    assert.equal(preview.status, 303);
    const previewPage = await request(app)
      .get(preview.headers.location)
      .set("Cookie", cookies);
    assert.equal(previewPage.status, 200);
    assert.match(previewPage.text, /Draft Title After Live/);

    const anonMedia = await request(app).get(
      `/clinics/${result.slug}/website/media/${jpeg.media.id}`
    );
    assert.equal(anonMedia.status, 404);
  });

  it("6-8 publish creates a new immutable version; later edits leave live; restore adds a version", async () => {
    if (!requireDb()) return;
    const { result, instance } = await seedLiveClinic();
    await contentService.saveWebsiteDraft(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      contentKey: "home.hero.title",
      value: "Version One Live",
    });
    const v1 = await publicationService.publishWebsiteDraft(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
    });
    assert.equal(v1.ok, true, JSON.stringify(v1));
    assert.equal(v1.published, true);
    const v1Number = v1.version.versionNumber;

    await contentService.saveWebsiteDraft(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      contentKey: "home.hero.title",
      value: "Unpublished After V1",
    });
    const liveAfterEdit = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(liveAfterEdit.values["home.hero.title"], "Version One Live");

    await contentService.saveWebsiteDraft(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      contentKey: "home.hero.title",
      value: "Version Two Live",
    });
    const v2 = await publicationService.publishWebsiteDraft(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
    });
    assert.equal(v2.ok, true);
    assert.ok(v2.version.versionNumber > v1Number);

    const historic = await versionService.getWebsiteVersion(pool, {
      versionId: v1.version.id,
      organizationId: result.organizationId,
    });
    assert.equal(historic.version.snapshot.values["home.hero.title"], "Version One Live");

    const restored = await publicationService.restoreWebsiteVersionLive(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      versionId: v1.version.id,
    });
    assert.equal(restored.ok, true, JSON.stringify(restored));
    assert.ok(restored.version.versionNumber > v2.version.versionNumber);
    const historicAfter = await versionService.getWebsiteVersion(pool, {
      versionId: v1.version.id,
      organizationId: result.organizationId,
    });
    assert.equal(historicAfter.version.snapshot.values["home.hero.title"], "Version One Live");
    const liveRestored = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(liveRestored.values["home.hero.title"], "Version One Live");
  });

  it("10 cross-tenant draft reads and writes are blocked", async () => {
    if (!requireDb()) return;
    const a = await seedLiveClinic();
    const b = await seedLiveClinic();
    const crossed = await contentService.saveWebsiteDraft(pool, {
      organizationId: b.result.organizationId,
      instanceId: a.instance.id,
      contentKey: "home.hero.title",
      value: "Hijack",
    });
    assert.equal(crossed.ok, false);
    const restoreCross = await publicationService.restoreWebsiteVersionLive(pool, {
      organizationId: b.result.organizationId,
      instanceId: b.instance.id,
      versionId: a.published.version.id,
    });
    assert.equal(restoreCross.ok, false);
    const liveA = await resolver.resolveWebsiteContent(pool, {
      organizationId: a.result.organizationId,
      instance: a.instance,
      mode: resolver.MODE.LIVE,
    });
    assert.notEqual(liveA.values["home.hero.title"], "Hijack");
  });
});

describe("v7 website draft/live integrity — BlessBoard", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let churchA;
  let users = {};

  function baseEnv(overrides) {
    return {
      NODE_ENV: "test",
      PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
      SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
      SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
      BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
      BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
      ...overrides,
    };
  }

  function skipIfNeeded() {
    if (!skipSuite) return false;
    assert.fail(`BlessBoard integrity setup failed: ${skipReason}`);
    return true;
  }

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

      orgA = await provisionPlatformTenant(pool, {
        organizationKey: "dli-a",
        displayName: "DLI A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "dli-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);
      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "dli-a",
        churchKey: "dli-a",
        displayName: "DLI Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;

      orgB = await provisionPlatformTenant(pool, {
        organizationKey: "dli-b",
        displayName: "DLI B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "dli-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(orgB.ok, true, orgB.message);
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "dli-b",
        churchKey: "dli-b",
        displayName: "DLI Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);

      await ensureChurchSettingsInitialized(pool, churchA.id);
      await updateChurchSettings(pool, churchA.id, {
        websiteStatus: "published",
        publicName: "DLI Church A",
      });
      await provisionEmptyPublicPages(pool, { churchId: churchA.id, branchId: null });
      const home = await pool.query(
        `SELECT id FROM blessboard.public_pages
          WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL LIMIT 1`,
        [churchA.id]
      );
      assert.ok(home.rows[0], "home page");
      const published = await updatePublicPage(pool, home.rows[0].id, { status: "published" });
      assert.equal(published.ok, true, published.reason || "publish home");
      const sectionCreated = await createPageSection(pool, {
        pageId: home.rows[0].id,
        sectionKey: "hero",
        sectionType: "hero",
        heading: "Published Welcome",
        bodyText: "Published body for visitors.",
        mediaUrl: "https://cdn.example.test/published-hero.jpg",
        status: "published",
        sortOrder: 0,
      });
      assert.equal(sectionCreated.ok, true, sectionCreated.reason || "create hero");

      async function makeUser(email, displayName, role, organizationId) {
        const created = await createBlessBoardUser(pool, { email, displayName, password: BB_PASSWORD });
        assert.equal(created.ok, true, created.message);
        if (role) {
          assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        }
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-staging",
          userId: created.user.id,
          organizationId,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      users.hqA = await makeUser(
        "dli-hq-a@example.test",
        "HQ A",
        {
          email: "dli-hq-a@example.test",
          organizationKey: "dli-a",
          roleKey: "church_hq_admin",
          churchKey: "dli-a",
        },
        orgA.records.organization.id
      );
      users.hqB = await makeUser(
        "dli-hq-b@example.test",
        "HQ B",
        {
          email: "dli-hq-b@example.test",
          organizationKey: "dli-b",
          roleKey: "church_hq_admin",
          churchKey: "dli-b",
        },
        orgB.records.organization.id
      );

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await recordPublishVersionInTransaction(client, {
          organizationId: orgA.records.organization.id,
          churchId: churchA.id,
          actorUserId: users.hqA.user.id,
          sourceType: "hq_edit",
        });
        await client.query("COMMIT");
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      } finally {
        client.release();
      }

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("1 anonymous visitors read published content only", async () => {
    if (skipIfNeeded()) return;
    await saveInlineFieldDraft(pool, {
      organizationId: orgA.records.organization.id,
      churchId: churchA.id,
      branchId: null,
      editorUserId: users.hqA.user.id,
      pageKey: "home",
      sectionKey: "hero",
      fieldKey: "heading",
      newValue: "SECRET_DRAFT_HEADING_BB",
      grantedPermissions: ["website.edit"],
    });
    const publicRes = await request(app).get("/").set("Host", HOST_A).expect(200);
    assert.match(publicRes.text, /Published Welcome/);
    assert.doesNotMatch(publicRes.text, /SECRET_DRAFT_HEADING_BB/);
    const alias = await request(app)
      .get("/?website_edit=1&website_mode=draft")
      .set("Host", HOST_A)
      .expect(200);
    assert.match(alias.text, /Published Welcome/);
    assert.doesNotMatch(alias.text, /SECRET_DRAFT_HEADING_BB/);
    const pathPublic = await request(app)
      .get("/c/dli-a")
      .set("Host", "blessboard.org")
      .expect(200);
    assert.match(pathPublic.text, /Published Welcome/);
    assert.doesNotMatch(pathPublic.text, /SECRET_DRAFT_HEADING_BB/);
  });

  it("2-5 text and image ✓ write draft only; authorized preview reads draft", async () => {
    if (skipIfNeeded()) return;
    const csrf = issueCsrfToken(baseEnv());
    const textSave = await request(app)
      .post("/hq/content/api/inline-field")
      .set("Host", HOST_A)
      .set(
        "Cookie",
        cookieHeader(`${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`, `${CSRF_COOKIE}=${csrf}`)
      )
      .set("X-CSRF-Token", csrf)
      .send({
        [CSRF_FIELD]: csrf,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "Draft Heading Preview Me",
      });
    assert.equal(textSave.status, 200, textSave.text);
    assert.equal(textSave.body.published, false);

    const imageSave = await saveStructuredDraft(pool, {
      organizationId: orgA.records.organization.id,
      churchId: churchA.id,
      branchId: null,
      editorUserId: users.hqA.user.id,
      draftKind: "image",
      pageKey: "home",
      sectionKey: "hero",
      entityKey: "home-hero",
      payload: {
        imageUrl: "/church/images/tenant-public/about-story.jpg",
        altText: "Draft image only",
        focal: "center",
      },
    });
    assert.equal(imageSave.published, false);

    const section = await pool.query(
      `SELECT heading, media_url FROM blessboard.page_sections
        WHERE page_id = (
          SELECT id FROM blessboard.public_pages
           WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL LIMIT 1
        ) AND section_key = 'hero'`,
      [churchA.id]
    );
    assert.equal(section.rows[0].heading, "Published Welcome");
    assert.equal(section.rows[0].media_url, "https://cdn.example.test/published-hero.jpg");

    const publicRes = await request(app).get("/").set("Host", HOST_A).expect(200);
    assert.match(publicRes.text, /Published Welcome/);
    assert.doesNotMatch(publicRes.text, /Draft Heading Preview Me/);
    assert.doesNotMatch(publicRes.text, /about-story\.jpg/);

    const previewPublic = await request(app)
      .get("/?website_mode=draft")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`)
      .expect(200);
    assert.match(previewPublic.text, /Draft Heading Preview Me/);
    assert.match(previewPublic.text, /about-story\.jpg/);
    assert.doesNotMatch(previewPublic.text, /data-bb-inline-start/);

    const hqPreview = await request(app)
      .get("/hq/content/preview/home")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`);
    assert.equal(hqPreview.status, 200, hqPreview.text && hqPreview.text.slice(0, 400));
    assert.match(hqPreview.text, /Draft Heading Preview Me/);
  });

  it("6-8 publish records a new immutable version; restore does not mutate history", async () => {
    if (skipIfNeeded()) return;
    const v1 = await versionRepo.getCurrentPublishedVersion(
      pool,
      orgA.records.organization.id,
      null
    );
    assert.ok(v1, "published version exists");
    const snapshotBefore = JSON.stringify(v1.snapshot || {});
    const v1Heading =
      (((v1.snapshot || {}).pages || []).find((p) => p.pageKey === "home") || {}).sections || [];
    const publishedHero = v1Heading.find((s) => s.sectionKey === "hero");
    assert.equal(publishedHero && publishedHero.heading, "Published Welcome");

    await pool.query(
      `UPDATE blessboard.page_sections
          SET heading = 'Second Published Heading'
        WHERE page_id = (
          SELECT id FROM blessboard.public_pages
           WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL LIMIT 1
        ) AND section_key = 'hero'`,
      [churchA.id]
    );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await recordPublishVersionInTransaction(client, {
        organizationId: orgA.records.organization.id,
        churchId: churchA.id,
        actorUserId: users.hqA.user.id,
        sourceType: "hq_edit",
      });
      await client.query("COMMIT");
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      client.release();
    }

    const v2 = await versionRepo.getCurrentPublishedVersion(
      pool,
      orgA.records.organization.id,
      null
    );
    assert.ok(v2.versionNumber > v1.versionNumber);
    const historic = await versionRepo.getVersionByOrgAndId(
      pool,
      orgA.records.organization.id,
      v1.id
    );
    assert.equal(JSON.stringify(historic.snapshot || {}), snapshotBefore);

    const restored = await createRestoredDraft(pool, {
      organizationId: orgA.records.organization.id,
      churchId: churchA.id,
      versionId: v1.id,
      actorUserId: users.hqA.user.id,
      restorationReason: "Integrity restore to first published heading",
      selectedPageKeys: ["home"],
      confirmed: true,
    });
    assert.equal(restored.ok, true, JSON.stringify(restored));
    assert.ok(restored.draftVersion.versionNumber > v2.versionNumber);
    const historicAfter = await versionRepo.getVersionByOrgAndId(
      pool,
      orgA.records.organization.id,
      v1.id
    );
    assert.equal(JSON.stringify(historicAfter.snapshot || {}), snapshotBefore);
    const currentLive = await versionRepo.getCurrentPublishedVersion(
      pool,
      orgA.records.organization.id,
      null
    );
    assert.equal(currentLive.id, v2.id);
  });

  it("10 cross-tenant draft writes are blocked", async () => {
    if (skipIfNeeded()) return;
    const csrf = issueCsrfToken(baseEnv());
    const res = await request(app)
      .post("/hq/content/api/inline-field")
      .set("Host", HOST_A)
      .set(
        "Cookie",
        cookieHeader(`${DEFAULT_V5_COOKIE}=${users.hqB.rawToken}`, `${CSRF_COOKIE}=${csrf}`)
      )
      .set("X-CSRF-Token", csrf)
      .set("Accept", "application/json")
      .send({
        [CSRF_FIELD]: csrf,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "Cross Tenant Hijack",
      });
    assert.equal(res.status, 403, res.text);
    const drafts = await draftRepo.listDrafts(pool, {
      churchId: churchA.id,
      branchId: null,
      pageKey: "home",
    });
    assert.equal(
      drafts.some((d) => d.newValue === "Cross Tenant Hijack"),
      false
    );
  });
});
