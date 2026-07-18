"use strict";

/**
 * BlessBoard V5 public content administration (HQ + branch scopes).
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
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const { updateChurchSettings, ensureChurchSettingsInitialized } = require("../src/blessboard/services/blessBoardSettingsService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "ca-a.blessboard.org";
const HOST_B = "ca-b.blessboard.org";

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  if (!raw) return null;
  const list = Array.isArray(raw) ? raw : [raw];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

function cookieHeader(...pairs) {
  return pairs.filter(Boolean).join("; ");
}

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    ...overrides,
  };
}

describe("blessboard content admin", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let churchA;
  let branchA;
  let churchB;
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

      const orgA = await provisionPlatformTenant(pool, {
        organizationKey: "ca-a",
        displayName: "Content Admin A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "ca-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);
      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "ca-a",
        churchKey: "ca-a",
        displayName: "Content Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      branchA = chA.records.hqBranch;

      const orgB = await provisionPlatformTenant(pool, {
        organizationKey: "ca-b",
        displayName: "Content Admin B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "ca-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(orgB.ok, true, orgB.message);
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "ca-b",
        churchKey: "ca-b",
        displayName: "Content Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);
      churchB = chB.records.church;

      async function makeUser(email, displayName, role) {
        const created = await createBlessBoardUser(pool, { email, displayName, password: PASSWORD });
        assert.equal(created.ok, true, created.message);
        assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-v5",
          userId: created.user.id,
          organizationId: role.organizationKey === "ca-a" ? orgA.records.organization.id : orgB.records.organization.id,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      users.hqA = await makeUser("hq-a@example.test", "HQ A", {
        email: "hq-a@example.test",
        organizationKey: "ca-a",
        roleKey: "church_hq_admin",
        churchKey: "ca-a",
      });
      users.branchA = await makeUser("branch-a@example.test", "Branch A", {
        email: "branch-a@example.test",
        organizationKey: "ca-a",
        roleKey: "branch_admin",
        churchKey: "ca-a",
        branchKey: "hq",
      });
      users.hqB = await makeUser("hq-b@example.test", "HQ B", {
        email: "hq-b@example.test",
        organizationKey: "ca-b",
        roleKey: "church_hq_admin",
        churchKey: "ca-b",
      });

      await ensureChurchSettingsInitialized(pool, churchA.id);
      await updateChurchSettings(pool, churchA.id, {
        publicName: "Content Church A",
        websiteStatus: "published",
      });

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
        apexHosts: new Set(["blessboard.org", "www.blessboard.org"]),
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

  async function authedGet(url, host, user) {
    const res = await request(app).get(url).set("Host", host).set("Cookie", `${DEFAULT_V5_COOKIE}=${user.rawToken}`);
    const csrf = extractCookie(res, CSRF_COOKIE);
    return { res, csrf };
  }

  async function authedPost(url, host, user, csrf, fields) {
    return request(app)
      .post(url)
      .set("Host", host)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${user.rawToken}`, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({ [CSRF_FIELD]: csrf, ...fields });
  }

  it("HQ can open content index and provisions empty pages", async () => {
    requireDb();
    const { res } = await authedGet("/hq/content", HOST_A, users.hqA);
    assert.equal(res.status, 200);
    assert.match(res.text, /Website content/);
    assert.match(res.text, /Church-wide/);
    assert.match(res.text, /\/hq\/content\/pages\/about/);
    assert.doesNotMatch(res.text, new RegExp(churchA.id, "i"));
  });

  it("branch_admin cannot access HQ content but can access branch-admin content", async () => {
    requireDb();
    const hq = await authedGet("/hq/content", HOST_A, users.branchA);
    assert.equal(hq.res.status, 403);

    const ba = await authedGet("/branch-admin/content", HOST_A, users.branchA);
    assert.equal(ba.res.status, 200);
    assert.match(ba.res.text, /\/branch-admin\/content\/pages\/home/);
    assert.doesNotMatch(ba.res.text, /Church-wide/);
  });

  it("rejects cross-tenant content access", async () => {
    requireDb();
    const { res } = await authedGet("/hq/content", HOST_A, users.hqB);
    assert.ok(res.status === 403 || res.status === 503);
    assert.doesNotMatch(res.text, /Content Church A/);
  });

  it("CSRF required on content writes", async () => {
    requireDb();
    const { res: getRes, csrf } = await authedGet("/hq/content/pages/about", HOST_A, users.hqA);
    assert.equal(getRes.status, 200);
    const bad = await request(app)
      .post("/hq/content/pages/about")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({ title: "About us", status: "draft", expected_updated_at: "2020-01-01T00:00:00.000Z" });
    assert.equal(bad.status, 403);
  });

  it("supports create/edit/publish/archive for sections without hard delete", async () => {
    requireDb();
    const { res: pageRes, csrf } = await authedGet("/hq/content/pages/about", HOST_A, users.hqA);
    assert.equal(pageRes.status, 200);
    const expected = (pageRes.text.match(/name="expected_updated_at" value="([^"]+)"/) || [])[1];
    assert.ok(expected);

    const created = await authedPost("/hq/content/pages/about/sections", HOST_A, users.hqA, csrf, {
      section_key: "story",
      section_type: "text",
      heading: "Our story",
      body_text: "Draft story",
      sort_order: "1",
      status: "draft",
    });
    assert.ok([302, 303].includes(created.status));
    assert.match(created.headers.location || "", /\/sections\/story/);

    const { res: secGet, csrf: csrf2 } = await authedGet(
      "/hq/content/pages/about/sections/story",
      HOST_A,
      users.hqA
    );
    assert.equal(secGet.status, 200);
    const secExpected = (secGet.text.match(/name="expected_updated_at" value="([^"]+)"/) || [])[1];

    const noConfirm = await authedPost(
      "/hq/content/pages/about/sections/story",
      HOST_A,
      users.hqA,
      csrf2,
      {
        heading: "Our story",
        body_text: "Ready story",
        section_type: "text",
        sort_order: "1",
        status: "published",
        expected_updated_at: secExpected,
      }
    );
    assert.equal(noConfirm.status, 400);
    assert.match(noConfirm.text, /confirm/i);

    const { res: secGet2, csrf: csrf3 } = await authedGet(
      "/hq/content/pages/about/sections/story",
      HOST_A,
      users.hqA
    );
    const secExpected2 = (secGet2.text.match(/name="expected_updated_at" value="([^"]+)"/) || [])[1];
    const published = await authedPost(
      "/hq/content/pages/about/sections/story",
      HOST_A,
      users.hqA,
      csrf3,
      {
        heading: "Our story",
        body_text: "Ready story",
        section_type: "text",
        sort_order: "1",
        status: "published",
        expected_updated_at: secExpected2,
        confirm_publish: "1",
      }
    );
    assert.ok([302, 303].includes(published.status));

    const { res: pageGet2, csrf: csrf4 } = await authedGet("/hq/content/pages/about", HOST_A, users.hqA);
    const pageExpected = (pageGet2.text.match(/name="expected_updated_at" value="([^"]+)"/) || [])[1];
    const pubPage = await authedPost("/hq/content/pages/about", HOST_A, users.hqA, csrf4, {
      title: "About",
      status: "published",
      expected_updated_at: pageExpected,
      confirm_publish: "1",
    });
    assert.ok([302, 303].includes(pubPage.status));

    const publicAbout = await request(app).get("/about").set("Host", HOST_A);
    assert.equal(publicAbout.status, 200);
    assert.match(publicAbout.text, /Ready story/);

    const routeSrc = fs.readFileSync(
      path.join(__dirname, "../src/blessboard/http/contentAdminRoutes.js"),
      "utf8"
    );
    assert.doesNotMatch(routeSrc, /router\.delete\(|method:\s*['"]DELETE['"]/i);
  });

  it("detects optimistic conflicts on page update", async () => {
    requireDb();
    const { res: pageRes, csrf } = await authedGet("/hq/content/pages/home", HOST_A, users.hqA);
    assert.equal(pageRes.status, 200);
    const conflict = await authedPost("/hq/content/pages/home", HOST_A, users.hqA, csrf, {
      title: "Home",
      status: "draft",
      expected_updated_at: "2000-01-01T00:00:00.000Z",
    });
    assert.equal(conflict.status, 409);
    assert.match(conflict.text, /Someone else updated/i);
  });

  it("rejects non-HTTPS media URLs", async () => {
    requireDb();
    const { csrf } = await authedGet("/hq/content/pages/home", HOST_A, users.hqA);
    const bad = await authedPost("/hq/content/pages/home/sections", HOST_A, users.hqA, csrf, {
      section_key: "badmedia",
      section_type: "media",
      heading: "Pic",
      body_text: "x",
      media_url: "http://example.com/a.jpg",
      sort_order: "2",
      status: "draft",
    });
    assert.equal(bad.status, 400);
  });

  it("HQ manages branch-scoped content; branch_admin cannot edit church-wide", async () => {
    requireDb();
    const { res } = await authedGet("/hq/content/b/hq", HOST_A, users.hqA);
    assert.equal(res.status, 200);
    assert.match(res.text, /HQ A|Branch/i);

    const { res: pageRes, csrf } = await authedGet("/hq/content/b/hq/pages/contact", HOST_A, users.hqA);
    assert.equal(pageRes.status, 200);
    const expected = (pageRes.text.match(/name="expected_updated_at" value="([^"]+)"/) || [])[1];
    assert.ok(expected);
    const updated = await authedPost("/hq/content/b/hq/pages/contact", HOST_A, users.hqA, csrf, {
      title: "Branch Contact",
      status: "draft",
      expected_updated_at: expected,
    });
    assert.ok(
      [302, 303].includes(updated.status),
      `expected redirect, got ${updated.status}: ${String(updated.text).slice(0, 200)}`
    );

    const denied = await authedGet("/hq/content/pages/contact", HOST_A, users.branchA);
    assert.equal(denied.res.status, 403);
  });

  it("leadership CRUD with draft hidden on public and visible in preview", async () => {
    requireDb();
    const { csrf } = await authedGet("/hq/content/leadership", HOST_A, users.hqA);
    const created = await authedPost("/hq/content/leadership", HOST_A, users.hqA, csrf, {
      action: "create",
      display_name: "Pastor Draft",
      role_title: "Pastor",
      biography: "Bio",
      sort_order: "1",
      status: "draft",
    });
    assert.ok([302, 303].includes(created.status));

    const { res: leadPage, csrf: csrf2 } = await authedGet("/hq/content/pages/leadership", HOST_A, users.hqA);
    const pageExpected = (leadPage.text.match(/name="expected_updated_at" value="([^"]+)"/) || [])[1];
    await authedPost("/hq/content/pages/leadership", HOST_A, users.hqA, csrf2, {
      title: "Leadership",
      status: "published",
      expected_updated_at: pageExpected,
      confirm_publish: "1",
    });

    const publicLead = await request(app).get("/leadership").set("Host", HOST_A);
    assert.doesNotMatch(publicLead.text, /Pastor Draft/);

    const preview = await authedGet("/hq/content/preview/leadership", HOST_A, users.hqA);
    assert.equal(preview.res.status, 200);
    assert.match(preview.res.text, /Pastor Draft/);
    assert.match(preview.res.text, /noindex|Preview/i);

    const unauth = await request(app).get("/hq/content/preview/leadership").set("Host", HOST_A);
    assert.ok(unauth.status === 303 || unauth.status === 401);
  });

  it("archives leaders and blocks silent reactivation", async () => {
    requireDb();
    const { csrf } = await authedGet("/hq/content/leadership", HOST_A, users.hqA);
    await authedPost("/hq/content/leadership", HOST_A, users.hqA, csrf, {
      action: "create",
      display_name: "Archive Elder",
      role_title: "Elder",
      sort_order: "3",
      status: "draft",
    });
    const { res: list, csrf: csrf2 } = await authedGet("/hq/content/leadership", HOST_A, users.hqA);
    assert.match(list.text, /Archive Elder/);
    let archiveId = null;
    let expected = null;
    const parts = list.text.split('name="item_id" value="');
    for (let i = 1; i < parts.length; i += 1) {
      const id = parts[i].slice(0, 36);
      const chunk = parts[i].slice(0, 1200);
      if (chunk.includes("Archive Elder") || list.text.includes("Archive Elder")) {
        // Prefer chunk that also has expected_updated_at soon after
        const m = chunk.match(/expected_updated_at" value="([^"]+)"/);
        if (m) {
          archiveId = id;
          expected = m[1];
          break;
        }
      }
    }
    if (!archiveId) {
      const row = await pool.query(
        `SELECT id, updated_at FROM blessboard.leaders
          WHERE church_id = $1 AND display_name = 'Archive Elder'
          ORDER BY created_at DESC LIMIT 1`,
        [churchA.id]
      );
      archiveId = row.rows[0].id;
      expected = new Date(row.rows[0].updated_at).toISOString();
    }
    const archived = await authedPost("/hq/content/leadership", HOST_A, users.hqA, csrf2, {
      action: "update",
      item_id: archiveId,
      display_name: "Archive Elder",
      role_title: "Elder",
      sort_order: "3",
      status: "archived",
      expected_updated_at: expected,
    });
    assert.ok(
      [302, 303].includes(archived.status),
      `archive status ${archived.status}: ${String(archived.text).slice(0, 300)}`
    );

    await assert.rejects(
      () =>
        pool.query(`UPDATE blessboard.leaders SET status = 'draft' WHERE id = $1`, [archiveId]),
      /archived|reactivated|integrity/i
    );
  });

  it("V4 public CMS remains unchanged", () => {
    assert.equal(fs.existsSync(path.join(__dirname, "../views/church/public/about.ejs")), true);
    assert.equal(fs.existsSync(path.join(__dirname, "../src/routes/church/publicPages.js")), true);
    const v5 = fs.readFileSync(
      path.join(__dirname, "../src/platform/http/v5FoundationServer.js"),
      "utf8"
    );
    assert.doesNotMatch(v5, /websiteContentService|views\/church\/public/);
  });
});
