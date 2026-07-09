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
const ministryLeadersRepo = require("../src/db/pg/church/ministryLeadersRepo");
const ministriesRepo = require("../src/db/pg/church/ministriesRepo");
const loginAttemptsRepo = require("../src/db/pg/church/loginAttemptsRepo");
const platformSecurityRepo = require("../src/db/pg/church/platformSecurityRepo");
const {
  parseSecurityFiltersQuery,
  validateUnlockAccountBody,
} = require("../src/church/platformSecurityValidation");
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
      secret: "church-platform-security-test",
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

async function lockAccount(pool, table, id) {
  await pool.query(
    `UPDATE public.${table}
     SET login_locked_until = now() + interval '15 minutes',
         failed_login_attempts = 5,
         last_failed_login_at = now()
     WHERE id = $1`,
    [id]
  );
}

async function cleanup(pool, orgId) {
  await pool.query(`DELETE FROM public.church_login_attempts WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_ministry_leaders WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_ministries WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

test("validateUnlockAccountBody rejects invalid account type", () => {
  assert.equal(validateUnlockAccountBody({ account_type: "bad", account_id: "1" }).ok, false);
  assert.equal(validateUnlockAccountBody({ account_type: "member", account_id: "1" }).ok, true);
});

test("parseSecurityFiltersQuery validates success filter", () => {
  assert.equal(parseSecurityFiltersQuery({ success: "bad" }).ok, false);
  assert.equal(parseSecurityFiltersQuery({ success: "failure", account_type: "member" }).ok, true);
});

test("tenant manager cannot open security page", async () => {
  if (!isPgConfigured()) return;
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  const suffix = makeSuffix("secmgr");
  const hash = await bcrypt.hash("pw12345678", 12);
  const username = `sec_mgr_${suffix}`;
  const userId = await adminUsersRepo.insertUser(pool, {
    username,
    passwordHash: hash,
    role: ROLES.TENANT_MANAGER,
    tenantId: TENANT_ZM,
    displayName: "",
  });
  const app = createAdminApp();
  const agent = await adminLoginAgent(app, username, "pw12345678");
  const res = await agent.get("/admin/church/security");
  assert.equal(res.status, 403);
  await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [userId]);
});

test(
  "platform security visibility integration",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("platsec");
    const hash = await bcrypt.hash("superpw123456", 12);
    const superName = `platsec_sup_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `platsec_${suffix}`,
      name: `Security Org ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Security Branch ${suffix}`,
    });
    const passwordHash = await bcrypt.hash("testpass123456", 12);

    const member = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email: `sec_member_${suffix}@example.com`,
      phone: "0977111101",
      full_name: "Locked Member",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
    });
    await membersRepo.updateMemberStatusForBranch(pool, member.id, branch.id, "verified");

    const branchAdmin = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      full_name: "Locked Branch Admin",
      email: `sec_ba_${suffix}@example.com`,
      phone: "0977111102",
      password_hash: passwordHash,
    });

    const hqAdmin = await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: org.id,
      full_name: "Locked HQ Admin",
      email: `sec_hq_${suffix}@example.com`,
      phone: "0977111103",
      password_hash: passwordHash,
    });

    const ministry = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      name: "Security Ministry",
      slug: `sec-min-${suffix}`.slice(0, 20),
      description: "Test",
      leader_name: "Leader",
      visibility: "members",
      status: "published",
      created_by_admin_id: null,
    });

    const leader = await ministryLeadersRepo.createMinistryLeader(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      ministry_id: ministry.id,
      full_name: "Locked Leader",
      email: `sec_leader_${suffix}@example.com`,
      phone: "0977111104",
      password_hash: passwordHash,
      role: "ministry_leader",
      status: "active",
    });

    await lockAccount(pool, "church_members", member.id);
    await lockAccount(pool, "church_branch_admins", branchAdmin.id);
    await lockAccount(pool, "church_hq_admins", hqAdmin.id);
    await lockAccount(pool, "church_ministry_leaders", leader.id);

    await loginAttemptsRepo.recordLoginAttempt(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      account_type: "member",
      account_id: member.id,
      identifier_normalized: `sec_member_${suffix}@example.com`,
      success: false,
      failure_reason: "invalid_password",
    });
    await loginAttemptsRepo.recordLoginAttempt(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      account_type: "member",
      account_id: member.id,
      identifier_normalized: `sec_member_${suffix}@example.com`,
      success: true,
      failure_reason: null,
    });

    const app = createAdminApp();
    const agent = await adminLoginAgent(app, superName, "superpw123456");

    const page = await agent.get("/admin/church/security");
    assert.equal(page.status, 200);
    assert.match(page.text, /Church Security/i);
    assert.match(page.text, /Locked Member/);
    assert.match(page.text, /Locked Branch Admin/);
    assert.match(page.text, /Locked HQ Admin/);
    assert.match(page.text, /Locked Leader/);
    assert.doesNotMatch(page.text, /\$2[aby]\$/);
    assert.doesNotMatch(page.text, /password_hash/i);

    const filtered = await agent.get("/admin/church/security?account_type=member&success=failure");
    assert.equal(filtered.status, 200);
    assert.match(filtered.text, /invalid_password|Failure/i);

    const unlock = await agent.post("/admin/church/security/unlock").type("form").send({
      account_type: "member",
      account_id: String(member.id),
      reason: "Support unlock test",
    });
    assert.equal(unlock.status, 302);
    assert.match(unlock.headers.location, /notice=account_unlocked/);

    const unlockedMember = await membersRepo.findMemberById(pool, member.id);
    assert.ok(!unlockedMember.login_locked_until);
    assert.equal(Number(unlockedMember.failed_login_attempts), 0);
    assert.ok(unlockedMember.last_failed_login_at);

    const audit = await pool.query(
      `SELECT action, metadata_json FROM public.church_audit_logs
       WHERE organization_id = $1 AND action = 'platform_login_account_unlocked'
       ORDER BY id DESC LIMIT 1`,
      [org.id]
    );
    assert.equal(audit.rows.length, 1);
    const meta =
      typeof audit.rows[0].metadata_json === "string"
        ? JSON.parse(audit.rows[0].metadata_json)
        : audit.rows[0].metadata_json;
    assert.equal(meta.account_type, "member");
    assert.equal(Number(meta.account_id), member.id);
    assert.equal(meta.action_source, "platform_security");

    const invalidUnlock = await agent.post("/admin/church/security/unlock").type("form").send({
      account_type: "invalid_type",
      account_id: "1",
    });
    assert.equal(invalidUnlock.status, 400);

    const lockedList = await platformSecurityRepo.listLockedAccounts(pool, { account_type: "all" });
    assert.ok(lockedList.some((row) => row.account_type === "branch_admin"));
    assert.ok(lockedList.some((row) => row.account_type === "hq_admin"));
    assert.ok(lockedList.some((row) => row.account_type === "ministry_leader"));

    const attempts = await platformSecurityRepo.listRecentLoginAttempts(pool, { limit: 10 });
    assert.ok(attempts.items.length >= 2);

    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
    await cleanup(pool, org.id);
  }
);
