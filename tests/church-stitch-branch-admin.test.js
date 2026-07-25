"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const churchRoutes = require("../src/routes/church");
const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");

const BRANCH_PNGS = [
  "25-branch-admin-dashboard-desktop/25-branch-admin-dashboard-desktop.png",
  "25-branch-admin-dashboard-mobile/25-branch-admin-dashboard-mobile.png",
  "26-branch-member-verification-queue-desktop/26-branch-member-verification-queue-desktop.png",
  "26-branch-member-verification-queue-mobile/26-branch-member-verification-queue-mobile.png",
  "34-branch-website-editor-desktop/34-branch-website-editor-desktop.png",
  "34-branch-website-editor-mobile/34-branch-website-editor-mobile.png",
  "32-branch-events-management-desktop/32-branch-events-management-desktop.png",
  "32-branch-events-management-mobile/32-branch-events-management-mobile.png",
  "40-branch-reports-dashboard-desktop/40-branch-reports-dashboard-desktop.png",
  "40-branch-reports-dashboard-mobile/40-branch-reports-dashboard-mobile.png",
];

const BRANCH_ASSETS = [
  "avatar-pastor-stitch.jpg",
  "map-kafue.jpg",
  "event-cover-1.jpg",
  "sermon-thumb.jpg",
  "resource-thumb.jpg",
];

function makeBranchApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use("/church", express.static(path.join(__dirname, "../public/church")));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "test-church-stitch-branch-admin",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = {
      kind: "branch",
      orgSlug: "demo",
      organization: { id: 1, name: "Kafue Baptist Church", status: "active", platform_tenant_id: 1 },
      branch: {
        id: 1,
        name: "Kafue Baptist Church",
        status: "active",
        host_slug: "demo",
        location_text: "Kafue, Zambia",
      },
    };
    next();
  });
  app.use(churchRoutes());
  return app;
}

function makePlatformApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use((req, res, next) => {
    req.isChurchHost = false;
    req.churchContext = null;
    next();
  });
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

test("branch admin Stitch PNG inventory exists on disk", () => {
  const base = path.join(__dirname, "../design-reference/stitch-screens/church-flow/04-branch-admin");
  for (const rel of BRANCH_PNGS) {
    assert.ok(fs.existsSync(path.join(base, rel)), `missing Stitch PNG ${rel}`);
  }
  const all = fs
    .readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d+-branch-/.test(d.name));
  assert.ok(all.length >= 42, `expected >= 42 branch-admin screen folders, got ${all.length}`);
});

test("branch admin localized assets exist", () => {
  const dir = path.join(__dirname, "../public/church/images/branch-admin");
  for (const file of BRANCH_ASSETS) {
    assert.ok(fs.existsSync(path.join(dir, file)), `missing branch-admin asset ${file}`);
  }
});

test("branch admin shell references church.css?v=56", () => {
  const text = fs.readFileSync(
    path.join(__dirname, "../views/church/partials/branch_admin_shell_start.ejs"),
    "utf8"
  );
  assert.match(text, /church\.css\?v=56/);
  assert.match(text, /data-branch-shell="stitch-v41"/);
  assert.match(text, /church-branch-sidebar/);
  assert.match(text, /church-branch-desktop-topbar/);
  assert.match(text, /church-branch-bottom-nav/);
  assert.match(text, /powered_by_getpro/);
  assert.doesNotMatch(text, /GetPro Church/);
});

test("branch admin nav includes expected links and icons", () => {
  const text = fs.readFileSync(
    path.join(__dirname, "../src/church/http/classicAdminNav.js"),
    "utf8"
  );
  const links = fs.readFileSync(
    path.join(__dirname, "../views/church/partials/admin_nav_links.ejs"),
    "utf8"
  );
  for (const marker of [
    "/branch/dashboard",
    "/branch/member-verification",
    "/branch/members",
    "/branch/events",
    "/branch/website-editor",
    "/branch/sermons",
    "/branch/resources",
    "/branch/contact-submissions",
    "/branch/reports",
    "Dashboard",
    "Members",
    "Events",
  ]) {
    assert.match(text, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(links, /material-symbols-outlined/);
  assert.match(links, /church-branch-nav-link--active/);
});

test("unauthenticated branch routes redirect to /branch/login", async () => {
  const app = makeBranchApp();
  const routes = [
    "/branch/dashboard",
    "/branch/member-verification",
    "/branch/website-editor",
    "/branch/events",
    "/branch/sermons",
    "/branch/resources",
    "/branch/contact-submissions",
    "/branch/members",
    "/branch/reports",
  ];
  for (const route of routes) {
    const res = await request(app).get(route);
    assert.ok([302, 303].includes(res.status), `${route} should redirect`);
    assert.equal(res.headers.location, "/branch/login", `${route} should go to /branch/login`);
  }
});

test("public and member shells still on v41", () => {
  for (const rel of [
    "views/church/partials/public_shell_start.ejs",
    "views/church/partials/member_shell_start.ejs",
    "views/church/partials/auth_shell_start.ejs",
  ]) {
    const text = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
    assert.match(text, /church\.css\?v=47/, `${rel} should use v41`);
  }
});

test("getproapp.org isolation: branch admin unavailable on non-church host", async () => {
  const res = await request(makePlatformApp()).get("/branch/dashboard");
  assert.equal(res.status, 404);
});

test(
  "authenticated branch admin screens render with DB",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("stitch_ba");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `sba_${suffix}`,
      name: `Stitch Branch Church ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Stitch Branch Church ${suffix}`,
    });
    const passwordHash = await bcrypt.hash("testpass123456", 12);
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      email: `admin_${suffix}@example.com`,
      phone: "0977000222",
      full_name: "Pastor John Banda",
      password_hash: passwordHash,
      role: "branch_admin",
      status: "active",
    });

    const app = express();
    app.set("view engine", "ejs");
    app.set("views", path.join(__dirname, "../views"));
    app.use("/church", express.static(path.join(__dirname, "../public/church")));
    app.use(express.urlencoded({ extended: true }));
    app.use(
      session({
        secret: "test-church-stitch-branch-admin-db",
        resave: false,
        saveUninitialized: true,
      })
    );
    app.use((req, res, next) => {
      req.isChurchHost = true;
      req.churchContext = {
        kind: "branch",
        orgSlug: org.slug,
        organization: org,
        branch,
      };
      next();
    });
    app.use(churchRoutes());

    try {
      const agent = request.agent(app);
      await agent.post("/branch/login").type("form").send({
        identifier: `admin_${suffix}@example.com`,
        password: "testpass123456",
      });

      const screens = [
        { path: "/branch/dashboard", markers: [/Good Morning|Good Afternoon|Good Evening|Daily Pulse|Pending Verifications|Quick Actions/] },
        { path: "/branch/member-verification", markers: [/Member Verification Queue|Verification Checklist|Pending/] },
        { path: "/branch/website-editor", markers: [/Website editor|Preview Website|Site settings/] },
        { path: "/branch/events", markers: [/Events|Create event/] },
        { path: "/branch/sermons", markers: [/Sermons|Add sermon/] },
        { path: "/branch/resources", markers: [/Resources|Add resource/] },
        { path: "/branch/contact-submissions", markers: [/Contact submissions/] },
        { path: "/branch/members", markers: [/Members|Directory/] },
        { path: "/branch/reports", markers: [/Monthly reports|Create \/ continue report/] },
      ];

      for (const screen of screens) {
        const res = await agent.get(screen.path);
        assert.equal(res.status, 200, `${screen.path} should be 200`);
        assert.match(res.text, /church\.css\?v=47/, `${screen.path} CSS v43`);
        assert.match(res.text, /data-branch-shell="stitch-v41"/);
        assert.match(res.text, /Dashboard/);
        assert.match(res.text, /Members/);
        assert.match(res.text, /Events/);
        assert.match(res.text, /Powered by[\s\S]{0,120}?GetPro/);
        assert.doesNotMatch(res.text, /GetPro Church/);
        for (const marker of screen.markers) {
          assert.match(res.text, marker, `${screen.path} missing ${marker}`);
        }
      }

      // Branch scoping: admin session is tied to this branch only
      const dash = await agent.get("/branch/dashboard");
      assert.match(dash.text, new RegExp(branch.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    } finally {
      await pool.query(`DELETE FROM public.church_audit_logs WHERE branch_id = $1`, [branch.id]);
      await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branch.id]);
      await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branch.id]);
      await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [org.id]);
    }
  }
);
