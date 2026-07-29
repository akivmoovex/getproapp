"use strict";

/**
 * Minimal V5 branch-admin portal shell tests (ephemeral Postgres).
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
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "ba-a.blessboard.org";
const HOST_B = "ba-b.blessboard.org";
const CHURCH_A = "Branch Admin Church A";
const CHURCH_B = "Branch Admin Church B";

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

describe("blessboard branch-admin shell", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let churchA;
  let hqA;
  let campusA;
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

      const provA = await provisionPlatformTenant(pool, {
        organizationKey: "ba-a",
        displayName: "BA Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "ba-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provA.ok, true, provA.message);
      orgA = provA.records.organization;

      const provB = await provisionPlatformTenant(pool, {
        organizationKey: "ba-b",
        displayName: "BA Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "ba-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provB.ok, true, provB.message);
      orgB = provB.records.organization;

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "ba-a",
        churchKey: "ba-a",
        displayName: CHURCH_A,
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      hqA = chA.records.hqBranch;

      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "ba-b",
        churchKey: "ba-b",
        displayName: CHURCH_B,
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);

      const campus = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-b', 'Campus B', 'branch', 'active', false, 'Africa/Lusaka', 'ZM')
         RETURNING id`,
        [churchA.id]
      );
      campusA = campus.rows[0];

      async function makeUser(email, displayName) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        return created.user;
      }

      users.platform = await makeUser("ba-platform@example.org", "BA Platform");
      users.hq = await makeUser("ba-hq@example.org", "BA HQ");
      users.branch = await makeUser("ba-branch@example.org", "BA Branch");
      users.campus = await makeUser("ba-campus@example.org", "BA Campus");
      users.inactive = await makeUser("ba-inactive@example.org", "BA Inactive");
      users.suspended = await makeUser("ba-suspended@example.org", "BA Suspended");

      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "ba-platform@example.org",
            organizationKey: "ba-a",
            roleKey: "platform_admin",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "ba-hq@example.org",
            organizationKey: "ba-a",
            roleKey: "church_hq_admin",
            churchKey: "ba-a",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "ba-branch@example.org",
            organizationKey: "ba-a",
            roleKey: "branch_admin",
            churchKey: "ba-a",
            branchKey: "hq",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "ba-campus@example.org",
            organizationKey: "ba-a",
            roleKey: "branch_admin",
            churchKey: "ba-a",
            branchKey: "campus-b",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "ba-inactive@example.org",
            organizationKey: "ba-a",
            roleKey: "branch_admin",
            churchKey: "ba-a",
            branchKey: "hq",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "ba-suspended@example.org",
            organizationKey: "ba-a",
            roleKey: "branch_admin",
            churchKey: "ba-a",
            branchKey: "hq",
          })
        ).ok,
        true
      );

      await pool.query(`UPDATE blessboard.users SET status = 'inactive' WHERE id = $1`, [
        users.inactive.id,
      ]);
      await pool.query(`UPDATE blessboard.user_roles SET status = 'inactive' WHERE user_id = $1`, [
        users.suspended.id,
      ]);

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

  async function cookieFor(user, opts) {
    const created = await createV5Session(pool, {
      deploymentCode: "blessboard-org-v5",
      userId: user.id,
      organizationId: (opts && opts.organizationId) || orgA.id,
      churchId: (opts && opts.churchId) || churchA.id,
      branchId: (opts && opts.branchId) || hqA.id,
    });
    assert.equal(created.ok, true, created.code);
    return `${DEFAULT_V5_COOKIE}=${created.rawToken}`;
  }

  it("authorized branch_admin receives 200 with shell markers and no fake metrics", async () => {
    requireDb();
    const cookie = await cookieFor(users.branch);
    const res = await request(app)
      .get("/branch-admin")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-shell="branch-admin"/);
    assert.match(res.text, /data-bb-nav="desktop-sidebar"/);
    assert.match(res.text, /data-bb-nav="desktop"/);
    assert.match(res.text, /data-bb-nav="mobile-drawer"/);
    assert.doesNotMatch(res.text, /data-bb-nav="mobile-tabs"/);
    assert.match(res.text, /data-bb-nav="mobile-header"/);
    assert.match(res.text, /data-bb-stitch-shell="25-branch-admin-dashboard"/);
    assert.match(res.text, /data-bb-page-area/);
    assert.match(res.text, /data-bb-branch-role/);
    assert.match(res.text, /role="dialog"/);
    assert.match(res.text, /aria-modal="true"/);
    assert.match(res.text, /\binert\b/);
    assert.match(res.text, /bb-ba-drawer__close/);
    assert.match(res.text, /data-bb-footer="drawer"/);
    assert.match(res.text, /powered-by-getpro|Powered by/i);
    assert.match(res.text, /aria-label="Open navigation"/);
    assert.match(res.text, /aria-label="Open navigation"/);
    assert.match(res.text, />\s*Account\s*</);
    assert.match(res.text, /tabindex="-1"/);
    assert.match(res.text, /data-bb-branch-dashboard="1"/);
    assert.match(res.text, /data-bb-stitch-dashboard="25-branch-admin-dashboard"/);
    assert.match(res.text, /data-bb-dash-stats="1"/);
    assert.match(res.text, /data-bb-dash-notices="1"/);
    assert.match(res.text, /data-bb-dash-activity="1"/);
    assert.match(res.text, /data-bb-dash-quick="desktop"/);
    assert.match(res.text, /data-bb-dash-quick="mobile"/);
    assert.match(res.text, /data-bb-dash-empty="notices"/);
    assert.match(res.text, /data-bb-dash-empty="activity"/);
    assert.match(res.text, /data-bb-dash-empty="requests"/);
    assert.match(res.text, /data-bb-dash-stat-available="0"/);
    assert.match(res.text, new RegExp(CHURCH_A));
    assert.match(res.text, /HQ A/);
    assert.match(res.text, /Branch admin/);
    assert.match(res.text, /Monthly reports not available yet|Not enabled/);
    assert.match(res.text, /data-bb-empty="dashboard"/);
    assert.match(res.text, /Daily Pulse/);
    assert.match(res.text, /Quick actions/i);
    assert.match(res.text, /Recent activity/i);
    assert.match(res.text, /href="\/branch-admin\/registrations"/);
    assert.match(res.text, /href="\/branch-admin\/members"/);
    assert.match(res.text, /href="\/branch-admin\/announcements\/new"/);
    assert.match(res.text, /href="\/branch-admin\/attendance"/);
    assert.match(res.text, /href="\/branch-admin\/requests"/);
    assert.match(res.text, /href="\/branch-admin\/content\/events"/);
    assert.match(res.text, /href="\/branch-admin\/giving"/);
    assert.match(res.text, /data-bb-module="members"[^>]*data-bb-module-enabled="1"|data-bb-module-enabled="1"[^>]*data-bb-module="members"/);
    assert.match(res.text, /data-bb-module="reports"[^>]*data-bb-module-enabled="0"|data-bb-module-enabled="0"[^>]*data-bb-module="reports"/);
    assert.doesNotMatch(res.text, /\b\d+\s+members\b/i);
    assert.doesNotMatch(
      res.text,
      /1,248|1,284|Ministry Budget|USD 42,000|72% Utilized|4 Urgent|Assign Deacon|\+4\.2%|\+12% vs last month|Luka Mwamba|Banda Family/i
    );
    assert.doesNotMatch(res.text, /Open Roadmap/i);
    assert.doesNotMatch(res.text, new RegExp(churchA.id, "i"));
    assert.doesNotMatch(res.text, new RegExp(hqA.id, "i"));
    assert.doesNotMatch(res.text, /branch_admin/);
    assert.match(res.text, /action="\/branch-admin\/logout"/);
    assert.match(res.text, /name="_csrf"/);
  });

  it("church_hq_admin receives 200 for own church branch", async () => {
    requireDb();
    const cookie = await cookieFor(users.hq);
    const res = await request(app)
      .get("/branch-admin")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(res.status, 200);
    assert.match(res.text, /Church HQ admin/);
  });

  it("platform_admin receives 200", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const res = await request(app)
      .get("/branch-admin")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(res.status, 200);
    assert.match(res.text, /Platform admin/);
  });

  it("wrong branch returns 403", async () => {
    requireDb();
    const cookie = await cookieFor(users.campus, { branchId: campusA.id });
    const res = await request(app)
      .get("/branch-admin")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(res.status, 403);
  });

  it("wrong church returns 403", async () => {
    requireDb();
    const cookie = await cookieFor(users.hq);
    const res = await request(app)
      .get("/branch-admin")
      .set("Host", HOST_B)
      .set("Cookie", cookie);
    assert.equal(res.status, 403);
  });

  it("unauthenticated HTML redirects to tenant /login", async () => {
    requireDb();
    const res = await request(app).get("/branch-admin").set("Host", HOST_A).set("Accept", "text/html");
    assert.equal(res.status, 303);
    const loc = String(res.headers.location || "");
    assert.ok(
      loc === "/login?next=/branch-admin" || loc === "/login?next=%2Fbranch-admin",
      `unexpected redirect ${loc}`
    );
  });

  it("unauthenticated non-HTML receives 401", async () => {
    requireDb();
    const res = await request(app)
      .get("/branch-admin")
      .set("Host", HOST_A)
      .set("Accept", "text/plain");
    assert.equal(res.status, 401);
    assert.match(res.text, /Sign-in is required/i);
  });

  it("inactive role and inactive user are rejected", async () => {
    requireDb();
    const suspended = await request(app)
      .get("/branch-admin")
      .set("Host", HOST_A)
      .set("Cookie", await cookieFor(users.suspended));
    assert.equal(suspended.status, 403);

    const created = await createV5Session(pool, {
      deploymentCode: "blessboard-org-v5",
      userId: users.inactive.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: hqA.id,
    });
    const inactive = await request(app)
      .get("/branch-admin")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${created.rawToken}`);
    assert.equal(inactive.status, 401);
  });

  it("inactive tenant and unresolved hostname are rejected", async () => {
    requireDb();
    const cookie = await cookieFor(users.branch);
    await pool.query(`UPDATE platform.domains SET status = 'inactive' WHERE hostname = $1`, [HOST_A]);
    try {
      const inactiveTenant = await request(app)
        .get("/branch-admin")
        .set("Host", HOST_A)
        .set("Cookie", cookie);
      assert.equal(inactiveTenant.status, 403);
    } finally {
      await pool.query(`UPDATE platform.domains SET status = 'active' WHERE hostname = $1`, [HOST_A]);
    }

    const unknown = await request(app)
      .get("/branch-admin")
      .set("Host", "unknown-ba.blessboard.org")
      .set("Cookie", cookie);
    assert.equal(unknown.status, 403);
  });

  it("account page and logout POST require CSRF; logout returns to tenant /login", async () => {
    requireDb();
    const cookie = await cookieFor(users.branch);
    const account = await request(app)
      .get("/branch-admin/account")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(account.status, 200);
    assert.match(account.text, /data-bb-branch-account="1"/);
    assert.match(account.text, /data-bb-stitch-account="missing"/);
    assert.match(account.text, /data-bb-account-identity="1"/);
    assert.match(account.text, /data-bb-account-context="1"/);
    assert.match(account.text, /data-bb-account-info="1"/);
    assert.match(account.text, /data-bb-account-role="1"/);
    assert.match(account.text, /BA Branch/);
    assert.match(account.text, /Branch admin/);
    assert.match(account.text, new RegExp(CHURCH_A));
    assert.match(account.text, /HQ A/);
    assert.match(account.text, /Display name/);
    assert.match(account.text, /Account information/);
    assert.match(account.text, /method="post" action="\/branch-admin\/logout"/);
    assert.match(account.text, /data-bb-account-logout="1"/);
    assert.match(account.text, /name="_csrf"/);
    assert.doesNotMatch(account.text, /change password|avatar upload|notification|billing|edit profile/i);
    assert.doesNotMatch(account.text, new RegExp(users.branch.id, "i"));
    assert.doesNotMatch(account.text, new RegExp(churchA.id, "i"));
    assert.doesNotMatch(account.text, new RegExp(hqA.id, "i"));
    assert.doesNotMatch(account.text, /session|csrfToken|email_normalized|user_status/i);

    const csrf = extractCookie(account, CSRF_COOKIE);
    const match = account.text.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(csrf && match);

    const noCsrf = await request(app)
      .post("/branch-admin/logout")
      .set("Host", HOST_A)
      .set("Cookie", cookie)
      .type("form")
      .send({});
    assert.equal(noCsrf.status, 403);

    const logout = await request(app)
      .post("/branch-admin/logout")
      .set("Host", HOST_A)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({ [CSRF_FIELD]: match[1] });
    assert.equal(logout.status, 303);
    assert.equal(logout.headers.location, "/login");
  });

  it("tenant landing remains public; apex auth remains functional; cookie host-only", async () => {
    requireDb();
    const landing = await request(app).get("/").set("Host", HOST_A);
    assert.equal(landing.status, 200);
    assert.match(landing.text, new RegExp(CHURCH_A));
    assert.doesNotMatch(landing.text, /branch-admin/);

    const login = await request(app).get("/login").set("Host", "blessboard.org");
    assert.equal(login.status, 200);
    assert.match(login.text, /Sign in/);
    const csrfLine = (Array.isArray(login.headers["set-cookie"])
      ? login.headers["set-cookie"]
      : [login.headers["set-cookie"]]
    ).find((l) => String(l).startsWith(`${CSRF_COOKIE}=`));
    assert.ok(csrfLine);
    assert.doesNotMatch(String(csrfLine), /Domain=/i);
  });

  it("does not trust branch IDs from query strings", async () => {
    requireDb();
    const cookie = await cookieFor(users.campus, { branchId: campusA.id });
    const res = await request(app)
      .get(`/branch-admin?branchId=${campusA.id}`)
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(res.status, 403);
  });
});
