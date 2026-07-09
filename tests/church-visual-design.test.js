"use strict";

const path = require("path");
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
  { path: "/about", markers: ["church-page-hero", "Our Story", "Powered by GetPro"] },
  { path: "/leadership", markers: ["Our Leadership", "church-page-intro", "Powered by GetPro"] },
  { path: "/contact", markers: ["church-contact-layout", "Get in Touch", "Powered by GetPro"] },
  { path: "/events", markers: ["Events &amp; Calendar", "church-event-row", "Powered by GetPro"] },
  { path: "/sermons", markers: ["church-sermon-grid", "church-sermon-card", "Powered by GetPro"] },
  { path: "/ministries", markers: ["church-ministry-grid", "Ministries", "Powered by GetPro"] },
  { path: "/giving", markers: ["church-giving-page", "Giving", "Powered by GetPro"] },
  { path: "/login", markers: ["Member Login", "Powered by GetPro", "brand-lockup"] },
  { path: "/register", markers: ["Member Registration", "Powered by GetPro"] },
  { path: "/registration-submitted", markers: ["Registration submitted", "Powered by GetPro"] },
];

test("BlessBoard apex homepage includes updated CSS bundle v32", async () => {
  const app = makeVerticalApexApp();
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /church\.css\?v=32/);
  assert.match(res.text, new RegExp(BLESSBOARD_NAME));
  assert.match(res.text, /Powered by GetPro/);
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

test("branch homepage includes mobile drawer and branch hero markup", { skip: !isPgConfigured() }, async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /church-mobile-menu-btn/);
  assert.match(res.text, /church-mobile-drawer/);
  assert.match(res.text, /church-branch-mobile-hero/);
  assert.match(res.text, /church-service-scroller/);
  assert.match(res.text, /church-brand-mark/);
});

test("branch homepage does not use legacy horizontal mobile nav strip", { skip: !isPgConfigured() }, async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/");
  assert.doesNotMatch(res.text, /church-public-mobile-nav/);
});

test("sermons page uses sermon cards from DB when available", { skip: !isPgConfigured() }, async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/sermons");
  assert.equal(res.status, 200);
  assert.match(res.text, /church-sermon-card/);
});

test("branch admin shell includes mobile drawer and topbar markup", () => {
  const fs = require("fs");
  const shell = fs.readFileSync(
    path.join(__dirname, "../views/church/partials/branch_admin_shell_start.ejs"),
    "utf8"
  );
  assert.match(shell, /church-branch-menu-btn/);
  assert.match(shell, /church-branch-drawer/);
  assert.match(shell, /church-branch-mobile-topbar/);
  assert.match(shell, /church\.css\?v=32/);
});

test("platform host does not expose branch-only public events route", async () => {
  const app = makePlatformApp();
  const res = await request(app).get("/events");
  assert.equal(res.status, 404);
});
