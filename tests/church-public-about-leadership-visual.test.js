"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const churchRoutes = require("../src/routes/church");
const { BLESSBOARD_NAME } = require("../src/church/branding");
const websiteContentService = require("../src/services/church/websiteContentService");

const CSS_PATH = path.join(__dirname, "../public/church/church.css");
const ABOUT_VIEW = path.join(__dirname, "../views/church/public/about.ejs");
const LEADERSHIP_VIEW = path.join(__dirname, "../views/church/public/leadership.ejs");
const MINISTRIES_VIEW = path.join(__dirname, "../views/church/public/ministries.ejs");

function makeApp(ctx, { injectContent } = {}) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = ctx;
    next();
  });
  if (injectContent) {
    app.use((req, res, next) => {
      const render = res.render.bind(res);
      res.render = (view, locals, cb) => {
        const nextLocals = { ...(locals || {}), ...injectContent(view, locals || {}) };
        return render(view, nextLocals, cb);
      };
      next();
    });
  }
  app.use(churchRoutes());
  return app;
}

function tenantCtx(extraBranch = {}) {
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
      ...extraBranch,
    },
  };
}

function makeTenantApp(opts) {
  return makeApp(tenantCtx(), opts);
}

function makeApexApp() {
  return makeApp({ kind: "vertical-apex", host: "blessboard.com", organization: null, branch: null });
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

test("1-2 About and Leadership routes render", async () => {
  const app = makeTenantApp();
  const about = await request(app).get("/about");
  const leadership = await request(app).get("/leadership");
  assert.equal(about.status, 200);
  assert.equal(leadership.status, 200);
});

test("3-4 tenant church name and branch name render", async () => {
  const about = await request(makeTenantApp()).get("/about");
  assert.match(about.text, /Alpha Grace Church/);
  assert.match(about.text, /Downtown Branch/);
  const leadership = await request(makeTenantApp()).get("/leadership");
  assert.match(leadership.text, /Alpha Grace Church|Downtown Branch/);
});

test("5-8 page roots and hero structures render", async () => {
  const about = await request(makeTenantApp()).get("/about");
  assert.match(about.text, /church-about-page/);
  assert.match(about.text, /data-about-page="1"/);
  assert.match(about.text, /church-about-page__hero/);
  assert.match(about.text, /About Us/);

  const leadership = await request(makeTenantApp()).get("/leadership");
  assert.match(leadership.text, /church-leadership-page/);
  assert.match(leadership.text, /data-leadership-page="1"/);
  assert.match(leadership.text, /church-leadership-page__hero/);
  assert.match(leadership.text, /Meet Our Church Leadership/);
});

test("9-10 real About content renders; fake history/stats absent", async () => {
  const app = makeTenantApp();
  const res = await request(app).get("/about");
  assert.match(res.text, /Our Story|About Downtown Branch|Christ-centered community/);
  assert.doesNotMatch(res.text, /Rooted in Grace|Growing in Community/);
  assert.doesNotMatch(res.text, /1984|1988|1,200\+|5k\+|Watch Our Story|Download Annual Report/);
  assert.doesNotMatch(res.text, /Service Culture|Excellence in Worship|Structured Compassion<\/h1>/);
  assert.doesNotMatch(res.text, /To make disciples of Jesus Christ who love God, love people/);
});

test("11-16 leadership empty, privacy, and avatar fallback", async () => {
  const empty = await request(makeTenantApp()).get("/leadership");
  assert.match(empty.text, /Leadership details coming soon/);
  assert.match(empty.text, /church-public-empty-state|church-empty-state/);
  assert.doesNotMatch(empty.text, /Dr\. Samuel Chiluba|Samuel Musonda|Isaac Banda|Sarah Mulenga/);
  assert.doesNotMatch(empty.text, /pastor-desktop\.jpg|elder-1\.jpg|ministry-1\.jpg/);
  assert.doesNotMatch(empty.text, /Contact Pastor|Office Hours|Playlists|Curriculum|View Profile|Schedule Meeting|Direct Message/);
  assert.doesNotMatch(empty.text, /office@example\.com|\+260971111111/);

  const ejs = require("ejs");
  const populatedLocals = websiteContentService.preparePublicViewModel(
    { id: 1, name: "Alpha Grace Church", status: "active" },
    {
      id: 1,
      name: "Downtown Branch",
      status: "active",
      host_slug: "demo",
      location_text: "12 Faith Street",
    },
    {
      about_title: "About Downtown",
      about_body: "A real published story about our branch.",
      mission_text: "Real mission text.",
      vision_text: "Real vision text.",
      values_text: "Grace|We live by grace.\nTruth|We teach truth.",
      leadership_json: {
        pastor: { name: "Pastor Ada Banda", title: "Senior Pastor", bio: "Shepherding with care." },
        assistant_pastor: { name: "Rev. Levi Phiri" },
        elders: ["Elder Ruth Tembo", "Elder Mark Zulu"],
      },
      footer_message: "Member registration and login are available.",
    },
    { activePage: "leadership" }
  );

  const html = await ejs.renderFile(
    LEADERSHIP_VIEW,
    {
      ...populatedLocals,
      isVerticalApex: false,
      isPreview: false,
      metaDescription: populatedLocals.welcomeMessage || "",
      blessboardPublicUrl: "https://blessboard.com",
    },
    { root: path.join(__dirname, "../views") }
  );

  assert.match(html, /Pastor Ada Banda/);
  assert.match(html, /Rev\. Levi Phiri/);
  assert.match(html, /Elder Ruth Tembo/);
  assert.match(html, /church-leadership-page__avatar/);
  assert.match(html, />PA</);
  assert.doesNotMatch(html, /pastor-desktop\.jpg|Contact Pastor|mailto:|tel:\+/);
  assert.doesNotMatch(html, /office@example\.com/);
});

test("17-20 desktop and mobile class markers render on unified trees", async () => {
  const about = await request(makeTenantApp()).get("/about");
  assert.match(about.text, /church-about-desktop/);
  assert.match(about.text, /church-about-mobile/);
  const leadership = await request(makeTenantApp()).get("/leadership");
  assert.match(leadership.text, /church-leadership-desktop/);
  assert.match(leadership.text, /church-leadership-mobile/);
});

test("21 unsupported actions absent on About and Leadership", async () => {
  const about = await request(makeTenantApp()).get("/about");
  assert.doesNotMatch(about.text, /Watch Our Story|Download Annual Report|Get Connected/);
  const leadership = await request(makeTenantApp()).get("/leadership");
  assert.doesNotMatch(
    leadership.text,
    /Contact Pastor|View Profile|Office Hours|Playlists|Curriculum|Schedule Meeting|Direct Message/
  );
});

test("22-24 active nav, Member Login, Register remain", async () => {
  const about = await request(makeTenantApp()).get("/about");
  assert.match(about.text, /church-nav__active[^>]*>About<|>About<\/a>/);
  assert.match(about.text, /href="\/about"[^>]*church-nav__active|church-nav__active"[^>]*>About/);
  assert.match(about.text, /Member Login/);
  assert.match(about.text, /Register as a Member/);

  const leadership = await request(makeTenantApp()).get("/leadership");
  assert.match(leadership.text, /href="\/leadership"[^>]*church-nav__active|church-nav__active"[^>]*>Leadership/);
  assert.match(leadership.text, /Member Login/);
  assert.match(leadership.text, /Register as a Member/);
});

test("25-27 footer attribution once with gray Powered by and orange GetPro", async () => {
  const about = await request(makeTenantApp()).get("/about");
  const footerBlocks = about.text.match(
    /<footer class="church-footer church-footer--branch">[\s\S]*?<\/footer>/
  );
  assert.ok(footerBlocks, "tenant footer should render");
  const footerPowered = footerBlocks[0].match(/class="bb-powered-by"/g) || [];
  assert.equal(footerPowered.length, 1);
  assert.match(about.text, /bb-powered-by__label/);
  assert.match(about.text, /bb-powered-by__getpro/);
  const css = fs.readFileSync(CSS_PATH, "utf8");
  assert.match(css, /\.bb-powered-by__label[\s\S]{0,80}?color:\s*var\(--church-powered-by-gray\)/);
  assert.match(css, /\.bb-powered-by__getpro[\s\S]{0,120}?color:\s*var\(--church-getpro-orange\)/);
});

test("28-30 Home, Ministries, and apex homepage remain unchanged", async () => {
  const homeBranch = fs.readFileSync(
    path.join(__dirname, "../views/church/partials/home_branch.ejs"),
    "utf8"
  );
  const ministriesSrc = fs.readFileSync(MINISTRIES_VIEW, "utf8");
  assert.match(homeBranch, /data-tenant-home="1"|bb-tenant-home/);
  assert.match(ministriesSrc, /data-ministries-page="1"/);

  const home = await request(makeTenantApp()).get("/");
  assert.equal(home.status, 200);
  assert.match(home.text, /bb-tenant-home|data-tenant-home="1"/);

  const ministries = await request(makeTenantApp()).get("/ministries");
  assert.equal(ministries.status, 200);
  assert.match(ministries.text, /bb-public-ministries|data-ministries-page="1"/);

  const apex = await request(makeApexApp()).get("/");
  assert.equal(apex.status, 200);
  assert.match(apex.text, /church-body--apex/);
  assert.match(apex.text, new RegExp(BLESSBOARD_NAME));

  const platform = await request(makePlatformApp()).get("/");
  assert.equal(platform.status, 404);
});

test("31 no duplicate IDs on About and Leadership", async () => {
  for (const route of ["/about", "/leadership"]) {
    const res = await request(makeTenantApp()).get(route);
    const ids = [...res.text.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    const seen = new Set();
    for (const id of ids) {
      assert.equal(seen.has(id), false, `duplicate id ${id} on ${route}`);
      seen.add(id);
    }
  }
});

test("32 existing public routes remain functional", async () => {
  const app = makeTenantApp();
  for (const route of ["/", "/about", "/leadership", "/ministries", "/events", "/sermons", "/giving", "/contact"]) {
    const res = await request(app).get(route);
    assert.equal(res.status, 200, `${route} should render`);
  }
});

test("About page CSS selectors exist for primary classes", () => {
  const css = fs.readFileSync(CSS_PATH, "utf8");
  const about = fs.readFileSync(ABOUT_VIEW, "utf8");
  for (const cls of [
    "church-about-page",
    "church-about-page__hero",
    "church-about-page__purpose",
    "church-about-page__values",
    "church-about-page__cta",
  ]) {
    assert.match(about, new RegExp(cls));
    assert.match(css, new RegExp(`\\.${cls}\\b`));
  }
});

test("Leadership page CSS selectors exist for primary classes", () => {
  const css = fs.readFileSync(CSS_PATH, "utf8");
  const leadership = fs.readFileSync(LEADERSHIP_VIEW, "utf8");
  for (const cls of [
    "church-leadership-page",
    "church-leadership-page__hero",
    "church-leadership-page__featured",
    "church-leadership-page__avatar",
    "church-leadership-page__cta",
  ]) {
    assert.match(leadership, new RegExp(cls));
    assert.match(css, new RegExp(`\\.${cls}\\s*\\{`));
  }
});

test("About and Leadership do not use dual home-desktop/mobile trees", () => {
  const about = fs.readFileSync(ABOUT_VIEW, "utf8");
  const leadership = fs.readFileSync(LEADERSHIP_VIEW, "utf8");
  assert.doesNotMatch(about, /home-desktop-design|home-mobile-design/);
  assert.doesNotMatch(leadership, /home-desktop-design|home-mobile-design/);
});
