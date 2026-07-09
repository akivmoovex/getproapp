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
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const platformSupportSearchRepo = require("../src/db/pg/church/platformSupportSearchRepo");
const { parseSupportSearchQuery, shouldRunSearch } = require("../src/church/platformSupportSearchValidation");
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
      secret: "church-support-search-test",
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
  await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

test("shouldRunSearch requires 2 characters", () => {
  assert.equal(shouldRunSearch(""), false);
  assert.equal(shouldRunSearch("a"), false);
  assert.equal(shouldRunSearch("ab"), true);
});

test("parseSupportSearchQuery rejects invalid type", () => {
  const result = parseSupportSearchQuery({ q: "test", type: "invalid" });
  assert.equal(result.ok, false);
});

test("tenant manager cannot open church search", async () => {
  if (!isPgConfigured()) return;
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  const suffix = makeSuffix("ssmgr");
  const hash = await bcrypt.hash("pw12345678", 12);
  const username = `ss_mgr_${suffix}`;
  const userId = await adminUsersRepo.insertUser(pool, {
    username,
    passwordHash: hash,
    role: ROLES.TENANT_MANAGER,
    tenantId: TENANT_ZM,
    displayName: "",
  });
  const app = createAdminApp();
  const agent = await adminLoginAgent(app, username, "pw12345678");
  const res = await agent.get("/admin/church/search");
  assert.equal(res.status, 403);
  await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [userId]);
});

test(
  "platform support search integration",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("pss");
    const hash = await bcrypt.hash("superpw123456", 12);
    const superName = `pss_sup_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const orgSlug = `searchorg${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28);
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: orgSlug,
      name: `Search Test Org ${suffix}`,
    });
    await pool.query(
      `UPDATE public.church_organizations SET country = 'Zambia', city = 'Lusaka',
       primary_contact_name = 'Contact Person', primary_contact_email = 'contact_${suffix}@example.com'
       WHERE id = $1`,
      [org.id]
    );

    const hostSlug = `searchhost${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28);
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: hostSlug,
      host_slug: hostSlug,
      name: `Search Branch ${suffix}`,
      pastor_name: "Rev Search",
    });

    const hqEmail = `hq_search_${suffix}@example.com`;
    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: org.id,
      full_name: "HQ Search Admin",
      email: hqEmail,
      phone: "0977111222",
      password_hash: await bcrypt.hash("hqpass123456", 12),
    });

    const baEmail = `ba_search_${suffix}@example.com`;
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      full_name: "Branch Search Admin",
      email: baEmail,
      phone: "0977333444",
      password_hash: await bcrypt.hash("bapass123456", 12),
    });

    await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      full_name: `Member Search ${suffix}`,
      email: `member_search_${suffix}@example.com`,
      phone: "0977555666",
      password_hash: await bcrypt.hash("memberpass123456", 12),
    });
    await pool.query(
      `UPDATE public.church_members SET status = 'verified' WHERE branch_id = $1 AND email = $2`,
      [branch.id, `member_search_${suffix}@example.com`]
    );

    const app = createAdminApp();
    const superAgent = await adminLoginAgent(app, superName, "superpw123456");

    const emptyPage = await superAgent.get("/admin/church/search");
    assert.equal(emptyPage.status, 200);
    assert.match(emptyPage.text, /Church Support Search/);

    const shortQuery = await superAgent.get("/admin/church/search?q=a");
    assert.equal(shortQuery.status, 200);
    assert.match(shortQuery.text, /at least 2 characters/i);

    const orgSearch = await platformSupportSearchRepo.searchChurchPlatformSupport(pool, {
      q: orgSlug,
      type: "all",
    });
    assert.ok(orgSearch.results.organizations.total >= 1);
    assert.ok(orgSearch.results.organizations.items.some((o) => o.slug === orgSlug));

    const branchSearch = await platformSupportSearchRepo.searchChurchPlatformSupport(pool, {
      q: hostSlug,
      type: "branches",
    });
    assert.ok(branchSearch.results.branches.total >= 1);

    const hqSearch = await platformSupportSearchRepo.searchChurchPlatformSupport(pool, {
      q: hqEmail,
      type: "hq_admins",
    });
    assert.ok(hqSearch.results.hq_admins.total >= 1);

    const baSearch = await platformSupportSearchRepo.searchChurchPlatformSupport(pool, {
      q: "0977333444",
      type: "branch_admins",
    });
    assert.ok(baSearch.results.branch_admins.total >= 1);

    const memberSearch = await platformSupportSearchRepo.searchChurchPlatformSupport(pool, {
      q: `Member Search ${suffix}`,
      type: "members",
    });
    assert.ok(memberSearch.results.members.total >= 1);
    assert.ok(memberSearch.results.members.items[0].link.includes(`/admin/church/members/`));

    const serialized = JSON.stringify(memberSearch);
    assert.equal(serialized.includes("password_hash"), false);

    const typeOnly = await platformSupportSearchRepo.searchChurchPlatformSupport(pool, {
      q: suffix,
      type: "organizations",
    });
    assert.equal(typeOnly.results.branches.total, 0);
    assert.ok(typeOnly.results.organizations.total >= 1);

    const statusFilter = await platformSupportSearchRepo.searchChurchPlatformSupport(pool, {
      q: suffix,
      type: "members",
      status: "verified",
    });
    assert.ok(statusFilter.results.members.total >= 1);

    const uiSearch = await superAgent.get(`/admin/church/search?q=${encodeURIComponent(orgSlug)}`);
    assert.equal(uiSearch.status, 200);
    assert.match(uiSearch.text, orgSlug);

    await cleanupOrg(pool, org.id);
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
  }
);
