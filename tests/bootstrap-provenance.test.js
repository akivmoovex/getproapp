"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  computeDbUrlProvenance,
  isLiteSpeedLsnodeEntry,
  buildProductionFallbackCandidates,
} = require("../src/startup/bootstrap");

test("computeDbUrlProvenance: host-injected DATABASE_URL", () => {
  const p = computeDbUrlProvenance(
    { DATABASE_URL: true, GETPRO_DATABASE_URL: false },
    [],
    "DATABASE_URL"
  );
  assert.equal(p.kind, "host");
  assert.match(p.logLine, /host-injected/);
});

test("computeDbUrlProvenance: dotenv-file DATABASE_URL", () => {
  const p = computeDbUrlProvenance(
    { DATABASE_URL: false, GETPRO_DATABASE_URL: false },
    ["DATABASE_URL", "NODE_ENV"],
    "DATABASE_URL"
  );
  assert.equal(p.kind, "dotenv");
  assert.match(p.logLine, /dotenv-file/);
});

test("computeDbUrlProvenance: host GETPRO_DATABASE_URL when DATABASE_URL empty", () => {
  const p = computeDbUrlProvenance(
    { DATABASE_URL: false, GETPRO_DATABASE_URL: true },
    [],
    "GETPRO_DATABASE_URL"
  );
  assert.equal(p.kind, "host");
});

test("computeDbUrlProvenance: dotenv GETPRO_DATABASE_URL", () => {
  const p = computeDbUrlProvenance(
    { DATABASE_URL: false, GETPRO_DATABASE_URL: false },
    ["GETPRO_DATABASE_URL"],
    "GETPRO_DATABASE_URL"
  );
  assert.equal(p.kind, "dotenv");
});

test("computeDbUrlProvenance: none", () => {
  const p = computeDbUrlProvenance(
    { DATABASE_URL: false, GETPRO_DATABASE_URL: false },
    [],
    "(none)"
  );
  assert.equal(p.kind, "none");
});

test("computeDbUrlProvenance: production-env-file DATABASE_URL", () => {
  const p = computeDbUrlProvenance(
    { DATABASE_URL: false, GETPRO_DATABASE_URL: false },
    [],
    "DATABASE_URL",
    { productionFileKeys: ["DATABASE_URL"] }
  );
  assert.equal(p.kind, "production-file");
  assert.match(p.logLine, /production-env-file/);
});

test("isLiteSpeedLsnodeEntry detects LiteSpeed wrapper path", () => {
  assert.equal(isLiteSpeedLsnodeEntry("/usr/local/lsws/fcgi-bin/lsnode.js"), true);
  assert.equal(isLiteSpeedLsnodeEntry("/home/app/server.js"), false);
});

test("buildProductionFallbackCandidates: pronline hint adds .env.production.pronline before generic", () => {
  const prev = process.env.GETPRO_PRODUCTION_ENV_FILE_FALLBACK;
  delete process.env.GETPRO_PRODUCTION_ENV_FILE_FALLBACK;
  try {
    const c = buildProductionFallbackCandidates(
      "/home/u549637099/domains/pronline.org/nodejs",
      "/tmp",
      "/x"
    );
    assert.equal(c[0], "/home/u549637099/.env.production.pronline");
    assert.equal(c[c.length - 1], "/home/u549637099/.env.production");
  } finally {
    if (prev !== undefined) process.env.GETPRO_PRODUCTION_ENV_FILE_FALLBACK = prev;
  }
});

test("buildProductionFallbackCandidates: explicit env is first when set", () => {
  const prev = process.env.GETPRO_PRODUCTION_ENV_FILE_FALLBACK;
  process.env.GETPRO_PRODUCTION_ENV_FILE_FALLBACK = "/custom/first.env";
  try {
    const c = buildProductionFallbackCandidates("/pronline/nodejs", "/tmp", "/x");
    assert.equal(c[0], "/custom/first.env");
    assert.ok(c.includes("/home/u549637099/.env.production.pronline"));
  } finally {
    if (prev !== undefined) process.env.GETPRO_PRODUCTION_ENV_FILE_FALLBACK = prev;
    else delete process.env.GETPRO_PRODUCTION_ENV_FILE_FALLBACK;
  }
});
