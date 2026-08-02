"use strict";

/**
 * BlessBoard V5 RBAC foundation tests (ephemeral Postgres).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const {
  authorize,
  listEffectivePermissions,
  REASON,
  PERMISSION_KEY_RE,
} = require("../src/blessboard/services/blessBoardRbacAuthorizationService");
const {
  createRoleAssignment,
  revokeRoleAssignment,
  validateAssignmentScope,
  STATUS: ASSIGN_STATUS,
} = require("../src/blessboard/services/blessBoardRoleAssignmentService");
const rbacRepo = require("../src/blessboard/repositories/blessBoardRbacRepository");
const {
  PLATFORM_ADMIN_PERMISSIONS,
  CHURCH_HQ_ADMIN_PERMISSIONS,
  BRANCH_ADMIN_PERMISSIONS,
  permissionsForLegacyRoleKey,
} = require("../src/blessboard/rbac/legacyCompatibilityPermissions");
const { makeResolvedTenantContext } = require("./helpers/blessboardV5Fixtures");

describe("blessboard RBAC foundation", () => {
  let databaseUrl;
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let orgA;
  let orgB;
  let churchA;
  let churchB;
  let branchA;
  let branchA2;
  let branchB;
  let tenantA;
  let tenantA2;
  let tenantB;
  let actorHq;
  let actorBa;
  let actorPa;
  let actorMember;
  let targetUser;
  let targetUser2;

  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });

      const platformA = await provisionPlatformTenant(pool, {
        organizationKey: "rbac-org-a",
        displayName: "RBAC Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "rbac-org-a",
        hostname: "rbac-a.blessboard.test",
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      orgA = platformA.records.organization;

      const platformB = await provisionPlatformTenant(pool, {
        organizationKey: "rbac-org-b",
        displayName: "RBAC Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "rbac-org-b",
        hostname: "rbac-b.blessboard.test",
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      orgB = platformB.records.organization;

      const churchProvA = await provisionBlessBoardChurch(pool, {
        organizationKey: "rbac-org-a",
        churchKey: "rbac-org-a",
        displayName: "RBAC Org A",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
      });
      churchA = churchProvA.records.church;
      branchA = churchProvA.records.hqBranch;

      const campus = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-2', 'Campus 2', 'branch', 'active', false, 'Africa/Lusaka', 'ZM')
         RETURNING id, branch_key, display_name`,
        [churchA.id]
      );
      branchA2 = {
        id: campus.rows[0].id,
        branchKey: campus.rows[0].branch_key,
        displayName: campus.rows[0].display_name,
      };

      const churchProvB = await provisionBlessBoardChurch(pool, {
        organizationKey: "rbac-org-b",
        churchKey: "rbac-org-b",
        displayName: "RBAC Org B",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
      });
      churchB = churchProvB.records.church;
      branchB = churchProvB.records.hqBranch;

      tenantA = makeResolvedTenantContext({
        organization: orgA,
        church: churchA,
        primaryBranch: branchA,
        hqBranch: branchA,
      });
      tenantA2 = makeResolvedTenantContext({
        organization: orgA,
        church: churchA,
        primaryBranch: branchA2,
        hqBranch: branchA,
      });
      tenantB = makeResolvedTenantContext({
        organization: orgB,
        church: churchB,
        primaryBranch: branchB,
        hqBranch: branchB,
      });

      async function mkUser(email, name) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName: name,
          password: "Test-Password-123!",
        });
        if (!created.ok) throw new Error(`user create failed: ${created.message || created.reason}`);
        return created.user;
      }

      actorHq = await mkUser("hq@rbac-a.test", "HQ Admin");
      actorBa = await mkUser("ba@rbac-a.test", "Branch Admin");
      actorPa = await mkUser("pa@rbac.test", "Platform Admin");
      actorMember = await mkUser("member@rbac-a.test", "Member Only");
      targetUser = await mkUser("target@rbac-a.test", "Target User");
      targetUser2 = await mkUser("target2@rbac-a.test", "Target User 2");

      for (const assign of [
        {
          email: "pa@rbac.test",
          organizationKey: "rbac-org-a",
          roleKey: "platform_admin",
        },
        {
          email: "hq@rbac-a.test",
          organizationKey: "rbac-org-a",
          roleKey: "church_hq_admin",
          churchKey: "rbac-org-a",
        },
        {
          email: "ba@rbac-a.test",
          organizationKey: "rbac-org-a",
          roleKey: "branch_admin",
          churchKey: "rbac-org-a",
          branchKey: "hq",
        },
      ]) {
        const r = await assignBlessBoardRole(pool, assign);
        if (!r.ok) throw new Error(`role assign failed: ${r.status || r.message}`);
      }
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  describe("permission catalogue", () => {
    it("valid permission key accepted", async () => {
      requireDb();
      const perm = await rbacRepo.findPermissionByKey(pool, "members.view");
      assert.ok(perm);
      assert.equal(perm.isActive, true);
      assert.match(perm.permissionKey, PERMISSION_KEY_RE);
    });

    it("malformed permission key rejected", async () => {
      requireDb();
      const result = await authorize(pool, {
        actor: { userId: actorHq.id },
        permission: "MembersView",
        tenantContext: tenantA,
      });
      assert.equal(result.allowed, false);
      assert.equal(result.reasonCode, REASON.PERMISSION_UNKNOWN);
    });

    it("unknown permission denied", async () => {
      requireDb();
      const result = await authorize(pool, {
        actor: { userId: actorHq.id },
        permission: "pastoral.cases.view_highly_confidential",
        tenantContext: tenantA,
      });
      assert.equal(result.allowed, false);
      assert.equal(result.reasonCode, REASON.PERMISSION_UNKNOWN);
    });

    it("inactive permission denied", async () => {
      requireDb();
      await pool.query(
        `UPDATE blessboard.permissions SET is_active = false, updated_at = now()
          WHERE permission_key = 'data.export'`
      );
      try {
        const result = await authorize(pool, {
          actor: { userId: actorHq.id },
          permission: "data.export",
          tenantContext: tenantA,
        });
        assert.equal(result.allowed, false);
        assert.equal(result.reasonCode, REASON.PERMISSION_INACTIVE);
      } finally {
        await pool.query(
          `UPDATE blessboard.permissions SET is_active = true, updated_at = now()
            WHERE permission_key = 'data.export'`
        );
      }
    });
  });

  describe("multi-role behaviour", () => {
    it("permissions combine across two active assignments", async () => {
      requireDb();
      const editor = await rbacRepo.findRoleByKey(pool, "website_editor");
      const auditor = await rbacRepo.findRoleByKey(pool, "auditor");
      const a1 = await rbacRepo.insertAssignment(pool, {
        userId: targetUser.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        roleId: editor.id,
        scopeType: "church",
        scopeId: churchA.id,
        assignedByUserId: actorHq.id,
        assignmentOrigin: "system",
        assignmentReason: "test multi-role editor",
      });
      const a2 = await rbacRepo.insertAssignment(pool, {
        userId: targetUser.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        roleId: auditor.id,
        scopeType: "church",
        scopeId: churchA.id,
        assignedByUserId: actorHq.id,
        assignmentOrigin: "system",
        assignmentReason: "test multi-role auditor",
      });
      assert.ok(a1.id);
      assert.ok(a2.id);

      const edit = await authorize(pool, {
        actor: { userId: targetUser.id },
        permission: "website.edit",
        tenantContext: tenantA,
      });
      const audit = await authorize(pool, {
        actor: { userId: targetUser.id },
        permission: "audit.view",
        tenantContext: tenantA,
      });
      assert.equal(edit.allowed, true);
      assert.equal(audit.allowed, true);

      const listed = await listEffectivePermissions(pool, {
        actor: { userId: targetUser.id },
        tenantContext: tenantA,
      });
      assert.ok(listed.permissions.includes("website.edit"));
      assert.ok(listed.permissions.includes("audit.view"));
      assert.equal(listed.permissions.filter((p) => p === "website.edit").length, 1);
    });

    it("one revoked role does not cancel unrelated active roles", async () => {
      requireDb();
      const rows = await rbacRepo.listActiveAssignmentsForUser(pool, targetUser.id, orgA.id);
      const editor = rows.find((r) => r.roleKey === "website_editor");
      assert.ok(editor);
      await rbacRepo.revokeAssignment(pool, {
        assignmentId: editor.id,
        revokedByUserId: actorHq.id,
        revocationReason: "test revoke one",
      });
      const edit = await authorize(pool, {
        actor: { userId: targetUser.id },
        permission: "website.edit",
        tenantContext: tenantA,
      });
      const audit = await authorize(pool, {
        actor: { userId: targetUser.id },
        permission: "audit.view",
        tenantContext: tenantA,
      });
      assert.equal(edit.allowed, false);
      assert.equal(audit.allowed, true);
    });
  });

  describe("status and expiry", () => {
    it("revoked assignment denied", async () => {
      requireDb();
      const publisher = await rbacRepo.findRoleByKey(pool, "website_publisher");
      const created = await rbacRepo.insertAssignment(pool, {
        userId: targetUser2.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        roleId: publisher.id,
        scopeType: "church",
        scopeId: churchA.id,
        assignedByUserId: actorHq.id,
        assignmentOrigin: "system",
        assignmentReason: "expiry suite",
      });
      await rbacRepo.revokeAssignment(pool, {
        assignmentId: created.id,
        revokedByUserId: actorHq.id,
        revocationReason: "revoked",
      });
      const result = await authorize(pool, {
        actor: { userId: targetUser2.id },
        permission: "website.publish",
        tenantContext: tenantA,
      });
      assert.equal(result.allowed, false);
    });

    it("expired assignment denied; future and null expiry remain active", async () => {
      requireDb();
      const officer = await rbacRepo.findRoleByKey(pool, "finance_officer");
      const expired = await rbacRepo.insertAssignment(pool, {
        userId: targetUser2.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        roleId: officer.id,
        scopeType: "church",
        scopeId: churchA.id,
        assignedByUserId: actorHq.id,
        assignmentOrigin: "system",
        assignmentReason: "expired grant",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      const future = await rbacRepo.insertAssignment(pool, {
        userId: targetUser2.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        roleId: officer.id,
        scopeType: "branch",
        scopeId: branchA.id,
        assignedByUserId: actorHq.id,
        assignmentOrigin: "system",
        assignmentReason: "future grant",
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
      assert.ok(expired.id);
      assert.ok(future.id);

      const denied = await authorize(pool, {
        actor: { userId: targetUser2.id },
        permission: "giving.record",
        tenantContext: tenantA,
        resourceContext: {
          organizationId: orgA.id,
          churchId: churchA.id,
          branchId: branchA.id,
        },
      });
      // future branch-scoped assignment should allow
      assert.equal(denied.allowed, true);

      const pastOnly = await authorize(pool, {
        actor: { userId: targetUser2.id },
        permission: "giving.record",
        tenantContext: tenantA2,
        resourceContext: {
          organizationId: orgA.id,
          churchId: churchA.id,
          branchId: branchA2.id,
        },
      });
      assert.equal(pastOnly.allowed, false);

      const marked = await pool.query(
        `SELECT status FROM blessboard.user_role_assignments WHERE id = $1`,
        [expired.id]
      );
      assert.equal(marked.rows[0].status, "expired");
    });
  });

  describe("scope", () => {
    it("organisation/church/branch scope enforced; cross-org insert rejected", async () => {
      requireDb();
      const okOrg = validateAssignmentScope({
        scopeType: "organisation",
        organizationId: orgA.id,
        userId: targetUser.id,
      });
      assert.equal(okOrg.ok, true);

      const badType = validateAssignmentScope({
        scopeType: "ministry",
        organizationId: orgA.id,
        userId: targetUser.id,
      });
      assert.equal(badType.ok, false);

      const mismatch = validateAssignmentScope({
        scopeType: "church",
        organizationId: orgA.id,
        churchId: churchA.id,
        scopeId: churchB.id,
        userId: targetUser.id,
      });
      assert.equal(mismatch.ok, false);

      const role = await rbacRepo.findRoleByKey(pool, "website_editor");
      await assert.rejects(async () => {
        await pool.query(
          `INSERT INTO blessboard.user_role_assignments (
             user_id, organization_id, church_id, role_id, scope_type, scope_id,
             status, assignment_origin, assignment_reason
           ) VALUES ($1,$2,$3,$4,'church',$5,'active','system','cross-org')`,
          [targetUser.id, orgA.id, churchB.id, role.id, churchB.id]
        );
      });

      const hqOwn = await authorize(pool, {
        actor: { userId: actorHq.id },
        permission: "members.view",
        tenantContext: tenantA,
      });
      const hqOther = await authorize(pool, {
        actor: { userId: actorHq.id },
        permission: "members.view",
        tenantContext: tenantB,
      });
      assert.equal(hqOwn.allowed, true);
      assert.equal(hqOther.allowed, false);

      const baOwn = await authorize(pool, {
        actor: { userId: actorBa.id },
        permission: "members.view",
        tenantContext: tenantA,
      });
      const baOtherBranch = await authorize(pool, {
        actor: { userId: actorBa.id },
        permission: "members.view",
        tenantContext: tenantA2,
        resourceContext: {
          organizationId: orgA.id,
          churchId: churchA.id,
          branchId: branchA2.id,
        },
      });
      assert.equal(baOwn.allowed, true);
      assert.equal(baOtherBranch.allowed, false);
    });
  });

  describe("sensitive permissions", () => {
    it("broad standard role does not receive sensitive permission", async () => {
      requireDb();
      assert.ok(!BRANCH_ADMIN_PERMISSIONS.includes("giving.approve"));
      assert.ok(!BRANCH_ADMIN_PERMISSIONS.includes("roles.assign_sensitive"));
      const result = await authorize(pool, {
        actor: { userId: actorBa.id },
        permission: "giving.approve",
        tenantContext: tenantA,
      });
      assert.equal(result.allowed, false);
    });

    it("no sensitive permission inheritance through role naming", async () => {
      requireDb();
      // ministry_leader has intentional journey map — must not inherit finance/pastor keys by name
      const role = await rbacRepo.findRoleByKey(pool, "ministry_leader");
      const keys = await rbacRepo.listPermissionKeysForRoleId(pool, role.id);
      assert.ok(keys.length > 0);
      assert.ok(keys.includes("ministries.view"));
      assert.ok(!keys.includes("giving.approve"));
      assert.ok(!keys.includes("giving.void"));
      assert.ok(!keys.includes("roles.assign_sensitive"));
      assert.ok(!keys.includes("pastoral.cases.view"));
      assert.ok(!keys.includes("classes.completion.approve"));
      assert.ok(!keys.includes("journey_handovers.escalate"));
    });

    it("standard role assignment authority cannot assign sensitive roles", async () => {
      requireDb();
      // Branch admin lacks roles.assign_sensitive / assign_standard
      const attempt = await createRoleAssignment(pool, {
        actorUserId: actorBa.id,
        userId: targetUser.id,
        roleKey: "website_publisher",
        organizationId: orgA.id,
        churchId: churchA.id,
        scopeType: "church",
        scopeId: churchA.id,
        assignmentOrigin: "manual",
        assignmentReason: "should fail",
        tenantContext: tenantA,
        actorChurchId: churchA.id,
      });
      assert.equal(attempt.ok, false);
      assert.equal(attempt.status, ASSIGN_STATUS.FORBIDDEN);
    });
  });

  describe("legacy compatibility", () => {
    it("active legacy roles retain documented bundles; inactive grant nothing", async () => {
      requireDb();
      assert.ok(PLATFORM_ADMIN_PERMISSIONS.includes("audit.view"));
      assert.ok(!PLATFORM_ADMIN_PERMISSIONS.includes("data.export"));
      assert.ok(CHURCH_HQ_ADMIN_PERMISSIONS.includes("giving.approve"));
      assert.ok(BRANCH_ADMIN_PERMISSIONS.includes("giving.record"));
      assert.ok(!BRANCH_ADMIN_PERMISSIONS.includes("giving.approve"));
      assert.deepEqual(permissionsForLegacyRoleKey("unknown"), []);

      const pa = await authorize(pool, {
        actor: { userId: actorPa.id },
        permission: "organisation.settings.manage",
        tenantContext: tenantB,
      });
      assert.equal(pa.allowed, true);

      const hq = await authorize(pool, {
        actor: { userId: actorHq.id },
        permission: "website.publish",
        tenantContext: tenantA,
      });
      assert.equal(hq.allowed, true);

      const ba = await authorize(pool, {
        actor: { userId: actorBa.id },
        permission: "giving.submit",
        tenantContext: tenantA,
      });
      assert.equal(ba.allowed, true);

      // Suspend legacy BA role
      await pool.query(
        `UPDATE blessboard.user_roles SET status = 'suspended', updated_at = now()
          WHERE user_id = $1 AND role_key = 'branch_admin'`,
        [actorBa.id]
      );
      try {
        const suspended = await authorize(pool, {
          actor: { userId: actorBa.id },
          permission: "giving.submit",
          tenantContext: tenantA,
        });
        assert.equal(suspended.allowed, false);
      } finally {
        await pool.query(
          `UPDATE blessboard.user_roles SET status = 'active', updated_at = now()
            WHERE user_id = $1 AND role_key = 'branch_admin'`,
          [actorBa.id]
        );
      }

      // PA must not auto-receive unknown pastoral-confidential permission
      const pastoral = await authorize(pool, {
        actor: { userId: actorPa.id },
        permission: "pastoral.cases.view_highly_confidential",
        tenantContext: tenantA,
      });
      assert.equal(pastoral.allowed, false);
      assert.equal(pastoral.reasonCode, REASON.PERMISSION_UNKNOWN);
    });
  });

  describe("default denial", () => {
    it("authenticated user with no matching role is denied; member gains no staff perms; unresolved tenant denied", async () => {
      requireDb();
      const none = await authorize(pool, {
        actor: { userId: actorMember.id },
        permission: "members.view",
        tenantContext: tenantA,
      });
      assert.equal(none.allowed, false);
      assert.equal(none.reasonCode, REASON.PERMISSION_DENIED);

      const unresolved = await authorize(pool, {
        actor: { userId: actorHq.id },
        permission: "members.view",
        tenantContext: { resolved: false },
      });
      assert.equal(unresolved.allowed, false);
      assert.equal(unresolved.reasonCode, REASON.TENANT_UNRESOLVED);

      const wrongTenant = await authorize(pool, {
        actor: { userId: actorHq.id },
        permission: "members.view",
        tenantContext: tenantB,
      });
      assert.equal(wrongTenant.allowed, false);
    });
  });

  describe("assignment service revoke preserves row", () => {
    it("revoke updates status and writes event; no hard delete", async () => {
      requireDb();
      const created = await createRoleAssignment(pool, {
        actorUserId: actorHq.id,
        userId: targetUser.id,
        roleKey: "website_editor",
        organizationId: orgA.id,
        churchId: churchA.id,
        scopeType: "branch",
        scopeId: branchA2.id,
        assignmentOrigin: "manual",
        assignmentReason: "branch website editor",
        tenantContext: tenantA2,
        actorChurchId: churchA.id,
      });
      assert.equal(created.ok, true, created.reason);

      const revoked = await revokeRoleAssignment(pool, {
        actorUserId: actorHq.id,
        assignmentId: created.assignment.id,
        revocationReason: "test revoke",
        tenantContext: tenantA2,
        actorChurchId: churchA.id,
      });
      assert.equal(revoked.ok, true);

      const row = await pool.query(
        `SELECT status FROM blessboard.user_role_assignments WHERE id = $1`,
        [created.assignment.id]
      );
      assert.equal(row.rows[0].status, "revoked");

      const ev = await pool.query(
        `SELECT event_key FROM blessboard.user_role_assignment_events
          WHERE assignment_id = $1 ORDER BY created_at`,
        [created.assignment.id]
      );
      assert.ok(ev.rows.some((r) => r.event_key === "rbac.assignment.created"));
      assert.ok(ev.rows.some((r) => r.event_key === "rbac.assignment.revoked"));
    });
  });
});
