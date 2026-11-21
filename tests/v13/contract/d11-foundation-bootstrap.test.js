"use strict";

/**
 * D11 bootstrap-wrapper contracts. Rejection paths do not load the Foundation
 * bootstrap module and do not open PostgreSQL.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const {
  TARGET_DATABASE_NAME,
  runV13FoundationBootstrap,
} = require("../../../scripts/ci/v13-foundation-bootstrap.cjs");
const {
  isolatedBootstrapEnv,
  isolatedConnectionString,
} = require("../helpers/v13IsolatedExecutionPlan");

const ROOT = path.join(__dirname, "../../..");
const URL = isolatedConnectionString();
const SHARED_URL = `postgresql://local@127.0.0.1:5432/${TARGET_DATABASE_NAME}`;

function env(overrides = {}) {
  return {
    DEPLOYMENT_ENV: "testing",
    GETPRO_V13_CI_RUN_ID: "d11ready01",
    DATABASE_IDENTITY_ENV: "testing",
    EXPECTED_DATABASE_ENV: "testing",
    GETPRO_TEST_DB: "1",
    NODE_ENV: "test",
    GETPRO_V13_ALLOW_DB_WRITES: "1",
    GETPRO_V13_DB_STAGES_AUTHORIZED: "1",
    DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
    FOUNDATION_ALLOW_LOCALHOST: "1",
    GETPRO_PG_SSL: "off",
    ...isolatedBootstrapEnv(ROOT),
    E2E_DATABASE_URL: URL,
    TEST_DATABASE_URL: URL,
    DATABASE_URL: URL,
    GETPRO_V13_OWNED_DB_NAME: TARGET_DATABASE_NAME,
    ...overrides,
  };
}

describe("D11 guarded foundation bootstrap", () => {
  it("loads the connection module only after the disposable target is locked", () => {
    const source = fs.readFileSync(path.join(ROOT, "scripts/ci/v13-foundation-bootstrap.cjs"), "utf8");
    const guardAt = source.indexOf("assertV13RegressionBootstrapEnv");
    const loadAt = source.indexOf('require("../../db/scripts/lib/foundationBootstrap")');
    assert.ok(guardAt >= 0 && loadAt > guardAt);
    assert.doesNotMatch(source, /require\(["']pg["']\)/);
    const production = fs.readFileSync(path.join(ROOT, "db/scripts/bootstrap-foundation.js"), "utf8");
    assert.match(production, /require\("\.\/lib\/foundationBootstrap"\)/);
  });

  it("rejects unsafe targets before the bootstrap loader runs", async () => {
    const cases = [
      env({ GETPRO_V13_ALLOW_DB_WRITES: "0" }),
      env({ GETPRO_V13_DB_STAGES_AUTHORIZED: "" }),
      env({
        E2E_DATABASE_URL: "postgresql://local@127.0.0.1:5432/getpro_v13_e2e_othername01",
        TEST_DATABASE_URL: "postgresql://local@127.0.0.1:5432/getpro_v13_e2e_othername01",
        DATABASE_URL: "postgresql://local@127.0.0.1:5432/getpro_v13_e2e_othername01",
        GETPRO_V13_OWNED_DB_NAME: "getpro_v13_e2e_othername01",
      }),
      env({
        E2E_DATABASE_URL: "postgresql://local@db.example.com:5432/getpro_v13_e2e_regression213101",
        TEST_DATABASE_URL: "postgresql://local@db.example.com:5432/getpro_v13_e2e_regression213101",
        DATABASE_URL: "postgresql://local@db.example.com:5432/getpro_v13_e2e_regression213101",
      }),
      env({
        E2E_DATABASE_URL: "postgresql://local@db.blessboard.com:5432/getpro_v13_e2e_regression213101",
        TEST_DATABASE_URL: "postgresql://local@db.blessboard.com:5432/getpro_v13_e2e_regression213101",
        DATABASE_URL: "postgresql://local@db.blessboard.com:5432/getpro_v13_e2e_regression213101",
      }),
      env({
        E2E_DATABASE_URL: "postgresql://local@127.0.0.1:5432/shared_qa",
        TEST_DATABASE_URL: "postgresql://local@127.0.0.1:5432/shared_qa",
        DATABASE_URL: "postgresql://local@127.0.0.1:5432/shared_qa",
        GETPRO_V13_OWNED_DB_NAME: "",
      }),
      env({ TEST_DATABASE_URL: "postgresql://local@127.0.0.1:5432/getpro_v13_e2e_othername01" }),
      env({ DEPLOYMENT_ENV: "production" }),
      env({ DATABASE_IDENTITY_EXPECTED: "" }),
      env({ FOUNDATION_ALLOW_LOCALHOST: "" }),
      env({ E2E_DATABASE_URL: "", TEST_DATABASE_URL: "", DATABASE_URL: "" }),
      env({
        E2E_DATABASE_URL: SHARED_URL,
        TEST_DATABASE_URL: SHARED_URL,
        DATABASE_URL: SHARED_URL,
      }),
    ];
    for (const candidate of cases) {
      let loaded = false;
      await assert.rejects(() =>
        runV13FoundationBootstrap({
          env: candidate,
          loadBootstrap() {
            loaded = true;
            throw new Error("bootstrap module must not load");
          },
        })
      );
      assert.equal(loaded, false);
    }
  });

  it("rejects a database URL swapped after validation and before import", async () => {
    let loaded = false;
    await assert.rejects(
      () =>
        runV13FoundationBootstrap({
          env: env(),
          beforeLoad(current) {
            const swapped = "postgresql://local@127.0.0.1:5432/getpro_v13_e2e_othername01";
            current.E2E_DATABASE_URL = swapped;
            current.TEST_DATABASE_URL = swapped;
            current.DATABASE_URL = swapped;
            current.GETPRO_V13_OWNED_DB_NAME = "getpro_v13_e2e_othername01";
          },
          loadBootstrap() {
            loaded = true;
            throw new Error("bootstrap module must not load");
          },
        }),
      /changed after validation|unexpected database name/
    );
    assert.equal(loaded, false);
  });

  it("passes only the locked localhost URL into a mocked bootstrap", async () => {
    let received;
    const result = await runV13FoundationBootstrap({
      env: env(),
      loadBootstrap() {
        return {
          bootstrapFoundation(options) {
            received = options;
            return { ok: true, code: "mocked" };
          },
        };
      },
    });
    assert.equal(result.ok, true);
    assert.equal(received.connectionString, URL);
    assert.equal(received.identityKey, "moovex-platform-v7");
    assert.equal(received.environmentCode, "testing");
    assert.equal(received.connectionString.includes("postgres://"), false);
  });

  it("exits the CLI before bootstrap when authorization is missing", () => {
    const result = spawnSync(process.execPath, ["scripts/ci/v13-foundation-bootstrap.cjs"], {
      cwd: ROOT,
      env: { PATH: process.env.PATH || "" },
      encoding: "utf8",
      timeout: 15000,
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stderr || ""}`, /V13_CI_DB_GUARD/);
    assert.doesNotMatch(`${result.stdout || ""}`, /V13_FOUNDATION_BOOTSTRAP_OK/);
  });
});
