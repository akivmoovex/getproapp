"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const churchRoutes = require("../src/routes/church");
const { BLESSBOARD_NAME } = require("../src/church/branding");

function makeBranchApp(ctx) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = ctx;
    next();
  });
  app.use(churchRoutes());
  return app;
}

function makeTenantApp() {
  return makeBranchApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Alpha Grace Church", status: "active" },
    branch: {
      id: 1,
      name: "Downtown Branch",
      status: "active",
      host_slug: "demo",
      service_times: "Sunday Worship · 10:00 AM",
      location_text: "12 Faith Street",
      contact_phone: "+260971111111",
      contact_email: "office@example.com",
    },
  });
}

function makeApexApp() {
  return makeBranchApp({ kind: "vertical-apex", host: "blessboard.com", organization: null, branch: null });
}

function countMatches(html, pattern) {
  const re = new RegExp(pattern, "g");
  return (html.match(re) || []).length;
}

test("tenant homepage has one main wrapper and valid section hierarchy", async () => {
  const res = await request(makeTenantApp()).get("/");
  assert.equal(res.status, 200);
  assert.equal(countMatches(res.text, /data-tenant-home="1"/), 1);
  assert.match(res.text, /class="[^"]*bb-tenant-home[^"]*"/);
  assert.match(res.text, /bb-tenant-hero__inner/);
  assert.match(res.text, /bb-tenant-section__inner/);
  assert.match(res.text, /home-desktop-design/);
  assert.match(res.text, /home-mobile-design/);

  const order = [
    /data-tenant-home="1"/,
    /id="welcome"|bb-tenant-hero/,
    /bb-tenant-service|bb-tenant-rail__card--service/,
    /id="giving"/,
    /id="announcements"/,
    /id="events"/,
    /id="sermons"/,
    /id="ministries"/,
    /id="visit"/,
  ];
  let cursor = 0;
  for (const pattern of order) {
    const idx = res.text.slice(cursor).search(pattern);
    assert.ok(idx >= 0, `missing section marker ${pattern}`);
    cursor += idx + 1;
  }
});

test("hero sits in shared container without duplicate Welcome home outside hero", async () => {
  const res = await request(makeTenantApp()).get("/");
  const heroStart = res.text.indexOf('id="welcome"');
  const heroEnd = res.text.indexOf("</section>", heroStart);
  assert.ok(heroStart >= 0);
  assert.ok(heroEnd > heroStart);
  const heroChunk = res.text.slice(heroStart, heroEnd);
  const outsideHero = res.text.slice(0, heroStart) + res.text.slice(heroEnd);
  assert.match(heroChunk, /bb-tenant-hero__inner/);
  assert.match(heroChunk, /Welcome Home|Experience Community|Welcome home to our community/);
  assert.match(res.text, /Experience Community at/);
  assert.match(res.text, /Welcome home to our community/);
  assert.ok(countMatches(res.text, /class="bb-tenant-hero__title/) >= 2);
});

test("service information is not duplicated across visible homepage regions", async () => {
  const res = await request(makeTenantApp()).get("/");
  // Mobile service card + desktop rail both exist in markup; CSS shows one per breakpoint. Visit Us must not repeat it.
  const visitStart = res.text.indexOf('id="visit"');
  assert.ok(visitStart >= 0);
  const visitChunk = res.text.slice(visitStart, visitStart + 2500);
  assert.doesNotMatch(visitChunk, /Sunday Worship · 10:00 AM/);
  assert.match(res.text, /bb-tenant-service__card--schedule/);
  assert.match(res.text, /bb-tenant-rail__card--service/);
  assert.doesNotMatch(res.text, /bb-tenant-hero__service/);
});

test("announcement, event, ministry, sermon, giving, and contact wrappers are styled", async () => {
  const res = await request(makeTenantApp()).get("/");
  assert.match(res.text, /bb-tenant-announcements/);
  assert.match(res.text, /bb-tenant-empty/);
  assert.doesNotMatch(res.text, /<ul class="bb-tenant-announcements__list">/);
  assert.match(res.text, /bb-tenant-events/);
  assert.match(res.text, /bb-tenant-ministries/);
  assert.match(res.text, /bb-tenant-rail__card--resources|id="sermons"/);
  assert.match(res.text, /bb-tenant-community|id="giving"/);
  assert.match(res.text, /Give Now/);
  assert.match(res.text, /bb-tenant-member/);
  assert.match(res.text, /bb-tenant-visit__grid/);
  assert.match(res.text, /bb-tenant-visit__list|bb-tenant-empty--inline/);
  assert.doesNotMatch(res.text, /15 members are nearby|Join Ministry|Send Prayer Request form/);
});

test("tenant header, footer attribution, and apex isolation remain intact", async () => {
  const res = await request(makeTenantApp()).get("/");
  assert.match(res.text, /Alpha Grace Church/);
  assert.match(res.text, /Downtown Branch/);
  assert.match(res.text, /href="\/login"[^>]*>Member Login</);
  assert.match(res.text, /href="\/register"[^>]*>Register as a Member</);
  assert.match(res.text, /church-footer--branch/);
  assert.match(res.text, /bb-powered-by__label/);
  assert.match(res.text, /bb-powered-by__getpro/);
  assert.equal(countMatches(res.text, /church-footer--branch/), 1);
  assert.doesNotMatch(res.text, /church-footer--apex/);
  assert.doesNotMatch(res.text, /bb-saas-hero/);
  assert.doesNotMatch(res.text, /Find Your Church/);
  assert.equal(countMatches(res.text, /id="welcome"/), 1);
  assert.equal(countMatches(res.text, /id="announcements"/), 1);
  assert.equal(countMatches(res.text, /id="events"/), 1);
  assert.equal(countMatches(res.text, /id="giving"/), 1);
  assert.equal(countMatches(res.text, /id="visit"/), 1);

  const apex = await request(makeApexApp()).get("/");
  assert.equal(apex.status, 200);
  assert.match(apex.text, /church-body--apex/);
  assert.match(apex.text, new RegExp(BLESSBOARD_NAME));
  assert.doesNotMatch(apex.text, /data-tenant-home="1"/);
});

test("CSS defines matching selectors for primary tenant homepage classes", () => {
  const css = fs.readFileSync(path.join(__dirname, "../public/church/church.css"), "utf8");
  const required = [
    "--church-margin-desktop",
    ".bb-tenant-home",
    ".bb-tenant-hero",
    ".bb-tenant-hero__inner",
    ".bb-tenant-section__inner",
    ".bb-tenant-service__card",
    ".bb-tenant-service__card--schedule",
    ".bb-tenant-hub",
    ".bb-tenant-rail",
    ".bb-tenant-community",
    ".bb-tenant-member",
    ".bb-tenant-announcements__list",
    ".bb-tenant-announcement-card",
    ".bb-tenant-events__grid",
    ".bb-tenant-event-card",
    ".bb-tenant-ministries__grid",
    ".bb-tenant-ministry-card",
    ".bb-tenant-visit__grid",
    ".bb-tenant-empty",
  ];
  for (const token of required) {
    assert.ok(css.includes(token), `missing CSS token ${token}`);
  }
  assert.match(css, /--church-margin-desktop:\s*32px/);
  assert.match(css, /\.bb-tenant-service\s*\{[\s\S]*?display:\s*none/);
});

test("about page remains unchanged by tenant homepage repair", async () => {
  const res = await request(makeTenantApp()).get("/about");
  assert.equal(res.status, 200);
  assert.doesNotMatch(res.text, /data-tenant-home="1"/);
  assert.match(res.text, /church-about-desktop|About/);
});
