"use strict";

/**
 * D12 privilege-isolation contracts. These mocks do not connect to PostgreSQL
 * and do not create roles or databases.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { runV13FoundationBootstrap } = require("../../../scripts/ci/v13-foundation-bootstrap.cjs");

const ROOT = path.join(__dirname, "../../..");
const TARGET = "getpro_v13_e2e_regression213101";
const URL = `postgresql://local@127.0.0.1:5432/${TARGET}`;

function env(overrides = {}) {
  return {
    DEPLOYMENT_ENV: "testing",
    GETPRO_V13_CI_RUN_ID: "d12audit01",
    DATABASE_IDENTITY_ENV: "testing",
    GETPRO_TEST_DB: "1",
    NODE_ENV: "test",
    GETPRO_V13_ALLOW_DB_WRITES: "1",
    GETPRO_V13_DB_STAGES_AUTHORIZED: "1",
    DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
    FOUNDATION_ALLOW_LOCALHOST: "1",
    GETPRO_PG_SSL: "off",
    E2E_DATABASE_URL: URL,
    TEST_DATABASE_URL: URL,
    DATABASE_URL: URL,
    GETPRO_V13_OWNED_DB_NAME: TARGET,
    ...overrides,
  };
}

describe("D12 PostgreSQL isolation audit", () => {
  it("does not create roles, grants, or databases from the bootstrap wrapper", () => {
    const source = fs.readFileSync(path.join(ROOT, "scripts/ci/v13-foundation-bootstrap.cjs"), "utf8");
    assert.doesNotMatch(source, /CREATE\s+ROLE|CREATE\s+DATABASE|GRANT\s+|ALTER\s+ROLE/i);
    assert.doesNotMatch(source, /require\(["']pg["']\)/);
  });

  it("rejects another database on the same host before PostgreSQL is imported", async () => {
    const other = "postgresql://local@127.0.0.1:5432/postgres";
    let loaded = false;
    await assert.rejects(() =>
      runV13FoundationBootstrap({
        env: env({
          E2E_DATABASE_URL: other,
          TEST_DATABASE_URL: other,
          DATABASE_URL: other,
          GETPRO_V13_OWNED_DB_NAME: "postgres",
        }),
        loadBootstrap() {
          loaded = true;
          throw new Error("postgres module must not load");
        },
      })
    );
    assert.equal(loaded, false);
  });
});
