"use strict";

/**
 * Minimal V5 church HQ shell + read-only branch selector tests (ephemeral Postgres).
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

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "hq-a.blessboard.org";
const HOST_B = "hq-b.blessboard.org";
const CHURCH_A = "HQ Shell Church A";
const CHURCH_B = "HQ Shell Church B";

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

describe("blessboard hq shell", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let churchA;
  let hqA;
  let campusA;
  let writes = [];
  let users = {};

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      const originalQuery = pool.query.bind(pool);
      pool.query = (text, params) => {
        const sql = String(text || "");
        if (/\bpublic\.tenants\b/i.test(sql)) writes.push("public.tenants");
        if (/^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql.trim())) {
          writes.push(sql.trim().slice(0, 60));
        }
        return originalQuery(text, params);
      };

      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      const provA = await provisionPlatformTenant(pool, {
        organizationKey: "hq-a",
        displayName: "HQ Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "hq-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(provA.ok, true, provA.message);
      orgA = provA.records.organization;

      const provB = await provisionPlatformTenant(pool, {
        organizationKey: "hq-b",
        displayName: "HQ Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "hq-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(provB.ok, true, provB.message);

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "hq-a",
        churchKey: "hq-a",
        displayName: CHURCH_A,
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      hqA = chA.records.hqBranch;

      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "hq-b",
        churchKey: "hq-b",
        displayName: CHURCH_B,
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters B",
      });
      assert.equal(chB.ok, true, chB.message);

      const campus = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-north', 'Campus North', 'branch', 'active', false, 'Africa/Lusaka', 'ZM')
         RETURNING id, branch_key`,
        [churchA.id]
      );
      campusA = campus.rows[0];

      await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-old', 'Campus Old', 'branch', 'inactive', false, 'Africa/Lusaka', 'ZM')`,
        [churchA.id]
      );

      async function makeUser(email, displayName) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        return created.user;
      }

      users.hq = await makeUser("hq-shell@example.org", "HQ Shell Admin");
      users.platform = await makeUser("hq-platform@example.org", "HQ Platform");
      users.branch = await makeUser("hq-branch@example.org", "HQ Branch Only");

      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "hq-shell@example.org",
            organizationKey: "hq-a",
            roleKey: "church_hq_admin",
            churchKey: "hq-a",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "hq-platform@example.org",
            organizationKey: "hq-a",
            roleKey: "platform_admin",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "hq-branch@example.org",
            organizationKey: "hq-a",
            roleKey: "branch_admin",
            churchKey: "hq-a",
            branchKey: "hq",
          })
        ).ok,
        true
      );

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
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  async function cookieFor(user) {
    const created = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId: user.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: hqA.id,
    });
    assert.equal(created.ok, true, created.code);
    return `${DEFAULT_V5_COOKIE}=${created.rawToken}`;
  }

  it("HQ admin sees own church, active branches, and real active count", async () => {
    requireDb();
    const cookie = await cookieFor(users.hq);
    const res = await request(app).get("/hq").set("Host", HOST_A).set("Cookie", cookie);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-shell="hq-admin"/);
    assert.match(res.text, /data-bb-stitch-shell="51-hq-dashboard"/);
    assert.match(res.text, /data-bb-hq-dashboard="1"/);
    assert.match(res.text, /data-bb-stitch-dashboard="51-hq-dashboard"/);
    assert.match(res.text, /data-bb-nav="desktop-sidebar"/);
    assert.match(res.text, /data-bb-nav="desktop"/);
    assert.match(res.text, /data-bb-nav="mobile-drawer"/);
    assert.doesNotMatch(res.text, /data-bb-nav="mobile-tabs"/);
    assert.match(res.text, /data-bb-nav="mobile-header"/);
    assert.match(res.text, /data-bb-page-area/);
    assert.match(res.text, /data-bb-hq-role/);
    assert.match(res.text, /role="dialog"/);
    assert.match(res.text, /aria-modal="true"/);
    assert.match(res.text, /\binert\b/);
    assert.match(res.text, /bb-hq-drawer__close/);
    assert.match(res.text, /data-bb-footer="drawer"/);
    assert.match(res.text, /powered-by-getpro|Powered by/i);
    assert.match(res.text, /aria-label="Open navigation"/);
    assert.match(res.text, /aria-label="Open navigation"/);
    assert.match(res.text, />\s*Account\s*</);
    assert.match(res.text, /tabindex="-1"/);
    assert.match(res.text, new RegExp(CHURCH_A));
    assert.match(res.text, /Headquarters A/);
    assert.match(res.text, /Campus North/);
    assert.match(res.text, /HQ Overview/i);
    assert.match(res.text, /data-bb-dash-welcome="1"/);
    assert.match(res.text, /data-bb-dash-notices="1"/);
    assert.match(res.text, /data-bb-dash-stats="1"/);
    assert.match(res.text, /data-bb-dash-branches="1"/);
    assert.match(res.text, /data-bb-dash-attention="1"/);
    assert.match(res.text, /data-bb-dash-activity="1"/);
    assert.match(res.text, /data-bb-dash-trends="1"/);
    assert.match(res.text, /data-bb-dash-quick="desktop"/);
    assert.match(res.text, /data-bb-dash-quick="mobile"/);
    assert.match(res.text, /data-bb-dash-empty="notices"/);
    assert.match(res.text, /data-bb-dash-empty="attention"/);
    assert.match(res.text, /data-bb-dash-empty="activity"/);
    assert.match(res.text, /data-bb-dash-empty="trends"/);
    assert.match(res.text, /data-bb-dash-stat="branches"[^>]*data-bb-dash-stat-available="1"|data-bb-dash-stat-available="1"[^>]*data-bb-dash-stat="branches"/);
    assert.match(res.text, /data-bb-dash-stat="members"[^>]*data-bb-dash-stat-available="0"|data-bb-dash-stat-available="0"[^>]*data-bb-dash-stat="members"/);
    assert.match(res.text, /data-bb-dash-stat="reporting"[^>]*data-bb-dash-stat-available="0"|data-bb-dash-stat-available="0"[^>]*data-bb-dash-stat="reporting"/);
    assert.match(res.text, /data-bb-component="branch-selector"/);
    assert.match(res.text, /data-bb-count="active-branches">2</);
    assert.match(res.text, /data-bb-page-area[\s\S]*data-bb-component="branch-selector"/);
    assert.match(res.text, /href="\/hq\/branches"/);
    assert.match(res.text, /href="\/hq\/registrations"/);
    assert.match(res.text, /href="\/hq\/reports"/);
    assert.match(res.text, /href="\/hq\/roles"/);
    assert.match(res.text, /href="\/hq\/members"/);
    assert.match(res.text, /href="\/hq\/announcements"/);
    assert.match(res.text, /href="\/hq\/giving"/);
    assert.match(res.text, /href="\/hq\/attendance"/);
    assert.match(res.text, /data-bb-quick-action="roles"/);
    assert.match(res.text, /action="\/hq\/logout"/);
    assert.match(res.text, /name="_csrf"/);
    assert.doesNotMatch(res.text, /Campus Old/);
    assert.doesNotMatch(res.text, new RegExp(churchA.id, "i"));
    assert.doesNotMatch(res.text, new RegExp(campusA.id, "i"));
    assert.match(res.text, /href="\/hq\/broadcasts"/);
    assert.doesNotMatch(res.text, /href="\/hq\/broadcast"/i);
    assert.doesNotMatch(
      res.text,
      /Role management|Organization templates|Quick Export|New Branch Registry/i
    );
    assert.doesNotMatch(
      res.text,
      /\bfake\b|4,?250|8\.4k|\+12%|\+4%|18\.2%|SUBMITTED THIS MONTH|Report Overdue|Data Discrepancy|Growth rate sustained|Year-to-Date Growth/i
    );
  });

  it("HQ dashboard branch selector lists only active branches", async () => {
    requireDb();
    await pool.query(
      `UPDATE blessboard.branches SET status = 'inactive'
       WHERE church_id = $1 AND branch_key = 'campus-north'`,
      [churchA.id]
    );
    const cookie = await cookieFor(users.hq);
    const res = await request(app).get("/hq").set("Host", HOST_A).set("Cookie", cookie);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-component="branch-selector"/);
    assert.match(res.text, /data-bb-count="active-branches">1</);
    assert.match(res.text, /Headquarters A/);
    assert.doesNotMatch(res.text, /Campus North/);
    assert.doesNotMatch(res.text, /data-bb-empty="branches"/);
    await pool.query(
      `UPDATE blessboard.branches SET status = 'active'
       WHERE church_id = $1 AND branch_key = 'campus-north'`,
      [churchA.id]
    );
  });

  it("account page and CSRF logout are available", async () => {
    requireDb();
    const cookie = await cookieFor(users.hq);
    const account = await request(app)
      .get("/hq/account")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(account.status, 200);
    assert.match(account.text, /data-bb-hq-account="1"/);
    assert.match(account.text, /data-bb-hq-logout="1"/);
    assert.match(account.text, /name="_csrf"/);
    assert.doesNotMatch(account.text, new RegExp(churchA.id, "i"));

    const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
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
    const csrf = extractCookie(account, CSRF_COOKIE);
    assert.ok(csrf);

    const bad = await request(app)
      .post("/hq/logout")
      .set("Host", HOST_A)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({});
    assert.equal(bad.status, 403);

    const ok = await request(app)
      .post("/hq/logout")
      .set("Host", HOST_A)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({ [CSRF_FIELD]: csrf });
    assert.equal(ok.status, 303);
    assert.equal(ok.headers.location, "/");
  });

  it("platform admin may access HQ; branch admin receives 403", async () => {
    requireDb();
    const platform = await request(app)
      .get("/hq")
      .set("Host", HOST_A)
      .set("Cookie", await cookieFor(users.platform));
    assert.equal(platform.status, 200);

    const branchOnly = await request(app)
      .get("/hq")
      .set("Host", HOST_A)
      .set("Cookie", await cookieFor(users.branch));
    assert.equal(branchOnly.status, 403);

    const branches = await request(app)
      .get("/hq/branches")
      .set("Host", HOST_A)
      .set("Cookie", await cookieFor(users.branch));
    assert.equal(branches.status, 403);
  });

  it("cross-church branch key and unknown branch are rejected", async () => {
    requireDb();
    const cookie = await cookieFor(users.hq);
    // Same key exists on church B; must not open under church A hostname.
    const cross = await request(app)
      .get("/hq/branches/hq")
      .set("Host", HOST_B)
      .set("Cookie", cookie);
    assert.equal(cross.status, 403);

    const unknown = await request(app)
      .get("/hq/branches/does-not-exist")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(unknown.status, 404);
  });

  it("inactive branch returns controlled 404", async () => {
    requireDb();
    const cookie = await cookieFor(users.hq);
    const res = await request(app)
      .get("/hq/branches/campus-old")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(res.status, 404);
    assert.match(res.text, /not available|could not be found/i);
  });

  it("branch selector link opens branch-admin only when authorized", async () => {
    requireDb();
    const cookie = await cookieFor(users.hq);
    const list = await request(app)
      .get("/hq/branches")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /data-bb-hq-branches="1"/);
    assert.match(list.text, /data-bb-stitch-branches="52-hq-branch-registry"/);
    assert.match(list.text, /data-bb-branch-list="1"/);
    assert.match(list.text, /data-bb-branch-cards="1"/);
    assert.match(list.text, /data-bb-branch-filter="1"/);
    assert.match(list.text, /data-bb-branch-selector-panel="1"/);
    assert.match(list.text, /data-bb-component="branch-selector"/);
    assert.match(list.text, /data-bb-count="active-branches">2</);
    assert.match(list.text, /href="\/hq\/branches\/campus-north"/);
    assert.match(list.text, /Headquarters A/);
    assert.match(list.text, /Campus North/);
    assert.match(list.text, /bb-hq-pill--ok/);
    assert.doesNotMatch(list.text, /[0-9a-f]{8}-[0-9a-f]{4}-/i);
    assert.doesNotMatch(list.text, /Campus Old/);
    assert.doesNotMatch(list.text, /1,?240|3,?500|42,?850|Pastor|Rev\.|Quick Export|New Branch Registry|Needs Attention|Pending Growth|Total Members/i);
    assert.match(list.text, /href="\/hq\/branches\/new"/i);
    assert.match(list.text, /data-bb-add-branch/);

    const createPage = await request(app)
      .get("/hq/branches/new")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(createPage.status, 200);
    assert.match(createPage.text, /data-bb-shell="hq-admin"/);
    assert.match(createPage.text, /data-bb-hq-branch-new="1"/);
    assert.match(createPage.text, /aria-label="Open navigation"/);
    assert.match(createPage.text, /aria-controls="bb-hq-drawer"/);
    assert.match(createPage.text, /data-bb-nav="mobile-toggle"/);
    assert.doesNotMatch(createPage.text, /data-bb-nav="mobile-tabs"/);

    const open = await request(app)
      .get("/hq/branches/campus-north")
      .set("Host", HOST_A)
      .set("Cookie", cookie)
      .redirects(0);
    assert.equal(open.status, 303);
    assert.equal(open.headers.location, "/branch-admin");

    const shell = await request(app)
      .get("/branch-admin")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(shell.status, 200);
    assert.match(shell.text, /data-bb-shell="branch-admin"/);
  });

  it("HQ branch registry search and type filter use church-scoped active list only", async () => {
    requireDb();
    const cookie = await cookieFor(users.hq);

    const byName = await request(app)
      .get("/hq/branches?q=Campus")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(byName.status, 200);
    assert.match(byName.text, /data-bb-branch-match-count="1"/);
    assert.match(byName.text, /Campus North/);
    assert.doesNotMatch(byName.text, /data-bb-branch-key="hq"/);
    assert.match(byName.text, /data-bb-component="branch-selector"/);

    const byType = await request(app)
      .get("/hq/branches?type=hq")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(byType.status, 200);
    assert.match(byType.text, /data-bb-branch-match-count="1"/);
    assert.match(byType.text, /Headquarters A/);
    assert.doesNotMatch(byType.text, /data-bb-branch-key="campus-north"/);
    assert.match(byType.text, /data-bb-branch-type="hq"[^>]*aria-current="true"|data-bb-branch-type="hq" aria-current="true"/);
    assert.match(byType.text, /bb-hq-branches-chip is-active[^>]*data-bb-branch-type="hq"|data-bb-branch-type="hq"[^>]*is-active/);

    const noResults = await request(app)
      .get("/hq/branches?q=does-not-exist-branch")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(noResults.status, 200);
    assert.match(noResults.text, /data-bb-empty="branch-no-results"/);
    assert.match(noResults.text, /data-bb-count="active-branches">2</);
    assert.doesNotMatch(noResults.text, /data-bb-branch-list="1"/);
    assert.doesNotMatch(noResults.text, /data-bb-branch-key="campus-north"/);
  });

  it("HQ list path performs no writes and never queries public.tenants", async () => {
    requireDb();
    writes = [];
    const cookie = await cookieFor(users.hq);
    writes = [];
    await request(app).get("/hq").set("Host", HOST_A).set("Cookie", cookie);
    await request(app).get("/hq/branches").set("Host", HOST_A).set("Cookie", cookie);
    const bad = writes.filter(
      (w) =>
        w === "public.tenants" ||
        (/^\s*(INSERT|DELETE)\b/i.test(w) && !/deployment_sessions/i.test(w))
    );
    // Allow session last_seen UPDATE only.
    const unexpected = bad.filter((w) => !/deployment_sessions/i.test(w));
    assert.deepEqual(unexpected, []);
  });
});
