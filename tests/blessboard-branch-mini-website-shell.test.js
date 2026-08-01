"use strict";

/**
 * Stage 4 — branch mini-site shared shell and navigation.
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
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  provisionEmptyPublicPages,
  updatePublicPage,
} = require("../src/blessboard/services/publicContentAdminService");
const {
  publicChurchHomePath,
  publicBranchHomePath,
  publicBranchPagePath,
} = require("../src/blessboard/urls/churchUrlHelper");

const IDENTITY_KEY = "blessboard-platform-v5";
const HOST_A = "shell-a.blessboard.org";
const APEX = "blessboard.org";
const LONG_CHURCH =
  "Northern Valley Community Fellowship International Ministries of Central Africa";
const LONG_BRANCH =
  "Lusaka East Campus and Regional Outreach Centre for Families";

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

function hrefsFor(html, attrName, attrValue) {
  const re = new RegExp(
    `<a[^>]*${attrName}="${attrValue}"[^>]*href="([^"]+)"|<a[^>]*href="([^"]+)"[^>]*${attrName}="${attrValue}"`,
    "gi"
  );
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    out.push(m[1] || m[2]);
  }
  return out;
}

describe("blessboard branch mini website shell (stage 4)", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let churchA;
  let campusEast;
  let campusWest;
  let inactiveBranch;

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

      const provA = await provisionPlatformTenant(pool, {
        organizationKey: "shell-a",
        displayName: "Shell Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "shell-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(provA.ok, true, provA.message);

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "shell-a",
        churchKey: "shell-a",
        displayName: LONG_CHURCH,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ Campus",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;

      const east = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-east', $2, 'branch', 'active', false, 'UTC', 'ZM')
         RETURNING id, branch_key, display_name`,
        [churchA.id, LONG_BRANCH]
      );
      campusEast = east.rows[0];

      const west = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-west', 'Campus West', 'branch', 'active', false, 'UTC', 'ZM')
         RETURNING id, branch_key, display_name`,
        [churchA.id]
      );
      campusWest = west.rows[0];

      const inactive = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-inactive', 'Hidden Inactive Campus', 'branch', 'inactive', false, 'UTC', 'ZM')
         RETURNING id, branch_key, display_name`,
        [churchA.id]
      );
      inactiveBranch = inactive.rows[0];

      await ensureChurchSettingsInitialized(pool, churchA.id);
      await updateChurchSettings(pool, churchA.id, {
        publicName: LONG_CHURCH,
        websiteStatus: "published",
      });

      const pages = await provisionEmptyPublicPages(pool, { churchId: churchA.id });
      for (const page of pages.pages) {
        await updatePublicPage(pool, page.id, { status: "published" });
      }

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
        apexHosts: new Set([APEX, "www.blessboard.org"]),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("1. Branch name is visible", async () => {
    requireDb();
    const res = await request(app)
      .get("/c/shell-a/branches/campus-east")
      .set("Host", APEX);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-branch-name="1"/);
    assert.match(res.text, new RegExp(LONG_BRANCH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(res.text, /data-bb-website-scope="branch"/);
    assert.match(res.text, /bb-tp-body--branch/);
  });

  it("2. Church name is visible", async () => {
    requireDb();
    const res = await request(app)
      .get("/c/shell-a/branches/campus-east/about")
      .set("Host", APEX);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-church-name="1"/);
    assert.match(res.text, new RegExp(LONG_CHURCH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("3. All navigation links preserve branchKey", async () => {
    requireDb();
    const res = await request(app)
      .get("/c/shell-a/branches/campus-east/leadership")
      .set("Host", APEX);
    assert.equal(res.status, 200);
    const keys = [
      "home",
      "about",
      "leadership",
      "ministries",
      "events",
      "sermons",
      "giving",
      "contact",
    ];
    for (const key of keys) {
      const hrefs = hrefsFor(res.text, "data-bb-nav-link", key);
      assert.ok(hrefs.length >= 2, `expected desktop+mobile nav for ${key}`);
      for (const href of hrefs) {
        if (key === "home") {
          assert.equal(href, publicBranchHomePath("shell-a", "campus-east"));
        } else {
          assert.equal(href, publicBranchPagePath("shell-a", "campus-east", key));
        }
        assert.match(href, /\/branches\/campus-east/);
        assert.doesNotMatch(href, /^\/c\/shell-a\/(about|leadership|contact)$/);
      }
    }
  });

  it("4. Branch switcher links are correct", async () => {
    requireDb();
    const res = await request(app)
      .get("/c/shell-a/branches/campus-east")
      .set("Host", APEX);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-branch-switcher="1"/);
    const east = hrefsFor(res.text, "data-bb-branch-switcher-item", "campus-east");
    const west = hrefsFor(res.text, "data-bb-branch-switcher-item", "campus-west");
    assert.ok(east.length >= 1);
    assert.ok(west.length >= 1);
    assert.ok(east.every((h) => h === publicBranchHomePath("shell-a", "campus-east")));
    assert.ok(west.every((h) => h === publicBranchHomePath("shell-a", "campus-west")));
  });

  it("5. Main church link is correct", async () => {
    requireDb();
    const res = await request(app)
      .get("/c/shell-a/branches/campus-west")
      .set("Host", APEX);
    assert.equal(res.status, 200);
    const churchLinks = hrefsFor(res.text, "data-bb-branch-switcher-church", "1");
    assert.ok(churchLinks.length >= 1);
    assert.ok(churchLinks.every((h) => h === publicChurchHomePath("shell-a")));
    const allLinks = hrefsFor(res.text, "data-bb-branch-switcher-all", "1");
    assert.ok(allLinks.length >= 1);
    assert.ok(allLinks.every((h) => h === publicChurchHomePath("shell-a")));
  });

  it("6. Mobile navigation works", async () => {
    requireDb();
    const res = await request(app)
      .get("/c/shell-a/branches/campus-east/contact")
      .set("Host", APEX);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-nav="mobile-drawer"/);
    assert.match(res.text, /id="bb-tp-menu-btn"/);
    assert.match(res.text, /id="bb-tp-drawer"/);
    assert.match(res.text, /data-bb-nav="mobile"/);
    assert.match(res.text, /tenant-public\.js\?v=10/);
    assert.match(res.text, /aria-controls="bb-tp-drawer"/);
    const contactMobile = hrefsFor(res.text, "data-bb-nav-link", "contact");
    assert.ok(
      contactMobile.some((h) => h === publicBranchPagePath("shell-a", "campus-east", "contact"))
    );
  });

  it("7. Long names do not break markup", async () => {
    requireDb();
    const res = await request(app)
      .get("/c/shell-a/branches/campus-east")
      .set("Host", APEX);
    assert.equal(res.status, 200);
    assert.match(res.text, /bb-tp-brand--branch/);
    assert.match(res.text, /data-bb-shell-brand="1"/);
    assert.doesNotMatch(res.text, /<script[^>]*>\s*<\/script>\s*<%= /);
    assert.equal((res.text.match(/<!DOCTYPE html>/gi) || []).length, 1);
    const css = fs.readFileSync(
      path.join(__dirname, "../public/blessboard/v5/tenant-public.css"),
      "utf8"
    );
    assert.match(css, /\.bb-tp-brand__name[\s\S]*-webkit-line-clamp:\s*2/);
    assert.match(css, /\.bb-tp-brand__branch[\s\S]*text-overflow:\s*ellipsis/);
    assert.match(css, /@media \(max-width: 390px\)/);
    assert.match(css, /@media \(min-width: 1440px\)/);
    assert.match(css, /@media \(min-width: 768px\)/);
  });

  it("8. Inactive branches are excluded", async () => {
    requireDb();
    const res = await request(app)
      .get("/c/shell-a/branches/campus-east")
      .set("Host", APEX);
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /data-bb-branch-switcher-item="campus-inactive"/);
    assert.doesNotMatch(res.text, /Hidden Inactive Campus/);
    assert.doesNotMatch(
      res.text,
      new RegExp(`/branches/${inactiveBranch.branch_key}`)
    );
    assert.match(res.text, /data-bb-branch-switcher-item="campus-east"/);
    assert.match(res.text, /data-bb-branch-switcher-item="campus-west"/);
    assert.ok(campusWest.branch_key);
  });

  it("shell partials and shared components exist", () => {
    const root = path.join(__dirname, "../views/blessboard/v5/public/partials");
    for (const file of [
      "shell-brand.ejs",
      "shell-nav.ejs",
      "branch-switcher.ejs",
      "contact-summary.ejs",
      "empty-state.ejs",
      "page-hero.ejs",
      "service-times-block.ejs",
    ]) {
      assert.ok(fs.existsSync(path.join(root, file)), file);
    }
  });
});
