"use strict";

/**
 * BlessBoard V5 member-journey domain foundation tests (ephemeral Postgres).
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
  REASON,
} = require("../src/blessboard/services/blessBoardRbacAuthorizationService");
const rbacRepo = require("../src/blessboard/repositories/blessBoardRbacRepository");
const {
  canTransition,
  previousStageMayEdit,
  createJourneyContact,
  createHandover,
  updateHandoverCore,
  submitHandover,
  acceptHandover,
  returnHandover,
  assignHandover,
  completeHandover,
  closeHandover,
} = require("../src/blessboard/services/memberJourneyHandoverService");
const {
  createCell,
  assignMemberToCell,
  createClassProgram,
  createClassCohort,
  enrolMember,
  createDepartment,
  addDepartmentMember,
} = require("../src/blessboard/services/memberJourneyDomainService");
const {
  PLATFORM_ADMIN_PERMISSIONS,
  BRANCH_ADMIN_PERMISSIONS,
} = require("../src/blessboard/rbac/legacyCompatibilityPermissions");
const { makeResolvedTenantContext } = require("./helpers/blessboardV5Fixtures");

describe("blessboard member journey foundation", () => {
  let databaseUrl;
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let orgA;
  let orgB;
  let churchA;
  let churchB;
  let branchA;
  let branchB;
  let tenantA;
  let tenantB;
  let actorHq;
  let actorReg;
  let actorFt;
  let actorCellLeader;
  let actorDeptHead;
  let actorClassCoord;
  let actorPa;
  let memberA;
  let memberB;
  let ministryA;
  let cellA;
  let cellB;
  let departmentA;
  let cohortA;

  before(async () => {
    process.env.PLATFORM_DEPLOYMENT_CODE = "blessboard-org-staging";
    process.env.DEPLOYMENT_ENV = "testing";
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });

      const platformA = await provisionPlatformTenant(pool, {
        organizationKey: "mj-org-a",
        displayName: "MJ Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "mj-org-a",
        hostname: "mj-a.blessboard.test",
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      orgA = platformA.records.organization;

      const platformB = await provisionPlatformTenant(pool, {
        organizationKey: "mj-org-b",
        displayName: "MJ Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "mj-org-b",
        hostname: "mj-b.blessboard.test",
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      orgB = platformB.records.organization;

      const churchProvA = await provisionBlessBoardChurch(pool, {
        organizationKey: "mj-org-a",
        churchKey: "mj-org-a",
        displayName: "MJ Org A",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
      });
      churchA = churchProvA.records.church;
      branchA = churchProvA.records.hqBranch;

      const churchProvB = await provisionBlessBoardChurch(pool, {
        organizationKey: "mj-org-b",
        churchKey: "mj-org-b",
        displayName: "MJ Org B",
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

      actorHq = await mkUser("hq@mj-a.test", "HQ Admin");
      actorReg = await mkUser("reg@mj-a.test", "Registration Officer");
      actorFt = await mkUser("ft@mj-a.test", "First Timers");
      actorCellLeader = await mkUser("cell@mj-a.test", "Cell Leader");
      actorDeptHead = await mkUser("dept@mj-a.test", "Dept Head");
      actorClassCoord = await mkUser("class@mj-a.test", "Classes Coord");
      actorPa = await mkUser("pa@mj.test", "Platform Admin");

      for (const assign of [
        {
          email: "pa@mj.test",
          organizationKey: "mj-org-a",
          roleKey: "platform_admin",
        },
        {
          email: "hq@mj-a.test",
          organizationKey: "mj-org-a",
          roleKey: "church_hq_admin",
          churchKey: "mj-org-a",
        },
      ]) {
        const r = await assignBlessBoardRole(pool, assign);
        if (!r.ok) throw new Error(`role assign failed: ${r.status || r.message}`);
      }

      async function assignCatalogueRole(userId, roleKey, scope) {
        const role = await rbacRepo.findRoleByKey(pool, roleKey);
        if (!role) throw new Error(`missing role ${roleKey}`);
        return rbacRepo.insertAssignment(pool, {
          userId,
          organizationId: orgA.id,
          churchId: churchA.id,
          roleId: role.id,
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
          assignedByUserId: actorHq.id,
          assignmentOrigin: "manual",
          assignmentReason: "journey foundation test",
        });
      }

      await assignCatalogueRole(actorReg.id, "registration_officer", {
        scopeType: "church",
        scopeId: churchA.id,
      });
      await assignCatalogueRole(actorFt.id, "first_timers_coordinator", {
        scopeType: "church",
        scopeId: churchA.id,
      });
      await assignCatalogueRole(actorClassCoord.id, "classes_coordinator", {
        scopeType: "church",
        scopeId: churchA.id,
      });

      const ministryIns = await pool.query(
        `INSERT INTO blessboard.ministries
           (church_id, branch_id, organization_id, name, ministry_key, ministry_type, status)
         VALUES ($1, $2, $3, 'Evangelism', 'evangelism', 'evangelism', 'published')
         RETURNING id`,
        [churchA.id, branchA.id, orgA.id]
      );
      ministryA = { id: ministryIns.rows[0].id };

      const cellCreated = await createCell(pool, {
        actorUserId: actorHq.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: branchA.id,
        tenantContext: tenantA,
        cellKey: "cell_alpha",
        displayName: "Cell Alpha",
        primaryLeaderUserId: actorCellLeader.id,
      });
      if (!cellCreated.ok) throw new Error(`cell create: ${cellCreated.reason}`);
      cellA = cellCreated.cell;

      const cell2 = await createCell(pool, {
        actorUserId: actorHq.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: branchA.id,
        tenantContext: tenantA,
        cellKey: "cell_beta",
        displayName: "Cell Beta",
      });
      if (!cell2.ok) throw new Error(`cell2 create: ${cell2.reason}`);
      cellB = cell2.cell;

      await assignCatalogueRole(actorCellLeader.id, "cell_leader", {
        scopeType: "cell",
        scopeId: cellA.id,
      });

      const dept = await createDepartment(pool, {
        actorUserId: actorHq.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: branchA.id,
        tenantContext: tenantA,
        departmentKey: "ushering",
        displayName: "Ushering",
        ministryId: ministryA.id,
      });
      if (!dept.ok) throw new Error(`dept create: ${dept.reason}`);
      departmentA = dept.department;

      await assignCatalogueRole(actorDeptHead.id, "department_head", {
        scopeType: "department",
        scopeId: departmentA.id,
      });

      const program = await createClassProgram(pool, {
        actorUserId: actorHq.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        tenantContext: tenantA,
        programKey: "orientation",
        displayName: "Orientation",
        programType: "orientation",
      });
      if (!program.ok) throw new Error(`program: ${program.reason}`);

      const cohort = await createClassCohort(pool, {
        actorUserId: actorHq.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: branchA.id,
        tenantContext: tenantA,
        programId: program.program.id,
        cohortKey: "orient_2026",
        displayName: "Orientation 2026",
        startsOn: "2026-01-01",
      });
      if (!cohort.ok) throw new Error(`cohort: ${cohort.reason}`);
      cohortA = cohort.cohort;

      async function mkMember(user, email, first, last, phoneNorm) {
        const row = await pool.query(
          `INSERT INTO blessboard.members
             (church_id, user_id, first_name, last_name, preferred_name,
              email_normalized, email_display, phone_normalized, phone_display, status)
           VALUES ($1, $2, $3, $4, $3, $5, $5, $6, $6, 'active')
           RETURNING id`,
          [churchA.id, user.id, first, last, email, phoneNorm]
        );
        await pool.query(
          `INSERT INTO blessboard.member_branch_memberships
             (member_id, branch_id, membership_status, is_primary, joined_at)
           VALUES ($1, $2, 'active', true, now())`,
          [row.rows[0].id, branchA.id]
        );
        return { id: row.rows[0].id };
      }

      const memberUserA = await mkUser("member-a@mj-a.test", "Member A");
      const memberUserB = await mkUser("member-b@mj-a.test", "Member B");
      memberA = await mkMember(memberUserA, "member-a@mj-a.test", "Member", "A", "+15550000011");
      memberB = await mkMember(memberUserB, "member-b@mj-a.test", "Member", "B", "+15550000012");
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

  describe("schema and ownership", () => {
    it("rejects cross-organisation cell insert", async () => {
      requireDb();
      await assert.rejects(
        () =>
          pool.query(
            `INSERT INTO blessboard.cells
               (organization_id, church_id, branch_id, cell_key, display_name)
             VALUES ($1, $2, $3, 'xcell', 'X')`,
            [orgB.id, churchA.id, branchA.id]
          ),
        /mismatch|integrity|church\/org/i
      );
    });

    it("rejects cross-church department insert", async () => {
      requireDb();
      await assert.rejects(
        () =>
          pool.query(
            `INSERT INTO blessboard.departments
               (organization_id, church_id, branch_id, department_key, display_name)
             VALUES ($1, $2, $3, 'xdept', 'X')`,
            [orgA.id, churchB.id, branchA.id]
          ),
        /mismatch|integrity|church/i
      );
    });

    it("rejects cross-branch cell insert", async () => {
      requireDb();
      await assert.rejects(
        () =>
          pool.query(
            `INSERT INTO blessboard.cells
               (organization_id, church_id, branch_id, cell_key, display_name)
             VALUES ($1, $2, $3, 'xbranch', 'X')`,
            [orgA.id, churchA.id, branchB.id]
          ),
        /mismatch|integrity|branch/i
      );
    });

    it("rejects journey contact with wrong org/church", async () => {
      requireDb();
      await assert.rejects(
        () =>
          pool.query(
            `INSERT INTO blessboard.journey_contacts
               (organization_id, church_id, branch_id, first_name, last_name,
                email_normalized, email_display, source_type, created_by_user_id)
             VALUES ($1, $2, $3, 'A', 'B', 'a@x.test', 'a@x.test', 'manual', $4)`,
            [orgB.id, churchA.id, branchA.id, actorHq.id]
          ),
        /mismatch|integrity|church\/org/i
      );
    });

    it("prevents duplicate active primary cell membership", async () => {
      requireDb();
      const first = await assignMemberToCell(pool, {
        actorUserId: actorHq.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: branchA.id,
        tenantContext: tenantA,
        cellId: cellA.id,
        memberId: memberA.id,
      });
      assert.equal(first.ok, true, first.reason);

      const second = await assignMemberToCell(pool, {
        actorUserId: actorHq.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: branchA.id,
        tenantContext: tenantA,
        cellId: cellB.id,
        memberId: memberA.id,
      });
      assert.equal(second.ok, true, second.reason);

      const active = await pool.query(
        `SELECT cell_id FROM blessboard.cell_memberships
          WHERE member_id = $1 AND status = 'active' AND is_primary = true`,
        [memberA.id]
      );
      assert.equal(active.rows.length, 1);
      assert.equal(active.rows[0].cell_id, cellB.id);
    });

    it("prevents duplicate active class enrolment in same cohort", async () => {
      requireDb();
      const first = await enrolMember(pool, {
        actorUserId: actorHq.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: branchA.id,
        tenantContext: tenantA,
        cohortId: cohortA.id,
        memberId: memberB.id,
      });
      assert.equal(first.ok, true, first.reason);

      const second = await enrolMember(pool, {
        actorUserId: actorHq.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: branchA.id,
        tenantContext: tenantA,
        cohortId: cohortA.id,
        memberId: memberB.id,
      });
      assert.equal(second.ok, false);
      assert.ok(
        second.status === "conflict" || /duplicate|unique|already/i.test(String(second.reason))
      );
    });

    it("rejects ministry RBAC scope for wrong organisation", async () => {
      requireDb();
      const role = await rbacRepo.findRoleByKey(pool, "ministry_leader");
      await assert.rejects(
        () =>
          rbacRepo.insertAssignment(pool, {
            userId: actorReg.id,
            organizationId: orgB.id,
            churchId: churchB.id,
            roleId: role.id,
            scopeType: "ministry",
            scopeId: ministryA.id,
            assignedByUserId: actorHq.id,
            assignmentOrigin: "manual",
          }),
        /ownership mismatch|integrity/i
      );
    });
  });

  describe("handover state machine", () => {
    it("allows documented transitions and rejects invalid ones", () => {
      assert.equal(canTransition("draft", "submitted"), true);
      assert.equal(canTransition("submitted", "accepted"), true);
      assert.equal(canTransition("submitted", "returned"), true);
      assert.equal(canTransition("accepted", "assigned"), true);
      assert.equal(canTransition("accepted", "completed"), true);
      assert.equal(canTransition("assigned", "completed"), true);
      assert.equal(canTransition("accepted", "escalated"), true);
      assert.equal(canTransition("assigned", "escalated"), true);
      assert.equal(canTransition("completed", "closed"), true);
      assert.equal(canTransition("returned", "submitted"), true);
      assert.equal(canTransition("draft", "accepted"), false);
      assert.equal(canTransition("closed", "submitted"), false);
      assert.equal(previousStageMayEdit("draft"), true);
      assert.equal(previousStageMayEdit("accepted"), false);
    });

    it("runs happy path with immutable events and edit denial after accept", async () => {
      requireDb();
      const contact = await createJourneyContact(pool, {
        actorUserId: actorReg.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: branchA.id,
        tenantContext: tenantA,
        firstName: "Visitor",
        lastName: "One",
        email: "visitor1@mj-a.test",
        sourceType: "manual",
      });
      assert.equal(contact.ok, true, contact.reason);

      const created = await createHandover(pool, {
        actorUserId: actorReg.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: branchA.id,
        tenantContext: tenantA,
        journeyContactId: contact.contact.id,
        fromStage: "registration",
        toStage: "first_timers",
        notesSummary: "desk note",
      });
      assert.equal(created.ok, true, created.reason);

      const submitted = await submitHandover(pool, {
        actorUserId: actorReg.id,
        churchId: churchA.id,
        handoverId: created.handover.id,
        tenantContext: tenantA,
      });
      assert.equal(submitted.ok, true, submitted.reason);

      const badReturn = await returnHandover(pool, {
        actorUserId: actorFt.id,
        churchId: churchA.id,
        handoverId: created.handover.id,
        tenantContext: tenantA,
        returnReason: "",
      });
      assert.equal(badReturn.ok, false);
      assert.equal(badReturn.reason, "return_reason");

      const accepted = await acceptHandover(pool, {
        actorUserId: actorFt.id,
        churchId: churchA.id,
        handoverId: created.handover.id,
        tenantContext: tenantA,
      });
      assert.equal(accepted.ok, true, accepted.reason);

      const editDenied = await updateHandoverCore(pool, {
        actorUserId: actorReg.id,
        churchId: churchA.id,
        handoverId: created.handover.id,
        tenantContext: tenantA,
        notesSummary: "should fail",
      });
      assert.equal(editDenied.ok, false);
      assert.equal(editDenied.reason, "previous_stage_edit_denied");

      const assigned = await assignHandover(pool, {
        actorUserId: actorFt.id,
        churchId: churchA.id,
        handoverId: created.handover.id,
        tenantContext: tenantA,
        assignedUserId: actorFt.id,
      });
      assert.equal(assigned.ok, true, assigned.reason);

      const completed = await completeHandover(pool, {
        actorUserId: actorFt.id,
        churchId: churchA.id,
        handoverId: created.handover.id,
        tenantContext: tenantA,
      });
      assert.equal(completed.ok, true, completed.reason);

      const closed = await closeHandover(pool, {
        actorUserId: actorHq.id,
        churchId: churchA.id,
        handoverId: created.handover.id,
        tenantContext: tenantA,
      });
      assert.equal(closed.ok, true, closed.reason);

      const events = await pool.query(
        `SELECT event_key FROM blessboard.member_journey_handover_events
          WHERE handover_id = $1 ORDER BY created_at ASC`,
        [created.handover.id]
      );
      const keys = events.rows.map((r) => r.event_key);
      assert.ok(keys.includes("journey.handover.created"));
      assert.ok(keys.includes("journey.handover.submitted"));
      assert.ok(keys.includes("journey.handover.accepted"));
      assert.ok(keys.includes("journey.handover.assigned"));
      assert.ok(keys.includes("journey.handover.completed"));
      assert.ok(keys.includes("journey.handover.closed"));

      await assert.rejects(
        () =>
          pool.query(
            `UPDATE blessboard.member_journey_handover_events SET event_key = 'x' WHERE handover_id = $1`,
            [created.handover.id]
          ),
        /append-only/i
      );
    });

    it("blocks duplicate active handover for same person/stages", async () => {
      requireDb();
      const contact = await createJourneyContact(pool, {
        actorUserId: actorReg.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: branchA.id,
        tenantContext: tenantA,
        firstName: "Visitor",
        lastName: "Two",
        email: "visitor2@mj-a.test",
        sourceType: "manual",
      });
      assert.equal(contact.ok, true, contact.reason);

      const first = await createHandover(pool, {
        actorUserId: actorReg.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: branchA.id,
        tenantContext: tenantA,
        journeyContactId: contact.contact.id,
        fromStage: "registration",
        toStage: "first_timers",
      });
      assert.equal(first.ok, true, first.reason);

      const second = await createHandover(pool, {
        actorUserId: actorReg.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: branchA.id,
        tenantContext: tenantA,
        journeyContactId: contact.contact.id,
        fromStage: "registration",
        toStage: "first_timers",
      });
      assert.equal(second.ok, false);
      assert.equal(second.reason, "duplicate_active");
    });

    it("registration officer cannot accept first timers handover", async () => {
      requireDb();
      const contact = await createJourneyContact(pool, {
        actorUserId: actorReg.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: branchA.id,
        tenantContext: tenantA,
        firstName: "Visitor",
        lastName: "Three",
        phone: "+15551112222",
        sourceType: "registration_desk",
      });
      assert.equal(contact.ok, true, contact.reason);

      const created = await createHandover(pool, {
        actorUserId: actorReg.id,
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: branchA.id,
        tenantContext: tenantA,
        journeyContactId: contact.contact.id,
        fromStage: "registration",
        toStage: "first_timers",
      });
      assert.equal(created.ok, true, created.reason);
      await submitHandover(pool, {
        actorUserId: actorReg.id,
        churchId: churchA.id,
        handoverId: created.handover.id,
        tenantContext: tenantA,
      });

      const denied = await acceptHandover(pool, {
        actorUserId: actorReg.id,
        churchId: churchA.id,
        handoverId: created.handover.id,
        tenantContext: tenantA,
      });
      assert.equal(denied.ok, false);
      assert.equal(denied.status, "forbidden");
    });
  });

  describe("scope authorization", () => {
    it("cell leader grant matches assigned cell only", async () => {
      requireDb();
      const ok = await authorize(pool, {
        actor: { userId: actorCellLeader.id },
        permission: "cells.members.view_assigned",
        tenantContext: tenantA,
        resourceContext: {
          organizationId: orgA.id,
          churchId: churchA.id,
          branchId: branchA.id,
          cellId: cellA.id,
        },
      });
      assert.equal(ok.allowed, true, ok.reasonCode);

      const wrongCell = await authorize(pool, {
        actor: { userId: actorCellLeader.id },
        permission: "cells.members.view_assigned",
        tenantContext: tenantA,
        resourceContext: {
          organizationId: orgA.id,
          churchId: churchA.id,
          branchId: branchA.id,
          cellId: cellB.id,
        },
      });
      assert.equal(wrongCell.allowed, false);

      const wrongOrg = await authorize(pool, {
        actor: { userId: actorCellLeader.id },
        permission: "cells.members.view_assigned",
        tenantContext: tenantB,
        resourceContext: {
          organizationId: orgB.id,
          churchId: churchB.id,
          branchId: branchB.id,
          cellId: cellA.id,
        },
      });
      assert.equal(wrongOrg.allowed, false);
    });

    it("department head sees assigned department only and not cell care", async () => {
      requireDb();
      const deptOk = await authorize(pool, {
        actor: { userId: actorDeptHead.id },
        permission: "departments.members.manage",
        tenantContext: tenantA,
        resourceContext: {
          organizationId: orgA.id,
          churchId: churchA.id,
          branchId: branchA.id,
          departmentId: departmentA.id,
        },
      });
      assert.equal(deptOk.allowed, true, deptOk.reasonCode);

      const cellCare = await authorize(pool, {
        actor: { userId: actorDeptHead.id },
        permission: "cells.members.view_assigned",
        tenantContext: tenantA,
        resourceContext: {
          organizationId: orgA.id,
          churchId: churchA.id,
          branchId: branchA.id,
          cellId: cellA.id,
        },
      });
      assert.equal(cellCare.allowed, false);
    });

    it("class teacher/coordinator cannot approve unless permission held; cell leader cannot approve", async () => {
      requireDb();
      const cellLeaderApprove = await authorize(pool, {
        actor: { userId: actorCellLeader.id },
        permission: "classes.completion.approve",
        tenantContext: tenantA,
        resourceContext: {
          organizationId: orgA.id,
          churchId: churchA.id,
          branchId: branchA.id,
          cohortId: cohortA.id,
        },
      });
      assert.equal(cellLeaderApprove.allowed, false);

      const coordApprove = await authorize(pool, {
        actor: { userId: actorClassCoord.id },
        permission: "classes.completion.approve",
        tenantContext: tenantA,
        resourceContext: {
          organizationId: orgA.id,
          churchId: churchA.id,
          branchId: branchA.id,
          cohortId: cohortA.id,
        },
      });
      assert.equal(coordApprove.allowed, true, coordApprove.reasonCode);
    });

    it("first timers coordinator cannot manage finance approvals", async () => {
      requireDb();
      const finance = await authorize(pool, {
        actor: { userId: actorFt.id },
        permission: "giving.approve",
        tenantContext: tenantA,
        resourceContext: {
          organizationId: orgA.id,
          churchId: churchA.id,
          branchId: branchA.id,
        },
      });
      assert.equal(finance.allowed, false);
    });

    it("platform admin has no pastoral confidential permission key", async () => {
      requireDb();
      assert.ok(!PLATFORM_ADMIN_PERMISSIONS.includes("pastoral.cases.view"));
      assert.ok(!PLATFORM_ADMIN_PERMISSIONS.includes("pastoral.cases.view_highly_confidential"));
      const pastoral = await authorize(pool, {
        actor: { userId: actorPa.id },
        permission: "pastoral.cases.view_highly_confidential",
        tenantContext: tenantA,
      });
      assert.equal(pastoral.allowed, false);
      assert.equal(pastoral.reasonCode, REASON.PERMISSION_UNKNOWN);
    });

    it("branch_admin compatibility is minimal for journey", () => {
      assert.ok(BRANCH_ADMIN_PERMISSIONS.includes("journey_handovers.submit"));
      assert.ok(!BRANCH_ADMIN_PERMISSIONS.includes("journey_handovers.accept"));
      assert.ok(!BRANCH_ADMIN_PERMISSIONS.includes("cells.members.assign"));
      assert.ok(!BRANCH_ADMIN_PERMISSIONS.includes("classes.completion.approve"));
    });
  });
});
