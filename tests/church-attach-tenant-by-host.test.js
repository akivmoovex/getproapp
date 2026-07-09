"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createAttachTenantByHost } = require("../src/tenants");
const { getSubdomain, isBlessBoardProductHost } = require("../src/platform/host");
const { isChurchHost } = require("../src/church/host");

function makeReq(hostHeader, opts = {}) {
  const { isChurchHost: churchHost = false } = opts;
  return {
    isChurchHost: churchHost,
    isPlatformTenant: false,
    subdomain: getSubdomain({
      query: {},
      headers: { host: hostHeader },
      get(name) {
        return String(name).toLowerCase() === "host" ? hostHeader : "";
      },
      app: { get(key) { return key === "trust proxy" ? true : undefined; } },
      hostname: hostHeader.split(":")[0],
    }),
    headers: { host: hostHeader },
    get(name) {
      return String(name).toLowerCase() === "host" ? hostHeader : "";
    },
    app: { get(key) { return key === "trust proxy" ? true : undefined; } },
    hostname: hostHeader.split(":")[0],
  };
}

test("attachTenantByHost does not throw ReferenceError on blessboard host", async () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "getproapp.org";
  try {
    const attachTenantByHost = createAttachTenantByHost();
    const req = makeReq("demo.blessboard.com");
    let nextCalled = false;
    await attachTenantByHost(req, {}, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.equal(req.tenant, undefined);
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});

test("demo.blessboard.com is BlessBoard product host, not GetPro platform host", () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "getproapp.org";
  try {
    assert.equal(isBlessBoardProductHost("demo.blessboard.com"), true);
    assert.equal(isChurchHost("demo.blessboard.com"), true);
    assert.equal(getSubdomain(makeReq("demo.blessboard.com")), null);
    assert.equal(isChurchHost("getproapp.org"), false);
    assert.equal(isBlessBoardProductHost("demo.getproapp.org"), false);
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});
