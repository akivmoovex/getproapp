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
const membersRepo = require("../src/db/pg/church/membersRepo");
const memberRequestsRepo = require("../src/db/pg/church/memberRequestsRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");

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
      secret: "test-church-member-portal",
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

async function cleanup(pool, branchId, orgId) {
  await pool.query(`DELETE FROM public.church_audit_logs WHERE branch_id = $1`, [branchId]);
  await pool.query(`DELETE FROM public.church_prayer_requests WHERE branch_id = $1`, [branchId]);
  await pool.query(`DELETE FROM public.church_member_requests WHERE branch_id = $1`, [branchId]);
  await pool.query(`DELETE FROM public.church_announcements WHERE branch_id = $1`, [branchId]);
  await pool.query(`DELETE FROM public.church_events WHERE branch_id = $1`, [branchId]);
  await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branchId]);
  await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

test("non-church host cannot access member dashboard", async () => {
  const app = makeApp(null, false);
  const res = await request(app).get("/member/dashboard");
  assert.equal(res.status, 404);
});

test("unauthenticated visitor redirects to login", async () => {
  const app = makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).get("/member/dashboard");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/login");
});

test(
  "member portal access and submissions",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("mp");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `mp_${suffix}`,
      name: `Portal Church ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Portal Church ${suffix}`,
    });
    const passwordHash = await bcrypt.hash("testpass123", 12);

    const pending = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email: `pending_${suffix}@example.com`,
      phone: "0977555001",
      full_name: "Pending Member",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
    });

    const verified = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email: `verified_${suffix}@example.com`,
      phone: "0977555002",
      full_name: "Verified Member",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
    });
    await membersRepo.updateMemberStatusForBranch(pool, verified.id, branch.id, "verified");

    const other = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email: `other_${suffix}@example.com`,
      phone: "0977555003",
      full_name: "Other Member",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Youth (13-19)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
    });
    await membersRepo.updateMemberStatusForBranch(pool, other.id, branch.id, "verified");

    const app = makeApp({ kind: "branch", orgSlug: org.slug, organization: org, branch });
    const pendingAgent = request.agent(app);
    await pendingAgent.post("/login").type("form").send({
      identifier: `pending_${suffix}@example.com`,
      password: "testpass123",
    });
    const pendingDash = await pendingAgent.get("/member/dashboard");
    assert.equal(pendingDash.status, 302);
    assert.equal(pendingDash.headers.location, "/waiting-verification");

    const agent = request.agent(app);
    await agent.post("/login").type("form").send({
      identifier: `verified_${suffix}@example.com`,
      password: "testpass123",
    });
    const dash = await agent.get("/member/dashboard");
    assert.equal(dash.status, 200);
    assert.match(dash.text, /Verified member/);

    const profileUpdate = await agent.post("/member/profile").type("form").send({
      full_name: "Verified Member Updated",
      email: `verified_${suffix}@example.com`,
      phone: "0977555099",
      gender: "female",
      age_group: "Adult (36-60)",
      address_area: "Kafue Central",
      ministry_interest: "choir",
      emergency_contact_name: "Jane Doe",
      emergency_contact_phone: "0977000000",
    });
    assert.equal(profileUpdate.status, 303);

    const prayer = await agent.post("/member/prayer-request").type("form").send({
      prayer_topic: "Healing",
      details: "Please pray for recovery",
      urgency: "urgent",
      privacy_level: "prayer_team",
    });
    assert.equal(prayer.status, 303);

    const prayerPage = await agent.get("/member/prayer-request");
    assert.equal(prayerPage.status, 200);
    assert.match(prayerPage.text, /Healing/);
    assert.match(prayerPage.text, /Submitted/);

    const reqCreate = await agent.post("/member/requests").type("form").send({
      request_type: "Baptism",
      subject: "Baptism request",
      description: "I would like to be baptized next month.",
    });
    assert.equal(reqCreate.status, 303);
    const requestId = Number(String(reqCreate.headers.location).match(/\/member\/requests\/(\d+)/)[1]);

    const otherReq = await memberRequestsRepo.createMemberRequest(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      member_id: other.id,
      request_type: "Other",
      subject: "Secret",
      description: "Not yours",
    });

    const blocked = await agent.get(`/member/requests/${otherReq.id}`);
    assert.equal(blocked.status, 404);

    const own = await agent.get(`/member/requests/${requestId}`);
    assert.equal(own.status, 200);
    assert.match(own.text, /Baptism request/);

    await cleanup(pool, branch.id, org.id);
  }
);
