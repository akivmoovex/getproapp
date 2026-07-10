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
const membersRepo = require("../src/db/pg/church/membersRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");

const MEMBER_PNGS = [
  "14-member-dashboard-desktop/14-member-dashboard-desktop.png",
  "14-member-dashboard-mobile/14-member-dashboard-mobile.png",
  "15-member-profile-desktop/15-member-profile-desktop.png",
  "15-member-profile-mobile/15-member-profile-mobile.png",
  "16-member-announcements-desktop/16-member-announcements-desktop.png",
  "16-member-announcements-mobile/16-member-announcements-mobile.png",
  "17-member-events-calendar-desktop/17-member-events-calendar-desktop.png",
  "17-member-events-calendar-mobile/17-member-events-calendar-mobile.png",
  "18-member-my-ministries-desktop/18-member-my-ministries-desktop.png",
  "18-member-my-ministries-mobile/18-member-my-ministries-mobile.png",
  "19-member-resources-study-desktop/19-member-resources-study-desktop.png",
  "19-member-resources-study-mobile/19-member-resources-study-mobile.png",
  "20-member-forms-documents-mobile/20-member-forms-documents-mobile.png",
];

const MEMBER_ASSETS = [
  "avatar-member.jpg",
  "dashboard-hero-garden.jpg",
  "event-1.jpg",
  "ministry-worship.jpg",
  "announcement-featured.jpg",
  "resource-hero.jpg",
  "profile-map-kafue.jpg",
];

function makeBranchApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use("/church", express.static(path.join(__dirname, "../public/church")));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "test-church-stitch-member",
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

test("member portal Stitch PNG inventory exists on disk", () => {
  const base = path.join(__dirname, "../design-reference/stitch-screens/church-flow/03-member-portal");
  for (const rel of MEMBER_PNGS) {
    assert.ok(fs.existsSync(path.join(base, rel)), `missing Stitch PNG ${rel}`);
  }
  assert.equal(
    fs.existsSync(path.join(base, "20-member-forms-documents-desktop/20-member-forms-documents-desktop.png")),
    false,
    "forms desktop PNG should remain missing"
  );
});

test("member portal localized assets exist", () => {
  const dir = path.join(__dirname, "../public/church/images/member");
  for (const file of MEMBER_ASSETS) {
    assert.ok(fs.existsSync(path.join(dir, file)), `missing member asset ${file}`);
  }
});

test("member shell references church.css?v=44", () => {
  const text = fs.readFileSync(
    path.join(__dirname, "../views/church/partials/member_shell_start.ejs"),
    "utf8"
  );
  assert.match(text, /church\.css\?v=44/);
  assert.match(text, /church-member-sidebar/);
  assert.match(text, /church-member-desktop-topbar/);
  assert.match(text, /church-member-bottom-nav/);
  assert.match(text, /Groups/);
  assert.match(text, /Study/);
  assert.match(text, /More/);
  assert.match(text, /Powered by GetPro/);
  assert.doesNotMatch(text, /GetPro Church/);
});

test("unauthenticated member routes redirect to /login", async () => {
  const app = makeBranchApp();
  const routes = [
    "/member/dashboard",
    "/member/profile",
    "/member/announcements",
    "/member/events",
    "/member/my-ministries",
    "/member/resources",
    "/member/forms",
    "/member/requests",
    "/member/requests/new",
    "/member/prayer-request",
    "/member/giving",
  ];
  for (const route of routes) {
    const res = await request(app).get(route);
    assert.ok([302, 303].includes(res.status), `${route} should redirect`);
    assert.equal(res.headers.location, "/login", `${route} should go to /login`);
  }
});

test("public pages still render on branch host", async () => {
  const res = await request(makeBranchApp()).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /church\.css\?v=44/);
});

test("branch admin unauthenticated still redirects", async () => {
  const res = await request(makeBranchApp()).get("/branch/dashboard");
  assert.ok([302, 303].includes(res.status));
  assert.equal(res.headers.location, "/branch/login");
});

test("getproapp.org isolation: church member routes unavailable on non-church host", async () => {
  const res = await request(makePlatformApp()).get("/member/dashboard");
  assert.equal(res.status, 404);
});

test(
  "authenticated member portal screens render with DB",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("stitch_m");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `sm_${suffix}`,
      name: `Stitch Member Church ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Stitch Member Church ${suffix}`,
    });
    const passwordHash = await bcrypt.hash("testpass123456", 12);
    const member = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email: `member_${suffix}@example.com`,
      phone: "0977000111",
      full_name: "Mary Phiri",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "1-3 years",
    });
    await membersRepo.updateMemberStatusForBranch(pool, member.id, branch.id, "verified");

    const app = express();
    app.set("view engine", "ejs");
    app.set("views", path.join(__dirname, "../views"));
    app.use("/church", express.static(path.join(__dirname, "../public/church")));
    app.use(express.urlencoded({ extended: true }));
    app.use(
      session({
        secret: "test-church-stitch-member-db",
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
      await agent.post("/login").type("form").send({
        identifier: `member_${suffix}@example.com`,
        password: "testpass123456",
      });

      const screens = [
        { path: "/member/dashboard", markers: [/Welcome home|Welcome back/, /Quick Actions|Submit Prayer Request/] },
        { path: "/member/profile", markers: [/Update profile|Contact|Verified member/] },
        { path: "/member/announcements", markers: [/Announcements/] },
        { path: "/member/events", markers: [/Events|Upcoming/] },
        { path: "/member/my-ministries", markers: [/My ministries|Active ministries/] },
        { path: "/member/resources", markers: [/Resources|Resource Library|Study/] },
        { path: "/member/forms", markers: [/Forms|Documents/] },
        { path: "/member/requests", markers: [/My requests|Track your online requests/] },
        { path: "/member/requests/new", markers: [/Submit a request|Request type/] },
        { path: "/member/prayer-request", markers: [/Prayer request|Prayer topic/] },
        { path: "/member/giving", markers: [/Giving/] },
      ];

      for (const screen of screens) {
        const res = await agent.get(screen.path);
        assert.equal(res.status, 200, `${screen.path} should be 200`);
        assert.match(res.text, /church\.css\?v=44/, `${screen.path} CSS v43`);
        assert.match(res.text, /data-member-shell="stitch-v40"/);
        assert.match(res.text, /Groups/);
        assert.match(res.text, /Study/);
        assert.match(res.text, /Dashboard/);
        for (const marker of screen.markers) {
          assert.match(res.text, marker, `${screen.path} missing ${marker}`);
        }
        assert.doesNotMatch(res.text, /GetPro Church/);
        assert.match(res.text, /Powered by GetPro/);
      }
    } finally {
      await pool.query(`DELETE FROM public.church_audit_logs WHERE branch_id = $1`, [branch.id]);
      await pool.query(`DELETE FROM public.church_prayer_requests WHERE branch_id = $1`, [branch.id]);
      await pool.query(`DELETE FROM public.church_member_requests WHERE branch_id = $1`, [branch.id]);
      await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branch.id]);
      await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branch.id]);
      await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [org.id]);
    }
  }
);
