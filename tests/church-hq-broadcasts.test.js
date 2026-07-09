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
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const hqBroadcastsRepo = require("../src/db/pg/church/hqBroadcastsRepo");
const {
  MEMBER_HQ_AUDIENCES,
  PUBLIC_HQ_AUDIENCES,
  BRANCH_ADMIN_HQ_AUDIENCES,
  LEADER_HQ_AUDIENCES,
} = require("../src/church/hqBroadcastValidation");
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
      secret: "test-church-hq-broadcasts",
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

async function cleanup(pool, orgIds) {
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_hq_broadcast_targets WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_hq_broadcasts WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("non-church host cannot access /hq/broadcasts", async () => {
  const app = makeApp(null, false);
  const res = await request(app).get("/hq/broadcasts");
  assert.equal(res.status, 404);
});

test("unauthenticated visitor redirects to /hq/login", async () => {
  const app = makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).get("/hq/broadcasts");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/hq/login");
});

test(
  "HQ broadcast center targeting and visibility",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("hqbc");
    const passwordHash = await bcrypt.hash("testpass123", 12);

    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `hqbc_a_${suffix}`,
      name: `HQ Broadcast Org A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `hqbc_b_${suffix}`,
      name: `HQ Broadcast Org B ${suffix}`,
    });

    const branchA1 = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      name: `Branch A1 ${suffix}`,
    });
    const branchA2 = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "north",
      name: `Branch A2 ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      name: `Branch B ${suffix}`,
    });

    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgA.id,
      full_name: "HQ Admin A",
      email: `hq_a_${suffix}@example.com`,
      phone: "0977555101",
      password_hash: passwordHash,
    });
    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgB.id,
      full_name: "HQ Admin B",
      email: `hq_b_${suffix}@example.com`,
      phone: "0977555102",
      password_hash: passwordHash,
    });

    await membersRepo.createPendingMember(pool, {
      organization_id: orgA.id,
      branch_id: branchA1.id,
      platform_tenant_id: TENANT_ZM,
      email: `member_${suffix}@example.com`,
      phone: "0977555103",
      full_name: "Verified Member",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
      ministry_interest: "choir",
    });
    const memberRow = await membersRepo.findMemberByEmailOrPhoneForBranch(
      pool,
      branchA1.id,
      `member_${suffix}@example.com`
    );
    await membersRepo.updateMemberStatusForBranch(pool, memberRow.id, branchA1.id, "verified");

    const appA = makeApp({
      kind: "branch",
      orgSlug: orgA.slug,
      organization: orgA,
      branch: branchA1,
    });
    const hqAgent = request.agent(appA);
    await hqAgent.post("/hq/login").type("form").send({
      identifier: `hq_a_${suffix}@example.com`,
      password: "testpass123",
    });

    const draftRes = await hqAgent.post("/hq/broadcasts").type("form").send({
      title: `Draft Broadcast ${suffix}`,
      body: "Draft body",
      category: "General",
      audience: "members",
      target_scope: "all_branches",
      _intent: "draft",
    });
    assert.equal(draftRes.status, 303);
    const draftMatch = /\/hq\/broadcasts\/(\d+)/.exec(draftRes.headers.location || "");
    assert.ok(draftMatch);
    const draftId = Number(draftMatch[1]);

    const memberDraftVisible = await hqBroadcastsRepo.listVisibleBroadcastsForBranch(
      pool,
      orgA.id,
      branchA1.id,
      { audiences: MEMBER_HQ_AUDIENCES, limit: 10 }
    );
    assert.equal(memberDraftVisible.length, 0);

    const publishAllRes = await hqAgent.post("/hq/broadcasts").type("form").send({
      title: `All Branches Broadcast ${suffix}`,
      body: "Published to all branches",
      category: "Urgent",
      audience: "all_logged_in",
      target_scope: "all_branches",
      _intent: "publish",
    });
    assert.equal(publishAllRes.status, 303);

    const publishSelectedRes = await hqAgent.post("/hq/broadcasts").type("form").send({
      title: `Selected Branch Broadcast ${suffix}`,
      body: "Only branch A1",
      category: "Leadership",
      audience: "public",
      target_scope: "selected_branches",
      branch_ids: String(branchA1.id),
      _intent: "publish",
    });
    assert.equal(publishSelectedRes.status, 303);

    const publicOnA1 = await hqBroadcastsRepo.listVisibleBroadcastsForBranch(
      pool,
      orgA.id,
      branchA1.id,
      { audiences: PUBLIC_HQ_AUDIENCES, limit: 10 }
    );
    assert.ok(publicOnA1.some((b) => b.title.includes("Selected Branch Broadcast")));

    const publicOnA2 = await hqBroadcastsRepo.listVisibleBroadcastsForBranch(
      pool,
      orgA.id,
      branchA2.id,
      { audiences: PUBLIC_HQ_AUDIENCES, limit: 10 }
    );
    assert.ok(!publicOnA2.some((b) => b.title.includes("Selected Branch Broadcast")));

    const memberVisible = await hqBroadcastsRepo.listVisibleBroadcastsForBranch(
      pool,
      orgA.id,
      branchA1.id,
      { audiences: MEMBER_HQ_AUDIENCES, limit: 10 }
    );
    assert.ok(memberVisible.some((b) => b.title.includes("All Branches Broadcast")));

    const adminVisible = await hqBroadcastsRepo.listVisibleBroadcastsForBranch(
      pool,
      orgA.id,
      branchA1.id,
      { audiences: BRANCH_ADMIN_HQ_AUDIENCES, limit: 10 }
    );
    assert.ok(adminVisible.some((b) => b.title.includes("All Branches Broadcast")));

    const leaderVisible = await hqBroadcastsRepo.listVisibleBroadcastsForBranch(
      pool,
      orgA.id,
      branchA1.id,
      { audiences: LEADER_HQ_AUDIENCES, limit: 10 }
    );
    assert.ok(leaderVisible.some((b) => b.title.includes("All Branches Broadcast")));

    const expired = await hqBroadcastsRepo.createBroadcastForOrganization(pool, orgA.id, {
      title: `Expired Broadcast ${suffix}`,
      body: "Should not show",
      category: "General",
      audience: "public",
      target_scope: "all_branches",
      status: "published",
      publish_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      expires_at: new Date(Date.now() - 60 * 60 * 1000),
      created_by_hq_admin_id: null,
    });
    assert.ok(expired);

    const publicAfterExpiry = await hqBroadcastsRepo.listVisibleBroadcastsForBranch(
      pool,
      orgA.id,
      branchA1.id,
      { audiences: PUBLIC_HQ_AUDIENCES, limit: 20 }
    );
    assert.ok(!publicAfterExpiry.some((b) => b.title.includes("Expired Broadcast")));

    const memberAgent = request.agent(appA);
    await memberAgent.post("/login").type("form").send({
      identifier: `member_${suffix}@example.com`,
      password: "testpass123",
    });
    const memberPage = await memberAgent.get("/member/announcements");
    assert.equal(memberPage.status, 200);
    assert.match(memberPage.text, /All Branches Broadcast/);
    assert.doesNotMatch(memberPage.text, /Draft Broadcast/);
    assert.doesNotMatch(memberPage.text, /Expired Broadcast/);

    const publicHome = await request(appA).get("/");
    assert.equal(publicHome.status, 200);
    assert.match(publicHome.text, /Selected Branch Broadcast/);
    assert.doesNotMatch(publicHome.text, /All Branches Broadcast/);

    const appB = makeApp({
      kind: "branch",
      orgSlug: orgB.slug,
      organization: orgB,
      branch: branchB,
    });
    const hqB = request.agent(appB);
    await hqB.post("/hq/login").type("form").send({
      identifier: `hq_b_${suffix}@example.com`,
      password: "testpass123",
    });
    const crossEdit = await hqB.get(`/hq/broadcasts/${draftId}/edit`);
    assert.equal(crossEdit.status, 404);

    const invalidBranch = await hqAgent.post("/hq/broadcasts").type("form").send({
      title: "Invalid branch target",
      body: "Should fail",
      category: "General",
      audience: "members",
      target_scope: "selected_branches",
      branch_ids: String(branchB.id),
      _intent: "draft",
    });
    assert.equal(invalidBranch.status, 400);

    const listPage = await hqAgent.get("/hq/broadcasts");
    assert.equal(listPage.status, 200);
    assert.match(listPage.text, /Broadcast Center/);

    await cleanup(pool, [orgA.id, orgB.id]);
  }
);
