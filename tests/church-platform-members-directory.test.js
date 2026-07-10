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
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const { ROLES } = require("../src/auth/roles");
const { db } = require("../src/db");
const adminRoutes = require("../src/routes/admin");
const blessboardAdminRoutes = require("../src/routes/blessboardAdmin");
const adminUsersRepo = require("../src/db/pg/adminUsersRepo");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const platformMembersRepo = require("../src/db/pg/church/platformMembersRepo");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeBlessBoardApp(role) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "church-platform-members-test",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isBlessBoardApexHost = true;
    if (role) {
      req.session.adminUser = {
        id: 9001,
        username: "super",
        display_name: "Super",
        role,
      };
    }
    next();
  });
  app.use("/admin", blessboardAdminRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

function makeAdminApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "church-platform-members-admin-test",
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
  await pool.query(`DELETE FROM public.church_member_password_reset_requests WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_member_requests WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_prayer_requests WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

test("platform members normalizeListOpts clamps page and maps inactive to suspended", () => {
  const opts = platformMembersRepo.normalizeListOpts({
    page: 0,
    limit: 999,
    status: "inactive",
    q: "  jane  ",
    organization_id: "12",
  });
  assert.equal(opts.page, 1);
  assert.equal(opts.limit, 50);
  assert.equal(opts.status, "suspended");
  assert.equal(opts.q, "jane");
  assert.equal(opts.organization_id, 12);
});

test("deriveMemberStatusLabels maps single status field", () => {
  assert.deepEqual(platformMembersRepo.deriveMemberStatusLabels("verified"), {
    membership_status: "verified",
    verification_status: "verified",
    account_status: "active",
  });
  assert.equal(platformMembersRepo.deriveMemberStatusLabels("suspended").account_status, "suspended");
  assert.equal(platformMembersRepo.deriveMemberStatusLabels("pending").verification_status, "unverified");
});

test("anonymous cannot access member directory or detail", async () => {
  const app = makeBlessBoardApp(null);
  for (const p of ["/admin/church/members", "/admin/church/members/1"]) {
    const res = await request(app).get(p).set("Host", "blessboard.com");
    assert.ok([302, 303].includes(res.status), `${p} should redirect`);
    assert.match(String(res.headers.location || ""), /login/i);
  }
});

test("non-super-admin cannot access member directory", async () => {
  const app = makeBlessBoardApp(ROLES.TENANT_MANAGER);
  const res = await request(app).get("/admin/church/members").set("Host", "blessboard.com");
  assert.equal(res.status, 403);
});

test("hq admin, branch admin, and member sessions cannot access platform member directory", async () => {
  function makeAppWithChurchSession(sessionPatch) {
    const app = express();
    app.set("view engine", "ejs");
    app.set("views", path.join(__dirname, "../views"));
    app.use(express.urlencoded({ extended: true }));
    app.use(
      session({
        secret: "church-platform-members-role-block",
        resave: false,
        saveUninitialized: true,
      })
    );
    app.use((req, res, next) => {
      req.isBlessBoardApexHost = true;
      Object.assign(req.session, sessionPatch);
      next();
    });
    app.use("/admin", blessboardAdminRoutes());
    app.use((req, res) => res.status(404).type("text").send("not found"));
    return app;
  }

  const cases = [
    { churchHqAdmin: { id: 1, organization_id: 1, role: "hq_admin" } },
    { churchBranchAdmin: { id: 1, branch_id: 1, role: "branch_admin" } },
    { churchMember: { id: 1, branch_id: 1, status: "verified" } },
  ];
  for (const patch of cases) {
    const res = await request(makeAppWithChurchSession(patch))
      .get("/admin/church/members")
      .set("Host", "blessboard.com");
    assert.ok([302, 303, 403].includes(res.status), `expected block for ${Object.keys(patch)[0]}`);
    assert.notEqual(res.status, 200);
  }
});

test(
  "super-admin member directory search filters pagination detail and empty state",
  { skip: !isPgConfigured() },
  async (t) => {
    const pool = getPgPool();
    try {
      await pool.query("SELECT 1");
    } catch (e) {
      t.skip(`PostgreSQL unreachable (${e.code || e.message})`);
      return;
    }
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("pmdir");
    const hash = await bcrypt.hash("superpw123456", 12);
    const superName = `pmd_sup_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const orgSlug = `pmdir${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28);
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: orgSlug,
      name: `Member Dir Org ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      platform_tenant_id: TENANT_ZM,
      slug: `mdb${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 20),
      host_slug: `mdh${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 20),
      name: `Member Dir Branch ${suffix}`,
    });
    const otherOrg = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `other${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28),
      name: `Other Org ${suffix}`,
    });
    const otherBranch = await branchesRepo.createBranch(pool, {
      organization_id: otherOrg.id,
      platform_tenant_id: TENANT_ZM,
      slug: `otb${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 20),
      host_slug: `oth${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 20),
      name: `Other Branch ${suffix}`,
    });

    const memberHash = await bcrypt.hash("MemberPass123!", 12);
    const uniqueName = `UniqueDirMember_${suffix}`;
    const member = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      full_name: uniqueName,
      email: `dir_${suffix}@example.com`,
      phone: "0971111111",
      password_hash: memberHash,
    });
    await pool.query(`UPDATE public.church_members SET status = 'verified' WHERE id = $1`, [member.id]);
    await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      full_name: `Pending_${suffix}`,
      email: `pend_${suffix}@example.com`,
      phone: "0971111112",
      password_hash: memberHash,
    });
    await membersRepo.createPendingMember(pool, {
      organization_id: otherOrg.id,
      branch_id: otherBranch.id,
      platform_tenant_id: TENANT_ZM,
      full_name: `Other_${suffix}`,
      email: `other_${suffix}@example.com`,
      phone: "0971111113",
      password_hash: memberHash,
    });
    await pool.query(
      `UPDATE public.church_members SET status = 'verified' WHERE email = $1`,
      [`other_${suffix}@example.com`]
    );

    const app = makeAdminApp();
    const agent = await adminLoginAgent(app, superName, "superpw123456");

    const listRes = await agent.get("/admin/church/members");
    assert.equal(listRes.status, 200);
    assert.match(listRes.text, /Church members/);
    assert.match(listRes.text, /No members match these filters|member\(s\)/);
    assert.doesNotMatch(listRes.text, /password_hash/i);
    assert.doesNotMatch(listRes.text, /reset_token/i);
    assert.match(listRes.text, /church-show-mobile-only|church-show-desktop-only/);

    const searchRes = await agent.get(`/admin/church/members?q=${encodeURIComponent(uniqueName)}`);
    assert.equal(searchRes.status, 200);
    assert.match(searchRes.text, new RegExp(uniqueName));

    const orgFilter = await agent.get(`/admin/church/members?organization_id=${org.id}`);
    assert.equal(orgFilter.status, 200);
    assert.match(orgFilter.text, new RegExp(uniqueName));
    assert.doesNotMatch(orgFilter.text, new RegExp(`Other_${suffix}`));

    const branchFilter = await agent.get(`/admin/church/members?branch_id=${branch.id}`);
    assert.equal(branchFilter.status, 200);
    assert.match(branchFilter.text, new RegExp(uniqueName));

    const statusFilter = await agent.get(`/admin/church/members?status=pending&organization_id=${org.id}`);
    assert.equal(statusFilter.status, 200);
    assert.match(statusFilter.text, new RegExp(`Pending_${suffix}`));
    assert.doesNotMatch(statusFilter.text, new RegExp(uniqueName));

    const pageClamp = await agent.get("/admin/church/members?page=999999");
    assert.equal(pageClamp.status, 200);
    assert.match(pageClamp.text, /page \d+ of \d+/);

    const emptyRes = await agent.get("/admin/church/members?q=zzz_no_such_member_xyz_999");
    assert.equal(emptyRes.status, 200);
    assert.match(emptyRes.text, /No members match these filters/);

    const badOrg = await agent.get("/admin/church/members?organization_id=999999999");
    assert.equal(badOrg.status, 400);

    const badBranchPair = await agent.get(
      `/admin/church/members?organization_id=${org.id}&branch_id=${otherBranch.id}`
    );
    assert.equal(badBranchPair.status, 400);

    const detail = await agent.get(`/admin/church/members/${member.id}`);
    assert.equal(detail.status, 200);
    assert.match(detail.text, new RegExp(uniqueName));
    assert.match(detail.text, /Password reset requests/i);
    assert.doesNotMatch(detail.text, /password_hash/i);
    assert.doesNotMatch(detail.text, /reset_token/i);
    assert.doesNotMatch(detail.text, /"password"/i);

    const missing = await agent.get("/admin/church/members/999999999");
    assert.equal(missing.status, 404);

    const invalidId = await agent.get("/admin/church/members/not-a-number");
    assert.equal(invalidId.status, 404);

    const listed = await platformMembersRepo.listPlatformMembers(pool, {
      organization_id: org.id,
      page: 1,
      limit: 1,
    });
    assert.ok(listed.total >= 2);
    assert.equal(listed.rows.length, 1);
    assert.equal(Object.prototype.hasOwnProperty.call(listed.rows[0], "password_hash"), false);
    assert.ok(listed.totalPages >= 2);

    const page2 = await platformMembersRepo.listPlatformMembers(pool, {
      organization_id: org.id,
      page: 2,
      limit: 1,
    });
    assert.equal(page2.page, 2);
    assert.equal(page2.rows.length, 1);
    assert.notEqual(page2.rows[0].id, listed.rows[0].id);

    const dash = await agent.get("/admin/church");
    assert.ok([200, 302].includes(dash.status));

    await cleanupOrg(pool, org.id);
    await cleanupOrg(pool, otherOrg.id);
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
  }
);
