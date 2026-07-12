"use strict";

const path = require("path");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const churchRoutes = require("../src/routes/church");
const { BLESSBOARD_NAME } = require("../src/church/branding");

function makeTenantApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = {
      kind: "branch",
      orgSlug: "demo",
      organization: { id: 1, name: "Alpha Grace Church", status: "active" },
      branch: {
        id: 1,
        name: "Downtown Branch",
        status: "active",
        host_slug: "demo",
      },
    };
    next();
  });
  app.use(churchRoutes());
  return app;
}

function makeApexApp() {
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

function countTopLevelNavLabels(navHtml) {
  const labels = [];
  const linkRe = /<a[^>]*class="[^"]*church-nav__active[^"]*"[^>]*>([^<]+)<\/a>|<a href="[^"]+">([^<]+)<\/a>/g;
  let m;
  while ((m = linkRe.exec(navHtml)) !== null) {
    const text = (m[1] || m[2] || "").trim();
    if (text && !text.includes("&")) labels.push(text);
  }
  const trigger = navHtml.match(/church-nav-dropdown__trigger[^>]*>([^<]+)/);
  if (trigger) labels.push(trigger[1].trim());
  return labels;
}

test("tenant desktop nav uses Home, About, Explore, Contact only", async () => {
  const res = await request(makeTenantApp()).get("/");
  const header = res.text.match(/data-tenant-header="1"[\s\S]*?<\/header>/);
  assert.ok(header);
  assert.match(header[0], />Home</);
  assert.match(header[0], />About</);
  assert.match(header[0], /Explore/);
  assert.match(header[0], />Contact</);
  const topLevel = header[0].match(/<nav class="church-nav church-nav--branch"[\s\S]*?<\/nav>/);
  assert.ok(topLevel);
  const beforeDropdown = topLevel[0].split('<div class="church-nav-dropdown"')[0];
  assert.doesNotMatch(beforeDropdown, />Leadership</);
  assert.doesNotMatch(beforeDropdown, />Ministries</);
  assert.doesNotMatch(beforeDropdown, />Giving</);
  assert.doesNotMatch(beforeDropdown, />Events</);
  assert.doesNotMatch(beforeDropdown, />Sermons</);
});

test("Explore dropdown links to tenant public routes", async () => {
  const res = await request(makeTenantApp()).get("/leadership");
  assert.match(res.text, /id="tenant-explore-menu"/);
  assert.match(res.text, /role="menuitem"[^>]*href="\/leadership"|href="\/leadership"[^>]*role="menuitem"/);
  assert.match(res.text, /role="menuitem"[^>]*href="\/ministries"|href="\/ministries"[^>]*role="menuitem"/);
  assert.match(res.text, /role="menuitem"[^>]*href="\/events"|href="\/events"[^>]*role="menuitem"/);
  assert.match(res.text, /role="menuitem"[^>]*href="\/sermons"|href="\/sermons"[^>]*role="menuitem"/);
  assert.match(res.text, />Sermons &amp; Resources</);
  assert.match(res.text, /data-nav-dropdown/);
  assert.match(res.text, /aria-haspopup="true"/);
});

test("mobile drawer retains all public links including Giving", async () => {
  const res = await request(makeTenantApp()).get("/");
  const drawer = res.text.match(/id="church-mobile-drawer"[\s\S]*?<\/aside>/);
  assert.ok(drawer);
  for (const label of [
    "Home",
    "About",
    "Leadership",
    "Ministries",
    "Events",
    "Sermons &amp; Resources",
    "Giving",
    "Contact",
  ]) {
    assert.match(drawer[0], new RegExp(label));
  }
});

test("active navigation state for About and Explore child routes", async () => {
  const about = await request(makeTenantApp()).get("/about");
  assert.match(about.text, /href="\/about"[^>]*church-nav__active/);

  const leadership = await request(makeTenantApp()).get("/leadership");
  assert.match(leadership.text, /church-nav-dropdown__trigger[^>]*church-nav__active/);
  assert.match(leadership.text, /href="\/leadership"[^>]*church-nav-dropdown__link--active/);

  const sermons = await request(makeTenantApp()).get("/sermons");
  assert.match(sermons.text, /href="\/sermons"[^>]*church-nav-dropdown__link--active/);
});

test("apex marketing nav remains unchanged without tenant Explore menu", async () => {
  const res = await request(makeApexApp()).get("/for-churches");
  assert.equal(res.status, 200);
  assert.match(res.text, /church-nav--apex/);
  assert.match(res.text, new RegExp(BLESSBOARD_NAME));
  assert.doesNotMatch(res.text, /tenant-explore-menu/);
  assert.doesNotMatch(res.text, /tenant_nav_desktop/);
  assert.doesNotMatch(res.text, /data-tenant-header="1"/);
});
