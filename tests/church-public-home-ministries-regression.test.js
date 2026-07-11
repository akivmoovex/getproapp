"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const ejs = require("ejs");

const churchRoutes = require("../src/routes/church");
const { BLESSBOARD_NAME } = require("../src/church/branding");
const websiteContentService = require("../src/services/church/websiteContentService");

const CSS_PATH = path.join(__dirname, "../public/church/church.css");
const HOME_PARTIAL = path.join(__dirname, "../views/church/partials/home_branch.ejs");
const MINISTRIES_VIEW = path.join(__dirname, "../views/church/public/ministries.ejs");
const ABOUT_VIEW = path.join(__dirname, "../views/church/public/about.ejs");
const CONTACT_VIEW = path.join(__dirname, "../views/church/public/contact.ejs");

function makeApp(ctx, { inject } = {}) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = ctx;
    next();
  });
  if (inject) {
    app.use((req, res, next) => {
      const render = res.render.bind(res);
      res.render = (view, locals, cb) => render(view, { ...(locals || {}), ...inject(view, locals || {}) }, cb);
      next();
    });
  }
  app.use(churchRoutes());
  return app;
}

function tenantCtx(extra = {}) {
  return {
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
      ...extra,
    },
  };
}

function makeTenantApp(opts) {
  return makeApp(tenantCtx(), opts);
}

function makeApexApp() {
  return makeApp({ kind: "vertical-apex", host: "blessboard.com", organization: null, branch: null });
}

function countMatches(html, pattern) {
  return (html.match(new RegExp(pattern, "g")) || []).length;
}

test("1-4 Home and Ministries routes and roots render", async () => {
  const home = await request(makeTenantApp()).get("/");
  const ministries = await request(makeTenantApp()).get("/ministries");
  assert.equal(home.status, 200);
  assert.equal(ministries.status, 200);
  assert.match(home.text, /data-tenant-home="1"|bb-tenant-home|church-home-page/);
  assert.match(ministries.text, /data-ministries-page="1"|bb-public-ministries/);
});

test("5-6 newest section order markers render", async () => {
  const home = await request(makeTenantApp()).get("/");
  const homeOrder = [
    /bb-tenant-hero/,
    /bb-tenant-community|id="giving"/,
    /id="announcements"/,
    /id="events"/,
    /bb-tenant-rail|id="sermons"/,
    /id="ministries"/,
    /bb-tenant-member/,
    /id="visit"/,
  ];
  let cursor = 0;
  for (const pattern of homeOrder) {
    const idx = home.text.slice(cursor).search(pattern);
    assert.ok(idx >= 0, `home missing ${pattern}`);
    cursor += idx + 1;
  }

  const ministries = await request(makeTenantApp()).get("/ministries");
  const minOrder = [/bb-ministries-hero/, /bb-ministries-empty|bb-ministries-grid/, /bb-ministries-cta/];
  cursor = 0;
  for (const pattern of minOrder) {
    const idx = ministries.text.slice(cursor).search(pattern);
    assert.ok(idx >= 0, `ministries missing ${pattern}`);
    cursor += idx + 1;
  }
});

test("7-12 real content paths and no demo injects", async () => {
  const emptyHome = await request(makeTenantApp()).get("/");
  assert.match(emptyHome.text, /There are no public announcements at this time|No Active Notices/);
  assert.match(emptyHome.text, /No upcoming events have been published yet/);
  assert.match(emptyHome.text, /Ministry information will be available soon/);
  assert.doesNotMatch(emptyHome.text, /Annual Praise Night|15 members are nearby|1\.2k\+/);
  assert.doesNotMatch(emptyHome.text, /Children's Ministry|mobile-map-kafue/);

  const populated = await request(
    makeApp(tenantCtx(), {
      inject: () => ({
        publicAnnouncements: [{ title: "Branch Notice", body: "Real announcement body.", category: "General" }],
        upcomingEvents: [{ title: "Prayer Night", day: "12", month: "JUL", time: "18:00", location: "Hall" }],
        hasDbEvents: true,
        publicMinistries: [{ name: "Youth Ministry", description: "Next generation discipleship." }],
        featuredSermon: { title: "Hope Remains", speaker: "Pastor Ada", date: "Sunday" },
        hasDbSermons: true,
      }),
    })
  ).get("/");
  assert.match(populated.text, /Branch Notice/);
  assert.match(populated.text, /Prayer Night/);
  assert.match(populated.text, /Youth Ministry/);
  assert.match(populated.text, /Hope Remains/);

  const emptyMin = await request(makeTenantApp()).get("/ministries");
  assert.match(emptyMin.text, /Ministry information will be available soon/);
  assert.doesNotMatch(emptyMin.text, /Kingdom Kids|Join Ministry|Download Ministry Guide/);
});

test("13-16 duplication and unsupported actions absent", async () => {
  const home = await request(makeTenantApp()).get("/");
  assert.equal(countMatches(home.text, /id="welcome"/), 1);
  assert.equal(countMatches(home.text, /bb-tenant-hero__title/), 1);
  assert.match(home.text, /bb-tenant-service__card--schedule/);
  assert.match(home.text, /bb-tenant-rail__card--service/);
  const visitChunk = home.text.slice(home.text.indexOf('id="visit"'));
  assert.doesNotMatch(visitChunk, /Sunday Worship · 10:00 AM/);
  assert.doesNotMatch(home.text, /Give Online Now|Other Ways to Give/);
  assert.doesNotMatch(home.text, /bottom-nav|Profile<\/button>|church-fab-add/);

  const ministries = await request(makeTenantApp()).get("/ministries");
  assert.doesNotMatch(ministries.text, /Join Ministry|Contact Leader|View Profile|Submit Request|Download Guide/);
  assert.doesNotMatch(ministries.text, /500\+|GLOBAL MISSIONS|View Active Projects/);
});

test("17-19 filters only with real values; empty states", async () => {
  const noFilter = await request(makeTenantApp()).get("/ministries");
  assert.doesNotMatch(noFilter.text, /data-ministry-filter="/);

  const withFilters = await request(
    makeApp(tenantCtx(), {
      inject: () => ({
        ministries: [
          { name: "Youth", description: "Youth group", meeting_day: "Friday", meeting_time: "16:00" },
          { name: "Kids", description: "Children", meeting_day: "Sunday", meeting_time: "09:00" },
        ],
        ministryFilters: [
          { key: "all", label: "All Ministries" },
          { key: "friday", label: "Friday" },
          { key: "sunday", label: "Sunday" },
        ],
      }),
    })
  ).get("/ministries");
  assert.match(withFilters.text, /data-ministry-filter="all"/);
  assert.match(withFilters.text, /data-ministry-filter="friday"/);
  assert.match(withFilters.text, /bb-ministries-grid/);
  assert.match(withFilters.text, /Learn More/);
});

test("20-27 desktop/mobile markers, nav, login/register, footer", async () => {
  const home = await request(makeTenantApp()).get("/");
  const ministries = await request(makeTenantApp()).get("/ministries");
  assert.match(home.text, /church-home-desktop|home-desktop-design/);
  assert.match(home.text, /church-home-mobile|home-mobile-design/);
  assert.match(ministries.text, /church-ministries-desktop/);
  assert.match(ministries.text, /church-ministries-mobile/);
  assert.match(home.text, /church-nav__active[^>]*>\s*Home|href="\/"[^>]*church-nav__active/);
  assert.match(ministries.text, /href="\/ministries"[^>]*church-nav__active|church-nav__active[^>]*>\s*Ministries/);
  assert.match(home.text, /Member Login/);
  assert.match(home.text, /Register as a Member/);
  assert.match(ministries.text, /Member Login/);
  assert.match(ministries.text, /Register as a Member/);
  assert.match(home.text, /bb-powered-by__getpro/);
  assert.equal(countMatches(home.text, 'class="bb-powered-by"'), 1);
  assert.equal(countMatches(home.text, /church-footer--branch/), 1);
  assert.match(home.text, /Ask for Prayer/);
  assert.doesNotMatch(home.text, /Send Prayer Request/);
});

test("28-32 completed pages unchanged, apex unchanged, no duplicate IDs, CSS safe", async () => {
  const app = makeTenantApp();
  for (const [route, marker] of [
    ["/about", /church-about-page/],
    ["/leadership", /church-leadership-page/],
    ["/events", /church-events-page/],
    ["/sermons", /church-sermons-page/],
    ["/giving", /church-giving-page/],
    ["/contact", /church-contact-page/],
  ]) {
    const res = await request(app).get(route);
    assert.equal(res.status, 200, route);
    assert.match(res.text, marker);
  }

  assert.match(fs.readFileSync(ABOUT_VIEW, "utf8"), /church-about-page/);
  assert.match(fs.readFileSync(CONTACT_VIEW, "utf8"), /church-contact-page/);

  const apex = await request(makeApexApp()).get("/");
  assert.equal(apex.status, 200);
  assert.match(apex.text, new RegExp(BLESSBOARD_NAME));
  assert.doesNotMatch(apex.text, /data-tenant-home="1"/);

  const ministries = await request(makeTenantApp()).get("/ministries");
  assert.equal(countMatches(ministries.text, /id="ministry-grid"/), 0);

  const css = fs.readFileSync(CSS_PATH, "utf8");
  assert.match(css, /\.bb-tenant-hub\s*\{/);
  assert.match(css, /\.bb-ministries-grid\s*\{/);
  assert.match(css, /minmax\(0,\s*1fr\)/);
  assert.doesNotMatch(css, /\.bb-ministries-mobile\s*\{/);
});
