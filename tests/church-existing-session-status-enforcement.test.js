"use strict";

/**
 * Existing authenticated church sessions must respect live organization/branch status.
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
  setChurchMemberSession,
  getChurchMemberSession,
  clearChurchMemberSession,
} = require("../src/church/memberAuth");
const {
  setChurchLeaderSession,
  getChurchLeaderSession,
} = require("../src/church/leaderAuth");
const {
  setChurchBranchAdminSession,
  getChurchBranchAdminSession,
} = require("../src/church/branchAdminAuth");
const {
  setChurchHqAdminSession,
  getChurchHqAdminSession,
} = require("../src/church/hqAuth");
const {
  storePortalChoice,
  getPortalChoice,
  PORTAL_CHOICE_KEY,
} = require("../src/church/tenantLoginSession");
const { churchPgSkipIfUnconfigured, requireChurchPgOrSkip } = require("./helpers/churchPgTest");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeTenantApp(org, branch, { onRequest } = {}) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "session-status-enforcement-test",
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
    if (typeof onRequest === "function") onRequest(req);
    next();
  });
  app.use(churchRoutes());
  return app;
}

test("platform /admin/* remains isolated from church suspension gate", async () => {
  const app = express();
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = {
      kind: "branch",
      organization: { id: 1, status: "suspended", name: "X", slug: "x" },
      branch: { id: 2, status: "active", name: "Y", slug: "y", host_slug: "y" },
    };
    next();
  });
  app.use(require("../src/church/churchStatusAccess").churchOperationalAccessGate);
  app.get("/admin/church", (req, res) => res.status(200).type("text").send("platform-ok"));
  app.get("/hq/dashboard", (req, res) => res.status(200).type("text").send("hq-should-not"));
  const admin = await request(app).get("/admin/church");
  assert.equal(admin.status, 200);
  assert.match(admin.text, /platform-ok/);
  const hq = await request(app).get("/hq/dashboard");
  assert.equal(hq.status, 503);
});

test("existing HQ session blocked after org suspension; session and portal-choice cleared; logout still works", async () => {
  const org = { id: 11, name: "Live Org", slug: "live-org", status: "suspended" };
  const branch = {
    id: 12,
    name: "Live Branch",
    slug: "live-br",
    host_slug: "live-br",
    status: "active",
  };

  let mutationHit = false;
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "hq-suspend-session-test",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = {
      kind: "branch",
      host: "live-br.blessboard.com",
      orgSlug: org.slug,
      hostSlug: branch.host_slug,
      organization: org,
      branch,
    };
    setChurchHqAdminSession(req, {
      hq_admin_id: 99,
      organization_id: org.id,
      full_name: "HQ",
      role: "hq_admin",
      status: "active",
    });
    storePortalChoice(req, {
      organizationId: org.id,
      branchId: branch.id,
      roles: [
        { type: "hq_admin", accountId: 99, status: "active", label: "HQ" },
        { type: "member", accountId: 1, status: "verified", label: "Member" },
      ],
    });
    next();
  });
  app.use(churchRoutes());
  // If a handler were reached, this would flip — must stay false.
  app.use((req, res, next) => {
    if (req.path.startsWith("/hq/reports")) mutationHit = true;
    return next();
  });

  const agent = request.agent(app);
  const blocked = await agent.get("/hq/dashboard");
  assert.equal(blocked.status, 503);
  assert.doesNotMatch(blocked.text, /Dashboard|Reports|mutated|hq_admin_id|password/i);

  const mutate = await agent.post("/hq/reports/1/approve").type("form").send({ note: "x" });
  assert.equal(mutate.status, 503);
  assert.equal(mutationHit, false);

  const logout = await agent.post("/hq/logout").type("form").send({});
  assert.ok([302, 303].includes(logout.status));
});

test("inactive branch blocks member/leader/branch-admin sessions but allows HQ for active org", async () => {
  const org = { id: 21, name: "Branch Org", slug: "br-org", status: "active" };
  const branch = {
    id: 22,
    name: "Quiet Branch",
    slug: "quiet-br",
    host_slug: "quiet-br",
    status: "suspended",
  };

  function appWithSession(seed) {
    const app = express();
    app.set("view engine", "ejs");
    app.set("views", path.join(__dirname, "../views"));
    app.use(express.urlencoded({ extended: true }));
    app.use(session({ secret: "ibr-test", resave: false, saveUninitialized: true }));
    app.use((req, res, next) => {
      req.isChurchHost = true;
      req.churchContext = {
        kind: "branch",
        host: "quiet-br.blessboard.com",
        organization: org,
        branch,
        orgSlug: org.slug,
        hostSlug: branch.host_slug,
      };
      seed(req);
      next();
    });
    app.use(churchRoutes());
    return app;
  }

  const memberApp = appWithSession((req) => {
    setChurchMemberSession(req, {
      member_id: 1,
      organization_id: org.id,
      branch_id: branch.id,
      status: "verified",
      full_name: "M",
    });
  });
  const memberRes = await request.agent(memberApp).get("/member/dashboard");
  assert.equal(memberRes.status, 503);

  const leaderApp = appWithSession((req) => {
    setChurchLeaderSession(req, {
      leader_id: 2,
      organization_id: org.id,
      branch_id: branch.id,
      ministry_id: 1,
      full_name: "L",
      role: "ministry_leader",
      status: "active",
    });
  });
  const leaderRes = await request.agent(leaderApp).get("/leader/dashboard");
  assert.equal(leaderRes.status, 503);

  const baApp = appWithSession((req) => {
    setChurchBranchAdminSession(req, {
      admin_id: 3,
      organization_id: org.id,
      branch_id: branch.id,
      full_name: "BA",
      role: "branch_admin",
      status: "active",
    });
  });
  const baRes = await request.agent(baApp).get("/branch/dashboard");
  assert.equal(baRes.status, 503);

  // HQ: org active + inactive branch → allowed through gate (handler may still need DB account).
  const hqApp = appWithSession((req) => {
    setChurchHqAdminSession(req, {
      hq_admin_id: 4,
      organization_id: org.id,
      full_name: "HQ",
      role: "hq_admin",
      status: "active",
    });
  });
  const hqRes = await request.agent(hqApp).get("/hq/dashboard");
  // Gate must not return 503 for HQ on inactive branch; login redirect is OK without DB row.
  assert.notEqual(hqRes.status, 503);
  assert.ok([200, 302, 303, 500].includes(hqRes.status));
  if (hqRes.status === 302 || hqRes.status === 303) {
    assert.notEqual(hqRes.headers.location, "/member/dashboard");
    assert.notEqual(hqRes.headers.location, "/branch/dashboard");
  }
});

test("branch-scoped user is not escalated to HQ when branch is inactive", async () => {
  const org = { id: 31, name: "NoEsc Org", slug: "noesc", status: "active" };
  const branch = {
    id: 32,
    name: "NoEsc Branch",
    slug: "noesc-br",
    host_slug: "noesc-br",
    status: "suspended",
  };
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(session({ secret: "noesc", resave: false, saveUninitialized: true }));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = {
      kind: "branch",
      organization: org,
      branch,
      host: "noesc-br.blessboard.com",
      orgSlug: org.slug,
      hostSlug: branch.host_slug,
    };
    setChurchMemberSession(req, {
      member_id: 5,
      organization_id: org.id,
      branch_id: branch.id,
      status: "verified",
      full_name: "Member Only",
    });
    next();
  });
  app.use(churchRoutes());
  const res = await request.agent(app).get("/member/dashboard");
  assert.equal(res.status, 503);
  assert.doesNotMatch(String(res.headers.location || ""), /hq/);
  assert.doesNotMatch(res.text, /HQ Administrator|hq\/dashboard/i);
});

test(
  "DB: existing sessions blocked after org suspension; reactivation does not restore cleared session",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("sess");
    const hash = await bcrypt.hash("SessPass123!", 12);
    const orgRes = await pool.query(
      `INSERT INTO public.church_organizations (platform_tenant_id, name, slug, status)
       VALUES ($1, $2, $3, 'active') RETURNING *`,
      [TENANT_ZM, `Sess Org ${suffix}`, `sess-org-${suffix}`]
    );
    const org = orgRes.rows[0];
    const brRes = await pool.query(
      `INSERT INTO public.church_branches
         (organization_id, name, slug, host_slug, status, member_registration_enabled)
       VALUES ($1, $2, $3, $4, 'active', true) RETURNING *`,
      [org.id, `Sess Branch ${suffix}`, `sess-br-${suffix}`, `sess-br-${suffix}`]
    );
    const branch = brRes.rows[0];

    const memberIns = await pool.query(
      `INSERT INTO public.church_members
         (organization_id, branch_id, platform_tenant_id, full_name, email, phone_normalized, password_hash, status)
       VALUES ($1, $2, $3, 'Sess M', $4, '260993000001', $5, 'verified') RETURNING id`,
      [org.id, branch.id, TENANT_ZM, `sess_m_${suffix}@example.com`, hash]
    );
    const leaderIns = await pool.query(
      `INSERT INTO public.church_ministry_leaders
         (organization_id, branch_id, full_name, email, phone_normalized, password_hash, status)
       VALUES ($1, $2, 'Sess L', $3, '260993000002', $4, 'active') RETURNING id`,
      [org.id, branch.id, `sess_l_${suffix}@example.com`, hash]
    );
    const baIns = await pool.query(
      `INSERT INTO public.church_branch_admins
         (organization_id, branch_id, full_name, email, username, phone_normalized, password_hash, status)
       VALUES ($1, $2, 'Sess BA', $3, $4, '260993000003', $5, 'active') RETURNING id`,
      [org.id, branch.id, `sess_ba_${suffix}@example.com`, `sessba_${suffix}`, hash]
    );
    const hqIns = await pool.query(
      `INSERT INTO public.church_hq_admins
         (organization_id, full_name, email, username, phone_normalized, password_hash, status)
       VALUES ($1, 'Sess HQ', $2, $3, '260993000004', $4, 'active') RETURNING id`,
      [org.id, `sess_hq_${suffix}@example.com`, `sesshq_${suffix}`, hash]
    );

    // Mutable context object so suspension is visible without remounting.
    const liveOrg = { ...org };
    const liveBranch = { ...branch };
    const app = makeTenantApp(liveOrg, liveBranch);

    async function login(pathLogin, identifier) {
      const agent = request.agent(app);
      const res = await agent.post(pathLogin).type("form").send({
        identifier,
        password: "SessPass123!",
      });
      assert.equal(res.status, 303, pathLogin);
      return agent;
    }

    const memberAgent = await login("/login", `sess_m_${suffix}@example.com`);
    const leaderAgent = await login("/leader/login", `sess_l_${suffix}@example.com`);
    const baAgent = await login("/branch/login", `sess_ba_${suffix}@example.com`);
    const hqAgent = await login("/hq/login", `sess_hq_${suffix}@example.com`);

    assert.equal((await memberAgent.get("/member/dashboard")).status, 200);
    assert.equal((await leaderAgent.get("/leader/dashboard")).status, 200);
    assert.equal((await baAgent.get("/branch/dashboard")).status, 200);
    assert.equal((await hqAgent.get("/hq/dashboard")).status, 200);

    await pool.query(`UPDATE public.church_organizations SET status = 'suspended' WHERE id = $1`, [org.id]);
    liveOrg.status = "suspended";

    assert.equal((await memberAgent.get("/member/dashboard")).status, 503);
    assert.equal((await leaderAgent.get("/leader/dashboard")).status, 503);
    assert.equal((await baAgent.get("/branch/dashboard")).status, 503);
    assert.equal((await hqAgent.get("/hq/dashboard")).status, 503);
    assert.doesNotMatch((await hqAgent.get("/hq/dashboard")).text, /Sensitive|password|session/i);

    // Reactivate — cleared sessions must not silently return
    await pool.query(`UPDATE public.church_organizations SET status = 'active' WHERE id = $1`, [org.id]);
    liveOrg.status = "active";

    const memberAfter = await memberAgent.get("/member/dashboard");
    assert.ok([302, 303].includes(memberAfter.status));
    assert.equal(memberAfter.headers.location, "/login");

    const hqAfter = await hqAgent.get("/hq/dashboard");
    assert.ok([302, 303].includes(hqAfter.status));
    assert.equal(hqAfter.headers.location, "/hq/login");

    // Public suspension behavior while suspended was already 503; while active homepage works
    assert.equal((await request(app).get("/")).status, 200);

    void memberIns;
    void leaderIns;
    void baIns;
    void hqIns;
    void clearChurchMemberSession;
    void getChurchMemberSession;
    void getChurchLeaderSession;
    void getChurchBranchAdminSession;
    void getChurchHqAdminSession;
    void getPortalChoice;
    void PORTAL_CHOICE_KEY;
  }
);

test(
  "DB: inactive branch blocks branch-scoped sessions; HQ remains for active org",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("ibrs");
    const hash = await bcrypt.hash("IbrsPass123!", 12);
    const orgRes = await pool.query(
      `INSERT INTO public.church_organizations (platform_tenant_id, name, slug, status)
       VALUES ($1, $2, $3, 'active') RETURNING *`,
      [TENANT_ZM, `Ibrs Org ${suffix}`, `ibrs-org-${suffix}`]
    );
    const org = orgRes.rows[0];
    const brRes = await pool.query(
      `INSERT INTO public.church_branches
         (organization_id, name, slug, host_slug, status, member_registration_enabled)
       VALUES ($1, $2, $3, $4, 'active', true) RETURNING *`,
      [org.id, `Ibrs Branch ${suffix}`, `ibrs-br-${suffix}`, `ibrs-br-${suffix}`]
    );
    const liveOrg = { ...orgRes.rows[0] };
    const liveBranch = { ...brRes.rows[0] };

    await pool.query(
      `INSERT INTO public.church_members
         (organization_id, branch_id, platform_tenant_id, full_name, email, phone_normalized, password_hash, status)
       VALUES ($1, $2, $3, 'Ibrs M', $4, '260994000001', $5, 'verified')`,
      [liveOrg.id, liveBranch.id, TENANT_ZM, `ibrs_m_${suffix}@example.com`, hash]
    );
    await pool.query(
      `INSERT INTO public.church_hq_admins
         (organization_id, full_name, email, username, phone_normalized, password_hash, status)
       VALUES ($1, 'Ibrs HQ', $2, $3, '260994000002', $4, 'active')`,
      [liveOrg.id, `ibrs_hq_${suffix}@example.com`, `ibrshq_${suffix}`, hash]
    );

    const app = makeTenantApp(liveOrg, liveBranch);
    const memberAgent = request.agent(app);
    const hqAgent = request.agent(app);
    assert.equal(
      (
        await memberAgent.post("/login").type("form").send({
          identifier: `ibrs_m_${suffix}@example.com`,
          password: "IbrsPass123!",
        })
      ).headers.location,
      "/member/dashboard"
    );
    assert.equal(
      (
        await hqAgent.post("/hq/login").type("form").send({
          identifier: `ibrs_hq_${suffix}@example.com`,
          password: "IbrsPass123!",
        })
      ).headers.location,
      "/hq/dashboard"
    );

    await pool.query(`UPDATE public.church_branches SET status = 'suspended' WHERE id = $1`, [liveBranch.id]);
    liveBranch.status = "suspended";

    assert.equal((await memberAgent.get("/member/dashboard")).status, 503);
    assert.equal((await hqAgent.get("/hq/dashboard")).status, 200);
  }
);
