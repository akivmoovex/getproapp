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
const { getSubdomain } = require("../src/platform/host");
const { createAttachChurchContext } = require("../src/church/attachChurchContext");
const blessboardAdminRoutes = require("../src/routes/blessboardAdmin");
const adminRoutes = require("../src/routes/admin");
const { db } = require("../src/db");
const adminUsersRepo = require("../src/db/pg/adminUsersRepo");
const churchRoutes = require("../src/routes/church");
const { isBlessBoardApexHost } = require("../src/church/blessBoardApexHost");
const {
  shouldRedirectGetProChurchAdmin,
  redirectGetProChurchAdminToBlessBoard,
  shouldBlockBlessBoardAdminOnBranchHost,
} = require("../src/church/getProChurchAdminRedirect");
const { renderBlessBoardAdminHostNotFound } = require("../src/church/requireBlessBoardApexHost");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createProductionLikeApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.set("trust proxy", true);
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "blessboard-admin-host-test-secret-long",
      resave: false,
      saveUninitialized: false,
    })
  );
  app.use((req, res, next) => {
    req.subdomain = getSubdomain(req);
    next();
  });
  app.use(createAttachChurchContext());
  app.use((req, res, next) => {
    req.tenant = { id: 1, slug: "zm" };
    req.tenantUrlPrefix = "";
    res.locals.asset = (k) => `/${String(k || "").replace(/^\//, "")}`;
    next();
  });
  app.use("/admin", (req, res, next) => {
    if (shouldBlockBlessBoardAdminOnBranchHost(req)) {
      return renderBlessBoardAdminHostNotFound(req, res);
    }
    if (isBlessBoardApexHost(req)) {
      return blessboardAdminRoutes()(req, res, next);
    }
    if (shouldRedirectGetProChurchAdmin(req)) {
      return redirectGetProChurchAdminToBlessBoard(req, res);
    }
    return adminRoutes({ db, mountChurchPlatform: false })(req, res, next);
  });
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("platform fallback"));
  return app;
}

async function superAdminLoginAgent(app, host = "blessboard.com") {
  if (!isPgConfigured()) return null;
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  const suffix = makeSuffix("bbadmin");
  const hash = await bcrypt.hash("superpw123456", 12);
  const username = `bb_admin_${suffix}`;
  const userId = await adminUsersRepo.insertUser(pool, {
    username,
    passwordHash: hash,
    role: ROLES.SUPER_ADMIN,
    tenantId: null,
    displayName: "",
  });
  const agent = request.agent(app);
  await agent
    .post("/admin/login")
    .set("Host", host)
    .type("form")
    .send({ username, password: "superpw123456" })
    .expect(302);
  return { agent, userId, pool };
}

test("blessboard.com apex is detected for platform admin routing", () => {
  const req = { headers: { host: "blessboard.com" }, get: (n) => (n === "host" ? "blessboard.com" : "") };
  assert.equal(isBlessBoardApexHost(req), true);
});

test("demo.blessboard.com is not blessboard apex", () => {
  const req = {
    isChurchHost: true,
    churchContext: { kind: "branch", hostSlug: "demo" },
    headers: { host: "demo.blessboard.com" },
    get: (n) => (n === "host" ? "demo.blessboard.com" : ""),
  };
  assert.equal(isBlessBoardApexHost(req), false);
});

test(
  "blessboard.com/admin/churches/new renders provisioning form for super admin",
  { skip: !isPgConfigured() },
  async () => {
    const app = createProductionLikeApp();
    const login = await superAdminLoginAgent(app);
    const res = await login.agent.get("/admin/churches/new").set("Host", "blessboard.com");
    assert.equal(res.status, 200);
    assert.match(res.text, /Create church organization|Organization/i);
    assert.match(res.text, /BlessBoard Admin|BlessBoard/);
    await login.pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [login.userId]);
  }
);

test(
  "blessboard.com/admin/diagnostics renders for super admin",
  { skip: !isPgConfigured() },
  async () => {
    const app = createProductionLikeApp();
    const login = await superAdminLoginAgent(app);
    const res = await login.agent.get("/admin/diagnostics").set("Host", "blessboard.com");
    assert.equal(res.status, 200);
    assert.match(res.text, /BlessBoard production diagnostics/i);
    assert.doesNotMatch(res.text, /postgres:\/\//i);
    await login.pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [login.userId]);
  }
);

test("demo.blessboard.com/admin/churches/new returns friendly not found", async () => {
  const app = createProductionLikeApp();
  const res = await request(app).get("/admin/churches/new").set("Host", "demo.blessboard.com");
  assert.equal(res.status, 404);
  assert.match(res.text, /Church not found|not found/i);
});

test("kafuebaptist.blessboard.com/admin/churches/new returns friendly not found", async () => {
  const app = createProductionLikeApp();
  const res = await request(app)
    .get("/admin/churches/new")
    .set("Host", "kafuebaptist.blessboard.com");
  assert.equal(res.status, 404);
});

test("getproapp.org/admin/church/organizations/new redirects to blessboard.com", async () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "getproapp.org";
  try {
    const app = createProductionLikeApp();
    const res = await request(app)
      .get("/admin/church/organizations/new")
      .set("Host", "getproapp.org");
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, "https://blessboard.com/admin/churches/new");
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});

test("getproapp.org remains main GetPro platform for public church routes", async () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "getproapp.org";
  try {
    const app = createProductionLikeApp();
    const res = await request(app).get("/giving").set("Host", "getproapp.org");
    assert.equal(res.status, 404);
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});

test(
  "blessboard.com serves BlessBoard landing page",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    const app = createProductionLikeApp();
    const res = await request(app).get("/").set("Host", "blessboard.com");
    assert.equal(res.status, 200);
    assert.match(res.text, /BlessBoard/);
  }
);

test(
  "demo.blessboard.com remains demo church public site",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    const seed = require("../src/seeds/seedChurchDemoOrganization");
    await seed.seedChurchDemoOrganizationIfMissing(pool);
    const app = createProductionLikeApp();
    const res = await request(app).get("/").set("Host", "demo.blessboard.com");
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /Church not found/i);
  }
);

test(
  "demo.blessboard.com/branch/login remains available",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    const seed = require("../src/seeds/seedChurchDemoOrganization");
    await seed.seedChurchDemoOrganizationIfMissing(pool);
    const app = createProductionLikeApp();
    const res = await request(app).get("/branch/login").set("Host", "demo.blessboard.com");
    assert.equal(res.status, 200);
    assert.match(res.text, /login|sign in/i);
  }
);

test(
  "demo.blessboard.com/register remains available",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    const seed = require("../src/seeds/seedChurchDemoOrganization");
    await seed.seedChurchDemoOrganizationIfMissing(pool);
    const app = createProductionLikeApp();
    const res = await request(app).get("/register").set("Host", "demo.blessboard.com");
    assert.notEqual(res.status, 404);
  }
);

test(
  "demo.blessboard.com/login remains available for members",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    const seed = require("../src/seeds/seedChurchDemoOrganization");
    await seed.seedChurchDemoOrganizationIfMissing(pool);
    const app = createProductionLikeApp();
    const res = await request(app).get("/login").set("Host", "demo.blessboard.com");
    assert.notEqual(res.status, 404);
  }
);

test("non-super admin cannot use blessboard.com/admin/login", async () => {
  if (!isPgConfigured()) return;
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  const suffix = makeSuffix("bbmgr");
  const hash = await bcrypt.hash("pw12345678", 12);
  const username = `bb_mgr_${suffix}`;
  const userId = await adminUsersRepo.insertUser(pool, {
    username,
    passwordHash: hash,
    role: ROLES.TENANT_MANAGER,
    tenantId: 1,
    displayName: "",
  });
  const app = createProductionLikeApp();
  const res = await request(app)
    .post("/admin/login")
    .set("Host", "blessboard.com")
    .type("form")
    .send({ username, password: "pw12345678" });
  assert.equal(res.status, 200);
  assert.match(res.text, /super admin/i);
  await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [userId]);
});
