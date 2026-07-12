"use strict";

const path = require("path");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const churchRoutes = require("../src/routes/church");

const PLACEHOLDER_LEGAL_RE =
  /legal review|after business review|will be published here|until then, use BlessBoard in good faith/i;
const PROHIBITED_CLAIMS_RE =
  /encrypted|guaranteed uptime|trusted by thousands|market.leading|SOC 2|ISO 27001|GDPR compliant|HIPAA compliant/i;

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

const LEGAL_PAGES = [
  { path: "/privacy", title: "Privacy Policy", snippet: /bb_church_pref|church tenant sites/i },
  { path: "/terms", title: "Terms of Service", snippet: /church sites and accounts/i },
  { path: "/security", title: "Security and Data Information", snippet: /Role-based access/i },
  { path: "/support", title: "Support", snippet: /Find a Church|forgot-password/i },
];

test("apex legal and support pages render with shared shell", async () => {
  const app = makeApexApp();
  for (const page of LEGAL_PAGES) {
    const res = await request(app).get(page.path);
    assert.equal(res.status, 200, `${page.path} should render`);
    assert.match(res.text, new RegExp(page.title), `${page.path} should include title`);
    assert.match(res.text, page.snippet, `${page.path} should include expected content`);
    assert.match(res.text, /church-body--apex/, `${page.path} should use apex shell`);
    assert.doesNotMatch(res.text, PLACEHOLDER_LEGAL_RE, `${page.path} must not show placeholder legal text`);
    assert.doesNotMatch(res.text, PROHIBITED_CLAIMS_RE, `${page.path} must not include prohibited claims`);
  }
});

test("apex footer links to privacy, terms, security, and support", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/");
  for (const href of ['href="/privacy"', 'href="/terms"', 'href="/security"', 'href="/support"']) {
    assert.match(res.text, new RegExp(href), `homepage footer should include ${href}`);
  }
});

test("security page states verified controls without absolute security guarantees", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/security");
  assert.equal(res.status, 200);
  assert.match(res.text, /bcrypt|Role-based access|session/i);
  assert.match(res.text, /does not publish infrastructure certifications/i);
  assert.doesNotMatch(res.text, /completely secure|100% secure|guarantee against all/i);
  assert.match(res.text, /href="\/contact"/);
});

test("support page routes members and administrators without inventing support email", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/support");
  assert.equal(res.status, 200);
  assert.match(res.text, /href="\/churches"/);
  assert.match(res.text, /href="\/churches\?for=admin"/);
  assert.match(res.text, /href="\/contact"/);
  assert.match(res.text, /forgot-password/);
  assert.doesNotMatch(res.text, /support@|help@|security@/i);
});

test("branch host does not expose apex-only legal routes", async () => {
  const app = makeBranchApp();
  for (const routePath of ["/privacy", "/terms", "/security", "/support"]) {
    const res = await request(app).get(routePath);
    assert.equal(res.status, 404, `${routePath} should not exist on branch host`);
  }
});
