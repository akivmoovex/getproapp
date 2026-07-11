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
const eventsRepo = require("../src/db/pg/church/eventsRepo");
const sermonsRepo = require("../src/db/pg/church/sermonsRepo");

const CSS_PATH = path.join(__dirname, "../public/church/church.css");
const EVENTS_VIEW = path.join(__dirname, "../views/church/public/events.ejs");
const SERMONS_VIEW = path.join(__dirname, "../views/church/public/sermons.ejs");
const ABOUT_VIEW = path.join(__dirname, "../views/church/public/about.ejs");
const LEADERSHIP_VIEW = path.join(__dirname, "../views/church/public/leadership.ejs");
const PUBLIC_PAGES = path.join(__dirname, "../src/routes/church/publicPages.js");
const EVENTS_REPO = path.join(__dirname, "../src/db/pg/church/eventsRepo.js");
const SERMONS_REPO = path.join(__dirname, "../src/db/pg/church/sermonsRepo.js");

function makeApp(ctx) {
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

function tenantCtx() {
  return {
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Alpha Grace Church", status: "active" },
    branch: {
      id: 1,
      name: "Downtown Branch",
      status: "active",
      host_slug: "demo",
      location_text: "12 Faith Street",
    },
  };
}

function makeTenantApp() {
  return makeApp(tenantCtx());
}

function makeApexApp() {
  return makeApp({ kind: "vertical-apex", host: "blessboard.com", organization: null, branch: null });
}

function baseLocals(activePage) {
  return {
    ...websiteContentService.preparePublicViewModel(
      tenantCtx().organization,
      tenantCtx().branch,
      {},
      { activePage }
    ),
    isVerticalApex: false,
    isPreview: false,
    metaDescription: "",
    blessboardPublicUrl: "https://blessboard.com",
  };
}

async function renderView(viewPath, locals) {
  return ejs.renderFile(viewPath, locals, { root: path.join(__dirname, "../views") });
}

test("1-4 Events and Sermons routes and page roots render", async () => {
  const app = makeTenantApp();
  const events = await request(app).get("/events");
  const sermons = await request(app).get("/sermons");
  assert.equal(events.status, 200);
  assert.equal(sermons.status, 200);
  assert.match(events.text, /church-events-page/);
  assert.match(events.text, /data-events-page="1"/);
  assert.match(sermons.text, /church-sermons-page/);
  assert.match(sermons.text, /data-sermons-page="1"/);
});

test("5-10 published/demo event rendering and unsupported controls", async () => {
  const empty = await request(makeTenantApp()).get("/events");
  assert.match(empty.text, /No upcoming events yet/);
  assert.doesNotMatch(empty.text, /Annual Praise Night|Register to Attend|Buy Ticket|Add to Calendar|View Details|Event Details/);
  assert.doesNotMatch(empty.text, /All Ministries|Search events|calendar_month|Load more events/);
  assert.doesNotMatch(empty.text, /event-1\.jpg|event-featured-mobile\.jpg/);

  const html = await renderView(EVENTS_VIEW, {
    ...baseLocals("events"),
    upcomingEvents: [
      {
        title: "Community Prayer Night",
        day: "24",
        month: "OCT",
        time: "18:00 – 20:00",
        location: "Main Sanctuary",
        category: "Worship",
        description: "An evening of prayer and worship.",
        image: "",
      },
    ],
  });
  assert.match(html, /Community Prayer Night/);
  assert.match(html, /Main Sanctuary/);
  assert.match(html, /18:00 – 20:00/);
  assert.match(html, /church-events-page__date-badge/);
  assert.doesNotMatch(html, /Register to Attend|Event Details|Buy Ticket/);
  assert.doesNotMatch(html, /event-1\.jpg/);
});

test("6-7-13 publication and tenant scoping remain in repositories", () => {
  const eventsSrc = fs.readFileSync(EVENTS_REPO, "utf8");
  const sermonsSrc = fs.readFileSync(SERMONS_REPO, "utf8");
  assert.match(eventsSrc, /status = 'published'/);
  assert.match(eventsSrc, /visibility = 'public'/);
  assert.match(eventsSrc, /branch_id = \$1/);
  assert.match(sermonsSrc, /status = 'published'/);
  assert.match(sermonsSrc, /branch_id = \$1/);
  assert.equal(typeof eventsRepo.listPublicEventsForBranch, "function");
  assert.equal(typeof sermonsRepo.listPublicSermonsForBranch, "function");
});

test("11-16 published sermons, safe media, and no demo media", async () => {
  const empty = await request(makeTenantApp()).get("/sermons");
  assert.match(empty.text, /Sermons coming soon/);
  assert.doesNotMatch(empty.text, /Faith, Hope &amp; Purpose|sermon-demo\.mp3|youtube-nocookie\.com\/embed\/M7lc1UVf-VE/);
  assert.doesNotMatch(empty.text, /Sermon Audio Podcast|All Series|Sort sermons/);

  const html = await renderView(SERMONS_VIEW, {
    ...baseLocals("sermons"),
    sermonSamples: [
      {
        title: "Walking in the Light",
        speaker: "Rev. Ada Banda",
        date: "12 Nov 2024",
        scripture: "1 John 1:5-7",
        description: "A message on living in the light of Christ.",
        media_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        videoEmbedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
        videoUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
        audioUrl: null,
        pdfUrl: null,
        mediaType: "video",
        category: "Sunday Sermon",
        icon: "play_circle",
      },
      {
        title: "Faith in Uncertain Times",
        speaker: "Elder Levi Phiri",
        date: "5 Nov 2024",
        scripture: "",
        description: "",
        media_url: "https://example.com/sermon-audio.mp3",
        videoEmbedUrl: null,
        videoUrl: null,
        audioUrl: null,
        pdfUrl: null,
        mediaType: "audio",
        category: "Midweek",
        icon: "headphones",
      },
    ],
  });
  assert.match(html, /Walking in the Light/);
  assert.match(html, /Faith in Uncertain Times/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /church-sermons-page__card/);
  assert.doesNotMatch(html, /sermon-1\.jpg|sermon-demo\.mp3|Sermon Audio Podcast/);
  assert.doesNotMatch(html, /Playlists|View Archive|fake series/);
});

test("17-18 empty states render", async () => {
  const events = await request(makeTenantApp()).get("/events");
  const sermons = await request(makeTenantApp()).get("/sermons");
  assert.match(events.text, /church-public-empty-state|church-empty-state/);
  assert.match(sermons.text, /church-public-empty-state|church-empty-state/);
});

test("19-22 desktop and mobile class markers render", async () => {
  const events = await request(makeTenantApp()).get("/events");
  const sermons = await request(makeTenantApp()).get("/sermons");
  assert.match(events.text, /church-events-desktop/);
  assert.match(events.text, /church-events-mobile/);
  assert.match(sermons.text, /church-sermons-desktop/);
  assert.match(sermons.text, /church-sermons-mobile/);
});

test("23 Sermons CSS avoids horizontal overflow patterns", () => {
  const css = fs.readFileSync(CSS_PATH, "utf8");
  assert.match(css, /\.church-sermons-page__frame[\s\S]{0,120}?max-width:\s*100%/);
  assert.match(css, /\.church-sermons-page__grid[\s\S]{0,80}?minmax\(0,\s*1fr\)/);
  assert.match(css, /\.church-sermons-page__card[\s\S]{0,80}?min-width:\s*0/);
  assert.doesNotMatch(css, /\.church-sermons-filter-row[\s\S]{0,120}?flex-wrap:\s*nowrap/);
  assert.doesNotMatch(css, /\.church-sermons-search[\s\S]{0,80}?min-width:\s*16rem/);
});

test("24 unsupported actions absent", async () => {
  const events = await request(makeTenantApp()).get("/events");
  const sermons = await request(makeTenantApp()).get("/sermons");
  assert.doesNotMatch(events.text, /Register to Attend|Buy Ticket|Add to Calendar|View Details|Event Details/);
  assert.doesNotMatch(sermons.text, /Sermon Audio Podcast|View Past Series|View Archive|Playlists/);
});

test("25-27 active nav, Member Login, Register remain", async () => {
  const events = await request(makeTenantApp()).get("/events");
  assert.match(events.text, /href="\/events"[^>]*church-nav__active|class="church-nav__active">Events/);
  assert.match(events.text, /Member Login/);
  assert.match(events.text, /Register as a Member/);
  const sermons = await request(makeTenantApp()).get("/sermons");
  assert.match(sermons.text, /href="\/sermons"[^>]*church-nav__active|class="church-nav__active">Sermons/);
  assert.match(sermons.text, /Member Login/);
  assert.match(sermons.text, /Register as a Member/);
});

test("28 footer attribution appears once in tenant footer", async () => {
  const events = await request(makeTenantApp()).get("/events");
  const footer = events.text.match(/<footer class="church-footer church-footer--branch">[\s\S]*?<\/footer>/);
  assert.ok(footer);
  assert.equal((footer[0].match(/class="bb-powered-by"/g) || []).length, 1);
  assert.match(events.text, /bb-powered-by__label/);
  assert.match(events.text, /bb-powered-by__getpro/);
});

test("29-31 About, Leadership, Home, Ministries, apex unchanged", async () => {
  assert.match(fs.readFileSync(ABOUT_VIEW, "utf8"), /church-about-page/);
  assert.match(fs.readFileSync(LEADERSHIP_VIEW, "utf8"), /church-leadership-page/);
  const app = makeTenantApp();
  const about = await request(app).get("/about");
  const leadership = await request(app).get("/leadership");
  const home = await request(app).get("/");
  const ministries = await request(app).get("/ministries");
  assert.equal(about.status, 200);
  assert.equal(leadership.status, 200);
  assert.match(about.text, /church-about-page/);
  assert.match(leadership.text, /church-leadership-page/);
  assert.match(home.text, /bb-tenant-home|data-tenant-home="1"/);
  assert.match(ministries.text, /bb-public-ministries|data-ministries-page="1"/);
  const apex = await request(makeApexApp()).get("/");
  assert.equal(apex.status, 200);
  assert.match(apex.text, /church-body--apex/);
  assert.match(apex.text, new RegExp(BLESSBOARD_NAME));
});

test("32 no duplicate IDs", async () => {
  for (const route of ["/events", "/sermons"]) {
    const res = await request(makeTenantApp()).get(route);
    const ids = [...res.text.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    const seen = new Set();
    for (const id of ids) {
      assert.equal(seen.has(id), false, `duplicate id ${id} on ${route}`);
      seen.add(id);
    }
  }
});

test("33 mapping no longer injects stock event images", () => {
  const src = fs.readFileSync(PUBLIC_PAGES, "utf8");
  assert.doesNotMatch(src, /event-\$\{\(index % 4\) \+ 1\}\.jpg/);
  assert.doesNotMatch(src, /Church campus/);
  assert.doesNotMatch(src, /See details/);
  assert.match(src, /ministry_or_department/);
});

test("Events and Sermons do not use dual home-desktop/mobile trees", () => {
  const events = fs.readFileSync(EVENTS_VIEW, "utf8");
  const sermons = fs.readFileSync(SERMONS_VIEW, "utf8");
  assert.doesNotMatch(events, /home-desktop-design|home-mobile-design/);
  assert.doesNotMatch(sermons, /home-desktop-design|home-mobile-design/);
});
