"use strict";

/**
 * Prompt 10C: audited Platform Admin support mode (ephemeral Postgres).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const fs = require("node:fs");
const path = require("node:path");

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
  CSRF_FIELD,
  issueCsrfToken,
  CSRF_COOKIE,
} = require("../src/platform/http/v5Csrf");
const {
  DEFAULT_COOKIE: SUPPORT_COOKIE,
  hashToken,
} = require("../src/platform/http/supportContextCookie");
const {
  startHqSupport,
  startBranchSupport,
  exitSupport,
  getSupportStatus,
  SUPPORT_TTL_MS,
} = require("../src/platform/services/platformSupportModeService");
const { PLATFORM_ADMIN_PERMISSIONS } = require("../src/blessboard/rbac/legacyCompatibilityPermissions");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "sup-a.blessboard.org";
const HOST_B = "sup-b.blessboard.org";

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

function cookieHeader(parts) {
  return parts.filter(Boolean).join("; ");
}

describe("platform support mode catalogue", () => {
  it("includes support permissions without Finance/pastoral grants", () => {
    for (const key of [
      "platform.support.enter_hq",
      "platform.support.enter_branch",
      "platform.support.exit",
      "platform.support.view_status",
    ]) {
      assert.ok(PLATFORM_ADMIN_PERMISSIONS.includes(key), key);
    }
    assert.ok(!PLATFORM_ADMIN_PERMISSIONS.includes("finance.transactions.view"));
    assert.ok(!PLATFORM_ADMIN_PERMISSIONS.includes("pastoral_cases.view_assigned"));
    assert.ok(!PLATFORM_ADMIN_PERMISSIONS.includes("pastoral_cases.view_safeguarding"));
  });

  it("ships migrations 017 and 069", () => {
    assert.ok(
      fs.existsSync(
        path.join(__dirname, "../db/migrations/platform/017_create_support_contexts.sql")
      )
    );
    const mig = fs.readFileSync(
      path.join(__dirname, "../db/migrations/blessboard/069_platform_support_mode_permissions.sql"),
      "utf8"
    );
    assert.match(mig, /platform\.support\.enter_hq/);
    assert.match(mig, /platform\.support\.enter_branch/);
  });
});

describe("blessboard platform support mode HTTP", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let churchA;
  let churchB;
  let branchA;
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
        organizationKey: "sup-org-a",
        displayName: "Support Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "sup-org-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(provA.ok, true, provA.message);
      orgA = provA.records.organization;

      const provB = await provisionPlatformTenant(pool, {
        organizationKey: "sup-org-b",
        displayName: "Support Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "sup-org-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(provB.ok, true, provB.message);
      orgB = provB.records.organization;

      const churchProvA = await provisionBlessBoardChurch(pool, {
        organizationKey: "sup-org-a",
        churchKey: "sup-org-a",
        displayName: "Support Church A",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(churchProvA.ok, true, churchProvA.message);
      churchA = churchProvA.records.church;
      branchA = churchProvA.records.hqBranch;

      const campus = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-east', 'Campus East', 'branch', 'active', false, 'Africa/Lusaka', 'ZM')
         RETURNING id, branch_key, display_name`,
        [churchA.id]
      );
      campusA = campus.rows[0];

      const churchProvB = await provisionBlessBoardChurch(pool, {
        organizationKey: "sup-org-b",
        churchKey: "sup-org-b",
        displayName: "Support Church B",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(churchProvB.ok, true, churchProvB.message);
      churchB = churchProvB.records.church;

      async function makeUser(email, displayName) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        return created.user;
      }

      users.platform = await makeUser("sup-pa@example.org", "Support Platform Admin");
      users.hq = await makeUser("sup-hq@example.org", "Support HQ Admin");

      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "sup-pa@example.org",
            organizationKey: "sup-org-a",
            roleKey: "platform_admin",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "sup-hq@example.org",
            organizationKey: "sup-org-a",
            roleKey: "church_hq_admin",
            churchKey: "sup-org-a",
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

  async function sessionCookie(user, org, church) {
    const created = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId: user.id,
      organizationId: org.id,
      churchId: church.id,
      branchId: null,
    });
    assert.equal(created.ok, true, created.code);
    return {
      cookie: `${DEFAULT_V5_COOKIE}=${created.rawToken}`,
      sessionId: created.session && created.session.id,
    };
  }

  function csrfPair() {
    const token = issueCsrfToken(baseEnv());
    return {
      token,
      cookie: `${CSRF_COOKIE}=${token}`,
    };
  }

  it("starts HQ support, opens portal with banner, and audits", async () => {
    requireDb();
    const { cookie } = await sessionCookie(users.platform, orgA, churchA);
    const started = await startHqSupport(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "sup-org-a",
      reason: "Reproduce staff access configuration issue",
      env: baseEnv(),
    });
    assert.equal(started.ok, true, started.reason);
    assert.equal(started.context.supportType, "hq");
    assert.ok(started.rawToken);

    const supportCookie = `${SUPPORT_COOKIE}=${started.rawToken}`;
    const hq = await request(app)
      .get("/hq")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader([cookie, supportCookie]));
    assert.equal(hq.status, 200);
    assert.match(hq.text, /data-bb-support-banner="1"/);
    assert.match(hq.text, /Support mode:/);
    assert.match(hq.text, /Platform Administrator/);
    assert.match(hq.text, /Your actions are audited/);
    assert.match(hq.text, /Exit support mode/);
    assert.doesNotMatch(hq.text, /hide.?banner|supportBanner=0/i);

    const audits = await pool.query(
      `SELECT action_key FROM platform.audit_events
        WHERE actor_user_id = $1
          AND action_key IN ('platform.support.started', 'platform.support.hq_opened')
        ORDER BY created_at DESC LIMIT 10`,
      [users.platform.id]
    );
    const keys = new Set(audits.rows.map((r) => r.action_key));
    assert.ok(keys.has("platform.support.started"));
    assert.ok(keys.has("platform.support.hq_opened"));
  });

  it("starts branch support for a campus and opens branch portal", async () => {
    requireDb();
    const { cookie } = await sessionCookie(users.platform, orgA, churchA);
    const started = await startBranchSupport(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: orgA.id,
      branchKeyOrId: "campus-east",
      reason: "Check branch website workflow",
      env: baseEnv(),
    });
    assert.equal(started.ok, true, started.reason);
    assert.equal(started.context.supportType, "branch");
    assert.equal(String(started.context.branchId), String(campusA.id));

    const ba = await request(app)
      .get("/branch-admin")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader([cookie, `${SUPPORT_COOKIE}=${started.rawToken}`]));
    assert.equal(ba.status, 200);
    assert.match(ba.text, /data-bb-support-banner="1"/);
    assert.match(ba.text, /Campus East/);
  });

  it("requires a reason and denies wrong organisation or branch", async () => {
    requireDb();
    const noReason = await startHqSupport(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "sup-org-a",
      reason: "ab",
      env: baseEnv(),
    });
    assert.equal(noReason.ok, false);
    assert.equal(noReason.status, "invalid_input");

    const wrongOrg = await startHqSupport(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "does-not-exist-org",
      reason: "Valid reason text",
      env: baseEnv(),
    });
    assert.equal(wrongOrg.ok, false);
    assert.equal(wrongOrg.status, "not_found");

    const wrongBranch = await startBranchSupport(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "sup-org-a",
      branchKeyOrId: "missing-campus",
      reason: "Valid reason text",
      env: baseEnv(),
    });
    assert.equal(wrongBranch.ok, false);
    assert.equal(wrongBranch.status, "not_found");

    const crossOrgBranch = await startBranchSupport(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "sup-org-b",
      branchKeyOrId: campusA.id,
      reason: "Valid reason text",
      env: baseEnv(),
    });
    assert.equal(crossOrgBranch.ok, false);
    assert.equal(crossOrgBranch.status, "not_found");
  });

  it("denies Platform Admin direct HQ URL without support context", async () => {
    requireDb();
    const { cookie } = await sessionCookie(users.platform, orgA, churchA);
    const hq = await request(app).get("/hq").set("Host", HOST_A).set("Cookie", cookie);
    assert.equal(hq.status, 403);
    assert.match(hq.text, /audited support session|Support mode required/i);

    const ba = await request(app)
      .get("/branch-admin")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(ba.status, 403);
  });

  it("ordinary HQ admin still accesses portal without support cookie", async () => {
    requireDb();
    const { cookie } = await sessionCookie(users.hq, orgA, churchA);
    const hq = await request(app).get("/hq").set("Host", HOST_A).set("Cookie", cookie);
    assert.equal(hq.status, 200);
    assert.doesNotMatch(hq.text, /data-bb-support-banner="1"/);
  });

  it("mismatched support organisation is denied on the other host", async () => {
    requireDb();
    const { cookie } = await sessionCookie(users.platform, orgA, churchA);
    const started = await startHqSupport(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "sup-org-a",
      reason: "Org A support only",
      env: baseEnv(),
    });
    assert.equal(started.ok, true, started.reason);
    const other = await request(app)
      .get("/hq")
      .set("Host", HOST_B)
      .set("Cookie", cookieHeader([cookie, `${SUPPORT_COOKIE}=${started.rawToken}`]));
    assert.equal(other.status, 403);
    assert.match(other.text, /does not match/i);
  });

  it("manual exit clears support and audits ended", async () => {
    requireDb();
    const { cookie } = await sessionCookie(users.platform, orgA, churchA);
    const started = await startHqSupport(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "sup-org-a",
      reason: "Exit path verification",
      env: baseEnv(),
    });
    assert.equal(started.ok, true, started.reason);
    const csrf = csrfPair();
    const exit = await request(app)
      .post("/admin/support/exit")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader([cookie, `${SUPPORT_COOKIE}=${started.rawToken}`, csrf.cookie]))
      .type("form")
      .send({ [CSRF_FIELD]: csrf.token });
    assert.equal(exit.status, 303);

    const after = await request(app)
      .get("/hq")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader([cookie, `${SUPPORT_COOKIE}=${started.rawToken}`]));
    assert.equal(after.status, 403);

    const audits = await pool.query(
      `SELECT 1 FROM platform.audit_events
        WHERE actor_user_id = $1 AND action_key = 'platform.support.ended'
        LIMIT 1`,
      [users.platform.id]
    );
    assert.ok(audits.rows[0]);
  });

  it("expires support context on the request path without a worker", async () => {
    requireDb();
    const { cookie } = await sessionCookie(users.platform, orgA, churchA);
    const started = await startHqSupport(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "sup-org-a",
      reason: "Expiry path verification",
      env: baseEnv(),
    });
    assert.equal(started.ok, true, started.reason);
    await pool.query(
      `UPDATE platform.support_contexts
          SET started_at = now() - interval '30 minutes',
              expires_at = now() - interval '1 minute'
        WHERE id = $1`,
      [started.context.id]
    );

    const hq = await request(app)
      .get("/hq")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader([cookie, `${SUPPORT_COOKIE}=${started.rawToken}`]));
    assert.equal(hq.status, 403);

    const row = await pool.query(
      `SELECT status, end_reason FROM platform.support_contexts WHERE id = $1`,
      [started.context.id]
    );
    assert.equal(row.rows[0].status, "expired");
    assert.equal(row.rows[0].end_reason, "ttl_elapsed");

    const audits = await pool.query(
      `SELECT 1 FROM platform.audit_events
        WHERE entity_id = $1 AND action_key = 'platform.support.expired'
        LIMIT 1`,
      [started.context.id]
    );
    assert.ok(audits.rows[0]);
    assert.ok(SUPPORT_TTL_MS === 20 * 60 * 1000);
  });

  it("session isolation: PA session cookie unchanged; support uses separate token hash", async () => {
    requireDb();
    const { cookie } = await sessionCookie(users.platform, orgA, churchA);
    const started = await startHqSupport(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "sup-org-a",
      reason: "Session isolation check",
      env: baseEnv(),
    });
    assert.equal(started.ok, true, started.reason);
    assert.notEqual(started.rawToken, cookie.split("=")[1]);
    const stored = await pool.query(
      `SELECT context_token_hash FROM platform.support_contexts WHERE id = $1`,
      [started.context.id]
    );
    assert.equal(stored.rows[0].context_token_hash, hashToken(started.rawToken));
    assert.notEqual(stored.rows[0].context_token_hash, started.rawToken);

    const admin = await request(app)
      .get("/admin")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader([cookie, `${SUPPORT_COOKIE}=${started.rawToken}`]));
    assert.equal(admin.status, 200);
    assert.match(admin.text, /data-bb-shell="platform-admin"/);
  });

  it("HTTP start forms require CSRF and reason; status endpoint works", async () => {
    requireDb();
    const { cookie } = await sessionCookie(users.platform, orgA, churchA);
    const csrf = csrfPair();
    const missingReason = await request(app)
      .post("/admin/organizations/sup-org-a/support/hq")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader([cookie, csrf.cookie]))
      .type("form")
      .send({ [CSRF_FIELD]: csrf.token, reason: "" });
    assert.equal(missingReason.status, 303);
    assert.match(String(missingReason.headers.location || ""), /support_reason_required/);

    const start = await request(app)
      .post("/admin/organizations/sup-org-a/support/hq")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader([cookie, csrf.cookie]))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf.token,
        reason: "HTTP start form verification",
      });
    assert.equal(start.status, 303);
    const setCookie = [].concat(start.headers["set-cookie"] || []).join(";");
    assert.match(setCookie, new RegExp(SUPPORT_COOKIE));

    const status = await getSupportStatus(pool, {
      actorUserId: users.platform.id,
      env: baseEnv(),
    });
    assert.equal(status.ok, true);
    assert.equal(status.active, true);

    const statusPage = await request(app)
      .get("/admin/support/status")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(statusPage.status, 200);
    assert.match(statusPage.text, /data-bb-pa-support-status="1"/);
  });

  it("support mode does not auto-grant Finance, pastoral, or safeguarding", async () => {
    requireDb();
    const { cookie } = await sessionCookie(users.platform, orgA, churchA);
    const started = await startHqSupport(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "sup-org-a",
      reason: "Permission boundary verification",
      env: baseEnv(),
    });
    assert.equal(started.ok, true, started.reason);
    const jar = cookieHeader([cookie, `${SUPPORT_COOKIE}=${started.rawToken}`]);

    const giving = await request(app).get("/hq/giving").set("Host", HOST_A).set("Cookie", jar);
    assert.ok(giving.status === 403 || giving.status === 404, `giving=${giving.status}`);

    const pastoral = await request(app)
      .get("/hq/pastoral-care")
      .set("Host", HOST_A)
      .set("Cookie", jar);
    assert.ok(
      pastoral.status === 403 || pastoral.status === 404,
      `pastoral=${pastoral.status}`
    );

    const welfare = await request(app).get("/hq/welfare").set("Host", HOST_A).set("Cookie", jar);
    assert.ok(welfare.status === 403 || welfare.status === 404, `welfare=${welfare.status}`);

    const members = await request(app).get("/hq/members").set("Host", HOST_A).set("Cookie", jar);
    assert.equal(members.status, 200);
    assert.match(members.text, /data-bb-support-banner="1"/);
  });

  it("church user cannot start support mode", async () => {
    requireDb();
    const denied = await startHqSupport(pool, {
      actorUserId: users.hq.id,
      organizationKeyOrId: "sup-org-a",
      reason: "Should not work for HQ admin",
      env: baseEnv(),
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.status, "forbidden");

    const { cookie } = await sessionCookie(users.hq, orgA, churchA);
    const csrf = csrfPair();
    const http = await request(app)
      .post("/admin/organizations/sup-org-a/support/hq")
      .set("Host", "blessboard.org")
      .set("Cookie", cookieHeader([cookie, csrf.cookie]))
      .type("form")
      .send({ [CSRF_FIELD]: csrf.token, reason: "Should be denied" });
    assert.equal(http.status, 403);
  });
});
