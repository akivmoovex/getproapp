"use strict";

/**
 * Suspended-organization and inactive-branch rules for unified tenant login.
 * Route availability must never escalate role authority.
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
  ORG_UNAVAILABLE_MESSAGE,
} = require("../src/services/church/tenantUnifiedLoginService");
const {
  getPortalChoice,
  PORTAL_CHOICE_KEY,
} = require("../src/church/tenantLoginSession");
const { getChurchHqAdminSession } = require("../src/church/hqAuth");
const { getChurchMemberSession } = require("../src/church/memberAuth");
const { churchPgSkipIfUnconfigured, requireChurchPgOrSkip } = require("./helpers/churchPgTest");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeTenantApp(org, branch) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "suspended-org-login-test",
      resave: false,
      saveUninitialized: true,
      name: "getpro_sid",
    })
  );
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

test("platform /admin/login remains a dedicated entry (unaffected by tenant suspension)", async () => {
  const app = express();
  app.get("/admin/login", (req, res) => res.status(200).type("text").send("platform-admin-login"));
  const res = await request(app).get("/admin/login");
  assert.equal(res.status, 200);
  assert.match(res.text, /platform-admin-login/);
});

test("suspended organization GET /hq/login shows unavailable (no auto HQ form)", async () => {
  const org = { id: 1, name: "Susp Org", slug: "susp-org", status: "suspended" };
  const branch = {
    id: 2,
    name: "Susp Branch",
    slug: "susp-br",
    host_slug: "susp-br",
    status: "active",
    member_registration_enabled: true,
  };
  const app = makeTenantApp(org, branch);
  const hq = await request(app).get("/hq/login");
  assert.equal(hq.status, 503);
  assert.doesNotMatch(hq.text, /data-unified-login="1"/);
  assert.doesNotMatch(hq.text, /Choose a portal/i);
});

test(
  "suspended organization rejects all tenant roles and never creates portal choice or sessions",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("susp");
    const hash = await bcrypt.hash("SuspPass123!", 12);
    const orgRes = await pool.query(
      `INSERT INTO public.church_organizations (platform_tenant_id, name, slug, status)
       VALUES ($1, $2, $3, 'suspended') RETURNING *`,
      [TENANT_ZM, `Susp Org ${suffix}`, `susp-org-${suffix}`]
    );
    const org = orgRes.rows[0];
    const brRes = await pool.query(
      `INSERT INTO public.church_branches
         (organization_id, name, slug, host_slug, status, member_registration_enabled)
       VALUES ($1, $2, $3, $4, 'active', true) RETURNING *`,
      [org.id, `Susp Branch ${suffix}`, `susp-br-${suffix}`, `susp-br-${suffix}`]
    );
    const branch = brRes.rows[0];
    const shared = `shared_${suffix}@example.com`;

    await pool.query(
      `INSERT INTO public.church_members
         (organization_id, branch_id, platform_tenant_id, full_name, email, phone_normalized, password_hash, status)
       VALUES ($1, $2, $3, 'M', $4, '260990000001', $5, 'verified')`,
      [org.id, branch.id, TENANT_ZM, `member_${suffix}@example.com`, hash]
    );
    await pool.query(
      `INSERT INTO public.church_ministry_leaders
         (organization_id, branch_id, full_name, email, phone_normalized, password_hash, status)
       VALUES ($1, $2, 'L', $3, '260990000002', $4, 'active')`,
      [org.id, branch.id, `leader_${suffix}@example.com`, hash]
    );
    await pool.query(
      `INSERT INTO public.church_branch_admins
         (organization_id, branch_id, full_name, email, username, phone_normalized, password_hash, status)
       VALUES ($1, $2, 'BA', $3, $4, '260990000003', $5, 'active')`,
      [org.id, branch.id, `ba_${suffix}@example.com`, `ba_${suffix}`, hash]
    );
    await pool.query(
      `INSERT INTO public.church_hq_admins
         (organization_id, full_name, email, username, phone_normalized, password_hash, status)
       VALUES ($1, 'HQ', $2, $3, '260990000004', $4, 'active')`,
      [org.id, `hq_${suffix}@example.com`, `hq_${suffix}`, hash]
    );
    // Multi-role identity
    await pool.query(
      `INSERT INTO public.church_members
         (organization_id, branch_id, platform_tenant_id, full_name, email, phone_normalized, password_hash, status)
       VALUES ($1, $2, $3, 'Multi M', $4, '260990000005', $5, 'verified')`,
      [org.id, branch.id, TENANT_ZM, shared, hash]
    );
    await pool.query(
      `INSERT INTO public.church_hq_admins
         (organization_id, full_name, email, username, phone_normalized, password_hash, status)
       VALUES ($1, 'Multi HQ', $2, $3, '260990000006', $4, 'active')`,
      [org.id, shared, `multihq_${suffix}`, hash]
    );

    const app = makeTenantApp(org, branch);
    const cases = [
      [`member_${suffix}@example.com`, "/login"],
      [`leader_${suffix}@example.com`, "/leader/login"],
      [`ba_${suffix}@example.com`, "/branch/login"],
      [`hq_${suffix}@example.com`, "/hq/login"],
      [shared, "/hq/login"],
      [shared, "/login"],
    ];

    for (const [identifier, route] of cases) {
      const agent = request.agent(app);
      const res = await agent.post(route).type("form").send({ identifier, password: "SuspPass123!" });
      assert.equal(res.status, 503, `${route} for ${identifier}`);
      assert.doesNotMatch(String(res.headers.location || ""), /dashboard|choose-portal/i);
      assert.doesNotMatch(res.text, /Choose a portal|HQ Administrator|data-unified-login/i);
      // No role session cookies implying success redirects
      assert.notEqual(res.headers.location, "/hq/dashboard");
      assert.notEqual(res.headers.location, "/choose-portal");
    }

    const svc = await authenticateTenantUnifiedLogin(
      pool,
      { ip: "127.0.0.1", get: () => "", body: {} },
      { organization: org, branch, identifier: shared, password: "SuspPass123!" }
    );
    assert.equal(svc.ok, false);
    assert.equal(svc.orgUnavailable, true);
    assert.equal(svc.needsPortalChoice, undefined);
    assert.match(svc.error, /unavailable/i);
    assert.match(ORG_UNAVAILABLE_MESSAGE, /unavailable/i);
  }
);

test(
  "organization suspended after credential verification clears portal choice and rejects selection",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("mid");
    const hash = await bcrypt.hash("MidPass123!", 12);
    const orgRes = await pool.query(
      `INSERT INTO public.church_organizations (platform_tenant_id, name, slug, status)
       VALUES ($1, $2, $3, 'active') RETURNING *`,
      [TENANT_ZM, `Mid Org ${suffix}`, `mid-org-${suffix}`]
    );
    const org = orgRes.rows[0];
    const brRes = await pool.query(
      `INSERT INTO public.church_branches
         (organization_id, name, slug, host_slug, status, member_registration_enabled)
       VALUES ($1, $2, $3, $4, 'active', true) RETURNING *`,
      [org.id, `Mid Branch ${suffix}`, `mid-br-${suffix}`, `mid-br-${suffix}`]
    );
    const branch = brRes.rows[0];
    const email = `mid_${suffix}@example.com`;

    await pool.query(
      `INSERT INTO public.church_members
         (organization_id, branch_id, platform_tenant_id, full_name, email, phone_normalized, password_hash, status)
       VALUES ($1, $2, $3, 'Mid M', $4, '260991000001', $5, 'verified')`,
      [org.id, branch.id, TENANT_ZM, email, hash]
    );
    await pool.query(
      `INSERT INTO public.church_hq_admins
         (organization_id, full_name, email, username, phone_normalized, password_hash, status)
       VALUES ($1, 'Mid HQ', $2, $3, '260991000002', $4, 'active')`,
      [org.id, email, `midhq_${suffix}`, hash]
    );

    // App context stays "active" while DB status changes — simulates mid-flight suspension.
    const app = makeTenantApp({ ...org, status: "active" }, branch);
    const agent = request.agent(app);
    const login = await agent.post("/login").type("form").send({ identifier: email, password: "MidPass123!" });
    assert.equal(login.status, 303);
    assert.equal(login.headers.location, "/choose-portal");

    await pool.query(`UPDATE public.church_organizations SET status = 'suspended' WHERE id = $1`, [org.id]);

    const chooseGet = await agent.get("/choose-portal");
    assert.equal(chooseGet.status, 503);

    const choosePost = await agent.post("/choose-portal").type("form").send({ role: "hq_admin" });
    assert.equal(choosePost.status, 503);
    assert.doesNotMatch(String(choosePost.headers.location || ""), /dashboard/);

    // Temporary state must not survive rejection (next choose-portal with restored org still needs re-login)
    await pool.query(`UPDATE public.church_organizations SET status = 'active' WHERE id = $1`, [org.id]);
    const after = await agent.get("/choose-portal");
    assert.ok([302, 303].includes(after.status));
    assert.equal(after.headers.location, "/login");
  }
);

test(
  "inactive branch does not escalate member/leader/branch-admin to HQ; HQ-only still allowed when org active",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("ibr");
    const hash = await bcrypt.hash("IbrPass123!", 12);
    const orgRes = await pool.query(
      `INSERT INTO public.church_organizations (platform_tenant_id, name, slug, status)
       VALUES ($1, $2, $3, 'active') RETURNING *`,
      [TENANT_ZM, `Ibr Org ${suffix}`, `ibr-org-${suffix}`]
    );
    const org = orgRes.rows[0];
    const brRes = await pool.query(
      `INSERT INTO public.church_branches
         (organization_id, name, slug, host_slug, status, member_registration_enabled)
       VALUES ($1, $2, $3, $4, 'suspended', true) RETURNING *`,
      [org.id, `Ibr Branch ${suffix}`, `ibr-br-${suffix}`, `ibr-br-${suffix}`]
    );
    const branch = brRes.rows[0];
    const multi = `ibr_multi_${suffix}@example.com`;

    await pool.query(
      `INSERT INTO public.church_members
         (organization_id, branch_id, platform_tenant_id, full_name, email, phone_normalized, password_hash, status)
       VALUES ($1, $2, $3, 'Ibr M', $4, '260992000001', $5, 'verified')`,
      [org.id, branch.id, TENANT_ZM, `ibr_m_${suffix}@example.com`, hash]
    );
    await pool.query(
      `INSERT INTO public.church_ministry_leaders
         (organization_id, branch_id, full_name, email, phone_normalized, password_hash, status)
       VALUES ($1, $2, 'Ibr L', $3, '260992000002', $4, 'active')`,
      [org.id, branch.id, `ibr_l_${suffix}@example.com`, hash]
    );
    await pool.query(
      `INSERT INTO public.church_branch_admins
         (organization_id, branch_id, full_name, email, username, phone_normalized, password_hash, status)
       VALUES ($1, $2, 'Ibr BA', $3, $4, '260992000003', $5, 'active')`,
      [org.id, branch.id, `ibr_ba_${suffix}@example.com`, `ibrba_${suffix}`, hash]
    );
    await pool.query(
      `INSERT INTO public.church_hq_admins
         (organization_id, full_name, email, username, phone_normalized, password_hash, status)
       VALUES ($1, 'Ibr HQ', $2, $3, '260992000004', $4, 'active')`,
      [org.id, `ibr_hq_${suffix}@example.com`, `ibrhq_${suffix}`, hash]
    );
    // Multi-role: member + HQ on inactive branch host
    await pool.query(
      `INSERT INTO public.church_members
         (organization_id, branch_id, platform_tenant_id, full_name, email, phone_normalized, password_hash, status)
       VALUES ($1, $2, $3, 'Ibr Multi M', $4, '260992000005', $5, 'verified')`,
      [org.id, branch.id, TENANT_ZM, multi, hash]
    );
    await pool.query(
      `INSERT INTO public.church_hq_admins
         (organization_id, full_name, email, username, phone_normalized, password_hash, status)
       VALUES ($1, 'Ibr Multi HQ', $2, $3, '260992000006', $4, 'active')`,
      [org.id, multi, `ibrmulti_${suffix}`, hash]
    );

    // Documented branch rule:
    // - Member / leader / branch-admin require an active branch → rejected (or unavailable via gate).
    // - HQ requires active org + branch belonging to org; inactive branch does NOT block HQ.
    // - Multi-role member+HQ on inactive branch → only HQ remains valid (assignment filter),
    //   not because /hq/* is reachable.
    const app = makeTenantApp(org, branch);

    const memberBlocked = await request(app)
      .post("/hq/login")
      .type("form")
      .send({ identifier: `ibr_m_${suffix}@example.com`, password: "IbrPass123!" });
    assert.equal(memberBlocked.status, 400);
    assert.doesNotMatch(String(memberBlocked.headers.location || ""), /hq\/dashboard/);

    const leaderBlocked = await request(app)
      .post("/hq/login")
      .type("form")
      .send({ identifier: `ibr_l_${suffix}@example.com`, password: "IbrPass123!" });
    assert.equal(leaderBlocked.status, 400);

    const baBlocked = await request(app)
      .post("/hq/login")
      .type("form")
      .send({ identifier: `ibr_ba_${suffix}@example.com`, password: "IbrPass123!" });
    assert.equal(baBlocked.status, 400);

    const hqOk = await request(app)
      .post("/hq/login")
      .type("form")
      .send({ identifier: `ibr_hq_${suffix}@example.com`, password: "IbrPass123!" });
    assert.equal(hqOk.status, 303);
    assert.equal(hqOk.headers.location, "/hq/dashboard");

    const multiSvc = await authenticateTenantUnifiedLogin(
      pool,
      { ip: "127.0.0.1", get: () => "", body: {} },
      { organization: org, branch, identifier: multi, password: "IbrPass123!" }
    );
    assert.equal(multiSvc.ok, true);
    assert.equal(multiSvc.needsPortalChoice, false);
    assert.equal(multiSvc.primaryRole.type, "hq_admin");
    assert.equal(multiSvc.roles.length, 1);
    assert.equal(multiSvc.roles[0].type, "hq_admin");

    const multiLogin = await request(app)
      .post("/hq/login")
      .type("form")
      .send({ identifier: multi, password: "IbrPass123!" });
    assert.equal(multiLogin.status, 303);
    assert.equal(multiLogin.headers.location, "/hq/dashboard");
    assert.notEqual(multiLogin.headers.location, "/choose-portal");
  }
);

test("error for suspended org remains non-enumerating (no role list)", async () => {
  const org = { id: 9, name: "Enum Org", slug: "enum-org", status: "suspended" };
  const branch = {
    id: 10,
    name: "Enum Branch",
    slug: "enum-br",
    host_slug: "enum-br",
    status: "active",
  };
  const app = makeTenantApp(org, branch);
  const res = await request(app).get("/hq/login");
  assert.equal(res.status, 503);
  assert.doesNotMatch(res.text, /hq_admin|ministry_leader|branch_admin|candidate|Choose a portal/i);
  assert.ok(typeof getPortalChoice === "function");
  assert.ok(typeof getChurchHqAdminSession === "function");
  assert.ok(typeof getChurchMemberSession === "function");
  assert.ok(PORTAL_CHOICE_KEY);
});
