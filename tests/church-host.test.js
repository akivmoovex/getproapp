"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseChurchHostFromParts,
  CHURCH_VERTICAL_LABEL,
  isChurchVerticalSubdomain,
} = require("../src/church/host");
const { getSubdomain } = require("../src/platform/host");

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

test("parseChurchHostFromParts: church.getproapp.org → vertical-apex", () => {
  const parsed = parseChurchHostFromParts("church.getproapp.org", "getproapp.org");
  assert.ok(parsed);
  assert.equal(parsed.kind, "vertical-apex");
  assert.equal(parsed.host, "church.getproapp.org");
});

test("parseChurchHostFromParts: kafuebaptist.church.getproapp.org → branch", () => {
  const parsed = parseChurchHostFromParts("kafuebaptist.church.getproapp.org", "getproapp.org");
  assert.ok(parsed);
  assert.equal(parsed.kind, "branch");
  assert.equal(parsed.orgSlug, "kafuebaptist");
});

test("parseChurchHostFromParts: zm.getproapp.org → null (regional unchanged)", () => {
  assert.equal(parseChurchHostFromParts("zm.getproapp.org", "getproapp.org"), null);
});

test("parseChurchHostFromParts: demo-lusaka-spark.getproapp.org → null (company subdomain unchanged)", () => {
  assert.equal(parseChurchHostFromParts("demo-lusaka-spark.getproapp.org", "getproapp.org"), null);
});

test("parseChurchHostFromParts: getproapp.org apex → null", () => {
  assert.equal(parseChurchHostFromParts("getproapp.org", "getproapp.org"), null);
});

test("getSubdomain: zm.getproapp.org still resolves zm", () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "getproapp.org";
  try {
    assert.equal(getSubdomain(makeReq("zm.getproapp.org")), "zm");
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});

test("getSubdomain: kafuebaptist.church.getproapp.org still resolves first label only", () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "getproapp.org";
  try {
    assert.equal(getSubdomain(makeReq("kafuebaptist.church.getproapp.org")), "kafuebaptist");
    assert.equal(parseChurchHostFromParts("kafuebaptist.church.getproapp.org", "getproapp.org").kind, "branch");
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});

test("isChurchVerticalSubdomain: church label is reserved", () => {
  assert.equal(isChurchVerticalSubdomain("church"), true);
  assert.equal(isChurchVerticalSubdomain("zm"), false);
});

test("CHURCH_VERTICAL_LABEL is church", () => {
  assert.equal(CHURCH_VERTICAL_LABEL, "church");
});
