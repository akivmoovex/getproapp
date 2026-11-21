"use strict";

/**
 * D09 identity contracts. The accepted name is checked in full. Rejection
 * tests use mocks and do not open PostgreSQL, start a server, or navigate.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  ALLOWED_CI_DB_NAME_RE,
  assertOwnedDisposableDatabaseName,
  assertV13CiDatabaseUrl,
  assertHarnessDatabaseTarget,
  openAuthorizedPool,
} = require("../helpers/v13CiDatabaseGuard");
const { assertV13BrowserHarness } = require("../helpers/v13BrowserIsolation");
const v13BbGlobalSetup = require("../../e2e/v13/v13-bb-global-setup.cjs");

const ROOT = path.join(__dirname, "../../..");
const DB_NAME = "getpro_v13_e2e_regression213101";
const PREFIX = "getpro_v13_e2e_";
const LOCAL_URL = `postgresql://local@127.0.0.1:5432/${DB_NAME}`;

function identityEnv(overrides = {}) {
  return {
    DEPLOYMENT_ENV: "testing",
    GETPRO_V13_CI_RUN_ID: "d09ready01",
    DATABASE_IDENTITY_ENV: "testing",
    GETPRO_TEST_DB: "1",
    NODE_ENV: "test",
    GETPRO_V13_ALLOW_DB_WRITES: "1",
    GETPRO_V13_DB_STAGES_AUTHORIZED: "1",
    GETPRO_V13_BROWSER_AUTHORIZED: "1",
    E2E_DATABASE_URL: LOCAL_URL,
    TEST_DATABASE_URL: LOCAL_URL,
    GETPRO_V13_OWNED_DB_NAME: DB_NAME,
    PLAYWRIGHT_E2E_PORT: "4186",
    BLESSBOARD_OTP_PROVIDER: "test",
    ...overrides,
  };
}

function assertFactoryNotCalled(env) {
  let called = false;
  assert.throws(() =>
    openAuthorizedPool(env, () => {
      called = true;
      throw new Error("pool factory must not run");
    })
  );
  assert.equal(called, false);
}

describe("D09 disposable database identity", () => {
  it("accepts the complete localhost E2E name and rejects prefix-only matching", () => {
    const suffix = DB_NAME.slice(PREFIX.length);
    assert.equal(DB_NAME.startsWith(PREFIX), true);
    assert.equal(suffix, "regression213101");
    assert.match(suffix, /^[a-z0-9]+$/);
    assert.equal(suffix.includes("_"), false);
    assert.ok(suffix.length >= 6 && suffix.length <= 32);
    assert.equal(ALLOWED_CI_DB_NAME_RE.source.startsWith("^"), true);
    assert.equal(ALLOWED_CI_DB_NAME_RE.source.endsWith("$"), true);
    assert.equal(ALLOWED_CI_DB_NAME_RE.test(PREFIX), false);
    assert.equal(assertOwnedDisposableDatabaseName(DB_NAME), DB_NAME);

    const parsed = assertV13CiDatabaseUrl(LOCAL_URL, { expectedDatabaseName: DB_NAME });
    assert.equal(parsed.hostname, "127.0.0.1");
    assert.equal(parsed.database, DB_NAME);
    const target = assertHarnessDatabaseTarget(identityEnv());
    assert.equal(target.database, DB_NAME);
    assert.equal(target.hostname, "127.0.0.1");
  });

  it("rejects unsafe names, hosts, missing URLs, and missing write flags before a pool exists", () => {
    const badNames = [
      "production",
      "prod",
      "postgres",
      "shared_qa",
      "blessboard_foundation_test",
      "getpro_ci",
      "getpro_v2131_e2e_regression213101",
      "getpro_v13_qa_regression213101",
      "getpro_v13_e2e_regression_213101",
      "getpro_v13_e2e_abcde",
      `getpro_v13_e2e_${"a".repeat(33)}`,
    ];
    for (const name of badNames) {
      assert.throws(() => assertOwnedDisposableDatabaseName(name), /refusing/);
    }

    assertFactoryNotCalled(
      identityEnv({
        E2E_DATABASE_URL: "postgresql://local@db.blessboard.com:5432/getpro_v13_e2e_regression213101",
        TEST_DATABASE_URL: "postgresql://local@db.blessboard.com:5432/getpro_v13_e2e_regression213101",
      })
    );
    assertFactoryNotCalled(
      identityEnv({
        E2E_DATABASE_URL: "postgresql://local@127.0.0.1:5432/shared_qa",
        TEST_DATABASE_URL: "postgresql://local@127.0.0.1:5432/shared_qa",
        GETPRO_V13_OWNED_DB_NAME: "",
      })
    );
    assertFactoryNotCalled(
      identityEnv({
        E2E_DATABASE_URL: "postgresql://local@db.example.com:5432/getpro_v13_e2e_regression213101",
        TEST_DATABASE_URL: "postgresql://local@db.example.com:5432/getpro_v13_e2e_regression213101",
      })
    );
    assertFactoryNotCalled(identityEnv({ E2E_DATABASE_URL: "", TEST_DATABASE_URL: "" }));
    assertFactoryNotCalled(identityEnv({ GETPRO_V13_ALLOW_DB_WRITES: "0" }));
    assertFactoryNotCalled(identityEnv({ GETPRO_V13_DB_STAGES_AUTHORIZED: "" }));
  });

  it("rejects unauthorized browser execution before setup can load a connection module", async () => {
    let loaded = false;
    await assert.rejects(
      () =>
        v13BbGlobalSetup({
          env: identityEnv({ GETPRO_V13_BROWSER_AUTHORIZED: "0" }),
          loadGlobalSetup() {
            loaded = true;
          },
        }),
      /browser authorization/
    );
    assert.equal(loaded, false);
    assert.throws(
      () => assertV13BrowserHarness(identityEnv({ GETPRO_V13_BROWSER_AUTHORIZED: "" }), { fallbackPort: "4186" }),
      /browser authorization/
    );

    const setup = fs.readFileSync(path.join(ROOT, "tests/e2e/v13/v13-bb-global-setup.cjs"), "utf8");
    const ac = fs.readFileSync(path.join(ROOT, "playwright.v13-ac-platform.config.cjs"), "utf8");
    const bb = fs.readFileSync(path.join(ROOT, "tests/e2e/v13/v13-bb-qa-regression.spec.js"), "utf8");
    const clinic = fs.readFileSync(path.join(ROOT, "tests/e2e/v13/v13-ac-platform-qa.spec.js"), "utf8");
    assert.ok(setup.indexOf("assertV13BrowserHarness") < setup.indexOf('require("../global-setup.cjs")'));
    assert.match(ac, /http:\/\/127\.0\.0\.1/);
    assert.match(ac, /observe-v13-local-server\.cjs/);
    assert.match(bb, /installLocalOnlyRoutes/);
    assert.match(clinic, /installLocalOnlyRoutes/);
    assert.match(bb, /NOT_RUN/);
    assert.match(clinic, /NOT_RUN/);
  });
});
