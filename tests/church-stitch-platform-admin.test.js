"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { isPgConfigured } = require("../src/db/pg/pool");
const { getSubdomain } = require("../src/platform/host");
const { createAttachChurchContext } = require("../src/church/attachChurchContext");
const blessboardAdminRoutes = require("../src/routes/blessboardAdmin");
const adminRoutes = require("../src/routes/admin");
const churchRoutes = require("../src/routes/church");
const { db } = require("../src/db");
const { isBlessBoardApexHost } = require("../src/church/blessBoardApexHost");
const {
  shouldRedirectGetProChurchAdmin,
  redirectGetProChurchAdminToBlessBoard,
  shouldBlockBlessBoardAdminOnBranchHost,
} = require("../src/church/getProChurchAdminRedirect");
const { renderBlessBoardAdminHostNotFound } = require("../src/church/requireBlessBoardApexHost");

const PLATFORM_PNGS = [
  "62-platform-admin-dashboard-desktop/62-platform-admin-dashboard-desktop.png",
  "62-platform-admin-dashboard-mobile/62-platform-admin-dashboard-mobile.png",
  "63-platform-church-organizations-desktop/63-platform-church-organizations-desktop.png",
  "63-platform-church-organizations-mobile/63-platform-church-organizations-mobile.png",
  "64-platform-create-church-organization-desktop/64-platform-create-church-organization-desktop.png",
  "64-platform-create-church-organization-mobile/64-platform-create-church-organization-mobile.png",
  "65-platform-branch-tenants-desktop/65-platform-branch-tenants-desktop.png",
  "65-platform-branch-tenants-mobile/65-platform-branch-tenants-mobile.png",
  "66-platform-plans-limits-desktop/66-platform-plans-limits-desktop.png",
  "66-platform-plans-limits-mobile/66-platform-plans-limits-mobile.png",
  "67-platform-settings-desktop/67-platform-settings-desktop.png",
  "67-platform-settings-mobile/67-platform-settings-mobile.png",
  "68-platform-support-monitoring-desktop/68-platform-support-monitoring-desktop.png",
  "68-platform-support-monitoring-mobile/68-platform-support-monitoring-mobile.png",
];

const HQ_PNGS = [
  "58-hq-global-audit-trail-mobile/58-hq-global-audit-trail-mobile.png",
  "59-hq-permission-role-management-mobile/59-hq-permission-role-management-mobile.png",
  "60-hq-organization-templates-standards-mobile/60-hq-organization-templates-standards-mobile.png",
  "61-hq-broadcast-center-mobile/61-hq-broadcast-center-mobile.png",
];

const PLATFORM_ASSETS = ["avatar-admin.jpg", "provision-map.jpg"];

function createProductionLikeApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.set("trust proxy", true);
  app.use("/church", express.static(path.join(__dirname, "../public/church")));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "church-stitch-platform-admin-test-secret-long",
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

test("platform admin Stitch PNG inventory exists on disk", () => {
  const base = path.join(__dirname, "../design-reference/stitch-screens/church-flow/07-platform-admin");
  for (const rel of PLATFORM_PNGS) {
    assert.ok(fs.existsSync(path.join(base, rel)), `missing Stitch PNG ${rel}`);
  }
  assert.equal(PLATFORM_PNGS.length, 14);
});

test("HQ Stitch PNG inventory exists (mobile-only)", () => {
  const base = path.join(__dirname, "../design-reference/stitch-screens/church-flow/06-hq");
  for (const rel of HQ_PNGS) {
    assert.ok(fs.existsSync(path.join(base, rel)), `missing HQ PNG ${rel}`);
  }
});

test("platform admin localized assets exist", () => {
  const dir = path.join(__dirname, "../public/church/images/admin");
  for (const file of PLATFORM_ASSETS) {
    assert.ok(fs.existsSync(path.join(dir, file)), `missing admin asset ${file}`);
  }
});

test("platform admin shell references church.css?v=42", () => {
  const text = fs.readFileSync(
    path.join(__dirname, "../views/partials/platform_admin_shell_start.ejs"),
    "utf8"
  );
  assert.match(text, /church\.css\?v=42/);
  assert.match(text, /data-platform-shell="stitch-v42"/);
  assert.match(text, /BlessBoard Admin/);
  assert.match(text, /Powered by GetPro/);
  assert.doesNotMatch(text, /GetPro Church/);
  assert.match(text, /\/admin\/dashboard/);
  assert.match(text, /\/admin\/churches/);
  assert.match(text, /\/admin\/diagnostics/);
});

test("blessboard login uses church.css?v=42", () => {
  const text = fs.readFileSync(path.join(__dirname, "../views/admin/blessboard_login.ejs"), "utf8");
  assert.match(text, /church\.css\?v=42/);
  assert.match(text, /BlessBoard Admin/);
  assert.match(text, /Powered by GetPro/);
});

test("unauthenticated BlessBoard admin routes redirect to /admin/login", async () => {
  const app = createProductionLikeApp();
  const routes = [
    "/admin/dashboard",
    "/admin/churches",
    "/admin/churches/new",
    "/admin/diagnostics",
  ];
  for (const route of routes) {
    const res = await request(app).get(route).set("Host", "blessboard.com");
    assert.ok([302, 303].includes(res.status), `${route} should redirect`);
    assert.match(String(res.headers.location || ""), /\/admin\/login/, `${route} → login`);
  }
});

test("demo.blessboard.com/admin/churches/new returns 404", async () => {
  const app = createProductionLikeApp();
  const res = await request(app).get("/admin/churches/new").set("Host", "demo.blessboard.com");
  assert.equal(res.status, 404);
});

test("getproapp.org old church admin route redirects to blessboard.com", async () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "getproapp.org";
  try {
    const app = createProductionLikeApp();
    const res = await request(app)
      .get("/admin/church/organizations/new")
      .set("Host", "getproapp.org");
    assert.ok([301, 302, 303, 307, 308].includes(res.status));
    assert.equal(res.headers.location, "https://blessboard.com/admin/churches/new");
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});

test("getproapp.org main platform remains unchanged for homepage", async () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "getproapp.org";
  try {
    const app = createProductionLikeApp();
    const res = await request(app).get("/").set("Host", "getproapp.org");
    assert.equal(res.status, 404);
    assert.match(res.text, /platform fallback/);
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});

test("platform admin blocked on branch host while public church shell still loads CSS v42", async () => {
  const app = createProductionLikeApp();
  const blocked = await request(app).get("/admin/churches/new").set("Host", "demo.blessboard.com");
  assert.equal(blocked.status, 404);
  const shell = fs.readFileSync(
    path.join(__dirname, "../views/church/partials/branch_admin_shell_start.ejs"),
    "utf8"
  );
  assert.match(shell, /church\.css\?v=42/);
});

test(
  "authenticated BlessBoard admin screens render on apex",
  { skip: !isPgConfigured() },
  async () => {
    const { getPgPool } = require("../src/db/pg/pool");
    const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
    const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
    const adminUsersRepo = require("../src/db/pg/adminUsersRepo");
    const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
    const { ROLES } = require("../src/auth/roles");
    const { TENANT_ZM } = require("../src/tenants/tenantIds");
    const bcrypt = require("bcryptjs");

    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = `pa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const hash = await bcrypt.hash("superpw123456", 12);
    const username = `super_${suffix}`;
    const userId = await adminUsersRepo.insertUser(pool, {
      username,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "Platform Admin",
    });

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `org_${suffix}`,
      name: `Stitch Platform Church ${suffix}`,
      country: "Zambia",
    });

    const app = createProductionLikeApp();
    const agent = request.agent(app);
    await agent
      .post("/admin/login")
      .set("Host", "blessboard.com")
      .type("form")
      .send({ username, password: "superpw123456" });

    try {
      const screens = [
        { path: "/admin/dashboard", markers: [/BlessBoard Admin|Platform Dashboard|Organizations/] },
        { path: "/admin/churches", markers: [/Organization Governance|Create New Organization|Organizations/] },
        { path: "/admin/churches/new", markers: [/Initialize Organization|Organization Identity|Create Organization/] },
        { path: `/admin/churches/${org.id}`, markers: [new RegExp(org.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))] },
        { path: `/admin/churches/${org.id}/edit`, markers: [/Edit church details|Organization/] },
        { path: "/admin/diagnostics", markers: [/Support Monitoring|No secrets|SESSION_SECRET set/] },
      ];

      for (const screen of screens) {
        const res = await agent.get(screen.path).set("Host", "blessboard.com");
        assert.equal(res.status, 200, `${screen.path} should be 200`);
        assert.match(res.text, /church\.css\?v=42/, `${screen.path} CSS v42`);
        assert.match(res.text, /data-platform-shell="stitch-v42"/);
        assert.match(res.text, /BlessBoard Admin/);
        assert.match(res.text, /Powered by GetPro/);
        assert.doesNotMatch(res.text, /GetPro Church/);
        assert.doesNotMatch(res.text, /DATABASE_URL\s*=/);
        assert.doesNotMatch(res.text, /SESSION_SECRET\s*=\s*[^\s<]{8,}/);
        for (const marker of screen.markers) {
          assert.match(res.text, marker, `${screen.path} missing ${marker}`);
        }
      }

      const diag = await agent.get("/admin/diagnostics").set("Host", "blessboard.com");
      assert.match(diag.text, /SESSION_SECRET set/);
      assert.doesNotMatch(diag.text, /password_hash/i);
    } finally {
      await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [org.id]);
      await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [userId]);
    }
  }
);
