"use strict";

/**
 * BlessBoard V5 tenant authorization — unit + HTTP (ephemeral Postgres).
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
const {
  authorizeBlessBoardTenantAccess,
  evaluateRoleGrants,
  uuidEqual,
  STATUS,
} = require("../src/blessboard/services/authorizeBlessBoardTenantAccess");
const {
  buildBlessBoardTenantContext,
} = require("../src/blessboard/http/buildBlessBoardTenantContext");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const TENANT_A_HOST = "authz-a.blessboard.org";
const TENANT_B_HOST = "authz-b.blessboard.org";
const CHURCH_A_NAME = "Authz Church A";
const CHURCH_B_NAME = "Authz Church B";

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

describe("authorizeBlessBoardTenantAccess unit", () => {
  it("compares UUIDs case-insensitively and rejects nulls", () => {
    assert.equal(
      uuidEqual("54F03E19-8CCB-4EC0-8348-44E0B11F1481", "54f03e19-8ccb-4ec0-8348-44e0b11f1481"),
      true
    );
    assert.equal(uuidEqual("a", "b"), false);
    assert.equal(uuidEqual(null, "a"), false);
  });

  it("role grants use UUID scopes only (not display names / slugs)", () => {
    const org = "11111111-1111-1111-1111-111111111111";
    const church = "22222222-2222-2222-2222-222222222222";
    const branch = "33333333-3333-3333-3333-333333333333";
    const otherChurch = "44444444-4444-4444-4444-444444444444";

    const platform = evaluateRoleGrants(
      [{ roleKey: "platform_admin", organizationId: org, churchId: null, branchId: null }],
      { organizationId: "99999999-9999-9999-9999-999999999999", churchId: church, branchId: branch },
      { branchBelongsToChurch: true }
    );
    assert.equal(platform.length, 1);

    const hqOk = evaluateRoleGrants(
      [{ roleKey: "church_hq_admin", organizationId: org, churchId: church, branchId: null }],
      { organizationId: org, churchId: church, branchId: branch },
      { branchBelongsToChurch: true }
    );
    assert.equal(hqOk.length, 1);

    const hqOther = evaluateRoleGrants(
      [{ roleKey: "church_hq_admin", organizationId: org, churchId: church, branchId: null }],
      { organizationId: org, churchId: otherChurch, branchId: branch },
      { branchBelongsToChurch: true }
    );
    assert.equal(hqOther.length, 0);

    const branchOk = evaluateRoleGrants(
      [{ roleKey: "branch_admin", organizationId: org, churchId: church, branchId: branch }],
      { organizationId: org, churchId: church, branchId: branch },
      { branchBelongsToChurch: true }
    );
    assert.equal(branchOk.length, 1);

    const branchOther = evaluateRoleGrants(
      [{ roleKey: "branch_admin", organizationId: org, churchId: church, branchId: branch }],
      {
        organizationId: org,
        churchId: church,
        branchId: "55555555-5555-5555-5555-555555555555",
      },
      { branchBelongsToChurch: true }
    );
    assert.equal(branchOther.length, 0);

    // Display-name-like strings must not authorize.
    const byName = evaluateRoleGrants(
      [
        {
          roleKey: "church_hq_admin",
          organizationId: "demo-church",
          churchId: "Demo Church",
          branchId: null,
        },
      ],
      { organizationId: org, churchId: church, branchId: branch },
      { branchBelongsToChurch: true }
    );
    assert.equal(byName.length, 0);
  });

  it("denies when tenant unresolved without querying roles", async () => {
    let queried = false;
    const db = {
      query: async () => {
        queried = true;
        return { rows: [] };
      },
    };
    const result = await authorizeBlessBoardTenantAccess(db, {
      userId: "11111111-1111-1111-1111-111111111111",
      tenant: { resolved: false },
    });
    assert.equal(result.status, STATUS.TENANT_UNRESOLVED);
    assert.equal(queried, false);
  });
});

describe("blessboard tenant authorization http", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let churchA;
  let churchB;
  let hqBranchA;
  let campusBranchA;
  let writes = [];
  let users = {};

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      const originalQuery = pool.query.bind(pool);
      pool.query = (text, params) => {
        const sql = String(text || "").trim();
        if (/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i.test(sql)) {
          writes.push(sql.slice(0, 80));
        }
        if (/\bpublic\.tenants\b/i.test(sql)) {
          writes.push("LEGACY_PUBLIC_TENANTS");
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
        organizationKey: "authz-a",
        displayName: "Authz Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "authz-a",
        hostname: TENANT_A_HOST,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provA.ok, true, provA.message);
      orgA = provA.records.organization;

      const provB = await provisionPlatformTenant(pool, {
        organizationKey: "authz-b",
        displayName: "Authz Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "authz-b",
        hostname: TENANT_B_HOST,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provB.ok, true, provB.message);
      orgB = provB.records.organization;

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "authz-a",
        churchKey: "authz-a",
        displayName: CHURCH_A_NAME,
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      hqBranchA = chA.records.hqBranch;

      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "authz-b",
        churchKey: "authz-b",
        displayName: CHURCH_B_NAME,
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);
      churchB = chB.records.church;

      const campus = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-b', 'Campus B', 'branch', 'active', false, 'Africa/Lusaka', 'ZM')
         RETURNING id, branch_key, display_name`,
        [churchA.id]
      );
      campusBranchA = campus.rows[0];

      async function makeUser(email, displayName) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        return created.user;
      }

      users.platform = await makeUser("platform@example.org", "Platform Admin");
      users.hq = await makeUser("hq@example.org", "HQ Admin");
      users.branch = await makeUser("branch@example.org", "Branch Admin");
      users.campus = await makeUser("campus@example.org", "Campus Admin");
      users.inactive = await makeUser("inactive@example.org", "Inactive User");
      users.suspendedRole = await makeUser("suspended-role@example.org", "Suspended Role User");

      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "platform@example.org",
            organizationKey: "authz-a",
            roleKey: "platform_admin",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "hq@example.org",
            organizationKey: "authz-a",
            roleKey: "church_hq_admin",
            churchKey: "authz-a",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "branch@example.org",
            organizationKey: "authz-a",
            roleKey: "branch_admin",
            churchKey: "authz-a",
            branchKey: "hq",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "campus@example.org",
            organizationKey: "authz-a",
            roleKey: "branch_admin",
            churchKey: "authz-a",
            branchKey: "campus-b",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "inactive@example.org",
            organizationKey: "authz-a",
            roleKey: "church_hq_admin",
            churchKey: "authz-a",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "suspended-role@example.org",
            organizationKey: "authz-a",
            roleKey: "church_hq_admin",
            churchKey: "authz-a",
          })
        ).ok,
        true
      );

      await pool.query(`UPDATE blessboard.users SET status = 'inactive' WHERE email_normalized = $1`, [
        "inactive@example.org",
      ]);
      await pool.query(
        `UPDATE blessboard.user_roles SET status = 'suspended'
           WHERE user_id = $1`,
        [users.suspendedRole.id]
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

  async function sessionCookieFor(user, opts) {
    const created = await createV5Session(pool, {
      deploymentCode: (opts && opts.deploymentCode) || "blessboard-org-v5",
      userId: user.id,
      organizationId: (opts && opts.organizationId) || orgA.id,
      churchId: (opts && opts.churchId) || churchA.id,
      branchId: (opts && opts.branchId) || hqBranchA.id,
    });
    assert.equal(created.ok, true, created.code);
    return `${DEFAULT_V5_COOKIE}=${created.rawToken}`;
  }

  it("platform_admin may access any active resolved tenant on this deployment", async () => {
    requireDb();
    const cookie = await sessionCookieFor(users.platform);
    const a = await request(app)
      .get("/tenant-access-check")
      .set("Host", TENANT_A_HOST)
      .set("Cookie", cookie)
      .set("Accept", "text/html");
    assert.equal(a.status, 200);
    assert.match(a.text, /Authenticated<\/dt><dd>yes/);
    assert.match(a.text, /Authorized<\/dt><dd>yes/);
    assert.match(a.text, /Platform admin/);
    assert.match(a.text, new RegExp(CHURCH_A_NAME));
    assert.doesNotMatch(a.text, new RegExp(orgA.id, "i"));
    assert.doesNotMatch(a.text, new RegExp(churchA.id, "i"));

    const b = await request(app)
      .get("/tenant-access-check")
      .set("Host", TENANT_B_HOST)
      .set("Cookie", cookie)
      .set("Accept", "text/html");
    assert.equal(b.status, 200);
    assert.match(b.text, new RegExp(CHURCH_B_NAME));
  });

  it("church_hq_admin may access own church and branches; rejected for another church", async () => {
    requireDb();
    const cookie = await sessionCookieFor(users.hq);
    const own = await request(app)
      .get("/tenant-access-check")
      .set("Host", TENANT_A_HOST)
      .set("Cookie", cookie);
    assert.equal(own.status, 200);
    assert.match(own.text, /Church HQ admin/);

    const other = await request(app)
      .get("/tenant-access-check")
      .set("Host", TENANT_B_HOST)
      .set("Cookie", cookie);
    assert.equal(other.status, 403);
    assert.doesNotMatch(other.text, /authz-b|Church HQ admin|unauthorized_role/i);
  });

  it("branch_admin may access assigned branch; rejected for another branch", async () => {
    requireDb();
    const primaryCookie = await sessionCookieFor(users.branch);
    const primary = await request(app)
      .get("/tenant-access-check")
      .set("Host", TENANT_A_HOST)
      .set("Cookie", primaryCookie);
    assert.equal(primary.status, 200);
    assert.match(primary.text, /Branch admin/);

    const campusCookie = await sessionCookieFor(users.campus, { branchId: campusBranchA.id });
    const campusOnPrimary = await request(app)
      .get("/tenant-access-check")
      .set("Host", TENANT_A_HOST)
      .set("Cookie", campusCookie);
    assert.equal(campusOnPrimary.status, 403);
  });

  it("inactive user is rejected", async () => {
    requireDb();
    // Session create still inserts; loader/read must reject inactive user as unauthenticated.
    const created = await createV5Session(pool, {
      deploymentCode: "blessboard-org-v5",
      userId: users.inactive.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: hqBranchA.id,
    });
    assert.equal(created.ok, true);
    const res = await request(app)
      .get("/tenant-access-check")
      .set("Host", TENANT_A_HOST)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${created.rawToken}`);
    assert.equal(res.status, 401);
  });

  it("inactive/suspended role is rejected", async () => {
    requireDb();
    const cookie = await sessionCookieFor(users.suspendedRole);
    const res = await request(app)
      .get("/tenant-access-check")
      .set("Host", TENANT_A_HOST)
      .set("Cookie", cookie);
    assert.equal(res.status, 403);
  });

  it("no session returns 401", async () => {
    requireDb();
    const res = await request(app).get("/tenant-access-check").set("Host", TENANT_A_HOST);
    assert.equal(res.status, 401);
  });

  it("wrong deployment session is rejected", async () => {
    requireDb();
    await pool.query(
      `INSERT INTO platform.deployments (
         deployment_code, application_code, release_version, canonical_domain,
         environment_code, status, jobs_enabled, database_access_mode, session_cookie_name
       ) VALUES (
         'other-authz-v5', 'blessboard', '0.0.0', 'other-authz.example.test',
         'testing', 'active', false, 'read_write', 'other_authz_v5_sid'
       )
       ON CONFLICT (deployment_code) DO NOTHING`
    );
    const created = await createV5Session(pool, {
      deploymentCode: "other-authz-v5",
      userId: users.hq.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: hqBranchA.id,
    });
    assert.equal(created.ok, true);
    const res = await request(app)
      .get("/tenant-access-check")
      .set("Host", TENANT_A_HOST)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${created.rawToken}`);
    assert.equal(res.status, 401);
  });

  it("unresolved tenant is rejected safely", async () => {
    requireDb();
    const cookie = await sessionCookieFor(users.platform);
    const res = await request(app)
      .get("/tenant-access-check")
      .set("Host", "unknown-authz.blessboard.org")
      .set("Cookie", cookie);
    assert.equal(res.status, 403);
    assert.doesNotMatch(res.text, /unknown_domain|tenant_unresolved/i);
  });

  it("authorization database failure returns controlled 503", async () => {
    requireDb();
    const brokenPool = {
      query: async (text, params) => {
        if (/blessboard\.user_roles|blessboard\.users/i.test(String(text))) {
          throw new Error("simulated authz failure");
        }
        return pool.query(text, params);
      },
    };
    const brokenApp = createV5FoundationApp({
      getPool: () => brokenPool,
      env: baseEnv(),
    });
    const cookie = await sessionCookieFor(users.hq);
    const res = await request(brokenApp)
      .get("/tenant-access-check")
      .set("Host", TENANT_A_HOST)
      .set("Cookie", cookie);
    assert.equal(res.status, 503);
    assert.doesNotMatch(res.text, /simulated authz|lookup_error/i);
  });

  it("public tenant landing remains public without session", async () => {
    requireDb();
    const res = await request(app).get("/").set("Host", TENANT_A_HOST);
    assert.equal(res.status, 200);
    assert.match(res.text, new RegExp(CHURCH_A_NAME));
    assert.doesNotMatch(res.text, /tenant-access-check/);
  });

  it("health remains 200 and cookie remains host-only", async () => {
    requireDb();
    const health = await request(app).get("/healthz").set("Host", TENANT_A_HOST);
    assert.equal(health.status, 200);

    const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
    const login = await request(app).get("/login").set("Host", "blessboard.org");
    assert.equal(login.status, 200);
    const raw = login.headers["set-cookie"];
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const csrfLine = list.find((l) => String(l).startsWith(`${CSRF_COOKIE}=`));
    assert.ok(csrfLine);
    assert.doesNotMatch(String(csrfLine), /Domain=/i);
    const csrfVal = String(csrfLine).split(";")[0].slice(CSRF_COOKIE.length + 1);
    const csrfMatch = login.text.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(csrfMatch);

    const post = await request(app)
      .post("/login")
      .set("Host", "blessboard.org")
      .set("Cookie", `${CSRF_COOKIE}=${csrfVal}`)
      .type("form")
      .send({
        email: "hq@example.org",
        password: PASSWORD,
        [CSRF_FIELD]: csrfMatch[1],
      });
    assert.equal(post.status, 303);
    const sidLine = (Array.isArray(post.headers["set-cookie"])
      ? post.headers["set-cookie"]
      : [post.headers["set-cookie"]]
    ).find((l) => String(l).startsWith(`${DEFAULT_V5_COOKIE}=`));
    assert.ok(sidLine);
    assert.doesNotMatch(String(sidLine), /Domain=/i);
  });

  it("authorization path performs no writes and never queries public.tenants", async () => {
    requireDb();
    writes = [];
    const cookie = await sessionCookieFor(users.hq);
    // createV5Session writes — clear after session create
    writes = [];
    await request(app)
      .get("/tenant-access-check")
      .set("Host", TENANT_A_HOST)
      .set("Cookie", cookie);
    await request(app).get("/").set("Host", TENANT_A_HOST);
    const bad = writes.filter(
      (w) =>
        w === "LEGACY_PUBLIC_TENANTS" ||
        /^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i.test(w)
    );
    // last_seen touch on session is an UPDATE — allow only deployment_sessions last_seen
    const unexpected = bad.filter((w) => !/deployment_sessions/i.test(w) || /INSERT/i.test(w));
    assert.deepEqual(unexpected, []);
  });

  it("service builds authorization context without raw rows", async () => {
    requireDb();
    const tenant = buildBlessBoardTenantContext({
      organization: { id: orgA.id, key: "authz-a" },
      church: {
        id: churchA.id,
        churchKey: "authz-a",
        displayName: CHURCH_A_NAME,
        dataEnvironment: "testing",
      },
      hqBranch: { id: hqBranchA.id, branchKey: "hq", displayName: "HQ A" },
      primaryBranch: { id: hqBranchA.id, branchKey: "hq", displayName: "HQ A" },
    });
    const result = await authorizeBlessBoardTenantAccess(pool, {
      userId: users.hq.id,
      tenant,
      branchId: hqBranchA.id,
    });
    assert.equal(result.ok, true);
    assert.equal(result.context.authorized, true);
    assert.equal(result.context.churchId, churchA.id);
    assert.ok(Array.isArray(result.context.effectiveRoles));
    assert.equal(result.context.effectiveRoles[0].roleKey, "church_hq_admin");
    assert.equal(Object.prototype.hasOwnProperty.call(result.context, "password_hash"), false);
  });
});
