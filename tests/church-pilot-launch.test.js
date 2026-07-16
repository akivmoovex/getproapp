"use strict";

const fs = require("fs");
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
const { getSubdomain } = require("../src/platform/host");
const { createAttachChurchContext } = require("../src/church/attachChurchContext");
const { isChurchHost } = require("../src/church/host");
const adminRoutes = require("../src/routes/admin");
const adminUsersRepo = require("../src/db/pg/adminUsersRepo");
const churchRoutes = require("../src/routes/church");
const {
  gatherChurchProductionDiagnostics,
  LATEST_CHURCH_MIGRATION,
} = require("../src/services/church/churchProductionDiagnostics");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");

const ROOT = path.join(__dirname, "..");
const PRODUCTION_CHECKLIST = path.join(ROOT, "docs/blessboard-production-checklist.md");
const PILOT_SMOKE_DOC = path.join(ROOT, "docs/blessboard-pilot-smoke-test.md");

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
      secret: "church-pilot-launch-test-secret-long-enough",
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

function makeBlessBoardApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.set("trust proxy", true);
  app.use(express.urlencoded({ extended: true }));
  app.use((req, res, next) => {
    req.subdomain = getSubdomain(req);
    next();
  });
  app.use(createAttachChurchContext());
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("platform fallback"));
  return app;
}

async function adminLoginAgent(app, username, password) {
  const agent = request.agent(app);
  await agent.post("/admin/login").type("form").send({ username, password }).expect(302);
  return agent;
}

test("unauthenticated user cannot access /admin/church/diagnostics", async () => {
  const app = createAdminApp();
  const res = await request(app).get("/admin/church/diagnostics");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/admin/login");
});

test("tenant manager cannot access /admin/church/diagnostics", async () => {
  if (!isPgConfigured()) return;
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  const suffix = makeSuffix("diagmgr");
  const hash = await bcrypt.hash("pw12345678", 12);
  const username = `diag_mgr_${suffix}`;
  const userId = await adminUsersRepo.insertUser(pool, {
    username,
    passwordHash: hash,
    role: ROLES.TENANT_MANAGER,
    tenantId: TENANT_ZM,
    displayName: "",
  });
  const app = createAdminApp();
  const agent = await adminLoginAgent(app, username, "pw12345678");
  const res = await agent.get("/admin/church/diagnostics");
  assert.equal(res.status, 403);
  assert.match(res.text, /Super admin access required/i);
  await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [userId]);
});

test(
  "super admin can access diagnostics page",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    const suffix = makeSuffix("diagsuper");
    const hash = await bcrypt.hash("pw12345678", 12);
    const username = `diag_super_${suffix}`;
    const userId = await adminUsersRepo.insertUser(pool, {
      username,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: TENANT_ZM,
      displayName: "",
    });
    const app = createAdminApp();
    const agent = await adminLoginAgent(app, username, "pw12345678");
    const res = await agent.get("/admin/church/diagnostics");
    assert.equal(res.status, 200);
    assert.match(res.text, /BlessBoard diagnostics|Support Monitoring|Backup verification/i);
    assert.match(res.text, /108_church_backup_verification/i);
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [userId]);
  }
);

test("diagnostics HTML does not expose secrets", async () => {
  const prevDb = process.env.DATABASE_URL;
  const prevSecret = process.env.SESSION_SECRET;
  process.env.DATABASE_URL = "postgres://secretuser:secretpass@db.example.com:5432/getpro";
  process.env.SESSION_SECRET = "this-is-a-test-session-secret-32chars";

  try {
    const diagnostics = await gatherChurchProductionDiagnostics();
    const serialized = JSON.stringify(diagnostics);
    assert.doesNotMatch(serialized, /secretpass/i);
    assert.doesNotMatch(serialized, /secretuser/i);
    assert.doesNotMatch(serialized, /postgres:\/\//i);
    assert.equal(diagnostics.sessionSecretConfigured, true);
    assert.equal(typeof diagnostics.deploymentLabel, "string");
  } finally {
    if (prevDb === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDb;
    if (prevSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prevSecret;
  }
});

test("diagnostics reports missing database safely", async () => {
  const prevDb = process.env.DATABASE_URL;
  const prevGetproDb = process.env.GETPRO_DATABASE_URL;
  delete process.env.DATABASE_URL;
  delete process.env.GETPRO_DATABASE_URL;

  try {
    const diagnostics = await gatherChurchProductionDiagnostics();
    assert.equal(diagnostics.databaseConfigured, false);
    assert.equal(diagnostics.databaseReachable, false);
    assert.match(diagnostics.databaseError || "", /not configured/i);
    assert.equal(diagnostics.demoBranch.ok, false);
    assert.ok(Array.isArray(diagnostics.warnings));
    assert.ok(diagnostics.warnings.some((w) => /database/i.test(w)));
  } finally {
    if (prevDb === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDb;
    if (prevGetproDb === undefined) delete process.env.GETPRO_DATABASE_URL;
    else process.env.GETPRO_DATABASE_URL = prevGetproDb;
  }
});

test("diagnostics service exposes latest migration constant", () => {
  assert.equal(LATEST_CHURCH_MIGRATION, "108_church_backup_verification.sql");
});

test("production checklist mentions migration 090 and staging restoration", () => {
  const text = fs.readFileSync(PRODUCTION_CHECKLIST, "utf8");
  assert.match(text, /090_church_operational_readiness\.sql/);
  assert.match(text, /Deploy V4 to Hostinger/i);
  assert.match(text, /blessboard-staging-restoration-checklist/);
});

test("pilot smoke-test doc includes kafuebaptist.blessboard.com", () => {
  const text = fs.readFileSync(PILOT_SMOKE_DOC, "utf8");
  assert.match(text, /kafuebaptist\.blessboard\.com/);
  assert.match(text, /demo\.blessboard\.com/);
  assert.match(text, /getproapp\.org/);
});

test("getproapp.org is not treated as a church host", () => {
  const prevBase = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "getproapp.org";
  try {
    assert.equal(isChurchHost("getproapp.org"), false);
    assert.equal(isChurchHost("www.getproapp.org"), false);
    assert.equal(isChurchHost("zm.getproapp.org"), false);
  } finally {
    if (prevBase === undefined) delete process.env.BASE_DOMAIN;
    else process.env.BASE_DOMAIN = prevBase;
  }
});

test(
  "demo.blessboard.com homepage still works after onboarding-related changes",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const branch = await pool.query(
      `SELECT id, name, status FROM public.church_branches WHERE host_slug = 'demo' LIMIT 1`
    );
    if (branch.rows.length === 0) {
      const seed = require("../src/seeds/seedChurchDemoOrganization");
      await seed.seedChurchDemoOrganizationIfMissing(pool);
    }

    const app = makeBlessBoardApp();
    const home = await request(app).get("/").set("Host", "demo.blessboard.com");
    assert.equal(home.status, 200);

    const about = await request(app).get("/about").set("Host", "demo.blessboard.com");
    assert.equal(about.status, 200);

    const contact = await request(app).get("/contact").set("Host", "demo.blessboard.com");
    assert.equal(contact.status, 200);
  }
);
