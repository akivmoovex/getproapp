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
  { path: "/", markers: ["church-menu-btn", "bb-powered-by__getpro"] },
  { path: "/about", markers: ["church-about-page", "About Us", "Join Our Community", "bb-powered-by__getpro"] },
  { path: "/leadership", markers: ["church-leadership-page", "Meet Our Church Leadership", "Leadership details coming soon", "bb-powered-by__getpro"] },
  { path: "/contact", markers: ["Get in Touch", "Send a Message", "church-contact-page", "bb-powered-by__getpro"] },
  { path: "/events", markers: ["church-events-page", "Church Events", "No upcoming events yet", "bb-powered-by__getpro"] },
  { path: "/sermons", markers: ["church-sermons-page", "Sermons coming soon", "bb-powered-by__getpro"] },
  { path: "/ministries", markers: ["Growing Together in Faith", "bb-public-ministries", "bb-powered-by__getpro"] },
  { path: "/giving", markers: ["Ways to Give", "Giving details coming soon", "bb-powered-by__getpro"] },
  { path: "/login", markers: ["Member Access", "bb-powered-by__getpro", "data-auth-screen=\"login\""] },
  { path: "/register", markers: ["Member Registration", "bb-powered-by__getpro", "data-auth-screen=\"register\""] },
  { path: "/registration-submitted", markers: ["Registration Submitted", "bb-powered-by__getpro", "data-auth-screen=\"registration-submitted\""] },
  { path: "/forgot-password", markers: ["Forgot Password?", "bb-powered-by__getpro", "data-auth-screen=\"forgot-password\""] },
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

const GIVING_ASSETS = ["giving-qr-desktop.jpg", "giving-qr-mobile.jpg", "giving-qr-demo.png"];

test("church public shells reference church.css?v=47/48/49/50/51/52", () => {
  const publicShells = [
    "views/church/partials/public_shell_start.ejs",
    "views/church/partials/auth_shell_start.ejs",
    "views/church/public/not_found.ejs",
    "views/church/public/unavailable.ejs",
    "views/church/public/service_unavailable.ejs",
  ];
  for (const rel of publicShells) {
    const text = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
    assert.match(text, /church\.css\?v=((?:4[789]|50|51|52|53|54|55|56|57|58|59|60|61|62))/, `${rel} should load church.css?v=47–62`);
  }
  const publicStart = fs.readFileSync(
    path.join(__dirname, "../views/church/partials/public_shell_start.ejs"),
    "utf8"
  );
  assert.match(publicStart, /church\.css\?v=62/);
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

test("BlessBoard apex homepage includes updated CSS bundle v52", async () => {
  const app = makeVerticalApexApp();
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /church\.css\?v=62/);
  assert.match(res.text, new RegExp(BLESSBOARD_NAME));
  assert.match(res.text, /Powered by[\s\S]{0,120}?GetPro/);
});

test("BlessBoard apex homepage matches platform marketing markers", async () => {
  const app = makeVerticalApexApp();
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /bb-saas-hero/);
  assert.match(res.text, /home-desktop-design/);
  assert.match(res.text, /One digital home for your church/);
  assert.match(res.text, /Register Your Church/);
  assert.match(res.text, /Find Your Church/);
  assert.match(res.text, /Church Administrator Login/);
  assert.match(res.text, /bb-platform-pathways/);
  assert.match(res.text, /Core platform features/);
  assert.match(res.text, /How it works/);
  assert.match(res.text, /bb-saas-cta/);
  assert.match(res.text, /bb-powered-by__label/);
  assert.match(res.text, /bb-powered-by__getpro/);
  assert.match(res.text, /desktop-hero-auditorium\.jpg/);
  assert.match(res.text, /https:\/\/demo\.blessboard\.com/);
  assert.doesNotMatch(res.text, /https:\/\/demo\.blessboard\.com\/(login|register)/);
  assert.doesNotMatch(res.text, /GetPro Church/);
  assert.doesNotMatch(res.text, /data-tenant-home="1"/);
});

test("demo branch homepage matches tenant Stitch design markers", async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /data-tenant-home="1"/);
  assert.match(res.text, /data-tenant-header="1"/);
  assert.match(res.text, /data-tenant-brand="1"/);
  assert.match(res.text, /bb-tenant-home/);
  assert.match(res.text, /bb-tenant-hero/);
  assert.match(res.text, /home-mobile-design/);
  assert.match(res.text, /home-desktop-design/);
  assert.match(res.text, /Member Login/);
  assert.match(res.text, /Register as a Member/);
  assert.match(res.text, /Demo Church/);
  assert.match(res.text, /Demo Branch/);
  assert.match(res.text, /Mark Your Calendar|Upcoming/);
  assert.match(res.text, /Our Ministries|Ministries/);
  assert.match(res.text, /Connected Community|Give Now|Digital Giving/);
  assert.match(res.text, /Visit Us/);
  assert.match(res.text, /bb-tenant-hero__visual--fallback|bb-tenant-hero__fallback/);
  assert.match(res.text, /No upcoming events have been published yet/);
  assert.match(res.text, /There are no public announcements at this time/);
  assert.match(res.text, /Ministry information will be available soon/);
  assert.match(res.text, /bb-powered-by__label/);
  assert.match(res.text, /bb-powered-by__getpro/);
  assert.doesNotMatch(res.text, /bb-saas-hero/);
  assert.doesNotMatch(res.text, /GetPro Church/);
  assert.doesNotMatch(res.text, /mobile-map-kafue\.jpg/);
  assert.doesNotMatch(res.text, /15 members are nearby/);
  assert.doesNotMatch(res.text, /Annual Praise Night/);
  assert.doesNotMatch(res.text, /Find Your Church/);
});

test("branch homepage includes mobile drawer and tenant hero markup", async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /church-mobile-menu-btn/);
  assert.match(res.text, /church-mobile-drawer/);
  assert.match(res.text, /bb-tenant-hero/);
  assert.match(res.text, /church-brand-mark/);
  assert.match(res.text, /href="\/login"/);
  assert.match(res.text, /href="\/register"/);
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
  assert.match(shell, /church\.css\?v=47/);
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
  assert.match(res.text, /church\.css\?v=62/);
  assert.match(res.text, /church-about-page/);
  assert.match(res.text, /About Us/);
  assert.match(res.text, /Our Story|About details coming soon|Christ-centered community/);
  assert.match(res.text, /Join Our Community/);
  assert.match(res.text, /about-branch-building\.jpg/);
  assert.doesNotMatch(res.text, /1988|1,200\+|Watch Our Story|Download Annual Report/);
  assert.doesNotMatch(res.text, /Plot 452, Lusaka Road, Kafue/);
  assert.doesNotMatch(res.text, /Rooted in Grace|Service Culture/);
  assert.match(res.text, /href="\/about"/);
  assert.match(res.text, /href="\/leadership"/);
  assert.doesNotMatch(res.text, /GetPro Church/);
});

test("leadership page includes Stitch section markers and empty state", async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/leadership");
  assert.equal(res.status, 200);
  assert.match(res.text, /church\.css\?v=62/);
  assert.match(res.text, /church-leadership-page/);
  assert.match(res.text, /Meet Our Church Leadership/);
  assert.match(res.text, /Leadership details coming soon|church-empty-state/);
  assert.doesNotMatch(res.text, /Dr\. Samuel Chiluba|Ministry Leaders|Isaac Banda|Contact Pastor/);
  assert.doesNotMatch(res.text, /pastor-desktop\.jpg|elder-1\.jpg/);
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
  assert.match(res.text, /church\.css\?v=62/);
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

  assert.match(res.text, /href="\/login"[^>]*>Member Login</);
  assert.match(res.text, /href="\/register"[^>]*>Register as a Member</);
  assert.match(res.text, /church-mobile-menu-btn/);
  assert.match(res.text, /church-mobile-drawer/);
  assert.match(res.text, /Sermons &amp; Resources/);
  assert.equal((res.text.match(/church-nav--branch/g) || []).length, 1);
});

test("apex desktop nav includes platform links with stable hrefs", async () => {
  const app = makeVerticalApexApp();
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /church\.css\?v=62/);
  assert.match(res.text, /church-nav--apex/);
  assert.match(res.text, /href="\/"[^>]*>Home</);
  assert.match(res.text, /href="\/features"[^>]*>Features</);
  assert.match(res.text, /href="\/for-churches"[^>]*>For Churches</);
  assert.match(res.text, /href="\/multi-branch"[^>]*>Multi-Branch</);
  assert.match(res.text, /href="\/churches"[^>]*>Find a Church</);
  assert.match(res.text, /href="\/about"[^>]*>About</);
  assert.match(res.text, /href="\/contact"[^>]*>Contact</);
  assert.match(res.text, /href="\/register-church"[^>]*>Register Your Church</);
  assert.match(res.text, /id="features"/);
  assert.doesNotMatch(res.text, /church-nav--branch/);
  assert.doesNotMatch(res.text, /href="\/leadership"/);
  assert.doesNotMatch(res.text, /href="\/ministries"/);
  assert.doesNotMatch(res.text, /href="\/events"/);
  assert.doesNotMatch(res.text, /href="\/sermons"/);
  assert.doesNotMatch(res.text, /href="\/giving"/);
});

test("apex mobile drawer includes platform navigation and CTAs", async () => {
  const app = makeVerticalApexApp();
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /id="church-mobile-menu-btn"/);
  assert.match(res.text, /church-drawer--apex/);
  assert.match(res.text, /id="church-mobile-drawer"/);
  const drawerMatch = res.text.match(/church-drawer--apex[\s\S]*?<nav class="church-drawer__nav">([\s\S]*?)<\/nav>/);
  assert.ok(drawerMatch, "apex mobile drawer nav should be present");
  const drawerHtml = drawerMatch[1];
  assert.match(drawerHtml, /href="\/"/);
  assert.match(drawerHtml, /href="\/features"/);
  assert.match(drawerHtml, /href="\/for-churches"/);
  assert.match(drawerHtml, /href="\/multi-branch"/);
  assert.match(drawerHtml, /href="\/churches"/);
  assert.match(drawerHtml, /href="\/about"/);
  assert.match(drawerHtml, /href="\/contact"/);
  assert.match(drawerHtml, /href="\/churches\?for=admin"[^>]*>Church Administrator Login</);
  assert.doesNotMatch(drawerHtml, /href="\/admin\/login"/);
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

test("contact page includes Stitch section markers without stock map assets", async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/contact");
  assert.equal(res.status, 200);
  assert.match(res.text, /church\.css\?v=62/);
  assert.match(res.text, /Get in Touch/);
  assert.match(res.text, /Send a Message|Send us a Message/);
  assert.match(res.text, /church-contact-page/);
  assert.doesNotMatch(res.text, /contact-map-mobile\.jpg/);
  assert.doesNotMatch(res.text, /contact-map-desktop\.jpg/);
  assert.doesNotMatch(res.text, /Plot 452, Main Street, Kafue/);
  assert.doesNotMatch(res.text, /Kafue Central/);
  assert.doesNotMatch(res.text, /KAFUE, ZAMBIA/);
  assert.doesNotMatch(res.text, /GetPro Church/);
});

test("ministries page includes Stitch section markers", async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/ministries");
  assert.equal(res.status, 200);
  assert.match(res.text, /church\.css\?v=62/);
  assert.match(res.text, /data-ministries-page="1"/);
  assert.match(res.text, /Growing Together in Faith|Our Ministries/);
  assert.match(res.text, /Our Community/);
  assert.match(res.text, /bb-public-ministries|church-ministries-bento/);
  assert.match(res.text, /Still looking for your place|Ready to Get Involved/);
  assert.match(res.text, /Ministry information will be available soon/);
  assert.doesNotMatch(res.text, /Showing sample ministry layout/);
  assert.doesNotMatch(res.text, /Download Ministry Guide/);
  assert.doesNotMatch(res.text, /GetPro Church/);
});

test("events page includes Stitch section markers and empty state", async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/events");
  assert.equal(res.status, 200);
  assert.match(res.text, /church\.css\?v=62/);
  assert.match(res.text, /church-events-page/);
  assert.match(res.text, /Church Events/);
  assert.match(res.text, /No upcoming events yet|church-empty-state/);
  assert.doesNotMatch(res.text, /Annual Praise Night|Register to Attend|Event Details/);
  assert.doesNotMatch(res.text, /All Ministries|Search events|calendar_month/);
  assert.doesNotMatch(res.text, /GetPro Church/);
});

test("sermons page includes Stitch section markers and empty state without demo media", async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/sermons");
  assert.equal(res.status, 200);
  assert.match(res.text, /church\.css\?v=62/);
  assert.match(res.text, /church-sermons-page/);
  assert.match(res.text, /Sermons coming soon|church-empty-state/);
  assert.doesNotMatch(res.text, /sermons-toolbar|church-sermons-toolbar|Series|All Series/);
  assert.doesNotMatch(res.text, /Faith, Hope &amp; Purpose|Faith, Hope & Purpose/);
  assert.doesNotMatch(res.text, /sermon-demo\.mp3|Sermon Audio Podcast/);
  assert.doesNotMatch(res.text, /GetPro Church/);
});

test("sermons demo media assets exist on disk for optional uploads", () => {
  const dir = path.join(__dirname, "../public/church/demo-media");
  const mp3 = path.join(dir, "sermon-demo.mp3");
  const pdf = path.join(dir, "sermon-notes-demo.pdf");
  assert.ok(fs.existsSync(mp3), "missing sermon-demo.mp3");
  assert.ok(fs.existsSync(pdf), "missing sermon-notes-demo.pdf");
  const mp3Size = fs.statSync(mp3).size;
  assert.ok(mp3Size > 50_000, `sermon-demo.mp3 should be a longer demo (>50KB), got ${mp3Size}`);
  assert.ok(fs.statSync(pdf).size > 200, "sermon-notes-demo.pdf should not be empty");
});

test("giving page includes Stitch markers and empty state without demo QR", async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/giving");
  assert.equal(res.status, 200);
  assert.match(res.text, /church\.css\?v=62/);
  assert.match(res.text, /Ways to Give|Support Our Ministry|Giving details coming soon/);
  assert.match(res.text, /church-empty-state|church-giving-page/);
  assert.match(res.text, /church-giving-desktop|church-giving-mobile/);
  assert.doesNotMatch(res.text, /home-desktop-design|home-mobile-design/);
  assert.doesNotMatch(res.text, /giving-qr-demo\.png/);
  assert.doesNotMatch(res.text, /Demo QR code\. Replace this with the church/);
  assert.doesNotMatch(res.text, /5821 0000 4567 890/);
  assert.doesNotMatch(res.text, /GetPro Church/);
});

test("giving demo QR asset exists on disk for optional uploads", () => {
  const demo = path.join(__dirname, "../public/church/images/giving/giving-qr-demo.png");
  assert.ok(fs.existsSync(demo), "missing giving-qr-demo.png");
  assert.ok(fs.statSync(demo).size > 1000, "giving-qr-demo.png should be a real image");
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
  assert.match(login.text, /church\.css\?v=47/);
  assert.match(login.text, /Member Access/);
  assert.match(login.text, /Powered by[\s\S]{0,120}?GetPro/);
  assert.match(login.text, /login-bg-desktop\.jpg/);
  assert.doesNotMatch(login.text, /GetPro Church/);

  const register = await request(app).get("/register");
  assert.equal(register.status, 200);
  assert.match(register.text, /Member Registration|Join Our Community/);
  assert.match(register.text, /Powered by[\s\S]{0,120}?GetPro/);
  assert.doesNotMatch(register.text, /GetPro Church/);

  const submitted = await request(app).get("/registration-submitted");
  assert.equal(submitted.status, 200);
  assert.match(submitted.text, /Registration Submitted/);
  assert.match(submitted.text, /registration-submitted\.jpg/);
  assert.match(submitted.text, /Powered by[\s\S]{0,120}?GetPro/);

  const forgot = await request(app).get("/forgot-password");
  assert.equal(forgot.status, 200);
  assert.match(forgot.text, /Forgot Password\?/);
  assert.match(forgot.text, /forgot-password\.jpg/);
  assert.match(forgot.text, /Powered by[\s\S]{0,120}?GetPro/);
});

test("all church shells reference versioned church.css", () => {
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
    assert.match(text, /church\.css\?v=\d+/, `${rel} should load versioned church.css`);
  }
});
