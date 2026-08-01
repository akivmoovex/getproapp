"use strict";

/**
 * BlessBoard V5 test-user seed — dry-run, safety, idempotency, access matrix.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { spawnSync } = require("child_process");
const bcrypt = require("bcryptjs");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  seedBlessBoardTestUsers,
  STATUS,
  TEST_PASSWORD,
  PRODUCTION_OVERRIDE_ENV,
  USER_ROLE_KEYS,
  CANONICAL_PERSONA_KEYS,
  FIXTURE,
  PERSONAS,
  discoverCanonicalRoles,
  evaluateTestUserEnvironment,
  outputContainsSecrets,
} = require("../src/blessboard/services/seedBlessBoardTestUsers");
const {
  evaluateRoleGrants,
} = require("../src/blessboard/services/authorizeBlessBoardTenantAccess");
const authRepo = require("../src/blessboard/repositories/blessBoardAuthRepository");
const { parseWriteMode } = require("../db/scripts/lib/provisionCliSafety");

const ROOT = path.resolve(__dirname, "..");
const IDENTITY_KEY = "blessboard-platform-v5";
const UNRELATED_EMAIL = "unrelated-real-user@example.org";
const UNRELATED_PASSWORD = "unrelated-password-keep-me";
const TENANT_HOST = FIXTURE.hostname;
const APEX_HOST = "blessboard.org";

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

describe("blessboard test-users seed helpers", () => {
  it("discovers only implemented V5 roles / personas", () => {
    const d = discoverCanonicalRoles();
    assert.deepEqual(d.userRoleKeys, ["platform_admin", "church_hq_admin", "branch_admin"]);
    assert.ok(d.personas.includes("member"));
    assert.ok(d.unsupportedLoginRoles.some((r) => r.key === "ministry_leader"));
    assert.deepEqual(USER_ROLE_KEYS, d.userRoleKeys);
    assert.ok(CANONICAL_PERSONA_KEYS.includes("platform_admin"));
  });

  it("default CLI mode is dry-run; --confirm required for writes", () => {
    assert.equal(parseWriteMode([]).dryRun, true);
    assert.equal(parseWriteMode(["--confirm"]).dryRun, false);
    assert.equal(parseWriteMode(["--dry-run", "--confirm"]).dryRun, true);
  });

  it("refuses production without explicit override", () => {
    const refused = evaluateTestUserEnvironment({ NODE_ENV: "production" });
    assert.equal(refused.ok, false);
    assert.equal(refused.status, STATUS.REFUSED_PRODUCTION);

    // Hosted override flag is intentionally not honored.
    const stillRefused = evaluateTestUserEnvironment({
      NODE_ENV: "production",
      [PRODUCTION_OVERRIDE_ENV]: "true",
    });
    assert.equal(stillRefused.ok, false);
    assert.equal(stillRefused.status, STATUS.REFUSED_PRODUCTION);
  });

  it("rejects BLESSBOARD_ALLOW_TEST_USERS_IN_PRODUCTION even outside production NODE_ENV", () => {
    const refused = evaluateTestUserEnvironment({
      NODE_ENV: "test",
      [PRODUCTION_OVERRIDE_ENV]: "true",
    });
    assert.equal(refused.ok, false);
    assert.equal(refused.message, "refused_production_override");
  });

  it("requires a non-production signal", () => {
    const refused = evaluateTestUserEnvironment({ NODE_ENV: "development" });
    assert.equal(refused.ok, false);
    assert.equal(refused.status, STATUS.REFUSED_ENVIRONMENT);

    assert.equal(evaluateTestUserEnvironment({ NODE_ENV: "test" }).ok, true);
    assert.equal(
      evaluateTestUserEnvironment({ NODE_ENV: "development", DEPLOYMENT_ENV: "testing" }).ok,
      true
    );
    assert.equal(
      evaluateTestUserEnvironment({
        NODE_ENV: "development",
        BLESSBOARD_ALLOW_TEST_USERS: "true",
      }).ok,
      true
    );
  });

  it("outputContainsSecrets catches hashes and urls", () => {
    assert.equal(outputContainsSecrets("postgresql://x:y@h/db"), true);
    // 60-char bcrypt modular crypt sample (not a real hash of a known password)
    assert.equal(
      outputContainsSecrets("$2a$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZabcde"),
      true
    );
    assert.equal(outputContainsSecrets("roles: platform_admin"), false);
  });
});

describe("blessboard test-users seed service + access", () => {
  let pool;
  let databaseUrl;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let org;
  let church;
  let hqBranch;
  let campusBranch;
  let unrelatedBefore;

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

      const unrelated = await createBlessBoardUser(pool, {
        email: UNRELATED_EMAIL,
        displayName: "Unrelated Real User",
        password: UNRELATED_PASSWORD,
      });
      assert.equal(unrelated.ok, true, unrelated.message);
      unrelatedBefore = await authRepo.findUserByEmail(pool, UNRELATED_EMAIL);

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

  async function cookieFor(user, scopes = {}) {
    const created = await createV5Session(pool, {
      deploymentCode: "blessboard-org-v5",
      userId: user.id,
      organizationId: scopes.organizationId || org.id,
      churchId: scopes.churchId != null ? scopes.churchId : church.id,
      branchId: scopes.branchId !== undefined ? scopes.branchId : null,
    });
    assert.equal(created.ok, true, created.code);
    return `${DEFAULT_V5_COOKIE}=${created.rawToken}`;
  }

  it("default dry-run performs no writes", async () => {
    requireDb();
    const beforeOrgs = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = $1`,
      [FIXTURE.organizationKey]
    );
    const dry = await seedBlessBoardTestUsers(pool, {
      dryRun: true,
      env: { NODE_ENV: "test" },
    });
    assert.equal(dry.ok, true);
    assert.equal(dry.status, STATUS.DRY_RUN);
    assert.equal(dry.preview.writes, false);
    assert.ok(dry.discovered.userRoleKeys.length >= 3);
    const afterOrgs = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = $1`,
      [FIXTURE.organizationKey]
    );
    assert.equal(afterOrgs.rows[0].n, beforeOrgs.rows[0].n);
    assert.equal(dry.result, null);
  });

  it("--confirm seeds every canonical persona exactly once", async () => {
    requireDb();
    const first = await seedBlessBoardTestUsers(pool, {
      dryRun: false,
      env: { NODE_ENV: "test" },
    });
    assert.equal(first.ok, true, first.message || first.detail);
    assert.equal(first.status, STATUS.OK);

    org = (
      await pool.query(`SELECT * FROM platform.organizations WHERE organization_key = $1`, [
        FIXTURE.organizationKey,
      ])
    ).rows[0];
    church = (
      await pool.query(`SELECT * FROM blessboard.churches WHERE church_key = $1`, [
        FIXTURE.churchKey,
      ])
    ).rows[0];
    hqBranch = (
      await pool.query(
        `SELECT * FROM blessboard.branches WHERE church_id = $1 AND branch_key = $2`,
        [church.id, FIXTURE.hqBranchKey]
      )
    ).rows[0];
    campusBranch = (
      await pool.query(
        `SELECT * FROM blessboard.branches WHERE church_id = $1 AND branch_key = $2`,
        [church.id, FIXTURE.campusBranchKey]
      )
    ).rows[0];

    assert.ok(org);
    assert.equal(org.data_environment, "testing");
    assert.equal(org.status, "active");
    assert.ok(hqBranch);
    assert.equal(hqBranch.branch_type, "hq");
    assert.ok(campusBranch);
    assert.equal(campusBranch.branch_type, "branch");
    assert.equal(campusBranch.status, "active");

    for (const persona of PERSONAS) {
      const user = await authRepo.findUserByEmail(pool, persona.email);
      assert.ok(user, `missing ${persona.email}`);
      assert.equal(user.status, "active");
      assert.ok(user.password_hash.startsWith("$2"));
      assert.ok(await bcrypt.compare(TEST_PASSWORD, user.password_hash));
      assert.notEqual(user.password_hash, TEST_PASSWORD);
      assert.doesNotMatch(user.password_hash, new RegExp(TEST_PASSWORD));
    }

    for (const roleKey of USER_ROLE_KEYS) {
      const persona = PERSONAS.find((p) => p.roleKey === roleKey);
      const user = await authRepo.findUserByEmail(pool, persona.email);
      const roles = await authRepo.listActiveRolesForUser(pool, user.id);
      const match = roles.filter((r) => r.role_key === roleKey);
      assert.equal(match.length, 1, `expected one ${roleKey}`);
    }

    const memberUser = await authRepo.findUserByEmail(pool, "member@example.test");
    const member = await pool.query(
      `SELECT id, status FROM blessboard.members WHERE user_id = $1 AND church_id = $2`,
      [memberUser.id, church.id]
    );
    assert.equal(member.rows[0].status, "active");
    const membership = await pool.query(
      `SELECT membership_status, branch_id FROM blessboard.member_branch_memberships
        WHERE member_id = $1 AND branch_id = $2`,
      [member.rows[0].id, hqBranch.id]
    );
    assert.equal(membership.rows[0].membership_status, "active");

    assert.ok(first.result.loginTable.every((r) => r.temporaryPassword === TEST_PASSWORD));
    assert.ok(!outputContainsSecrets(JSON.stringify(first.discovered)));
  });

  it("second seed creates no duplicates", async () => {
    requireDb();
    const usersBefore = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.users
        WHERE email_normalized LIKE '%@example.test'`
    );
    const rolesBefore = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.user_roles ur
         JOIN blessboard.users u ON u.id = ur.user_id
        WHERE u.email_normalized LIKE '%@example.test'`
    );
    const second = await seedBlessBoardTestUsers(pool, {
      dryRun: false,
      env: { NODE_ENV: "test" },
    });
    assert.equal(second.ok, true, second.message);
    const usersAfter = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.users
        WHERE email_normalized LIKE '%@example.test'`
    );
    const rolesAfter = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.user_roles ur
         JOIN blessboard.users u ON u.id = ur.user_id
        WHERE u.email_normalized LIKE '%@example.test'`
    );
    assert.equal(usersAfter.rows[0].n, usersBefore.rows[0].n);
    assert.equal(rolesAfter.rows[0].n, rolesBefore.rows[0].n);
    assert.equal((second.result.created.users || []).length, 0);
  });

  it("leaves unrelated users unchanged", async () => {
    requireDb();
    const after = await authRepo.findUserByEmail(pool, UNRELATED_EMAIL);
    assert.ok(after);
    assert.equal(after.id, unrelatedBefore.id);
    assert.equal(after.password_hash, unrelatedBefore.password_hash);
    assert.equal(after.display_name, unrelatedBefore.display_name);
    assert.ok(await bcrypt.compare(UNRELATED_PASSWORD, after.password_hash));
  });

  it("platform admin can access apex /admin; HQ cannot", async () => {
    requireDb();
    const pa = await authRepo.findUserByEmail(pool, "platform-admin@example.test");
    const hq = await authRepo.findUserByEmail(pool, "church-hq-admin@example.test");
    const paCookie = await cookieFor(pa, { churchId: null, branchId: null });
    const hqCookie = await cookieFor(hq);

    const paAdmin = await request(app)
      .get("/admin")
      .set("Host", APEX_HOST)
      .set("Cookie", paCookie);
    assert.equal(paAdmin.status, 200);

    const hqAdmin = await request(app)
      .get("/admin")
      .set("Host", APEX_HOST)
      .set("Cookie", hqCookie);
    assert.ok([302, 303, 403].includes(hqAdmin.status), `unexpected ${hqAdmin.status}`);
    if (hqAdmin.status === 302 || hqAdmin.status === 303) {
      assert.doesNotMatch(String(hqAdmin.headers.location || ""), /^\/admin\/?$/);
    }
  });

  it("church HQ admin can open /hq; branch admin is restricted to assigned branch", async () => {
    requireDb();
    const hq = await authRepo.findUserByEmail(pool, "church-hq-admin@example.test");
    const ba = await authRepo.findUserByEmail(pool, "branch-admin@example.test");
    const hqCookie = await cookieFor(hq);

    const hqOk = await request(app).get("/hq").set("Host", TENANT_HOST).set("Cookie", hqCookie);
    assert.equal(hqOk.status, 200);

    const roles = await authRepo.listActiveRolesForUser(pool, ba.id);
    const branchRoles = roles.filter((r) => r.role_key === "branch_admin");
    assert.equal(branchRoles.length, 1);
    assert.equal(String(branchRoles[0].branch_id), String(campusBranch.id));
    assert.notEqual(String(branchRoles[0].branch_id), String(hqBranch.id));

    const grants = evaluateRoleGrants(
      branchRoles.map((r) => ({
        roleKey: r.role_key,
        organizationId: r.organization_id,
        churchId: r.church_id,
        branchId: r.branch_id,
      })),
      {
        organizationId: org.id,
        churchId: church.id,
        branchId: campusBranch.id,
      },
      { branchBelongsToChurch: true }
    );
    assert.equal(grants.length, 1);

    const deniedOther = evaluateRoleGrants(
      branchRoles.map((r) => ({
        roleKey: r.role_key,
        organizationId: r.organization_id,
        churchId: r.church_id,
        branchId: r.branch_id,
      })),
      {
        organizationId: org.id,
        churchId: church.id,
        branchId: hqBranch.id,
      },
      { branchBelongsToChurch: true }
    );
    assert.equal(deniedOther.length, 0);

    const baHq = await request(app)
      .get("/hq")
      .set("Host", TENANT_HOST)
      .set("Cookie", await cookieFor(ba, { branchId: campusBranch.id }));
    assert.ok([302, 303, 403].includes(baHq.status), `ba /hq status ${baHq.status}`);
  });

  it("member gets /member; admin portals forbidden; no staff roles", async () => {
    requireDb();
    const member = await authRepo.findUserByEmail(pool, "member@example.test");
    const roles = await authRepo.listActiveRolesForUser(pool, member.id);
    assert.equal(roles.length, 0);

    const cookie = await cookieFor(member, { branchId: hqBranch.id });
    const memberOk = await request(app)
      .get("/member")
      .set("Host", TENANT_HOST)
      .set("Cookie", cookie);
    assert.equal(memberOk.status, 200);

    for (const pathName of ["/hq", "/branch-admin", "/admin"]) {
      const host = pathName === "/admin" ? APEX_HOST : TENANT_HOST;
      const res = await request(app).get(pathName).set("Host", host).set("Cookie", cookie);
      assert.ok(
        [302, 303, 403].includes(res.status),
        `member ${pathName} expected deny, got ${res.status}`
      );
    }
  });

  it("staff roles alone never grant member portal", async () => {
    requireDb();
    const hq = await authRepo.findUserByEmail(pool, "church-hq-admin@example.test");
    const cookie = await cookieFor(hq);
    const denied = await request(app)
      .get("/member")
      .set("Host", TENANT_HOST)
      .set("Cookie", cookie);
    assert.equal(denied.status, 403);
  });

  it("ministry_leader persona is not created (unsupported)", async () => {
    requireDb();
    const leader = await authRepo.findUserByEmail(pool, "ministry-leader@example.test");
    assert.equal(leader, null);
  });

  it("--reset-passwords changes only designated test accounts", async () => {
    requireDb();
    const unrelatedPre = await authRepo.findUserByEmail(pool, UNRELATED_EMAIL);
    const paPre = await authRepo.findUserByEmail(pool, "platform-admin@example.test");

    // Change PA hash to something else first
    const otherHash = await bcrypt.hash("other-temp-password-xx", 12);
    await authRepo.updateUserPasswordHash(pool, paPre.id, otherHash);

    const reset = await seedBlessBoardTestUsers(pool, {
      dryRun: false,
      resetPasswords: true,
      env: { NODE_ENV: "test" },
    });
    assert.equal(reset.ok, true, reset.message);

    const paPost = await authRepo.findUserByEmail(pool, "platform-admin@example.test");
    assert.ok(await bcrypt.compare(TEST_PASSWORD, paPost.password_hash));
    assert.ok(!(await bcrypt.compare("other-temp-password-xx", paPost.password_hash)));

    const unrelatedPost = await authRepo.findUserByEmail(pool, UNRELATED_EMAIL);
    assert.equal(unrelatedPost.password_hash, unrelatedPre.password_hash);
  });

  it("org and branch isolation: fixture emails scoped to demo-church", async () => {
    requireDb();
    const pa = await authRepo.findUserByEmail(pool, "platform-admin@example.test");
    const roles = await authRepo.listActiveRolesForUser(pool, pa.id);
    assert.ok(roles.every((r) => String(r.organization_id) === String(org.id)));
    const members = await pool.query(
      `SELECT church_id FROM blessboard.members m
         JOIN blessboard.users u ON u.id = m.user_id
        WHERE u.email_normalized = 'member@example.test'`
    );
    assert.equal(String(members.rows[0].church_id), String(church.id));
  });
});

describe("blessboard test-users seed CLI", () => {
  it("production CLI refuses without override", () => {
    const result = spawnSync(
      process.execPath,
      [path.join(ROOT, "db/scripts/blessboard-test-users-seed.js")],
      {
        env: {
          ...process.env,
          NODE_ENV: "production",
          BLESSBOARD_ALLOW_TEST_USERS: "true",
          [PRODUCTION_OVERRIDE_ENV]: "",
          DATABASE_URL: "postgresql://example.invalid/db",
          DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
        },
        encoding: "utf8",
      }
    );
    assert.notEqual(result.status, 0);
    const combined = `${result.stdout}\n${result.stderr}`;
    assert.match(combined, /refused_production|production/i);
    assert.doesNotMatch(combined, /\$2[aby]\$/);
    assert.doesNotMatch(combined, /postgres(ql)?:\/\//i);
  });
});
