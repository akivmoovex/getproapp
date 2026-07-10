"use strict";

const path = require("path");
const fs = require("fs");
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
const ministriesRepo = require("../src/db/pg/church/ministriesRepo");
const ministryLeadersRepo = require("../src/db/pg/church/ministryLeadersRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");
const { setChurchMemberSession } = require("../src/church/memberAuth");
const { validateAttendanceBody } = require("../src/church/attendanceValidation");
const { validateActivityNoteBody, currentPeriodMonth } = require("../src/church/leaderActivityNotesValidation");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeApp(ctx, sessionHook) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "test-leader-attendance-notes-visual",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = ctx;
    if (typeof sessionHook === "function") sessionHook(req);
    next();
  });
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

async function cleanup(pool, branchId, orgId) {
  await pool.query(`DELETE FROM public.church_audit_logs WHERE branch_id = $1`, [branchId]).catch(() => {});
  await pool.query(`DELETE FROM public.church_ministry_activity_notes WHERE branch_id = $1`, [branchId]).catch(() => {});
  await pool.query(`DELETE FROM public.church_attendance_records WHERE branch_id = $1`, [branchId]).catch(() => {});
  await pool.query(`DELETE FROM public.church_ministry_leaders WHERE branch_id = $1`, [branchId]);
  await pool.query(`DELETE FROM public.church_ministries WHERE branch_id = $1`, [branchId]);
  await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

test("anonymous users are blocked from attendance and activity-notes", async () => {
  const app = makeApp({
    kind: "branch",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  for (const route of ["/leader/attendance", "/leader/activity-notes"]) {
    const res = await request(app).get(route);
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, "/leader/login");
  }
});

test("member session cannot access attendance or activity-notes", async () => {
  const app = makeApp(
    {
      kind: "branch",
      organization: { id: 3, name: "Demo", status: "active" },
      branch: { id: 3, name: "Demo Branch", status: "active" },
    },
    (req) => {
      setChurchMemberSession(req, {
        member_id: 33,
        organization_id: 3,
        branch_id: 3,
        full_name: "Member User",
        status: "verified",
      });
    }
  );
  for (const route of ["/leader/attendance", "/leader/activity-notes"]) {
    const res = await request(app).get(route);
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, "/leader/login");
  }
});

test("attendance and activity-note routes and validation remain unchanged", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/routes/church/leaderPortal.js"), "utf8");
  assert.match(src, /router\.get\("\/leader\/attendance"/);
  assert.match(src, /router\.post\("\/leader\/attendance"/);
  assert.match(src, /\/leader\/activity-notes/);
  assert.doesNotMatch(src, /present_absent|qr_attendance|facial|ai_summary/i);

  const badAttendance = validateAttendanceBody({
    attendance_type: "Ministry meeting",
    service_name: "",
    attendance_date: "2026-07-01",
    adults_count: 1,
    youth_count: 0,
    children_count: 0,
    first_time_visitors_count: 0,
    new_members_count: 0,
    volunteers_count: 0,
    submit_action: "submit",
  });
  assert.equal(badAttendance.ok, false);

  const badNote = validateActivityNoteBody({
    period_month: "bad",
    title: "",
    activity_summary: "x",
  });
  assert.equal(badNote.ok, false);
  assert.equal(badNote.form.title, "");
});

test(
  "leader attendance and activity-notes visual alignment",
  { skip: !isPgConfigured() },
  async (t) => {
    const pool = getPgPool();
    try {
      await pool.query("SELECT 1");
    } catch (e) {
      t.skip(`PostgreSQL unreachable (${e.code || e.message})`);
      return;
    }

    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("ldran");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `ldran_${suffix}`.replace(/[^a-z0-9_]/g, "").slice(0, 40),
      name: `Leader AN Church ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Leader AN Branch ${suffix}`,
    });
    const youth = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      name: "Youth Ministry",
      slug: "youth-ministry",
      description: "Youth",
      leader_name: "Grace Mwansa",
      visibility: "members",
      status: "published",
      created_by_admin_id: null,
    });
    const choir = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      name: "Choir Ministry",
      slug: "choir",
      description: "Choir",
      leader_name: "Other",
      visibility: "members",
      status: "published",
      created_by_admin_id: null,
    });
    const passwordHash = await bcrypt.hash("testpass123", 12);
    await ministryLeadersRepo.createMinistryLeader(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      ministry_id: youth.id,
      full_name: "Grace Mwansa",
      email: `youth.an_${suffix}@example.com`,
      phone: "0977000101",
      password_hash: passwordHash,
      role: "ministry_leader",
      status: "active",
    });
    await ministryLeadersRepo.createMinistryLeader(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      ministry_id: choir.id,
      full_name: "Choir Leader",
      email: `choir.an_${suffix}@example.com`,
      phone: "0977000102",
      password_hash: passwordHash,
      role: "ministry_leader",
      status: "active",
    });

    const app = makeApp({
      kind: "branch",
      orgSlug: org.slug,
      organization: org,
      branch,
    });
    const agent = request.agent(app);
    await agent
      .post("/leader/login")
      .type("form")
      .send({
        identifier: `youth.an_${suffix}@example.com`,
        password: "testpass123",
      })
      .expect(302);

    const attendanceGet = await agent.get("/leader/attendance");
    assert.equal(attendanceGet.status, 200);
    assert.match(attendanceGet.text, /data-leader-shell="stitch-v48"/);
    assert.match(attendanceGet.text, /data-leader-attendance-form/);
    assert.match(attendanceGet.text, /data-leader-attendance-counts/);
    assert.match(attendanceGet.text, /data-leader-empty="attendance"/);
    assert.match(attendanceGet.text, /name="adults_count"/);
    assert.match(attendanceGet.text, /name="youth_count"/);
    assert.match(attendanceGet.text, /name="children_count"/);
    assert.match(attendanceGet.text, /name="first_time_visitors_count"/);
    assert.match(attendanceGet.text, /name="new_members_count"/);
    assert.match(attendanceGet.text, /name="volunteers_count"/);
    assert.match(attendanceGet.text, /church-leader-count-card|church-leader-attendance-total/);
    assert.match(attendanceGet.text, /church-member-nav-link--active/);
    assert.doesNotMatch(attendanceGet.text, /present|absent|QR|facial|password_hash/i);
    assert.doesNotMatch(attendanceGet.text, /Choir Ministry/);

    const invalidAttendance = await agent.post("/leader/attendance").type("form").send({
      attendance_type: "Ministry meeting",
      service_name: "Youth Bible study",
      attendance_date: new Date().toISOString().slice(0, 10),
      adults_count: -1,
      youth_count: 1,
      children_count: 0,
      first_time_visitors_count: 0,
      new_members_count: 0,
      volunteers_count: 0,
      notes: "kept",
      submit_action: "submit",
    });
    assert.equal(invalidAttendance.status, 400);
    assert.match(invalidAttendance.text, /data-leader-attendance-error/);
    assert.match(invalidAttendance.text, /Youth Bible study/);
    assert.match(invalidAttendance.text, />kept</);

    const okAttendance = await agent.post("/leader/attendance").type("form").send({
      attendance_type: "Ministry meeting",
      service_name: "Youth Bible study",
      attendance_date: new Date().toISOString().slice(0, 10),
      adults_count: 5,
      youth_count: 12,
      children_count: 0,
      first_time_visitors_count: 1,
      new_members_count: 0,
      volunteers_count: 3,
      notes: "Great turnout",
      submit_action: "submit",
    });
    assert.equal(okAttendance.status, 303);
    assert.equal(okAttendance.headers.location, "/leader/attendance?notice=attendance_saved");

    const attendanceAfter = await agent.get("/leader/attendance?notice=attendance_saved");
    assert.equal(attendanceAfter.status, 200);
    assert.match(attendanceAfter.text, /data-leader-attendance-notice|Attendance record saved/);
    assert.match(attendanceAfter.text, /Youth Bible study/);
    assert.match(attendanceAfter.text, /data-leader-attendance-desktop|data-leader-attendance-mobile/);
    assert.doesNotMatch(attendanceAfter.text, /data-leader-empty="attendance"/);

    const notesGet = await agent.get("/leader/activity-notes");
    assert.equal(notesGet.status, 200);
    assert.match(notesGet.text, /data-leader-notes-form/);
    assert.match(notesGet.text, /data-leader-notes-summary/);
    assert.match(notesGet.text, /data-leader-notes-challenges/);
    assert.match(notesGet.text, /data-leader-empty="activity-notes"/);
    assert.match(notesGet.text, /name="period_month"/);
    assert.match(notesGet.text, /name="title"/);
    assert.match(notesGet.text, /name="activity_summary"/);
    assert.match(notesGet.text, /church-leader-notes-split|church-show-mobile-only|church-leader-topbar/);
    assert.doesNotMatch(notesGet.text, /AI |Auto-Calculated|Financial|password_hash/i);

    const invalidNote = await agent.post("/leader/activity-notes").type("form").send({
      period_month: "not-a-month",
      title: "",
      activity_summary: "Should remain",
      challenges: "Challenge text",
      support_needed: "Support text",
      _intent: "draft",
    });
    assert.equal(invalidNote.status, 400);
    assert.match(invalidNote.text, /data-leader-notes-error/);
    assert.match(invalidNote.text, /Should remain/);
    assert.match(invalidNote.text, /Challenge text/);

    const periodMonth = currentPeriodMonth();
    const saveNote = await agent.post("/leader/activity-notes").type("form").send({
      period_month: periodMonth,
      title: "Youth monthly summary",
      activity_summary: "Weekly meetings went well.",
      challenges: "Need more volunteers",
      support_needed: "Sound equipment",
      _intent: "draft",
    });
    assert.equal(saveNote.status, 303);

    const notesAfter = await agent.get("/leader/activity-notes");
    assert.equal(notesAfter.status, 200);
    assert.match(notesAfter.text, /Youth monthly summary/);
    assert.match(notesAfter.text, /Draft|Submitted/);
    assert.doesNotMatch(notesAfter.text, /data-leader-empty="activity-notes"/);
    assert.doesNotMatch(notesAfter.text, /Choir Ministry/);

    await cleanup(pool, branch.id, org.id);
  }
);
