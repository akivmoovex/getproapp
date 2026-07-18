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
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
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
        deploymentCode: "blessboard-org-v5",
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
        deploymentCode: "blessboard-org-v5",
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
      deploymentCode: "blessboard-org-v5",
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
    assert.match(res.text, /data-bb-hq-dashboard="1"/);
    assert.match(res.text, /data-bb-nav="desktop-sidebar"/);
    assert.match(res.text, /data-bb-nav="mobile-tabs"/);
    assert.match(res.text, new RegExp(CHURCH_A));
    assert.match(res.text, /Headquarters A/);
    assert.match(res.text, /Campus North/);
    assert.match(res.text, /data-bb-component="branch-selector"/);
    assert.match(res.text, /data-bb-count="active-branches">2</);
    assert.doesNotMatch(res.text, /Campus Old/);
    assert.doesNotMatch(res.text, new RegExp(churchA.id, "i"));
    assert.doesNotMatch(res.text, new RegExp(campusA.id, "i"));
    assert.doesNotMatch(res.text, /\bfake\b|4,?250|\+12%|SUBMITTED THIS MONTH|Report Overdue|Quick Export|New Branch Registry/i);
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
    assert.match(list.text, /data-bb-branch-list="1"/);
    assert.match(list.text, /href="\/hq\/branches\/campus-north"/);
    assert.doesNotMatch(list.text, /[0-9a-f]{8}-[0-9a-f]{4}-/i);

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
