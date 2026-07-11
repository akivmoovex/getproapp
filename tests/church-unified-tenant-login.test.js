"use strict";

/**
 * Unified tenant login — focused verification (non-DB + PG-gated).
 */

const path = require("path");
const express = require("express");
const session = require("express-session");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const bcrypt = require("bcryptjs");

const churchRoutes = require("../src/routes/church");
const {
  authenticateTenantUnifiedLogin,
  ROLE_PRECEDENCE,
  destinationForRole,
  UNIFIED_LOGIN_FAILURE,
  TENANT_MISMATCH_MESSAGE,
} = require("../src/services/church/tenantUnifiedLoginService");
const { churchPgSkipIfUnconfigured, requireChurchPgOrSkip } = require("./helpers/churchPgTest");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const { getChurchMemberSession } = require("../src/church/memberAuth");
const { getChurchLeaderSession } = require("../src/church/leaderAuth");
const { getChurchBranchAdminSession } = require("../src/church/branchAdminAuth");
const { getChurchHqAdminSession } = require("../src/church/hqAuth");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeTenantApp(org, branch, { withSession = true } = {}) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  if (withSession) {
    app.use(
      session({
        secret: "unified-login-test",
        resave: false,
        saveUninitialized: false,
        name: "getpro_sid",
      })
    );
  }
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = {
      kind: "branch",
      host: `${branch.host_slug || "demo"}.blessboard.com`,
      orgSlug: org.slug,
      hostSlug: branch.host_slug || branch.slug,
      organization: org,
      branch,
    };
    next();
  });
  app.use(churchRoutes());
  return app;
}

test("tenant login renders church/branch branding and shared form without role selector", async () => {
  const org = { id: 1, name: "Unity Church Org", slug: "unity-org", status: "active" };
  const branch = {
    id: 2,
    name: "Unity Main Branch",
    slug: "unity-main",
    host_slug: "unity-main",
    status: "active",
    member_registration_enabled: true,
  };
  const app = makeTenantApp(org, branch);
  const res = await request(app).get("/login");
  assert.equal(res.status, 200);
  assert.match(res.text, /Unity Church Org|Unity Main Branch/);
  assert.match(res.text, /Members, ministry leaders, church staff, and administrators use the same sign-in/);
  assert.match(res.text, /data-unified-login="1"/);
  assert.match(res.text, /name="identifier"/);
  assert.match(res.text, /name="password"/);
  assert.doesNotMatch(res.text, /name="role"|Choose your role|I am a member|I am a leader/i);
  assert.match(res.text, /Forgot password/);
  assert.match(res.text, /Register as a Member/);
});

test("destinationForRole and precedence are server-defined", () => {
  assert.deepEqual(ROLE_PRECEDENCE, ["hq_admin", "branch_admin", "ministry_leader", "member"]);
  assert.equal(destinationForRole({ type: "hq_admin" }), "/hq/dashboard");
  assert.equal(destinationForRole({ type: "branch_admin" }), "/branch/dashboard");
  assert.equal(destinationForRole({ type: "ministry_leader" }), "/leader/dashboard");
  assert.equal(destinationForRole({ type: "member", status: "verified" }), "/member/dashboard");
  assert.equal(destinationForRole({ type: "member", status: "pending" }), "/waiting-verification");
});

test("client-posted role/org/branch/redirect fields are ignored by login form contract", async () => {
  const org = { id: 1, name: "Ignore Org", slug: "ignore-org", status: "active" };
  const branch = {
    id: 2,
    name: "Ignore Branch",
    slug: "ignore-br",
    host_slug: "ignore-br",
    status: "active",
    member_registration_enabled: true,
  };
  const app = makeTenantApp(org, branch);
  const res = await request(app)
    .post("/login")
    .type("form")
    .send({
      identifier: "",
      password: "",
      role: "hq_admin",
      organization_id: "999",
      branch_id: "999",
      redirect: "https://evil.example/phish",
    });
  assert.equal(res.status, 400);
  assert.doesNotMatch(String(res.headers.location || ""), /evil\.example/);
  assert.match(res.text, /email or phone and password|sign-in details|Please enter/i);
});

test(
  "unified login redirects each role to the correct portal",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("ulogin");
    const hash = await bcrypt.hash("UnifyPass123!", 12);

    const orgRes = await pool.query(
      `INSERT INTO public.church_organizations (platform_tenant_id, name, slug, status)
       VALUES ($1, $2, $3, 'active') RETURNING *`,
      [TENANT_ZM, `Unify Org ${suffix}`, `unify-org-${suffix}`]
    );
    const org = orgRes.rows[0];
    const brRes = await pool.query(
      `INSERT INTO public.church_branches
         (organization_id, name, slug, host_slug, status, member_registration_enabled)
       VALUES ($1, $2, $3, $4, 'active', true) RETURNING *`,
      [org.id, `Unify Branch ${suffix}`, `unify-br-${suffix}`, `unify-br-${suffix}`]
    );
    const branch = brRes.rows[0];

    const otherOrg = await pool.query(
      `INSERT INTO public.church_organizations (platform_tenant_id, name, slug, status)
       VALUES ($1, $2, $3, 'active') RETURNING *`,
      [TENANT_ZM, `Other Org ${suffix}`, `other-org-${suffix}`]
    );
    const otherBranch = await pool.query(
      `INSERT INTO public.church_branches
         (organization_id, name, slug, host_slug, status, member_registration_enabled)
       VALUES ($1, $2, $3, $4, 'active', true) RETURNING *`,
      [otherOrg.rows[0].id, `Other Branch ${suffix}`, `other-br-${suffix}`, `other-br-${suffix}`]
    );

    await pool.query(
      `INSERT INTO public.church_members
         (organization_id, branch_id, platform_tenant_id, full_name, email, phone_normalized, password_hash, status)
       VALUES ($1, $2, $3, 'Member User', $4, '260970000001', $5, 'verified')`,
      [org.id, branch.id, TENANT_ZM, `member_${suffix}@example.com`, hash]
    );
    await pool.query(
      `INSERT INTO public.church_members
         (organization_id, branch_id, platform_tenant_id, full_name, email, phone_normalized, password_hash, status)
       VALUES ($1, $2, $3, 'Pending User', $4, '260970000002', $5, 'pending')`,
      [org.id, branch.id, TENANT_ZM, `pending_${suffix}@example.com`, hash]
    );
    await pool.query(
      `INSERT INTO public.church_members
         (organization_id, branch_id, platform_tenant_id, full_name, email, phone_normalized, password_hash, status)
       VALUES ($1, $2, $3, 'Suspended User', $4, '260970000003', $5, 'suspended')`,
      [org.id, branch.id, TENANT_ZM, `suspended_${suffix}@example.com`, hash]
    );
    await pool.query(
      `INSERT INTO public.church_ministry_leaders
         (organization_id, branch_id, full_name, email, phone_normalized, password_hash, status)
       VALUES ($1, $2, 'Leader User', $3, '260970000004', $4, 'active')`,
      [org.id, branch.id, `leader_${suffix}@example.com`, hash]
    );
    await pool.query(
      `INSERT INTO public.church_branch_admins
         (organization_id, branch_id, full_name, email, username, phone_normalized, password_hash, status)
       VALUES ($1, $2, 'Branch Admin', $3, $4, '260970000005', $5, 'active')`,
      [org.id, branch.id, `ba_${suffix}@example.com`, `ba_${suffix}`, hash]
    );
    await pool.query(
      `INSERT INTO public.church_hq_admins
         (organization_id, full_name, email, username, phone_normalized, password_hash, status)
       VALUES ($1, 'HQ Admin', $2, $3, '260970000006', $4, 'active')`,
      [org.id, `hq_${suffix}@example.com`, `hq_${suffix}`, hash]
    );

    // Foreign member (other org) with same password for mismatch check
    await pool.query(
      `INSERT INTO public.church_members
         (organization_id, branch_id, platform_tenant_id, full_name, email, phone_normalized, password_hash, status)
       VALUES ($1, $2, $3, 'Foreign Member', $4, '260970000099', $5, 'verified')`,
      [otherOrg.rows[0].id, otherBranch.rows[0].id, TENANT_ZM, `foreign_${suffix}@example.com`, hash]
    );

    const app = makeTenantApp(org, branch);

    const memberLogin = await request(app)
      .post("/login")
      .type("form")
      .send({ identifier: `member_${suffix}@example.com`, password: "UnifyPass123!" });
    assert.equal(memberLogin.status, 303);
    assert.equal(memberLogin.headers.location, "/member/dashboard");

    const pendingLogin = await request(app)
      .post("/login")
      .type("form")
      .send({ identifier: `pending_${suffix}@example.com`, password: "UnifyPass123!" });
    assert.equal(pendingLogin.status, 303);
    assert.equal(pendingLogin.headers.location, "/waiting-verification");

    const leaderLogin = await request(app)
      .post("/login")
      .type("form")
      .send({ identifier: `leader_${suffix}@example.com`, password: "UnifyPass123!" });
    assert.equal(leaderLogin.status, 303);
    assert.equal(leaderLogin.headers.location, "/leader/dashboard");

    const baLogin = await request(app)
      .post("/login")
      .type("form")
      .send({ identifier: `ba_${suffix}@example.com`, password: "UnifyPass123!" });
    assert.equal(baLogin.status, 303);
    assert.equal(baLogin.headers.location, "/branch/dashboard");

    const hqLogin = await request(app)
      .post("/login")
      .type("form")
      .send({ identifier: `hq_${suffix}@example.com`, password: "UnifyPass123!" });
    assert.equal(hqLogin.status, 303);
    assert.equal(hqLogin.headers.location, "/hq/dashboard");

    const suspended = await request(app)
      .post("/login")
      .type("form")
      .send({ identifier: `suspended_${suffix}@example.com`, password: "UnifyPass123!" });
    assert.equal(suspended.status, 400);
    assert.match(suspended.text, /suspended/i);

    const foreign = await request(app)
      .post("/login")
      .type("form")
      .send({ identifier: `foreign_${suffix}@example.com`, password: "UnifyPass123!" });
    assert.equal(foreign.status, 400);
    assert.match(foreign.text, /cannot sign in through this church/i);

    const bad = await request(app)
      .post("/login")
      .type("form")
      .send({ identifier: `member_${suffix}@example.com`, password: "WrongPassword!!" });
    assert.equal(bad.status, 400);
    assert.match(bad.text, /sign-in details were not recognized/i);

    // Service-level: ignore bogus redirect in body by never reading it
    const fakeReq = { body: { redirect: "https://evil.test" }, ip: "127.0.0.1", get: () => "" };
    const svc = await authenticateTenantUnifiedLogin(pool, fakeReq, {
      organization: org,
      branch,
      identifier: `member_${suffix}@example.com`,
      password: "UnifyPass123!",
    });
    assert.equal(svc.ok, true);
    assert.equal(svc.primaryRole.destination, "/member/dashboard");
  }
);

test(
  "multi-role user gets choose-portal and invalid choice is rejected",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("multi");
    const hash = await bcrypt.hash("MultiPass123!", 12);
    const orgRes = await pool.query(
      `INSERT INTO public.church_organizations (platform_tenant_id, name, slug, status)
       VALUES ($1, $2, $3, 'active') RETURNING *`,
      [TENANT_ZM, `Multi Org ${suffix}`, `multi-org-${suffix}`]
    );
    const org = orgRes.rows[0];
    const brRes = await pool.query(
      `INSERT INTO public.church_branches
         (organization_id, name, slug, host_slug, status, member_registration_enabled)
       VALUES ($1, $2, $3, $4, 'active', true) RETURNING *`,
      [org.id, `Multi Branch ${suffix}`, `multi-br-${suffix}`, `multi-br-${suffix}`]
    );
    const branch = brRes.rows[0];
    const email = `multi_${suffix}@example.com`;

    await pool.query(
      `INSERT INTO public.church_members
         (organization_id, branch_id, platform_tenant_id, full_name, email, phone_normalized, password_hash, status)
       VALUES ($1, $2, $3, 'Multi Member', $4, '260971111111', $5, 'verified')`,
      [org.id, branch.id, TENANT_ZM, email, hash]
    );
    await pool.query(
      `INSERT INTO public.church_hq_admins
         (organization_id, full_name, email, username, phone_normalized, password_hash, status)
       VALUES ($1, 'Multi HQ', $2, $3, '260971111112', $4, 'active')`,
      [org.id, email, `multihq_${suffix}`, hash]
    );

    const app = makeTenantApp(org, branch);
    const agent = request.agent(app);
    const login = await agent.post("/login").type("form").send({ identifier: email, password: "MultiPass123!" });
    assert.equal(login.status, 303);
    assert.equal(login.headers.location, "/choose-portal");

    const page = await agent.get("/choose-portal");
    assert.equal(page.status, 200);
    assert.match(page.text, /Choose a portal/);
    assert.match(page.text, /HQ Administrator/);
    assert.match(page.text, /Member/);

    const badChoice = await agent.post("/choose-portal").type("form").send({ role: "platform_admin", redirect: "/admin" });
    assert.equal(badChoice.status, 400);

    const okChoice = await agent.post("/choose-portal").type("form").send({ role: "hq_admin" });
    assert.equal(okChoice.status, 303);
    assert.equal(okChoice.headers.location, "/hq/dashboard");
  }
);

test("session helpers expose church role getters for verification", () => {
  assert.equal(typeof getChurchMemberSession, "function");
  assert.equal(typeof getChurchLeaderSession, "function");
  assert.equal(typeof getChurchBranchAdminSession, "function");
  assert.equal(typeof getChurchHqAdminSession, "function");
  assert.match(UNIFIED_LOGIN_FAILURE, /sign-in details/i);
  assert.match(TENANT_MISMATCH_MESSAGE, /cannot sign in through this church/i);
});
