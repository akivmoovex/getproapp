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
const ministryLeadersRepo = require("../src/db/pg/church/ministryLeadersRepo");
const memberPasswordResetRequestsRepo = require("../src/db/pg/church/memberPasswordResetRequestsRepo");
const ministryLeaderPasswordResetRequestsRepo = require("../src/db/pg/church/ministryLeaderPasswordResetRequestsRepo");
const branchResetRequestsInboxRepo = require("../src/db/pg/church/branchResetRequestsInboxRepo");
const { parseBranchResetInboxFilters } = require("../src/church/branchResetRequestsInboxValidation");
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
      secret: "test-church-branch-reset-inbox",
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
    await pool.query(`DELETE FROM public.church_member_password_reset_requests WHERE branch_id = $1`, [
      branchId,
    ]);
    await pool.query(
      `DELETE FROM public.church_ministry_leader_password_reset_requests WHERE branch_id = $1`,
      [branchId]
    );
    await pool.query(`DELETE FROM public.church_ministry_leaders WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_ministries WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("parseBranchResetInboxFilters validates enums and pagination", () => {
  assert.equal(parseBranchResetInboxFilters({ request_type: "bad" }).ok, false);
  assert.equal(parseBranchResetInboxFilters({ status: "bad" }).ok, false);
  assert.equal(parseBranchResetInboxFilters({ date_from: "2026-13-01" }).ok, false);
  const ok = parseBranchResetInboxFilters({
    request_type: "member",
    status: "submitted",
    q: "grace",
    page: 2,
    limit: 25,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.data.request_type, "member");
  assert.equal(ok.data.page, 2);
  assert.equal(ok.data.limit, 25);
});

test("non-church host cannot access /branch/reset-requests", async () => {
  const app = makeApp(null, false);
  const res = await request(app).get("/branch/reset-requests");
  assert.equal(res.status, 404);
});

test("unauthenticated visitor redirects from /branch/reset-requests", async () => {
  const app = makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).get("/branch/reset-requests");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/branch/login");
});

test(
  "branch unified reset inbox integration",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("brinbox");
    const passwordHash = await bcrypt.hash("adminpass123456", 12);

    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `brinbox_a_${suffix}`,
      name: `Branch Inbox A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `brinbox_b_${suffix}`,
      name: `Branch Inbox B ${suffix}`,
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      name: `Branch A ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      name: `Branch B ${suffix}`,
    });

    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      full_name: "Admin A",
      email: `admin_a_${suffix}@example.com`,
      phone: "0977333001",
      password_hash: passwordHash,
      role: "branch_admin",
    });

    const member = await membersRepo.createPendingMember(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      email: `member_a_${suffix}@example.com`,
      phone: "0977333002",
      full_name: "Member Alpha",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Lusaka",
      attendance_duration: "Less than 6 months",
    });

    const ministry = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      name: "Youth Ministry",
      slug: "youth",
      description: "Youth",
      leader_name: "Grace Mwansa",
      visibility: "members",
      status: "published",
      created_by_admin_id: null,
    });

    const leader = await ministryLeadersRepo.createMinistryLeader(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      ministry_id: ministry.id,
      full_name: "Grace Mwansa",
      email: `leader_a_${suffix}@example.com`,
      phone: "0977333003",
      password_hash: passwordHash,
      role: "ministry_leader",
      status: "active",
    });

    const memberReq = await memberPasswordResetRequestsRepo.createPasswordResetRequest(pool, {
      organizationId: orgA.id,
      branchId: branchA.id,
      memberId: member.id,
      identifierSubmitted: `member_a_${suffix}@example.com`,
      fullNameSubmitted: "Member Alpha",
    });

    const leaderReq = await ministryLeaderPasswordResetRequestsRepo.createMinistryLeaderPasswordResetRequest(
      pool,
      {
        organizationId: orgA.id,
        branchId: branchA.id,
        ministryLeaderId: leader.id,
        ministryId: ministry.id,
        identifierSubmitted: `leader_a_${suffix}@example.com`,
        fullNameSubmitted: "Grace Mwansa",
      }
    );

    await memberPasswordResetRequestsRepo.createPasswordResetRequest(pool, {
      organizationId: orgB.id,
      branchId: branchB.id,
      memberId: null,
      identifierSubmitted: `other_branch_${suffix}@example.com`,
    });

    const app = makeApp({
      kind: "branch",
      orgSlug: orgA.slug,
      organization: orgA,
      branch: branchA,
    });

    const agent = request.agent(app);
    await agent.post("/branch/login").type("form").send({
      identifier: `admin_a_${suffix}@example.com`,
      password: "adminpass123456",
    });

    const inbox = await agent.get("/branch/reset-requests");
    assert.equal(inbox.status, 200);
    assert.match(inbox.text, /Reset Inbox/i);
    assert.match(inbox.text, /Member Reset Queue/i);
    assert.match(inbox.text, /Ministry Leader Reset Queue/i);
    assert.match(inbox.text, /Member Alpha/i);
    assert.match(inbox.text, /Grace Mwansa/i);
    assert.match(inbox.text, /Youth Ministry/i);
    assert.match(inbox.text, /Reset Inbox\s*\(2\)/);
    assert.doesNotMatch(inbox.text, /Password Resets\s*\(/);
    assert.doesNotMatch(inbox.text, /Leader Resets\s*\(/);
    assert.equal(inbox.text.includes("adminpass123456"), false);
    assert.equal(inbox.text.includes("password_hash"), false);

    const memberQueue = await agent.get("/branch/password-reset-requests");
    assert.equal(memberQueue.status, 200);
    assert.match(memberQueue.text, /Member Reset Queue/i);

    const leaderQueue = await agent.get("/branch/leader-password-reset-requests");
    assert.equal(leaderQueue.status, 200);
    assert.match(leaderQueue.text, /Ministry Leader Reset Queue/i);

    const dashboard = await agent.get("/branch/dashboard");
    assert.equal(dashboard.status, 200);
    assert.match(dashboard.text, /reset-requests\?status=submitted/);
    assert.match(dashboard.text, /Open Reset Inbox/i);
    assert.doesNotMatch(dashboard.text, /Review Password Reset Requests/i);
    assert.doesNotMatch(dashboard.text, /Review Leader Password Resets/i);

    const memberOnly = await branchResetRequestsInboxRepo.listUnifiedBranchResetRequests(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      request_type: "member",
      status: "all",
      q: "",
      page: 1,
      limit: 50,
    });
    assert.equal(memberOnly.items.length, 1);
    assert.equal(memberOnly.items[0].request_type, "member");
    assert.equal(memberOnly.items[0].request_id, memberReq.id);
    assert.equal(memberOnly.items[0].detail_url, `/branch/password-reset-requests/${memberReq.id}`);

    const leaderOnly = await branchResetRequestsInboxRepo.listUnifiedBranchResetRequests(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      request_type: "ministry_leader",
      status: "all",
      q: "",
      page: 1,
      limit: 50,
    });
    assert.equal(leaderOnly.items.length, 1);
    assert.equal(leaderOnly.items[0].request_type, "ministry_leader");
    assert.equal(leaderOnly.items[0].detail_url, `/branch/leader-password-reset-requests/${leaderReq.id}`);

    const search = await branchResetRequestsInboxRepo.listUnifiedBranchResetRequests(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      request_type: "all",
      status: "all",
      q: "Grace",
      page: 1,
      limit: 50,
    });
    assert.equal(search.items.length, 1);
    assert.equal(search.items[0].request_id, leaderReq.id);

    const submitted = await branchResetRequestsInboxRepo.listUnifiedBranchResetRequests(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      request_type: "all",
      status: "submitted",
      q: "",
      page: 1,
      limit: 50,
    });
    assert.equal(submitted.items.length, 2);

    const pending = await branchResetRequestsInboxRepo.getPendingBranchResetRequestCounts(
      pool,
      orgA.id,
      branchA.id
    );
    assert.equal(pending.submitted_total, 2);
    assert.equal(pending.member, 1);
    assert.equal(pending.ministry_leader, 1);

    const filteredPage = await agent.get("/branch/reset-requests?request_type=member&status=submitted");
    assert.equal(filteredPage.status, 200);
    assert.match(filteredPage.text, /Member Alpha/i);
    assert.doesNotMatch(filteredPage.text, /Youth Ministry/);

    const branchBList = await branchResetRequestsInboxRepo.listUnifiedBranchResetRequests(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      request_type: "all",
      status: "all",
      q: "",
      page: 1,
      limit: 50,
    });
    assert.equal(branchBList.items.length, 1);
    assert.notEqual(branchBList.items[0].request_id, memberReq.id);

    await cleanup(pool, [branchA.id, branchB.id], [orgA.id, orgB.id]);
  }
);
