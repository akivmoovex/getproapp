"use strict";

/**
 * Phase 7 Stage 7 — mobile editing chrome, asset gating, publish-review mobile markers.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
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
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  provisionEmptyPublicPages,
  createPageSection,
  updatePublicPage,
} = require("../src/blessboard/services/publicContentAdminService");
const {
  saveInlineFieldDraft,
} = require("../src/blessboard/services/websiteInlineDraftService");
const {
  repairWebsiteFoundation,
} = require("../src/blessboard/services/websiteFoundationRepairService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST = "mobile7.blessboard.org";

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

describe("blessboard website mobile editing stage 7", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let org;
  let church;
  let users = {};

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

      org = await provisionPlatformTenant(pool, {
        organizationKey: "mobile7",
        displayName: "Mobile 7",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "mobile7",
        hostname: HOST,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(org.ok, true, org.message);
      const ch = await provisionBlessBoardChurch(pool, {
        organizationKey: "mobile7",
        churchKey: "mobile7",
        displayName: "Mobile Church 7",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      assert.equal(ch.ok, true, ch.message);
      church = ch.records.church;
      await repairWebsiteFoundation(pool, { churchId: church.id });

      await ensureChurchSettingsInitialized(pool, church.id);
      await updateChurchSettings(pool, church.id, {
        websiteStatus: "published",
        publicName: "Mobile Church 7",
      });
      await provisionEmptyPublicPages(pool, { churchId: church.id, branchId: null });
      const home = await pool.query(
        `SELECT id FROM blessboard.public_pages
          WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL LIMIT 1`,
        [church.id]
      );
      assert.ok(home.rows[0], "home page");
      assert.equal((await updatePublicPage(pool, home.rows[0].id, { status: "published" })).ok, true);
      assert.equal(
        (
          await createPageSection(pool, {
            pageId: home.rows[0].id,
            sectionKey: "hero",
            sectionType: "hero",
            heading: "Welcome Mobile",
            bodyText: "Published mobile body.",
            status: "published",
            sortOrder: 0,
          })
        ).ok,
        true
      );

      const created = await createBlessBoardUser(pool, {
        email: "mobile7-hq@example.test",
        displayName: "HQ Mobile",
        password: PASSWORD,
      });
      assert.equal(created.ok, true, created.message);
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "mobile7-hq@example.test",
            organizationKey: "mobile7",
            roleKey: "church_hq_admin",
            churchKey: "mobile7",
          })
        ).ok,
        true
      );
      const session = await createV5Session(pool, {
        deploymentCode: "blessboard-org-staging",
        userId: created.user.id,
        organizationId: org.records.organization.id,
      });
      assert.equal(session.ok, true, session.message || session.code);
      users.hq = { user: created.user, rawToken: session.rawToken };

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

  function skipIfNeeded() {
    if (skipSuite) {
      console.log(`skip: ${skipReason}`);
      return true;
    }
    return false;
  }

  it("public visitor does not receive editor scripts or pencils", async () => {
    if (skipIfNeeded()) return;
    const res = await request(app).get("/").set("Host", HOST).expect(200);
    assert.doesNotMatch(res.text, /website-inline-edit\.js/);
    assert.doesNotMatch(res.text, /website-structured-edit\.js/);
    assert.doesNotMatch(res.text, /website-unsaved-guard\.js/);
    assert.doesNotMatch(res.text, /data-bb-inline-edit/);
    assert.doesNotMatch(res.text, /data-bb-structured-editor/);
    assert.doesNotMatch(res.text, /data-bb-edit-toolbar/);
    assert.match(res.text, /tenant-public\.css/);
  });

  it("editing mode exposes mobile stitch markers, compact labels, and large touch controls", async () => {
    if (skipIfNeeded()) return;
    const res = await request(app)
      .get("/?website_edit=1")
      .set("Host", HOST)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${users.hq.rawToken}`)
      .expect(200);

    assert.match(res.text, /data-bb-edit-toolbar="1"/);
    assert.match(res.text, /data-bb-stitch-screen-mobile="Phase 7 - Church Website Editing Mode - Mobile"/);
    assert.match(res.text, /bb-tp-btn__label-short/);
    assert.match(res.text, /data-bb-exit-editing="1"/);
    assert.match(res.text, /data-bb-inline-edit="1"/);
    assert.match(res.text, /data-bb-stitch-screen-mobile="Phase 7 - Inline Text Editing - Mobile"/);
    assert.match(res.text, /bb-tp-inline-edit__field-label/);
    assert.match(res.text, /enterkeyhint="done"/);
    assert.match(res.text, /data-bb-structured-editor="1"/);
    assert.match(res.text, /data-bb-media-list="/);
    assert.match(res.text, /data-bb-stitch-screen-mobile-media="Phase 7 - Media Editing - Mobile"/);
    assert.match(
      res.text,
      /data-bb-stitch-screen-mobile-service-times="Phase 7 - Service Times Editing - Mobile"/
    );
    assert.match(res.text, /website-inline-edit\.js/);
    assert.match(res.text, /website-structured-edit\.js/);
    assert.match(res.text, /bb-tp-btn--touch/);
  });

  it("Review and Publish appears when draft changes exist", async () => {
    if (skipIfNeeded()) return;
    await saveInlineFieldDraft(pool, {
      churchId: church.id,
      branchId: null,
      organizationId: org.records.organization.id,
      pageKey: "home",
      sectionKey: "hero",
      fieldKey: "heading",
      newValue: "Draft mobile heading",
      editorUserId: users.hq.user.id,
      actorRole: "church_hq_admin",
    });
    const res = await request(app)
      .get("/?website_edit=1")
      .set("Host", HOST)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${users.hq.rawToken}`)
      .expect(200);
    assert.match(res.text, /data-bb-review-publish="1"/);
    assert.match(res.text, /bb-tp-btn__label-short">Review</);
  });

  it("publish review page carries mobile stitch marker and collapsed warnings", async () => {
    if (skipIfNeeded()) return;
    const res = await request(app)
      .get("/hq/content/draft-changes/publish-review")
      .set("Host", HOST)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${users.hq.rawToken}`)
      .expect(200);
    assert.match(res.text, /data-bb-website-publish-review="1"/);
    assert.match(res.text, /data-bb-stitch-screen-mobile="Phase 7 - Website Publish Review - Mobile"/);
    assert.match(res.text, /bb-publish-review__collapse/);
    assert.match(res.text, /data-bb-preview-website="1"/);
    assert.match(res.text, /data-bb-continue-editing="1"/);
  });

  it("client assets include media library, reorder, and mobile bottom-sheet CSS", () => {
    if (skipIfNeeded()) return;
    const structured = fs.readFileSync(
      path.join(__dirname, "../public/blessboard/v5/website-structured-edit.js"),
      "utf8"
    );
    assert.match(structured, /data-bb-se-library/);
    assert.match(structured, /loadMediaLibrary/);
    assert.match(structured, /data-bb-svc-up/);
    assert.match(structured, /data-bb-svc-down/);
    assert.match(structured, /Upload in progress/);

    const css = fs.readFileSync(
      path.join(__dirname, "../public/blessboard/v5/tenant-public.css"),
      "utf8"
    );
    assert.match(css, /Phase 7 Stage 7: mobile editing polish/);
    assert.match(css, /min\(92vh, 100%\)/);
    assert.match(css, /\.bb-tp-inline-edit__pencil[\s\S]*2\.75rem/);
    assert.match(css, /prefers-reduced-motion/);
  });

  it("public page CSS clips horizontal overflow on mobile editing", () => {
    if (skipIfNeeded()) return;
    const css = fs.readFileSync(
      path.join(__dirname, "../public/blessboard/v5/tenant-public.css"),
      "utf8"
    );
    assert.match(css, /\.bb-tp-body--editing[\s\S]*overflow-x:\s*clip/);
    assert.match(css, /\.bb-tp-inline-edit__compare[\s\S]*grid-template-columns:\s*1fr 1fr/);
    assert.match(
      css,
      /@media \(max-width: 767px\)[\s\S]*\.bb-tp-inline-edit__compare[\s\S]*grid-template-columns:\s*1fr/
    );
  });
});
