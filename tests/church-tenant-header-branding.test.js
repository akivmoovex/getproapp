"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const churchRoutes = require("../src/routes/church");
const { BLESSBOARD_NAME } = require("../src/church/branding");
const { preparePublicViewModel, buildBranchFallbacks } = require("../src/services/church/websiteContentService");

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

function makeApexApp() {
  return makeApp({ kind: "vertical-apex", host: "blessboard.com", organization: null, branch: null });
}

function makeTenantApp(org, branch) {
  return makeApp({
    kind: "branch",
    orgSlug: org.slug || "demo",
    organization: org,
    branch,
  });
}

test("tenant header renders church name and branch name as primary identity", async () => {
  const app = makeTenantApp(
    { id: 1, name: "Grace Community Church", status: "active", slug: "grace" },
    { id: 2, name: "North Campus", status: "active", host_slug: "grace-north" }
  );
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /data-tenant-header="1"/);
  assert.match(res.text, /data-tenant-brand="1"/);
  assert.match(res.text, /church-brand__name[^>]*>\s*Grace Community Church\s*</);
  assert.match(res.text, /church-brand__branch[^>]*>\s*North Campus\s*</);
  assert.match(res.text, /href="\/login"[^>]*>Member Login</);
  assert.match(res.text, /href="\/register"[^>]*>Register as a Member</);
  assert.match(res.text, /church-nav--branch/);
  assert.match(res.text, /church-nav__active/);
  assert.match(res.text, /church-menu-btn--tenant|id="church-mobile-menu-btn"/);
  assert.match(res.text, /church-mobile-drawer/);
});

test("tenant header uses safe logo fallback when logo is missing", async () => {
  const app = makeTenantApp(
    { id: 1, name: "Alpha Church", status: "active" },
    { id: 1, name: "Main Branch", status: "active", host_slug: "alpha" }
  );
  const res = await request(app).get("/");
  assert.match(res.text, /church-brand-mark--fallback/);
  assert.match(res.text, /church-brand-mark__initials|>AC</);
  assert.doesNotMatch(res.text, /church-brand__logo/);
  assert.doesNotMatch(res.text, /src=""\s+alt=/);
});

test("tenant header renders configured church logo when present", async () => {
  const app = makeTenantApp(
    {
      id: 1,
      name: "Logo Church",
      status: "active",
      logo_url: "/church/images/about/about-branch-building.jpg",
    },
    { id: 1, name: "Central", status: "active", host_slug: "logo-church" }
  );
  const res = await request(app).get("/");
  assert.match(res.text, /church-brand__logo/);
  assert.match(res.text, /src="\/church\/images\/about\/about-branch-building\.jpg"/);
  assert.match(res.text, /alt="Logo Church logo"/);
  assert.doesNotMatch(res.text, /church-brand-mark--fallback/);
});

test("BlessBoard is not the dominant tenant header identity", async () => {
  const app = makeTenantApp(
    { id: 1, name: "Tenant First Church", status: "active" },
    { id: 1, name: "East Branch", status: "active", host_slug: "tenant-first" }
  );
  const res = await request(app).get("/");
  const headerMatch = res.text.match(/data-tenant-header="1"[\s\S]*?<\/header>/);
  assert.ok(headerMatch, "tenant header should render");
  assert.doesNotMatch(headerMatch[0], />\s*BlessBoard\s*</);
  assert.doesNotMatch(headerMatch[0], /brand-name/);
  assert.match(headerMatch[0], /Tenant First Church/);
  assert.match(res.text, /bb-powered-by__label/);
  assert.match(res.text, /bb-powered-by__getpro/);
  assert.equal((res.text.match(/bb-powered-by__getpro/g) || []).length >= 1, true);
});

test("long church and branch names keep safe structure classes", async () => {
  const longChurch =
    "Saint Michael and All Angels Metropolitan Community Fellowship International Church of the Valley";
  const longBranch = "Southwestern Regional Multi-Campus Outreach and Discipleship Branch";
  const app = makeTenantApp(
    { id: 1, name: longChurch, status: "active" },
    { id: 1, name: longBranch, status: "active", host_slug: "long-names" }
  );
  const res = await request(app).get("/");
  assert.match(res.text, /church-brand__name/);
  assert.match(res.text, /church-brand__branch/);
  assert.match(res.text, /church-brand--tenant/);
  assert.match(res.text, new RegExp(longChurch.slice(0, 40)));
  assert.match(res.text, new RegExp(longBranch.slice(0, 40)));
});

test("apex header remains BlessBoard-branded with Find Your Church", async () => {
  const res = await request(makeApexApp()).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, new RegExp(BLESSBOARD_NAME));
  assert.match(res.text, /brand-name/);
  assert.match(res.text, /Find Your Church/);
  assert.match(res.text, /Church Administrator Login/);
  assert.doesNotMatch(res.text, /data-tenant-header="1"/);
  assert.doesNotMatch(res.text, /data-tenant-brand="1"/);
});

test("tenant A branding does not appear on tenant B homepage", async () => {
  const appA = makeTenantApp(
    { id: 1, name: "Alpha Unique Church", status: "active" },
    { id: 1, name: "Alpha Unique Branch", status: "active", host_slug: "alpha-u" }
  );
  const appB = makeTenantApp(
    { id: 2, name: "Beta Unique Church", status: "active" },
    { id: 2, name: "Beta Unique Branch", status: "active", host_slug: "beta-u" }
  );
  const a = await request(appA).get("/");
  const b = await request(appB).get("/");
  assert.match(a.text, /Alpha Unique Church/);
  assert.doesNotMatch(a.text, /Beta Unique Church/);
  assert.match(b.text, /Beta Unique Church/);
  assert.doesNotMatch(b.text, /Alpha Unique Church/);
});

test("tenant public pages share tenant-branded header", async () => {
  const app = makeTenantApp(
    { id: 1, name: "Shared Header Church", status: "active" },
    { id: 1, name: "Shared Header Branch", status: "active", host_slug: "shared-header" }
  );
  for (const route of ["/", "/about", "/leadership", "/ministries", "/events", "/sermons", "/giving", "/contact"]) {
    const res = await request(app).get(route);
    assert.equal(res.status, 200, `${route} should render`);
    assert.match(res.text, /data-tenant-header="1"/, `${route} should use tenant header`);
    assert.match(res.text, /Shared Header Church/, `${route} should show church name`);
    assert.match(res.text, /href="\/login"/, `${route} should keep tenant login`);
    assert.match(res.text, /href="\/register"/, `${route} should keep tenant register`);
    assert.doesNotMatch(res.text, /https:\/\/[^"]+\/login/);
  }
});

test("powered-by colors and shared component remain for tenant pages", () => {
  const css = fs.readFileSync(path.join(__dirname, "../public/church/church.css"), "utf8");
  assert.match(css, /\.bb-powered-by__label\s*\{[^}]*color:\s*var\(--church-powered-by-gray\)/s);
  assert.match(css, /\.bb-powered-by__getpro\s*\{[^}]*color:\s*var\(--church-getpro-orange\)/s);
  const powered = fs.readFileSync(
    path.join(__dirname, "../views/church/partials/powered_by_getpro.ejs"),
    "utf8"
  );
  assert.match(powered, /bb-powered-by__label/);
  assert.match(powered, /bb-powered-by__getpro/);
  const shell = fs.readFileSync(
    path.join(__dirname, "../views/church/partials/public_shell_start.ejs"),
    "utf8"
  );
  assert.match(shell, /tenant_brand_lockup/);
  assert.match(shell, /powered_by_getpro/);
  assert.doesNotMatch(shell, /church-brand--branch-desktop[\s\S]*brand_lockup/);
});

test("preparePublicViewModel exposes safe churchLogoUrl from existing org fields", () => {
  const withLogo = preparePublicViewModel(
    { name: "Org", logo_url: "/uploads/church-logo.png" },
    { name: "Branch" },
    buildBranchFallbacks({ name: "Org" }, { name: "Branch" })
  );
  assert.equal(withLogo.churchLogoUrl, "/uploads/church-logo.png");
  assert.equal(withLogo.organizationName, "Org");
  assert.equal(withLogo.branchName, "Branch");

  const unsafe = preparePublicViewModel(
    { name: "Org", logo_url: "javascript:alert(1)" },
    { name: "Branch" },
    buildBranchFallbacks({ name: "Org" }, { name: "Branch" })
  );
  assert.equal(unsafe.churchLogoUrl, "");
});

test("authenticated portal shells remain unchanged", () => {
  const member = fs.readFileSync(
    path.join(__dirname, "../views/church/partials/member_shell_start.ejs"),
    "utf8"
  );
  const branch = fs.readFileSync(
    path.join(__dirname, "../views/church/partials/branch_admin_shell_start.ejs"),
    "utf8"
  );
  const hq = fs.readFileSync(path.join(__dirname, "../views/church/partials/hq_shell_start.ejs"), "utf8");
  assert.doesNotMatch(member, /data-tenant-header/);
  assert.doesNotMatch(branch, /data-tenant-header/);
  assert.doesNotMatch(hq, /data-tenant-header/);
  assert.doesNotMatch(member, /tenant_brand_lockup/);
  assert.doesNotMatch(branch, /tenant_brand_lockup/);
});
