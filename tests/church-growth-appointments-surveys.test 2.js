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
const appointmentsRepo = require("../src/db/pg/church/appointmentsRepo");
const surveysRepo = require("../src/db/pg/church/surveysRepo");
const growthAppointmentsService = require("../src/services/church/growthAppointmentsService");
const growthSurveysService = require("../src/services/church/growthSurveysService");
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
      secret: "church-growth-appointments-surveys",
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
    can_access_pastoral: Boolean(admin.can_access_pastoral),
    can_supervise_pastoral: Boolean(admin.can_supervise_pastoral),
  };
}

async function cleanup(pool, orgIds) {
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_survey_answers WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_survey_response_sessions WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_survey_questions WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_surveys WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_appointment_reminders WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_appointment_confidential_notes WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_appointments WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_appointment_leave WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_appointment_availability WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_appointment_settings WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_pastoral_cases WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_prayer_requests WHERE organization_id = $1`, [orgId]);
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
    email: `m_${suffix}@example.com`,
    phone: "0977111222",
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

function nextWeekdayAt(hour, minute) {
  const d = new Date();
  d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7));
  d.setHours(hour, minute, 0, 0);
  return d;
}

test(
  "Growth appointments and surveys",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("gas");
    const passwordHash = await bcrypt.hash("testpass123", 12);

    const orgGrowth = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `gas_g_${suffix}`,
      name: `Growth AS ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgGrowth.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );
    const orgFoundation = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `gas_f_${suffix}`,
      name: `Foundation AS ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgFoundation.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      null
    );
    const orgOther = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `gas_o_${suffix}`,
      name: `Other AS ${suffix}`,
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

    const minister = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgGrowth.id,
      branch_id: branch.id,
      full_name: "Minister",
      email: `min_${suffix}@example.com`,
      phone: "0977000001",
      password_hash: passwordHash,
    });
    await pool.query(
      `UPDATE public.church_branch_admins SET can_access_pastoral = true WHERE id = $1`,
      [minister.id]
    );
    const coordinator = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgGrowth.id,
      branch_id: branch.id,
      full_name: "Coordinator",
      email: `coord_${suffix}@example.com`,
      phone: "0977000002",
      password_hash: passwordHash,
    });
    await pool.query(
      `UPDATE public.church_branch_admins SET can_access_pastoral = false WHERE id = $1`,
      [coordinator.id]
    );
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgFoundation.id,
      branch_id: foundationBranch.id,
      full_name: "Foundation Admin",
      email: `fa_${suffix}@example.com`,
      phone: "0977000003",
      password_hash: passwordHash,
    });

    const member = await seedMember(pool, orgGrowth, branch, `m_${suffix}`, passwordHash);
    const plan = await getOrganisationPlan(pool, orgGrowth.id);
    const foundationPlan = await getOrganisationPlan(pool, orgFoundation.id);
    const ministerCtx = adminCtx(orgGrowth, branch, { ...minister, can_access_pastoral: true });
    const coordinatorCtx = adminCtx(orgGrowth, branch, {
      ...coordinator,
      can_access_pastoral: false,
    });

    await growthAppointmentsService.saveSettings(pool, ministerCtx, plan, {
      default_duration_minutes: 30,
      buffer_minutes: 15,
      reminder_hours_before: 24,
    });
    await growthAppointmentsService.addAvailability(pool, ministerCtx, plan, {
      minister_admin_id: minister.id,
      day_of_week: 1,
      start_time: "09:00:00",
      end_time: "17:00:00",
      is_recurring: true,
    });

    const startsAt = nextWeekdayAt(10, 0);
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
    const booking = {
      minister_admin_id: minister.id,
      member_id: member.id,
      starts_at: startsAt,
      ends_at: endsAt,
      duration_minutes: 30,
      purpose: "Pastoral visit",
      member_request_note: "Prefer morning",
    };

    const appt = await growthAppointmentsService.requestAppointment(pool, ministerCtx, plan, booking, {
      autoApprove: true,
    });
    assert.equal(appt.status, "approved");
    assert.ok(appt.purpose);

    let conflictErr = null;
    try {
      await growthAppointmentsService.requestAppointment(pool, ministerCtx, plan, {
        ...booking,
        starts_at: new Date(startsAt.getTime() + 10 * 60 * 1000),
        ends_at: new Date(endsAt.getTime() + 10 * 60 * 1000),
      });
    } catch (e) {
      conflictErr = e;
    }
    assert.equal(conflictErr && conflictErr.code, "CONFLICT");

    const leaveStart = new Date(startsAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const leaveEnd = new Date(leaveStart.getTime() + 2 * 60 * 60 * 1000);
    await growthAppointmentsService.addLeave(pool, ministerCtx, plan, {
      minister_admin_id: minister.id,
      starts_at: leaveStart,
      ends_at: leaveEnd,
      reason: "Conference",
    });
    let leaveErr = null;
    try {
      await growthAppointmentsService.requestAppointment(pool, ministerCtx, plan, {
        ...booking,
        starts_at: leaveStart,
        ends_at: new Date(leaveStart.getTime() + 30 * 60 * 1000),
      });
    } catch (e) {
      leaveErr = e;
    }
    assert.equal(leaveErr && leaveErr.code, "ON_LEAVE");

    await appointmentsRepo.upsertReminder(pool, {
      organization_id: orgGrowth.id,
      branch_id: branch.id,
      appointment_id: appt.id,
      remind_at: new Date(Date.now() - 60 * 1000),
    });
    const reminders = await growthAppointmentsService.processDueReminders(pool, ministerCtx, plan);
    assert.ok(reminders.some((r) => Number(r.appointment_id) === Number(appt.id)));
    const afterReminder = await appointmentsRepo.findAppointmentByIdForBranch(pool, appt.id, branch.id);
    assert.ok(afterReminder.reminder_sent_at);

    await growthAppointmentsService.addConfidentialNote(
      pool,
      ministerCtx,
      plan,
      appt.id,
      "Private counselling detail"
    );
    let noteDenied = null;
    try {
      await growthAppointmentsService.addConfidentialNote(
        pool,
        coordinatorCtx,
        plan,
        appt.id,
        "Should fail"
      );
    } catch (e) {
      noteDenied = e;
    }
    assert.equal(noteDenied && noteDenied.code, "PERMISSION_DENIED");
    const coordDetail = await growthAppointmentsService.loadAppointmentDetail(
      pool,
      coordinatorCtx,
      plan,
      appt.id
    );
    assert.equal(coordDetail.canViewConfidentialNotes, false);
    assert.equal(coordDetail.confidentialNotes.length, 0);
    assert.equal(coordDetail.appointment.purpose, "Pastoral visit");
    const ministerDetail = await growthAppointmentsService.loadAppointmentDetail(
      pool,
      ministerCtx,
      plan,
      appt.id
    );
    assert.equal(ministerDetail.confidentialNotes.length, 1);

    const cancelled = await growthAppointmentsService.cancelAppointment(
      pool,
      ministerCtx,
      plan,
      appt.id,
      "Member unavailable",
      "admin"
    );
    assert.equal(cancelled.status, "cancelled");

    // Surveys: recurring, branching, consent, routing
    const survey = await growthSurveysService.createSurvey(pool, ministerCtx, plan, {
      title: `Care check ${suffix}`,
      consent_text: "I consent to this pastoral survey.",
      sensitivity: "sensitive",
      authorised_audience: "pastoral",
      route_on_submit: "care_case",
      is_recurring: true,
      recurrence_interval_days: 30,
      next_run_at: new Date(Date.now() - 1000),
      status: "draft",
    });
    const q1 = await growthSurveysService.addQuestion(pool, ministerCtx, plan, survey.id, {
      question_key: "need_help",
      prompt: "Do you need follow-up?",
      question_type: "yes_no",
      options: ["yes", "no"],
      sort_order: 1,
    });
    const q2 = await growthSurveysService.addQuestion(pool, ministerCtx, plan, survey.id, {
      question_key: "details",
      prompt: "What support do you need?",
      question_type: "text",
      sort_order: 2,
      branch_parent_question_id: q1.id,
      branch_equals_value: "yes",
    });
    await growthSurveysService.activateSurvey(pool, ministerCtx, plan, survey.id);

    const recurring = await growthSurveysService.processRecurringSurveys(pool, plan);
    assert.ok(recurring.some((s) => Number(s.id) === Number(survey.id)));

    let consentErr = null;
    try {
      await growthSurveysService.startOrResumeSession(
        pool,
        { ...ministerCtx, member_id: member.id },
        plan,
        survey.id,
        false
      );
    } catch (e) {
      consentErr = e;
    }
    assert.equal(consentErr && consentErr.code, "CONSENT_REQUIRED");

    const session = await growthSurveysService.startOrResumeSession(
      pool,
      { ...ministerCtx, member_id: member.id },
      plan,
      survey.id,
      true
    );
    await growthSurveysService.saveAnswer(
      pool,
      { ...ministerCtx, member_id: member.id },
      plan,
      session.id,
      { question_id: q1.id, answer_text: "yes", answer_json: { value: "yes" } }
    );
    const resumed = await growthSurveysService.loadSessionForMember(
      pool,
      { ...ministerCtx, member_id: member.id },
      session.id
    );
    assert.ok(resumed.questions.some((q) => Number(q.id) === Number(q2.id)));
    assert.ok(!resumed.questions.every((q) => !q.branch_parent_question_id) || resumed.questions.length >= 2);

    await growthSurveysService.saveAnswer(
      pool,
      { ...ministerCtx, member_id: member.id },
      plan,
      session.id,
      { question_id: q2.id, answer_text: "Prayer and visit", answer_json: { value: "Prayer and visit" } }
    );
    const submitted = await growthSurveysService.submitSession(
      pool,
      { ...ministerCtx, member_id: member.id },
      plan,
      session.id
    );
    assert.ok(submitted.links.linked_pastoral_case_id);

    let sensitiveDenied = null;
    try {
      await growthSurveysService.loadResponseForAdmin(pool, coordinatorCtx, plan, session.id);
    } catch (e) {
      sensitiveDenied = e;
    }
    assert.equal(sensitiveDenied && sensitiveDenied.code, "PERMISSION_DENIED");
    const pastoralView = await growthSurveysService.loadResponseForAdmin(
      pool,
      ministerCtx,
      plan,
      session.id
    );
    assert.ok(pastoralView.answers.length >= 1);

    // Foundation restriction
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
    const foundationAppt = await foundationAgent.get("/branch/appointments");
    assert.equal(foundationAppt.status, 200);
    assert.match(foundationAppt.text, /Growth|upgrade|package/i);
    const foundationApptPost = await foundationAgent
      .post("/branch/appointments/settings")
      .type("form")
      .send({});
    assert.equal(foundationApptPost.status, 409);
    const foundationSurvey = await foundationAgent.get("/branch/surveys");
    assert.equal(foundationSurvey.status, 200);
    assert.match(foundationSurvey.text, /Growth|upgrade|package/i);

    let foundationCreateErr = null;
    try {
      await growthSurveysService.createSurvey(
        pool,
        {
          organization_id: orgFoundation.id,
          branch_id: foundationBranch.id,
          admin_id: 1,
        },
        foundationPlan,
        {
          title: "Should fail",
          consent_text: "Consent",
          status: "draft",
        }
      );
    } catch (e) {
      foundationCreateErr = e;
    }
    assert.equal(foundationCreateErr && foundationCreateErr.code, "PACKAGE_REQUIRED");

    // Tenant isolation
    let tenantErr = null;
    try {
      await growthAppointmentsService.loadAppointmentDetail(
        pool,
        {
          organization_id: orgOther.id,
          branch_id: otherBranch.id,
          admin_id: 1,
          can_access_pastoral: true,
        },
        plan,
        appt.id
      );
    } catch (e) {
      tenantErr = e;
    }
    assert.ok(tenantErr);

    await cleanup(pool, [orgGrowth.id, orgFoundation.id, orgOther.id]);
  }
);

test("resolveFeatureUi appointments and surveys package gates", () => {
  const { resolveFeatureUi } = require("../src/church/blessBoardPackageFeatures");
  const { resolvePackageFromPlanCode } = require("../src/church/blessBoardPackageCatalogue");
  const foundation = resolvePackageFromPlanCode("foundation");
  const growth = resolvePackageFromPlanCode("growth");
  assert.equal(resolveFeatureUi(foundation, "appointments_calendar").state, "upgrade");
  assert.equal(resolveFeatureUi(growth, "appointments_calendar").state, "available");
  assert.equal(resolveFeatureUi(foundation, "surveys_custom").state, "upgrade");
  assert.equal(resolveFeatureUi(growth, "surveys_custom").state, "available");
});
