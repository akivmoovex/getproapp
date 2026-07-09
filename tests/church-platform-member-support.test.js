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
const memberRequestsRepo = require("../src/db/pg/church/memberRequestsRepo");
const platformMemberSupportRepo = require("../src/db/pg/church/platformMemberSupportRepo");
const platformSupportSearchRepo = require("../src/db/pg/church/platformSupportSearchRepo");
const { parseMemberId } = require("../src/church/platformMemberSupportValidation");
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
      secret: "church-member-support-test",
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

async function cleanupOrg(pool, orgId) {
  await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_member_requests WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_prayer_requests WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

test("parseMemberId rejects invalid values", () => {
  assert.equal(parseMemberId("abc").ok, false);
  assert.equal(parseMemberId("0").ok, false);
  assert.equal(parseMemberId("12").ok, true);
});

test("tenant manager cannot open member support detail", async () => {
  if (!isPgConfigured()) return;
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  const suffix = makeSuffix("msmgr");
  const hash = await bcrypt.hash("pw12345678", 12);
  const username = `ms_mgr_${suffix}`;
  const userId = await adminUsersRepo.insertUser(pool, {
    username,
    passwordHash: hash,
    role: ROLES.TENANT_MANAGER,
    tenantId: TENANT_ZM,
    displayName: "",
  });
  const app = createAdminApp();
  const agent = await adminLoginAgent(app, username, "pw12345678");
  const res = await agent.get("/admin/church/members/1");
  assert.equal(res.status, 403);
  await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [userId]);
});

test(
  "platform member support detail integration",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("pms");
    const hash = await bcrypt.hash("superpw123456", 12);
    const superName = `pms_sup_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const orgSlug = `msorg${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28);
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: orgSlug,
      name: `Member Support Org ${suffix}`,
    });

    const hostSlug = `mshost${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28);
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: hostSlug,
      host_slug: hostSlug,
      name: `Member Support Branch ${suffix}`,
    });

    const memberEmail = `member_support_${suffix}@example.com`;
    const member = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      full_name: `Support Member ${suffix}`,
      email: memberEmail,
      phone: "0977888999",
      password_hash: await bcrypt.hash("memberpass123456", 12),
    });
    await pool.query(`UPDATE public.church_members SET status = 'verified' WHERE id = $1`, [member.id]);

    await memberRequestsRepo.createMemberRequest(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      member_id: member.id,
      request_type: "general",
      subject: "Safe request subject",
      description: "Sensitive request body should not appear on platform support detail",
    });

    await pool.query(
      `INSERT INTO public.church_prayer_requests (
         organization_id, branch_id, member_id, prayer_topic, details, urgency, privacy_level, status
       ) VALUES ($1, $2, $3, 'Secret topic', 'Secret prayer body content', 'normal', 'private_to_pastor', 'submitted')`,
      [org.id, branch.id, member.id]
    );

    const detail = await platformMemberSupportRepo.findMemberSupportDetailById(pool, member.id);
    assert.ok(detail);
    assert.equal(detail.organization.name, org.name);
    assert.equal(detail.branch.name, branch.name);
    assert.equal(detail.loginContext.can_access_member_portal, true);
    assert.equal(detail.summary.prayer_summary.submitted, 1);
    assert.equal(detail.summary.member_requests.length, 1);
    assert.equal(detail.summary.member_requests[0].subject, "Safe request subject");
    assert.equal("description" in detail.summary.member_requests[0], false);

    const search = await platformSupportSearchRepo.searchChurchPlatformSupport(pool, {
      q: memberEmail,
      type: "members",
    });
    assert.ok(search.results.members.items[0].link.includes(`/admin/church/members/${member.id}`));

    const app = createAdminApp();
    const superAgent = await adminLoginAgent(app, superName, "superpw123456");

    const page = await superAgent.get(`/admin/church/members/${member.id}`);
    assert.equal(page.status, 200);
    assert.match(page.text, /Can access member portal/);
    assert.match(page.text, org.name);
    assert.match(page.text, branch.name);
    assert.match(page.text, hostSlug);
    assert.match(page.text, /Safe request subject/);
    assert.match(page.text, /Counts only/);
    assert.equal(page.text.includes("password_hash"), false);
    assert.equal(page.text.includes("Secret prayer body content"), false);
    assert.equal(page.text.includes("Secret topic"), false);
    assert.equal(page.text.includes("Sensitive request body"), false);

    const notFound = await superAgent.get("/admin/church/members/999999999");
    assert.equal(notFound.status, 404);

    await pool.query(`UPDATE public.church_members SET status = 'pending' WHERE id = $1`, [member.id]);
    const pendingDetail = await platformMemberSupportRepo.findMemberSupportDetailById(pool, member.id);
    assert.equal(pendingDetail.loginContext.can_access_member_portal, false);
    assert.match(pendingDetail.loginContext.access_summary, /pending/i);

    await pool.query(`UPDATE public.church_members SET status = 'verified' WHERE id = $1`, [member.id]);
    await pool.query(`UPDATE public.church_branches SET status = 'suspended' WHERE id = $1`, [branch.id]);
    const suspendedBranchDetail = await platformMemberSupportRepo.findMemberSupportDetailById(pool, member.id);
    assert.equal(suspendedBranchDetail.loginContext.can_access_member_portal, false);
    assert.match(suspendedBranchDetail.loginContext.access_summary, /branch is suspended/i);

    await cleanupOrg(pool, org.id);
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
  }
);
