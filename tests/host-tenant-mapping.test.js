"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

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
      return this.headers[n] || "";
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

test("getSubdomain: demo.pronline.org → demo (Host header)", () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "pronline.org";
  try {
    const sub = getSubdomain(makeReq("demo.pronline.org"));
    assert.equal(sub, "demo");
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});

test("getSubdomain: zm.pronline.org → zm", () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "pronline.org";
  try {
    assert.equal(getSubdomain(makeReq("zm.pronline.org")), "zm");
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});

test("getSubdomain: il.pronline.org → il", () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "pronline.org";
  try {
    assert.equal(getSubdomain(makeReq("il.pronline.org")), "il");
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});

test("getSubdomain: X-Forwarded-Host wins when trust proxy is on", () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "pronline.org";
  try {
    const sub = getSubdomain(
      makeReq("127.0.0.1:3000", { xForwardedHost: "demo.pronline.org", trustProxy: true })
    );
    assert.equal(sub, "demo");
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});
