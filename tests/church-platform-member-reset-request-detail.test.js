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
const platformResetRequestsInboxRepo = require("../src/db/pg/church/platformResetRequestsInboxRepo");
const {
  parseRequestId,
  parseMemberResetRequestParams,
} = require("../src/church/platformMemberResetRequestValidation");
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
      secret: "church-platform-member-reset-detail-test",
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

async function cleanup(pool, orgId, adminUserIds = []) {
  await pool.query(`DELETE FROM public.church_member_password_reset_requests WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  for (const id of adminUserIds) {
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [id]);
  }
}

test("parseMemberResetRequestParams validates request id and return_to", () => {
  assert.equal(parseRequestId("0").ok, false);
  assert.equal(parseRequestId("12").ok, true);
  const ok = parseMemberResetRequestParams({ requestId: "5" }, { return_to: "/admin/church/reset-requests" });
  assert.equal(ok.ok, true);
  assert.equal(ok.data.requestId, 5);
  assert.equal(ok.data.returnTo, "/admin/church/reset-requests");
  const badReturn = parseMemberResetRequestParams({ requestId: "5" }, { return_to: "https://evil.test" });
  assert.equal(badReturn.data.returnTo, null);
});

test("tenant manager cannot open member reset request detail", async () => {
  if (!isPgConfigured()) return;
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  const suffix = makeSuffix("memresetmgr");
  const hash = await bcrypt.hash("pw12345678", 12);
  const username = `memreset_mgr_${suffix}`;
  const userId = await adminUsersRepo.insertUser(pool, {
    username,
    passwordHash: hash,
    role: ROLES.TENANT_MANAGER,
    tenantId: TENANT_ZM,
    displayName: "",
  });
  const app = createAdminApp();
  const agent = await adminLoginAgent(app, username, "pw12345678");
  const res = await agent.get("/admin/church/member-password-reset-requests/1");
  assert.equal(res.status, 403);
  await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [userId]);
});

test(
  "platform read-only member reset request detail",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("memresetdetail");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `memreset_${suffix}`,
      name: `Member Reset Detail Org ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Member Reset Branch ${suffix}`,
    });
    const passwordHash = await bcrypt.hash("pw12345678", 12);

    const member = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email: `member_${suffix}@example.com`,
      phone: "0977111999",
      full_name: `Member ${suffix}`,
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Lusaka",
      attendance_duration: "Less than 6 months",
    });
    await membersRepo.updateMemberStatusForBranch(pool, member.id, branch.id, "verified");

    const matchedReq = await memberPasswordResetRequestsRepo.createPasswordResetRequest(pool, {
      organizationId: org.id,
      branchId: branch.id,
      memberId: member.id,
      identifierSubmitted: `member_${suffix}@example.com`,
      fullNameSubmitted: `Member ${suffix}`,
      emailSubmitted: `member_${suffix}@example.com`,
      phoneSubmitted: "0977111999",
    });

    const unmatchedReq = await memberPasswordResetRequestsRepo.createPasswordResetRequest(pool, {
      organizationId: org.id,
      branchId: branch.id,
      memberId: null,
      identifierSubmitted: `unknown_${suffix}@example.com`,
      fullNameSubmitted: "Unknown Person",
    });

    const superHash = await bcrypt.hash("superpw123456", 12);
    const superName = `memreset_super_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: superHash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const app = createAdminApp();
    const agent = await adminLoginAgent(app, superName, "superpw123456");

    const notFound = await agent.get("/admin/church/member-password-reset-requests/999999999");
    assert.equal(notFound.status, 404);

    const invalid = await agent.get("/admin/church/member-password-reset-requests/abc");
    assert.equal(invalid.status, 404);

    const matchedRes = await agent.get(`/admin/church/member-password-reset-requests/${matchedReq.id}`);
    assert.equal(matchedRes.status, 200);
    assert.match(matchedRes.text, /Member Password Reset Request/i);
    assert.match(matchedRes.text, /read-only/i);
    assert.match(matchedRes.text, /Handled by branch admins/i);
    assert.match(matchedRes.text, org.name);
    assert.match(matchedRes.text, branch.name);
    assert.match(matchedRes.text, `/admin/church/members/${member.id}`);
    assert.match(matchedRes.text, `/admin/church/branches/${branch.id}`);
    assert.match(matchedRes.text, `/branch/password-reset-requests/${matchedReq.id}`);
    assert.doesNotMatch(matchedRes.text, /reset-password/i);
    assert.doesNotMatch(matchedRes.text, /password_hash/i);
    assert.doesNotMatch(matchedRes.text, /pw12345678/);
    assert.doesNotMatch(matchedRes.text, new RegExp(`member_${suffix}@example.com`, "i"));

    const unmatchedRes = await agent.get(`/admin/church/member-password-reset-requests/${unmatchedReq.id}`);
    assert.equal(unmatchedRes.status, 200);
    assert.match(unmatchedRes.text, /No matching member account was found/i);
    assert.doesNotMatch(unmatchedRes.text, /View member support detail/i);

    const inbox = await platformResetRequestsInboxRepo.listUnifiedResetRequests(pool, {
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
    const matchedRow = inbox.items.find((r) => r.request_id === matchedReq.id);
    assert.equal(matchedRow.detail_url, `/admin/church/member-password-reset-requests/${matchedReq.id}`);
    assert.equal(matchedRow.action_label, "View request");

    const inboxPage = await agent.get("/admin/church/reset-requests?request_type=member");
    assert.equal(inboxPage.status, 200);
    assert.match(
      inboxPage.text,
      `/admin/church/member-password-reset-requests/${matchedReq.id}`
    );

    await cleanup(pool, org.id, [superId]);
  }
);
