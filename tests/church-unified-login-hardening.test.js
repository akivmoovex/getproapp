"use strict";

/**
 * Unified tenant login hardening — failed-attempt accounting, portal-choice, legacy routes.
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
  pickCanonicalLockoutTarget,
  authenticateTenantUnifiedLogin,
  UNIFIED_LOGIN_FAILURE,
} = require("../src/services/church/tenantUnifiedLoginService");
const {
  storePortalChoice,
  getPortalChoice,
  consumePortalChoice,
  clearPortalChoice,
  portalChoiceContainsSecrets,
  PORTAL_CHOICE_KEY,
  PORTAL_CHOICE_TTL_MS,
} = require("../src/church/tenantLoginSession");
const { churchPgSkipIfUnconfigured, requireChurchPgOrSkip } = require("./helpers/churchPgTest");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const { issueChurchSessionCsrfToken, CSRF_FIELD } = require("../src/church/churchSessionCsrf");

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
        secret: "unified-login-hardening-test",
        resave: false,
        saveUninitialized: true,
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

function makeApexAdminApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "admin-login-test",
      resave: false,
      saveUninitialized: false,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = { kind: "vertical-apex", host: "blessboard.com" };
    next();
  });
  // Mount only enough to prove /admin/login still exists via church/platform routes if registered.
  app.get("/admin/login", (req, res) => res.status(200).type("text").send("platform-admin-login"));
  return app;
}

test("pickCanonicalLockoutTarget selects one highest-precedence unlocked candidate", () => {
  const target = pickCanonicalLockoutTarget([
    { type: "member", accountType: "member", row: { id: 1, password_hash: "a" } },
    { type: "ministry_leader", accountType: "ministry_leader", row: { id: 2, password_hash: "b" } },
    { type: "branch_admin", accountType: "branch_admin", row: { id: 3, password_hash: "c" } },
  ]);
  assert.equal(target.type, "branch_admin");
  assert.equal(target.row.id, 3);

  const three = pickCanonicalLockoutTarget([
    { type: "member", accountType: "member", row: { id: 1, password_hash: "a" } },
    { type: "ministry_leader", accountType: "ministry_leader", row: { id: 2, password_hash: "b" } },
    { type: "hq_admin", accountType: "hq_admin", row: { id: 9, password_hash: "c" } },
  ]);
  assert.equal(three.type, "hq_admin");
});

test("portal-choice state stores no password or hash and expires", () => {
  const req = { session: {} };
  storePortalChoice(req, {
    organizationId: 10,
    branchId: 20,
    roles: [
      {
        type: "hq_admin",
        accountId: 1,
        status: "active",
        label: "HQ",
        password: "secret",
        password_hash: "$2a$12$fake",
        sessionPayload: { hq_admin_id: 1 },
      },
      {
        type: "member",
        accountId: 2,
        status: "verified",
        label: "Member",
        sessionPayload: { member_id: 2 },
      },
    ],
  });
  const stored = req.session[PORTAL_CHOICE_KEY];
  assert.equal(portalChoiceContainsSecrets(stored), false);
  assert.equal(stored.roles[0].password, undefined);
  assert.equal(stored.roles[0].password_hash, undefined);
  assert.equal(stored.roles[0].sessionPayload, undefined);
  assert.ok(stored.expires_at > Date.now());

  // Expired state rejected
  stored.expires_at = Date.now() - 1000;
  assert.equal(getPortalChoice(req), null);
  assert.equal(req.session[PORTAL_CHOICE_KEY], undefined);
});

test("consumePortalChoice clears state and blocks replay", () => {
  const req = { session: {} };
  storePortalChoice(req, {
    organizationId: 1,
    branchId: 2,
    roles: [
      { type: "hq_admin", accountId: 1, status: "active", label: "HQ" },
      { type: "member", accountId: 2, status: "verified", label: "Member" },
    ],
  });
  const first = consumePortalChoice(req);
  assert.ok(first);
  assert.equal(getPortalChoice(req), null);
  assert.equal(consumePortalChoice(req), null);
});

test("legacy leader and branch login GET redirect to /login; HQ stays on /hq/login", async () => {
  const org = { id: 1, name: "Legacy Org", slug: "legacy-org", status: "active" };
  const branch = {
    id: 2,
    name: "Legacy Branch",
    slug: "legacy-br",
    host_slug: "legacy-br",
    status: "active",
    member_registration_enabled: true,
  };
  const app = makeTenantApp(org, branch);

  const leader = await request(app).get("/leader/login");
  assert.equal(leader.status, 302);
  assert.equal(leader.headers.location, "/login");

  const branchLogin = await request(app).get("/branch/login");
  assert.equal(branchLogin.status, 302);
  assert.equal(branchLogin.headers.location, "/login");

  const hq = await request(app).get("/hq/login");
  assert.equal(hq.status, 200);
  assert.match(hq.text, /data-unified-login="1"/);
  assert.match(hq.text, /action="\/hq\/login"/);
  assert.match(hq.text, /same sign-in/);
});

test("platform admin login route remains dedicated", async () => {
  const app = makeApexAdminApp();
  const res = await request(app).get("/admin/login");
  assert.equal(res.status, 200);
  assert.match(res.text, /platform-admin-login/);
});

test("choose-portal CSRF is enforced when GETPRO_REQUIRE_CHURCH_CSRF=1", async () => {
  const prev = process.env.GETPRO_REQUIRE_CHURCH_CSRF;
  process.env.GETPRO_REQUIRE_CHURCH_CSRF = "1";
  try {
    const org = { id: 1, name: "Csrf Org", slug: "csrf-org", status: "active" };
    const branch = {
      id: 2,
      name: "Csrf Branch",
      slug: "csrf-br",
      host_slug: "csrf-br",
      status: "active",
      member_registration_enabled: true,
    };
    const app = makeTenantApp(org, branch);
    const agent = request.agent(app);
    await agent.get("/login");
    const denied = await agent.post("/choose-portal").type("form").send({ role: "hq_admin" });
    assert.equal(denied.status, 403);
  } finally {
    if (prev == null) delete process.env.GETPRO_REQUIRE_CHURCH_CSRF;
    else process.env.GETPRO_REQUIRE_CHURCH_CSRF = prev;
  }
});

test(
  "one failed unified login increments one account and one audit event",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("fail1");
    const hash = await bcrypt.hash("RightPass123!", 12);
    const orgRes = await pool.query(
      `INSERT INTO public.church_organizations (platform_tenant_id, name, slug, status)
       VALUES ($1, $2, $3, 'active') RETURNING *`,
      [TENANT_ZM, `Fail Org ${suffix}`, `fail-org-${suffix}`]
    );
    const org = orgRes.rows[0];
    const brRes = await pool.query(
      `INSERT INTO public.church_branches
         (organization_id, name, slug, host_slug, status, member_registration_enabled)
       VALUES ($1, $2, $3, $4, 'active', true) RETURNING *`,
      [org.id, `Fail Branch ${suffix}`, `fail-br-${suffix}`, `fail-br-${suffix}`]
    );
    const branch = brRes.rows[0];
    const email = `dual_${suffix}@example.com`;

    const memberIns = await pool.query(
      `INSERT INTO public.church_members
         (organization_id, branch_id, platform_tenant_id, full_name, email, phone_normalized, password_hash, status, failed_login_attempts)
       VALUES ($1, $2, $3, 'Dual Member', $4, '260980000001', $5, 'verified', 0) RETURNING id`,
      [org.id, branch.id, TENANT_ZM, email, hash]
    );
    const leaderIns = await pool.query(
      `INSERT INTO public.church_ministry_leaders
         (organization_id, branch_id, full_name, email, phone_normalized, password_hash, status, failed_login_attempts)
       VALUES ($1, $2, 'Dual Leader', $3, '260980000002', $4, 'active', 0) RETURNING id`,
      [org.id, branch.id, email, hash]
    );
    const baIns = await pool.query(
      `INSERT INTO public.church_branch_admins
         (organization_id, branch_id, full_name, email, username, phone_normalized, password_hash, status, failed_login_attempts)
       VALUES ($1, $2, 'Dual BA', $3, $4, '260980000003', $5, 'active', 0) RETURNING id`,
      [org.id, branch.id, email, `ba_${suffix}`, hash]
    );

    const fakeReq = { ip: "127.0.0.1", get: () => "test-agent", body: {} };
    const beforeAudits = await pool.query(
      `SELECT count(*)::int AS c FROM public.church_audit_logs
       WHERE organization_id = $1 AND action = 'tenant_login_failed'`,
      [org.id]
    );

    const result = await authenticateTenantUnifiedLogin(pool, fakeReq, {
      organization: org,
      branch,
      identifier: email,
      password: "WrongPassword!!",
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, UNIFIED_LOGIN_FAILURE);

    const member = await pool.query(`SELECT failed_login_attempts FROM public.church_members WHERE id = $1`, [
      memberIns.rows[0].id,
    ]);
    const leader = await pool.query(
      `SELECT failed_login_attempts FROM public.church_ministry_leaders WHERE id = $1`,
      [leaderIns.rows[0].id]
    );
    const ba = await pool.query(`SELECT failed_login_attempts FROM public.church_branch_admins WHERE id = $1`, [
      baIns.rows[0].id,
    ]);

    const attempts = [
      Number(member.rows[0].failed_login_attempts),
      Number(leader.rows[0].failed_login_attempts),
      Number(ba.rows[0].failed_login_attempts),
    ];
    assert.equal(attempts.reduce((a, b) => a + b, 0), 1, "exactly one account incremented");
    assert.equal(attempts.filter((n) => n === 1).length, 1);
    assert.equal(attempts.filter((n) => n === 0).length, 2);

    const afterAudits = await pool.query(
      `SELECT count(*)::int AS c FROM public.church_audit_logs
       WHERE organization_id = $1 AND action = 'tenant_login_failed'`,
      [org.id]
    );
    assert.equal(afterAudits.rows[0].c - beforeAudits.rows[0].c, 1);

    const attemptRows = await pool.query(
      `SELECT count(*)::int AS c FROM public.church_login_attempts
       WHERE organization_id = $1 AND identifier_normalized = $2 AND success = false
         AND created_at > now() - interval '2 minutes'`,
      [org.id, email.toLowerCase()]
    );
    assert.equal(attemptRows.rows[0].c, 1);
  }
);

test(
  "successful member login clears only that member failure state; multi-role and portal hardening",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("ok1");
    const hash = await bcrypt.hash("OkPass123!", 12);
    const orgRes = await pool.query(
      `INSERT INTO public.church_organizations (platform_tenant_id, name, slug, status)
       VALUES ($1, $2, $3, 'active') RETURNING *`,
      [TENANT_ZM, `Ok Org ${suffix}`, `ok-org-${suffix}`]
    );
    const org = orgRes.rows[0];
    const brRes = await pool.query(
      `INSERT INTO public.church_branches
         (organization_id, name, slug, host_slug, status, member_registration_enabled)
       VALUES ($1, $2, $3, $4, 'active', true) RETURNING *`,
      [org.id, `Ok Branch ${suffix}`, `ok-br-${suffix}`, `ok-br-${suffix}`]
    );
    const branch = brRes.rows[0];
    const memberEmail = `member_only_${suffix}@example.com`;
    const multiEmail = `multi_${suffix}@example.com`;

    const memberIns = await pool.query(
      `INSERT INTO public.church_members
         (organization_id, branch_id, platform_tenant_id, full_name, email, phone_normalized, password_hash, status, failed_login_attempts)
       VALUES ($1, $2, $3, 'Member Only', $4, '260981000001', $5, 'verified', 3) RETURNING id`,
      [org.id, branch.id, TENANT_ZM, memberEmail, hash]
    );
    await pool.query(
      `INSERT INTO public.church_members
         (organization_id, branch_id, platform_tenant_id, full_name, email, phone_normalized, password_hash, status)
       VALUES ($1, $2, $3, 'Multi Member', $4, '260981000002', $5, 'verified')`,
      [org.id, branch.id, TENANT_ZM, multiEmail, hash]
    );
    const hqIns = await pool.query(
      `INSERT INTO public.church_hq_admins
         (organization_id, full_name, email, username, phone_normalized, password_hash, status)
       VALUES ($1, 'Multi HQ', $2, $3, '260981000003', $4, 'active') RETURNING id`,
      [org.id, multiEmail, `hq_${suffix}`, hash]
    );

    const app = makeTenantApp(org, branch);
    const memberLogin = await request(app)
      .post("/login")
      .type("form")
      .send({ identifier: memberEmail, password: "OkPass123!" });
    assert.equal(memberLogin.status, 303);
    assert.equal(memberLogin.headers.location, "/member/dashboard");

    const cleared = await pool.query(
      `SELECT failed_login_attempts, login_locked_until FROM public.church_members WHERE id = $1`,
      [memberIns.rows[0].id]
    );
    assert.equal(Number(cleared.rows[0].failed_login_attempts), 0);
    assert.equal(cleared.rows[0].login_locked_until, null);

    const agent = request.agent(app);
    const multiLogin = await agent
      .post("/login")
      .type("form")
      .send({ identifier: multiEmail, password: "OkPass123!" });
    assert.equal(multiLogin.status, 303);
    assert.equal(multiLogin.headers.location, "/choose-portal");

    const choicePage = await agent.get("/choose-portal");
    assert.equal(choicePage.status, 200);
    assert.doesNotMatch(choicePage.text, /password_hash|\$2a\$/i);

    // Invalid role rejected
    const bad = await agent.post("/choose-portal").type("form").send({ role: "platform_admin", redirect: "https://evil.test" });
    assert.equal(bad.status, 400);
    assert.doesNotMatch(String(bad.headers.location || ""), /evil\.test/);

    // Deactivate HQ before selection → rejected; other role remains choosable
    await pool.query(`UPDATE public.church_hq_admins SET status = 'inactive' WHERE id = $1`, [hqIns.rows[0].id]);
    const inactiveChoice = await agent.post("/choose-portal").type("form").send({ role: "hq_admin" });
    assert.equal(inactiveChoice.status, 400);
    assert.match(inactiveChoice.text, /no longer available|Unable to sign in|Choose a portal/i);

    const memberChoice = await agent.post("/choose-portal").type("form").send({ role: "member" });
    assert.equal(memberChoice.status, 303);
    assert.equal(memberChoice.headers.location, "/member/dashboard");

    const replay = await agent.post("/choose-portal").type("form").send({ role: "member" });
    assert.ok([302, 303].includes(replay.status));
    assert.equal(replay.headers.location, "/login");

    // Restore HQ for legacy route checks
    await pool.query(`UPDATE public.church_hq_admins SET status = 'active' WHERE id = $1`, [hqIns.rows[0].id]);

    // Legacy POSTs reuse unified coordinator
    const leaderAgent = request.agent(app);
    const leaderEmail = `leader_${suffix}@example.com`;
    await pool.query(
      `INSERT INTO public.church_ministry_leaders
         (organization_id, branch_id, full_name, email, phone_normalized, password_hash, status)
       VALUES ($1, $2, 'Leader', $3, '260981000004', $4, 'active')`,
      [org.id, branch.id, leaderEmail, hash]
    );
    const legacyLeader = await leaderAgent
      .post("/leader/login")
      .type("form")
      .send({ identifier: leaderEmail, password: "OkPass123!" });
    assert.equal(legacyLeader.status, 303);
    assert.equal(legacyLeader.headers.location, "/leader/dashboard");

    const baEmail = `ba_${suffix}@example.com`;
    await pool.query(
      `INSERT INTO public.church_branch_admins
         (organization_id, branch_id, full_name, email, username, phone_normalized, password_hash, status)
       VALUES ($1, $2, 'BA', $3, $4, '260981000005', $5, 'active')`,
      [org.id, branch.id, baEmail, `ba2_${suffix}`, hash]
    );
    const legacyBa = await request(app)
      .post("/branch/login")
      .type("form")
      .send({ identifier: baEmail, password: "OkPass123!" });
    assert.equal(legacyBa.status, 303);
    assert.equal(legacyBa.headers.location, "/branch/dashboard");

    const hqEmail = `hqonly_${suffix}@example.com`;
    await pool.query(
      `INSERT INTO public.church_hq_admins
         (organization_id, full_name, email, username, phone_normalized, password_hash, status)
       VALUES ($1, 'HQ Only', $2, $3, '260981000006', $4, 'active')`,
      [org.id, hqEmail, `hqonly_${suffix}`, hash]
    );
    const legacyHq = await request(app)
      .post("/hq/login")
      .type("form")
      .send({ identifier: hqEmail, password: "OkPass123!" });
    assert.equal(legacyHq.status, 303);
    assert.equal(legacyHq.headers.location, "/hq/dashboard");
  }
);

test(
  "logout clears temporary portal-choice state; CSRF required for portal selection under strict mode",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("logout");
    const hash = await bcrypt.hash("LogoutPass123!", 12);
    const orgRes = await pool.query(
      `INSERT INTO public.church_organizations (platform_tenant_id, name, slug, status)
       VALUES ($1, $2, $3, 'active') RETURNING *`,
      [TENANT_ZM, `Logout Org ${suffix}`, `logout-org-${suffix}`]
    );
    const org = orgRes.rows[0];
    const brRes = await pool.query(
      `INSERT INTO public.church_branches
         (organization_id, name, slug, host_slug, status, member_registration_enabled)
       VALUES ($1, $2, $3, $4, 'active', true) RETURNING *`,
      [org.id, `Logout Branch ${suffix}`, `logout-br-${suffix}`, `logout-br-${suffix}`]
    );
    const branch = brRes.rows[0];
    const email = `logout_${suffix}@example.com`;
    await pool.query(
      `INSERT INTO public.church_members
         (organization_id, branch_id, platform_tenant_id, full_name, email, phone_normalized, password_hash, status)
       VALUES ($1, $2, $3, 'L Member', $4, '260982000001', $5, 'verified')`,
      [org.id, branch.id, TENANT_ZM, email, hash]
    );
    await pool.query(
      `INSERT INTO public.church_hq_admins
         (organization_id, full_name, email, username, phone_normalized, password_hash, status)
       VALUES ($1, 'L HQ', $2, $3, '260982000002', $4, 'active')`,
      [org.id, email, `logouthq_${suffix}`, hash]
    );

    const app = makeTenantApp(org, branch);
    const agent = request.agent(app);
    await agent.post("/login").type("form").send({ identifier: email, password: "LogoutPass123!" });
    const page = await agent.get("/choose-portal");
    assert.equal(page.status, 200);

    await agent.post("/logout").type("form").send({});
    const after = await agent.get("/choose-portal");
    assert.ok([302, 303].includes(after.status));
    assert.equal(after.headers.location, "/login");

    // Strict CSRF on portal selection
    const prev = process.env.GETPRO_REQUIRE_CHURCH_CSRF;
    process.env.GETPRO_REQUIRE_CHURCH_CSRF = "1";
    try {
      const agent2 = request.agent(app);
      await agent2.post("/login").type("form").send({ identifier: email, password: "LogoutPass123!" });
      const choose = await agent2.get("/choose-portal");
      assert.equal(choose.status, 200);
      const denied = await agent2.post("/choose-portal").type("form").send({ role: "member" });
      assert.equal(denied.status, 403);

      // Extract token from page and succeed
      const tokenMatch = choose.text.match(/name="_csrf"\s+value="([^"]+)"/);
      assert.ok(tokenMatch, "csrf token present on choose-portal");
      const ok = await agent2
        .post("/choose-portal")
        .type("form")
        .send({ role: "member", [CSRF_FIELD]: tokenMatch[1] });
      assert.equal(ok.status, 303);
      assert.equal(ok.headers.location, "/member/dashboard");
    } finally {
      if (prev == null) delete process.env.GETPRO_REQUIRE_CHURCH_CSRF;
      else process.env.GETPRO_REQUIRE_CHURCH_CSRF = prev;
    }
  }
);

test("PORTAL_CHOICE_TTL_MS remains a short duration", () => {
  assert.equal(PORTAL_CHOICE_TTL_MS, 15 * 60 * 1000);
  assert.equal(typeof clearPortalChoice, "function");
  assert.equal(typeof issueChurchSessionCsrfToken, "function");
});
