"use strict";

/**
 * BB-LEGAL-001 — V5 apex Terms of Service and Privacy Policy.
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
const { buildTermsOfServiceContent } = require("../src/blessboard/content/termsOfServiceContent");
const { buildPrivacyPolicyContent } = require("../src/blessboard/content/privacyPolicyContent");
const { getLegalMetadata, PENDING } = require("../src/blessboard/config/legalMetadata");

const ROOT = path.resolve(__dirname, "..");
const IDENTITY_KEY = "blessboard-platform-v5";

const PLACEHOLDER_RE = /\b(lorem ipsum|TODO|TBD|FIXME|dummy company|ACME Corp|123 Fake Street)\b/i;
const INVENTED_FACTS_RE =
  /\b(Company No\.?\s*\d{5,}|VAT\s*GB\s*\d|SOC\s*2\s*certified|ISO\s*27001\s*certified|GDPR\s*compliant)\b/i;

describe("blessboard apex legal pages (BB-LEGAL-001)", () => {
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
        identityKey: IDENTITY_KEY,
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

  it("ships legal metadata, content modules, and template", () => {
    for (const rel of [
      "src/blessboard/config/legalMetadata.js",
      "src/blessboard/content/termsOfServiceContent.js",
      "src/blessboard/content/privacyPolicyContent.js",
      "src/blessboard/http/renderApexLegal.js",
      "views/blessboard/v5/apex/legal-page.ejs",
      "docs/blessboard-legal-review-gaps.md",
    ]) {
      assert.equal(fs.existsSync(path.join(ROOT, rel)), true, rel);
    }
  });

  it("central metadata keeps unresolved legal details null (not invented)", () => {
    const meta = getLegalMetadata();
    assert.equal(meta.pending.supportEmail, null);
    assert.equal(meta.pending.privacyEmail, null);
    assert.equal(meta.pending.legalAddress, null);
    assert.equal(meta.pending.governingLawJurisdiction, null);
    assert.equal(PENDING.companyRegistrationNumber, null);
    assert.match(meta.effectiveDateIso, /^\d{4}-\d{2}-\d{2}$/);
  });

  it("GET /terms and /privacy return 200 for anonymous apex visitors", async () => {
    requireDb();
    const app = makeApp();
    for (const routePath of ["/terms", "/privacy"]) {
      const res = await request(app).get(routePath).set("Host", "blessboard.org");
      assert.equal(res.status, 200, routePath);
      assert.match(res.text, /data-bb-shell="apex"/);
      assert.doesNotMatch(res.text, /V5 foundation mode: this surface is not available/i);
      assert.doesNotMatch(res.text, PLACEHOLDER_RE);
      assert.doesNotMatch(res.text, INVENTED_FACTS_RE);
      assert.doesNotMatch(res.text, /support@|privacy@|legal@blessboard/i);
    }
  });

  it("Terms page includes required structure and sections", async () => {
    requireDb();
    const app = makeApp();
    const res = await request(app).get("/terms").set("Host", "blessboard.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /Terms of Service/);
    assert.match(res.text, /Effective date/i);
    assert.match(res.text, /id="acceptable-use"/);
    assert.match(res.text, /Acceptable Use/);
    assert.match(res.text, /id="church-accounts"/);
    assert.match(res.text, /Church and Organization Accounts/);
    assert.match(res.text, /href="\/privacy"/);
    assert.match(res.text, /id="contact"/);
    assert.match(res.text, /Register Your Church/);
    assert.match(res.text, /operational draft pending professional legal review/i);
  });

  it("Privacy page includes required structure and sections", async () => {
    requireDb();
    const app = makeApp();
    const res = await request(app).get("/privacy").set("Host", "blessboard.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /Privacy Policy/);
    assert.match(res.text, /Effective date/i);
    assert.match(res.text, /id="information-collected"/);
    assert.match(res.text, /id="how-used"/);
    assert.match(res.text, /id="sharing"/);
    assert.match(res.text, /id="security"/);
    assert.match(res.text, /id="user-rights"/);
    assert.match(res.text, /id="contact"/);
    assert.match(res.text, /blessboard_org_v5_sid|blessboard_org_v5_csrf/);
    assert.doesNotMatch(res.text, /targeted advertising tracker|Google Analytics|Meta Pixel/i);
  });

  it("TOC anchors match section ids in content modules", () => {
    for (const doc of [buildTermsOfServiceContent(), buildPrivacyPolicyContent()]) {
      const ids = new Set(doc.sections.map((s) => s.id));
      assert.ok(ids.size === doc.sections.length);
      for (const section of doc.sections) {
        assert.match(section.id, /^[a-z0-9-]+$/);
        assert.ok(section.html && section.html.length > 20);
      }
    }
  });

  it("footer and registration consent link to /terms and /privacy", async () => {
    requireDb();
    const app = makeApp();
    const home = await request(app).get("/").set("Host", "blessboard.org");
    assert.equal(home.status, 200);
    assert.match(home.text, /href="\/terms"/);
    assert.match(home.text, /href="\/privacy"/);

    const pricing = await request(app).get("/pricing").set("Host", "blessboard.org");
    assert.match(pricing.text, /href="\/terms"/);
    assert.match(pricing.text, /href="\/privacy"/);

    const register = await request(app).get("/register-church").set("Host", "blessboard.org");
    assert.match(register.text, /href="\/terms"/);
    assert.match(register.text, /href="\/privacy"/);
  });

  it("legal routes are apex-only", async () => {
    requireDb();
    const app = makeApp();
    const res = await request(app).get("/terms").set("Host", "other.example");
    assert.equal(res.status, 404);
  });

  it("legal CSS uses readable content width classes", () => {
    const css = fs.readFileSync(path.join(ROOT, "public/blessboard/v5/apex.css"), "utf8");
    assert.match(css, /\.bb-apex-legal__/);
    assert.match(css, /max-width:\s*46rem/);
  });
});
