"use strict";

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  operationalHref,
  homepageOperationalHref,
  marketingApexLoginRedirectTarget,
  DEFAULT_OPS_SLUG,
} = require("../src/lib/marketingOperationalUrls");
const {
  FIELD_AGENT_DASHBOARD,
  ADMIN_DASHBOARD,
  ADMIN_SUPER,
  dashboardPathAfterFieldAgentLogin,
} = require("../src/auth/postLoginDestinations");

function reqGlobalApex(cfCountry) {
  return {
    isApexHost: true,
    tenant: { slug: "global", id: 1 },
    tenantUrlPrefix: "",
    get(name) {
      if (String(name).toLowerCase() === "cf-ipcountry") return cfCountry || "";
      return "";
    },
  };
}

test("operationalHref: marketing apex global tenant → zm subdomain URL", () => {
  process.env.BASE_DOMAIN = "pronline.org";
  process.env.PUBLIC_SCHEME = "https";
  const req = reqGlobalApex("");
  assert.equal(operationalHref(req, "/login"), `https://${DEFAULT_OPS_SLUG}.pronline.org/login`);
  assert.equal(operationalHref(req, "/join?embed=1"), `https://${DEFAULT_OPS_SLUG}.pronline.org/join?embed=1`);
  assert.equal(operationalHref(req, "/directory?q=plumber"), `https://${DEFAULT_OPS_SLUG}.pronline.org/directory?q=plumber`);
});

test("homepageOperationalHref: global apex + CF country ZM → zm host", () => {
  process.env.BASE_DOMAIN = "pronline.org";
  process.env.PUBLIC_SCHEME = "https";
  assert.equal(homepageOperationalHref(reqGlobalApex("ZM"), "/directory"), "https://zm.pronline.org/directory");
});

test("homepageOperationalHref: global apex + CF country IL → il host", () => {
  process.env.BASE_DOMAIN = "pronline.org";
  process.env.PUBLIC_SCHEME = "https";
  const prev = process.env.ISRAEL_COMING_SOON;
  process.env.ISRAEL_COMING_SOON = "false";
  try {
    assert.equal(homepageOperationalHref(reqGlobalApex("IL"), "/join?embed=1"), "https://il.pronline.org/join?embed=1");
  } finally {
    if (prev === undefined) delete process.env.ISRAEL_COMING_SOON;
    else process.env.ISRAEL_COMING_SOON = prev;
  }
});

test("homepageOperationalHref: global apex + IL + ISRAEL_COMING_SOON → zm hub (not il)", () => {
  process.env.BASE_DOMAIN = "pronline.org";
  process.env.PUBLIC_SCHEME = "https";
  const prev = process.env.ISRAEL_COMING_SOON;
  process.env.ISRAEL_COMING_SOON = "true";
  try {
    assert.equal(
      homepageOperationalHref(reqGlobalApex("IL"), "/join?embed=1"),
      `https://${DEFAULT_OPS_SLUG}.pronline.org/join?embed=1`
    );
  } finally {
    if (prev === undefined) delete process.env.ISRAEL_COMING_SOON;
    else process.env.ISRAEL_COMING_SOON = prev;
  }
});

test("homepageOperationalHref: regional zm tenant → same as operationalHref (relative)", () => {
  process.env.BASE_DOMAIN = "pronline.org";
  const req = {
    isApexHost: false,
    tenant: { slug: "zm", id: 4 },
    tenantUrlPrefix: "",
    get() {
      return "";
    },
  };
  assert.equal(homepageOperationalHref(req, "/directory"), operationalHref(req, "/directory"));
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
