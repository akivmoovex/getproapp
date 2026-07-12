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
  buildPartnerPlan,
  FEATURED_PLAN_CODE,
  ALL_PLAN_CODES,
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

test("public pricing content exposes four plans with updated names and prices", () => {
  const tiers = buildPublicPricingPlans();
  const partner = buildPartnerPlan();
  assert.equal(tiers.length, 3);
  assert.equal(tiers[0].label, "Free");
  assert.equal(tiers[1].label, "Growth");
  assert.equal(tiers[2].label, "Professional");
  assert.equal(partner.label, "Partner");
  assert.equal(FEATURED_PLAN_CODE, "growth");
  assert.ok(tiers[1].featured);
  assert.equal(tiers[0].priceAmount, "USD 0");
  assert.match(tiers[1].priceAmount, /4\.90/);
  assert.match(tiers[2].priceAmount, /8\.90/);
  assert.equal(partner.priceDisplay, "Custom quotation");
  assert.equal(ALL_PLAN_CODES.length, 4);
});

test("pricing comparison tracks reporting progression and custom-domain restrictions", () => {
  const rows = buildPublicPricingComparisonRows();
  const reporting = rows.find((row) => row.key === "reporting");
  const customDomain = rows.find((row) => row.key === "custom_domain");
  assert.ok(reporting);
  assert.equal(reporting.values.free, "Basic");
  assert.equal(reporting.values.growth, "Standard multi-branch");
  assert.equal(reporting.values.professional, "Advanced");
  assert.equal(reporting.values.partner, "Custom managed");
  assert.ok(customDomain);
  assert.equal(customDomain.values.free, false);
  assert.equal(customDomain.values.growth, false);
  assert.equal(customDomain.values.professional, true);
  assert.equal(customDomain.values.partner, true);
});

test("pricing SEO config and sitemap entry exist", () => {
  assert.ok(PLATFORM_PUBLIC_SEO.pricing);
  assert.equal(PLATFORM_PUBLIC_SEO.pricing.path, "/pricing");
  assert.match(PLATFORM_PUBLIC_SEO.pricing.metaDescription, /Free, Growth, Professional, and Partner/);
  assert.ok(SITEMAP_PAGE_KEYS.includes("pricing"));
});

test("apex /pricing renders Stitch pricing layout with registration/contact CTAs", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/pricing");
  assert.equal(res.status, 200);
  assert.match(res.text, /church\.css\?v=72/);
  assert.match(res.text, /church-body--apex/);
  assert.match(res.text, /Simple plans for every stage of church growth/);
  assert.match(res.text, /bb-apex-pricing/);
  assert.match(res.text, /home-desktop-design/);
  assert.match(res.text, /home-mobile-design/);
  assert.match(res.text, /Free/);
  assert.match(res.text, /Growth/);
  assert.match(res.text, /Professional/);
  assert.match(res.text, /Partner/);
  assert.match(res.text, /USD 0/);
  assert.match(res.text, /USD 4\.90/);
  assert.match(res.text, /USD 8\.90/);
  assert.match(res.text, /Custom quotation/);
  assert.match(res.text, /Most Popular/);
  assert.match(res.text, /bb-apex-pricing-card--featured/);
  assert.match(res.text, /Request a Quotation/);
  assert.match(res.text, /Register Your Church/);
  assert.match(res.text, /href="\/contact"/);
  assert.match(res.text, /Compare plans/);
  assert.match(res.text, /Basic/);
  assert.match(res.text, /Standard multi-branch/);
  assert.match(res.text, /Advanced/);
  assert.match(res.text, /Custom managed/);
  assert.match(res.text, /third-party costs/i);
  assert.match(res.text, /href="\/pricing"[^>]*>Pricing</);
  assert.match(res.text, new RegExp(BLESSBOARD_ONBOARDING_POSITIONING.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 40)));
  assert.match(res.text, /rel="canonical" href="https:\/\/blessboard\.com\/pricing"/);
  assert.doesNotMatch(res.text, /\bStarter\b/);
  assert.doesNotMatch(res.text, /\bStandard plan\b/i);
  assert.doesNotMatch(res.text, /\bPro\b/);
  assert.doesNotMatch(res.text, /Start Free Trial|Choose Growth|checkout|payment processing on BlessBoard/i);
  assert.doesNotMatch(res.text, /data-tenant-header="1"/);
});

test("custom domain appears only on Professional and Partner tiers", () => {
  const tiers = buildPublicPricingPlans();
  const partner = buildPartnerPlan();
  const free = tiers.find((plan) => plan.code === "free");
  const growth = tiers.find((plan) => plan.code === "growth");
  const professional = tiers.find((plan) => plan.code === "professional");
  assert.ok(free && growth && professional);
  assert.ok(!free.features.some((feature) => /custom domain/i.test(feature)));
  assert.ok(!growth.features.some((feature) => /custom domain/i.test(feature)));
  assert.ok(professional.features.some((feature) => /custom domain/i.test(feature)));
  assert.ok(partner.features.some((feature) => /custom domain/i.test(feature)));
});

test("branch host does not expose apex /pricing route", async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/pricing");
  assert.notEqual(res.status, 200);
});
