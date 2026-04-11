"use strict";

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { buildPublicGeoLocals } = require("../src/lib/buildPublicGeoLocals");

function makeReq({ cc, isApexHost, tenantSlug }) {
  return {
    isApexHost: !!isApexHost,
    tenant: { slug: tenantSlug },
    get(name) {
      if (String(name).toLowerCase() === "cf-ipcountry") return cc != null ? String(cc) : "";
      return "";
    },
  };
}

test("A: unsupported country US on global marketing apex → banner + ZM join embed", () => {
  process.env.BASE_DOMAIN = "getproapp.org";
  process.env.PUBLIC_SCHEME = "https";
  const req = makeReq({ cc: "US", isApexHost: true, tenantSlug: "global" });
  const out = buildPublicGeoLocals(req);
  assert.equal(out.showUnsupportedCountryBanner, true);
  assert.ok(out.joinModalEmbedSrc);
  assert.ok(String(out.joinModalEmbedSrc).includes("zm."));
  assert.ok(String(out.joinModalEmbedSrc).includes("/join?embed=1"));
});

test("B: missing geo → no banner", () => {
  process.env.BASE_DOMAIN = "getproapp.org";
  const req = makeReq({ cc: "", isApexHost: true, tenantSlug: "global" });
  const out = buildPublicGeoLocals(req);
  assert.equal(out.showUnsupportedCountryBanner, false);
  assert.equal(out.joinModalEmbedSrc, undefined);
});

test("C: regional zm tenant (non–global-apex) → no banner even if cc is US", () => {
  process.env.BASE_DOMAIN = "getproapp.org";
  const req = makeReq({ cc: "US", isApexHost: false, tenantSlug: "zm" });
  const out = buildPublicGeoLocals(req);
  assert.equal(out.showUnsupportedCountryBanner, false);
  assert.equal(out.joinModalEmbedSrc, undefined);
});

test("C2: il regional host → no banner for US visitor", () => {
  process.env.BASE_DOMAIN = "getproapp.org";
  const req = makeReq({ cc: "US", isApexHost: false, tenantSlug: "il" });
  const out = buildPublicGeoLocals(req);
  assert.equal(out.showUnsupportedCountryBanner, false);
});

test("D: ZM and IL visitors on global apex → no unsupported banner", () => {
  process.env.BASE_DOMAIN = "getproapp.org";
  const zmOut = buildPublicGeoLocals(makeReq({ cc: "ZM", isApexHost: true, tenantSlug: "global" }));
  assert.equal(zmOut.showUnsupportedCountryBanner, false);
  const ilOut = buildPublicGeoLocals(makeReq({ cc: "IL", isApexHost: true, tenantSlug: "global" }));
  assert.equal(ilOut.showUnsupportedCountryBanner, false);
});

test("E: homepageOpsHref appears exactly once in public routes (homepage-only)", () => {
  const s = fs.readFileSync(path.join(__dirname, "../src/routes/public.js"), "utf8");
  const matches = s.match(/homepageOpsHref\s*:/g);
  assert.equal(matches ? matches.length : 0, 1, "homepageOpsHref must only be passed from GET /");
});

test("E2: res.render(\"directory\" block does not assign homepageOpsHref", () => {
  const s = fs.readFileSync(path.join(__dirname, "../src/routes/public.js"), "utf8");
  const dirStart = s.indexOf('res.render("directory"');
  assert.ok(dirStart >= 0);
  const slice = s.slice(dirStart, dirStart + 2500);
  assert.ok(!slice.includes("homepageOpsHref"), "directory render must not inject homepageOpsHref");
});

test("F: GET /directory handler has no country-based redirect", () => {
  const s = fs.readFileSync(path.join(__dirname, "../src/routes/public.js"), "utf8");
  const m = s.match(/router\.get\("\/directory"[\s\S]*?^\s*\}\);/m);
  assert.ok(m, "expected router.get(\"/directory\") block");
  const block = m[0];
  assert.ok(!/redirect\s*\(/i.test(block), "directory must not redirect on geo");
});
