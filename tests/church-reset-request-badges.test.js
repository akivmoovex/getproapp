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
const { ROLES } = require("../src/auth/roles");
const { db } = require("../src/db");
const adminRoutes = require("../src/routes/admin");
const adminUsersRepo = require("../src/db/pg/adminUsersRepo");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const memberPasswordResetRequestsRepo = require("../src/db/pg/church/memberPasswordResetRequestsRepo");
const branchAdminPasswordResetRequestsRepo = require("../src/db/pg/church/branchAdminPasswordResetRequestsRepo");
const hqAdminPasswordResetRequestsRepo = require("../src/db/pg/church/hqAdminPasswordResetRequestsRepo");
const platformResetRequestsInboxRepo = require("../src/db/pg/church/platformResetRequestsInboxRepo");
const {
  getResetRequestStatusLabel,
  getResetRequestTypeLabel,
  formatResetRequestCounts,
} = require("../src/church/resetRequestFormatting");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createAdminApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "church-reset-badges-test",
      resave: false,
      saveUninitialized: false,
    })
  );
  app.use((req, res, next) => {
    req.tenant = { id: TENANT_ZM, slug: "zm" };
    req.tenantUrlPrefix = "";
    res.locals.asset = (k) => `/${String(k || "").replace(/^\//, "")}`;
    next();
  });
  app.use("/admin", adminRoutes({ db }));
  return app;
}

function makeBranchApp(ctx) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "church-reset-badges-branch-test",
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

async function adminLoginAgent(app, username, password) {
  const agent = request.agent(app);
  await agent.post("/admin/login").type("form").send({ username, password }).expect(302);
  return agent;
}

async function cleanup(pool, orgId, adminUserIds = []) {
  await pool.query(`DELETE FROM public.church_member_password_reset_requests WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branch_admin_password_reset_requests WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_hq_admin_password_reset_requests WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  for (const id of adminUserIds) {
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [id]);
  }
}

test("reset request formatting helpers", () => {
  assert.equal(getResetRequestStatusLabel("submitted"), "Submitted");
  assert.equal(getResetRequestStatusLabel("reset_completed"), "Reset Completed");
  assert.equal(getResetRequestTypeLabel("branch_admin"), "Branch Admin");
  const counts = formatResetRequestCounts({ member: 2, branch_admin: 1, hq_admin: 0 });
  assert.equal(counts.submitted_total, 3);
});

test("tenant manager admin nav does not include reset pending counts", async () => {
  if (!isPgConfigured()) return;
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  const suffix = makeSuffix("badge_mgr");
  const hash = await bcrypt.hash("pw12345678", 12);
  const username = `badge_mgr_${suffix}`;
  const userId = await adminUsersRepo.insertUser(pool, {
    username,
    passwordHash: hash,
    role: ROLES.TENANT_MANAGER,
    tenantId: TENANT_ZM,
    displayName: "",
  });
  const app = createAdminApp();
  const agent = await adminLoginAgent(app, username, "pw12345678");
  const res = await agent.get("/admin/dashboard");
  assert.equal(res.status, 200);
  assert.doesNotMatch(res.text, /Reset Requests\s*\(\d+\)/);
  await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [userId]);
});

test(
  "reset request badges and pending counts",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("resetbadges");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `badges_${suffix}`,
      name: `Badge Org ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Badge Branch ${suffix}`,
    });
    const passwordHash = await bcrypt.hash("pw12345678", 12);

    const memberReq = await memberPasswordResetRequestsRepo.createPasswordResetRequest(pool, {
      organizationId: org.id,
      branchId: branch.id,
      memberId: null,
      identifierSubmitted: `pending_${suffix}@example.com`,
    });
    await pool.query(
      `UPDATE public.church_member_password_reset_requests SET status = 'reset_completed', resolved_at = now() WHERE id = $1`,
      [memberReq.id]
    );

    const submittedMemberReq = await memberPasswordResetRequestsRepo.createPasswordResetRequest(pool, {
      organizationId: org.id,
      branchId: branch.id,
      memberId: null,
      identifierSubmitted: `submitted_${suffix}@example.com`,
    });

    await branchAdminPasswordResetRequestsRepo.createBranchAdminPasswordResetRequest(pool, {
      organizationId: org.id,
      branchId: branch.id,
      identifierSubmitted: `ba_${suffix}@example.com`,
    });

    await hqAdminPasswordResetRequestsRepo.createHqAdminPasswordResetRequest(pool, {
      organizationId: org.id,
      branchId: branch.id,
      identifierSubmitted: `hq_${suffix}@example.com`,
    });

    const pending = await platformResetRequestsInboxRepo.getPendingResetRequestCounts(pool);
    assert.ok(pending.submitted_total >= 3);
    assert.ok(pending.member >= 1);
    assert.ok(pending.branch_admin >= 1);
    assert.ok(pending.hq_admin >= 1);

    const branchCounts = await memberPasswordResetRequestsRepo.countPasswordResetRequestsByStatusForBranch(
      pool,
      branch.id
    );
    assert.equal(branchCounts.submitted, 1);
    assert.equal(branchCounts.reset_completed, 1);

    const superHash = await bcrypt.hash("superpw123456", 12);
    const superName = `badge_super_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: superHash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const app = createAdminApp();
    const agent = await adminLoginAgent(app, superName, "superpw123456");

    const dashboard = await agent.get("/admin/church");
    assert.equal(dashboard.status, 200);
    assert.match(dashboard.text, /Total pending/i);
    assert.match(dashboard.text, /Member pending/i);
    assert.match(dashboard.text, /Reset Requests\s*\(\d+\)/);

    const inbox = await agent.get("/admin/church/reset-requests");
    assert.equal(inbox.status, 200);
    assert.match(inbox.text, /church-type-badge/);
    assert.match(inbox.text, /church-status-badge/);
    assert.match(inbox.text, /Reset Completed/);
    assert.match(inbox.text, /Branch Admin/);
    assert.doesNotMatch(inbox.text, /password_hash/i);
    assert.doesNotMatch(inbox.text, /pw12345678/);

    const branchAdmin = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      full_name: "Branch Admin",
      email: `admin_${suffix}@example.com`,
      phone: "0977111222",
      password_hash: passwordHash,
      role: "branch_admin",
    });

    const branchApp = makeBranchApp({
      kind: "branch",
      orgSlug: org.slug,
      organization: org,
      branch,
    });
    const branchAgent = request.agent(branchApp);
    await branchAgent.post("/branch/login").type("form").send({
      identifier: `admin_${suffix}@example.com`,
      password: "pw12345678",
    });

    const branchDash = await branchAgent.get("/branch/dashboard");
    assert.equal(branchDash.status, 200);
    assert.match(branchDash.text, /reset-requests\?status=submitted/);
    assert.match(branchDash.text, /Reset Inbox\s*\(1\)/);
    assert.doesNotMatch(branchDash.text, /Password Resets\s*\(/);

    const branchQueue = await branchAgent.get("/branch/password-reset-requests");
    assert.equal(branchQueue.status, 200);
    assert.match(branchQueue.text, /church-status-badge/);
    assert.match(branchQueue.text, /Submitted/);

    await pool.query(`DELETE FROM public.church_branch_admins WHERE id = $1`, [branchAdmin.id]);
    await cleanup(pool, org.id, [superId]);
  }
);
