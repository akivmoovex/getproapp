"use strict";

const path = require("path");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const churchRoutes = require("../src/routes/church");

const PLATFORM_PAGES = ["/", "/features", "/for-churches", "/multi-branch", "/about", "/churches", "/contact"];

function makeApexApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = {
      kind: "vertical-apex",
      host: "blessboard.com",
      organization: null,
      branch: null,
    };
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
      host: "demo.blessboard.com",
      orgSlug: "demo",
      organization: { id: 1, name: "Demo Church", status: "active" },
      branch: { id: 1, name: "Demo Branch", status: "active", host_slug: "demo" },
    };
    next();
  });
  app.use(churchRoutes());
  return app;
}

function extractDesktopNav(html) {
  const match = html.match(/<nav class="church-nav church-nav--apex"[^>]*>([\s\S]*?)<\/nav>/);
  return match ? match[1] : "";
}

function extractDrawerNav(html) {
  const match = html.match(/church-drawer--apex[\s\S]*?<nav class="church-drawer__nav">([\s\S]*?)<\/nav>/);
  return match ? match[1] : "";
}

test("apex desktop nav uses simplified structure with Solutions dropdown", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/");
  const nav = extractDesktopNav(res.text);
  assert.ok(nav, "desktop nav should render");

  assert.match(nav, /href="\/features"[^>]*>Features</);
  assert.match(nav, /href="\/pricing"[^>]*>Pricing</);
  assert.match(nav, /church-nav-dropdown/);
  assert.match(nav, /id="platform-solutions-trigger"[^>]*>[\s\S]*Solutions/);
  assert.match(nav, /expand_more/);
  assert.match(nav, /role="menuitem"[^>]*href="\/for-churches"/);
  assert.match(nav, /church-nav-dropdown__label">For Churches</);
  assert.match(nav, /role="menuitem"[^>]*href="\/multi-branch"/);
  assert.match(nav, /church-nav-dropdown__label">Multi-Branch Churches</);
  assert.match(nav, /href="\/churches"[^>]*>Find a Church</);
  assert.match(nav, /href="\/about"[^>]*>About</);

  assert.doesNotMatch(nav, />Home</);
  assert.doesNotMatch(nav, /href="\/contact"/);
  assert.doesNotMatch(nav, /<a href="\/for-churches" class=/);
  assert.doesNotMatch(nav, /href="\/for-members"/);

  assert.match(res.text, /class="church-header__admin-link"[^>]*href="\/churches\?for=admin"[^>]*>Church Admin Login</);
  assert.match(res.text, /class="church-btn church-btn--primary[^"]*"[^>]*href="\/register-church"[^>]*>Register Your Church</);
  assert.match(res.text, /bb-powered-by__getpro/);
  assert.match(res.text, /Powered by/);
  assert.match(res.text, /home-desktop-design/);
  assert.match(res.text, /home-mobile-design/);
  assert.match(res.text, /bb-apex-hero/);
});

test("apex desktop nav renders on main platform pages", async () => {
  const app = makeApexApp();
  for (const routePath of PLATFORM_PAGES) {
    const res = await request(app).get(routePath);
    assert.equal(res.status, 200, `${routePath} should render`);
    assert.match(extractDesktopNav(res.text), /Solutions/, `${routePath} should include Solutions`);
    assert.match(res.text, /church\.css\?v=65/);
  }
});

test("apex mobile drawer includes full public links including Contact", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/");
  const drawer = extractDrawerNav(res.text);
  for (const href of [
    'href="/"',
    'href="/features"',
    'href="/pricing"',
    'href="/for-churches"',
    'href="/multi-branch"',
    'href="/churches"',
    'href="/about"',
    'href="/contact"',
    'href="/demo"',
    'href="/faq"',
  ]) {
    assert.match(drawer, new RegExp(href), `drawer should include ${href}`);
  }
  assert.match(drawer, /href="\/churches\?for=admin"/);
});

test("apex Solutions dropdown includes keyboard support script", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/features");
  assert.match(res.text, /data-nav-dropdown/);
  assert.match(res.text, /aria-controls="platform-solutions-menu"/);
  assert.match(res.text, /role="menuitem"/);
  assert.match(res.text, /church-nav-dropdown__trigger/);
});

test("tenant branch header is unchanged", async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /church-nav--branch/);
  assert.match(res.text, /data-tenant-header="1"/);
  assert.doesNotMatch(res.text, /church-nav--apex/);
  assert.doesNotMatch(res.text, /platform-solutions-menu/);
  assert.doesNotMatch(res.text, /Church Admin Login/);
  assert.match(res.text, /Member Login/);
});
