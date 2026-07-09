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
const ministriesRepo = require("../src/db/pg/church/ministriesRepo");
const ministryLeadersRepo = require("../src/db/pg/church/ministryLeadersRepo");
const platformMinistryLeaderSupportRepo = require("../src/db/pg/church/platformMinistryLeaderSupportRepo");
const platformSupportNotesRepo = require("../src/db/pg/church/platformSupportNotesRepo");
const platformSecurityRepo = require("../src/db/pg/church/platformSecurityRepo");
const { parseMinistryLeaderSupportParams } = require("../src/church/platformMinistryLeaderSupportValidation");
const { validateCreateSupportNoteBody } = require("../src/church/platformSupportNotesValidation");
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
      secret: "church-ministry-leader-support-test",
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

async function cleanup(pool, orgId, branchId) {
  await pool.query(`DELETE FROM public.church_platform_support_notes WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_login_attempts WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_ministry_leaders WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_ministries WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

test("parseMinistryLeaderSupportParams validates leader id and return_to", () => {
  assert.equal(parseMinistryLeaderSupportParams({ leaderId: "0" }, {}).ok, false);
  const ok = parseMinistryLeaderSupportParams(
    { branchId: "3", leaderId: "5" },
    { return_to: "/admin/church/search" }
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.data.leaderId, 5);
  assert.equal(ok.data.branchId, 3);
});

test("validateCreateSupportNoteBody accepts ministry_leader entity", () => {
  const parsed = validateCreateSupportNoteBody({
    entity_type: "ministry_leader",
    entity_id: "12",
    note_body: "Operational follow-up only.",
    return_to: "/admin/church/ministry-leaders/12",
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.entity_type, "ministry_leader");
});

test("tenant manager cannot open ministry leader support detail", async () => {
  if (!isPgConfigured()) return;
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  const suffix = makeSuffix("leadersupmgr");
  const hash = await bcrypt.hash("pw12345678", 12);
  const username = `leader_sup_mgr_${suffix}`;
  const userId = await adminUsersRepo.insertUser(pool, {
    username,
    passwordHash: hash,
    role: ROLES.TENANT_MANAGER,
    tenantId: TENANT_ZM,
    displayName: "",
  });
  const app = createAdminApp();
  const agent = await adminLoginAgent(app, username, "pw12345678");
  const res = await agent.get("/admin/church/ministry-leaders/1");
  assert.equal(res.status, 403);
  await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [userId]);
});

test(
  "platform ministry leader support detail",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("leadersupport");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `leader_sup_${suffix}`,
      name: `Leader Support Org ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Leader Support Branch ${suffix}`,
    });
    const ministry = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      name: `Youth ${suffix}`,
      slug: "youth",
      status: "published",
      visibility: "members",
    });
    const passwordHash = await bcrypt.hash("leaderpass123456", 12);
    const leader = await ministryLeadersRepo.createLeaderForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      ministry_id: ministry.id,
      full_name: `Leader ${suffix}`,
      email: `leader_${suffix}@example.com`,
      phone: "0977333444",
      password_hash: passwordHash,
      role: "ministry_leader",
      status: "active",
      notes: "Platform test note",
    });

    await pool.query(
      `UPDATE public.church_ministry_leaders
       SET login_locked_until = now() + interval '15 minutes',
           failed_login_attempts = 5,
           last_failed_login_at = now()
       WHERE id = $1`,
      [leader.id]
    );

    await pool.query(
      `INSERT INTO public.church_login_attempts (
         organization_id, branch_id, account_type, account_id,
         identifier_normalized, ip_address, user_agent, success, failure_reason
       ) VALUES ($1, $2, 'ministry_leader', $3, $4, '203.0.113.10', 'TestAgent/1.0', false, 'invalid_password')`,
      [org.id, branch.id, leader.id, `leader_${suffix}@example.com`]
    );

    const superHash = await bcrypt.hash("superpw123456", 12);
    const superName = `leader_sup_super_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: superHash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const detail = await platformMinistryLeaderSupportRepo.findMinistryLeaderSupportDetailById(pool, leader.id);
    assert.ok(detail);
    assert.equal(detail.organization.name, org.name);
    assert.equal(detail.branch.name, branch.name);
    assert.equal(detail.ministry.name, ministry.name);
    assert.equal(detail.loginContext.can_access_leader_portal, true);
    assert.ok(detail.loginAttempts.length >= 1);

    const locked = await platformSecurityRepo.listLockedAccounts(pool, { account_type: "ministry_leader" });
    const lockedRow = locked.find((r) => Number(r.account_id) === Number(leader.id));
    assert.ok(lockedRow);
    assert.equal(lockedRow.detail_link, `/admin/church/ministry-leaders/${leader.id}`);

    const app = createAdminApp();
    const agent = await adminLoginAgent(app, superName, "superpw123456");

    const notFound = await agent.get("/admin/church/ministry-leaders/999999999");
    assert.equal(notFound.status, 404);

    const detailRes = await agent.get(`/admin/church/ministry-leaders/${leader.id}`);
    assert.equal(detailRes.status, 200);
    assert.match(detailRes.text, /Leader Support Org/);
    assert.match(detailRes.text, /Leader Support Branch/);
    assert.match(detailRes.text, /Youth/);
    assert.match(detailRes.text, /Can access leader portal/);
    assert.match(detailRes.text, /leader\/login/);
    assert.match(detailRes.text, /Platform support notes/);
    assert.doesNotMatch(detailRes.text, /password_hash/i);
    assert.doesNotMatch(detailRes.text, /leaderpass123456/);

    const branchScoped = await agent.get(
      `/admin/church/branches/${branch.id}/ministry-leaders/${leader.id}`
    );
    assert.equal(branchScoped.status, 200);

    const wrongBranch = await agent.get(`/admin/church/branches/999999/ministry-leaders/${leader.id}`);
    assert.equal(wrongBranch.status, 404);

    const searchRes = await agent.get(`/admin/church/search?q=${encodeURIComponent(`Leader ${suffix}`)}`);
    assert.equal(searchRes.status, 200);
    assert.match(searchRes.text, `/admin/church/ministry-leaders/${leader.id}`);

    const note = await platformSupportNotesRepo.createSupportNote(
      pool,
      {
        entity_type: "ministry_leader",
        entity_id: leader.id,
        note_body: "Checked leader lockout with branch admin.",
        return_to: `/admin/church/ministry-leaders/${leader.id}`,
      },
      superId
    );
    assert.ok(note);

    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
    await cleanup(pool, org.id, branch.id);
  }
);
