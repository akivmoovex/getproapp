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
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const ministriesRepo = require("../src/db/pg/church/ministriesRepo");
const ministryLeadersRepo = require("../src/db/pg/church/ministryLeadersRepo");
const ministryActivityNotesRepo = require("../src/db/pg/church/ministryActivityNotesRepo");
const attendanceRepo = require("../src/db/pg/church/attendanceRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");
const { currentPeriodMonth } = require("../src/church/leaderActivityNotesValidation");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeApp(ctx, isChurchHost = true) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "test-church-ministry-activity",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = isChurchHost;
    req.churchContext = ctx;
    next();
  });
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

async function cleanup(pool, branchIds, orgIds) {
  for (const branchId of branchIds) {
    await pool.query(`DELETE FROM public.church_audit_logs WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_ministry_activity_notes WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_attendance_records WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_ministry_leaders WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_ministries WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("non-church host cannot access /branch/ministry-activity", async () => {
  const app = makeApp(null, false);
  const res = await request(app).get("/branch/ministry-activity");
  assert.equal(res.status, 404);
});

test("unauthenticated visitor redirects to /branch/login", async () => {
  const app = makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).get("/branch/ministry-activity");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/branch/login");
});

test(
  "branch ministry activity review",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("mar");
    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `mar_a_${suffix}`,
      name: `MAR Church A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `mar_b_${suffix}`,
      name: `MAR Church B ${suffix}`,
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      name: `MAR Branch A ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      name: `MAR Branch B ${suffix}`,
    });
    const passwordHash = await bcrypt.hash("testpass123", 12);
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      full_name: "Admin A",
      email: `admin_a_${suffix}@example.com`,
      phone: "0977222001",
      password_hash: passwordHash,
    });
    const ministryA = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      name: "Youth Ministry",
      slug: "youth",
      description: "Youth",
      status: "published",
      created_by_admin_id: null,
    });
    const ministryB = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      name: "Other Ministry",
      slug: "other",
      description: "Other",
      status: "published",
      created_by_admin_id: null,
    });
    const leaderA = await ministryLeadersRepo.createMinistryLeader(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      ministry_id: ministryA.id,
      full_name: "Grace Mwansa",
      email: `leader_${suffix}@example.com`,
      phone: "0977000003",
      password_hash: passwordHash,
      role: "ministry_leader",
      status: "active",
    });
    const leaderB = await ministryLeadersRepo.createMinistryLeader(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      ministry_id: ministryB.id,
      full_name: "Other Leader",
      email: `other_leader_${suffix}@example.com`,
      phone: "0977000004",
      password_hash: passwordHash,
      role: "ministry_leader",
      status: "active",
    });

    const periodMonth = currentPeriodMonth();
    await ministryActivityNotesRepo.createOrUpdateActivityNote(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      ministry_id: ministryA.id,
      leader_id: leaderA.id,
      period_month: "2099-02",
      title: "Draft note",
      activity_summary: "Should not show",
      status: "draft",
    });
    const submitted = await ministryActivityNotesRepo.createOrUpdateActivityNote(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      ministry_id: ministryA.id,
      leader_id: leaderA.id,
      period_month: periodMonth,
      title: "Submitted youth summary",
      activity_summary: "Great month for youth",
      challenges: "Space",
      support_needed: "Equipment",
      status: "submitted",
    });

    const otherNote = await ministryActivityNotesRepo.createOrUpdateActivityNote(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      ministry_id: ministryB.id,
      leader_id: leaderB.id,
      period_month: periodMonth,
      title: "Other branch note",
      activity_summary: "Hidden",
      status: "submitted",
    });

    await attendanceRepo.createAttendanceRecord(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      attendance_date: new Date().toISOString().slice(0, 10),
      attendance_type: "Ministry meeting",
      service_name: "Youth meet",
      adults_count: 2,
      youth_count: 10,
      children_count: 0,
      first_time_visitors_count: 1,
      new_members_count: 0,
      volunteers_count: 2,
      status: "submitted",
      ministry_id: ministryA.id,
      created_by_leader_id: leaderA.id,
      created_by_admin_id: null,
    });

    const app = makeApp({
      kind: "branch",
      orgSlug: orgA.slug,
      organization: orgA,
      branch: branchA,
    });
    const adminAgent = request.agent(app);
    await adminAgent.post("/branch/login").type("form").send({
      identifier: `admin_a_${suffix}@example.com`,
      password: "testpass123",
    });

    const queue = await adminAgent.get("/branch/ministry-activity");
    assert.equal(queue.status, 200);
    assert.match(queue.text, /Submitted youth summary/);
    assert.doesNotMatch(queue.text, /Draft note/);
    assert.doesNotMatch(queue.text, /Other branch note/);

    const crossBranch = await adminAgent.get(`/branch/ministry-activity/${otherNote.id}`);
    assert.equal(crossBranch.status, 404);

    const reviewed = await adminAgent
      .post(`/branch/ministry-activity/${submitted.id}/mark-reviewed`)
      .type("form")
      .send({ admin_comment: "Well done" });
    assert.equal(reviewed.status, 303);

    const afterReview = await ministryActivityNotesRepo.findActivityNoteByIdForBranch(
      pool,
      submitted.id,
      branchA.id
    );
    assert.equal(afterReview.review_status, "reviewed");

    const followUpNote = await ministryActivityNotesRepo.createOrUpdateActivityNote(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      ministry_id: ministryA.id,
      leader_id: leaderA.id,
      period_month: "2099-03",
      title: "Future follow up test",
      activity_summary: "Needs more detail",
      status: "submitted",
    });

    const noComment = await adminAgent
      .post(`/branch/ministry-activity/${followUpNote.id}/request-follow-up`)
      .type("form")
      .send({});
    assert.equal(noComment.status, 400);

    const followUp = await adminAgent
      .post(`/branch/ministry-activity/${followUpNote.id}/request-follow-up`)
      .type("form")
      .send({ admin_comment: "Please add attendance numbers" });
    assert.equal(followUp.status, 303);

    const attendancePage = await adminAgent.get("/branch/ministry-attendance");
    assert.equal(attendancePage.status, 200);
    assert.match(attendancePage.text, /Youth meet/);

    const reportForm = await adminAgent.get("/branch/reports/new");
    assert.equal(reportForm.status, 200);
    assert.match(reportForm.text, /Ministry leader activity/i);
    assert.match(reportForm.text, /Use ministry notes below/i);

    await cleanup(pool, [branchA.id, branchB.id], [orgA.id, orgB.id]);
  }
);
