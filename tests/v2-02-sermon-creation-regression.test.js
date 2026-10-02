"use strict";

/**
 * V2.02 QA — Sermon creation HTTP regression (pre-fix evidence).
 *
 * Authority: docs/qa/V2_02_QA_DEFECT_AUDIT.md issue #2.
 * TEST CHANGES ONLY — does not modify application code.
 *
 * Surfaces under test:
 * 1) Content-admin entity form → POST /{hq|branch-admin}/content/sermons
 * 2) Structured editor → POST /{hq|branch-admin}/content/api/structured-draft
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const request = require("supertest");

const {
  resetFoundationDatabase,
  foundationDbUnavailableSkipReason,
  createFoundationPool,
} = require("./helpers/foundationDb");
const {
  V5_IDENTITY_KEY: IDENTITY_KEY,
  DEFAULT_V5_COOKIE,
  baseV5TestEnv,
  extractSetCookie: extractCookie,
  joinCookieHeader: cookieHeader,
} = require("./helpers/blessboardV5Fixtures");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");

const PASSWORD = "correct-horse-battery-staple";
const HOST = "serm-reg.blessboard.org";
const STRUCTURED_JS = path.join(
  __dirname,
  "..",
  "public",
  "blessboard",
  "v5",
  "website-structured-edit.js"
);

describe("V2.02 sermon creation QA regression", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let church;
  let branch;
  let hqAdmin;

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
        organizationKey: "serm-reg",
        displayName: "Sermon Reg",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "serm-reg",
        hostname: HOST,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(org.ok, true, org.message);
      const ch = await provisionBlessBoardChurch(pool, {
        organizationKey: "serm-reg",
        churchKey: "serm-reg",
        displayName: "Sermon Reg Church",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      assert.equal(ch.ok, true, ch.message);
      church = ch.records.church;
      branch = ch.records.hqBranch;

      const created = await createBlessBoardUser(pool, {
        email: "hq@serm-reg.example.test",
        password: PASSWORD,
        displayName: "HQ Admin",
      });
      assert.equal(created.ok, true, created.reason || created.message);
      const role = await assignBlessBoardRole(pool, {
        email: "hq@serm-reg.example.test",
        organizationKey: "serm-reg",
        churchKey: "serm-reg",
        roleKey: "church_hq_admin",
      });
      assert.equal(role.ok, true, role.message || role.reason);
      const session = await createV5Session(pool, {
        deploymentCode: "blessboard-org-staging",
        userId: created.user.id,
        organizationId: org.records.organization.id,
      });
      assert.equal(session.ok, true, session.code);
      hqAdmin = { user: created.user, rawToken: session.rawToken };

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseV5TestEnv({ DEPLOYMENT_ENV: "testing" }),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = String((err && err.message) || err);
      // eslint-disable-next-line no-console
      console.error("v2-02 sermon regression setup failed:", skipReason);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function skipIfNeeded(t) {
    if (skipSuite) {
      t.skip(foundationDbUnavailableSkipReason(skipReason));
      return true;
    }
    return false;
  }

  function sid() {
    return `${DEFAULT_V5_COOKIE}=${hqAdmin.rawToken}`;
  }

  async function csrfPage(pathName) {
    const page = await request(app).get(pathName).set("Host", HOST).set("Cookie", sid());
    const csrf = extractCookie(page, CSRF_COOKIE);
    assert.ok(csrf, `csrf from ${pathName}`);
    return {
      page,
      csrf,
      cookie: cookieHeader(sid(), `${CSRF_COOKIE}=${csrf}`),
    };
  }

  async function postSermonForm(fields) {
    const { csrf, cookie } = await csrfPage("/hq/content/sermons");
    return request(app)
      .post("/hq/content/sermons")
      .set("Host", HOST)
      .set("Cookie", cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        action: "create",
        status: "draft",
        ...fields,
      });
  }

  async function postStructuredSermon(payload) {
    const { csrf, cookie } = await csrfPage("/hq/content/sermons");
    return request(app)
      .post("/hq/content/api/structured-draft")
      .set("Host", HOST)
      .set("Cookie", cookie)
      .set("Accept", "application/json")
      .set("Content-Type", "application/json")
      .set("X-CSRF-Token", csrf)
      .send({
        _csrf: csrf,
        action: "save",
        draftKind: "sermon",
        pageKey: "sermons",
        sectionKey: null,
        entityKey: "new-sermon",
        op: "upsert",
        payload,
        previousPayload: null,
      });
  }

  it("UI_CONTRACT: content-admin + structured editor field shapes", async (t) => {
    if (skipIfNeeded(t)) return;

    const { page } = await csrfPage("/hq/content/sermons");
    assert.equal(page.status, 200);
    assert.match(page.text, /data-bb-sermons-create="1"|name="preached_at"/);

    // Content-admin Add Sermon form (entity-fields.ejs) — aligned with structured type=date
    assert.match(
      page.text,
      /name="preached_at"[^>]*type="date"|type="date"[^>]*name="preached_at"/
    );
    assert.match(page.text, /Preached date/);
    assert.match(page.text, /name="preached_at"[^>]*required|required[^>]*name="preached_at"/);
    assert.doesNotMatch(page.text, /placeholder="2026-07-18T10:00:00Z"/);
    assert.match(page.text, /name="media_url"[^>]*type="url"|type="url"[^>]*name="media_url"/);
    assert.match(page.text, /name="resource_url"/);
    assert.match(page.text, /name="image_url"|srcName:\s*'image_url'|data-gp-we-media-src/);
    assert.match(page.text, /name="title"[^>]*required|required[^>]*name="title"/);
    assert.match(page.text, /name="speaker_name"[^>]*required|required[^>]*name="speaker_name"/);

    // Structured editor (public website Add Sermon) — type=date → YYYY-MM-DD
    const se = fs.readFileSync(STRUCTURED_JS, "utf8");
    assert.match(se, /function buildSermonForm/);
    assert.match(se, /field\("Date", "date", date, \{ type: "date", required: true \}\)/);
    assert.match(se, /field\("Audio or video URL", "mediaUrl".*type: "url"/);
  });

  /**
   * A — locale DMY must be controlled 400 (never PG 503).
   */
  it("A REALISTIC: content-admin locale DMY preached_at must not 503", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await postSermonForm({
      title: "Living Hope",
      speaker_name: "Pastor Ada",
      summary: "Sunday message",
      preached_at: "18/07/2026",
      media_url: "",
      resource_url: "",
      image_url: "",
    });
    t.diagnostic(`A_REALISTIC_STATUS=${res.status}`);
    assert.equal(res.status, 400, `expected controlled 400, got ${res.status}`);
    assert.match(res.text, /Enter a valid preached date|preached date|check the form/i);
  });

  it("A2 REALISTIC: structured editor type=date YYYY-MM-DD saves draft", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await postStructuredSermon({
      title: "Living Hope Structured",
      speakerName: "Pastor Ada",
      date: "2026-07-18",
      scripture: "Romans 15:13",
      series: "Hope",
      description: "Structured editor payload",
      mediaUrl: "",
      imageUrl: "",
      featured: false,
      visible: true,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
    assert.equal(res.body.ok, true, JSON.stringify(res.body).slice(0, 300));
  });

  it("A3: structured editor empty date rejected with 400", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await postStructuredSermon({
      title: "Missing Date Sermon",
      speakerName: "Pastor Ada",
      date: "",
      description: "Date left blank in type=date control",
      mediaUrl: "",
      imageUrl: "",
      visible: true,
    });
    assert.equal(res.status, 400, `got ${res.status} body=${JSON.stringify(res.body).slice(0, 240)}`);
    assert.equal(res.body.ok, false);
    assert.match(String(res.body.error || ""), /preached date|sermon fields/i);
  });

  it("A4: content-admin YYYY-MM-DD create succeeds", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await postSermonForm({
      title: "Date Only Sermon",
      speaker_name: "Pastor Ada",
      summary: "Canonical browser date",
      preached_at: "2026-07-18",
      media_url: "",
      resource_url: "",
      image_url: "",
    });
    assert.equal(res.status, 303, `got ${res.status}`);
  });

  it("A5: impossible calendar date rejected with 400", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await postSermonForm({
      title: "Impossible Date",
      speaker_name: "Pastor Ada",
      preached_at: "2026-02-31",
      media_url: "",
      resource_url: "",
    });
    assert.equal(res.status, 400, `got ${res.status}`);
  });

  it("B CANONICAL ISO baseline content-admin create succeeds", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await postSermonForm({
      title: "Canonical ISO Sermon",
      speaker_name: "Pastor Bea",
      summary: "Baseline",
      preached_at: "2026-07-18T10:00:00.000Z",
      media_url: "https://example.com/sermons/canonical.mp3",
      resource_url: "",
      image_url: "",
    });
    assert.equal(res.status, 303, `expected redirect, got ${res.status}`);
    assert.match(String(res.headers.location || ""), /\/hq\/content\/sermons/);
  });

  it("C INVALID DATE: genuinely invalid preached_at is controlled 400", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await postSermonForm({
      title: "Bad Date",
      speaker_name: "Pastor Ada",
      preached_at: "not-a-real-date",
      media_url: "",
      resource_url: "",
    });
    assert.equal(res.status, 400, `got ${res.status}`);
  });

  it("D EMPTY OPTIONAL URL: blank media/resource do not fail create", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await postSermonForm({
      title: "No URLs Sermon",
      speaker_name: "Pastor Ada",
      preached_at: "2026-08-01T09:00:00.000Z",
      media_url: "",
      resource_url: "",
      image_url: "",
    });
    assert.equal(res.status, 303, `empty optional URLs must be accepted, got ${res.status}`);
  });

  it("E INVALID SUPPLIED URL: http media_url rejected per https contract", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await postSermonForm({
      title: "HTTP Media",
      speaker_name: "Pastor Ada",
      preached_at: "2026-08-02T09:00:00.000Z",
      media_url: "http://example.com/sermon.mp3",
      resource_url: "",
    });
    assert.equal(res.status, 400, `got ${res.status}`);
  });

  it("E2 INVALID URL: malformed media_url rejected", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await postSermonForm({
      title: "Malformed Media",
      speaker_name: "Pastor Ada",
      preached_at: "2026-08-03T09:00:00.000Z",
      media_url: "not a url",
      resource_url: "",
    });
    assert.equal(res.status, 400, `got ${res.status}`);
  });

  it("F PERSISTENCE: accepted ISO sermon reloads from DB", async (t) => {
    if (skipIfNeeded(t)) return;
    const title = `Persist ${Date.now()}`;
    const preachedAt = "2026-09-10T14:30:00.000Z";
    const media = "https://example.com/sermons/persist.mp3";
    const res = await postSermonForm({
      title,
      speaker_name: "Pastor Persist",
      summary: "Keep me",
      preached_at: preachedAt,
      media_url: media,
      resource_url: "https://example.com/notes.pdf",
      image_url: "",
    });
    assert.equal(res.status, 303);

    const row = await pool.query(
      `SELECT title, speaker_name, preached_at, media_url, resource_url, status
         FROM blessboard.sermons
        WHERE church_id = $1 AND title = $2
        ORDER BY created_at DESC
        LIMIT 1`,
      [church.id, title]
    );
    assert.equal(row.rowCount, 1);
    assert.equal(row.rows[0].speaker_name, "Pastor Persist");
    assert.equal(row.rows[0].status, "draft");
    assert.equal(String(row.rows[0].media_url), media);
    assert.equal(String(row.rows[0].resource_url), "https://example.com/notes.pdf");
    assert.equal(new Date(row.rows[0].preached_at).toISOString(), preachedAt);
  });

  it("CONTRACT: omitting preached_at is INVALID_INPUT 400", async (t) => {
    if (skipIfNeeded(t)) return;
    const res = await postSermonForm({
      title: "No preached_at field",
      speaker_name: "Pastor Ada",
      media_url: "",
      resource_url: "",
    });
    assert.equal(res.status, 400, `got ${res.status}`);
  });
});
