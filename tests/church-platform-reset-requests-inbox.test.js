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
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const memberPasswordResetRequestsRepo = require("../src/db/pg/church/memberPasswordResetRequestsRepo");
const branchAdminPasswordResetRequestsRepo = require("../src/db/pg/church/branchAdminPasswordResetRequestsRepo");
const hqAdminPasswordResetRequestsRepo = require("../src/db/pg/church/hqAdminPasswordResetRequestsRepo");
const platformResetRequestsInboxRepo = require("../src/db/pg/church/platformResetRequestsInboxRepo");
const { parseResetInboxFilters } = require("../src/church/platformResetRequestsInboxValidation");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");

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
      secret: "church-platform-reset-inbox-test",
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

async function adminLoginAgent(app, username, password) {
  const agent = request.agent(app);
  await agent.post("/admin/login").type("form").send({ username, password }).expect(302);
  return agent;
}

async function cleanup(pool, orgId, branchId, adminUserIds = []) {
  await pool.query(`DELETE FROM public.church_member_password_reset_requests WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branch_admin_password_reset_requests WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_hq_admin_password_reset_requests WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  for (const id of adminUserIds) {
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [id]);
  }
}

test("parseResetInboxFilters validates enums and pagination", () => {
  assert.equal(parseResetInboxFilters({ request_type: "bad" }).ok, false);
  assert.equal(parseResetInboxFilters({ status: "bad" }).ok, false);
  assert.equal(parseResetInboxFilters({ date_from: "2026-13-01" }).ok, false);
  assert.equal(parseResetInboxFilters({ q: "x".repeat(101) }).ok, true);
  assert.equal(parseResetInboxFilters({ q: "x".repeat(101) }).data.q.length, 100);
  const ok = parseResetInboxFilters({
    request_type: "member",
    status: "submitted",
    organization_id: "12",
    branch_id: "3",
    page: "2",
    limit: "25",
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.data.request_type, "member");
  assert.equal(ok.data.organization_id, 12);
  assert.equal(ok.data.limit, 25);
});

test("tenant manager cannot open unified reset inbox", async () => {
  if (!isPgConfigured()) return;
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  const suffix = makeSuffix("inboxmgr");
  const hash = await bcrypt.hash("pw12345678", 12);
  const username = `inbox_mgr_${suffix}`;
  const userId = await adminUsersRepo.insertUser(pool, {
    username,
    passwordHash: hash,
    role: ROLES.TENANT_MANAGER,
    tenantId: TENANT_ZM,
    displayName: "",
  });
  const app = createAdminApp();
  const agent = await adminLoginAgent(app, username, "pw12345678");
  const res = await agent.get("/admin/church/reset-requests");
  assert.equal(res.status, 403);
  await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [userId]);
});

test(
  "unified platform reset request inbox",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("unifiedinbox");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `unified_inbox_${suffix}`,
      name: `Unified Inbox Org ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Unified Branch ${suffix}`,
    });
    const passwordHash = await bcrypt.hash("pw12345678", 12);

    const member = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email: `member_${suffix}@example.com`,
      phone: "0977111888",
      full_name: `Member ${suffix}`,
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Lusaka",
      attendance_duration: "Less than 6 months",
    });
    await membersRepo.updateMemberStatusForBranch(pool, member.id, branch.id, "verified");

    const branchAdmin = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      full_name: `Branch Admin ${suffix}`,
      email: `ba_${suffix}@example.com`,
      phone: "0977111889",
      password_hash: passwordHash,
      role: "branch_admin",
    });

    const hqAdmin = await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: org.id,
      full_name: `HQ Admin ${suffix}`,
      email: `hq_${suffix}@example.com`,
      phone: "0977111890",
      password_hash: passwordHash,
      role: "hq_admin",
    });

    const memberReq = await memberPasswordResetRequestsRepo.createPasswordResetRequest(pool, {
      organizationId: org.id,
      branchId: branch.id,
      memberId: member.id,
      identifierSubmitted: `member_${suffix}@example.com`,
      fullNameSubmitted: `Member ${suffix}`,
      emailSubmitted: `member_${suffix}@example.com`,
    });

    const branchReq = await branchAdminPasswordResetRequestsRepo.createBranchAdminPasswordResetRequest(pool, {
      organizationId: org.id,
      branchId: branch.id,
      branchAdminId: branchAdmin.id,
      identifierSubmitted: `ba_${suffix}@example.com`,
      fullNameSubmitted: `Branch Admin ${suffix}`,
      emailSubmitted: `ba_${suffix}@example.com`,
    });

    const hqReq = await hqAdminPasswordResetRequestsRepo.createHqAdminPasswordResetRequest(pool, {
      organizationId: org.id,
      branchId: branch.id,
      hqAdminId: hqAdmin.id,
      identifierSubmitted: `hq_${suffix}@example.com`,
      fullNameSubmitted: `HQ Admin ${suffix}`,
      emailSubmitted: `hq_${suffix}@example.com`,
    });

    const superHash = await bcrypt.hash("superpw123456", 12);
    const superName = `inbox_super_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: superHash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const app = createAdminApp();
    const agent = await adminLoginAgent(app, superName, "superpw123456");

    const inboxRes = await agent.get("/admin/church/reset-requests");
    assert.equal(inboxRes.status, 200);
    assert.match(inboxRes.text, /Password Reset Requests/i);
    assert.match(inboxRes.text, /Handled by branch admin/i);
    assert.match(inboxRes.text, `/admin/church/branch-admin-password-reset-requests/${branchReq.id}`);
    assert.match(inboxRes.text, `/admin/church/hq-admin-password-reset-requests/${hqReq.id}`);
    assert.match(inboxRes.text, `/admin/church/member-password-reset-requests/${memberReq.id}`);
    assert.doesNotMatch(inboxRes.text, /password_hash/i);
    assert.doesNotMatch(inboxRes.text, /pw12345678/);
    assert.doesNotMatch(inboxRes.text, /superpw123456/);

    const memberOnly = await platformResetRequestsInboxRepo.listUnifiedResetRequests(pool, {
      request_type: "member",
      status: "all",
      organization_id: org.id,
      branch_id: null,
      date_from: null,
      date_to: null,
      q: "",
      page: 1,
      limit: 50,
    });
    assert.ok(memberOnly.items.some((r) => r.request_type === "member" && r.request_id === memberReq.id));
    assert.ok(!memberOnly.items.some((r) => r.request_type === "branch_admin"));

    const branchFilter = await platformResetRequestsInboxRepo.listUnifiedResetRequests(pool, {
      request_type: "branch_admin",
      status: "submitted",
      organization_id: org.id,
      branch_id: branch.id,
      date_from: null,
      date_to: null,
      q: "",
      page: 1,
      limit: 50,
    });
    assert.ok(branchFilter.items.some((r) => r.request_id === branchReq.id));

    const searchQ = await platformResetRequestsInboxRepo.listUnifiedResetRequests(pool, {
      request_type: "all",
      status: "all",
      organization_id: null,
      branch_id: null,
      date_from: null,
      date_to: null,
      q: `HQ Admin ${suffix}`,
      page: 1,
      limit: 50,
    });
    assert.ok(searchQ.items.some((r) => r.request_type === "hq_admin" && r.request_id === hqReq.id));

    const memberRow = memberOnly.items.find((r) => r.request_id === memberReq.id);
    assert.equal(memberRow.platform_reset, false);
    assert.equal(memberRow.detail_url, `/admin/church/member-password-reset-requests/${memberReq.id}`);
    assert.equal(memberRow.action_label, "View request");

    const branchRow = branchFilter.items.find((r) => r.request_id === branchReq.id);
    assert.equal(branchRow.platform_reset, true);
    assert.equal(branchRow.detail_url, `/admin/church/branch-admin-password-reset-requests/${branchReq.id}`);

    const summary = await platformResetRequestsInboxRepo.getUnifiedResetRequestSummary(pool);
    assert.ok(summary.submitted >= 3);
    assert.ok(summary.member >= 1);
    assert.ok(summary.branch_admin >= 1);
    assert.ok(summary.hq_admin >= 1);

    const filteredPage = await agent.get(
      `/admin/church/reset-requests?request_type=hq_admin&organization_id=${org.id}&q=hq_${suffix}`
    );
    assert.equal(filteredPage.status, 200);
    assert.match(filteredPage.text, `/admin/church/hq-admin-password-reset-requests/${hqReq.id}`);
    assert.doesNotMatch(filteredPage.text, /reset-password/i);

    await cleanup(pool, org.id, branch.id, [superId]);
  }
);
