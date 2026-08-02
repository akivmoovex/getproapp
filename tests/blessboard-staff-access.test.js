"use strict";

/**
 * BlessBoard V5 staff-access UI + assignment delegation (ephemeral Postgres).
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
const {
  authorize,
  listEffectivePermissions,
} = require("../src/blessboard/services/blessBoardRbacAuthorizationService");
const rbacRepo = require("../src/blessboard/repositories/blessBoardRbacRepository");
const {
  createRoleAssignment,
  revokeRoleAssignment,
  STATUS: ASSIGN_STATUS,
} = require("../src/blessboard/services/blessBoardRoleAssignmentService");
const {
  listStaffAccess,
  getStaffAccessDetail,
  listRoleCatalogue,
  listAccessAudit,
  STATUS,
} = require("../src/blessboard/services/staffAccessService");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const { makeResolvedTenantContext } = require("./helpers/blessboardV5Fixtures");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "staff-a.blessboard.org";
const HOST_B = "staff-b.blessboard.org";

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

describe("blessboard staff access management", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let churchA;
  let churchB;
  let branchA;
  let branchA2;
  let tenantA;
  let tenantB;
  let actorHq;
  let actorBa;
  let actorMember;
  let actorTarget;
  let actorHqB;
  let actorFinance;
  let actorPastor;
  let actorPublisher;
  let actorMinistry;
  let actorWelfare;
  let ministryId;
  let departmentId;
  let cellId;
  let classId;

  function requireDb() {
    if (skipSuite) assert.fail(`Setup unavailable: ${skipReason}`);
  }

  async function makeUser(email, name) {
    const created = await createBlessBoardUser(pool, {
      email,
      password: PASSWORD,
      displayName: name || email,
    });
    assert.equal(created.ok, true, created.message || created.reason);
    return created.user;
  }

  async function assignCatalogueRole(userId, roleKey, scope) {
    const role = await rbacRepo.findRoleByKey(pool, roleKey);
    assert.ok(role, `missing role ${roleKey}`);
    return rbacRepo.insertAssignment(pool, {
      userId,
      organizationId: orgA.id,
      churchId: churchA.id,
      roleId: role.id,
      scopeType: scope.scopeType,
      scopeId: scope.scopeId || null,
      assignedByUserId: actorHq.id,
      assignmentOrigin: "system",
      assignmentReason: "staff access test seed",
    });
  }

  async function sessionCookie(user) {
    const session = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId: user.id,
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
    });
    assert.equal(session.ok, true, session.code || session.message);
    return `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
  }

  before(async () => {
    process.env.PLATFORM_DEPLOYMENT_CODE = "blessboard-org-staging";
    process.env.DEPLOYMENT_ENV = "testing";
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      const platformA = await provisionPlatformTenant(pool, {
        organizationKey: "staff-org-a",
        displayName: "Staff Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "staff-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(platformA.ok, true, platformA.message);
      orgA = platformA.records.organization;

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "staff-org-a",
        churchKey: "staff-a",
        displayName: "Staff Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      branchA = chA.records.hqBranch;

      const b2 = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus', 'Campus', 'branch', 'active', false, 'UTC', 'US')
         RETURNING id, church_id, branch_key, display_name`,
        [churchA.id]
      );
      branchA2 = b2.rows[0];

      const platformB = await provisionPlatformTenant(pool, {
        organizationKey: "staff-org-b",
        displayName: "Staff Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "staff-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(platformB.ok, true, platformB.message);
      orgB = platformB.records.organization;
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "staff-org-b",
        churchKey: "staff-b",
        displayName: "Staff Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);
      churchB = chB.records.church;

      tenantA = makeResolvedTenantContext({
        organization: orgA,
        church: churchA,
        primaryBranch: branchA,
        hostname: HOST_A,
      });
      tenantB = makeResolvedTenantContext({
        organization: orgB,
        church: churchB,
        primaryBranch: chB.records.hqBranch,
        hostname: HOST_B,
      });

      actorHq = await makeUser("hq@staff-a.test", "HQ Admin");
      actorBa = await makeUser("ba@staff-a.test", "Branch Admin");
      actorMember = await makeUser("member@staff-a.test", "Member Only");
      actorTarget = await makeUser("target@staff-a.test", "Target Staff");
      actorHqB = await makeUser("hq@staff-b.test", "HQ B");
      actorFinance = await makeUser("finance@staff-a.test", "Finance Dir");
      actorPastor = await makeUser("pastor@staff-a.test", "Pastor");
      actorPublisher = await makeUser("pub@staff-a.test", "Publisher");
      actorMinistry = await makeUser("min@staff-a.test", "Ministry Leader");
      actorWelfare = await makeUser("welfare@staff-a.test", "Welfare Officer");

      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "hq@staff-a.test",
            organizationKey: "staff-org-a",
            roleKey: "church_hq_admin",
            churchKey: "staff-a",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "ba@staff-a.test",
            organizationKey: "staff-org-a",
            roleKey: "branch_admin",
            churchKey: "staff-a",
            branchKey: "hq",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "hq@staff-b.test",
            organizationKey: "staff-org-b",
            roleKey: "church_hq_admin",
            churchKey: "staff-b",
          })
        ).ok,
        true
      );

      // Seed target with a standard RBAC role so they appear in staff list.
      await assignCatalogueRole(actorTarget.id, "website_editor", {
        scopeType: "church",
        scopeId: churchA.id,
      });

      await assignCatalogueRole(actorFinance.id, "finance_director", {
        scopeType: "church",
        scopeId: churchA.id,
      });
      await assignCatalogueRole(actorPastor.id, "branch_pastor", {
        scopeType: "branch",
        scopeId: branchA.id,
      });
      await assignCatalogueRole(actorPublisher.id, "website_publisher", {
        scopeType: "church",
        scopeId: churchA.id,
      });
      await assignCatalogueRole(actorMinistry.id, "ministry_leader", {
        scopeType: "church",
        scopeId: churchA.id,
      });
      await assignCatalogueRole(actorWelfare.id, "welfare_officer", {
        scopeType: "church",
        scopeId: churchA.id,
      });

      const ministry = await pool.query(
        `INSERT INTO blessboard.ministries
           (church_id, branch_id, organization_id, name, ministry_key, ministry_type, status)
         VALUES ($1, $2, $3, 'Worship', 'worship', 'other', 'published')
         RETURNING id`,
        [churchA.id, branchA.id, orgA.id]
      );
      ministryId = ministry.rows[0].id;

      const dept = await pool.query(
        `INSERT INTO blessboard.departments
           (organization_id, church_id, branch_id, department_key, display_name, status)
         VALUES ($1, $2, $3, 'ushering', 'Ushering', 'active') RETURNING id`,
        [orgA.id, churchA.id, branchA.id]
      );
      departmentId = dept.rows[0].id;

      const cell = await pool.query(
        `INSERT INTO blessboard.cells
           (organization_id, church_id, branch_id, cell_key, display_name, status)
         VALUES ($1, $2, $3, 'cell_one', 'Cell One', 'active') RETURNING id`,
        [orgA.id, churchA.id, branchA.id]
      );
      cellId = cell.rows[0].id;

      const klass = await pool.query(
        `INSERT INTO blessboard.class_programs
           (organization_id, church_id, program_key, display_name, program_type, status)
         VALUES ($1, $2, 'foundation', 'Foundation', 'foundation', 'active') RETURNING id`,
        [orgA.id, churchA.id]
      );
      const cohort = await pool.query(
        `INSERT INTO blessboard.class_cohorts
           (organization_id, church_id, branch_id, program_id, cohort_key, display_name, status)
         VALUES ($1, $2, $3, $4, 'foundation_a', 'Foundation Cohort A', 'active') RETURNING id`,
        [orgA.id, churchA.id, branchA.id, klass.rows[0].id]
      );
      classId = cohort.rows[0].id;

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  describe("page access", () => {
    it("authorised HQ can open staff-access list", async () => {
      requireDb();
      const cookie = await sessionCookie(actorHq);
      const res = await request(app)
        .get("/hq/settings/staff-access")
        .set("Host", HOST_A)
        .set("Cookie", cookie);
      assert.equal(res.status, 200);
      assert.match(res.text, /Staff access/);
      assert.match(res.text, /Church leadership position and BlessBoard system access are managed separately/);
    });

    it("unauthorised member denied (concealed)", async () => {
      requireDb();
      const cookie = await sessionCookie(actorMember);
      const res = await request(app)
        .get("/hq/settings/staff-access")
        .set("Host", HOST_A)
        .set("Cookie", cookie);
      assert.ok(res.status === 404 || res.status === 403);
    });

    it("cross-organisation user detail concealed", async () => {
      requireDb();
      const cookie = await sessionCookie(actorHq);
      const res = await request(app)
        .get(`/hq/settings/staff-access/${actorHqB.id}`)
        .set("Host", HOST_A)
        .set("Cookie", cookie);
      assert.equal(res.status, 404);
    });

    it("direct role catalogue and access audit routes render", async () => {
      requireDb();
      const cookie = await sessionCookie(actorHq);
      const roles = await request(app)
        .get("/hq/settings/roles")
        .set("Host", HOST_A)
        .set("Cookie", cookie);
      assert.equal(roles.status, 200);
      assert.match(roles.text, /Role catalogue/);
      const audit = await request(app)
        .get("/hq/settings/access-audit")
        .set("Host", HOST_A)
        .set("Cookie", cookie);
      assert.equal(audit.status, 200);
    });
  });

  describe("search and listing", () => {
    it("organisation-scoped results include target and exclude org B", async () => {
      requireDb();
      const listed = await listStaffAccess(pool, {
        actorUserId: actorHq.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        tenantContext: tenantA,
      });
      assert.equal(listed.ok, true);
      assert.ok(listed.users.some((u) => u.id === actorTarget.id));
      assert.ok(!listed.users.some((u) => u.id === actorHqB.id));
    });

    it("legacy assignment display on HQ user", async () => {
      requireDb();
      const detail = await getStaffAccessDetail(pool, {
        actorUserId: actorHq.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        tenantContext: tenantA,
        userId: actorHq.id,
      });
      assert.equal(detail.ok, true);
      assert.ok(detail.legacyRoles.some((r) => r.roleKey === "church_hq_admin"));
      assert.equal(detail.legacyRoles[0].label, "Legacy compatibility");
    });

    it("role catalogue is read-only and excludes platform_administrator", async () => {
      requireDb();
      const catalogue = await listRoleCatalogue(pool, {
        actorUserId: actorHq.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        tenantContext: tenantA,
      });
      assert.equal(catalogue.ok, true);
      assert.ok(catalogue.roles.every((r) => r.readOnly === true));
      assert.ok(!catalogue.roles.some((r) => r.roleKey === "platform_administrator"));
    });
  });

  describe("standard assignment", () => {
    it("HQ assigns website_editor at branch scope with audit", async () => {
      requireDb();
      const created = await createRoleAssignment(pool, {
        actorUserId: actorHq.id,
        userId: actorMember.id,
        roleKey: "website_editor",
        organizationId: orgA.id,
        churchId: churchA.id,
        scopeType: "branch",
        scopeId: branchA2.id,
        assignmentOrigin: "manual",
        assignmentReason: "campus editor",
        tenantContext: tenantA,
        actorChurchId: churchA.id,
      });
      assert.equal(created.ok, true, created.reason);
      const events = await pool.query(
        `SELECT event_key FROM blessboard.user_role_assignment_events
          WHERE assignment_id = $1`,
        [created.assignment.id]
      );
      assert.ok(events.rows.some((e) => e.event_key === "rbac.assignment.created"));
    });

    it("ministry / department / cell / class scopes assign", async () => {
      requireDb();
      for (const [scopeType, scopeId] of [
        ["ministry", ministryId],
        ["department", departmentId],
        ["cell", cellId],
        ["class", classId],
      ]) {
        const target = await makeUser(`${scopeType}@staff-a.test`, scopeType);
        const created = await createRoleAssignment(pool, {
          actorUserId: actorHq.id,
          userId: target.id,
          roleKey: "website_editor",
          organizationId: orgA.id,
          churchId: churchA.id,
          scopeType,
          scopeId,
          assignmentOrigin: "manual",
          assignmentReason: `${scopeType} scope`,
          tenantContext: tenantA,
          actorChurchId: churchA.id,
        });
        assert.equal(created.ok, true, `${scopeType}: ${created.reason}`);
      }
    });

    it("duplicate active assignment is idempotent", async () => {
      requireDb();
      const first = await createRoleAssignment(pool, {
        actorUserId: actorHq.id,
        userId: actorTarget.id,
        roleKey: "website_editor",
        organizationId: orgA.id,
        churchId: churchA.id,
        scopeType: "church",
        scopeId: churchA.id,
        assignmentOrigin: "manual",
        assignmentReason: "dup",
        tenantContext: tenantA,
        actorChurchId: churchA.id,
      });
      assert.equal(first.ok, true);
      assert.equal(first.idempotent, true);
    });
  });

  describe("sensitive and highly sensitive", () => {
    it("sensitive assignment requires reason", async () => {
      requireDb();
      const attempt = await createRoleAssignment(pool, {
        actorUserId: actorHq.id,
        userId: actorMember.id,
        roleKey: "finance_officer",
        organizationId: orgA.id,
        churchId: churchA.id,
        scopeType: "church",
        scopeId: churchA.id,
        assignmentOrigin: "manual",
        assignmentReason: "",
        tenantContext: tenantA,
        actorChurchId: churchA.id,
      });
      assert.equal(attempt.ok, false);
      assert.equal(attempt.reason, "reason_required");
    });

    it("branch admin denied sensitive and highly sensitive", async () => {
      requireDb();
      for (const roleKey of ["finance_director", "safeguarding_officer", "website_publisher"]) {
        const attempt = await createRoleAssignment(pool, {
          actorUserId: actorBa.id,
          userId: actorMember.id,
          roleKey,
          organizationId: orgA.id,
          churchId: churchA.id,
          scopeType: "branch",
          scopeId: branchA.id,
          assignmentOrigin: "manual",
          assignmentReason: "should fail",
          tenantContext: tenantA,
          actorChurchId: churchA.id,
        });
        assert.equal(attempt.ok, false, roleKey);
        assert.equal(attempt.status, ASSIGN_STATUS.FORBIDDEN);
      }
    });

    it("self-assignment denied", async () => {
      requireDb();
      const attempt = await createRoleAssignment(pool, {
        actorUserId: actorHq.id,
        userId: actorHq.id,
        roleKey: "website_editor",
        organizationId: orgA.id,
        churchId: churchA.id,
        scopeType: "church",
        scopeId: churchA.id,
        assignmentOrigin: "manual",
        assignmentReason: "self",
        tenantContext: tenantA,
        actorChurchId: churchA.id,
      });
      assert.equal(attempt.ok, false);
      assert.equal(attempt.reason, "self_elevation");
    });

    it("platform scope forbidden from church HQ path", async () => {
      requireDb();
      const attempt = await createRoleAssignment(pool, {
        actorUserId: actorHq.id,
        userId: actorMember.id,
        roleKey: "website_editor",
        organizationId: orgA.id,
        churchId: null,
        scopeType: "platform",
        scopeId: null,
        assignmentOrigin: "manual",
        assignmentReason: "no",
        tenantContext: tenantA,
        actorChurchId: churchA.id,
        forbidPlatformScope: true,
      });
      assert.equal(attempt.ok, false);
      assert.equal(attempt.reason, "platform_scope_forbidden");
    });

    it("HQ may assign finance_officer with reason", async () => {
      requireDb();
      const created = await createRoleAssignment(pool, {
        actorUserId: actorHq.id,
        userId: actorMember.id,
        roleKey: "finance_officer",
        organizationId: orgA.id,
        churchId: churchA.id,
        scopeType: "church",
        scopeId: churchA.id,
        assignmentOrigin: "manual",
        assignmentReason: "approved finance officer",
        tenantContext: tenantA,
        actorChurchId: churchA.id,
      });
      assert.equal(created.ok, true, created.reason);
    });
  });

  describe("delegation", () => {
    it("finance director cannot assign pastoral role", async () => {
      requireDb();
      const attempt = await createRoleAssignment(pool, {
        actorUserId: actorFinance.id,
        userId: actorMember.id,
        roleKey: "branch_pastor",
        organizationId: orgA.id,
        churchId: churchA.id,
        scopeType: "branch",
        scopeId: branchA.id,
        assignmentOrigin: "manual",
        assignmentReason: "no",
        tenantContext: tenantA,
        actorChurchId: churchA.id,
      });
      assert.equal(attempt.ok, false);
    });

    it("pastor cannot assign finance role without role-admin", async () => {
      requireDb();
      const attempt = await createRoleAssignment(pool, {
        actorUserId: actorPastor.id,
        userId: actorMember.id,
        roleKey: "finance_officer",
        organizationId: orgA.id,
        churchId: churchA.id,
        scopeType: "church",
        scopeId: churchA.id,
        assignmentOrigin: "manual",
        assignmentReason: "no",
        tenantContext: tenantA,
        actorChurchId: churchA.id,
      });
      assert.equal(attempt.ok, false);
    });

    it("website publisher cannot assign finance role", async () => {
      requireDb();
      const attempt = await createRoleAssignment(pool, {
        actorUserId: actorPublisher.id,
        userId: actorMember.id,
        roleKey: "finance_officer",
        organizationId: orgA.id,
        churchId: churchA.id,
        scopeType: "church",
        scopeId: churchA.id,
        assignmentOrigin: "manual",
        assignmentReason: "no",
        tenantContext: tenantA,
        actorChurchId: churchA.id,
      });
      assert.equal(attempt.ok, false);
    });

    it("ministry leader denied finance/pastoral assignment", async () => {
      requireDb();
      const attempt = await createRoleAssignment(pool, {
        actorUserId: actorMinistry.id,
        userId: actorMember.id,
        roleKey: "finance_director",
        organizationId: orgA.id,
        churchId: churchA.id,
        scopeType: "church",
        scopeId: churchA.id,
        assignmentOrigin: "manual",
        assignmentReason: "no",
        tenantContext: tenantA,
        actorChurchId: churchA.id,
      });
      assert.equal(attempt.ok, false);
    });

    it("welfare officer cannot self-assign approver", async () => {
      requireDb();
      const attempt = await createRoleAssignment(pool, {
        actorUserId: actorWelfare.id,
        userId: actorWelfare.id,
        roleKey: "welfare_approver",
        organizationId: orgA.id,
        churchId: churchA.id,
        scopeType: "church",
        scopeId: churchA.id,
        assignmentOrigin: "manual",
        assignmentReason: "self",
        tenantContext: tenantA,
        actorChurchId: churchA.id,
      });
      assert.equal(attempt.ok, false);
      assert.equal(attempt.reason, "self_elevation");
    });

    it("forged branch id denied", async () => {
      requireDb();
      const attempt = await createRoleAssignment(pool, {
        actorUserId: actorHq.id,
        userId: actorMember.id,
        roleKey: "website_editor",
        organizationId: orgA.id,
        churchId: churchA.id,
        scopeType: "branch",
        scopeId: churchB.id,
        assignmentOrigin: "manual",
        assignmentReason: "forged",
        tenantContext: tenantA,
        actorChurchId: churchA.id,
      });
      assert.equal(attempt.ok, false);
      assert.ok(
        ["scope_ownership", "RBAC_INVALID_SCOPE", "excessive_delegation"].includes(attempt.reason),
        attempt.reason
      );
    });
  });

  describe("expiry and revocation", () => {
    it("past expiry rejected; future accepted; expired grants nothing", async () => {
      requireDb();
      const past = await createRoleAssignment(pool, {
        actorUserId: actorHq.id,
        userId: actorMember.id,
        roleKey: "website_editor",
        organizationId: orgA.id,
        churchId: churchA.id,
        scopeType: "church",
        scopeId: churchA.id,
        assignmentOrigin: "manual",
        assignmentReason: "past",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
        tenantContext: tenantA,
        actorChurchId: churchA.id,
      });
      assert.equal(past.ok, false);
      assert.equal(past.reason, "expires_at_past");

      const futureUser = await makeUser("expiry@staff-a.test", "Expiry");
      const future = await createRoleAssignment(pool, {
        actorUserId: actorHq.id,
        userId: futureUser.id,
        roleKey: "website_editor",
        organizationId: orgA.id,
        churchId: churchA.id,
        scopeType: "church",
        scopeId: churchA.id,
        assignmentOrigin: "manual",
        assignmentReason: "future",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        tenantContext: tenantA,
        actorChurchId: churchA.id,
      });
      assert.equal(future.ok, true, future.reason);

      await pool.query(
        `UPDATE blessboard.user_role_assignments
            SET expires_at = now() - interval '1 minute', updated_at = now()
          WHERE id = $1`,
        [future.assignment.id]
      );
      const authz = await authorize(pool, {
        actor: { userId: futureUser.id },
        permission: "website.edit",
        tenantContext: tenantA,
        resourceContext: { organizationId: orgA.id, churchId: churchA.id },
      });
      assert.equal(authz.allowed, false);
    });

    it("revocation requires reason for sensitive; preserves row; denies immediately", async () => {
      requireDb();
      const user = await makeUser("revoke@staff-a.test", "Revoke");
      const created = await createRoleAssignment(pool, {
        actorUserId: actorHq.id,
        userId: user.id,
        roleKey: "finance_officer",
        organizationId: orgA.id,
        churchId: churchA.id,
        scopeType: "church",
        scopeId: churchA.id,
        assignmentOrigin: "manual",
        assignmentReason: "temp",
        tenantContext: tenantA,
        actorChurchId: churchA.id,
      });
      assert.equal(created.ok, true, created.reason);

      const noReason = await revokeRoleAssignment(pool, {
        actorUserId: actorHq.id,
        assignmentId: created.assignment.id,
        revocationReason: "",
        tenantContext: tenantA,
        actorChurchId: churchA.id,
      });
      assert.equal(noReason.ok, false);
      assert.equal(noReason.reason, "reason_required");

      const revoked = await revokeRoleAssignment(pool, {
        actorUserId: actorHq.id,
        assignmentId: created.assignment.id,
        revocationReason: "no longer needed",
        tenantContext: tenantA,
        actorChurchId: churchA.id,
      });
      assert.equal(revoked.ok, true, revoked.reason);

      const row = await pool.query(
        `SELECT status FROM blessboard.user_role_assignments WHERE id = $1`,
        [created.assignment.id]
      );
      assert.equal(row.rows[0].status, "revoked");

      const authz = await authorize(pool, {
        actor: { userId: user.id },
        permission: "finance.transactions.view",
        tenantContext: tenantA,
        resourceContext: { organizationId: orgA.id, churchId: churchA.id },
      });
      assert.equal(authz.allowed, false);
    });
  });

  describe("effective permissions", () => {
    it("combines legacy and RBAC; distinguishes sources", async () => {
      requireDb();
      const detail = await getStaffAccessDetail(pool, {
        actorUserId: actorHq.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        tenantContext: tenantA,
        userId: actorHq.id,
      });
      assert.equal(detail.ok, true);
      const flat = Object.values(detail.effectiveGrouped || {}).flat();
      assert.ok(flat.some((p) => p.source === "legacy_compatibility" || p.source === "multiple_role_combination"));
      const effective = await listEffectivePermissions(pool, {
        actor: { userId: actorHq.id },
        tenantContext: tenantA,
        resourceContext: { organizationId: orgA.id, churchId: churchA.id },
      });
      assert.ok(effective.permissions.includes("roles.view"));
    });
  });

  describe("CSRF and HTTP validation", () => {
    it("missing CSRF denied on assign", async () => {
      requireDb();
      const cookie = await sessionCookie(actorHq);
      const res = await request(app)
        .post(`/hq/settings/staff-access/${actorMember.id}/assign`)
        .set("Host", HOST_A)
        .set("Cookie", cookie)
        .type("form")
        .send({
          role_key: "website_editor",
          scope_type: "church",
          scope_id: churchA.id,
        });
      assert.equal(res.status, 403);
    });

    it("valid CSRF assign redirects", async () => {
      requireDb();
      const cookie = await sessionCookie(actorHq);
      const page = await request(app)
        .get(`/hq/settings/staff-access/${actorTarget.id}`)
        .set("Host", HOST_A)
        .set("Cookie", cookie);
      assert.equal(page.status, 200);
      const csrf = extractCookie(page, CSRF_COOKIE);
      assert.ok(csrf);
      const user = await makeUser("csrf-ok@staff-a.test", "CSRF OK");
      await assignCatalogueRole(user.id, "website_editor", {
        scopeType: "church",
        scopeId: churchA.id,
      });
      const res = await request(app)
        .post(`/hq/settings/staff-access/${user.id}/assign`)
        .set("Host", HOST_A)
        .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrf}`)
        .type("form")
        .send({
          [CSRF_FIELD]: csrf,
          role_key: "website_editor",
          scope_type: "branch",
          scope_id: branchA2.id,
          assignment_reason: "http assign",
        });
      assert.ok([302, 303].includes(res.status));
      assert.match(String(res.headers.location || ""), /notice=/);
    });
  });

  describe("access audit", () => {
    it("lists assignment events for organisation", async () => {
      requireDb();
      const audit = await listAccessAudit(pool, {
        actorUserId: actorHq.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        tenantContext: tenantA,
      });
      assert.equal(audit.ok, true);
      assert.ok(Array.isArray(audit.events));
    });
  });
});
