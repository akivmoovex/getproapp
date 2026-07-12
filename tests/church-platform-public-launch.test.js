"use strict";

const path = require("path");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const churchRoutes = require("../src/routes/church");
const {
  BLESSBOARD_ZAMBIA_LAUNCH_POSITIONING,
  BLESSBOARD_ONBOARDING_POSITIONING,
} = require("../src/church/platformPublicContent");
const {
  blessboardDefaultOgImageUrl,
  BLESSBOARD_SOCIAL_PREVIEW_TARGET_PATH,
} = require("../src/church/branding");

const FREE_PLAN_RE = /\bStart Free\b|free plan|Is BlessBoard free/i;
const LEGAL_INTERNAL_RE = /legal review gaps|awaiting legal review|will be published here/i;

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

function makeBranchApp(host = "demo.blessboard.com") {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.headers.host = host;
    req.churchContext = {
      kind: "branch",
      host,
      orgSlug: "demo",
      organization: { id: 1, name: "Demo Church", status: "active" },
      branch: { id: 1, name: "Demo Branch", status: "active", host_slug: "demo" },
    };
    next();
  });
  app.use(churchRoutes());
  return app;
}

test("approved Zambia launch positioning appears on about page", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/about");
  assert.equal(res.status, 200);
  assert.match(res.text, new RegExp(BLESSBOARD_ZAMBIA_LAUNCH_POSITIONING.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(res.text, /Zambia-only|only in Zambia|only for Zambia/i);
});

test("approved onboarding wording appears on register page", async () => {
  const app = makeApexApp();
  const register = await request(app).get("/register-church");
  assert.match(
    register.text,
    /BlessBoard is currently onboarding selected churches/i
  );
  assert.match(register.text, /Contact the BlessBoard team to discuss access/i);
});

test("public pages do not claim free plan or Start Free", async () => {
  const app = makeApexApp();
  for (const routePath of ["/", "/about", "/for-churches", "/register-church", "/faq", "/features"]) {
    const res = await request(app).get(routePath);
    assert.doesNotMatch(res.text, FREE_PLAN_RE, `${routePath} must not claim free plan`);
  }
});

test("legal pages do not expose internal review notes", async () => {
  const app = makeApexApp();
  for (const routePath of ["/privacy", "/terms", "/security", "/support"]) {
    const res = await request(app).get(routePath);
    assert.doesNotMatch(res.text, LEGAL_INTERNAL_RE, `${routePath} must not expose internal legal notes`);
    assert.doesNotMatch(res.text, /blessboard-legal-review-gaps/i);
  }
});

test("tenant public pages use self-referencing canonical on branch host", async () => {
  const app = makeBranchApp("demo.blessboard.com");
  const res = await request(app).get("/about").set("Host", "demo.blessboard.com");
  assert.equal(res.status, 200);
  assert.match(res.text, /<link rel="canonical" href="https:\/\/demo\.blessboard\.com\/about"/);
  assert.match(res.text, /<meta name="robots" content="index, follow"/);
  assert.doesNotMatch(res.text, /<link rel="canonical" href="https:\/\/blessboard\.com/);
});

test("default OG image is centralized in branding with documented target asset", () => {
  const url = blessboardDefaultOgImageUrl();
  assert.match(url, /https:\/\/blessboard\.com\/church\/images\/homepage\/desktop-hero-auditorium\.jpg/);
  assert.equal(
    BLESSBOARD_SOCIAL_PREVIEW_TARGET_PATH,
    "/images/brand/blessboard-social-preview-1200x630.jpg"
  );
});

test("structured data and sitemap use blessboard.com apex domain", async () => {
  const app = makeApexApp();
  const home = await request(app).get("/");
  assert.match(home.text, /"url":"https:\/\/blessboard\.com"/);
  const sitemap = await request(app).get("/sitemap.xml");
  assert.match(sitemap.text, /<loc>https:\/\/blessboard\.com\/<\/loc>/);
  assert.doesNotMatch(sitemap.text, /www\.blessboard\.com/);
});
