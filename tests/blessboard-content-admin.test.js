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
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
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

      // Second active campus → multi_site so HQ branch website editors remain available.
      await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-east', 'Campus East', 'branch', 'active', false, 'UTC', 'US')`,
        [churchA.id]
      );

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
    assert.match(res.text, /Public content|Website content/);
    assert.match(res.text, /Church-wide/);
    assert.match(res.text, /data-bb-content-admin="1"/);
    assert.match(res.text, /data-bb-hq-content="1"/);
    assert.match(res.text, /data-bb-stitch-content="34-branch-website-editor"/);
    assert.match(res.text, /data-bb-content-scope="church-wide"/);
    assert.match(res.text, /data-bb-content-scope-panel="1"/);
    assert.match(res.text, /data-bb-content-summary="1"/);
    assert.match(res.text, /data-bb-content-pages="1"/);
    assert.match(res.text, /data-bb-content-entities="1"/);
    assert.match(res.text, /data-bb-content-page-cards="1"/);
    assert.match(res.text, /data-bb-content-filter="1"/);
    assert.match(res.text, /data-bb-content-status-chips="1"/);
    assert.match(res.text, /data-bb-hq-content-branches="1"/);
    assert.match(res.text, /data-bb-content-branch-table="1"/);
    assert.match(res.text, /data-bb-content-branch-cards="1"/);
    assert.match(res.text, /\/hq\/content\/pages\/about/);
    assert.match(res.text, /\/hq\/content\/leadership/);
    assert.match(res.text, /\/hq\/content\/ministries/);
    assert.match(res.text, /\/hq\/content\/events/);
    assert.match(res.text, /\/hq\/content\/sermons/);
    assert.match(res.text, /\/hq\/content\/contact/);
    assert.match(res.text, /\/hq\/content\/giving/);
    assert.match(res.text, /href="\/hq\/announcements"/);
    assert.match(res.text, /data-bb-content-unavailable="builder"/);
    assert.match(res.text, /data-bb-content-unavailable="theme"/);
    assert.match(res.text, /data-bb-content-unavailable="domain"/);
    assert.match(res.text, /data-bb-content-unavailable="seo"/);
    assert.doesNotMatch(res.text, /completion %|85%|You have \d+ unsaved changes/i);
    assert.doesNotMatch(res.text, /live website builder|SEO analytics dashboard/i);
    assert.doesNotMatch(res.text, new RegExp(churchA.id, "i"));

    const filtered = await authedGet("/hq/content?status=draft", HOST_A, users.hqA);
    assert.equal(filtered.res.status, 200);
    assert.match(filtered.res.text, /data-bb-content-status-filter="draft"/);
    assert.match(filtered.res.text, /data-bb-content-page-status="draft"/);
  });

  it("branch_admin cannot access HQ content but can access branch-admin content", async () => {
    requireDb();
    const hq = await authedGet("/hq/content", HOST_A, users.branchA);
    assert.equal(hq.res.status, 403);

    const ba = await authedGet("/branch-admin/content", HOST_A, users.branchA);
    assert.equal(ba.res.status, 200);
    assert.match(ba.res.text, /data-bb-stitch-content="34-branch-website-editor"/);
    assert.match(ba.res.text, /\/branch-admin\/content\/pages\/home/);
    assert.match(ba.res.text, /\/branch-admin\/content\/preview\/home/);
    assert.match(ba.res.text, /\/branch-admin\/content\/ministries/);
    assert.match(ba.res.text, /data-bb-content-hq-controlled="1"/);
    assert.match(ba.res.text, /data-bb-content-scope="branch"/);
    assert.match(ba.res.text, /data-bb-content-unavailable="branding"/);
    assert.doesNotMatch(ba.res.text, /data-bb-content-scope="church-wide"/);
    assert.doesNotMatch(ba.res.text, /data-bb-hq-content-branches="1"/);
    assert.doesNotMatch(ba.res.text, new RegExp(churchA.id, "i"));
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
    assert.match(pageRes.text, /data-bb-content-page-editor="1"/);
    assert.match(pageRes.text, /data-bb-stitch-page-editor="34-branch-website-editor"/);
    assert.match(pageRes.text, /data-bb-page-form="1"/);
    assert.match(pageRes.text, /data-bb-page-sections="1"/);
    assert.match(pageRes.text, /data-bb-page-add-section="1"/);
    assert.match(pageRes.text, /name="title"/);
    assert.match(pageRes.text, /name="status"/);
    assert.match(pageRes.text, /name="confirm_publish"/);
    assert.match(pageRes.text, /name="expected_updated_at"/);
    assert.match(pageRes.text, /name="section_key"/);
    assert.match(pageRes.text, /name="section_type"/);
    assert.match(pageRes.text, /name="media_url"/);
    assert.match(pageRes.text, /data-bb-content-action="preview"/);
    assert.doesNotMatch(pageRes.text, /drag.?and.?drop|live edit|custom HTML|theme picker/i);
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
    assert.match(secGet.text, /data-bb-content-section-editor="1"/);
    assert.match(secGet.text, /data-bb-stitch-section-editor="34-branch-website-editor"/);
    assert.match(secGet.text, /data-bb-section-form="1"/);
    assert.match(secGet.text, /name="section_type"/);
    assert.match(secGet.text, /name="heading"/);
    assert.match(secGet.text, /name="body_text"/);
    assert.match(secGet.text, /name="media_url"/);
    assert.match(secGet.text, /name="sort_order"/);
    assert.match(secGet.text, /name="confirm_publish"/);
    assert.match(secGet.text, /name="expected_updated_at"/);
    assert.doesNotMatch(secGet.text, /custom HTML|theme widget|drag.?and.?drop/i);
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

  it("ministries admin list/editor supports create, publish confirm, search, and scope privacy", async () => {
    requireDb();
    const { res } = await authedGet("/branch-admin/content/ministries", HOST_A, users.branchA);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-ministries-admin="1"/);
    assert.match(res.text, /data-bb-stitch-ministries="29-branch-ministries-directory"/);
    assert.match(res.text, /data-bb-entity-kind="ministries"/);
    assert.match(res.text, /Ministries management/);
    assert.match(res.text, /data-bb-ministries-filter="1"/);
    assert.match(res.text, /data-bb-ministries-status-chips="1"/);
    assert.match(res.text, /data-bb-ministries-create="1"/);
    assert.match(res.text, /name="q"/);
    assert.match(res.text, /name="name"/);
    assert.match(res.text, /name="meeting_day"/);
    assert.match(res.text, /name="contact_email"/);
    assert.match(res.text, /name="sort_order"/);
    assert.match(res.text, /name="confirm_publish"/);
    assert.match(res.text, /name="_csrf"/);
    assert.match(res.text, /data-bb-ministries-unavailable="1"/);
    assert.doesNotMatch(res.text, /Total Members|Active Leaders|1,248|\+12%/i);
    assert.doesNotMatch(res.text, /Manage Roster|Export ministries|href="[^"]*\/export"/i);
    assert.doesNotMatch(res.text, /data-bb-entity-leader=|data-bb-entity-member-count=/i);
    assert.doesNotMatch(res.text, new RegExp(churchA.id, "i"));

    const denied = await authedGet("/branch-admin/content/ministries", HOST_A, users.hqB);
    assert.ok(denied.res.status === 403 || denied.res.status === 503);

    const { csrf } = await authedGet("/branch-admin/content/ministries", HOST_A, users.branchA);
    const badCsrf = await request(app)
      .post("/branch-admin/content/ministries")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.branchA.rawToken}`, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        action: "create",
        name: "Bad CSRF Ministry",
        status: "draft",
        sort_order: "1",
      });
    assert.equal(badCsrf.status, 403);

    const created = await authedPost("/branch-admin/content/ministries", HOST_A, users.branchA, csrf, {
      action: "create",
      name: "Youth Fellowship",
      summary: "Friday gathering",
      meeting_day: "Friday",
      contact_email: "youth@example.com",
      sort_order: "2",
      status: "draft",
    });
    assert.ok([302, 303].includes(created.status));

    const listed = await authedGet("/branch-admin/content/ministries", HOST_A, users.branchA);
    assert.match(listed.res.text, /Youth Fellowship/);
    assert.match(listed.res.text, /Friday/);
    assert.match(listed.res.text, /youth@example\.com/);
    assert.match(listed.res.text, /data-bb-ministries-table="1"/);
    assert.match(listed.res.text, /data-bb-ministries-cards="1"/);
    assert.match(listed.res.text, /data-bb-ministries-editors="1"/);

    const searched = await authedGet("/branch-admin/content/ministries?q=Youth", HOST_A, users.branchA);
    assert.equal(searched.res.status, 200);
    assert.match(searched.res.text, /Youth Fellowship/);
    assert.match(searched.res.text, /name="q"[^>]*value="Youth"|value="Youth"[^>]*name="q"/);

    const filtered = await authedGet("/branch-admin/content/ministries?status=published", HOST_A, users.branchA);
    assert.equal(filtered.res.status, 200);
    assert.match(filtered.res.text, /data-bb-ministries-status-filter="published"/);
    assert.doesNotMatch(filtered.res.text, /Youth Fellowship/);

    const { res: editList, csrf: csrf2 } = await authedGet("/branch-admin/content/ministries", HOST_A, users.branchA);
    let itemId = null;
    let expected = null;
    const parts = editList.text.split('name="item_id" value="');
    for (let i = 1; i < parts.length; i += 1) {
      const id = parts[i].slice(0, 36);
      const chunk = parts[i].slice(0, 1600);
      if (chunk.includes("Youth Fellowship") || editList.text.includes("Youth Fellowship")) {
        const m = chunk.match(/expected_updated_at" value="([^"]+)"/);
        if (m) {
          itemId = id;
          expected = m[1];
          break;
        }
      }
    }
    if (!itemId) {
      const row = await pool.query(
        `SELECT id, updated_at FROM blessboard.ministries
          WHERE church_id = $1 AND name = 'Youth Fellowship'
          ORDER BY created_at DESC LIMIT 1`,
        [churchA.id]
      );
      itemId = row.rows[0].id;
      expected = new Date(row.rows[0].updated_at).toISOString();
    }

    const noConfirm = await authedPost("/branch-admin/content/ministries", HOST_A, users.branchA, csrf2, {
      action: "update",
      item_id: itemId,
      name: "Youth Fellowship",
      summary: "Friday gathering",
      meeting_day: "Friday",
      contact_email: "youth@example.com",
      sort_order: "2",
      status: "published",
      expected_updated_at: expected,
    });
    assert.equal(noConfirm.status, 400);
    assert.match(noConfirm.text, /confirm/i);

    const { res: editList2, csrf: csrf3 } = await authedGet("/branch-admin/content/ministries", HOST_A, users.branchA);
    const expected2 =
      (editList2.text.match(new RegExp(`name="item_id" value="${itemId}"[\\s\\S]{0,400}?expected_updated_at" value="([^"]+)"`)) ||
        [])[1] || expected;
    const published = await authedPost("/branch-admin/content/ministries", HOST_A, users.branchA, csrf3, {
      action: "update",
      item_id: itemId,
      name: "Youth Fellowship",
      summary: "Friday gathering",
      meeting_day: "Friday evening",
      contact_email: "youth@example.com",
      sort_order: "3",
      status: "published",
      expected_updated_at: expected2,
      confirm_publish: "1",
    });
    assert.ok([302, 303].includes(published.status));

    const afterPublish = await authedGet("/branch-admin/content/ministries?status=published", HOST_A, users.branchA);
    assert.match(afterPublish.res.text, /Youth Fellowship/);
    assert.match(afterPublish.res.text, /Friday evening/);
  });

  it("events admin list/editor supports create, publish, schedule filters, and date fields", async () => {
    requireDb();
    const { res } = await authedGet("/branch-admin/content/events", HOST_A, users.branchA);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-events-admin="1"/);
    assert.match(res.text, /data-bb-stitch-events="32-branch-events-management"/);
    assert.match(res.text, /Events management/);
    assert.match(res.text, /data-bb-events-filter="1"/);
    assert.match(res.text, /data-bb-events-when-chips="1"/);
    assert.match(res.text, /data-bb-events-status-chips="1"/);
    assert.match(res.text, /data-bb-events-create="1"/);
    assert.match(res.text, /name="q"/);
    assert.match(res.text, /name="when"/);
    assert.match(res.text, /name="title"/);
    assert.match(res.text, /name="starts_at"/);
    assert.match(res.text, /name="ends_at"/);
    assert.match(res.text, /name="timezone"/);
    assert.match(res.text, /name="location"/);
    assert.match(res.text, /name="registration_url"/);
    assert.match(res.text, /name="confirm_publish"/);
    assert.match(res.text, /name="_csrf"/);
    assert.match(res.text, /data-bb-events-unavailable="1"/);
    assert.doesNotMatch(res.text, /43 Registered|data-bb-events-registration-count=/i);
    assert.doesNotMatch(res.text, /href="[^"]*\/roster"|bb-ba-btn[^>]*>\s*Manage roster/i);
    assert.doesNotMatch(res.text, new RegExp(churchA.id, "i"));

    const denied = await authedGet("/branch-admin/content/events", HOST_A, users.hqB);
    assert.ok(denied.res.status === 403 || denied.res.status === 503);

    const { csrf } = await authedGet("/branch-admin/content/events", HOST_A, users.branchA);
    const badCsrf = await request(app)
      .post("/branch-admin/content/events")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.branchA.rawToken}`, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        action: "create",
        title: "Bad CSRF Event",
        starts_at: "2030-01-15T18:00:00.000Z",
        timezone: "UTC",
        status: "draft",
      });
    assert.equal(badCsrf.status, 403);

    const startsAt = "2030-06-15T18:00:00.000Z";
    const endsAt = "2030-06-15T21:00:00.000Z";
    const created = await authedPost("/branch-admin/content/events", HOST_A, users.branchA, csrf, {
      action: "create",
      title: "Youth Night Fellowship",
      summary: "Evening gathering",
      starts_at: startsAt,
      ends_at: endsAt,
      timezone: "Africa/Lusaka",
      location: "Main Sanctuary",
      registration_url: "https://example.com/register/youth-night",
      sort_order: "1",
      status: "draft",
    });
    assert.ok(
      [302, 303].includes(created.status),
      `create status ${created.status}: ${String(created.text).slice(0, 300)}`
    );

    const listed = await authedGet("/branch-admin/content/events", HOST_A, users.branchA);
    assert.match(listed.res.text, /Youth Night Fellowship/);
    assert.match(listed.res.text, /Main Sanctuary/);
    assert.match(listed.res.text, /Africa\/Lusaka|data-bb-events-card=/);
    assert.match(listed.res.text, /data-bb-events-cards="1"/);
    assert.match(listed.res.text, /data-bb-events-editors="1"/);
    assert.match(listed.res.text, /name="starts_at"[^>]*value="2030-06-15T18:00:00\.000Z"|value="2030-06-15T18:00:00\.000Z"/);

    const upcoming = await authedGet("/branch-admin/content/events?when=upcoming", HOST_A, users.branchA);
    assert.equal(upcoming.res.status, 200);
    assert.match(upcoming.res.text, /data-bb-events-when-filter="upcoming"/);
    assert.match(upcoming.res.text, /Youth Night Fellowship/);

    const past = await authedGet("/branch-admin/content/events?when=past", HOST_A, users.branchA);
    assert.equal(past.res.status, 200);
    assert.match(past.res.text, /data-bb-events-when-filter="past"/);
    assert.doesNotMatch(past.res.text, /Youth Night Fellowship/);

    const searched = await authedGet("/branch-admin/content/events?q=Sanctuary", HOST_A, users.branchA);
    assert.match(searched.res.text, /Youth Night Fellowship/);

    const { res: editList, csrf: csrf2 } = await authedGet("/branch-admin/content/events", HOST_A, users.branchA);
    let itemId = null;
    let expected = null;
    const parts = editList.text.split('name="item_id" value="');
    for (let i = 1; i < parts.length; i += 1) {
      const id = parts[i].slice(0, 36);
      const chunk = parts[i].slice(0, 2000);
      const m = chunk.match(/expected_updated_at" value="([^"]+)"/);
      if (m && (chunk.includes("Youth Night") || editList.text.includes("Youth Night Fellowship"))) {
        itemId = id;
        expected = m[1];
        break;
      }
    }
    if (!itemId) {
      const row = await pool.query(
        `SELECT id, updated_at FROM blessboard.events
          WHERE church_id = $1 AND title = 'Youth Night Fellowship'
          ORDER BY created_at DESC LIMIT 1`,
        [churchA.id]
      );
      itemId = row.rows[0].id;
      expected = new Date(row.rows[0].updated_at).toISOString();
    }

    const noConfirm = await authedPost("/branch-admin/content/events", HOST_A, users.branchA, csrf2, {
      action: "update",
      item_id: itemId,
      title: "Youth Night Fellowship",
      summary: "Evening gathering",
      starts_at: startsAt,
      ends_at: endsAt,
      timezone: "Africa/Lusaka",
      location: "Hall B",
      registration_url: "https://example.com/register/youth-night",
      status: "published",
      expected_updated_at: expected,
    });
    assert.equal(noConfirm.status, 400);
    assert.match(noConfirm.text, /confirm/i);

    const { res: editList2, csrf: csrf3 } = await authedGet("/branch-admin/content/events", HOST_A, users.branchA);
    const expected2 =
      (editList2.text.match(new RegExp(`name="item_id" value="${itemId}"[\\s\\S]{0,500}?expected_updated_at" value="([^"]+)"`)) ||
        [])[1] || expected;
    const published = await authedPost("/branch-admin/content/events", HOST_A, users.branchA, csrf3, {
      action: "update",
      item_id: itemId,
      title: "Youth Night Fellowship",
      summary: "Evening gathering",
      starts_at: startsAt,
      ends_at: endsAt,
      timezone: "Africa/Lusaka",
      location: "Hall B",
      registration_url: "https://example.com/register/youth-night",
      status: "published",
      expected_updated_at: expected2,
      confirm_publish: "1",
    });
    assert.ok([302, 303].includes(published.status));

    const afterPublish = await authedGet("/branch-admin/content/events?status=published", HOST_A, users.branchA);
    assert.match(afterPublish.res.text, /Youth Night Fellowship/);
    assert.match(afterPublish.res.text, /Hall B/);
  });

  it("sermons admin list/editor supports create, publish, media validation, and ordering", async () => {
    requireDb();
    const { res } = await authedGet("/branch-admin/content/sermons", HOST_A, users.branchA);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-sermons-admin="1"/);
    assert.match(res.text, /data-bb-stitch-sermons="sermons-admin"/);
    assert.match(res.text, /Sermons management/);
    assert.match(res.text, /data-bb-sermons-filter="1"/);
    assert.match(res.text, /data-bb-sermons-status-chips="1"/);
    assert.match(res.text, /data-bb-sermons-create="1"/);
    assert.match(res.text, /name="q"/);
    assert.match(res.text, /name="title"/);
    assert.match(res.text, /name="speaker_name"/);
    assert.match(res.text, /name="preached_at"/);
    assert.match(res.text, /name="media_url"/);
    assert.match(res.text, /name="resource_url"/);
    assert.match(res.text, /name="confirm_publish"/);
    assert.match(res.text, /name="_csrf"/);
    assert.match(res.text, /data-bb-sermons-unavailable="1"/);
    assert.doesNotMatch(res.text, /1\.2k views|downloads today|engagement rate/i);
    assert.doesNotMatch(res.text, new RegExp(churchA.id, "i"));

    const denied = await authedGet("/branch-admin/content/sermons", HOST_A, users.hqB);
    assert.ok(denied.res.status === 403 || denied.res.status === 503);

    const { csrf } = await authedGet("/branch-admin/content/sermons", HOST_A, users.branchA);
    const badCsrf = await request(app)
      .post("/branch-admin/content/sermons")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.branchA.rawToken}`, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        action: "create",
        title: "Bad CSRF Sermon",
        speaker_name: "Pastor",
        preached_at: "2026-01-15T10:00:00.000Z",
        status: "draft",
      });
    assert.equal(badCsrf.status, 403);

    const badMedia = await authedPost("/branch-admin/content/sermons", HOST_A, users.branchA, csrf, {
      action: "create",
      title: "Bad Media Sermon",
      speaker_name: "Pastor A",
      preached_at: "2026-02-01T10:00:00.000Z",
      media_url: "http://example.com/sermon.mp3",
      status: "draft",
    });
    assert.equal(badMedia.status, 400);

    const preachedAt = "2026-03-20T09:30:00.000Z";
    const created = await authedPost("/branch-admin/content/sermons", HOST_A, users.branchA, csrf, {
      action: "create",
      title: "Living Hope Teaching",
      speaker_name: "Pastor Grace",
      preached_at: preachedAt,
      summary: "Hope for the week",
      media_url: "https://example.com/sermons/living-hope.mp3",
      resource_url: "https://example.com/notes/living-hope.pdf",
      status: "draft",
    });
    assert.ok(
      [302, 303].includes(created.status),
      `create status ${created.status}: ${String(created.text).slice(0, 300)}`
    );

    const listed = await authedGet("/branch-admin/content/sermons", HOST_A, users.branchA);
    assert.match(listed.res.text, /Living Hope Teaching/);
    assert.match(listed.res.text, /Pastor Grace/);
    assert.match(listed.res.text, /data-bb-sermons-cards="1"/);
    assert.match(listed.res.text, /data-bb-sermons-editors="1"/);
    assert.match(listed.res.text, /data-bb-sermons-media-link="1"/);
    assert.match(listed.res.text, /data-bb-sermons-resource-link="1"/);
    assert.match(listed.res.text, /name="preached_at"[^>]*value="2026-03-20T09:30:00\.000Z"|value="2026-03-20T09:30:00\.000Z"/);

    const searched = await authedGet("/branch-admin/content/sermons?q=Grace", HOST_A, users.branchA);
    assert.match(searched.res.text, /Living Hope Teaching/);

    const { res: editList, csrf: csrf2 } = await authedGet("/branch-admin/content/sermons", HOST_A, users.branchA);
    let itemId = null;
    let expected = null;
    const parts = editList.text.split('name="item_id" value="');
    for (let i = 1; i < parts.length; i += 1) {
      const id = parts[i].slice(0, 36);
      const chunk = parts[i].slice(0, 2000);
      const m = chunk.match(/expected_updated_at" value="([^"]+)"/);
      if (m && (chunk.includes("Living Hope") || editList.text.includes("Living Hope Teaching"))) {
        itemId = id;
        expected = m[1];
        break;
      }
    }
    if (!itemId) {
      const row = await pool.query(
        `SELECT id, updated_at FROM blessboard.sermons
          WHERE church_id = $1 AND title = 'Living Hope Teaching'
          ORDER BY created_at DESC LIMIT 1`,
        [churchA.id]
      );
      itemId = row.rows[0].id;
      expected = new Date(row.rows[0].updated_at).toISOString();
    }

    const noConfirm = await authedPost("/branch-admin/content/sermons", HOST_A, users.branchA, csrf2, {
      action: "update",
      item_id: itemId,
      title: "Living Hope Teaching",
      speaker_name: "Pastor Grace",
      preached_at: preachedAt,
      summary: "Hope for the week",
      media_url: "https://example.com/sermons/living-hope.mp3",
      resource_url: "https://example.com/notes/living-hope.pdf",
      status: "published",
      expected_updated_at: expected,
    });
    assert.equal(noConfirm.status, 400);
    assert.match(noConfirm.text, /confirm/i);

    const { res: editList2, csrf: csrf3 } = await authedGet("/branch-admin/content/sermons", HOST_A, users.branchA);
    const expected2 =
      (editList2.text.match(new RegExp(`name="item_id" value="${itemId}"[\\s\\S]{0,500}?expected_updated_at" value="([^"]+)"`)) ||
        [])[1] || expected;
    const published = await authedPost("/branch-admin/content/sermons", HOST_A, users.branchA, csrf3, {
      action: "update",
      item_id: itemId,
      title: "Living Hope Teaching",
      speaker_name: "Pastor Grace",
      preached_at: preachedAt,
      summary: "Updated hope message",
      media_url: "https://example.com/sermons/living-hope.mp3",
      resource_url: "https://example.com/notes/living-hope.pdf",
      status: "published",
      expected_updated_at: expected2,
      confirm_publish: "1",
    });
    assert.ok([302, 303].includes(published.status));

    const afterPublish = await authedGet("/branch-admin/content/sermons?status=published", HOST_A, users.branchA);
    assert.match(afterPublish.res.text, /Living Hope Teaching/);
    assert.match(afterPublish.res.text, /Updated hope message/);
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
    assert.match(res.text, /data-bb-hq-content="1"/);
    assert.match(res.text, /data-bb-content-scope="branch"/);
    assert.match(res.text, /data-bb-content-scope-panel="1"/);
    assert.match(res.text, /href="\/hq\/content"/);
    assert.match(res.text, /data-bb-content-filter="1"/);
    assert.doesNotMatch(res.text, /data-bb-hq-content-branches="1"/);

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
    const { res: leadList, csrf } = await authedGet("/hq/content/leadership", HOST_A, users.hqA);
    assert.equal(leadList.status, 200);
    assert.match(leadList.text, /data-bb-entity-admin="1"/);
    assert.match(leadList.text, /data-bb-entity-kind="leadership"/);
    assert.match(leadList.text, /data-bb-entity-create="1"/);
    assert.match(leadList.text, /name="display_name"/);
    assert.match(leadList.text, /name="confirm_publish"/);
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
    assert.match(preview.res.text, /data-bb-shell="tenant-public"/);
    assert.match(preview.res.text, /data-bb-preview-banner="1"/);
    assert.match(preview.res.text, /data-bb-leadership="1"/);
    assert.doesNotMatch(preview.res.text, /bb-ca-preview-body/);

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
