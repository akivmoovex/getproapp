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
const membersRepo = require("../src/db/pg/church/membersRepo");
const ministriesRepo = require("../src/db/pg/church/ministriesRepo");
const memberMinistriesRepo = require("../src/db/pg/church/memberMinistriesRepo");
const ministryJoinRequestsRepo = require("../src/db/pg/church/ministryJoinRequestsRepo");
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
      secret: "test-church-ministry-join",
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
    await pool.query(`DELETE FROM public.church_ministry_join_requests WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_member_ministries WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_ministries WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("non-church host cannot access /branch/ministry-join-requests", async () => {
  const app = makeApp(null, false);
  const res = await request(app).get("/branch/ministry-join-requests");
  assert.equal(res.status, 404);
});

test("unauthenticated member redirects to /login", async () => {
  const app = makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).get("/member/ministries");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/login");
});

test(
  "member ministry join request workflow",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("mjoin");
    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `mj_a_${suffix}`,
      name: `Join Church A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `mj_b_${suffix}`,
      name: `Join Church B ${suffix}`,
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      name: `Join Branch A ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      name: `Join Branch B ${suffix}`,
    });
    const passwordHash = await bcrypt.hash("testpass123", 12);
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      full_name: "Admin A",
      email: `admin_a_${suffix}@example.com`,
      phone: "0977333001",
      password_hash: passwordHash,
    });
    const member = await membersRepo.createPendingMember(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      email: `member_${suffix}@example.com`,
      phone: "0977333002",
      full_name: "Verified Member",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
      ministry_interest: "youth",
    });
    await membersRepo.updateMemberStatusForBranch(pool, member.id, branchA.id, "verified");

    const youthA = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      name: "Youth Ministry",
      slug: "youth",
      description: "Youth discipleship",
      leader_name: "Grace Mwansa",
      visibility: "members",
      status: "published",
      created_by_admin_id: null,
    });
    const otherBranchMinistry = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      name: "Other Branch Ministry",
      slug: "other",
      description: "Other",
      leader_name: "Other",
      visibility: "members",
      status: "published",
      created_by_admin_id: null,
    });

    const appA = makeApp({
      kind: "branch",
      orgSlug: orgA.slug,
      organization: orgA,
      branch: branchA,
    });
    const memberAgent = request.agent(appA);
    await memberAgent.post("/login").type("form").send({
      identifier: `member_${suffix}@example.com`,
      password: "testpass123",
    });

    const submit = await memberAgent.post(`/member/ministries/${youthA.id}/request-join`).type("form").send({
      message: "I would like to serve in youth ministry.",
    });
    assert.equal(submit.status, 303);

    const duplicate = await memberAgent.post(`/member/ministries/${youthA.id}/request-join`).type("form").send({
      message: "Duplicate attempt",
    });
    assert.equal(duplicate.status, 400);

    const crossBranch = await memberAgent.get(`/member/ministries/${otherBranchMinistry.id}`);
    assert.equal(crossBranch.status, 404);

    const adminAgent = request.agent(appA);
    await adminAgent.post("/branch/login").type("form").send({
      identifier: `admin_a_${suffix}@example.com`,
      password: "testpass123",
    });

    const queue = await adminAgent.get("/branch/ministry-join-requests?status=submitted");
    assert.equal(queue.status, 200);
    assert.match(queue.text, /Youth Ministry/);
    assert.match(queue.text, /Verified Member/);

    const openRequests = await ministryJoinRequestsRepo.listJoinRequestsForBranch(pool, branchA.id, {
      status: "submitted",
    });
    assert.equal(openRequests.length, 1);
    const requestId = openRequests[0].id;

    const rejectNoComment = await adminAgent.post(
      `/branch/ministry-join-requests/${requestId}/reject`
    ).type("form").send({});
    assert.equal(rejectNoComment.status, 400);

    const moreInfo = await adminAgent.post(
      `/branch/ministry-join-requests/${requestId}/request-more-info`
    ).type("form").send({ admin_comment: "Please share your availability." });
    assert.equal(moreInfo.status, 303);

    const resubmit = await memberAgent.post(`/member/ministries/${youthA.id}/request-join`).type("form").send({
      message: "Available on Saturdays.",
    });
    assert.equal(resubmit.status, 303);

    const approve = await adminAgent.post(
      `/branch/ministry-join-requests/${requestId}/approve`
    );
    assert.equal(approve.status, 303);

    const assignment = await memberMinistriesRepo.findActiveMemberMinistry(
      pool,
      member.id,
      youthA.id,
      branchA.id
    );
    assert.ok(assignment);
    assert.equal(assignment.status, "active");

    const myMinistries = await memberAgent.get("/member/my-ministries");
    assert.equal(myMinistries.status, 200);
    assert.match(myMinistries.text, /Youth Ministry/);
    assert.match(myMinistries.text, /Active ministries/i);

    const appB = makeApp({
      kind: "branch",
      orgSlug: orgB.slug,
      organization: orgB,
      branch: branchB,
    });
    const adminB = request.agent(appB);
    await adminB.post("/branch/login").type("form").send({
      identifier: `admin_a_${suffix}@example.com`,
      password: "testpass123",
    });
    const crossReview = await adminB.get(`/branch/ministry-join-requests/${requestId}`);
    assert.equal(crossReview.status, 404);

    const audit = await pool.query(
      `SELECT action FROM public.church_audit_logs WHERE branch_id = $1 ORDER BY id`,
      [branchA.id]
    );
    const actions = audit.rows.map((r) => r.action);
    assert.ok(actions.includes("ministry_join_request_submitted"));
    assert.ok(actions.includes("ministry_join_request_more_info_requested"));
    assert.ok(actions.includes("ministry_join_request_approved"));
    assert.ok(actions.includes("member_added_to_ministry"));

    await cleanup(pool, [branchA.id, branchB.id], [orgA.id, orgB.id]);
  }
);
