"use strict";

const path = require("path");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const churchRoutes = require("../src/routes/church");
const { PLATFORM_FAQ_ITEMS } = require("../src/church/platformFaqContent");
const {
  BLESSBOARD_DEMO_PUBLIC_URL,
  buildDemoExploreLinks,
} = require("../src/church/platformPublicContent");

const CREDENTIAL_RE = /DemoAdmin@|admin@demo\.blessboard\.com|temporary password|DEMO_CHURCH_ADMIN_PASSWORD/i;
const PROHIBITED_CLAIMS_RE =
  /encrypted|guaranteed uptime|SOC 2|ISO 27001|GDPR compliant|completely secure|100% secure/i;

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

test("PLATFORM_FAQ_ITEMS includes all suggested questions", () => {
  const questions = PLATFORM_FAQ_ITEMS.map((item) => item.question);
  for (const expected of [
    "What is BlessBoard?",
    "Who can use BlessBoard?",
    "Does each church receive its own website?",
    "Can a church manage multiple branches?",
    "Can members use BlessBoard on a phone?",
    "Does BlessBoard require an app?",
    "Who approves church members?",
    "Can churches publish events, ministries, and sermons?",
    "Can members submit forms and requests?",
    "Can a church connect its own domain?",
    "How can a church request access?",
    "How can members get login help?",
    "How does BlessBoard pricing work?",
    "Who can view church information?",
  ]) {
    assert.ok(questions.includes(expected), `missing FAQ: ${expected}`);
  }
});

test("pricing FAQ uses approved onboarding wording", () => {
  const pricing = PLATFORM_FAQ_ITEMS.find((item) => item.id === "pricing");
  assert.ok(pricing);
  assert.match(pricing.answer, /currently onboarding selected churches/i);
  assert.match(pricing.answer, /Contact the BlessBoard team to discuss access/i);
  assert.doesNotMatch(pricing.answer, /\bfree plan\b/i);
});

test("apex /faq renders accordion items with native details elements", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/faq");
  assert.equal(res.status, 200);
  assert.match(res.text, /Frequently Asked Questions/);
  assert.match(res.text, /<details class="bb-platform-faq__item"/);
  assert.match(res.text, /<summary class="bb-platform-faq__question">What is BlessBoard\?<\/summary>/);
  assert.match(res.text, /bb-platform-faq__answer/);
  assert.match(res.text, /currently onboarding selected churches/i);
  assert.doesNotMatch(res.text, CREDENTIAL_RE);
  assert.doesNotMatch(res.text, PROHIBITED_CLAIMS_RE);
});

test("apex /demo renders guided explore links to public demo pages only", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/demo");
  assert.equal(res.status, 200);
  assert.match(res.text, /See BlessBoard in action/);
  assert.match(res.text, /bb-platform-demo-explore/);
  assert.doesNotMatch(res.text, /https:\/\/demo\.blessboard\.com\/(login|register|branch)/i);

  if (BLESSBOARD_DEMO_PUBLIC_URL) {
    assert.match(res.text, new RegExp(BLESSBOARD_DEMO_PUBLIC_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    for (const link of buildDemoExploreLinks()) {
      assert.match(res.text, new RegExp(link.href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `demo page should link ${link.href}`);
      assert.doesNotMatch(link.href, /\/(login|register|branch)(\/|$)/i);
    }
  }

  assert.doesNotMatch(res.text, CREDENTIAL_RE);
  assert.match(res.text, /Member and administrator areas require church-issued credentials/);
});

test("homepage and footer link to FAQ and demo", async () => {
  const app = makeApexApp();
  const home = await request(app).get("/");
  assert.equal(home.status, 200);
  assert.match(home.text, /href="\/demo"/);
  assert.match(home.text, /Guided demo tour|See BlessBoard in action/);
  assert.match(home.text, /href="\/faq"/);
  assert.doesNotMatch(home.text, CREDENTIAL_RE);
});

test("branch host does not expose apex-only faq or demo routes", async () => {
  const app = makeBranchApp();
  for (const routePath of ["/faq", "/demo"]) {
    const res = await request(app).get(routePath);
    assert.equal(res.status, 404, `${routePath} should not exist on branch host`);
  }
});

test("FAQ and demo pages use mobile-friendly layout classes", async () => {
  const app = makeApexApp();
  for (const routePath of ["/faq", "/demo"]) {
    const res = await request(app).get(routePath);
    assert.match(res.text, /home-desktop-design/);
    assert.match(res.text, /bb-platform-page/);
    assert.match(res.text, /church\.css\?v=71/);
  }
});
