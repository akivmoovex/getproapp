"use strict";

const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const groupsRepo = require("../src/db/pg/church/groupsRepo");
const discipleshipRepo = require("../src/db/pg/church/discipleshipRepo");
const growthGroupsService = require("../src/services/church/growthGroupsService");
const growthDiscipleshipService = require("../src/services/church/growthDiscipleshipService");
const growthVolunteerSchedulingService = require("../src/services/church/growthVolunteerSchedulingService");
const { getOrganisationPlan } = require("../src/services/church/churchEntitlementService");
const churchRoutes = require("../src/routes/church");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeApp(ctx) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "church-growth-groups-volunteers",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = ctx;
    next();
  });
  app.use(churchRoutes());
  return app;
}

function adminCtx(org, branch, admin) {
  return {
    organization_id: org.id,
    branch_id: branch.id,
    admin_id: admin.id,
  };
}

async function cleanup(pool, orgIds) {
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_volunteer_assignments WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_volunteer_shifts WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_volunteer_availability WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_volunteer_member_skills WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_volunteer_role_skills WHERE role_id IN (SELECT id FROM public.church_volunteer_roles WHERE organization_id = $1)`, [orgId]);
    await pool.query(`DELETE FROM public.church_volunteer_skills WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_volunteer_roles WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_discipleship_history WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_member_discipleship WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_discipleship_milestones WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_discipleship_stages WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_group_attendance WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_group_notes WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_group_meetings WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_group_join_requests WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_group_memberships WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_group_leaders WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_groups WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

async function seedMember(pool, org, branch, suffix, passwordHash, phone) {
  const member = await membersRepo.createPendingMember(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    platform_tenant_id: TENANT_ZM,
    email: `m_${suffix}@example.com`,
    phone: phone || `0977${String(Date.now()).slice(-7)}`,
    full_name: `Member ${suffix}`,
    password_hash: passwordHash,
    gender: "male",
    age_group: "Adult (36-60)",
    address_area: "Lusaka",
    attendance_duration: "Less than 6 months",
    ministry_interest: "choir",
  });
  await membersRepo.updateMemberStatusForBranch(pool, member.id, branch.id, "verified");
  return member;
}

test(
  "Growth groups, discipleship, and volunteer scheduling",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("gdv");
    const passwordHash = await bcrypt.hash("testpass123", 12);

    const orgGrowth = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `gdv_g_${suffix}`,
      name: `Growth GDV ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgGrowth.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );
    const orgFoundation = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `gdv_f_${suffix}`,
      name: `Foundation GDV ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgFoundation.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      null
    );
    const orgOther = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `gdv_o_${suffix}`,
      name: `Other GDV ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgOther.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );

    const branch = await branchesRepo.createBranch(pool, {
      organization_id: orgGrowth.id,
      slug: `g_${suffix}`.slice(0, 30),
      host_slug: `g_${suffix}`.slice(0, 30),
      name: "Growth Campus",
      status: "active",
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgGrowth.id,
      slug: `gb_${suffix}`.slice(0, 30),
      host_slug: `gb_${suffix}`.slice(0, 30),
      name: "Growth Campus B",
      status: "active",
    });
    const foundationBranch = await branchesRepo.createBranch(pool, {
      organization_id: orgFoundation.id,
      slug: `f_${suffix}`.slice(0, 30),
      host_slug: `f_${suffix}`.slice(0, 30),
      name: "Foundation Campus",
      status: "active",
    });
    const otherBranch = await branchesRepo.createBranch(pool, {
      organization_id: orgOther.id,
      slug: `o_${suffix}`.slice(0, 30),
      host_slug: `o_${suffix}`.slice(0, 30),
      name: "Other Campus",
      status: "active",
    });

    const admin = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgGrowth.id,
      branch_id: branch.id,
      full_name: "Group Admin",
      email: `ga_${suffix}@example.com`,
      phone: "0977000101",
      password_hash: passwordHash,
    });
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgFoundation.id,
      branch_id: foundationBranch.id,
      full_name: "Foundation Admin",
      email: `fa_${suffix}@example.com`,
      phone: "0977000102",
      password_hash: passwordHash,
    });

    const member1 = await seedMember(pool, orgGrowth, branch, `a_${suffix}`, passwordHash, "0977111001");
    const member2 = await seedMember(pool, orgGrowth, branch, `b_${suffix}`, passwordHash, "0977111002");
    const plan = await getOrganisationPlan(pool, orgGrowth.id);
    const ctxA = adminCtx(orgGrowth, branch, admin);

    // Groups: join, approve, waitlist, recurring meeting, attendance
    const group = await growthGroupsService.createGroup(pool, ctxA, plan, {
      name: `Life Group ${suffix}`,
      capacity: 1,
      meeting_day_of_week: 3,
      meeting_time: "18:00:00",
    });
    await growthGroupsService.addLeader(pool, ctxA, plan, group.id, {
      member_id: member1.id,
      admin_id: admin.id,
    });

    const join1 = await growthGroupsService.submitJoinRequest(
      pool,
      { ...ctxA, member_id: member1.id },
      plan,
      group.id,
      "I'd like to join"
    );
    assert.equal(join1.status, "pending");
    const approved = await growthGroupsService.decideJoinRequest(pool, ctxA, plan, join1.id, "approve");
    assert.equal(approved.status, "approved");

    const join2 = await growthGroupsService.submitJoinRequest(
      pool,
      { ...ctxA, member_id: member2.id },
      plan,
      group.id,
      "Me too"
    );
    const waitlisted = await growthGroupsService.decideJoinRequest(pool, ctxA, plan, join2.id, "approve");
    assert.equal(waitlisted.status, "waitlisted");
    const memberships = await groupsRepo.listMembershipsForGroup(pool, group.id);
    assert.ok(memberships.some((m) => m.status === "waitlisted" && Number(m.member_id) === Number(member2.id)));

    const meetings = await growthGroupsService.scheduleRecurringMeetings(pool, ctxA, plan, group.id, {
      starts_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      recurring_weeks: 3,
      location: "Hall A",
    });
    assert.equal(meetings.length, 3);
    assert.ok(meetings[0].recurrence_series_key);

    const attendance = await growthGroupsService.recordAttendance(
      pool,
      ctxA,
      plan,
      meetings[0].id,
      member1.id,
      true
    );
    assert.equal(attendance.present, true);

    // Branch scoping: group on branch A not visible on branch B
    const otherBranchGroup = await groupsRepo.findGroupByIdForBranch(pool, group.id, branchB.id);
    assert.equal(otherBranchGroup, null);

    // Discipleship stage movement
    const stage1 = await growthDiscipleshipService.createStage(pool, ctxA, plan, {
      name: "Explore",
      sort_order: 1,
    });
    const stage2 = await growthDiscipleshipService.createStage(pool, ctxA, plan, {
      name: "Grow",
      sort_order: 2,
    });
    const milestone = await growthDiscipleshipService.createMilestone(pool, ctxA, plan, {
      stage_id: stage2.id,
      name: "Baptism class",
    });
    const moved = await growthDiscipleshipService.moveMember(pool, ctxA, plan, {
      member_id: member1.id,
      stage_id: stage1.id,
      owner_admin_id: admin.id,
      movement_reason: "Initial placement",
    });
    assert.equal(Number(moved.pathway.stage_id), Number(stage1.id));
    const moved2 = await growthDiscipleshipService.moveMember(pool, ctxA, plan, {
      member_id: member1.id,
      stage_id: stage2.id,
      milestone_id: milestone.id,
      owner_admin_id: admin.id,
      movement_reason: "Completed explore",
    });
    assert.equal(Number(moved2.pathway.stage_id), Number(stage2.id));
    const history = await discipleshipRepo.listHistoryForMember(pool, member1.id, branch.id);
    assert.ok(history.length >= 2);
    assert.match(history[0].movement_reason || "", /Completed explore|Initial/);

    // Volunteers: conflict detection
    const role = await growthVolunteerSchedulingService.createRole(pool, ctxA, plan, {
      name: `Usher ${suffix}`,
    });
    const skill = await growthVolunteerSchedulingService.createSkill(pool, ctxA, plan, `Welcoming ${suffix}`);
    await growthVolunteerSchedulingService.requireSkillForRole(pool, ctxA, plan, role.id, skill.id);
    await growthVolunteerSchedulingService.addMemberSkill(pool, ctxA, plan, member1.id, skill.id);

    const start = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const shift1 = await growthVolunteerSchedulingService.createShift(pool, ctxA, plan, {
      role_id: role.id,
      title: "Sunday morning",
      starts_at: start,
      ends_at: end,
      slots: 2,
    });
    const shift2 = await growthVolunteerSchedulingService.createShift(pool, ctxA, plan, {
      role_id: role.id,
      title: "Overlap",
      starts_at: new Date(start.getTime() + 30 * 60 * 1000),
      ends_at: new Date(end.getTime() + 30 * 60 * 1000),
      slots: 1,
    });
    await growthVolunteerSchedulingService.assignShift(pool, ctxA, plan, shift1.id, member1.id);
    let conflictErr = null;
    try {
      await growthVolunteerSchedulingService.assignShift(pool, ctxA, plan, shift2.id, member1.id);
    } catch (e) {
      conflictErr = e;
    }
    assert.equal(conflictErr && conflictErr.code, "CONFLICT");

    const assignment = await growthVolunteerSchedulingService.assignShift(
      pool,
      ctxA,
      plan,
      shift1.id,
      member2.id
    ).catch(() => null);
    // member2 may be ineligible without skill
    if (!assignment) {
      await growthVolunteerSchedulingService.addMemberSkill(pool, ctxA, plan, member2.id, skill.id);
      const a2 = await growthVolunteerSchedulingService.assignShift(pool, ctxA, plan, shift1.id, member2.id);
      const confirmed = await growthVolunteerSchedulingService.confirmAssignment(pool, ctxA, plan, a2.id);
      assert.equal(confirmed.status, "confirmed");
      const completed = await growthVolunteerSchedulingService.completeAssignment(pool, ctxA, plan, a2.id);
      assert.equal(completed.status, "completed");
    } else {
      const confirmed = await growthVolunteerSchedulingService.confirmAssignment(
        pool,
        ctxA,
        plan,
        assignment.id
      );
      assert.equal(confirmed.status, "confirmed");
    }

    // Foundation scheduling restriction
    const foundationApp = makeApp({
      kind: "branch",
      organization: orgFoundation,
      branch: foundationBranch,
    });
    const foundationAgent = request.agent(foundationApp);
    await foundationAgent.post("/branch/login").type("form").send({
      identifier: `fa_${suffix}@example.com`,
      password: "testpass123",
    });
    const foundationVol = await foundationAgent.get("/branch/volunteer-scheduling");
    assert.equal(foundationVol.status, 200);
    assert.match(foundationVol.text, /Growth|upgrade|package/i);
    const foundationVolPost = await foundationAgent
      .post("/branch/volunteer-scheduling/roles")
      .type("form")
      .send({ name: "x" });
    assert.equal(foundationVolPost.status, 409);
    const foundationGroups = await foundationAgent.get("/branch/groups");
    assert.equal(foundationGroups.status, 200);
    assert.match(foundationGroups.text, /Growth|upgrade|package/i);

    // Tenant isolation
    let tenantErr = null;
    try {
      await growthGroupsService.loadGroupDetail(
        pool,
        { organization_id: orgOther.id, branch_id: otherBranch.id, admin_id: 1 },
        plan,
        group.id
      );
    } catch (e) {
      tenantErr = e;
    }
    assert.ok(tenantErr);

    await cleanup(pool, [orgGrowth.id, orgFoundation.id, orgOther.id]);
  }
);

test("resolveFeatureUi groups discipleship volunteers package gates", () => {
  const { resolveFeatureUi } = require("../src/church/blessBoardPackageFeatures");
  const { resolvePackageFromPlanCode } = require("../src/church/blessBoardPackageCatalogue");
  const foundation = resolvePackageFromPlanCode("foundation");
  const growth = resolvePackageFromPlanCode("growth");
  assert.equal(resolveFeatureUi(foundation, "groups_management").state, "upgrade");
  assert.equal(resolveFeatureUi(growth, "groups_management").state, "available");
  assert.equal(resolveFeatureUi(foundation, "discipleship_pathways").state, "upgrade");
  assert.equal(resolveFeatureUi(growth, "discipleship_pathways").state, "available");
  assert.equal(resolveFeatureUi(foundation, "volunteers_scheduling").state, "upgrade");
  assert.equal(resolveFeatureUi(growth, "volunteers_scheduling").state, "available");
});
