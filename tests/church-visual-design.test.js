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
  { path: "/contact", markers: ["Get in Touch", "Send a Message", "Office Hours", "contact-map-mobile.jpg", "Powered by GetPro"] },
  { path: "/events", markers: ["Upcoming Events", "Church Events", "church-event-card", "Powered by GetPro"] },
  { path: "/sermons", markers: ["Sermons &amp; Resources", "Media Library", "LATEST SERMON", "Powered by GetPro"] },
  { path: "/ministries", markers: ["Growing Together in Faith", "church-ministries-bento", "Powered by GetPro"] },
  { path: "/giving", markers: ["Ways to Give", "Support Our Ministry", "church-giving-page", "Powered by GetPro"] },
  { path: "/login", markers: ["Member Access", "Powered by GetPro", "data-auth-screen=\"login\""] },
  { path: "/register", markers: ["Member Registration", "Powered by GetPro", "data-auth-screen=\"register\""] },
  { path: "/registration-submitted", markers: ["Registration Submitted", "Powered by GetPro", "data-auth-screen=\"registration-submitted\""] },
  { path: "/forgot-password", markers: ["Forgot Password?", "Powered by GetPro", "data-auth-screen=\"forgot-password\""] },
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

const CONTACT_ASSETS = ["contact-map-desktop.jpg", "contact-map-mobile.jpg"];
const EVENT_ASSETS = ["event-1.jpg", "event-2.jpg", "event-3.jpg", "event-4.jpg", "event-featured-mobile.jpg"];
const SERMON_ASSETS = [
  "sermon-featured-desktop.jpg",
  "sermon-featured-mobile.jpg",
  "sermon-1.jpg",
  "sermon-2.jpg",
  "sermon-3.jpg",
];

const GIVING_ASSETS = ["giving-qr-desktop.jpg", "giving-qr-mobile.jpg"];

test("church public shells reference church.css?v=44", () => {
  const publicShells = [
    "views/church/partials/public_shell_start.ejs",
    "views/church/partials/auth_shell_start.ejs",
    "views/church/public/not_found.ejs",
    "views/church/public/unavailable.ejs",
    "views/church/public/service_unavailable.ejs",
  ];
  for (const rel of publicShells) {
    const text = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
    assert.match(text, /church\.css\?v=44/, `${rel} should load church.css?v=44`);
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

test("contact events and sermons Stitch assets exist on disk", () => {
  for (const file of CONTACT_ASSETS) {
    assert.ok(fs.existsSync(path.join(__dirname, "../public/church/images/contact", file)), `missing ${file}`);
  }
  for (const file of EVENT_ASSETS) {
    assert.ok(fs.existsSync(path.join(__dirname, "../public/church/images/events", file)), `missing ${file}`);
  }
  for (const file of SERMON_ASSETS) {
    assert.ok(fs.existsSync(path.join(__dirname, "../public/church/images/sermons", file)), `missing ${file}`);
  }
  for (const file of GIVING_ASSETS) {
    assert.ok(fs.existsSync(path.join(__dirname, "../public/church/images/giving", file)), `missing ${file}`);
  }
});

test("homepage CSS references ministry tile assets", () => {
  const css = fs.readFileSync(path.join(__dirname, "../public/church/church.css"), "utf8");
  assert.match(css, /mobile-ministry-children\.jpg/);
  assert.match(css, /mobile-ministry-youth\.jpg/);
  assert.match(css, /mobile-ministry-worship\.jpg/);
});

test("BlessBoard apex homepage includes updated CSS bundle v41", async () => {
  const app = makeVerticalApexApp();
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /church\.css\?v=44/);
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
  assert.match(shell, /church\.css\?v=44/);
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
  assert.match(res.text, /church\.css\?v=44/);
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
  assert.match(res.text, /church\.css\?v=44/);
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
  assert.match(shell, /href="\/ministries"/);
  assert.match(shell, /href="\/events"/);
  assert.match(shell, /href="\/sermons"/);
  assert.match(shell, /href="\/contact"/);
  assert.match(shell, />About</);
  assert.match(shell, />Leadership</);
  assert.match(shell, />Sermons</);
  assert.match(shell, /church-mobile-drawer/);
  const footer = fs.readFileSync(
    path.join(__dirname, "../views/church/partials/public_shell_end.ejs"),
    "utf8"
  );
  assert.match(footer, /href="\/about"/);
  assert.match(footer, /href="\/contact"/);
  assert.doesNotMatch(footer, /href="\/broken/);
});

test("branch desktop public nav is church links, not apex SaaS Features/Pricing", async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /church\.css\?v=44/);
  assert.match(res.text, /church-nav--branch/);
  assert.match(res.text, /church-header--branch/);
  assert.doesNotMatch(res.text, /church-header--apex/);
  assert.doesNotMatch(res.text, /church-nav--apex/);

  const navMatch = res.text.match(/<nav class="church-nav church-nav--branch"[^>]*>([\s\S]*?)<\/nav>/);
  assert.ok(navMatch, "branch desktop nav should be present");
  const navHtml = navMatch[1];
  for (const label of ["Home", "About", "Leadership", "Ministries", "Events", "Sermons", "Contact", "Giving"]) {
    assert.match(navHtml, new RegExp(`>${label}<`), `branch nav should include ${label}`);
  }
  assert.doesNotMatch(navHtml, />Features</);
  assert.doesNotMatch(navHtml, />Pricing</);
  assert.doesNotMatch(navHtml, />About Us</);

  assert.match(res.text, /href="\/login"[^>]*>Login</);
  assert.match(res.text, /href="\/register"[^>]*>Register</);
  assert.match(res.text, /church-mobile-menu-btn/);
  assert.match(res.text, /church-mobile-drawer/);
  assert.match(res.text, /Sermons &amp; Resources/);
  assert.equal((res.text.match(/church-nav--branch/g) || []).length, 1);
});

test("apex desktop nav keeps Features Pricing About Us with stable hash hrefs", async () => {
  const app = makeVerticalApexApp();
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /church\.css\?v=44/);
  assert.match(res.text, /church-nav--apex/);
  assert.match(res.text, /href="\/#features"[^>]*>Features</);
  assert.match(res.text, /href="\/#pricing"[^>]*>Pricing</);
  assert.match(res.text, /href="\/#about"[^>]*>About Us</);
  assert.match(res.text, /id="features"/);
  assert.match(res.text, /id="pricing"/);
  assert.match(res.text, /id="about"/);
  assert.doesNotMatch(res.text, /church-nav--branch/);
  assert.doesNotMatch(res.text, /href="\/about"[^>]*>About</);
  assert.doesNotMatch(res.text, /href="\/leadership"/);
  assert.doesNotMatch(res.text, /href="\/ministries"/);
  assert.doesNotMatch(res.text, /href="\/events"/);
  assert.doesNotMatch(res.text, /href="\/sermons"/);
  assert.doesNotMatch(res.text, /href="\/giving"/);
});

test("apex mobile drawer includes SaaS hash links and Admin Login", async () => {
  const app = makeVerticalApexApp();
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /id="church-mobile-menu-btn"/);
  assert.match(res.text, /church-drawer--apex/);
  assert.match(res.text, /id="church-mobile-drawer"/);
  const drawerMatch = res.text.match(/church-drawer--apex[\s\S]*?<nav class="church-drawer__nav">([\s\S]*?)<\/nav>/);
  assert.ok(drawerMatch, "apex mobile drawer nav should be present");
  const drawerHtml = drawerMatch[1];
  assert.match(drawerHtml, /href="\/#features"/);
  assert.match(drawerHtml, /href="\/#pricing"/);
  assert.match(drawerHtml, /href="\/#about"/);
  assert.match(drawerHtml, /href="\/admin\/login"[^>]*>Admin Login</);
  assert.doesNotMatch(drawerHtml, /href="\/leadership"/);
  assert.doesNotMatch(drawerHtml, /href="\/ministries"/);
});

test("branch homepage keeps church nav and does not use apex SaaS primary nav", async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /church-nav--branch/);
  assert.doesNotMatch(res.text, /church-nav--apex/);
  assert.doesNotMatch(res.text, /church-drawer--apex/);
  assert.match(res.text, /href="\/about"/);
  assert.match(res.text, /href="\/leadership"/);
  assert.match(res.text, /href="\/ministries"/);
  assert.match(res.text, /href="\/events"/);
  assert.match(res.text, /href="\/sermons"/);
  assert.match(res.text, /href="\/contact"/);
  assert.match(res.text, /href="\/giving"/);
  const navMatch = res.text.match(/<nav class="church-nav church-nav--branch"[^>]*>([\s\S]*?)<\/nav>/);
  assert.ok(navMatch);
  assert.doesNotMatch(navMatch[1], /href="\/#features"/);
  assert.doesNotMatch(navMatch[1], /href="\/#pricing"/);
  assert.doesNotMatch(navMatch[1], /href="\/#about"/);
});

test("contact page includes Stitch section markers and assets", async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/contact");
  assert.equal(res.status, 200);
  assert.match(res.text, /church\.css\?v=44/);
  assert.match(res.text, /Get in Touch/);
  assert.match(res.text, /Send a Message|Send us a Message/);
  assert.match(res.text, /Office Hours/);
  assert.match(res.text, /Join Us This Sunday/);
  assert.match(res.text, /contact-map-mobile\.jpg/);
  assert.match(res.text, /contact-map-desktop\.jpg/);
  assert.doesNotMatch(res.text, /GetPro Church/);
});

test("ministries page includes Stitch section markers", async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/ministries");
  assert.equal(res.status, 200);
  assert.match(res.text, /church\.css\?v=44/);
  assert.match(res.text, /Growing Together in Faith/);
  assert.match(res.text, /OUR COMMUNITY/);
  assert.match(res.text, /church-ministries-bento/);
  assert.match(res.text, /Not sure where to start/);
  assert.doesNotMatch(res.text, /GetPro Church/);
});

test("events page includes Stitch section markers and assets", async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/events");
  assert.equal(res.status, 200);
  assert.match(res.text, /church\.css\?v=44/);
  assert.match(res.text, /Upcoming Events|Church Events/);
  assert.match(res.text, /church-event-card|church-event-mobile-card|church-event-featured/);
  assert.match(res.text, /event-1\.jpg|event-featured-mobile\.jpg/);
  assert.doesNotMatch(res.text, /GetPro Church/);
});

test("sermons page includes Stitch section markers and assets", async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/sermons");
  assert.equal(res.status, 200);
  assert.match(res.text, /church\.css\?v=44/);
  assert.match(res.text, /Media Library|Sermons &amp; Resources/);
  assert.match(res.text, /LATEST SERMON/);
  assert.match(res.text, /Study Resources/);
  assert.match(res.text, /youtube-nocookie\.com\/embed\//);
  assert.match(res.text, /church-sermon-video__frame/);
  assert.match(res.text, /<audio[^>]*controls/);
  assert.match(res.text, /sermon-demo\.mp3/);
  assert.match(res.text, /Download MP3/);
  assert.match(res.text, /sermon-notes-demo\.pdf/);
  assert.match(res.text, /Download PDF Notes/);
  assert.match(res.text, /Video Sermon/);
  assert.match(res.text, /Audio Sermon/);
  assert.match(res.text, /PDF Study Notes/);
  assert.match(res.text, /church-sermon-resource-card/);
  assert.doesNotMatch(res.text, /GetPro Church/);
});

test("sermons demo media assets exist on disk", () => {
  const dir = path.join(__dirname, "../public/church/demo-media");
  assert.ok(fs.existsSync(path.join(dir, "sermon-demo.mp3")), "missing sermon-demo.mp3");
  assert.ok(fs.existsSync(path.join(dir, "sermon-notes-demo.pdf")), "missing sermon-notes-demo.pdf");
});

test("giving page includes Stitch section markers and assets", async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/giving");
  assert.equal(res.status, 200);
  assert.match(res.text, /church\.css\?v=44/);
  assert.match(res.text, /Ways to Give/);
  assert.match(res.text, /Support Our Ministry/);
  assert.match(res.text, /Bank Transfer/);
  assert.match(res.text, /Mobile Money/);
  assert.match(res.text, /Scan to Give|Quick Scan to Give/);
  assert.match(res.text, /giving-qr-desktop\.jpg|giving-qr-mobile\.jpg/);
  assert.match(res.text, /church-giving-page/);
  assert.doesNotMatch(res.text, /GetPro Church/);
});

test("auth Stitch assets exist on disk", () => {
  const dir = path.join(__dirname, "../public/church/images/auth");
  for (const file of [
    "login-bg-desktop.jpg",
    "registration-submitted.jpg",
    "waiting-verification.jpg",
    "forgot-password.jpg",
  ]) {
    assert.ok(fs.existsSync(path.join(dir, file)), `missing auth asset ${file}`);
  }
});

test("member auth pages include Stitch markers and BlessBoard secondary branding", async () => {
  const app = makeBranchApp();
  const login = await request(app).get("/login");
  assert.equal(login.status, 200);
  assert.match(login.text, /church\.css\?v=44/);
  assert.match(login.text, /Member Access/);
  assert.match(login.text, /Powered by GetPro/);
  assert.match(login.text, /login-bg-desktop\.jpg/);
  assert.doesNotMatch(login.text, /GetPro Church/);

  const register = await request(app).get("/register");
  assert.equal(register.status, 200);
  assert.match(register.text, /Member Registration|Join Our Community/);
  assert.match(register.text, /Powered by GetPro/);
  assert.doesNotMatch(register.text, /GetPro Church/);

  const submitted = await request(app).get("/registration-submitted");
  assert.equal(submitted.status, 200);
  assert.match(submitted.text, /Registration Submitted/);
  assert.match(submitted.text, /registration-submitted\.jpg/);
  assert.match(submitted.text, /Powered by GetPro/);

  const forgot = await request(app).get("/forgot-password");
  assert.equal(forgot.status, 200);
  assert.match(forgot.text, /Forgot Password\?/);
  assert.match(forgot.text, /forgot-password\.jpg/);
  assert.match(forgot.text, /Powered by GetPro/);
});

test("all church shells reference church.css?v=44", () => {
  const shells = [
    "views/church/partials/public_shell_start.ejs",
    "views/church/partials/auth_shell_start.ejs",
    "views/church/partials/member_shell_start.ejs",
    "views/church/partials/leader_shell_start.ejs",
    "views/church/partials/hq_shell_start.ejs",
    "views/church/partials/branch_admin_shell_start.ejs",
    "views/partials/platform_admin_shell_start.ejs",
    "views/admin/blessboard_login.ejs",
    "views/church/public/not_found.ejs",
    "views/church/public/unavailable.ejs",
    "views/church/public/service_unavailable.ejs",
  ];
  for (const rel of shells) {
    const text = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
    assert.match(text, /church\.css\?v=44/, `${rel} should load church.css?v=44`);
  }
});
