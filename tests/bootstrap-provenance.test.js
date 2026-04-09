"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { computeDbUrlProvenance, isLiteSpeedLsnodeEntry } = require("../src/startup/bootstrap");

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

test("isLiteSpeedLsnodeEntry detects LiteSpeed wrapper path", () => {
  assert.equal(isLiteSpeedLsnodeEntry("/usr/local/lsws/fcgi-bin/lsnode.js"), true);
  assert.equal(isLiteSpeedLsnodeEntry("/home/app/server.js"), false);
});
