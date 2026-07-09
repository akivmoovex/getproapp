"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseChurchHostFromParts,
  parseChurchHostFromDedicatedDomain,
  parseChurchHost,
  isChurchHost,
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

test("isChurchHost: blessboard.com and www.blessboard.com", () => {
  assert.equal(isChurchHost("blessboard.com"), true);
  assert.equal(isChurchHost("www.blessboard.com"), true);
  assert.equal(isChurchHost("BLESSBOARD.COM:443"), true);
});

test("isChurchHost: kafuebaptist.blessboard.com branch tenant", () => {
  assert.equal(isChurchHost("kafuebaptist.blessboard.com"), true);
});

test("isChurchHost: getproapp.org and www.getproapp.org remain platform", () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "getproapp.org";
  try {
    assert.equal(isChurchHost("getproapp.org"), false);
    assert.equal(isChurchHost("www.getproapp.org"), false);
    assert.equal(isChurchHost("zm.getproapp.org"), false);
    assert.equal(isChurchHost("church.getproapp.org"), true);
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});

test("parseChurchHostFromDedicatedDomain: blessboard apex and branch", () => {
  assert.deepEqual(parseChurchHostFromDedicatedDomain("blessboard.com"), {
    kind: "vertical-apex",
    host: "blessboard.com",
  });
  assert.deepEqual(parseChurchHostFromDedicatedDomain("www.blessboard.com"), {
    kind: "vertical-apex",
    host: "www.blessboard.com",
  });
  assert.deepEqual(parseChurchHostFromDedicatedDomain("kafuebaptist.blessboard.com"), {
    kind: "branch",
    orgSlug: "kafuebaptist",
    hostSlug: "kafuebaptist",
    host: "kafuebaptist.blessboard.com",
  });
  assert.deepEqual(parseChurchHostFromDedicatedDomain("foo.bar.blessboard.com"), {
    kind: "branch",
    orgSlug: null,
    hostSlug: null,
    host: "foo.bar.blessboard.com",
  });
});

test("getBlessBoardChurchSlug helper", () => {
  const { getBlessBoardChurchSlug, isBlessBoardHost } = require("../src/church/host");
  assert.equal(getBlessBoardChurchSlug("demo.blessboard.com"), "demo");
  assert.equal(isBlessBoardHost("demo.blessboard.com"), true);
});

test("parseChurchHost: blessboard.com resolves without BASE_DOMAIN church prefix", () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "getproapp.org";
  try {
    const req = makeReq("blessboard.com");
    const parsed = parseChurchHost(req);
    assert.ok(parsed);
    assert.equal(parsed.kind, "vertical-apex");
    assert.equal(parsed.host, "blessboard.com");
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});
