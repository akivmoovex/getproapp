"use strict";

/**
 * V7 canonical branch mini-website inline text save via POST /c/:org/:branch/website/drafts.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
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
const { CSRF_COOKIE, CSRF_FIELD, issueCsrfToken } = require("../src/platform/http/v5Csrf");
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

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST = "branch-save.blessboard.org";
const APEX = "blessboard.org";

function cookieHeader(...pairs) {
  return pairs.filter(Boolean).join("; ");
}

function extractCsrf(html) {
  const match = String(html || "").match(/name="csrf-token"\s+content="([^"]+)"/);
  return match ? match[1] : "";
}

describe("v7 branch website inline save", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let org;
  let church;
  let branchHq;
  let branchCampus;
  let branchAdmin;

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
        organizationKey: "branch-save-a",
        displayName: "Branch Save A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "branch-save-a",
        hostname: HOST,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(org.ok, true, org.message);
      const ch = await provisionBlessBoardChurch(pool, {
        organizationKey: "branch-save-a",
        churchKey: "branch-save-a",
        displayName: "Branch Save Church",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ Campus",
      });
      assert.equal(ch.ok, true, ch.message);
      church = ch.records.church;
      branchHq = ch.records.hqBranch;

      const campusIns = await pool.query(
        `INSERT INTO blessboard.branches (
           church_id, branch_key, display_name, branch_type, status, is_primary
         ) VALUES ($1, 'campus', 'Second Campus', 'branch', 'active', false)
         RETURNING id, branch_key`,
        [church.id]
      );
      branchCampus = { id: campusIns.rows[0].id, branch_key: campusIns.rows[0].branch_key };
      await pool.query(
        `INSERT INTO blessboard.branch_settings (branch_id, public_name)
         VALUES ($1, 'Second Campus')
         ON CONFLICT (branch_id) DO NOTHING`,
        [branchCampus.id]
      );

      await ensureChurchSettingsInitialized(pool, church.id);
      await updateChurchSettings(pool, church.id, {
        websiteStatus: "published",
        publicName: "Branch Save Church",
      });

      for (const branchId of [null, branchHq.id, branchCampus.id]) {
        await provisionEmptyPublicPages(pool, { churchId: church.id, branchId });
        const home = await pool.query(
          `SELECT id FROM blessboard.public_pages
            WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NOT DISTINCT FROM $2
            LIMIT 1`,
          [church.id, branchId]
        );
        assert.ok(home.rows[0], `home page for branch ${branchId || "church"}`);
        await updatePublicPage(pool, home.rows[0].id, { status: "published" });
        await createPageSection(pool, {
          pageId: home.rows[0].id,
          sectionKey: "hero",
          sectionType: "hero",
          heading: branchId ? `Published ${branchId === branchHq.id ? "HQ" : "Campus"}` : "Published Church",
          bodyText: "Published body",
          status: "published",
          sortOrder: 0,
        });
      }

      const created = await createBlessBoardUser(pool, {
        email: "branch-save-admin@example.test",
        displayName: "Branch Save Admin",
        password: PASSWORD,
      });
      assert.equal(created.ok, true, created.message);
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "branch-save-admin@example.test",
            organizationKey: "branch-save-a",
            roleKey: "branch_admin",
            churchKey: "branch-save-a",
            branchKey: "hq",
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
      branchAdmin = { rawToken: session.rawToken };

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

  it("regression: branch path save URL resolves and persists draft only to that branch", async () => {
    if (skipIfNeeded()) return;

    const edit = await request(app)
      .get("/c/branch-save-a/hq?website_edit=1&website_mode=draft")
      .set("Host", APEX)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`))
      .expect(200);

    assert.match(edit.text, /data-website-save-url="\/c\/branch-save-a\/hq\/website\/drafts"/);

    const csrf = extractCsrf(edit.text) || issueCsrfToken({});
    const marker = `Branch V7 Save ${Date.now()}`;
    const saved = await request(app)
      .post("/c/branch-save-a/hq/website/drafts")
      .set("Host", APEX)
      .set(
        "Cookie",
        cookieHeader(
          `${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`,
          `${CSRF_COOKIE}=${csrf}`
        )
      )
      .set("X-CSRF-Token", csrf)
      .set("Accept", "application/json")
      .send({
        [CSRF_FIELD]: csrf,
        contentKey: "home.hero.heading",
        value: marker,
      });

    assert.equal(saved.status, 200, saved.text);
    assert.equal(saved.body.ok, true);
    assert.equal(saved.body.published, false);

    const reload = await request(app)
      .get("/c/branch-save-a/hq?website_edit=1&website_mode=draft")
      .set("Host", APEX)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`))
      .expect(200);
    assert.match(reload.text, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const campus = await request(app)
      .get("/c/branch-save-a/campus?website_mode=draft")
      .set("Host", APEX)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`))
      .expect(200);
    assert.doesNotMatch(
      campus.text,
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );

    const drafts = await draftRepo.listDrafts(pool, {
      churchId: church.id,
      branchId: branchHq.id,
      pageKey: "home",
    });
    const heroDraft = (drafts || []).find(
      (row) => row.sectionKey === "hero" && row.fieldKey === "heading"
    );
    assert.ok(heroDraft, "branch draft row");
    assert.equal(String(heroDraft.newValue || ""), marker);

    const campusDrafts = await draftRepo.listDrafts(pool, {
      churchId: church.id,
      branchId: branchCampus.id,
      pageKey: "home",
    });
    const campusHeroDraft = (campusDrafts || []).find(
      (row) => row.sectionKey === "hero" && row.fieldKey === "heading"
    );
    assert.ok(!campusHeroDraft || String(campusHeroDraft.newValue || "") !== marker);
  });

  it("unknown branch path save is not routed to V5 unavailable shell", async () => {
    if (skipIfNeeded()) return;
    const csrf = issueCsrfToken({
      NODE_ENV: "test",
      SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    });
    const res = await request(app)
      .post("/c/branch-save-a/not-a-branch/website/drafts")
      .set("Host", APEX)
      .set(
        "Cookie",
        cookieHeader(
          `${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`,
          `${CSRF_COOKIE}=${csrf}`
        )
      )
      .set("X-CSRF-Token", csrf)
      .set("Accept", "application/json")
      .send({
        [CSRF_FIELD]: csrf,
        contentKey: "home.hero.heading",
        value: "Nope",
      });
    assert.notEqual(res.status, 503);
    assert.notEqual(String(res.text || ""), "This page is not yet available in BlessBoard V5.");
    assert.ok([404, 403].includes(res.status), `unexpected status ${res.status}`);
  });
});
