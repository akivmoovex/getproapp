"use strict";

/**
 * HQ scoped role management (BB-02): assign/revoke fixed roles, authz, CSRF, audit.
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
const {
  assignHqChurchRole,
  revokeHqChurchRole,
  STATUS,
} = require("../src/blessboard/services/hqRoleManagementService");
const {
  authorizeBlessBoardTenantAccess,
} = require("../src/blessboard/services/authorizeBlessBoardTenantAccess");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "roles-a.blessboard.org";
const HOST_B = "roles-b.blessboard.org";
const ROOT = path.join(__dirname, "..");

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

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"] || [];
  const list = Array.isArray(raw) ? raw : [raw];
  for (const line of list) {
    const m = String(line).match(new RegExp(`(?:^|,\\s*)${name}=([^;]+)`));
    if (m) return m[1];
  }
  return null;
}

describe("blessboard hq role management", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let churchA;
  let churchB;
  let hqA;
  let campusA;
  let users = {};

  before(async () => {
    try {
      // Ephemeral seeds use blessboard-org-staging; audit FK requires a matching deployment code.
      process.env.PLATFORM_DEPLOYMENT_CODE = "blessboard-org-staging";
      process.env.DEPLOYMENT_ENV = "testing";
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      const provA = await provisionPlatformTenant(pool, {
        organizationKey: "roles-a",
        displayName: "Roles Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "roles-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(provA.ok, true, provA.message);
      orgA = provA.records.organization;

      const churchProvA = await provisionBlessBoardChurch(pool, {
        organizationKey: "roles-a",
        churchKey: "roles-a",
        displayName: "Roles Church A",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
        timezone: "UTC",
        countryCode: "ZM",
      });
      assert.equal(churchProvA.ok, true, churchProvA.message);
      churchA = churchProvA.records.church;
      hqA = churchProvA.records.hqBranch;

      const { createBlessBoardBranch } = require("../src/blessboard/services/createBlessBoardBranch");
      await assignOrganizationGrowth();
      const campus = await createBlessBoardBranch(pool, {
        churchId: churchA.id,
        organizationId: orgA.id,
        branchKey: "campus",
        displayName: "Campus A",
      });
      assert.equal(campus.ok, true, campus.reason);
      campusA = campus.branch;

      const provB = await provisionPlatformTenant(pool, {
        organizationKey: "roles-b",
        displayName: "Roles Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "roles-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(provB.ok, true, provB.message);
      orgB = provB.records.organization;

      const churchProvB = await provisionBlessBoardChurch(pool, {
        organizationKey: "roles-b",
        churchKey: "roles-b",
        displayName: "Roles Church B",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
        timezone: "UTC",
        countryCode: "ZM",
      });
      assert.equal(churchProvB.ok, true, churchProvB.message);
      churchB = churchProvB.records.church;

      async function makeUser(email, displayName) {
        const created = await createBlessBoardUser(pool, {
          email,
          password: PASSWORD,
          displayName,
        });
        assert.equal(created.ok, true, created.message);
        return created.user;
      }

      users.hq = await makeUser("hq-roles@example.org", "HQ Roles");
      users.target = await makeUser("target-roles@example.org", "Target Roles");
      users.inactive = await makeUser("inactive-roles@example.org", "Inactive Roles");
      users.otherChurch = await makeUser("other-hq@example.org", "Other HQ");

      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "hq-roles@example.org",
            organizationKey: "roles-a",
            roleKey: "church_hq_admin",
            churchKey: "roles-a",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "other-hq@example.org",
            organizationKey: "roles-b",
            roleKey: "church_hq_admin",
            churchKey: "roles-b",
          })
        ).ok,
        true
      );
      await pool.query(`UPDATE blessboard.users SET status = 'inactive' WHERE id = $1`, [
        users.inactive.id,
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

  async function assignOrganizationGrowth() {
    const { assignOrganizationPlan } = require("../src/platform/services/entitlementService");
    const up = await assignOrganizationPlan(pool, {
      organizationId: orgA.id,
      planKey: "growth",
    });
    assert.equal(up.ok, true, up.reason);
  }

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  async function cookieFor(user, org, church, branch) {
    const created = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId: user.id,
      organizationId: org.id,
      churchId: church.id,
      branchId: branch.id,
    });
    assert.equal(created.ok, true, created.code);
    return `${DEFAULT_V5_COOKIE}=${created.rawToken}`;
  }

  it("assigns a permitted branch_admin role", async () => {
    requireDb();
    const result = await assignHqChurchRole(pool, {
      actorUserId: users.hq.id,
      organizationId: orgA.id,
      organizationKey: "roles-a",
      churchId: churchA.id,
      churchKey: "roles-a",
      email: "target-roles@example.org",
      roleKey: "branch_admin",
      branchKey: "campus",
      confirmed: true,
      env: baseEnv(),
    });
    assert.equal(result.ok, true, result.reason);
    assert.equal(result.role.roleKey, "branch_admin");
    assert.equal(result.role.branchId, campusA.id);
  });

  it("rejects platform_admin assignment from HQ service", async () => {
    requireDb();
    const result = await assignHqChurchRole(pool, {
      actorUserId: users.hq.id,
      organizationId: orgA.id,
      organizationKey: "roles-a",
      churchId: churchA.id,
      churchKey: "roles-a",
      email: "target-roles@example.org",
      roleKey: "platform_admin",
      confirmed: true,
      env: baseEnv(),
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.FORBIDDEN);
    assert.equal(result.reason, "platform_admin_forbidden");
  });

  it("rejects cross-church assignment", async () => {
    requireDb();
    const result = await assignHqChurchRole(pool, {
      actorUserId: users.hq.id,
      organizationId: orgA.id,
      organizationKey: "roles-a",
      churchId: churchA.id,
      churchKey: "roles-b",
      email: "target-roles@example.org",
      roleKey: "church_hq_admin",
      confirmed: true,
      env: baseEnv(),
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.FORBIDDEN);
  });

  it("rejects self-escalation", async () => {
    requireDb();
    const result = await assignHqChurchRole(pool, {
      actorUserId: users.hq.id,
      organizationId: orgA.id,
      organizationKey: "roles-a",
      churchId: churchA.id,
      churchKey: "roles-a",
      email: "hq-roles@example.org",
      roleKey: "branch_admin",
      branchKey: "hq",
      confirmed: true,
      env: baseEnv(),
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "self_escalation");
  });

  it("rejects inactive users", async () => {
    requireDb();
    const result = await assignHqChurchRole(pool, {
      actorUserId: users.hq.id,
      organizationId: orgA.id,
      organizationKey: "roles-a",
      churchId: churchA.id,
      churchKey: "roles-a",
      email: "inactive-roles@example.org",
      roleKey: "church_hq_admin",
      confirmed: true,
      env: baseEnv(),
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "user_inactive");
  });

  it("revokes role, records audit, and enforces stale authorization", async () => {
    requireDb();
    const listed = await pool.query(
      `SELECT id FROM blessboard.user_roles
        WHERE user_id = $1 AND role_key = 'branch_admin' AND status = 'active'
        LIMIT 1`,
      [users.target.id]
    );
    assert.ok(listed.rows[0]);
    const roleId = listed.rows[0].id;

    const beforeAuth = await authorizeBlessBoardTenantAccess(pool, {
      userId: users.target.id,
      tenant: {
        resolved: true,
        organization: { id: orgA.id, key: "roles-a" },
        church: { id: churchA.id, key: "roles-a", displayName: "Roles Church A" },
        hqBranch: { id: hqA.id, key: "hq", displayName: "HQ A" },
        primaryBranch: { id: hqA.id, key: "hq", displayName: "HQ A" },
      },
      branchId: campusA.id,
    });
    assert.equal(beforeAuth.ok, true);

    const revoked = await revokeHqChurchRole(pool, {
      actorUserId: users.hq.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      roleId,
      confirmed: true,
      env: baseEnv(),
    });
    assert.equal(revoked.ok, true, revoked.reason);

    const audit = await pool.query(
      `SELECT action_key, entity_type, entity_id
         FROM platform.audit_events
        WHERE action_key = 'role.revoked' AND entity_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [roleId]
    );
    assert.equal(audit.rows.length, 1);

    const afterAuth = await authorizeBlessBoardTenantAccess(pool, {
      userId: users.target.id,
      tenant: {
        resolved: true,
        organization: { id: orgA.id, key: "roles-a" },
        church: { id: churchA.id, key: "roles-a", displayName: "Roles Church A" },
        hqBranch: { id: hqA.id, key: "hq", displayName: "HQ A" },
        primaryBranch: { id: hqA.id, key: "hq", displayName: "HQ A" },
      },
      branchId: campusA.id,
    });
    assert.equal(afterAuth.ok, false);
  });

  it("GET /hq/roles renders for HQ admin; branch admin denied", async () => {
    requireDb();
    const hqCookie = await cookieFor(users.hq, orgA, churchA, hqA);
    const page = await request(app).get("/hq/roles").set("Host", HOST_A).set("Cookie", hqCookie);
    assert.equal(page.status, 200);
    assert.match(page.text, /data-bb-hq-roles="1"/);
    assert.match(page.text, /data-bb-stitch-roles="59-hq-permission-role-management"/);
    assert.match(page.text, /Staff permissions/);
    assert.match(page.text, /href="\/hq\/roles"/);
    assert.doesNotMatch(page.text, /Ministry Leader|permission matrix|arbitrary/i);
    assert.match(page.text, /name="_csrf"/);

    const branchUser = await createBlessBoardUser(pool, {
      email: "ba-roles@example.org",
      password: PASSWORD,
      displayName: "BA Roles",
    });
    assert.equal(branchUser.ok, true);
    assert.equal(
      (
        await assignBlessBoardRole(pool, {
          email: "ba-roles@example.org",
          organizationKey: "roles-a",
          roleKey: "branch_admin",
          churchKey: "roles-a",
          branchKey: "hq",
        })
      ).ok,
      true
    );
    const baCookie = await cookieFor(branchUser.user, orgA, churchA, hqA);
    const denied = await request(app).get("/hq/roles").set("Host", HOST_A).set("Cookie", baCookie);
    assert.ok(denied.status === 403 || denied.status === 302);
  });

  it("POST assign requires CSRF and confirmation", async () => {
    requireDb();
    const fresh = await createBlessBoardUser(pool, {
      email: "assign-http@example.org",
      password: PASSWORD,
      displayName: "Assign HTTP",
    });
    assert.equal(fresh.ok, true);
    const cookie = await cookieFor(users.hq, orgA, churchA, hqA);
    const page = await request(app).get("/hq/roles").set("Host", HOST_A).set("Cookie", cookie);
    const csrf = extractCookie(page, CSRF_COOKIE);
    assert.ok(csrf);

    const noConfirm = await request(app)
      .post("/hq/roles/assign")
      .set("Host", HOST_A)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        email: "assign-http@example.org",
        role_key: "church_hq_admin",
      });
    assert.equal(noConfirm.status, 303);
    assert.match(noConfirm.headers.location, /error=confirm/);

    const ok = await request(app)
      .post("/hq/roles/assign")
      .set("Host", HOST_A)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        email: "assign-http@example.org",
        role_key: "church_hq_admin",
        confirm_assign: "1",
      });
    assert.equal(ok.status, 303);
    assert.match(ok.headers.location, /notice=assigned/);

    const audit = await pool.query(
      `SELECT 1 FROM platform.audit_events WHERE action_key = 'role.assigned' LIMIT 1`
    );
    assert.equal(audit.rows.length, 1);
  });

  it("rejects cross-church revoke via church scope", async () => {
    requireDb();
    const role = await pool.query(
      `SELECT id FROM blessboard.user_roles
        WHERE user_id = $1 AND church_id = $2 AND status = 'active'
        LIMIT 1`,
      [users.otherChurch.id, churchB.id]
    );
    assert.ok(role.rows[0]);
    const result = await revokeHqChurchRole(pool, {
      actorUserId: users.hq.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      roleId: role.rows[0].id,
      confirmed: true,
      env: baseEnv(),
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "cross_church");
  });

  it("does not invent leader role keys in V5 role modules", async () => {
    requireDb();
    const files = [
      "src/blessboard/services/hqRoleManagementService.js",
      "src/blessboard/http/hqRoleAdminRoutes.js",
      "views/blessboard/v5/hq/roles.ejs",
    ];
    for (const rel of files) {
      const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
      assert.doesNotMatch(text, /ministry_leader|leader_portal|custom_permission/i);
      assert.doesNotMatch(text, /platform_admin.*assign|grant.*platform_admin/i);
    }
  });
});
