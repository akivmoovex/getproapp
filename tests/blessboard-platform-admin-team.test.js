"use strict";

/**
 * Prompt 10D: Platform Admin organisation team management (ephemeral Postgres).
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
  inviteOrganizationTeamMember,
  assignOrganizationTeamRole,
  revokeOrganizationTeamRole,
  detectTeamUserByEmail,
  listOrganizationTeam,
  getOrganizationTeamMember,
} = require("../src/platform/services/platformAdminTeamService");
const { PLATFORM_ADMIN_PERMISSIONS } = require("../src/blessboard/rbac/legacyCompatibilityPermissions");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "team-a.blessboard.org";
const HOST_B = "team-b.blessboard.org";

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

describe("platform team management catalogue", () => {
  it("includes team permissions without Finance/pastoral grants", () => {
    for (const key of [
      "platform.users.invite",
      "platform.roles.view",
      "platform.roles.assign_standard",
      "platform.roles.assign_sensitive",
      "platform.roles.revoke",
    ]) {
      assert.ok(PLATFORM_ADMIN_PERMISSIONS.includes(key), key);
    }
    assert.ok(!PLATFORM_ADMIN_PERMISSIONS.includes("finance.transactions.view"));
    assert.ok(!PLATFORM_ADMIN_PERMISSIONS.includes("pastoral_cases.view_assigned"));
  });

  it("ships migration 070", () => {
    const mig = fs.readFileSync(
      path.join(
        __dirname,
        "../db/migrations/blessboard/070_platform_team_management_permissions.sql"
      ),
      "utf8"
    );
    assert.match(mig, /platform\.users\.invite/);
    assert.match(mig, /platform\.roles\.assign_sensitive/);
    assert.match(mig, /platform\.roles\.revoke/);
  });
});

describe("blessboard platform team management", () => {
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
  let csrf;
  let sessionCookie;

  before(async () => {
    try {
      process.env.PLATFORM_DEPLOYMENT_CODE = "blessboard-org-staging";
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      const provA = await provisionPlatformTenant(pool, {
        organizationKey: "team-org-a",
        displayName: "Team Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "team-org-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(provA.ok, true, provA.message);
      orgA = provA.records.organization;

      const provB = await provisionPlatformTenant(pool, {
        organizationKey: "team-org-b",
        displayName: "Team Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "team-org-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(provB.ok, true, provB.message);
      orgB = provB.records.organization;

      const churchProvA = await provisionBlessBoardChurch(pool, {
        organizationKey: "team-org-a",
        churchKey: "team-org-a",
        displayName: "Team Church A",
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
        organizationKey: "team-org-b",
        churchKey: "team-org-b",
        displayName: "Team Church B",
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

      users.platform = await makeUser("team-pa@example.org", "Team Platform Admin");
      users.existing = await makeUser("team-existing@example.org", "Existing Staff");
      users.target = await makeUser("team-target@example.org", "Target Staff");

      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "team-pa@example.org",
            organizationKey: "team-org-a",
            roleKey: "platform_admin",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "team-target@example.org",
            organizationKey: "team-org-a",
            roleKey: "church_hq_admin",
            churchKey: "team-org-a",
          })
        ).ok,
        true
      );

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
      });
      const session = await createV5Session(pool, {
        deploymentCode: "blessboard-org-staging",
        userId: users.platform.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: null,
      });
      assert.equal(session.ok, true, session.code);
      sessionCookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
      csrf = issueCsrfToken(baseEnv());
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  const TEST_ENV = baseEnv();

  it("invites a new email without creating a duplicate user later", async () => {
    requireDb();
    const invited = await inviteOrganizationTeamMember(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: orgA.id,
      firstName: "Nova",
      lastName: "Invitee",
      email: "team-new@example.org",
      phone: "+260972000001",
      roleAssignments: [],
      env: TEST_ENV,
    });
    assert.equal(invited.ok, true, invited.reason);
    assert.ok(invited.userId);
    assert.equal(invited.existingUser, false);
    assert.ok(invited.invitation || invited.inviteSkipped === false);

    const count = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.users WHERE email_normalized = 'team-new@example.org'`
    );
    assert.equal(count.rows[0].n, 1);

    const again = await inviteOrganizationTeamMember(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "team-org-a",
      firstName: "Nova",
      lastName: "Invitee",
      email: "Team-New@Example.org",
      phone: "+260972000001",
      roleAssignments: [],
    });
    // Resend path, already assigned, or tenant phone uniqueness — must not create second user.
    const count2 = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.users WHERE email_normalized = 'team-new@example.org'`
    );
    assert.equal(count2.rows[0].n, 1);
    assert.ok(
      again.ok ||
        again.reason === "already_assigned" ||
        again.reason === "phone_exists" ||
        again.inviteSkipped
    );
  });

  it("reuses an existing BlessBoard user by normalized email", async () => {
    requireDb();
    const detected = await detectTeamUserByEmail(pool, {
      actorUserId: users.platform.id,
      email: "TEAM-EXISTING@example.org",
    });
    assert.equal(detected.ok, true);
    assert.ok(detected.user);
    assert.equal(detected.user.id, users.existing.id);

    const invited = await inviteOrganizationTeamMember(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "team-org-a",
      firstName: "Existing",
      lastName: "Staff",
      email: "team-existing@example.org",
      phone: "+260972000002",
      roleAssignments: [
        {
          roleKey: "website_editor",
          scopeType: "church",
          scopeId: churchA.id,
          assignmentReason: "reuse existing editor",
        },
      ],
      env: TEST_ENV,
    });
    assert.equal(invited.ok, true, invited.reason);
    assert.equal(invited.existingUser, true);
    assert.equal(invited.userId, users.existing.id);
  });

  it("places branch staff on a campus branch", async () => {
    requireDb();
    const invited = await inviteOrganizationTeamMember(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "team-org-a",
      firstName: "Branch",
      lastName: "Person",
      email: "team-branch@example.org",
      phone: "+260972000003",
      branchId: campusA.id,
      placement: "branch",
      roleAssignments: [],
      env: TEST_ENV,
    });
    assert.equal(invited.ok, true, invited.reason);
    const role = await pool.query(
      `SELECT role_key, branch_id FROM blessboard.user_roles
        WHERE user_id = $1 AND organization_id = $2 AND status = 'active'
          AND role_key = 'branch_admin'`,
      [invited.userId, orgA.id]
    );
    // Role is assigned on invitation accept; pending invite should target branch.
    const inv = await pool.query(
      `SELECT role_key, branch_id FROM blessboard.user_invitations
        WHERE email_normalized = 'team-branch@example.org' AND status = 'pending'
        ORDER BY created_at DESC LIMIT 1`
    );
    if (inv.rows[0]) {
      assert.equal(inv.rows[0].role_key, "branch_admin");
      assert.equal(String(inv.rows[0].branch_id), String(campusA.id));
    } else if (role.rows[0]) {
      assert.equal(String(role.rows[0].branch_id), String(campusA.id));
    } else {
      assert.fail("expected pending invitation or branch_admin role");
    }
  });

  it("assigns a standard role and reports effective permissions", async () => {
    requireDb();
    const assigned = await assignOrganizationTeamRole(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "team-org-a",
      userId: users.target.id,
      roleKey: "website_editor",
      scopeType: "church",
      scopeId: churchA.id,
      assignmentReason: "standard website editor access",
    });
    assert.equal(assigned.ok, true, assigned.reason);

    const detail = await getOrganizationTeamMember(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: orgA.id,
      userId: users.target.id,
    });
    assert.equal(detail.ok, true, detail.reason);
    assert.ok(detail.detail.sensitiveSummary);
    assert.ok(detail.detail.effectiveGrouped);
    const keys = Object.values(detail.detail.effectiveGrouped)
      .flat()
      .map((p) => p.permissionKey);
    assert.ok(keys.length > 0);
  });

  it("requires reason for sensitive role assignment", async () => {
    requireDb();
    const denied = await assignOrganizationTeamRole(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "team-org-a",
      userId: users.target.id,
      roleKey: "finance_officer",
      scopeType: "church",
      scopeId: churchA.id,
      assignmentReason: "",
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.reason, "reason_required");

    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const assigned = await assignOrganizationTeamRole(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "team-org-a",
      userId: users.target.id,
      roleKey: "finance_officer",
      scopeType: "church",
      scopeId: churchA.id,
      assignmentReason: "temporary finance coverage",
      expiresAt: expires,
    });
    assert.equal(assigned.ok, true, assigned.reason);
    assert.ok(assigned.assignment);
    assert.ok(assigned.assignment.expiresAt || assigned.assignment.expires_at);
  });

  it("revokes an assignment and denies self-assignment", async () => {
    requireDb();
    const listed = await listOrganizationTeam(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "team-org-a",
    });
    assert.equal(listed.ok, true);

    const detail = await getOrganizationTeamMember(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "team-org-a",
      userId: users.target.id,
    });
    const active = (detail.detail.activeAssignments || [])[0];
    assert.ok(active, "expected an active assignment to revoke");

    const revoked = await revokeOrganizationTeamRole(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "team-org-a",
      userId: users.target.id,
      assignmentId: active.id,
      revocationReason: "coverage ended",
    });
    assert.equal(revoked.ok, true, revoked.reason);

    const selfAssign = await assignOrganizationTeamRole(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "team-org-a",
      userId: users.platform.id,
      roleKey: "website_editor",
      scopeType: "church",
      scopeId: churchA.id,
    });
    assert.equal(selfAssign.ok, false);
    assert.equal(selfAssign.reason, "self_elevation");
  });

  it("rejects forged organisation, forged branch, and cross-org scope", async () => {
    requireDb();
    const forgedOrg = await inviteOrganizationTeamMember(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "team-org-a",
      submittedOrganizationId: orgB.id,
      firstName: "Forge",
      lastName: "Org",
      email: "team-forge-org@example.org",
      phone: "+260972000091",
    });
    assert.equal(forgedOrg.ok, false);
    assert.equal(forgedOrg.reason, "forged_organization");

    const forgedBranch = await inviteOrganizationTeamMember(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "team-org-a",
      firstName: "Forge",
      lastName: "Branch",
      email: "team-forge-branch@example.org",
      phone: "+260972000092",
      branchId: "00000000-0000-4000-8000-000000000099",
      placement: "branch",
    });
    assert.equal(forgedBranch.ok, false);
    assert.ok(
      forgedBranch.reason === "forged_branch" ||
        forgedBranch.reason === "branch" ||
        forgedBranch.reason === "branch_required",
      forgedBranch.reason
    );

    // Branch from org B's church cannot be used as scope in org A.
    const branchB = await pool.query(
      `SELECT id FROM blessboard.branches WHERE church_id = $1 LIMIT 1`,
      [churchB.id]
    );
    const cross = await assignOrganizationTeamRole(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "team-org-a",
      userId: users.target.id,
      roleKey: "website_editor",
      scopeType: "branch",
      scopeId: branchB.rows[0].id,
    });
    assert.equal(cross.ok, false);
    assert.equal(cross.reason, "cross_org_scope_mismatch");
  });

  it("blocks platform scope on team screen and records audit events", async () => {
    requireDb();
    const platformScope = await assignOrganizationTeamRole(pool, {
      actorUserId: users.platform.id,
      organizationKeyOrId: "team-org-a",
      userId: users.target.id,
      roleKey: "website_editor",
      scopeType: "platform",
    });
    assert.equal(platformScope.ok, false);
    assert.equal(platformScope.reason, "platform_scope_forbidden");

    const audits = await pool.query(
      `SELECT action_key FROM platform.audit_events
        WHERE action_key LIKE 'platform.team.%'
        ORDER BY created_at DESC
        LIMIT 20`
    );
    const keys = audits.rows.map((r) => r.action_key);
    assert.ok(
      keys.some((k) =>
        [
          "platform.team.invite",
          "platform.team.user_reused",
          "platform.team.assign",
          "platform.team.view",
        ].includes(k)
      ),
      `expected platform.team.* audits, got ${keys.join(",")}`
    );
  });

  it("serves team pages and enforces CSRF on invite", async () => {
    requireDb();
    const agentCookie = cookieHeader([
      sessionCookie,
      `${CSRF_COOKIE}=${csrf}`,
    ]);

    const list = await request(app)
      .get("/admin/organizations/team-org-a/team")
      .set("Host", "blessboard.org")
      .set("Cookie", agentCookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /Team management/);
    assert.match(list.text, /Invite user/);

    const inviteGet = await request(app)
      .get("/admin/organizations/team-org-a/team/invite")
      .set("Host", "blessboard.org")
      .set("Cookie", agentCookie);
    assert.equal(inviteGet.status, 200);
    assert.match(inviteGet.text, /Add team member/);

    const badCsrf = await request(app)
      .post("/admin/organizations/team-org-a/team/invite")
      .set("Host", "blessboard.org")
      .set("Cookie", agentCookie)
      .type("form")
      .send({
        [CSRF_FIELD]: "not-the-token",
        wizard_action: "submit",
        first_name: "Csrf",
        last_name: "Fail",
        email: "team-csrf@example.org",
        phone: "0972000099",
      });
    assert.equal(badCsrf.status, 303);
    assert.match(String(badCsrf.headers.location || ""), /error=csrf/);

    const detail = await request(app)
      .get(`/admin/organizations/team-org-a/team/${users.target.id}`)
      .set("Host", "blessboard.org")
      .set("Cookie", agentCookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /Assign role/);
    assert.match(detail.text, /Effective-access summary|Inherited permissions/);
  });
});
