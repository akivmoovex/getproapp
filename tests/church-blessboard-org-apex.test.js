"use strict";

const path = require("path");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  isBlessBoardHost,
  getBlessBoardChurchSlug,
  isChurchHost,
  parseChurchHost,
  parseChurchHostFromDedicatedDomain,
} = require("../src/church/host");
const {
  isBlessBoardApexDomain,
  getBlessBoardCanonicalDomain,
  getBlessBoardApexDomainSet,
} = require("../src/church/blessBoardApexDomains");
const { isBlessBoardApexHost } = require("../src/church/blessBoardApexHost");
const { blessboardCanonicalRedirect } = require("../src/church/blessboardCanonicalRedirect");
const { getSubdomain, isBlessBoardProductHost } = require("../src/platform/host");
const churchRoutes = require("../src/routes/church");
const { BLESSBOARD_NAME } = require("../src/church/branding");
const { createAttachChurchContext } = require("../src/church/attachChurchContext");

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

function makeRedirectApp() {
  const app = express();
  app.set("trust proxy", true);
  app.use(blessboardCanonicalRedirect);
  app.get("*path", (req, res) => {
    res.status(200).send(`ok:${req.headers.host}`);
  });
  return app;
}

function makeApexChurchApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.set("trust proxy", true);
  app.use((req, res, next) => {
    req.subdomain = getSubdomain(req);
    next();
  });
  app.use(createAttachChurchContext());
  app.use(blessboardCanonicalRedirect);
  app.use(churchRoutes());
  app.use((req, res) => res.status(200).type("text").send("platform fallback"));
  return app;
}

test("default apex set includes .com and .org hosts", () => {
  const prev = process.env.BLESSBOARD_APEX_DOMAINS;
  delete process.env.BLESSBOARD_APEX_DOMAINS;
  try {
    const set = getBlessBoardApexDomainSet();
    assert.equal(set.has("blessboard.com"), true);
    assert.equal(set.has("www.blessboard.com"), true);
    assert.equal(set.has("blessboard.org"), true);
    assert.equal(set.has("www.blessboard.org"), true);
    assert.equal(getBlessBoardCanonicalDomain(), "blessboard.com");
  } finally {
    if (prev !== undefined) process.env.BLESSBOARD_APEX_DOMAINS = prev;
  }
});

test("blessboard.org and www.blessboard.org are apex, not tenants", () => {
  assert.equal(isBlessBoardApexDomain("blessboard.org"), true);
  assert.equal(isBlessBoardApexDomain("www.blessboard.org"), true);
  assert.equal(isBlessBoardApexHost(makeReq("blessboard.org")), true);
  assert.equal(isBlessBoardApexHost(makeReq("www.blessboard.org")), true);
  assert.equal(getBlessBoardChurchSlug("blessboard.org"), null);
  assert.equal(getBlessBoardChurchSlug("www.blessboard.org"), null);
  assert.equal(getBlessBoardChurchSlug("demo.blessboard.org"), null);
  assert.deepEqual(parseChurchHostFromDedicatedDomain("blessboard.org"), {
    kind: "vertical-apex",
    host: "blessboard.org",
  });
  assert.deepEqual(parseChurchHostFromDedicatedDomain("www.blessboard.org"), {
    kind: "vertical-apex",
    host: "www.blessboard.org",
  });
  assert.equal(parseChurchHostFromDedicatedDomain("demo.blessboard.org"), null);
  assert.equal(isBlessBoardHost("demo.blessboard.org"), false);
});

test("www.blessboard.com is apex not a tenant slug", () => {
  assert.equal(isBlessBoardApexDomain("www.blessboard.com"), true);
  assert.equal(getBlessBoardChurchSlug("www.blessboard.com"), null);
  assert.deepEqual(parseChurchHost(makeReq("www.blessboard.com")), {
    kind: "vertical-apex",
    host: "www.blessboard.com",
  });
});

test("demo.blessboard.com still resolves as a tenant branch host", () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "getproapp.org";
  try {
    const parsed = parseChurchHost(makeReq("demo.blessboard.com"));
    assert.ok(parsed);
    assert.equal(parsed.kind, "branch");
    assert.equal(parsed.orgSlug, "demo");
    assert.equal(isChurchHost("demo.blessboard.com"), true);
    assert.equal(isBlessBoardApexHost(makeReq("demo.blessboard.com")), false);
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});

test("getproapp.org and unknown hosts are not BlessBoard product hosts", () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "getproapp.org";
  try {
    assert.equal(isBlessBoardProductHost("getproapp.org"), false);
    assert.equal(isBlessBoardProductHost("www.getproapp.org"), false);
    assert.equal(isBlessBoardProductHost("proline.org"), false);
    assert.equal(isChurchHost("getproapp.org"), false);
    assert.equal(isBlessBoardHost("example.com"), false);
    assert.equal(getSubdomain(makeReq("getproapp.org")), null);
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});

test("canonical redirect: blessboard.org preserves path and query", async () => {
  const prev = process.env.BLESSBOARD_CANONICAL_REDIRECT;
  process.env.BLESSBOARD_CANONICAL_REDIRECT = "1";
  try {
    const app = makeRedirectApp();
    const res = await request(app)
      .get("/pricing?ref=test")
      .set("Host", "blessboard.org")
      .set("X-Forwarded-Proto", "https");
    assert.equal(res.status, 301);
    assert.equal(res.headers.location, "https://blessboard.com/pricing?ref=test");
  } finally {
    if (prev === undefined) delete process.env.BLESSBOARD_CANONICAL_REDIRECT;
    else process.env.BLESSBOARD_CANONICAL_REDIRECT = prev;
  }
});

test("canonical redirect: www.blessboard.org preserves path and query", async () => {
  const prev = process.env.BLESSBOARD_CANONICAL_REDIRECT;
  process.env.BLESSBOARD_CANONICAL_REDIRECT = "1";
  try {
    const app = makeRedirectApp();
    const res = await request(app)
      .get("/about?utm=1")
      .set("Host", "www.blessboard.org")
      .set("X-Forwarded-Proto", "https");
    assert.equal(res.status, 301);
    assert.equal(res.headers.location, "https://blessboard.com/about?utm=1");
  } finally {
    if (prev === undefined) delete process.env.BLESSBOARD_CANONICAL_REDIRECT;
    else process.env.BLESSBOARD_CANONICAL_REDIRECT = prev;
  }
});

test("canonical redirect: blessboard.com does not redirect-loop", async () => {
  const prev = process.env.BLESSBOARD_CANONICAL_REDIRECT;
  process.env.BLESSBOARD_CANONICAL_REDIRECT = "1";
  try {
    const app = makeRedirectApp();
    const res = await request(app)
      .get("/")
      .set("Host", "blessboard.com")
      .set("X-Forwarded-Proto", "https");
    assert.equal(res.status, 200);
    assert.match(res.text, /ok:blessboard\.com/);
  } finally {
    if (prev === undefined) delete process.env.BLESSBOARD_CANONICAL_REDIRECT;
    else process.env.BLESSBOARD_CANONICAL_REDIRECT = prev;
  }
});

test("blessboard.com serves BlessBoard apex homepage", async () => {
  const prev = process.env.BLESSBOARD_CANONICAL_REDIRECT;
  process.env.BLESSBOARD_CANONICAL_REDIRECT = "0";
  try {
    const app = makeApexChurchApp();
    const res = await request(app).get("/").set("Host", "blessboard.com");
    assert.equal(res.status, 200);
    assert.match(res.text, new RegExp(BLESSBOARD_NAME));
    assert.doesNotMatch(res.text, /platform fallback/);
    assert.doesNotMatch(res.text, /Find Trusted Service Providers/i);
  } finally {
    if (prev === undefined) delete process.env.BLESSBOARD_CANONICAL_REDIRECT;
    else process.env.BLESSBOARD_CANONICAL_REDIRECT = prev;
  }
});

test("blessboard.org serves BlessBoard apex when redirects disabled", async () => {
  const prev = process.env.BLESSBOARD_CANONICAL_REDIRECT;
  process.env.BLESSBOARD_CANONICAL_REDIRECT = "0";
  try {
    const app = makeApexChurchApp();
    const res = await request(app).get("/").set("Host", "blessboard.org");
    assert.equal(res.status, 200);
    assert.match(res.text, new RegExp(BLESSBOARD_NAME));
    assert.doesNotMatch(res.text, /platform fallback/);
  } finally {
    if (prev === undefined) delete process.env.BLESSBOARD_CANONICAL_REDIRECT;
    else process.env.BLESSBOARD_CANONICAL_REDIRECT = prev;
  }
});

test("www.blessboard.com is not resolved as a church tenant by attachChurchContext", async () => {
  const prev = process.env.BLESSBOARD_CANONICAL_REDIRECT;
  process.env.BLESSBOARD_CANONICAL_REDIRECT = "0";
  try {
    const app = makeApexChurchApp();
    const res = await request(app).get("/").set("Host", "www.blessboard.com");
    assert.equal(res.status, 200);
    assert.match(res.text, new RegExp(BLESSBOARD_NAME));
    assert.doesNotMatch(res.text, /Church not found/i);
  } finally {
    if (prev === undefined) delete process.env.BLESSBOARD_CANONICAL_REDIRECT;
    else process.env.BLESSBOARD_CANONICAL_REDIRECT = prev;
  }
});
