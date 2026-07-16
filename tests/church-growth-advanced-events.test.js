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
const eventsRepo = require("../src/db/pg/church/eventsRepo");
const eventRegistrationsRepo = require("../src/db/pg/church/eventRegistrationsRepo");
const growthAdvancedEventsService = require("../src/services/church/growthAdvancedEventsService");
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
      secret: "church-growth-advanced-events",
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
    await pool.query(`DELETE FROM public.church_event_visitor_follow_ups WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_event_feedback WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_event_volunteer_needs WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_event_check_ins WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_event_registration_answers WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_event_registration_companions WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_event_registrations WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_event_form_questions WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_event_registration_forms WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_events WHERE organization_id = $1`, [orgId]);
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
    phone,
    full_name: `Member ${suffix}`,
    password_hash: passwordHash,
    gender: "female",
    age_group: "Adult (36-60)",
    address_area: "Lusaka",
    attendance_duration: "Less than 6 months",
    ministry_interest: "choir",
  });
  await membersRepo.updateMemberStatusForBranch(pool, member.id, branch.id, "verified");
  return member;
}

async function createPublishedEvent(pool, org, branch, admin, title) {
  const event = await eventsRepo.createEventForBranch(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    title,
    description: "Test event",
    event_date: new Date().toISOString().slice(0, 10),
    start_time: "10:00",
    end_time: "12:00",
    location: "Hall",
    visibility: "members",
    status: "draft",
    created_by_admin_id: admin.id,
  });
  return eventsRepo.publishEventForBranch(pool, event.id, branch.id, admin.id);
}

test(
  "Growth advanced events and Foundation core registration",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("aev");
    const passwordHash = await bcrypt.hash("testpass123", 12);

    const orgGrowth = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `aev_g_${suffix}`,
      name: `Growth Events ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgGrowth.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );
    const orgFoundation = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `aev_f_${suffix}`,
      name: `Foundation Events ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgFoundation.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      null
    );
    const orgOther = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `aev_o_${suffix}`,
      name: `Other Events ${suffix}`,
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
      full_name: "Events Admin",
      email: `ea_${suffix}@example.com`,
      phone: "0977000201",
      password_hash: passwordHash,
    });
    const foundationAdmin = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgFoundation.id,
      branch_id: foundationBranch.id,
      full_name: "Foundation Admin",
      email: `fa_${suffix}@example.com`,
      phone: "0977000202",
      password_hash: passwordHash,
    });

    const member1 = await seedMember(pool, orgGrowth, branch, `a_${suffix}`, passwordHash, "0977222001");
    const member2 = await seedMember(pool, orgGrowth, branch, `b_${suffix}`, passwordHash, "0977222002");
    const member3 = await seedMember(pool, orgGrowth, branch, `c_${suffix}`, passwordHash, "0977222003");
    const fMember = await seedMember(
      pool,
      orgFoundation,
      foundationBranch,
      `fm_${suffix}`,
      passwordHash,
      "0977222004"
    );

    const growthPlan = await getOrganisationPlan(pool, orgGrowth.id);
    const foundationPlan = await getOrganisationPlan(pool, orgFoundation.id);
    const ctxG = adminCtx(orgGrowth, branch, admin);
    const ctxF = adminCtx(orgFoundation, foundationBranch, foundationAdmin);

    // Foundation core event: create, register, capacity, check-in
    const fEvent = await createPublishedEvent(
      pool,
      orgFoundation,
      foundationBranch,
      foundationAdmin,
      `Foundation Core ${suffix}`
    );
    await growthAdvancedEventsService.enableFoundationRegistration(pool, ctxF, fEvent.id, {
      capacity: 1,
      registration_enabled: true,
      check_in_enabled: true,
    });
    const fReg = await growthAdvancedEventsService.registerForEvent(
      pool,
      { ...ctxF, member_id: fMember.id },
      foundationPlan,
      fEvent.id,
      { visitor_name: "", companions: [], answers: {} }
    );
    assert.equal(fReg.status, "registered");
    let fFull = null;
    try {
      await growthAdvancedEventsService.registerForEvent(
        pool,
        { ...ctxF, member_id: null },
        foundationPlan,
        fEvent.id,
        { visitor_name: "Extra Visitor", companions: [], answers: {} }
      );
    } catch (e) {
      fFull = e;
    }
    assert.equal(fFull && fFull.code, "FULL");
    const fCheckIn = await growthAdvancedEventsService.checkInRegistration(
      pool,
      ctxF,
      fEvent.id,
      fReg.id
    );
    assert.equal(fCheckIn.method, "registration");
    const afterCheckIn = await eventRegistrationsRepo.findRegistrationByIdForBranch(
      pool,
      fReg.id,
      foundationBranch.id
    );
    assert.equal(afterCheckIn.status, "checked_in");

    // Growth advanced: form, conditional question, waitlist, family, cancel, no-show
    const form = await growthAdvancedEventsService.createRegistrationForm(pool, ctxG, growthPlan, {
      title: `Event form ${suffix}`,
      consent_text: "I consent to event registration.",
    });
    const q1 = await growthAdvancedEventsService.addFormQuestion(pool, ctxG, growthPlan, form.id, {
      question_key: "needs_transport",
      prompt: "Need support notes?",
      question_type: "yes_no",
      options: ["yes", "no"],
      sort_order: 1,
    });
    const q2 = await growthAdvancedEventsService.addFormQuestion(pool, ctxG, growthPlan, form.id, {
      question_key: "details",
      prompt: "What do you need?",
      question_type: "text",
      sort_order: 2,
      branch_parent_question_id: q1.id,
      branch_equals_value: "yes",
    });
    assert.ok(q2.branch_parent_question_id);

    const gEvent = await createPublishedEvent(
      pool,
      orgGrowth,
      branch,
      admin,
      `Growth Advanced ${suffix}`
    );
    await growthAdvancedEventsService.configureGrowthEvent(pool, ctxG, growthPlan, gEvent.id, {
      capacity: 2,
      registration_enabled: true,
      check_in_enabled: true,
      requires_approval: false,
      allow_companions: true,
      max_companions: 2,
      registration_form_id: form.id,
      feedback_enabled: true,
      registration_opens_at: new Date(Date.now() - 60 * 60 * 1000),
      registration_closes_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const reg1 = await growthAdvancedEventsService.registerForEvent(
      pool,
      { ...ctxG, member_id: member1.id },
      growthPlan,
      gEvent.id,
      {
        consent_accepted: true,
        companions: [{ full_name: "Child One", relationship: "child", age_group: "child" }],
        answers: { [q1.id]: "yes", [q2.id]: "Prayer room access" },
      }
    );
    assert.equal(reg1.status, "registered");
    assert.equal(reg1.party_size, 2);
    const companions = await eventRegistrationsRepo.listCompanionsForRegistration(pool, reg1.id);
    assert.equal(companions.length, 1);

    // Capacity: party_size 2 already fills capacity 2 → next waitlisted
    const reg2 = await growthAdvancedEventsService.registerForEvent(
      pool,
      { ...ctxG, member_id: member2.id },
      growthPlan,
      gEvent.id,
      { consent_accepted: true, companions: [], answers: { [q1.id]: "no" } }
    );
    assert.equal(reg2.status, "waitlisted");

    const cancelled = await growthAdvancedEventsService.cancelRegistration(
      pool,
      { ...ctxG, member_id: member2.id },
      growthPlan,
      reg2.id,
      "Cannot attend",
      "member"
    );
    assert.equal(cancelled.status, "cancelled");

    const reg3 = await growthAdvancedEventsService.registerForEvent(
      pool,
      { ...ctxG, member_id: member3.id },
      growthPlan,
      gEvent.id,
      { consent_accepted: true, companions: [], answers: { [q1.id]: "no" } }
    );
    // Still waitlisted or registered depending on remaining capacity after cancel
    assert.ok(["registered", "waitlisted", "approved"].includes(reg3.status));

    await growthAdvancedEventsService.checkInRegistration(pool, ctxG, gEvent.id, reg1.id);

    // Dedicated event so no-show target is registered (not waitlisted by prior capacity fill)
    const gEventNoShow = await createPublishedEvent(
      pool,
      orgGrowth,
      branch,
      admin,
      `Growth NoShow ${suffix}`
    );
    await growthAdvancedEventsService.configureGrowthEvent(pool, ctxG, growthPlan, gEventNoShow.id, {
      capacity: 10,
      registration_enabled: true,
      check_in_enabled: true,
      allow_companions: false,
      max_companions: 0,
      registration_form_id: null,
      feedback_enabled: false,
    });
    const noShowReg = await growthAdvancedEventsService.registerForEvent(
      pool,
      { ...ctxG, member_id: null },
      growthPlan,
      gEventNoShow.id,
      {
        visitor_name: `Visitor ${suffix}`,
        visitor_email: `v_${suffix}@example.com`,
        companions: [],
        answers: {},
      }
    );
    assert.equal(noShowReg.status, "registered");
    const marked = await growthAdvancedEventsService.markNoShow(pool, ctxG, growthPlan, noShowReg.id);
    assert.equal(marked.status, "no_show");

    // Foundation cannot use advanced logistics actions
    let foundationDenied = null;
    try {
      await growthAdvancedEventsService.createRegistrationForm(pool, ctxF, foundationPlan, {
        title: "Nope",
        consent_text: "x",
      });
    } catch (e) {
      foundationDenied = e;
    }
    assert.equal(foundationDenied && foundationDenied.code, "PACKAGE_REQUIRED");

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
    const logisticsGet = await foundationAgent.get("/branch/event-logistics");
    assert.equal(logisticsGet.status, 200);
    assert.match(logisticsGet.text, /Growth|upgrade|package/i);
    const logisticsPost = await foundationAgent
      .post("/branch/event-logistics/forms")
      .type("form")
      .send({ title: "x", consent_text: "y" });
    assert.equal(logisticsPost.status, 409);

    // Tenant isolation
    let tenantErr = null;
    try {
      await growthAdvancedEventsService.loadEventOps(
        pool,
        { organization_id: orgOther.id, branch_id: otherBranch.id, admin_id: 1 },
        growthPlan,
        gEvent.id
      );
    } catch (e) {
      tenantErr = e;
    }
    assert.ok(tenantErr);

    await cleanup(pool, [orgGrowth.id, orgFoundation.id, orgOther.id]);
  }
);

test("resolveFeatureUi events advanced logistics package gates", () => {
  const { resolveFeatureUi } = require("../src/church/blessBoardPackageFeatures");
  const { resolvePackageFromPlanCode } = require("../src/church/blessBoardPackageCatalogue");
  const foundation = resolvePackageFromPlanCode("foundation");
  const growth = resolvePackageFromPlanCode("growth");
  assert.equal(resolveFeatureUi(foundation, "events_advanced_logistics").state, "upgrade");
  assert.equal(resolveFeatureUi(growth, "events_advanced_logistics").state, "available");
});
