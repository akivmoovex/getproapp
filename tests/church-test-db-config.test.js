"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { getDatabaseUrl, summarizeDatabaseUrlEnv, isGetproTestDbIntent } = require("../src/db/pg/pool");
const {
  requireSafeTestDatabaseUrl,
  parseDatabaseName,
  databaseNameLooksLikeTest,
} = require("../src/db/pg/requireSafeTestDatabase");

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

test("test mode prefers TEST_DATABASE_URL and ignores DATABASE_URL", () => {
  withEnv(
    {
      NODE_ENV: "test",
      GETPRO_TEST_DB: undefined,
      TEST_DATABASE_URL: "postgres://test-user@127.0.0.1:5432/getpro_test",
      DATABASE_URL: "postgres://prod-should-not-win@example.com:5432/prod",
      GETPRO_DATABASE_URL: undefined,
    },
    () => {
      assert.equal(isGetproTestDbIntent(), true);
      assert.equal(getDatabaseUrl(), "postgres://test-user@127.0.0.1:5432/getpro_test");
      assert.equal(summarizeDatabaseUrlEnv().effectiveSource, "TEST_DATABASE_URL");
    }
  );
});

test("production mode preserves normal DATABASE_URL", () => {
  withEnv(
    {
      NODE_ENV: "production",
      GETPRO_TEST_DB: undefined,
      TEST_DATABASE_URL: "postgres://test-only/db",
      DATABASE_URL: "postgres://prod-user@example.com:5432/prod",
      GETPRO_DATABASE_URL: undefined,
    },
    () => {
      assert.equal(isGetproTestDbIntent(), false);
      assert.equal(getDatabaseUrl(), "postgres://prod-user@example.com:5432/prod");
      assert.equal(summarizeDatabaseUrlEnv().effectiveSource, "DATABASE_URL");
    }
  );
});

test("NODE_ENV=test without TEST_DATABASE_URL does not fall back to DATABASE_URL", () => {
  withEnv(
    {
      NODE_ENV: "test",
      GETPRO_TEST_DB: undefined,
      TEST_DATABASE_URL: undefined,
      DATABASE_URL: "postgres://prod-should-be-ignored@example.com:5432/prod",
      GETPRO_DATABASE_URL: "postgres://also-ignored/db",
    },
    () => {
      assert.equal(getDatabaseUrl(), "");
      assert.equal(summarizeDatabaseUrlEnv().effectiveSource, "(none)");
    }
  );
});

test("test database reset refuses unsafe configuration", () => {
  withEnv(
    {
      NODE_ENV: "production",
      GETPRO_TEST_DB: undefined,
      TEST_DATABASE_URL: "postgres://u@127.0.0.1:5432/getpro_test",
      ALLOW_TEST_DB_RESET: undefined,
    },
    () => {
      assert.throws(() => requireSafeTestDatabaseUrl({ label: "unit" }), /outside test mode/i);
    }
  );

  withEnv(
    {
      NODE_ENV: "test",
      GETPRO_TEST_DB: "1",
      TEST_DATABASE_URL: undefined,
      ALLOW_TEST_DB_RESET: undefined,
    },
    () => {
      assert.throws(() => requireSafeTestDatabaseUrl({ label: "unit" }), /TEST_DATABASE_URL is required/i);
    }
  );

  withEnv(
    {
      NODE_ENV: "test",
      GETPRO_TEST_DB: "1",
      TEST_DATABASE_URL: "postgres://u@127.0.0.1:5432/production",
      ALLOW_TEST_DB_RESET: undefined,
    },
    () => {
      assert.throws(() => requireSafeTestDatabaseUrl({ label: "unit" }), /unsafe test database name/i);
    }
  );
});

test("connection strings are not exposed in safety-guard errors", () => {
  withEnv(
    {
      NODE_ENV: "test",
      GETPRO_TEST_DB: "1",
      TEST_DATABASE_URL: "postgres://secret-user:super-secret@db.example.com:5432/production",
      ALLOW_TEST_DB_RESET: undefined,
    },
    () => {
      try {
        requireSafeTestDatabaseUrl({ label: "unit" });
        assert.fail("expected throw");
      } catch (e) {
        const msg = String(e && e.message);
        assert.doesNotMatch(msg, /super-secret/);
        assert.doesNotMatch(msg, /secret-user/);
        assert.doesNotMatch(msg, /db\.example\.com/);
        assert.doesNotMatch(msg, /postgres:\/\//);
      }
    }
  );
});

test("safe test database name and ALLOW_TEST_DB_RESET opt-in", () => {
  assert.equal(databaseNameLooksLikeTest("getpro_test"), true);
  assert.equal(databaseNameLooksLikeTest("production"), false);
  assert.equal(parseDatabaseName("postgres://u@h/getpro_test"), "getpro_test");

  withEnv(
    {
      NODE_ENV: "test",
      GETPRO_TEST_DB: "1",
      TEST_DATABASE_URL: "postgres://u@127.0.0.1:5432/custom_ci_db",
      ALLOW_TEST_DB_RESET: "true",
    },
    () => {
      const ok = requireSafeTestDatabaseUrl({ label: "unit" });
      assert.equal(ok.databaseName, "custom_ci_db");
      assert.equal(ok.connectionString.includes("custom_ci_db"), true);
    }
  );
});

test("configured but unreachable test database is not treated as a skip/pass in helper", () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "helpers/churchPgTest.js"),
    "utf8"
  );
  assert.match(src, /infrastructure failure/);
  assert.match(src, /t\.skip\(/);
  assert.match(src, /throw new Error/);
});