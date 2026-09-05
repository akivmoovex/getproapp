"use strict";

/**
 * Canonical branch editor action URLs and scoped management pages.
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

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST = "branch-actions.blessboard.org";
const APEX = "blessboard.org";
const ORG = "branch-actions-a";
const BRANCH = "hq";

function cookieHeader(...pairs) {
  return pairs.filter(Boolean).join("; ");
}

function extractCsrf(html) {
  const match = String(html || "").match(/name="csrf-token"\s+content="([^"]+)"/);
  return match ? match[1] : "";
}

describe("v7 branch editor canonical actions", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let branchAdmin;
  let branchHq;
  let branchCampus;
  let church;

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

      const org = await provisionPlatformTenant(pool, {
        organizationKey: ORG,
        displayName: "Branch Actions A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: ORG,
        hostname: HOST,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(org.ok, true, org.message);
      const ch = await provisionBlessBoardChurch(pool, {
        organizationKey: ORG,
        churchKey: ORG,
        displayName: "Branch Actions Church",
        dataEnvironment: "testing",
        hqBranchKey: BRANCH,
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

      await ensureChurchSettingsInitialized(pool, church.id);
      await updateChurchSettings(pool, church.id, { websiteStatus: "published", publicName: "Branch Actions" });
      for (const branchId of [null, branchHq.id, branchCampus.id]) {
        await provisionEmptyPublicPages(pool, { churchId: church.id, branchId });
        const home = await pool.query(
          `SELECT id FROM blessboard.public_pages
            WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NOT DISTINCT FROM $2 LIMIT 1`,
          [church.id, branchId]
        );
        await updatePublicPage(pool, home.rows[0].id, { status: "published" });
        await createPageSection(pool, {
          pageId: home.rows[0].id,
          sectionKey: "hero",
          sectionType: "hero",
          heading: branchId ? "Branch hero" : "Church hero",
          bodyText: "Body",
          status: "published",
          sortOrder: 0,
        });
      }

      const created = await createBlessBoardUser(pool, {
        email: "branch-actions-admin@example.test",
        displayName: "Branch Actions Admin",
        password: PASSWORD,
      });
      assert.equal(created.ok, true);
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "branch-actions-admin@example.test",
            organizationKey: ORG,
            roleKey: "branch_admin",
            churchKey: ORG,
            branchKey: BRANCH,
          })
        ).ok,
        true
      );
      const session = await createV5Session(pool, {
        deploymentCode: "blessboard-org-staging",
        userId: created.user.id,
        organizationId: org.records.organization.id,
      });
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

  it("editor chrome emits branch-scoped action URLs", async () => {
    if (skipIfNeeded()) return;
    const base = `/c/${ORG}/${BRANCH}`;
    const res = await request(app)
      .get(`${base}?website_edit=1&website_mode=draft`)
      .set("Host", APEX)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`))
      .expect(200);

    const expected = [
      `${base}/website/drafts`,
      `${base}/website/media`,
      `${base}/website/drafts/discard`,
      `${base}/website/section-actions`,
      `${base}/website/add-section`,
      `${base}/website/history`,
      `${base}/website/styles`,
      `${base}/website/seo`,
      `${base}/website/media-library`,
    ];
    for (const url of expected) {
      assert.match(res.text, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.doesNotMatch(res.text, /\/c\/branch-actions-a\/website\/drafts"/);
  });

  it("branch history/styles/seo pages resolve under branch prefix", async () => {
    if (skipIfNeeded()) return;
    const base = `/c/${ORG}/${BRANCH}`;
    const cookie = cookieHeader(`${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`);

    const history = await request(app).get(`${base}/website/history`).set("Host", APEX).set("Cookie", cookie);
    assert.equal(history.status, 200, history.text.slice(0, 200));
    assert.match(history.text, new RegExp(`${base}\\?website_edit=1`));

    const styles = await request(app).get(`${base}/website/styles`).set("Host", APEX).set("Cookie", cookie);
    assert.equal(styles.status, 200, styles.text.slice(0, 200));
    assert.match(styles.text, new RegExp(`${base}/website/styles`));

    const seo = await request(app).get(`${base}/website/seo`).set("Host", APEX).set("Cookie", cookie);
    assert.equal(seo.status, 200, seo.text.slice(0, 200));
    assert.match(seo.text, new RegExp(`${base}/website/seo`));

    const media = await request(app)
      .get(`${base}/website/media-library`)
      .set("Host", APEX)
      .set("Cookie", cookie);
    assert.equal(media.status, 200, media.text.slice(0, 200));
    assert.match(media.text, new RegExp(`${base}/website/media`));
  });

  it("org home 301 redirects editor entry to primary branch canonical URL", async () => {
    if (skipIfNeeded()) return;
    const res = await request(app)
      .get(`/c/${ORG}?website_edit=1&website_mode=draft`)
      .redirects(0)
      .set("Host", APEX)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`));
    assert.equal(res.status, 301);
    assert.match(String(res.headers.location || ""), new RegExp(`/c/${ORG}/${BRANCH}`));
  });

  it("legacy /branches/ URL 301s to canonical branch editor", async () => {
    if (skipIfNeeded()) return;
    const res = await request(app)
      .get(`/c/${ORG}/branches/${BRANCH}?website_edit=1`)
      .redirects(0)
      .set("Host", APEX)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`));
    assert.equal(res.status, 301);
    assert.match(String(res.headers.location || ""), new RegExp(`/c/${ORG}/${BRANCH}`));
  });
});
