"use strict";

const path = require("path");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const churchRoutes = require("../src/routes/church");
const { BLESSBOARD_ONBOARDING_POSITIONING } = require("../src/church/platformPublicContent");
const {
  buildPublicPricingPlans,
  buildPublicPricingComparisonRows,
} = require("../src/church/platformPricingContent");
const { PLATFORM_PUBLIC_SEO, SITEMAP_PAGE_KEYS } = require("../src/church/platformPublicSeo");

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
      orgSlug: "demo",
      organization: { id: 1, name: "Demo Church", status: "active" },
      branch: { id: 1, name: "Demo Branch", status: "active", host_slug: "demo" },
    };
    next();
  });
  app.use(churchRoutes());
  return app;
}

test("public pricing content uses Starter label and contact-led copy", () => {
  const plans = buildPublicPricingPlans();
  assert.equal(plans.length, 3);
  assert.equal(plans[0].label, "Starter");
  assert.equal(plans[1].label, "Standard");
  assert.equal(plans[2].label, "Pro");
  assert.ok(plans[1].featured);
  const rows = buildPublicPricingComparisonRows();
  assert.ok(rows.length >= 8);
});

test("pricing SEO config and sitemap entry exist", () => {
  assert.ok(PLATFORM_PUBLIC_SEO.pricing);
  assert.equal(PLATFORM_PUBLIC_SEO.pricing.path, "/pricing");
  assert.ok(SITEMAP_PAGE_KEYS.includes("pricing"));
});

test("apex /pricing renders pricing page with shared shell", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/pricing");
  assert.equal(res.status, 200);
  assert.match(res.text, /church\.css\?v=64/);
  assert.match(res.text, /church-body--apex/);
  assert.match(res.text, /Plans for every stage of your church/);
  assert.match(res.text, /bb-platform-pricing-plans/);
  assert.match(res.text, /bb-platform-pricing-compare/);
  assert.match(res.text, /Starter/);
  assert.match(res.text, /Standard/);
  assert.match(res.text, /Pro/);
  assert.match(res.text, /Contact for access/);
  assert.match(res.text, /Compare plans/);
  assert.match(res.text, /Register Your Church/);
  assert.match(res.text, /href="\/contact"/);
  assert.match(res.text, /href="\/pricing"[^>]*>Pricing</);
  assert.match(res.text, new RegExp(BLESSBOARD_ONBOARDING_POSITIONING.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 40)));
  assert.match(res.text, /rel="canonical" href="https:\/\/blessboard\.com\/pricing"/);
  assert.doesNotMatch(res.text, /\bfree plan\b/i);
  assert.doesNotMatch(res.text, /data-tenant-header="1"/);
});

test("branch host does not expose apex /pricing route", async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/pricing");
  assert.notEqual(res.status, 200);
});
