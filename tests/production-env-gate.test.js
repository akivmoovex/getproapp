"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getProductionMissingRequiredEnv,
  summarizeProductionEnvPresence,
} = require("../src/startup/productionEnvGate");

test("getProductionMissingRequiredEnv: empty when not production", () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    assert.deepEqual(getProductionMissingRequiredEnv(), []);
  } finally {
    if (prev !== undefined) process.env.NODE_ENV = prev;
    else delete process.env.NODE_ENV;
  }
});

test("getProductionMissingRequiredEnv: requires SESSION_SECRET and BASE_DOMAIN in production", () => {
  const prev = {
    n: process.env.NODE_ENV,
    s: process.env.SESSION_SECRET,
    b: process.env.BASE_DOMAIN,
    p: process.env.PLATFORM_DEPLOYMENT_CODE,
    d: process.env.DEPLOYMENT_ENV,
  };
  process.env.NODE_ENV = "production";
  delete process.env.SESSION_SECRET;
  delete process.env.BASE_DOMAIN;
  delete process.env.PLATFORM_DEPLOYMENT_CODE;
  delete process.env.DEPLOYMENT_ENV;
  try {
    const m = getProductionMissingRequiredEnv().sort();
    assert.deepEqual(m, ["BASE_DOMAIN", "SESSION_SECRET"]);
  } finally {
    if (prev.n !== undefined) process.env.NODE_ENV = prev.n;
    else delete process.env.NODE_ENV;
    if (prev.s !== undefined) process.env.SESSION_SECRET = prev.s;
    else delete process.env.SESSION_SECRET;
    if (prev.b !== undefined) process.env.BASE_DOMAIN = prev.b;
    else delete process.env.BASE_DOMAIN;
    if (prev.p !== undefined) process.env.PLATFORM_DEPLOYMENT_CODE = prev.p;
    else delete process.env.PLATFORM_DEPLOYMENT_CODE;
    if (prev.d !== undefined) process.env.DEPLOYMENT_ENV = prev.d;
    else delete process.env.DEPLOYMENT_ENV;
  }
});

test("getProductionMissingRequiredEnv: production profile skips BASE_DOMAIN", () => {
  const prev = {
    n: process.env.NODE_ENV,
    s: process.env.SESSION_SECRET,
    b: process.env.BASE_DOMAIN,
    p: process.env.PLATFORM_DEPLOYMENT_CODE,
    d: process.env.DEPLOYMENT_ENV,
    u: process.env.DATABASE_URL,
  };
  process.env.NODE_ENV = "production";
  process.env.PLATFORM_DEPLOYMENT_CODE = "blessboard-com-production";
  delete process.env.DEPLOYMENT_ENV;
  process.env.SESSION_SECRET = "s".repeat(40);
  process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/prod";
  delete process.env.BASE_DOMAIN;
  try {
    assert.deepEqual(getProductionMissingRequiredEnv(), []);
  } finally {
    if (prev.n !== undefined) process.env.NODE_ENV = prev.n;
    else delete process.env.NODE_ENV;
    if (prev.s !== undefined) process.env.SESSION_SECRET = prev.s;
    else delete process.env.SESSION_SECRET;
    if (prev.b !== undefined) process.env.BASE_DOMAIN = prev.b;
    else delete process.env.BASE_DOMAIN;
    if (prev.p !== undefined) process.env.PLATFORM_DEPLOYMENT_CODE = prev.p;
    else delete process.env.PLATFORM_DEPLOYMENT_CODE;
    if (prev.d !== undefined) process.env.DEPLOYMENT_ENV = prev.d;
    else delete process.env.DEPLOYMENT_ENV;
    if (prev.u !== undefined) process.env.DATABASE_URL = prev.u;
    else delete process.env.DATABASE_URL;
  }
});

test("getProductionMissingRequiredEnv: V5 foundation / staging skips BASE_DOMAIN", () => {
  const prev = {
    n: process.env.NODE_ENV,
    s: process.env.SESSION_SECRET,
    b: process.env.BASE_DOMAIN,
    p: process.env.PLATFORM_DEPLOYMENT_CODE,
    d: process.env.DEPLOYMENT_ENV,
    u: process.env.DATABASE_URL,
  };
  process.env.NODE_ENV = "production";
  process.env.PLATFORM_DEPLOYMENT_CODE = "blessboard-org-staging";
  delete process.env.DEPLOYMENT_ENV;
  process.env.SESSION_SECRET = "s".repeat(40);
  process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/staging";
  delete process.env.BASE_DOMAIN;
  try {
    assert.deepEqual(getProductionMissingRequiredEnv(), []);
  } finally {
    if (prev.n !== undefined) process.env.NODE_ENV = prev.n;
    else delete process.env.NODE_ENV;
    if (prev.s !== undefined) process.env.SESSION_SECRET = prev.s;
    else delete process.env.SESSION_SECRET;
    if (prev.b !== undefined) process.env.BASE_DOMAIN = prev.b;
    else delete process.env.BASE_DOMAIN;
    if (prev.p !== undefined) process.env.PLATFORM_DEPLOYMENT_CODE = prev.p;
    else delete process.env.PLATFORM_DEPLOYMENT_CODE;
    if (prev.d !== undefined) process.env.DEPLOYMENT_ENV = prev.d;
    else delete process.env.DEPLOYMENT_ENV;
    if (prev.u !== undefined) process.env.DATABASE_URL = prev.u;
    else delete process.env.DATABASE_URL;
  }
});

test("getProductionMissingRequiredEnv: deprecated blessboard-org-v5 alias skips BASE_DOMAIN", () => {
  const prev = {
    n: process.env.NODE_ENV,
    s: process.env.SESSION_SECRET,
    b: process.env.BASE_DOMAIN,
    p: process.env.PLATFORM_DEPLOYMENT_CODE,
    d: process.env.DEPLOYMENT_ENV,
    u: process.env.DATABASE_URL,
  };
  process.env.NODE_ENV = "production";
  process.env.PLATFORM_DEPLOYMENT_CODE = "blessboard-org-v5";
  delete process.env.DEPLOYMENT_ENV;
  process.env.SESSION_SECRET = "s".repeat(40);
  process.env.DATABASE_URL = "postgres://u:p@127.0.0.1:5432/staging";
  delete process.env.BASE_DOMAIN;
  try {
    assert.deepEqual(getProductionMissingRequiredEnv(), []);
  } finally {
    if (prev.n !== undefined) process.env.NODE_ENV = prev.n;
    else delete process.env.NODE_ENV;
    if (prev.s !== undefined) process.env.SESSION_SECRET = prev.s;
    else delete process.env.SESSION_SECRET;
    if (prev.b !== undefined) process.env.BASE_DOMAIN = prev.b;
    else delete process.env.BASE_DOMAIN;
    if (prev.p !== undefined) process.env.PLATFORM_DEPLOYMENT_CODE = prev.p;
    else delete process.env.PLATFORM_DEPLOYMENT_CODE;
    if (prev.d !== undefined) process.env.DEPLOYMENT_ENV = prev.d;
    else delete process.env.DEPLOYMENT_ENV;
    if (prev.u !== undefined) process.env.DATABASE_URL = prev.u;
    else delete process.env.DATABASE_URL;
  }
});

test("summarizeProductionEnvPresence: reports DATABASE_URL and SESSION_SECRET", () => {
  const prev = {
    d: process.env.DATABASE_URL,
    s: process.env.SESSION_SECRET,
    b: process.env.BASE_DOMAIN,
    p: process.env.PUBLIC_SCHEME,
  };
  process.env.DATABASE_URL = "postgres://x/y";
  process.env.SESSION_SECRET = "x".repeat(32);
  process.env.BASE_DOMAIN = "example.com";
  delete process.env.PUBLIC_SCHEME;
  try {
    const o = summarizeProductionEnvPresence();
    assert.equal(o.DATABASE_URL, "yes");
    assert.equal(o.SESSION_SECRET, "yes");
    assert.equal(o.BASE_DOMAIN, "yes");
    assert.match(o.PUBLIC_SCHEME, /no/);
  } finally {
    if (prev.d !== undefined) process.env.DATABASE_URL = prev.d;
    else delete process.env.DATABASE_URL;
    if (prev.s !== undefined) process.env.SESSION_SECRET = prev.s;
    else delete process.env.SESSION_SECRET;
    if (prev.b !== undefined) process.env.BASE_DOMAIN = prev.b;
    else delete process.env.BASE_DOMAIN;
    if (prev.p !== undefined) process.env.PUBLIC_SCHEME = prev.p;
    else delete process.env.PUBLIC_SCHEME;
  }
});
