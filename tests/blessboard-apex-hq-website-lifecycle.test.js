"use strict";

/**
 * Prompt 54 — apex session-scoped HQ website lifecycle + /c/:organizationKey public path.
 * Tenant routing may be off; wildcard hosts are not required.
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
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const { createV5Session } = require("../src/platform/session/createV5Session");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const {
  repairWebsiteFoundation,
  inspectWebsiteFoundationGaps,
} = require("../src/blessboard/services/websiteFoundationRepairService");
const {
  publicChurchHomePath,
  hqContentPagePath,
  hqPreviewPagePath,
} = require("../src/blessboard/urls/churchUrlHelper");
const publicContentRepo = require("../src/blessboard/repositories/publicContentRepository");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const APEX = "blessboard.org";

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
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

function extractCsrfToken(html) {
  const m = String(html || "").match(
    new RegExp(
      `name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`
    )
  );
  return (m && (m[1] || m[2])) || null;
}

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "off",
    ...overrides,
  };
}

describe("blessboard apex HQ website lifecycle (Prompt 54)", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let rec;
  let otherRec;

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

      async function provisionPlan(selectedPlan) {
        const key = uniq(selectedPlan === "growth" ? "grw" : "fnd");
        const row = await appRepo.createApplication(pool, {
          church_name: `Apex Lifecycle ${key}`,
          country: "Zambia",
          city: "Lusaka",
          contact_name: "Site Admin",
          contact_email: `${key}@example.org`,
          contact_phone: `+26097${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
          selected_plan: selectedPlan,
          consent_terms: true,
          branch_name: "Main Campus",
        });
        const result = await provisionRegisteredBlessBoardChurch(pool, {
          applicationId: row.id,
          administratorPassword: PASSWORD,
          requestId: `req-${key}`,
          actorContext: { type: "test", source: "unit", dataEnvironment: "testing" },
        });
        assert.equal(result.ok, true, result.message || result.status);
        return result.records;
      }

      rec = await provisionPlan("foundation");
      otherRec = await provisionPlan("foundation");

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
        apexHosts: new Set([APEX, `www.${APEX}`]),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipSuite) {
      assert.fail(`suite skipped: ${skipReason}`);
    }
  }

  async function sessionCookie(userId, organizationId, churchId) {
    const created = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId,
      organizationId: organizationId || null,
      churchId: churchId || null,
      userAgent: "apex-hq-lifecycle-test",
      ipAddress: "127.0.0.1",
    });
    assert.equal(created.ok, true, created.message || created.code);
    return `${DEFAULT_V5_COOKIE}=${created.rawToken}`;
  }

  async function authedGet(path, cookie) {
    const res = await request(app)
      .get(path)
      .set("Host", APEX)
      .set("Cookie", cookie)
      .set("Accept", "text/html");
    const csrf = extractCsrfToken(res.text);
    const csrfCookie = extractCookie(res, CSRF_COOKIE);
    return { res, csrf, cookie: csrfCookie ? `${cookie}; ${CSRF_COOKIE}=${csrfCookie}` : cookie };
  }

  it("URL helper builds path public and HQ paths", () => {
    assert.equal(publicChurchHomePath("demo-church"), "/c/demo-church");
    assert.equal(hqContentPagePath("home"), "/hq/content/pages/home");
    assert.equal(hqPreviewPagePath("home"), "/hq/content/preview/home");
  });

  it("unauthenticated /hq redirects to login on apex", async () => {
    requireDb();
    const res = await request(app)
      .get("/hq")
      .set("Host", APEX)
      .set("Accept", "text/html");
    assert.equal(res.status, 303);
    assert.match(String(res.headers.location || ""), /\/login/);
  });

  it("unmigrated /hq-admin still hits safe unavailable fallback", async () => {
    requireDb();
    const res = await request(app)
      .get("/hq-admin")
      .set("Host", APEX)
      .set("Accept", "text/plain");
    assert.equal(res.status, 503);
    assert.match(res.text, /not yet available in BlessBoard V5/i);
    assert.doesNotMatch(res.text, /Tenant portals and legacy routes have not been migrated/i);
  });

  it("HQ dashboard and home editor open on apex with session-scoped tenant", async () => {
    requireDb();
    const sid = await sessionCookie(rec.administratorUserId, rec.organizationId, rec.churchId);
    const dash = await request(app).get("/hq").set("Host", APEX).set("Cookie", sid);
    assert.equal(dash.status, 200, dash.text.slice(0, 300));
    assert.doesNotMatch(dash.text, /not yet available in BlessBoard V5/i);

    const home = await request(app)
      .get("/hq/content/pages/home")
      .set("Host", APEX)
      .set("Cookie", sid);
    assert.equal(home.status, 200, home.text.slice(0, 300));
    assert.doesNotMatch(home.text, /not yet available in BlessBoard V5/i);
  });

  it("cross-organization HQ uses own session org only", async () => {
    requireDb();
    const sid = await sessionCookie(
      otherRec.administratorUserId,
      otherRec.organizationId,
      otherRec.churchId
    );
    const home = await request(app)
      .get("/hq/content/pages/home")
      .set("Host", APEX)
      .set("Cookie", sid);
    assert.equal(home.status, 200);
    assert.doesNotMatch(home.text, new RegExp(rec.organizationKey, "i"));
  });

  it("preview route reaches V5 preview (not foundation fallback)", async () => {
    requireDb();
    const sid = await sessionCookie(rec.administratorUserId, rec.organizationId, rec.churchId);
    const preview = await request(app)
      .get("/hq/content/preview/home")
      .set("Host", APEX)
      .set("Cookie", sid);
    assert.equal(preview.status, 200, preview.text.slice(0, 300));
    assert.doesNotMatch(preview.text, /not yet available in BlessBoard V5/i);
  });

  it("anonymous cannot access HQ preview", async () => {
    requireDb();
    const res = await request(app)
      .get("/hq/content/preview/home")
      .set("Host", APEX)
      .set("Accept", "text/html");
    assert.equal(res.status, 303);
    assert.match(String(res.headers.location || ""), /\/login/);
  });

  it("publish POST on apex does not return host 404; redirects to /c/:key when ready", async () => {
    requireDb();
    const sid = await sessionCookie(rec.administratorUserId, rec.organizationId, rec.churchId);
    const boot = await authedGet("/hq/website", sid);
    assert.equal(boot.res.status, 200, boot.res.text.slice(0, 300));
    assert.doesNotMatch(boot.res.text, /Not found on this host/i);

    if (boot.csrf) {
      await request(app)
        .post("/hq/website/preview-ack")
        .set("Host", APEX)
        .set("Cookie", boot.cookie)
        .type("form")
        .send({ [CSRF_FIELD]: boot.csrf });
    }
    const afterAck = await authedGet("/hq/website", sid);
    const publish = await request(app)
      .post("/hq/website/publish")
      .set("Host", APEX)
      .set("Cookie", afterAck.cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: afterAck.csrf,
        confirm_publish: "1",
        defer_service_times: "1",
      });
    assert.notEqual(publish.status, 404);
    assert.doesNotMatch(publish.text || "", /Not found on this host/i);
    if (publish.status === 303) {
      const loc = String(publish.headers.location || "");
      // Phase 3+ redirects to publication result when a version id exists; otherwise public path.
      assert.ok(
        loc.includes("/hq/website/publish/success") ||
          loc.includes("/hq/website/publish/result") ||
          loc.includes(`/c/${rec.organizationKey}`) ||
          loc.includes("/hq/website"),
        `unexpected publish redirect: ${loc}`
      );
    }
  });

  it("path public /c/:organizationKey resolves after publish or shows setup", async () => {
    requireDb();
    const res = await request(app).get(`/c/${rec.organizationKey}`).set("Host", APEX);
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /not yet available in BlessBoard V5/i);
  });

  it("unknown organization path returns 404", async () => {
    requireDb();
    const res = await request(app).get("/c/no-such-org-zzzz").set("Host", APEX);
    assert.equal(res.status, 404);
  });

  it("repair inserts only missing structures and stays idempotent", async () => {
    requireDb();
    await pool.query(
      `DELETE FROM blessboard.page_sections
        WHERE page_id IN (
          SELECT id FROM blessboard.public_pages
           WHERE church_id = $1 AND branch_id IS NULL AND page_key = 'home'
        )`,
      [rec.churchId]
    );
    await pool.query(
      `DELETE FROM blessboard.public_pages
        WHERE church_id = $1 AND branch_id IS NULL AND page_key = 'home'`,
      [rec.churchId]
    );
    const gaps = await inspectWebsiteFoundationGaps(pool, { churchId: rec.churchId });
    assert.equal(gaps.ok, true);
    assert.equal(gaps.needsRepair, true);

    const first = await repairWebsiteFoundation(pool, {
      churchId: rec.churchId,
      actorUserId: rec.administratorUserId,
      auditReason: "test_repair",
    });
    assert.equal(first.ok, true);
    assert.equal(first.published, false);
    assert.ok(first.pagesCreated.includes("home"));

    const home = await publicContentRepo.findPageByScope(pool, {
      churchId: rec.churchId,
      branchId: null,
      pageKey: "home",
    });
    assert.ok(home);

    const second = await repairWebsiteFoundation(pool, {
      churchId: rec.churchId,
      actorUserId: rec.administratorUserId,
    });
    assert.equal(second.ok, true);
    assert.deepEqual(second.pagesCreated, []);
  });

  it("member portal remains unavailable on apex", async () => {
    requireDb();
    const res = await request(app)
      .get("/member")
      .set("Host", APEX)
      .set("Accept", "text/plain");
    assert.equal(res.status, 503);
  });
});
