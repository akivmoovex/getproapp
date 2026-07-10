"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { summarizeDatabaseUrlEnv, getDatabaseUrl, getStartupProcessSnapshot } = require("../src/db/pg/pool");

function withEnv(overrides, fn) {
  const keys = Object.keys(overrides);
  const prev = {};
  for (const key of keys) {
    prev[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  try {
    return fn();
  } finally {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

test("summarizeDatabaseUrlEnv: neither set", () => {
  withEnv(
    {
      NODE_ENV: "development",
      DATABASE_URL: undefined,
      GETPRO_DATABASE_URL: undefined,
      GETPRO_TEST_DB: undefined,
      TEST_DATABASE_URL: undefined,
    },
    () => {
      assert.deepEqual(summarizeDatabaseUrlEnv(), {
        hasDatabaseUrl: false,
        hasGetproDatabaseUrl: false,
        effectiveSource: "(none)",
      });
    }
  );
});

test("summarizeDatabaseUrlEnv: DATABASE_URL wins when both set", () => {
  withEnv(
    {
      NODE_ENV: "development",
      GETPRO_TEST_DB: undefined,
      TEST_DATABASE_URL: undefined,
      DATABASE_URL: "postgres://u:p@h/db",
      GETPRO_DATABASE_URL: "postgres://other/db",
    },
    () => {
      const s = summarizeDatabaseUrlEnv();
      assert.equal(s.hasDatabaseUrl, true);
      assert.equal(s.hasGetproDatabaseUrl, true);
      assert.equal(s.effectiveSource, "DATABASE_URL");
    }
  );
});

test("summarizeDatabaseUrlEnv: only GETPRO_DATABASE_URL", () => {
  withEnv(
    {
      NODE_ENV: "development",
      DATABASE_URL: undefined,
      GETPRO_TEST_DB: undefined,
      TEST_DATABASE_URL: undefined,
      GETPRO_DATABASE_URL: "postgres://x/y",
    },
    () => {
      const s = summarizeDatabaseUrlEnv();
      assert.equal(s.hasDatabaseUrl, false);
      assert.equal(s.hasGetproDatabaseUrl, true);
      assert.equal(s.effectiveSource, "GETPRO_DATABASE_URL");
    }
  );
});

test("getDatabaseUrl: prefers DATABASE_URL over GETPRO_DATABASE_URL", () => {
  withEnv(
    {
      NODE_ENV: "development",
      GETPRO_TEST_DB: undefined,
      TEST_DATABASE_URL: undefined,
      DATABASE_URL: "postgres://a/a",
      GETPRO_DATABASE_URL: "postgres://b/b",
    },
    () => {
      assert.equal(getDatabaseUrl(), "postgres://a/a");
    }
  );
});

test("getDatabaseUrl: falls back to GETPRO_DATABASE_URL", () => {
  withEnv(
    {
      NODE_ENV: "development",
      DATABASE_URL: undefined,
      GETPRO_TEST_DB: undefined,
      TEST_DATABASE_URL: undefined,
      GETPRO_DATABASE_URL: "postgres://only/this",
    },
    () => {
      assert.equal(getDatabaseUrl(), "postgres://only/this");
    }
  );
});

test("getDatabaseUrl: empty when both unset", () => {
  withEnv(
    {
      NODE_ENV: "development",
      DATABASE_URL: undefined,
      GETPRO_DATABASE_URL: undefined,
      GETPRO_TEST_DB: undefined,
      TEST_DATABASE_URL: undefined,
    },
    () => {
      assert.equal(getDatabaseUrl(), "");
    }
  );
});

test("getStartupProcessSnapshot: includes startupEntry when provided", () => {
  const snap = getStartupProcessSnapshot({ startupEntry: "/app/server.js" });
  assert.equal(snap.startupEntry, "/app/server.js");
  assert.ok(Number.isFinite(snap.pid));
});

test("summarizeDatabaseUrlEnv: whitespace-only counts as unset", () => {
  withEnv(
    {
      NODE_ENV: "development",
      GETPRO_TEST_DB: undefined,
      TEST_DATABASE_URL: undefined,
      DATABASE_URL: "   ",
      GETPRO_DATABASE_URL: undefined,
    },
    () => {
      const s = summarizeDatabaseUrlEnv();
      assert.equal(s.hasDatabaseUrl, false);
      assert.equal(s.effectiveSource, "(none)");
    }
  );
});

test("getDatabaseUrl: GETPRO_TEST_DB=1 uses TEST_DATABASE_URL only", () => {
  withEnv(
    {
      NODE_ENV: "development",
      GETPRO_TEST_DB: "1",
      TEST_DATABASE_URL: "postgres://test-only/db",
      DATABASE_URL: "postgres://dev-should-not-win/db",
      GETPRO_DATABASE_URL: undefined,
    },
    () => {
      assert.equal(getDatabaseUrl(), "postgres://test-only/db");
    }
  );
});

test("getDatabaseUrl: GETPRO_TEST_DB=1 without TEST_DATABASE_URL is empty", () => {
  withEnv(
    {
      NODE_ENV: "development",
      GETPRO_TEST_DB: "1",
      TEST_DATABASE_URL: undefined,
      DATABASE_URL: "postgres://ignored-when-test-mode-empty/db",
      GETPRO_DATABASE_URL: undefined,
    },
    () => {
      assert.equal(getDatabaseUrl(), "");
    }
  );
});

test("getDatabaseUrl: NODE_ENV=test prefers TEST_DATABASE_URL", () => {
  withEnv(
    {
      NODE_ENV: "test",
      GETPRO_TEST_DB: undefined,
      TEST_DATABASE_URL: "postgres://test-mode/db",
      DATABASE_URL: "postgres://ignored/db",
      GETPRO_DATABASE_URL: undefined,
    },
    () => {
      assert.equal(getDatabaseUrl(), "postgres://test-mode/db");
    }
  );
});
