"use strict";

const path = require("path");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  normalizeHost,
  normalizeHostFromRequest,
  isBlessBoardHost,
  getBlessBoardChurchSlug,
  isChurchHost,
  parseChurchHost,
  parseChurchHostFromDedicatedDomain,
} = require("../src/church/host");
const churchRoutes = require("../src/routes/church");
const { BLESSBOARD_NAME } = require("../src/church/branding");

function makeReq(hostHeader, opts = {}) {
  const { trustProxy = true, xForwardedHost } = opts;
  const headers = {};
  if (xForwardedHost) headers["x-forwarded-host"] = xForwardedHost;
  return {
    query: {},
    headers,
    get(name) {
      const n = String(name || "").toLowerCase();
      if (n === "host") return hostHeader;
      return headers[n] || "";
    },
    app: {
      get(key) {
        if (key === "trust proxy") return trustProxy;
        return undefined;
      },
    },
    hostname: hostHeader ? String(hostHeader).split(":")[0] : "",
  };
}

function makeChurchApp(churchContext) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = churchContext;
    next();
  });
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("platform fallback"));
  return app;
}

test("isBlessBoardHost: apex, www, and church subdomains", () => {
  assert.equal(isBlessBoardHost("blessboard.com"), true);
  assert.equal(isBlessBoardHost("www.blessboard.com"), true);
  assert.equal(isBlessBoardHost("demo.blessboard.com"), true);
  assert.equal(isBlessBoardHost("getproapp.org"), false);
});

test("getBlessBoardChurchSlug extracts branch slug", () => {
  assert.equal(getBlessBoardChurchSlug("blessboard.com"), null);
  assert.equal(getBlessBoardChurchSlug("www.blessboard.com"), null);
  assert.equal(getBlessBoardChurchSlug("kafuebaptist.blessboard.com"), "kafuebaptist");
  assert.equal(getBlessBoardChurchSlug("gracechurch.blessboard.com"), "gracechurch");
  assert.equal(getBlessBoardChurchSlug("demo.blessboard.com"), "demo");
  assert.equal(getBlessBoardChurchSlug("foo.bar.blessboard.com"), null);
});

test("normalizeHostFromRequest uses Host header", () => {
  const req = makeReq("demo.blessboard.com:443");
  assert.equal(normalizeHostFromRequest(req), "demo.blessboard.com");
  assert.equal(normalizeHost("Demo.BLESSBOARD.COM:8080"), "demo.blessboard.com");
});

test("parseChurchHostFromDedicatedDomain: invalid multi-label subdomain is branch host with null slug", () => {
  assert.deepEqual(parseChurchHostFromDedicatedDomain("foo.bar.blessboard.com"), {
    kind: "branch",
    orgSlug: null,
    hostSlug: null,
    host: "foo.bar.blessboard.com",
  });
});

test("getproapp.org is not a church host", () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "getproapp.org";
  try {
    assert.equal(isChurchHost("getproapp.org"), false);
    assert.equal(isChurchHost("www.getproapp.org"), false);
    assert.equal(parseChurchHost(makeReq("getproapp.org")), null);
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});

test("blessboard.com renders BlessBoard landing page", async () => {
  const app = makeChurchApp({
    kind: "vertical-apex",
    host: "blessboard.com",
    organization: null,
    branch: null,
    orgSlug: null,
  });
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, new RegExp(BLESSBOARD_NAME));
  assert.match(res.text, /Powered by[\s\S]{0,120}?GetPro/);
  assert.doesNotMatch(res.text, /platform fallback/);
});

test("www.blessboard.com context renders BlessBoard landing page", async () => {
  const app = makeChurchApp({
    kind: "vertical-apex",
    host: "www.blessboard.com",
    organization: null,
    branch: null,
    orgSlug: null,
  });
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, new RegExp(BLESSBOARD_NAME));
});

test("demo.blessboard.com is recognized as a church tenant host", () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "getproapp.org";
  try {
    const parsed = parseChurchHost(makeReq("demo.blessboard.com"));
    assert.ok(parsed);
    assert.equal(parsed.kind, "branch");
    assert.equal(parsed.orgSlug, "demo");
    assert.equal(isChurchHost("demo.blessboard.com"), true);
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});

test("unknownslug.blessboard.com shows BlessBoard church-not-found page", async () => {
  const app = makeChurchApp({
    kind: "branch",
    host: "unknownslug.blessboard.com",
    orgSlug: "unknownslug",
    hostSlug: "unknownslug",
    organization: null,
    branch: null,
  });
  const res = await request(app).get("/");
  assert.equal(res.status, 404);
  assert.match(res.text, /Church not found/i);
  assert.match(res.text, /BlessBoard/);
  assert.match(res.text, /unknownslug/);
  assert.match(res.text, /Powered by[\s\S]{0,120}?GetPro/);
  assert.doesNotMatch(res.text, /platform fallback/);
  assert.doesNotMatch(res.text, /GetPro Church/);
});

test("invalid multi-label blessboard subdomain shows church-not-found page", async () => {
  const app = makeChurchApp({
    kind: "branch",
    host: "foo.bar.blessboard.com",
    orgSlug: null,
    hostSlug: null,
    organization: null,
    branch: null,
  });
  const res = await request(app).get("/login");
  assert.equal(res.status, 404);
  assert.match(res.text, /Church not found/i);
  assert.doesNotMatch(res.text, /platform fallback/);
});
