"use strict";

const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  issuePlatformAdminCsrfToken,
  validatePlatformAdminCsrfToken,
  ensurePlatformAdminCsrfSecret,
  CSRF_FIELD,
} = require("../src/church/platformAdminCsrf");
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
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const { hashHqAdminPassword } = require("../src/church/hqAuth");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractCsrf(html) {
  const text = String(html || "");
  const m =
    text.match(new RegExp(`name="${CSRF_FIELD}"\\s+value="([^"]+)"`)) ||
    text.match(new RegExp(`name='${CSRF_FIELD}'\\s+value='([^']+)'`));
  return m ? m[1] : null;
}

function makeBlessBoardApp(role) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "platform-admin-csrf-test",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isBlessBoardApexHost = true;
    if (role) {
      req.session.adminUser = {
        id: 9201,
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
      secret: "platform-admin-csrf-admin-test",
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
  await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

test("platform admin CSRF tokens validate with timing-safe HMAC and reject garbage", () => {
  const req = { session: {} };
  const a = issuePlatformAdminCsrfToken(req);
  const b = issuePlatformAdminCsrfToken(req);
  assert.notEqual(a, b);
  assert.equal(validatePlatformAdminCsrfToken(req, a), true);
  assert.equal(validatePlatformAdminCsrfToken(req, b), true);
  assert.equal(validatePlatformAdminCsrfToken(req, "pac1.deadbeef.nope"), false);
  assert.equal(validatePlatformAdminCsrfToken(req, null), false);
  assert.equal(validatePlatformAdminCsrfToken({ session: {} }, a), false);
  assert.doesNotMatch(a, /password|session/i);
});

test("anonymous and non-super-admin remain blocked", async () => {
  const anon = makeBlessBoardApp(null);
  const anonRes = await request(anon)
    .post("/admin/churches/1/suspend")
    .set("Host", "blessboard.com")
    .type("form")
    .send({ status_reason: "x".repeat(10), _csrf: "pac1.x.y" });
  assert.ok([302, 303].includes(anonRes.status));

  const mgr = makeBlessBoardApp(ROLES.TENANT_MANAGER);
  const mgrRes = await request(mgr)
    .post("/admin/churches/1/suspend")
    .set("Host", "blessboard.com")
    .type("form")
    .send({ status_reason: "x".repeat(10), _csrf: "pac1.x.y" });
  assert.equal(mgrRes.status, 403);
});

test(
  "CSRF and audit coverage for Admin Console mutations",
  { skip: !isPgConfigured() },
  async (t) => {
    process.env.GETPRO_REQUIRE_PLATFORM_CSRF = "1";
    const pool = getPgPool();
    try {
      await pool.query("SELECT 1");
    } catch (e) {
      delete process.env.GETPRO_REQUIRE_PLATFORM_CSRF;
      t.skip(`PostgreSQL unreachable (${e.code || e.message})`);
      return;
    }

    try {
      await ensureCanonicalTenantsForTests(pool);
      await ensureChurchSchema(pool);

      const suffix = makeSuffix("csrf");
      const hash = await bcrypt.hash("superpw123456", 12);
      const superName = `csrf_sup_${suffix}`;
      const superId = await adminUsersRepo.insertUser(pool, {
        username: superName,
        passwordHash: hash,
        role: ROLES.SUPER_ADMIN,
        tenantId: null,
        displayName: "",
      });

      const orgSlug = `csrforg${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28);
      const org = await organizationsRepo.createOrganization(pool, {
        platform_tenant_id: TENANT_ZM,
        slug: orgSlug,
        name: `CSRF Org ${suffix}`,
      });
      const hostSlug = `csrfh${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28);
      const branch = await branchesRepo.createBranch(pool, {
        organization_id: org.id,
        slug: hostSlug,
        host_slug: hostSlug,
        name: `CSRF Branch ${suffix}`,
      });
      const hqHash = await hashHqAdminPassword("HqPass12345!");
      const hq1 = await hqAdminsRepo.createHqAdmin(pool, {
        organization_id: org.id,
        full_name: `HQ One ${suffix}`,
        email: `hq1_${suffix}@example.com`,
        phone: "0973000001",
        password_hash: hqHash,
      });
      const hq2 = await hqAdminsRepo.createHqAdmin(pool, {
        organization_id: org.id,
        full_name: `HQ Two ${suffix}`,
        email: `hq2_${suffix}@example.com`,
        phone: "0973000002",
        password_hash: hqHash,
      });

      const app = makeAdminApp();
      const agent = await adminLoginAgent(app, superName, "superpw123456");

      const detailGet = await agent.get(`/admin/church/organizations/${org.id}`);
      assert.equal(detailGet.status, 200);
      const tokenA = extractCsrf(detailGet.text);
      assert.ok(tokenA, "CSRF token should render on organization detail");

      const confirmGet = await agent.get(`/admin/church/organizations/${org.id}/suspend`);
      assert.equal(confirmGet.status, 200);
      const tokenB = extractCsrf(confirmGet.text);
      assert.ok(tokenB);
      // Multi-tab: both tokens remain valid under the same session secret.
      assert.notEqual(tokenA, tokenB);

      const missing = await agent
        .post(`/admin/church/organizations/${org.id}/suspend`)
        .type("form")
        .send({ status_reason: "Missing token attempt" });
      assert.equal(missing.status, 403);
      let orgRow = await organizationsRepo.findOrganizationById(pool, org.id);
      assert.equal(orgRow.status, "active");

      const invalid = await agent
        .post(`/admin/church/organizations/${org.id}/suspend`)
        .type("form")
        .send({ status_reason: "Invalid token attempt", _csrf: "pac1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" });
      assert.equal(invalid.status, 403);
      orgRow = await organizationsRepo.findOrganizationById(pool, org.id);
      assert.equal(orgRow.status, "active");

      const okSuspend = await agent
        .post(`/admin/church/organizations/${org.id}/suspend`)
        .type("form")
        .send({ status_reason: "Valid CSRF suspend", _csrf: tokenA });
      assert.equal(okSuspend.status, 302);
      orgRow = await organizationsRepo.findOrganizationById(pool, org.id);
      assert.equal(orgRow.status, "suspended");

      const suspendAudit = await pool.query(
        `SELECT action, metadata_json::text AS meta
         FROM public.church_audit_logs
         WHERE organization_id = $1 AND action = 'platform_church_organization_suspended'
         ORDER BY id DESC LIMIT 1`,
        [org.id]
      );
      assert.equal(suspendAudit.rows.length, 1);
      assert.doesNotMatch(suspendAudit.rows[0].meta || "", /password|_csrf|token|cookie/i);

      const reactivatePage = await agent.get(`/admin/church/organizations/${org.id}`);
      const tokenC = extractCsrf(reactivatePage.text);
      const okReactivate = await agent
        .post(`/admin/church/organizations/${org.id}/reactivate`)
        .type("form")
        .send({ status_reason: "Restored", _csrf: tokenC });
      assert.equal(okReactivate.status, 302);
      orgRow = await organizationsRepo.findOrganizationById(pool, org.id);
      assert.equal(orgRow.status, "active");
      const reactivateAudit = await pool.query(
        `SELECT id FROM public.church_audit_logs
         WHERE organization_id = $1 AND action = 'platform_church_organization_reactivated'`,
        [org.id]
      );
      assert.ok(reactivateAudit.rows.length >= 1);

      const branchPage = await agent.get(`/admin/church/branches/${branch.id}`);
      const branchToken = extractCsrf(branchPage.text);
      const branchSuspend = await agent
        .post(`/admin/church/branches/${branch.id}/suspend`)
        .type("form")
        .send({ status_reason: "Branch hold", _csrf: branchToken });
      assert.equal(branchSuspend.status, 302);
      const branchAudit = await pool.query(
        `SELECT id FROM public.church_audit_logs
         WHERE organization_id = $1 AND action = 'platform_church_branch_suspended'`,
        [org.id]
      );
      assert.ok(branchAudit.rows.length >= 1);

      const branchPage2 = await agent.get(`/admin/church/branches/${branch.id}`);
      const branchToken2 = extractCsrf(branchPage2.text);
      await agent
        .post(`/admin/church/branches/${branch.id}/reactivate`)
        .type("form")
        .send({ status_reason: "Branch open", _csrf: branchToken2 })
        .expect(302);

      const hqDeactivatePage = await agent.get(
        `/admin/church/organizations/${org.id}/hq-admins/${hq2.id}/deactivate`
      );
      const hqToken = extractCsrf(hqDeactivatePage.text);
      const hqDeactivate = await agent
        .post(`/admin/church/organizations/${org.id}/hq-admins/${hq2.id}/deactivate`)
        .type("form")
        .send({ status_reason: "Admin left", _csrf: hqToken });
      assert.equal(hqDeactivate.status, 302);
      const hqOff = await hqAdminsRepo.findHqAdminById(pool, hq2.id);
      assert.equal(hqOff.status, "inactive");
      const hqAudit = await pool.query(
        `SELECT metadata_json::text AS meta FROM public.church_audit_logs
         WHERE organization_id = $1 AND action = 'platform_church_hq_admin_deactivated'
           AND entity_id = $2
         ORDER BY id DESC LIMIT 1`,
        [org.id, hq2.id]
      );
      assert.equal(hqAudit.rows.length, 1);
      assert.doesNotMatch(hqAudit.rows[0].meta || "", /password|_csrf|HqPass/i);

      const hqDetail = await agent.get(`/admin/church/organizations/${org.id}/hq-admins/${hq2.id}`);
      const hqActToken = extractCsrf(hqDetail.text);
      await agent
        .post(`/admin/church/organizations/${org.id}/hq-admins/${hq2.id}/activate`)
        .type("form")
        .send({ _csrf: hqActToken })
        .expect(302);
      const hqOn = await hqAdminsRepo.findHqAdminById(pool, hq2.id);
      assert.equal(hqOn.status, "active");

      const editPage = await agent.get(`/admin/church/organizations/${org.id}/edit`);
      assert.equal(editPage.status, 200);
      assert.ok(extractCsrf(editPage.text));

      // Tab A token still usable after later pages issued new tokens.
      assert.equal(
        validatePlatformAdminCsrfToken(
          { session: { [require("../src/church/platformAdminCsrf").SESSION_SECRET_KEY]: "x" } },
          tokenA
        ),
        false
      );

      await cleanupOrg(pool, org.id);
      await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
    } finally {
      delete process.env.GETPRO_REQUIRE_PLATFORM_CSRF;
    }
  }
);

test("publish token field name remains distinct from CSRF field", () => {
  assert.notEqual(CSRF_FIELD, "_publish_token");
  const req = { session: {} };
  ensurePlatformAdminCsrfSecret(req);
  assert.ok(req.session.platformAdminCsrfSecret);
  assert.equal(req.session.hqBroadcastPublishToken, undefined);
});

test("requirePlatformAdminCsrf rejects missing/invalid tokens in strict mode without mutating handlers", async () => {
  const {
    requirePlatformAdminCsrf,
    requirePlatformAdminCsrfOnMutations,
    issuePlatformAdminCsrfToken,
  } = require("../src/church/platformAdminCsrf");

  process.env.GETPRO_REQUIRE_PLATFORM_CSRF = "1";
  try {
    const req = { method: "POST", session: {}, body: {} };
    const token = issuePlatformAdminCsrfToken(req);
    let nextCalled = false;
    let statusCode = null;
    let bodyText = null;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      type() {
        return this;
      },
      send(text) {
        bodyText = text;
        return this;
      },
    };

    await new Promise((resolve) => {
      requirePlatformAdminCsrf(req, res, () => {
        nextCalled = true;
        resolve();
      });
      if (!nextCalled) resolve();
    });
    assert.equal(nextCalled, false);
    assert.equal(statusCode, 403);
    assert.match(String(bodyText), /Invalid or missing form token/i);
    assert.doesNotMatch(String(bodyText), /stack|hmac|secret|session/i);

    statusCode = null;
    bodyText = null;
    nextCalled = false;
    req.body = { _csrf: "pac1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" };
    await new Promise((resolve) => {
      requirePlatformAdminCsrf(req, res, () => {
        nextCalled = true;
        resolve();
      });
      if (!nextCalled) resolve();
    });
    assert.equal(nextCalled, false);
    assert.equal(statusCode, 403);

    nextCalled = false;
    req.body = { _csrf: token };
    await new Promise((resolve) => {
      requirePlatformAdminCsrf(req, res, () => {
        nextCalled = true;
        resolve();
      });
    });
    assert.equal(nextCalled, true);

    nextCalled = false;
    const getReq = { method: "GET", session: req.session, body: {} };
    await new Promise((resolve) => {
      requirePlatformAdminCsrfOnMutations(getReq, res, () => {
        nextCalled = true;
        resolve();
      });
    });
    assert.equal(nextCalled, true);
  } finally {
    delete process.env.GETPRO_REQUIRE_PLATFORM_CSRF;
  }
});

test(
  "Admin Console GET routes remain reachable for authenticated super-admin",
  { skip: !isPgConfigured() },
  async (t) => {
    const pool = getPgPool();
    try {
      await pool.query("SELECT 1");
    } catch (e) {
      t.skip(`PostgreSQL unreachable (${e.code || e.message})`);
      return;
    }
    const app = makeBlessBoardApp(ROLES.SUPER_ADMIN);
    const dash = await request(app).get("/admin/dashboard").set("Host", "blessboard.com");
    assert.ok([200, 302, 303].includes(dash.status));
    if (dash.status === 200) {
      assert.doesNotMatch(dash.text, /password_hash/i);
    }
  }
);
