"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { summarizeDatabaseUrlEnv, getDatabaseUrl, getStartupProcessSnapshot } = require("../src/db/pg/pool");

test("summarizeDatabaseUrlEnv: neither set", () => {
  const prev = {
    d: process.env.DATABASE_URL,
    g: process.env.GETPRO_DATABASE_URL,
    tdb: process.env.GETPRO_TEST_DB,
    tu: process.env.TEST_DATABASE_URL,
  };
  delete process.env.DATABASE_URL;
  delete process.env.GETPRO_DATABASE_URL;
  delete process.env.GETPRO_TEST_DB;
  delete process.env.TEST_DATABASE_URL;
  try {
    assert.deepEqual(summarizeDatabaseUrlEnv(), {
      hasDatabaseUrl: false,
      hasGetproDatabaseUrl: false,
      effectiveSource: "(none)",
    });
  } finally {
    if (prev.d !== undefined) process.env.DATABASE_URL = prev.d;
    else delete process.env.DATABASE_URL;
    if (prev.g !== undefined) process.env.GETPRO_DATABASE_URL = prev.g;
    else delete process.env.GETPRO_DATABASE_URL;
    if (prev.tdb !== undefined) process.env.GETPRO_TEST_DB = prev.tdb;
    else delete process.env.GETPRO_TEST_DB;
    if (prev.tu !== undefined) process.env.TEST_DATABASE_URL = prev.tu;
    else delete process.env.TEST_DATABASE_URL;
  }
});

test("summarizeDatabaseUrlEnv: DATABASE_URL wins when both set", () => {
  const prev = {
    d: process.env.DATABASE_URL,
    g: process.env.GETPRO_DATABASE_URL,
    tdb: process.env.GETPRO_TEST_DB,
    tu: process.env.TEST_DATABASE_URL,
  };
  delete process.env.GETPRO_TEST_DB;
  delete process.env.TEST_DATABASE_URL;
  process.env.DATABASE_URL = "postgres://u:p@h/db";
  process.env.GETPRO_DATABASE_URL = "postgres://other/db";
  try {
    const s = summarizeDatabaseUrlEnv();
    assert.equal(s.hasDatabaseUrl, true);
    assert.equal(s.hasGetproDatabaseUrl, true);
    assert.equal(s.effectiveSource, "DATABASE_URL");
  } finally {
    if (prev.d !== undefined) process.env.DATABASE_URL = prev.d;
    else delete process.env.DATABASE_URL;
    if (prev.g !== undefined) process.env.GETPRO_DATABASE_URL = prev.g;
    else delete process.env.GETPRO_DATABASE_URL;
    if (prev.tdb !== undefined) process.env.GETPRO_TEST_DB = prev.tdb;
    else delete process.env.GETPRO_TEST_DB;
    if (prev.tu !== undefined) process.env.TEST_DATABASE_URL = prev.tu;
    else delete process.env.TEST_DATABASE_URL;
  }
});

test("summarizeDatabaseUrlEnv: only GETPRO_DATABASE_URL", () => {
  const prev = {
    d: process.env.DATABASE_URL,
    g: process.env.GETPRO_DATABASE_URL,
    tdb: process.env.GETPRO_TEST_DB,
    tu: process.env.TEST_DATABASE_URL,
  };
  delete process.env.DATABASE_URL;
  delete process.env.GETPRO_TEST_DB;
  delete process.env.TEST_DATABASE_URL;
  process.env.GETPRO_DATABASE_URL = "postgres://x/y";
  try {
    const s = summarizeDatabaseUrlEnv();
    assert.equal(s.hasDatabaseUrl, false);
    assert.equal(s.hasGetproDatabaseUrl, true);
    assert.equal(s.effectiveSource, "GETPRO_DATABASE_URL");
  } finally {
    if (prev.d !== undefined) process.env.DATABASE_URL = prev.d;
    else delete process.env.DATABASE_URL;
    if (prev.g !== undefined) process.env.GETPRO_DATABASE_URL = prev.g;
    else delete process.env.GETPRO_DATABASE_URL;
    if (prev.tdb !== undefined) process.env.GETPRO_TEST_DB = prev.tdb;
    else delete process.env.GETPRO_TEST_DB;
    if (prev.tu !== undefined) process.env.TEST_DATABASE_URL = prev.tu;
    else delete process.env.TEST_DATABASE_URL;
  }
});

test("getDatabaseUrl: prefers DATABASE_URL over GETPRO_DATABASE_URL", () => {
  const prev = {
    d: process.env.DATABASE_URL,
    g: process.env.GETPRO_DATABASE_URL,
    tdb: process.env.GETPRO_TEST_DB,
    tu: process.env.TEST_DATABASE_URL,
  };
  delete process.env.GETPRO_TEST_DB;
  delete process.env.TEST_DATABASE_URL;
  process.env.DATABASE_URL = "postgres://a/a";
  process.env.GETPRO_DATABASE_URL = "postgres://b/b";
  try {
    assert.equal(getDatabaseUrl(), "postgres://a/a");
  } finally {
    if (prev.d !== undefined) process.env.DATABASE_URL = prev.d;
    else delete process.env.DATABASE_URL;
    if (prev.g !== undefined) process.env.GETPRO_DATABASE_URL = prev.g;
    else delete process.env.GETPRO_DATABASE_URL;
    if (prev.tdb !== undefined) process.env.GETPRO_TEST_DB = prev.tdb;
    else delete process.env.GETPRO_TEST_DB;
    if (prev.tu !== undefined) process.env.TEST_DATABASE_URL = prev.tu;
    else delete process.env.TEST_DATABASE_URL;
  }
});

test("getDatabaseUrl: falls back to GETPRO_DATABASE_URL", () => {
  const prev = {
    d: process.env.DATABASE_URL,
    g: process.env.GETPRO_DATABASE_URL,
    tdb: process.env.GETPRO_TEST_DB,
    tu: process.env.TEST_DATABASE_URL,
  };
  delete process.env.DATABASE_URL;
  delete process.env.GETPRO_TEST_DB;
  delete process.env.TEST_DATABASE_URL;
  process.env.GETPRO_DATABASE_URL = "postgres://only/this";
  try {
    assert.equal(getDatabaseUrl(), "postgres://only/this");
  } finally {
    if (prev.d !== undefined) process.env.DATABASE_URL = prev.d;
    else delete process.env.DATABASE_URL;
    if (prev.g !== undefined) process.env.GETPRO_DATABASE_URL = prev.g;
    else delete process.env.GETPRO_DATABASE_URL;
    if (prev.tdb !== undefined) process.env.GETPRO_TEST_DB = prev.tdb;
    else delete process.env.GETPRO_TEST_DB;
    if (prev.tu !== undefined) process.env.TEST_DATABASE_URL = prev.tu;
    else delete process.env.TEST_DATABASE_URL;
  }
});

test("getDatabaseUrl: empty when both unset", () => {
  const prev = {
    d: process.env.DATABASE_URL,
    g: process.env.GETPRO_DATABASE_URL,
    tdb: process.env.GETPRO_TEST_DB,
    tu: process.env.TEST_DATABASE_URL,
  };
  delete process.env.DATABASE_URL;
  delete process.env.GETPRO_DATABASE_URL;
  delete process.env.GETPRO_TEST_DB;
  delete process.env.TEST_DATABASE_URL;
  try {
    assert.equal(getDatabaseUrl(), "");
  } finally {
    if (prev.d !== undefined) process.env.DATABASE_URL = prev.d;
    else delete process.env.DATABASE_URL;
    if (prev.g !== undefined) process.env.GETPRO_DATABASE_URL = prev.g;
    else delete process.env.GETPRO_DATABASE_URL;
    if (prev.tdb !== undefined) process.env.GETPRO_TEST_DB = prev.tdb;
    else delete process.env.GETPRO_TEST_DB;
    if (prev.tu !== undefined) process.env.TEST_DATABASE_URL = prev.tu;
    else delete process.env.TEST_DATABASE_URL;
  }
});

test("getStartupProcessSnapshot: includes startupEntry when provided", () => {
  const snap = getStartupProcessSnapshot({ startupEntry: "/app/server.js" });
  assert.equal(snap.startupEntry, "/app/server.js");
  assert.ok(Number.isFinite(snap.pid));
});

test("summarizeDatabaseUrlEnv: whitespace-only counts as unset", () => {
  const prev = {
    d: process.env.DATABASE_URL,
    g: process.env.GETPRO_DATABASE_URL,
    tdb: process.env.GETPRO_TEST_DB,
    tu: process.env.TEST_DATABASE_URL,
  };
  delete process.env.GETPRO_TEST_DB;
  delete process.env.TEST_DATABASE_URL;
  process.env.DATABASE_URL = "   ";
  delete process.env.GETPRO_DATABASE_URL;
  try {
    const s = summarizeDatabaseUrlEnv();
    assert.equal(s.hasDatabaseUrl, false);
    assert.equal(s.effectiveSource, "(none)");
  } finally {
    if (prev.d !== undefined) process.env.DATABASE_URL = prev.d;
    else delete process.env.DATABASE_URL;
    if (prev.g !== undefined) process.env.GETPRO_DATABASE_URL = prev.g;
    else delete process.env.GETPRO_DATABASE_URL;
    if (prev.tdb !== undefined) process.env.GETPRO_TEST_DB = prev.tdb;
    else delete process.env.GETPRO_TEST_DB;
    if (prev.tu !== undefined) process.env.TEST_DATABASE_URL = prev.tu;
    else delete process.env.TEST_DATABASE_URL;
  }
});

test("getDatabaseUrl: GETPRO_TEST_DB=1 uses TEST_DATABASE_URL only", () => {
  const prev = {
    d: process.env.DATABASE_URL,
    g: process.env.GETPRO_DATABASE_URL,
    tdb: process.env.GETPRO_TEST_DB,
    tu: process.env.TEST_DATABASE_URL,
  };
  process.env.GETPRO_TEST_DB = "1";
  process.env.TEST_DATABASE_URL = "postgres://test-only/db";
  process.env.DATABASE_URL = "postgres://dev-should-not-win/db";
  delete process.env.GETPRO_DATABASE_URL;
  try {
    assert.equal(getDatabaseUrl(), "postgres://test-only/db");
  } finally {
    if (prev.d !== undefined) process.env.DATABASE_URL = prev.d;
    else delete process.env.DATABASE_URL;
    if (prev.g !== undefined) process.env.GETPRO_DATABASE_URL = prev.g;
    else delete process.env.GETPRO_DATABASE_URL;
    if (prev.tdb !== undefined) process.env.GETPRO_TEST_DB = prev.tdb;
    else delete process.env.GETPRO_TEST_DB;
    if (prev.tu !== undefined) process.env.TEST_DATABASE_URL = prev.tu;
    else delete process.env.TEST_DATABASE_URL;
  }
});

test("getDatabaseUrl: GETPRO_TEST_DB=1 without TEST_DATABASE_URL is empty", () => {
  const prev = {
    d: process.env.DATABASE_URL,
    g: process.env.GETPRO_DATABASE_URL,
    tdb: process.env.GETPRO_TEST_DB,
    tu: process.env.TEST_DATABASE_URL,
  };
  process.env.GETPRO_TEST_DB = "1";
  delete process.env.TEST_DATABASE_URL;
  process.env.DATABASE_URL = "postgres://ignored-when-test-mode-empty/db";
  try {
    assert.equal(getDatabaseUrl(), "");
  } finally {
    if (prev.d !== undefined) process.env.DATABASE_URL = prev.d;
    else delete process.env.DATABASE_URL;
    if (prev.g !== undefined) process.env.GETPRO_DATABASE_URL = prev.g;
    else delete process.env.GETPRO_DATABASE_URL;
    if (prev.tdb !== undefined) process.env.GETPRO_TEST_DB = prev.tdb;
    else delete process.env.GETPRO_TEST_DB;
    if (prev.tu !== undefined) process.env.TEST_DATABASE_URL = prev.tu;
    else delete process.env.TEST_DATABASE_URL;
  }
});
