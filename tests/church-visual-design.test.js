"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const churchRoutes = require("../src/routes/church");
const { BLESSBOARD_NAME } = require("../src/church/branding");
const { isPgConfigured } = require("../src/db/pg/pool");

function makeVerticalApexApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = { kind: "vertical-apex", host: "blessboard.com", organization: null, branch: null };
    next();
  });
  app.use(churchRoutes());
  return app;
}

function makeBranchApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = {
      kind: "branch",
      orgSlug: "demo",
      organization: { id: 1, name: "Demo Church", status: "active" },
      branch: { id: 1, name: "Demo Branch", status: "active", host_slug: "demo" },
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

const branchPublicRoutes = [
  { path: "/", markers: ["church-menu-btn", "Powered by GetPro"] },
  { path: "/about", markers: ["Our Story", "Our Mission", "Our Vision", "Core Values", "Find Us", "Powered by GetPro"] },
  { path: "/leadership", markers: ["Our Leadership", "Ministry Leaders", "Powered by GetPro"] },
  { path: "/contact", markers: ["church-contact-layout", "Get in Touch", "Powered by GetPro"] },
  { path: "/events", markers: ["Events &amp; Calendar", "church-event-row", "Powered by GetPro"] },
  { path: "/sermons", markers: ["church-sermon-grid", "church-sermon-card", "Powered by GetPro"] },
  { path: "/ministries", markers: ["church-ministry-grid", "Ministries", "Powered by GetPro"] },
  { path: "/giving", markers: ["church-giving-page", "Giving", "Powered by GetPro"] },
  { path: "/login", markers: ["Member Login", "Powered by GetPro", "brand-lockup"] },
  { path: "/register", markers: ["Member Registration", "Powered by GetPro"] },
  { path: "/registration-submitted", markers: ["Registration submitted", "Powered by GetPro"] },
];

const HOMEPAGE_ASSETS = [
  "desktop-hero-auditorium.jpg",
  "mobile-hero-sanctuary.jpg",
  "mobile-map-kafue.jpg",
  "mobile-ministry-children.jpg",
  "mobile-ministry-youth.jpg",
  "mobile-ministry-worship.jpg",
];

const ABOUT_ASSETS = [
  "about-mobile-hero.jpg",
  "about-map.jpg",
  "about-branch-building.jpg",
  "about-culture-1.jpg",
  "about-culture-2.jpg",
  "about-culture-3.jpg",
  "about-culture-4.jpg",
];

const LEADERSHIP_ASSETS = [
  "pastor-desktop.jpg",
  "pastor-mobile.jpg",
  "assistant-desktop.jpg",
  "elder-1.jpg",
  "ministry-1.jpg",
];

test("church public shells reference church.css?v=35", () => {
  const publicShells = [
    "views/church/partials/public_shell_start.ejs",
    "views/church/partials/auth_shell_start.ejs",
    "views/church/public/not_found.ejs",
    "views/church/public/unavailable.ejs",
    "views/church/public/service_unavailable.ejs",
  ];
  for (const rel of publicShells) {
    const text = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
    assert.match(text, /church\.css\?v=35/, `${rel} should load church.css?v=35`);
  }
});

test("homepage Stitch assets exist on disk", () => {
  const dir = path.join(__dirname, "../public/church/images/homepage");
  for (const file of HOMEPAGE_ASSETS) {
    assert.ok(fs.existsSync(path.join(dir, file)), `missing asset ${file}`);
  }
});

test("about and leadership Stitch assets exist on disk", () => {
  for (const file of ABOUT_ASSETS) {
    assert.ok(
      fs.existsSync(path.join(__dirname, "../public/church/images/about", file)),
      `missing about asset ${file}`
    );
  }
  for (const file of LEADERSHIP_ASSETS) {
    assert.ok(
      fs.existsSync(path.join(__dirname, "../public/church/images/leadership", file)),
      `missing leadership asset ${file}`
    );
  }
});

test("homepage CSS references ministry tile assets", () => {
  const css = fs.readFileSync(path.join(__dirname, "../public/church/church.css"), "utf8");
  assert.match(css, /mobile-ministry-children\.jpg/);
  assert.match(css, /mobile-ministry-youth\.jpg/);
  assert.match(css, /mobile-ministry-worship\.jpg/);
});

test("BlessBoard apex homepage includes updated CSS bundle v35", async () => {
  const app = makeVerticalApexApp();
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /church\.css\?v=35/);
  assert.match(res.text, new RegExp(BLESSBOARD_NAME));
  assert.match(res.text, /Powered by GetPro/);
});

test("BlessBoard apex homepage matches desktop Stitch design markers", async () => {
  const app = makeVerticalApexApp();
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /bb-saas-hero/);
  assert.match(res.text, /home-desktop-design/);
  assert.match(res.text, />Features</);
  assert.match(res.text, />Pricing</);
  assert.match(res.text, />About Us</);
  assert.match(res.text, /Empower Your Church/);
  assert.match(res.text, /Start Free Trial|Get Started Free/);
  assert.match(res.text, /Powerful Tools for Modern Ministry/);
  assert.match(res.text, /bb-saas-cta/);
  assert.match(res.text, /Ready to Transform Your Church Management/);
  assert.match(res.text, /Member Management/);
  assert.match(res.text, /Attendance Tracking/);
  assert.match(res.text, /Advanced Reporting/);
  assert.match(res.text, /Ministry Coordination/);
  assert.match(res.text, /desktop-hero-auditorium\.jpg/);
  assert.doesNotMatch(res.text, /GetPro Church/);
});

test("demo branch homepage matches mobile Stitch design markers", async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /home-mobile-design/);
  assert.match(res.text, /home-desktop-design/);
  assert.match(res.text, /bb-saas-hero/);
  assert.match(res.text, /church-branch-mobile-hero/);
  assert.match(res.text, /Welcome home to our community\./);
  assert.match(res.text, /Register as Member/);
  assert.match(res.text, /Plan a Visit/);
  assert.match(res.text, /Service Times/);
  assert.match(res.text, /Join us this Sunday/);
  assert.match(res.text, /Ministries/);
  assert.match(res.text, /Upcoming Events/);
  assert.match(res.text, /Support our Mission/);
  assert.match(res.text, /Powerful Tools for Modern Ministry/);
  assert.match(res.text, /Ready to Transform Your Church Management/);
  assert.match(res.text, /mobile-hero-sanctuary\.jpg/);
  assert.match(res.text, /mobile-map-kafue\.jpg/);
  assert.match(res.text, /church-location-card/);
  assert.match(res.text, /church-fab-chat/);
  assert.match(res.text, /Empower Your Church/);
  assert.doesNotMatch(res.text, /GetPro Church/);
});

test("branch homepage includes mobile drawer and branch hero markup", async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /church-mobile-menu-btn/);
  assert.match(res.text, /church-mobile-drawer/);
  assert.match(res.text, /church-branch-mobile-hero/);
  assert.match(res.text, /church-service-scroller/);
  assert.match(res.text, /church-brand-mark/);
});

test("branch homepage does not use legacy horizontal mobile nav strip", async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/");
  assert.doesNotMatch(res.text, /church-public-mobile-nav/);
});

test("branch public pages render priority screen layout markers", { skip: !isPgConfigured() }, async () => {
  const app = makeBranchApp();
  for (const route of branchPublicRoutes) {
    const res = await request(app).get(route.path);
    assert.equal(res.status, 200, `${route.path} should render`);
    for (const marker of route.markers) {
      assert.match(res.text, new RegExp(marker), `${route.path} should include ${marker}`);
    }
    assert.doesNotMatch(res.text, /GetPro Church/, `${route.path} should not show legacy branding`);
  }
});

test("sermons page uses sermon cards from DB when available", { skip: !isPgConfigured() }, async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/sermons");
  assert.equal(res.status, 200);
  assert.match(res.text, /church-sermon-card/);
});

test("branch admin shell includes mobile drawer and topbar markup", () => {
  const shell = fs.readFileSync(
    path.join(__dirname, "../views/church/partials/branch_admin_shell_start.ejs"),
    "utf8"
  );
  assert.match(shell, /church-branch-menu-btn/);
  assert.match(shell, /church-branch-drawer/);
  assert.match(shell, /church-branch-mobile-topbar/);
  assert.match(shell, /church\.css\?v=35/);
});

test("platform host does not expose branch-only public events route", async () => {
  const app = makePlatformApp();
  const res = await request(app).get("/events");
  assert.equal(res.status, 404);
});

test("getproapp.org / platform host remains unchanged for church homepage", async () => {
  const app = makePlatformApp();
  const res = await request(app).get("/");
  assert.equal(res.status, 404);
  assert.doesNotMatch(res.text, /Powerful Tools for Modern Ministry/);
  assert.doesNotMatch(res.text, /bb-saas-hero/);
});

test("about page includes Stitch section markers and assets", async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/about");
  assert.equal(res.status, 200);
  assert.match(res.text, /church\.css\?v=35/);
  assert.match(res.text, /Our Story/);
  assert.match(res.text, /Our Mission/);
  assert.match(res.text, /Our Vision/);
  assert.match(res.text, /Core Values/);
  assert.match(res.text, /Find Us/);
  assert.match(res.text, /OUR JOURNEY/);
  assert.match(res.text, /Rooted in Grace/);
  assert.match(res.text, /The Church Story/);
  assert.match(res.text, /Our Values/);
  assert.match(res.text, /Service Culture/);
  assert.match(res.text, /Want to learn more/);
  assert.match(res.text, /about-mobile-hero\.jpg/);
  assert.match(res.text, /about-branch-building\.jpg/);
  assert.match(res.text, /about-culture-1\.jpg/);
  assert.match(res.text, /href="\/about"/);
  assert.match(res.text, /href="\/leadership"/);
  assert.doesNotMatch(res.text, /GetPro Church/);
});

test("leadership page includes Stitch section markers and assets", async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/leadership");
  assert.equal(res.status, 200);
  assert.match(res.text, /church\.css\?v=35/);
  assert.match(res.text, /Our Leadership/);
  assert.match(res.text, /Ministry Leaders/);
  assert.match(res.text, /Our Elders/);
  assert.match(res.text, /Administration/);
  assert.match(res.text, /pastor-mobile\.jpg/);
  assert.match(res.text, /pastor-desktop\.jpg/);
  assert.match(res.text, /assistant-desktop\.jpg/);
  assert.match(res.text, /href="\/about"/);
  assert.match(res.text, /href="\/leadership"/);
  assert.doesNotMatch(res.text, /GetPro Church/);
});

test("public nav and mobile drawer include About and Leadership links", async () => {
  const shell = fs.readFileSync(
    path.join(__dirname, "../views/church/partials/public_shell_start.ejs"),
    "utf8"
  );
  assert.match(shell, /href="\/about"/);
  assert.match(shell, /href="\/leadership"/);
  assert.match(shell, />About</);
  assert.match(shell, />Leadership</);
  assert.match(shell, /church-mobile-drawer/);
  const footer = fs.readFileSync(
    path.join(__dirname, "../views/church/partials/public_shell_end.ejs"),
    "utf8"
  );
  assert.match(footer, /href="\/about"/);
  assert.match(footer, /href="\/contact"/);
  assert.doesNotMatch(footer, /href="\/broken/);
});

test("all church shells reference church.css?v=35", () => {
  const shells = [
    "views/church/partials/public_shell_start.ejs",
    "views/church/partials/auth_shell_start.ejs",
    "views/church/partials/member_shell_start.ejs",
    "views/church/partials/leader_shell_start.ejs",
    "views/church/partials/hq_shell_start.ejs",
    "views/church/partials/branch_admin_shell_start.ejs",
    "views/church/public/not_found.ejs",
    "views/church/public/unavailable.ejs",
    "views/church/public/service_unavailable.ejs",
  ];
  for (const rel of shells) {
    const text = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
    assert.match(text, /church\.css\?v=35/, `${rel} should load church.css?v=35`);
  }
});
