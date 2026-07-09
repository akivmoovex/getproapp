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
const membersRepo = require("../src/db/pg/church/membersRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const ministryLeadersRepo = require("../src/db/pg/church/ministryLeadersRepo");
const ministriesRepo = require("../src/db/pg/church/ministriesRepo");
const loginAttemptsRepo = require("../src/db/pg/church/loginAttemptsRepo");
const {
  GENERIC_LOGIN_FAILURE,
  LOCKOUT_MESSAGE,
  normalizeLoginIdentifier,
} = require("../src/church/loginProtection");
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
      secret: "test-church-login-protection",
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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

async function seedAccounts(pool, suffix) {
  const password = "testpass123456";
  const passwordHash = await bcrypt.hash(password, 12);
  const org = await organizationsRepo.createOrganization(pool, {
    platform_tenant_id: TENANT_ZM,
    slug: `loginprot_${suffix}`,
    name: `Login Protection ${suffix}`,
  });
  const branch = await branchesRepo.createBranch(pool, {
    organization_id: org.id,
    slug: "main",
    name: `Login Branch ${suffix}`,
  });

  const member = await membersRepo.createPendingMember(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    platform_tenant_id: TENANT_ZM,
    email: `member_${suffix}@example.com`,
    phone: "0977000101",
    full_name: "Login Member",
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
    full_name: "Login Branch Admin",
    email: `badmin_${suffix}@example.com`,
    phone: "0977000102",
    password_hash: passwordHash,
  });

  const hqAdmin = await hqAdminsRepo.createHqAdmin(pool, {
    organization_id: org.id,
    full_name: "Login HQ Admin",
    email: `hqadmin_${suffix}@example.com`,
    phone: "0977000103",
    password_hash: passwordHash,
  });

  const ministry = await ministriesRepo.createMinistryForBranch(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    name: `Ministry ${suffix}`,
    slug: `min-${suffix}`.slice(0, 20),
    description: "Test ministry",
    leader_name: "Login Leader",
    visibility: "members",
    status: "published",
    created_by_admin_id: null,
  });

  const leader = await ministryLeadersRepo.createMinistryLeader(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    ministry_id: ministry.id,
    full_name: "Login Leader",
    email: `leader_${suffix}@example.com`,
    phone: "0977000104",
    password_hash: passwordHash,
    role: "ministry_leader",
    status: "active",
  });

  return {
    org,
    branch,
    password,
    member,
    branchAdmin,
    hqAdmin,
    leader,
    emails: {
      member: `member_${suffix}@example.com`,
      branchAdmin: `badmin_${suffix}@example.com`,
      hqAdmin: `hqadmin_${suffix}@example.com`,
      leader: `leader_${suffix}@example.com`,
    },
  };
}

test("normalizeLoginIdentifier lowercases email and normalizes phone", () => {
  assert.equal(normalizeLoginIdentifier("User@Example.com"), "user@example.com");
  assert.equal(normalizeLoginIdentifier("0977-000-999"), "0977000999");
});

test(
  "member login protection integration",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("mlp");
    const seed = await seedAccounts(pool, suffix);
    const ctx = {
      kind: "branch",
      orgSlug: seed.org.slug,
      organization: { ...seed.org, status: "active" },
      branch: { ...seed.branch, status: "active" },
    };
    const app = makeApp(ctx);

    const unknown = await request(app).post("/login").type("form").send({
      identifier: `unknown_${suffix}@example.com`,
      password: seed.password,
    });
    assert.equal(unknown.status, 400);
    assert.match(unknown.text, new RegExp(escapeRegex(GENERIC_LOGIN_FAILURE)));

    const attemptsUnknown = await pool.query(
      `SELECT * FROM public.church_login_attempts
       WHERE organization_id = $1 AND account_type = 'member' AND account_id IS NULL
       ORDER BY id DESC LIMIT 1`,
      [seed.org.id]
    );
    assert.equal(attemptsUnknown.rows.length, 1);
    assert.equal(attemptsUnknown.rows[0].failure_reason, "invalid_identifier");

    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).post("/login").type("form").send({
        identifier: seed.emails.member,
        password: "wrong-password",
      });
      assert.equal(res.status, 400);
      if (i < 4) {
        assert.match(res.text, new RegExp(escapeRegex(GENERIC_LOGIN_FAILURE)));
      } else {
        assert.match(res.text, new RegExp(escapeRegex(LOCKOUT_MESSAGE)));
      }
    }

    const lockedMember = await membersRepo.findMemberById(pool, seed.member.id);
    assert.ok(loginAttemptsRepo.isAccountLocked(lockedMember));
    assert.equal(Number(lockedMember.failed_login_attempts), 5);

    const blockedCorrect = await request(app).post("/login").type("form").send({
      identifier: seed.emails.member,
      password: seed.password,
    });
    assert.equal(blockedCorrect.status, 400);
    assert.match(blockedCorrect.text, /Too many failed attempts/i);

    await pool.query(
      `UPDATE public.church_members
       SET login_locked_until = now() - interval '1 minute'
       WHERE id = $1`,
      [seed.member.id]
    );

    const agent = request.agent(app);
    const loginAfterExpiry = await agent.post("/login").type("form").send({
      identifier: seed.emails.member,
      password: seed.password,
    });
    assert.equal(loginAfterExpiry.status, 303);
    assert.equal(loginAfterExpiry.headers.location, "/member/dashboard");

    const resetMember = await membersRepo.findMemberById(pool, seed.member.id);
    assert.equal(Number(resetMember.failed_login_attempts), 0);
    assert.ok(!resetMember.login_locked_until);
    assert.ok(resetMember.last_successful_login_at);

    const lockAudit = await pool.query(
      `SELECT action, metadata_json FROM public.church_audit_logs
       WHERE organization_id = $1 AND action = 'member_login_locked'
       ORDER BY id DESC LIMIT 1`,
      [seed.org.id]
    );
    assert.equal(lockAudit.rows.length, 1);
    const meta =
      typeof lockAudit.rows[0].metadata_json === "string"
        ? JSON.parse(lockAudit.rows[0].metadata_json)
        : lockAudit.rows[0].metadata_json;
    assert.equal(meta.action_source, "login_protection");
    assert.ok(!JSON.stringify(meta).includes(seed.password));

    await cleanup(pool, seed.org.id);
  }
);

test(
  "branch admin, HQ admin, and leader login protection",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("alllp");
    const seed = await seedAccounts(pool, suffix);
    const ctx = {
      kind: "branch",
      orgSlug: seed.org.slug,
      organization: { ...seed.org, status: "active" },
      branch: { ...seed.branch, status: "active" },
    };
    const app = makeApp(ctx);

    async function lockAccountViaLogin(loginPath, identifier) {
      for (let i = 0; i < 5; i += 1) {
        await request(app).post(loginPath).type("form").send({
          identifier,
          password: "wrong-password",
        });
      }
    }

    await lockAccountViaLogin("/branch/login", seed.emails.branchAdmin);
    const lockedBranchAdmin = await branchAdminsRepo.findBranchAdminById(pool, seed.branchAdmin.id);
    assert.ok(loginAttemptsRepo.isAccountLocked(lockedBranchAdmin));

    const blockedBranch = await request(app).post("/branch/login").type("form").send({
      identifier: seed.emails.branchAdmin,
      password: seed.password,
    });
    assert.equal(blockedBranch.status, 400);
    assert.match(blockedBranch.text, /Too many failed attempts/i);

    await pool.query(
      `UPDATE public.church_branch_admins SET login_locked_until = now() - interval '1 minute' WHERE id = $1`,
      [seed.branchAdmin.id]
    );
    const branchLoginOk = await request(app).post("/branch/login").type("form").send({
      identifier: seed.emails.branchAdmin,
      password: seed.password,
    });
    assert.equal(branchLoginOk.status, 303);

    await lockAccountViaLogin("/hq/login", seed.emails.hqAdmin);
    await pool.query(
      `UPDATE public.church_hq_admins SET login_locked_until = now() - interval '1 minute' WHERE id = $1`,
      [seed.hqAdmin.id]
    );
    const hqLoginOk = await request(app).post("/hq/login").type("form").send({
      identifier: seed.emails.hqAdmin,
      password: seed.password,
    });
    assert.equal(hqLoginOk.status, 303);

    await lockAccountViaLogin("/leader/login", seed.emails.leader);
    await pool.query(
      `UPDATE public.church_ministry_leaders SET login_locked_until = now() - interval '1 minute' WHERE id = $1`,
      [seed.leader.id]
    );
    const leaderLoginOk = await request(app).post("/leader/login").type("form").send({
      identifier: seed.emails.leader,
      password: seed.password,
    });
    assert.equal(leaderLoginOk.status, 303);

    await branchAdminsRepo.deactivateBranchAdminForPlatform(pool, seed.branchAdmin.id, seed.branch.id, null);
    const inactiveBypass = await request(app).post("/branch/login").type("form").send({
      identifier: seed.emails.branchAdmin,
      password: seed.password,
    });
    assert.equal(inactiveBypass.status, 400);
    assert.match(inactiveBypass.text, new RegExp(escapeRegex(GENERIC_LOGIN_FAILURE)));

    const attemptRows = await pool.query(
      `SELECT * FROM public.church_login_attempts WHERE organization_id = $1`,
      [seed.org.id]
    );
    assert.ok(attemptRows.rows.length > 0);
    for (const row of attemptRows.rows) {
      assert.ok(!JSON.stringify(row).includes(seed.password));
    }

    await cleanup(pool, seed.org.id);
  }
);

test(
  "suspended member cannot login with correct password",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("susm");
    const seed = await seedAccounts(pool, suffix);
    await membersRepo.suspendMemberForBranch(pool, seed.member.id, seed.branch.id, null, "test");
    const app = makeApp({
      kind: "branch",
      orgSlug: seed.org.slug,
      organization: { ...seed.org, status: "active" },
      branch: { ...seed.branch, status: "active" },
    });

    const res = await request(app).post("/login").type("form").send({
      identifier: seed.emails.member,
      password: seed.password,
    });
    assert.equal(res.status, 400);
    assert.match(res.text, /suspended/i);

    const statusAttempt = await pool.query(
      `SELECT failure_reason FROM public.church_login_attempts
       WHERE organization_id = $1 AND account_id = $2 AND failure_reason = 'account_status'
       ORDER BY id DESC LIMIT 1`,
      [seed.org.id, seed.member.id]
    );
    assert.equal(statusAttempt.rows.length, 1);

    await cleanup(pool, seed.org.id);
  }
);
