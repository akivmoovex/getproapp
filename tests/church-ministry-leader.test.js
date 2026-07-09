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
const ministriesRepo = require("../src/db/pg/church/ministriesRepo");
const ministryLeadersRepo = require("../src/db/pg/church/ministryLeadersRepo");
const dutyRosterRepo = require("../src/db/pg/church/dutyRosterRepo");
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
      secret: "test-church-ministry-leader",
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
    await pool.query(`DELETE FROM public.church_duty_roster WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_ministry_leaders WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_ministries WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("non-church host cannot access /leader/dashboard", async () => {
  const app = makeApp(null, false);
  const res = await request(app).get("/leader/dashboard");
  assert.equal(res.status, 404);
});

test("unauthenticated visitor redirects to /leader/login", async () => {
  const app = makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).get("/leader/dashboard");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/leader/login");
});

test(
  "ministry leader lite portal",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("ldr");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `ldr_${suffix}`,
      name: `Leader Church ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Leader Branch ${suffix}`,
    });
    const youth = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      name: "Youth Ministry",
      slug: "youth-ministry",
      description: "Youth discipleship",
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
      description: "Worship choir",
      leader_name: "Other Leader",
      visibility: "members",
      status: "published",
      created_by_admin_id: null,
    });
    const passwordHash = await bcrypt.hash("testpass123", 12);
    const youthLeader = await ministryLeadersRepo.createMinistryLeader(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      ministry_id: youth.id,
      full_name: "Grace Mwansa",
      email: `youth.leader_${suffix}@example.com`,
      phone: "0977000003",
      password_hash: passwordHash,
      role: "ministry_leader",
      status: "active",
    });
    await ministryLeadersRepo.createMinistryLeader(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      ministry_id: choir.id,
      full_name: "Choir Leader",
      email: `choir.leader_${suffix}@example.com`,
      phone: "0977000004",
      password_hash: passwordHash,
      role: "ministry_leader",
      status: "active",
    });

    const future = new Date();
    future.setDate(future.getDate() + 7);
    const dutyDate = future.toISOString().slice(0, 10);
    await dutyRosterRepo.createDutyForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      duty_date: dutyDate,
      service_name: "Youth Service",
      role_name: "Ushering",
      assigned_member_id: null,
      assigned_member_name: "Volunteer",
      ministry_id: youth.id,
      status: "confirmed",
      created_by_admin_id: null,
    });
    await dutyRosterRepo.createDutyForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      duty_date: dutyDate,
      service_name: "Choir Service",
      role_name: "Soprano",
      assigned_member_name: "Singer",
      ministry_id: choir.id,
      status: "confirmed",
      created_by_admin_id: null,
    });

    const app = makeApp({
      kind: "branch",
      orgSlug: org.slug,
      organization: org,
      branch,
    });
    const leaderAgent = request.agent(app);
    const login = await leaderAgent.post("/leader/login").type("form").send({
      identifier: `youth.leader_${suffix}@example.com`,
      password: "testpass123",
    });
    assert.equal(login.status, 302);
    assert.equal(login.headers.location, "/leader/dashboard");

    const dashboard = await leaderAgent.get("/leader/dashboard");
    assert.equal(dashboard.status, 200);
    assert.match(dashboard.text, /Youth Ministry/);
    assert.match(dashboard.text, /Grace Mwansa/i);
    assert.doesNotMatch(dashboard.text, /Choir Ministry/);

    const branchAdminAttempt = await leaderAgent.get("/branch/dashboard");
    assert.equal(branchAdminAttempt.status, 302);
    assert.equal(branchAdminAttempt.headers.location, "/branch/login");

    const duties = await leaderAgent.get("/leader/duties");
    assert.equal(duties.status, 200);
    assert.match(duties.text, /Youth Service/);
    assert.doesNotMatch(duties.text, /Choir Service/);

    const roster = await leaderAgent.get("/leader/roster");
    assert.equal(roster.status, 200);
    assert.match(roster.text, /No members assigned|Name/);

    const attendance = await leaderAgent.post("/leader/attendance").type("form").send({
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
    assert.equal(attendance.status, 303);

    const periodMonth = currentPeriodMonth();
    const saveNote = await leaderAgent.post("/leader/activity-notes").type("form").send({
      period_month: periodMonth,
      title: "Youth monthly summary",
      activity_summary: "Weekly meetings went well.",
      challenges: "Need more volunteers",
      support_needed: "Sound equipment",
      _intent: "draft",
    });
    assert.equal(saveNote.status, 303);

    const submitNote = await leaderAgent.post("/leader/activity-notes").type("form").send({
      period_month: periodMonth,
      title: "Youth monthly summary",
      activity_summary: "Weekly meetings went well.",
      challenges: "Need more volunteers",
      support_needed: "Sound equipment",
      _intent: "submit",
    });
    assert.equal(submitNote.status, 303);

    const activityPage = await leaderAgent.get("/leader/activity-notes");
    assert.match(activityPage.text, /Submitted/);

    await cleanup(pool, [branch.id], [org.id]);
  }
);
