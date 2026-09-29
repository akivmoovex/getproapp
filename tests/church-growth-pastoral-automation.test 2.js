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
const pastoralCareRepo = require("../src/db/pg/church/pastoralCareRepo");
const pastoralAutomationRepo = require("../src/db/pg/church/pastoralAutomationRepo");
const growthPastoralAutomationService = require("../src/services/church/growthPastoralAutomationService");
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
      secret: "church-growth-pastoral-automation",
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

function ctx(org, branch, admin) {
  return {
    organization_id: org.id,
    branch_id: branch.id,
    admin_id: admin.id,
    can_access_pastoral: true,
    can_supervise_pastoral: Boolean(admin.can_supervise_pastoral),
  };
}

async function cleanup(pool, orgIds) {
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_pastoral_automation_work_items WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_pastoral_automation_runs WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_pastoral_automation_settings WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_pastoral_case_follow_ups WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_pastoral_cases WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_safeguarding_incidents WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_attendance_check_ins WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_attendance_service_sessions WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

async function seedMember(pool, org, branch, suffix, passwordHash) {
  const member = await membersRepo.createPendingMember(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    platform_tenant_id: TENANT_ZM,
    email: `pm_${suffix}@example.com`,
    phone: "0977666555",
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
  "Growth pastoral-care automation",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("pcauto");
    const passwordHash = await bcrypt.hash("testpass123", 12);

    const orgGrowth = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `pca_g_${suffix}`,
      name: `Growth Pastoral ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgGrowth.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );
    const orgFoundation = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `pca_f_${suffix}`,
      name: `Foundation Pastoral ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgFoundation.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      null
    );
    const orgOther = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `pca_o_${suffix}`,
      name: `Other Pastoral ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgOther.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );

    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgGrowth.id,
      slug: `a_${suffix}`.slice(0, 30),
      host_slug: `a_${suffix}`.slice(0, 30),
      name: "Campus A",
      status: "active",
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgGrowth.id,
      slug: `b_${suffix}`.slice(0, 30),
      host_slug: `b_${suffix}`.slice(0, 30),
      name: "Campus B",
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
      branch_id: branchA.id,
      full_name: "Pastoral Admin",
      email: `pa_${suffix}@example.com`,
      phone: "0977000011",
      password_hash: passwordHash,
    });
    await pool.query(
      `UPDATE public.church_branch_admins SET can_access_pastoral = true WHERE id = $1`,
      [admin.id]
    );
    const supervisor = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgGrowth.id,
      branch_id: branchA.id,
      full_name: "Supervisor",
      email: `sup_${suffix}@example.com`,
      phone: "0977000022",
      password_hash: passwordHash,
    });
    await pool.query(
      `UPDATE public.church_branch_admins SET can_access_pastoral = true, can_supervise_pastoral = true WHERE id = $1`,
      [supervisor.id]
    );
    const assignee = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgGrowth.id,
      branch_id: branchA.id,
      full_name: "Assignee",
      email: `asg_${suffix}@example.com`,
      phone: "0977000033",
      password_hash: passwordHash,
    });
    await pool.query(
      `UPDATE public.church_branch_admins SET can_access_pastoral = true WHERE id = $1`,
      [assignee.id]
    );

    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgFoundation.id,
      branch_id: foundationBranch.id,
      full_name: "Foundation Admin",
      email: `fp_${suffix}@example.com`,
      phone: "0977000044",
      password_hash: passwordHash,
    });
    await pool.query(
      `UPDATE public.church_branch_admins SET can_access_pastoral = true WHERE organization_id = $1`,
      [orgFoundation.id]
    );

    const memberAbsent = await seedMember(pool, orgGrowth, branchA, `abs_${suffix}`, passwordHash);
    const plan = await getOrganisationPlan(pool, orgGrowth.id);
    const adminCtx = ctx(orgGrowth, branchA, { ...admin, can_supervise_pastoral: false });
    const supervisorCtx = ctx(orgGrowth, branchA, { ...supervisor, can_supervise_pastoral: true });

    await pastoralAutomationRepo.upsertSettings(pool, {
      organization_id: orgGrowth.id,
      branch_id: branchA.id,
      enabled: true,
      missed_service_threshold_weeks: 4,
      first_response_target_hours: 24,
      follow_up_target_days: 7,
      auto_create_cases: true,
      updated_by_admin_id: admin.id,
    });

    const scan1 = await growthPastoralAutomationService.runMissedServiceScan(pool, adminCtx, plan, {
      runKey: `missed_service:test_${suffix}`,
    });
    assert.equal(scan1.duplicateRun, false);
    assert.ok(scan1.stats.cases_created >= 1);

    const scanDup = await growthPastoralAutomationService.runMissedServiceScan(pool, adminCtx, plan, {
      runKey: `missed_service:test_${suffix}`,
    });
    assert.equal(scanDup.duplicateRun, true);

    const scanDuplicateCase = await growthPastoralAutomationService.runMissedServiceScan(pool, adminCtx, plan, {
      runKey: `missed_service:dup_${suffix}`,
    });
    assert.equal(scanDuplicateCase.duplicateRun, false);
    assert.ok(scanDuplicateCase.stats.duplicates >= 1);
    assert.equal(scanDuplicateCase.stats.cases_created, 0);

    const openCase = await pastoralCareRepo.findOpenPastoralCaseForMember(pool, branchA.id, memberAbsent.id);
    assert.ok(openCase);
    assert.equal(openCase.opened_by_automation, true);
    assert.equal(openCase.status, "pending_supervisor_ack");
    assert.equal(openCase.confidentiality_level, "restricted");

    const redacted = growthPastoralAutomationService.mapCaseForViewer(openCase, { can_supervise_pastoral: false });
    assert.equal(redacted.summary_redacted, true);
    const full = growthPastoralAutomationService.mapCaseForViewer(openCase, { can_supervise_pastoral: true });
    assert.notEqual(full.summary_redacted, true);

    let ackErr = null;
    try {
      await growthPastoralAutomationService.supervisorAcknowledgeCase(pool, adminCtx, plan, openCase.id);
    } catch (e) {
      ackErr = e;
    }
    assert.equal(ackErr && ackErr.code, "SUPERVISOR_REQUIRED");

    const acked = await growthPastoralAutomationService.supervisorAcknowledgeCase(
      pool,
      supervisorCtx,
      plan,
      openCase.id
    );
    assert.equal(acked.status, "open");
    assert.ok(acked.supervisor_acknowledged_at);

    await growthPastoralAutomationService.reassignCase(pool, supervisorCtx, plan, openCase.id, assignee.id);
    const reassigned = await pastoralCareRepo.findPastoralCaseByIdForBranch(pool, openCase.id, branchA.id);
    assert.equal(Number(reassigned.assigned_admin_id), Number(assignee.id));

    await pool.query(
      `UPDATE public.church_pastoral_cases SET first_response_due_at = now() - interval '1 day', status = 'open' WHERE id = $1`,
      [openCase.id]
    );
    const overdue = await growthPastoralAutomationService.identifyOverdueCases(pool, adminCtx, plan);
    assert.ok(overdue.some((c) => Number(c.id) === Number(openCase.id)));

    const autoEscalated = await growthPastoralAutomationService.processOverdueEscalations(
      pool,
      supervisorCtx,
      plan
    );
    assert.ok(autoEscalated.some((c) => Number(c.id) === Number(openCase.id) && c.status === "escalated"));

    const escalated = await growthPastoralAutomationService.escalateCase(
      pool,
      supervisorCtx,
      plan,
      openCase.id,
      supervisor.id
    );
    assert.equal(escalated.status, "escalated");

    const comparison = await pastoralAutomationRepo.branchComparisonForOrganization(pool, orgGrowth.id);
    assert.ok(comparison.length >= 2);

    const foundationApp = makeApp({
      kind: "branch",
      organization: orgFoundation,
      branch: foundationBranch,
    });
    const foundationAgent = request.agent(foundationApp);
    await foundationAgent.post("/branch/login").type("form").send({
      identifier: `fp_${suffix}@example.com`,
      password: "testpass123",
    });
    const foundationGet = await foundationAgent.get("/branch/pastoral-automation");
    assert.equal(foundationGet.status, 200);
    assert.match(foundationGet.text, /Growth|upgrade|package/i);
    const foundationPost = await foundationAgent.post("/branch/pastoral-automation/run-scan").type("form").send({});
    assert.equal(foundationPost.status, 409);

    const otherCtx = ctx(orgOther, otherBranch, { id: 1, can_supervise_pastoral: false });
    let tenantErr = null;
    try {
      await growthPastoralAutomationService.supervisorAcknowledgeCase(pool, otherCtx, plan, openCase.id);
    } catch (e) {
      tenantErr = e;
    }
    assert.ok(tenantErr);

    await cleanup(pool, [orgGrowth.id, orgFoundation.id, orgOther.id]);
  }
);

test("resolveFeatureUi treats basic care.automation as upgrade", () => {
  const { resolveFeatureUi } = require("../src/church/blessBoardPackageFeatures");
  const { resolvePackageFromPlanCode } = require("../src/church/blessBoardPackageCatalogue");
  const foundation = resolvePackageFromPlanCode("foundation");
  const growth = resolvePackageFromPlanCode("growth");
  assert.equal(resolveFeatureUi(foundation, "care_automation").state, "upgrade");
  assert.equal(resolveFeatureUi(growth, "care_automation").state, "available");
});
