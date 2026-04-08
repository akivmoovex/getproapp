"use strict";

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { operationalHref, marketingApexLoginRedirectTarget, DEFAULT_OPS_SLUG } = require("../src/lib/marketingOperationalUrls");
const {
  FIELD_AGENT_DASHBOARD,
  ADMIN_DASHBOARD,
  ADMIN_SUPER,
  dashboardPathAfterFieldAgentLogin,
} = require("../src/auth/postLoginDestinations");

test("operationalHref: marketing apex global tenant → zm subdomain URL", () => {
  const req = {
    isApexHost: true,
    tenant: { slug: "global", id: 1 },
    tenantUrlPrefix: "",
  };
  process.env.BASE_DOMAIN = "pronline.org";
  process.env.PUBLIC_SCHEME = "https";
  assert.equal(operationalHref(req, "/login"), `https://${DEFAULT_OPS_SLUG}.pronline.org/login`);
  assert.equal(operationalHref(req, "/join?embed=1"), `https://${DEFAULT_OPS_SLUG}.pronline.org/join?embed=1`);
  assert.equal(operationalHref(req, "/directory?q=plumber"), `https://${DEFAULT_OPS_SLUG}.pronline.org/directory?q=plumber`);
});

test("operationalHref: regional zm host → same-host relative paths", () => {
  const req = {
    isApexHost: false,
    tenant: { slug: "zm", id: 4 },
    tenantUrlPrefix: "",
  };
  process.env.BASE_DOMAIN = "pronline.org";
  assert.equal(operationalHref(req, "/login"), "/login");
  assert.equal(operationalHref(req, "/directory"), "/directory");
});

test("marketingApexLoginRedirectTarget: only global apex", () => {
  const apexGlobal = {
    isApexHost: true,
    tenant: { slug: "global" },
    url: "/login?x=1",
  };
  process.env.BASE_DOMAIN = "pronline.org";
  process.env.PUBLIC_SCHEME = "https";
  assert.equal(
    marketingApexLoginRedirectTarget(apexGlobal),
    `https://${DEFAULT_OPS_SLUG}.pronline.org/login?x=1`
  );
  const zm = { isApexHost: false, tenant: { slug: "zm" }, url: "/login" };
  assert.equal(marketingApexLoginRedirectTarget(zm), null);
});

test("postLoginDestinations: field agent dashboard path", () => {
  assert.equal(FIELD_AGENT_DASHBOARD, "/field-agent/dashboard");
  assert.equal(dashboardPathAfterFieldAgentLogin(), FIELD_AGENT_DASHBOARD);
  assert.equal(ADMIN_DASHBOARD, "/admin/dashboard");
  assert.equal(ADMIN_SUPER, "/admin/super");
});

test("join.ejs: embed modal omits top brand row", () => {
  const p = path.join(__dirname, "../views/join.ejs");
  const s = fs.readFileSync(p, "utf8");
  assert.ok(s.includes("joinEmbedModal"), "expected joinEmbedModal local");
  assert.ok(s.includes("join-topbar-row"), "expected join topbar retained for full page");
  assert.ok(
    s.includes("if (!(typeof joinEmbedModal") && s.includes("join-topbar-row"),
    "expected conditional wrapper around join-topbar-row"
  );
});
