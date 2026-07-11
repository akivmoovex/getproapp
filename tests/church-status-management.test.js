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
const {
  validateSuspendBody,
  assertCanArchiveOrganization,
  assertCanReactivateOrganization,
} = require("../src/church/platformStatusValidation");
const { getChurchAccessBlock, getHqStatusBanner } = require("../src/church/churchStatusAccess");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");

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
      secret: "church-status-test",
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

function makeChurchApp(ctx) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "church-status-login-test",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = ctx;
    next();
  });
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

function branchContext(org, branch, overrides) {
  return {
    kind: "branch",
    host: "test.church.local",
    orgSlug: branch.host_slug || branch.slug,
    hostSlug: branch.host_slug || branch.slug,
    organization: org,
    branch,
    ...(overrides || {}),
  };
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

test("suspend without reason is rejected", () => {
  const result = validateSuspendBody({});
  assert.equal(result.ok, false);
});

test("active organization cannot archive directly", () => {
  const result = assertCanArchiveOrganization({ status: "active" });
  assert.equal(result.ok, false);
});

test("archived organization cannot reactivate", () => {
  const result = assertCanReactivateOrganization({ status: "archived" });
  assert.equal(result.ok, false);
});

test("suspended organization blocks public access in access helper", () => {
  const block = getChurchAccessBlock({
    kind: "branch",
    organization: { status: "suspended" },
    branch: { status: "active", name: "Main" },
  });
  assert.equal(block.code, "organization");
});

test("suspended branch blocks access when organization active", () => {
  const block = getChurchAccessBlock({
    kind: "branch",
    organization: { status: "active" },
    branch: { status: "suspended", name: "North" },
  });
  assert.equal(block.code, "branch");
});

test("HQ banner shown when organization suspended", () => {
  const banner = getHqStatusBanner({
    kind: "branch",
    organization: { status: "suspended", name: "Union" },
    branch: { status: "active", name: "Kafue" },
  });
  assert.ok(banner && banner.banners.length >= 1);
});

test("tenant manager cannot suspend organization", async () => {
  if (!isPgConfigured()) return;
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  const suffix = makeSuffix("stsmgr");
  const hash = await bcrypt.hash("pw12345678", 12);
  const username = `sts_mgr_${suffix}`;
  const userId = await adminUsersRepo.insertUser(pool, {
    username,
    passwordHash: hash,
    role: ROLES.TENANT_MANAGER,
    tenantId: TENANT_ZM,
    displayName: "",
  });
  const org = await organizationsRepo.createOrganization(pool, {
    platform_tenant_id: TENANT_ZM,
    slug: `stsmgr_${suffix}`,
    name: `Status Org ${suffix}`,
  });
  const app = createAdminApp();
  const agent = await adminLoginAgent(app, username, "pw12345678");
  const res = await agent
    .post(`/admin/church/organizations/${org.id}/suspend`)
    .type("form")
    .send({ status_reason: "Testing unauthorized suspend" });
  assert.equal(res.status, 403);
  await cleanupOrg(pool, org.id);
  await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [userId]);
});

test(
  "organization status management integration",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("sts");
    const hash = await bcrypt.hash("superpw123456", 12);
    const superName = `sts_sup_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `stsorg${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28),
      name: `Status Test Org ${suffix}`,
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: `brga${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28),
      host_slug: `brga${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28),
      name: "Branch Alpha",
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: `brgb${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28),
      host_slug: `brgb${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28),
      name: "Branch Beta",
    });

    const adminApp = createAdminApp();
    const superAgent = await adminLoginAgent(adminApp, superName, "superpw123456");

    const blocked = await superAgent
      .post(`/admin/church/organizations/${org.id}/suspend`)
      .type("form")
      .send({});
    assert.equal(blocked.status, 400);

    const suspended = await superAgent
      .post(`/admin/church/organizations/${org.id}/suspend`)
      .type("form")
      .send({ status_reason: "Non-payment review hold" });
    assert.equal(suspended.status, 302);

    const refreshedOrg = await organizationsRepo.findOrganizationById(pool, org.id);
    assert.equal(refreshedOrg.status, "suspended");
    assert.ok(refreshedOrg.status_reason);

    const detail = await superAgent.get(`/admin/church/organizations/${org.id}`);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /Suspend organization|Organization status/i);

    const audit = await pool.query(
      `SELECT action FROM public.church_audit_logs
       WHERE organization_id = $1 AND action = 'platform_church_organization_suspended'
       ORDER BY id DESC LIMIT 1`,
      [org.id]
    );
    assert.equal(audit.rows.length, 1);

    const activeCtx = branchContext({ ...refreshedOrg, status: "active" }, branchA);
    const suspendedCtx = branchContext(refreshedOrg, { ...branchA, status: "active" });
    const activeApp = makeChurchApp(activeCtx);
    const suspendedApp = makeChurchApp(suspendedCtx);

    const publicActive = await request(activeApp).get("/");
    assert.notEqual(publicActive.status, 503);

    const publicBlocked = await request(suspendedApp).get("/");
    assert.equal(publicBlocked.status, 503);
    assert.match(publicBlocked.text, /temporarily unavailable/i);

    const memberLoginBlocked = await request(suspendedApp).get("/login");
    assert.equal(memberLoginBlocked.status, 503);

    const branchLoginBlocked = await request(suspendedApp).get("/branch/login");
    assert.equal(branchLoginBlocked.status, 503);

    const hqLoginAllowed = await request(suspendedApp).get("/hq/login");
    assert.equal(hqLoginAllowed.status, 503);

    const reactivated = await superAgent
      .post(`/admin/church/organizations/${org.id}/reactivate`)
      .type("form")
      .send({ status_reason: "Issue resolved" });
    assert.equal(reactivated.status, 302);

    const restoredOrg = await organizationsRepo.findOrganizationById(pool, org.id);
    assert.equal(restoredOrg.status, "active");

    const restoredCtx = branchContext(restoredOrg, branchA);
    const restoredApp = makeChurchApp(restoredCtx);
    const publicRestored = await request(restoredApp).get("/");
    assert.notEqual(publicRestored.status, 503);

    const branchSuspend = await superAgent
      .post(`/admin/church/branches/${branchA.id}/suspend`)
      .type("form")
      .send({ status_reason: "Branch facility closure" });
    assert.equal(branchSuspend.status, 302);

    const branchAUpdated = await branchesRepo.findBranchBySlug(pool, org.id, branchA.slug);
    assert.equal(branchAUpdated.status, "suspended");

    const branchABlockedCtx = branchContext(restoredOrg, branchAUpdated);
    const branchBActiveCtx = branchContext(restoredOrg, { ...branchB, status: "active" });
    const branchAApp = makeChurchApp(branchABlockedCtx);
    const branchBApp = makeChurchApp(branchBActiveCtx);

    assert.equal((await request(branchAApp).get("/")).status, 503);
    assert.notEqual((await request(branchBApp).get("/")).status, 503);

    const branchAudit = await pool.query(
      `SELECT action FROM public.church_audit_logs
       WHERE organization_id = $1 AND branch_id = $2 AND action = 'platform_church_branch_suspended'
       ORDER BY id DESC LIMIT 1`,
      [org.id, branchA.id]
    );
    assert.equal(branchAudit.rows.length, 1);

    await superAgent
      .post(`/admin/church/branches/${branchA.id}/archive`)
      .type("form")
      .send({ status_reason: "Permanent closure" })
      .expect(302);

    const archivedBranch = await branchesRepo.findBranchBySlug(pool, org.id, branchA.slug);
    assert.equal(archivedBranch.status, "archived");
    assert.equal((await request(makeChurchApp(branchContext(restoredOrg, archivedBranch))).get("/")).status, 503);

    await cleanupOrg(pool, org.id);
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
  }
);
