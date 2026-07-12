"use strict";

const path = require("path");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const churchRoutes = require("../src/routes/church");
const { BLESSBOARD_REGISTER_CHURCH_PATH } = require("../src/church/platformPublicContent");
const {
  PLATFORM_PUBLIC_SEO,
  SITEMAP_PAGE_KEYS,
  blessboardApexCanonicalUrl,
  BLESSBOARD_OG_IMAGE_URL,
  mergePlatformPublicSeo,
} = require("../src/church/platformPublicSeo");

const PROHIBITED_CLAIMS_RE =
  /encrypted|guaranteed uptime|trusted by thousands|market.leading|SOC 2|ISO 27001|GDPR compliant|HIPAA compliant/i;

const MARKETING_PAGES = [
  { path: "/", key: "home", h1: "One digital home for your church" },
  { path: "/features", key: "features", h1: "Built for the Modern Ministry" },
  { path: "/pricing", key: "pricing", h1: "Simple plans for every stage" },
  { path: "/for-churches", key: "for-churches", h1: "Empowering your congregation with" },
  { path: "/multi-branch", key: "multi-branch", h1: "One platform for every branch" },
  { path: "/churches", key: "churches", h1: "Find Your Church" },
  { path: "/about", key: "about", h1: "About BlessBoard" },
  { path: "/contact", key: "contact", h1: "Contact BlessBoard" },
  { path: BLESSBOARD_REGISTER_CHURCH_PATH, key: "register-church", h1: "Register Your Church" },
  { path: "/faq", key: "faq", h1: "Frequently Asked Questions" },
  { path: "/privacy", key: "privacy", h1: "Privacy Policy" },
  { path: "/terms", key: "terms", h1: "Terms of Service" },
  { path: "/security", key: "security", h1: "Security and Data Information" },
  { path: "/support", key: "support", h1: "Support" },
];

function makeApexApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
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

function makeBranchApp(extra = {}) {
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
      ...extra.churchContext,
    };
    next();
  });
  app.use(churchRoutes());
  return app;
}

function countMatches(html, re) {
  return (html.match(re) || []).length;
}

test("platform SEO config covers all marketing pages", () => {
  for (const page of MARKETING_PAGES) {
    assert.ok(PLATFORM_PUBLIC_SEO[page.key], `missing SEO config for ${page.key}`);
    assert.ok(SITEMAP_PAGE_KEYS.includes(page.key), `missing sitemap entry for ${page.key}`);
  }
});

test("mergePlatformPublicSeo sets canonical, OG, and structured data for home", () => {
  const locals = mergePlatformPublicSeo({ isVerticalApex: true, activePage: "home" });
  assert.equal(locals.canonicalUrl, "https://blessboard.com/");
  assert.equal(locals.ogImage, BLESSBOARD_OG_IMAGE_URL);
  assert.match(locals.seoTitle, /Find and connect with your church \| BlessBoard/);
  assert.equal(locals.structuredDataJsonLd.length, 2);
  assert.equal(locals.structuredDataJsonLd[0]["@type"], "Organization");
  assert.equal(locals.structuredDataJsonLd[1]["@type"], "WebSite");
  assert.doesNotMatch(JSON.stringify(locals.structuredDataJsonLd), /aggregateRating|reviewRating|foundingDate/i);
});

test("mergePlatformPublicSeo adds BreadcrumbList for inner pages", () => {
  const locals = mergePlatformPublicSeo({ isVerticalApex: true, activePage: "features" });
  assert.equal(locals.canonicalUrl, blessboardApexCanonicalUrl("/features"));
  assert.equal(locals.structuredDataJsonLd.length, 1);
  assert.equal(locals.structuredDataJsonLd[0]["@type"], "BreadcrumbList");
});

test("apex marketing pages include unique SEO metadata", async () => {
  const app = makeApexApp();
  const seenDescriptions = new Set();

  for (const page of MARKETING_PAGES) {
    const res = await request(app).get(page.path);
    assert.equal(res.status, 200, `${page.path} should render`);
    assert.match(res.text, /church\.css\?v=75/, `${page.path} should load public CSS v75`);

    const config = PLATFORM_PUBLIC_SEO[page.key];
    assert.match(res.text, new RegExp(`<link rel="canonical" href="${config.path === "/" ? "https://blessboard.com/" : `https://blessboard.com${config.path}`}"`), `${page.path} canonical`);
    assert.match(res.text, /<meta property="og:image" content="https:\/\/blessboard\.com\/church\/images\/homepage\/desktop-hero-auditorium\.jpg"/, `${page.path} og:image`);
    assert.match(res.text, /<meta name="robots" content="index, follow"/, `${page.path} robots index`);
    assert.match(res.text, new RegExp(config.metaDescription.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 40)), `${page.path} description`);

    const descMatch = res.text.match(/<meta name="description" content="([^"]+)"/);
    assert.ok(descMatch, `${page.path} should have meta description`);
    assert.ok(!seenDescriptions.has(descMatch[1]), `${page.path} description should be unique`);
    seenDescriptions.add(descMatch[1]);

    assert.equal(countMatches(res.text, /<h1\b/gi), 1, `${page.path} should have one H1`);
    if (page.key === "home") {
      assert.match(res.text, /One digital home for[\s\S]{0,48}?your church/i, `${page.path} should include expected H1`);
    } else {
      assert.match(res.text, new RegExp(page.h1), `${page.path} should include expected H1`);
    }
    assert.doesNotMatch(res.text, PROHIBITED_CLAIMS_RE, `${page.path} must not include prohibited claims`);
  }
});

test("apex homepage includes Organization and WebSite JSON-LD", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/");
  assert.match(res.text, /"@type":"Organization"/);
  assert.match(res.text, /"@type":"WebSite"/);
  assert.match(res.text, /SearchAction/);
  assert.doesNotMatch(res.text, /"@type":"BreadcrumbList"/);
});

test("apex inner page includes BreadcrumbList JSON-LD", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/features");
  assert.match(res.text, /"@type":"BreadcrumbList"/);
  assert.doesNotMatch(res.text, /"@type":"Organization"/);
});

test("apex sitemap.xml lists marketing URLs only on blessboard apex", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/sitemap.xml");
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /xml/);
  for (const key of SITEMAP_PAGE_KEYS) {
    const config = PLATFORM_PUBLIC_SEO[key];
    const loc = blessboardApexCanonicalUrl(config.path);
    assert.match(res.text, new RegExp(`<loc>${loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</loc>`));
  }
  assert.doesNotMatch(res.text, /<loc>https:\/\/blessboard\.com\/churches\/[^<]+<\/loc>/);
});

test("apex robots.txt allows public pages and blocks internal paths", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/robots.txt");
  assert.equal(res.status, 200);
  assert.match(res.text, /Allow: \//);
  assert.match(res.text, /Disallow: \/branch\//);
  assert.match(res.text, /Disallow: \/member\//);
  assert.match(res.text, /Sitemap: https:\/\/blessboard\.com\/sitemap\.xml/);
});

test("branch host does not expose apex sitemap or robots", async () => {
  const app = makeBranchApp();
  const sitemap = await request(app).get("/sitemap.xml");
  const robots = await request(app).get("/robots.txt");
  assert.equal(sitemap.status, 404);
  assert.equal(robots.status, 404);
});

test("directory search and admin views are noindex with clean canonical", async () => {
  const app = makeApexApp();
  const search = await request(app).get("/churches?q=demo");
  assert.match(search.text, /<meta name="robots" content="noindex, nofollow"/);
  assert.match(search.text, /<link rel="canonical" href="https:\/\/blessboard\.com\/churches"/);

  const admin = await request(app).get("/churches?for=admin");
  assert.match(admin.text, /<meta name="robots" content="noindex, nofollow"/);
});

test("church directory unavailable pages are noindex", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/churches/not-a-real-church-slug");
  assert.ok([404, 503].includes(res.status), "invalid slug should render unavailable page");
  assert.match(res.text, /<meta name="robots" content="noindex, nofollow"/);
});

test("branch preview public shell is noindex", async () => {
  const app = makeBranchApp();
  app.get("/preview-test", (req, res) => {
    res.render("church/public/about", {
      pageTitle: "About",
      churchName: "Demo Church",
      branchName: "Demo Branch",
      metaDescription: "About demo",
      activePage: "about",
      isPreview: true,
      isVerticalApex: false,
      welcomeMessage: "Welcome",
      pageHeading: "About Us",
      aboutBody: "Body",
      missionText: "",
      visionText: "",
      storyTitle: "",
      missionTitle: "",
      visionTitle: "",
      address: "",
      locationText: "",
      valuesText: "",
      aboutTitle: "",
    });
  });
  const res = await request(app).get("/preview-test");
  assert.match(res.text, /<meta name="robots" content="noindex, nofollow"/);
});

test("member auth shell is noindex", async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/login");
  assert.equal(res.status, 200);
  assert.match(res.text, /<meta name="robots" content="noindex, nofollow"/);
});

test("branch host does not expose apex-only platform routes", async () => {
  const app = makeBranchApp();
  for (const routePath of ["/features", "/sitemap.xml", "/robots.txt"]) {
    const res = await request(app).get(routePath);
    assert.equal(res.status, 404, `${routePath} should not exist on branch host`);
  }
});
