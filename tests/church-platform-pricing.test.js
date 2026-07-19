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

test("public pricing content exposes Foundation, Growth, and Network", () => {
  const tiers = buildPublicPricingPlans();
  assert.equal(tiers.length, 3);
  assert.equal(tiers[0].label, "Foundation");
  assert.equal(tiers[1].label, "Growth");
  assert.equal(tiers[2].label, "Network");
  assert.equal(FEATURED_PLAN_CODE, "growth");
  assert.ok(tiers[1].featured);
  assert.equal(tiers[0].priceAmount, "USD 0");
  assert.match(tiers[1].priceAmount, /14\.99/);
  assert.match(tiers[2].priceAmount, /29\.99/);
  assert.match(tiers[1].priceSuffix, /active branch/i);
  assert.match(tiers[2].priceSuffix, /active branch/i);
  assert.equal(buildPartnerPlan(), null);
  assert.deepEqual([...ALL_PLAN_CODES], ["foundation", "growth", "network"]);
});

test("pricing comparison tracks reporting and Network-only domain/email", () => {
  const rows = buildPublicPricingComparisonRows();
  const reporting = rows.find((row) => row.key === "reporting");
  const crossBranch = rows.find((row) => row.key === "cross_branch_hq");
  const customDomain = rows.find((row) => row.key === "custom_domain");
  assert.ok(reporting);
  assert.equal(reporting.values.foundation, "Basic HQ aggregates");
  assert.equal(reporting.values.growth, "Advanced attendance & giving + cross-branch");
  assert.equal(reporting.values.network, "Growth reporting + executive exports (by arrangement)");
  assert.ok(crossBranch);
  assert.equal(crossBranch.values.foundation, false);
  assert.equal(crossBranch.values.growth, true);
  assert.equal(crossBranch.values.network, true);
  assert.ok(customDomain);
  assert.equal(customDomain.values.foundation, false);
  assert.equal(customDomain.values.growth, false);
  assert.equal(customDomain.values.network, true);
});

test("Growth public features claim only implemented differentiators", () => {
  const tiers = buildPublicPricingPlans();
  const growth = tiers.find((plan) => plan.code === "growth");
  assert.ok(growth);
  assert.ok(growth.features.some((f) => /advanced attendance and giving reports/i.test(f)));
  assert.ok(growth.features.some((f) => /cross-branch HQ administration/i.test(f)));
  assert.ok(!growth.features.some((f) => /scheduling/i.test(f)));
  assert.ok(!growth.features.some((f) => /workflow/i.test(f)));
  assert.doesNotMatch(growth.description, /scheduling/i);
});

test("pricing SEO config and sitemap entry exist", () => {
  assert.ok(PLATFORM_PUBLIC_SEO.pricing);
  assert.equal(PLATFORM_PUBLIC_SEO.pricing.path, "/pricing");
  assert.match(PLATFORM_PUBLIC_SEO.pricing.metaDescription, /Foundation, Growth, and Network/);
  assert.ok(SITEMAP_PAGE_KEYS.includes("pricing"));
});

test("apex /pricing renders three-package layout without checkout", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/pricing");
  assert.equal(res.status, 200);
  assert.match(res.text, /church\.css\?v=76/);
  assert.match(res.text, /church-body--apex/);
  assert.match(res.text, /Simple plans for every stage of church growth/);
  assert.match(res.text, /bb-apex-pricing/);
  assert.match(res.text, /Foundation/);
  assert.match(res.text, /Growth/);
  assert.match(res.text, /Network/);
  assert.match(res.text, /USD 0/);
  assert.match(res.text, /USD 14\.99/);
  assert.match(res.text, /USD 29\.99/);
  assert.match(res.text, /Most Popular/);
  assert.match(res.text, /Register Your Church/);
  assert.match(res.text, /active branch/i);
  assert.match(res.text, /third-party costs/i);
  assert.match(res.text, /href="\/pricing"[^>]*>Pricing</);
  assert.match(
    res.text,
    new RegExp(BLESSBOARD_ONBOARDING_POSITIONING.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 40))
  );
  assert.match(res.text, /rel="canonical" href="https:\/\/blessboard\.com\/pricing"/);
  assert.doesNotMatch(res.text, /\bFree\b/);
  assert.doesNotMatch(res.text, /\bProfessional\b/);
  assert.doesNotMatch(res.text, /\bPartner\b/);
  assert.doesNotMatch(res.text, /USD 4\.90|USD 8\.90|Custom quotation/);
  assert.doesNotMatch(res.text, /Start Free Trial|Choose Growth|checkout|payment processing on BlessBoard/i);
  assert.doesNotMatch(res.text, /data-tenant-header="1"/);
});

test("custom domain appears only on Network", () => {
  const tiers = buildPublicPricingPlans();
  const foundation = tiers.find((plan) => plan.code === "foundation");
  const growth = tiers.find((plan) => plan.code === "growth");
  const network = tiers.find((plan) => plan.code === "network");
  assert.ok(foundation && growth && network);
  assert.ok(!foundation.features.some((feature) => /custom (organization )?domain/i.test(feature)));
  assert.ok(!growth.features.some((feature) => /custom (organization )?domain/i.test(feature)));
  assert.ok(network.features.some((feature) => /custom (organization )?domain/i.test(feature)));
});

test("branch host does not expose apex /pricing route", async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/pricing");
  assert.notEqual(res.status, 200);
});
