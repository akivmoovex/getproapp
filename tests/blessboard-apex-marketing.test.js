"use strict";

/**
 * Batch 2b — apex marketing routes (features, for-churches, pricing, directory, register-church).
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");
const request = require("supertest");
const fs = require("node:fs");
const path = require("node:path");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  buildApexPricingPlans,
  buildApexPartnerPlan,
  mapDirectoryVisitUrl,
} = require("../src/blessboard/http/apexMarketingContent");

const ROOT = path.resolve(__dirname, "..");

describe("blessboard apex marketing batch 2b", () => {
  let pool;
  let databaseUrl;
  let skipSuite = false;
  let skipReason = "";

  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: "blessboard-platform-v5",
        environmentCode: "testing",
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  function makeApp() {
    return createV5FoundationApp({
      env: {
        NODE_ENV: "test",
        BLESSBOARD_TENANT_ROUTING_MODE: "off",
        PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
        SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
        SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
      },
      getPool: () => pool,
    });
  }

  it("ships marketing templates and assets", () => {
    for (const rel of [
      "views/blessboard/v5/apex/features.ejs",
      "views/blessboard/v5/apex/for-churches.ejs",
      "views/blessboard/v5/apex/pricing.ejs",
      "views/blessboard/v5/apex/directory.ejs",
      "views/blessboard/v5/apex/register-church.ejs",
      "src/blessboard/http/apexMarketingRoutes.js",
      "src/blessboard/http/renderApexMarketing.js",
      "src/blessboard/http/apexMarketingContent.js",
      "docs/gui/BATCH_02B_APEX_MARKETING.md",
    ]) {
      assert.equal(fs.existsSync(path.join(ROOT, rel)), true, rel);
    }
  });

  it("pricing helpers force register-church CTAs and known plan codes", () => {
    const plans = buildApexPricingPlans();
    assert.ok(plans.length >= 3);
    for (const plan of plans) {
      assert.equal(plan.ctaHref, "/register-church");
      assert.match(plan.ctaLabel, /Register Your Church/);
    }
    assert.equal(buildApexPartnerPlan(), null);
    assert.equal(mapDirectoryVisitUrl({ is_single_branch: false, branch_slug: "x" }), null);
  });

  it("GET marketing pages render on apex with nav + no dead checkout", async () => {
    requireDb();
    const app = makeApp();
    const paths = [
      ["/features", /Built for the/, /data-bb-apex-page="features"/, /data-bb-batch="fg-01"/],
      ["/for-churches", /Sacred Clarity/, /data-bb-apex-page="for-churches"/, null],
      ["/pricing", /Transparent Pricing/, /data-bb-plan="growth"/, null],
      ["/directory", /Find a church/, /data-bb-apex-page="directory"/, null],
      ["/register-church", /Register Your Church/, /data-bb-register-mode="enquiry"/, null],
    ];

    for (const [pathName, bodyRe, markerRe, batchRe] of paths) {
      const res = await request(app).get(pathName).set("Host", "blessboard.org");
      assert.equal(res.status, 200, pathName);
      assert.match(res.text, /data-bb-shell="apex"/);
      assert.match(res.text, bodyRe);
      assert.match(res.text, markerRe);
      if (batchRe) assert.match(res.text, batchRe);
      assert.match(res.text, /href="\/features"/);
      assert.match(res.text, /href="\/for-churches"/);
      assert.match(res.text, /href="\/pricing"/);
      assert.match(res.text, /href="\/directory"/);
      assert.match(res.text, /href="\/register-church"/);
      assert.match(res.text, /href="\/login"/);
      assert.doesNotMatch(res.text, /href="\/contact"|Start Free Trial|Watch Product Tour|Schedule a Demo/i);
      assert.doesNotMatch(res.text, /Join over \d+|hundreds of (forward-thinking )?congregation/i);
      assert.doesNotMatch(res.text, /Request Sent!|confirmation email has been sent/i);
      assert.doesNotMatch(res.text, /method="post"[^>]*action="\/register-church"/i);
    }

    const features = await request(app).get("/features").set("Host", "blessboard.org");
    assert.match(features.text, /Website &amp; Public Presence|Website & Public Presence/);
    assert.match(features.text, /Member Engagement/);
    assert.match(features.text, /Operational Excellence/);
    assert.match(features.text, /Enterprise Scaling/);
    assert.match(features.text, /no payment gateway in V5/i);
    assert.match(features.text, /apex\.css\?v=7/);
    assert.doesNotMatch(features.text, /\$42,?850|\+12%\s*vs/i);
  });

  it("directory empty state and search form are present without fake listings", async () => {
    requireDb();
    const app = makeApp();
    const res = await request(app).get("/directory").set("Host", "blessboard.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /method="get" action="\/directory"/);
    assert.match(res.text, /name="q"/);
    assert.match(
      res.text,
      /data-bb-directory-state="(?:empty|unavailable)"|data-bb-directory-count=/
    );
    assert.doesNotMatch(res.text, /Grace Community|St\. Jude|Covenant Life/);
  });

  it("register-church is enquiry-only (no provisioning form POST)", async () => {
    requireDb();
    const app = makeApp();
    const res = await request(app).get("/register-church").set("Host", "blessboard.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /does not create accounts|does not submit or confirm/i);
    assert.doesNotMatch(res.text, /<form[^>]*method="post"/i);
    assert.doesNotMatch(res.text, /name="password"|Create church|Submit Registration Request/i);
  });

  it("pricing page uses approved catalogue amounts and FAQ anchor", async () => {
    requireDb();
    const app = makeApp();
    const res = await request(app).get("/pricing").set("Host", "blessboard.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /Foundation/);
    assert.match(res.text, /Growth/);
    assert.match(res.text, /Network/);
    assert.match(res.text, /USD 0/);
    assert.match(res.text, /USD 14\.99/);
    assert.match(res.text, /USD 29\.99/);
    assert.match(res.text, /active branch/i);
    assert.match(res.text, /id="faq"/);
    assert.match(res.text, /Church members are not billed individually/);
    assert.match(res.text, /href="\/register-church"/);
    assert.doesNotMatch(res.text, /href="\/contact"/);
    assert.doesNotMatch(res.text, /USD 4\.90|USD 8\.90|USD 14\.90/);
    assert.doesNotMatch(res.text, /\bProfessional\b|\bPartner\b/);
    assert.doesNotMatch(res.text, /\bFree\b/);
  });

  it("marketing routes are apex-only (404 on non-apex host text)", async () => {
    requireDb();
    const app = makeApp();
    const res = await request(app).get("/features").set("Host", "other.example");
    assert.equal(res.status, 404);
  });
});
