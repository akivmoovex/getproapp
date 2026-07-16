"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const churchRoutes = require("../src/routes/church");
const { BLESSBOARD_NAME } = require("../src/church/branding");

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

function makeTenantApp() {
  return makeApp({
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
    },
  });
}

function makeApexApp() {
  return makeApp({ kind: "vertical-apex", host: "blessboard.com", organization: null, branch: null });
}

const CSS_PATH = path.join(__dirname, "../public/church/church.css");
const PUBLIC_SHELL = path.join(__dirname, "../views/church/partials/public_shell_start.ejs");
const MEMBER_SHELL = path.join(__dirname, "../views/church/partials/member_shell_start.ejs");

function readPublicCssVersion() {
  const shell = fs.readFileSync(PUBLIC_SHELL, "utf8");
  const match = shell.match(/church\.css\?v=(\d+)/);
  assert.ok(match, "public shell should reference church.css version");
  return match[1];
}

test("shared public max-width token exists", () => {
  const css = fs.readFileSync(CSS_PATH, "utf8");
  assert.match(css, /--church-max-width:\s*1280px/);
});

test("desktop and mobile side padding tokens exist", () => {
  const css = fs.readFileSync(CSS_PATH, "utf8");
  assert.match(css, /--church-margin-desktop:\s*32px/);
  assert.match(css, /--church-margin-mobile:\s*16px/);
});

test("no undefined public spacing variable is used without definition", () => {
  const css = fs.readFileSync(CSS_PATH, "utf8");
  const defs = new Set([...css.matchAll(/--church-[a-z0-9-]+:/g)].map((m) => m[0].slice(0, -1)));
  for (const name of [
    "--church-max-width",
    "--church-margin-desktop",
    "--church-margin-mobile",
    "--church-public-bp",
    "--church-public-card-radius",
    "--church-public-btn-radius",
  ]) {
    assert.ok(defs.has(name), `missing definition for ${name}`);
  }
  const spacingUses = [...css.matchAll(/var\((--church-(?:margin|space|max-width)[^,)]+)/g)].map((m) => m[1]);
  for (const use of new Set(spacingUses)) {
    assert.ok(defs.has(use), `undefined spacing var used: ${use}`);
  }
});

test("shared public breakpoint is consistent at 900px", () => {
  const css = fs.readFileSync(CSS_PATH, "utf8");
  assert.match(css, /--church-public-bp:\s*900px/);
  assert.match(css, /Public dual-layout \+ header: max-width 899px/);
  assert.match(css, /Public dual-layout \+ header: min-width 900px/);
  assert.match(css, /\.home-desktop-design \{ display: none !important; \}/);
  assert.match(css, /\.home-mobile-design \{ display: none !important; \}/);
  assert.doesNotMatch(
    css,
    /\.church-body--apex \.church-header__actions \.church-btn--ghost[\s\S]{0,80}display: inline-flex/
  );
});

test("primary and secondary public button structural classes exist", () => {
  const css = fs.readFileSync(CSS_PATH, "utf8");
  assert.match(css, /\.church-btn--public-primary\s*\{/);
  assert.match(css, /\.church-btn--public-secondary\s*\{/);
  assert.match(css, /\.church-btn--public-text\s*\{/);
  assert.match(css, /--church-public-btn-min-height:\s*44px/);
  assert.match(css, /--church-public-btn-radius:\s*12px/);
});

test("shared card tokens and empty-state class exist", () => {
  const css = fs.readFileSync(CSS_PATH, "utf8");
  assert.match(css, /--church-public-card-radius:/);
  assert.match(css, /--church-public-card-border:/);
  assert.match(css, /--church-public-card-shadow:/);
  assert.match(css, /\.church-public-card\s*,|\.church-content-card,\s*\n\.church-public-card/);
  assert.match(css, /\.church-public-empty-state/);
  assert.match(css, /\.church-empty-state,/);
});

test("public CSS cache version is consistent", () => {
  const version = readPublicCssVersion();
  const shell = fs.readFileSync(PUBLIC_SHELL, "utf8");
  assert.match(shell, new RegExp(`church\\.css\\?v=${version}`));
});

test("About, Leadership, Events, Sermons, Giving, Contact still render", async () => {
  const app = makeTenantApp();
  const cssVersion = readPublicCssVersion();
  for (const route of ["/about", "/leadership", "/events", "/sermons", "/giving", "/contact"]) {
    const res = await request(app).get(route);
    assert.equal(res.status, 200, `${route} should render`);
    assert.match(res.text, new RegExp(`church\\.css\\?v=${cssVersion}`));
    assert.match(res.text, /data-tenant-header="1"/);
  }
});

test("empty public pages show real empty states without demo injects", async () => {
  const app = makeTenantApp();
  const leadership = await request(app).get("/leadership");
  assert.match(leadership.text, /church-empty-state|church-public-empty-state/);
  assert.doesNotMatch(leadership.text, /Dr\. Samuel Chiluba|Isaac Banda|Showing sample leadership/);

  const events = await request(app).get("/events");
  assert.match(events.text, /No upcoming events yet/);
  assert.doesNotMatch(events.text, /Annual Praise Night/);

  const sermons = await request(app).get("/sermons");
  assert.match(sermons.text, /Sermons coming soon/);
  assert.doesNotMatch(sermons.text, /Faith, Hope &amp; Purpose|sermon-demo\.mp3|youtube-nocookie\.com\/embed\/M7lc1UVf-VE/);

  const giving = await request(app).get("/giving");
  assert.match(giving.text, /Giving details coming soon|Ways to Give/);
  assert.doesNotMatch(giving.text, /5821 0000 4567 890|giving-qr-demo\.png|Demo QR code/);
});

test("Home remains unchanged in structure", async () => {
  const cssVersion = readPublicCssVersion();
  const res = await request(makeTenantApp()).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /data-tenant-home="1"/);
  assert.match(res.text, /bb-tenant-home/);
  assert.match(res.text, /bb-tenant-hero/);
  assert.match(res.text, new RegExp(`church\\.css\\?v=${cssVersion}`));
});

test("Ministries remains unchanged in structure", async () => {
  const res = await request(makeTenantApp()).get("/ministries");
  assert.equal(res.status, 200);
  assert.match(res.text, /data-ministries-page="1"/);
  assert.match(res.text, /bb-public-ministries/);
  assert.match(res.text, /bb-ministries-hero/);
});

test("Tenant header remains unchanged", async () => {
  const res = await request(makeTenantApp()).get("/about");
  assert.match(res.text, /data-tenant-header="1"/);
  assert.match(res.text, /church-header--branch/);
  assert.match(res.text, /Alpha Grace Church/);
  assert.match(res.text, /Downtown Branch/);
});

test("Apex finder remains unchanged", async () => {
  const res = await request(makeApexApp()).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /church-body--apex/);
  assert.match(res.text, new RegExp(BLESSBOARD_NAME));
  assert.match(res.text, /One digital home for your church|Find Your Church/);
});

test("Authenticated portal CSS remains unaffected", () => {
  const publicCssVersion = readPublicCssVersion();
  const memberShell = fs.readFileSync(MEMBER_SHELL, "utf8");
  assert.match(memberShell, /church\.css\?v=\d+/);
  assert.doesNotMatch(memberShell, new RegExp(`church\\.css\\?v=${publicCssVersion}`));
  const css = fs.readFileSync(CSS_PATH, "utf8");
  assert.match(css, /\.church-body--member-portal/);
  assert.match(css, /Authenticated portals keep their own 767\/768 rules/);
});

test("final regression: tenant drawer has no Powered-by; footer has one", async () => {
  const shell = fs.readFileSync(PUBLIC_SHELL, "utf8");
  const drawerStart = shell.indexOf("<% if (!isVerticalApex && !isPreviewMode)");
  const mainStart = shell.indexOf("<main>");
  assert.ok(drawerStart >= 0 && mainStart > drawerStart);
  const tenantDrawer = shell.slice(drawerStart, mainStart);
  assert.doesNotMatch(tenantDrawer, /powered_by_getpro/);

  const footer = fs.readFileSync(
    path.join(__dirname, "../views/church/partials/public_shell_end.ejs"),
    "utf8"
  );
  const branchFooter = footer.slice(
    footer.indexOf("<% if (!isVerticalApex) { %>"),
    footer.indexOf("<% if (!isPreviewMode && isBranchHome)")
  );
  assert.match(branchFooter, /church-footer--branch[\s\S]*powered_by_getpro/);
  assert.equal((branchFooter.match(/powered_by_getpro/g) || []).length, 1);

  const home = await request(makeTenantApp()).get("/");
  assert.equal((home.text.match(/class="bb-powered-by"/g) || []).length, 1);
  assert.match(home.text, /Ask for Prayer/);
  assert.doesNotMatch(home.text, /Send Prayer Request/);
});

test("final regression: desktop hides Connected Community; focus and touch targets", () => {
  const css = fs.readFileSync(CSS_PATH, "utf8");
  assert.match(
    css,
    /@media \(min-width: 900px\) \{[\s\S]*?\.bb-tenant-community \{\s*display: none;/
  );
  assert.match(css, /\.church-nav a:focus-visible/);
  assert.match(css, /\.church-drawer__nav a:focus-visible/);
  assert.match(css, /\.church-menu-btn:focus-visible/);
  assert.match(css, /\.church-menu-btn \{[\s\S]*?min-height:\s*44px/);
});
