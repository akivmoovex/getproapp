"use strict";

/**
 * D08 isolation contracts. These tests do not open PostgreSQL, start a server,
 * or launch a browser.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const {
  ALLOWED_CI_DB_NAME_RE,
  assertOwnedDisposableDatabaseName,
  openAuthorizedPool,
} = require("../helpers/v13CiDatabaseGuard");
const {
  assertV13BrowserHarness,
  assertDisposableBrowserPort,
  assertLocalBaseUrl,
  isAllowedBrowserRequest,
  buildLocalServerEnv,
  createAuthorizedPgClient,
} = require("../helpers/v13BrowserIsolation");
const v13BbGlobalSetup = require("../../e2e/v13/v13-bb-global-setup.cjs");
const v13BbGlobalTeardown = require("../../e2e/v13/v13-bb-global-teardown.cjs");
const { runGated } = require("../integration/v13AuthorizedScenarios");
const { RESULTS } = require("../helpers/v13QaStatus");
const {
  isolatedBootstrapEnv,
  isolatedConnectionString,
} = require("../helpers/v13IsolatedExecutionPlan");

const ROOT = path.join(__dirname, "../../..");
const REQUESTED_DATABASE_NAME = "getpro_v13_e2e_regression_2131_01";
const ACCEPTED_EXAMPLE = "getpro_v13_e2e_regression213101";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function authorizedEnv(overrides = {}) {
  const url = isolatedConnectionString();
  return {
    GETPRO_V13_BROWSER_AUTHORIZED: "1",
    GETPRO_V13_ALLOW_DB_WRITES: "1",
    GETPRO_V13_DB_STAGES_AUTHORIZED: "1",
    GETPRO_V13_CI_RUN_ID: "d08ready01",
    DATABASE_IDENTITY_ENV: "testing",
    EXPECTED_DATABASE_ENV: "testing",
    GETPRO_TEST_DB: "1",
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "testing",
    ...isolatedBootstrapEnv(ROOT),
    E2E_DATABASE_URL: url,
    TEST_DATABASE_URL: url,
    DATABASE_URL: url,
    PLAYWRIGHT_E2E_PORT: "4186",
    BLESSBOARD_OTP_PROVIDER: "test",
    ...overrides,
  };
}

function spawnNode(args, env) {
  return spawnSync(process.execPath, args, {
    cwd: ROOT,
    env: { PATH: process.env.PATH || "", ...env },
    encoding: "utf8",
    timeout: 15000,
  });
}

describe("D08 database guard", () => {
  it("checks the complete requested database name and rejects it", () => {
    assert.equal(REQUESTED_DATABASE_NAME.startsWith("getpro_v13_e2e_"), true);
    assert.equal(ALLOWED_CI_DB_NAME_RE.test(REQUESTED_DATABASE_NAME), false);
    assert.equal(ALLOWED_CI_DB_NAME_RE.test("getpro_v13_e2e_"), false);
    assert.throws(
      () => assertOwnedDisposableDatabaseName(REQUESTED_DATABASE_NAME),
      /refusing unexpected database name/
    );
    assert.equal(assertOwnedDisposableDatabaseName(ACCEPTED_EXAMPLE), ACCEPTED_EXAMPLE);
  });

  it("does not call the pool factory for missing, remote, shared, or inherited credentials", () => {
    const cases = [
      {},
      authorizedEnv({ GETPRO_V13_ALLOW_DB_WRITES: "0" }),
      authorizedEnv({
        E2E_DATABASE_URL: "postgresql://local@db.blessboard.com:5432/getpro_v13_e2e_regression213101",
        TEST_DATABASE_URL: "postgresql://local@db.blessboard.com:5432/getpro_v13_e2e_regression213101",
      }),
      authorizedEnv({
        E2E_DATABASE_URL: "postgresql://local@127.0.0.1:5432/postgres",
        TEST_DATABASE_URL: "postgresql://local@127.0.0.1:5432/postgres",
      }),
      authorizedEnv({
        E2E_DATABASE_URL: `postgresql://local@127.0.0.1:5432/${REQUESTED_DATABASE_NAME}`,
        TEST_DATABASE_URL: `postgresql://local@127.0.0.1:5432/${REQUESTED_DATABASE_NAME}`,
      }),
      authorizedEnv({ E2E_DATABASE_URL: "", TEST_DATABASE_URL: "", DATABASE_URL: `postgresql://local@127.0.0.1:5432/${ACCEPTED_EXAMPLE}` }),
      authorizedEnv({ GETPRO_DATABASE_URL: "postgresql://local@127.0.0.1:5432/postgres" }),
      authorizedEnv({ E2E_DATABASE_URL: "not a url", TEST_DATABASE_URL: "not a url" }),
    ];
    for (const env of cases) {
      let called = false;
      assert.throws(() =>
        openAuthorizedPool(env, () => {
          called = true;
          throw new Error("pool factory must not run");
        })
      );
      assert.equal(called, false);
    }
  });

  it("returns an unopened pool object only after the disposable target is accepted", () => {
    let options;
    const opened = openAuthorizedPool(authorizedEnv(), (received) => {
      options = received;
      return { opened: false };
    });
    assert.equal(options.ssl, false);
    assert.match(options.connectionString, /127\.0\.0\.1/);
    assert.match(options.connectionString, new RegExp(`${ACCEPTED_EXAMPLE}$`));
    assert.equal(opened.pool.opened, false);
  });
});

describe("D08 browser isolation", () => {
  it("accepts only a local disposable browser harness", () => {
    const harness = assertV13BrowserHarness(authorizedEnv(), { fallbackPort: "4186" });
    assert.equal(harness.baseURL, "http://127.0.0.1:4186");
    assert.equal(harness.database, ACCEPTED_EXAMPLE);
    assert.throws(() => assertV13BrowserHarness(authorizedEnv({ GETPRO_V13_BROWSER_AUTHORIZED: "0" })), /browser authorization/);
    assert.throws(() => assertDisposableBrowserPort("80"), /4100-4999/);
    assert.throws(() => assertDisposableBrowserPort("5432"), /4100-4999/);
    assert.equal(assertDisposableBrowserPort("4187"), "4187");
    assert.throws(() => assertLocalBaseUrl("https://blessboard.com"), /127\.0\.0\.1|http/);
    assert.equal(assertLocalBaseUrl("http://127.0.0.1:4187"), "http://127.0.0.1:4187");
  });

  it("rejects external browser destinations and live OTP providers", () => {
    assert.equal(isAllowedBrowserRequest("http://127.0.0.1:4186/login", "4186"), true);
    assert.equal(isAllowedBrowserRequest("http://admin.local.test:4186/hq", "4186"), true);
    assert.equal(isAllowedBrowserRequest("https://blessboard.com/", "4186"), false);
    assert.equal(isAllowedBrowserRequest("http://127.0.0.1:3000/", "4186"), false);
    assert.equal(isAllowedBrowserRequest("http://activeclinic.pronline.org/login", "4187"), false);
    assert.throws(
      () => assertV13BrowserHarness(authorizedEnv({ BLESSBOARD_OTP_PROVIDER: "twilio" })),
      /OTP/
    );
    assert.throws(
      () => assertV13BrowserHarness(authorizedEnv({ BLESSBOARD_PUBLIC_URL: "https://blessboard.com" })),
      /production browser target/
    );
  });

  it("does not construct a database client when browser authorization is missing", () => {
    let called = false;
    assert.throws(() =>
      createAuthorizedPgClient({}, () => {
        called = true;
        throw new Error("client factory must not run");
      })
    );
    assert.equal(called, false);
    const client = createAuthorizedPgClient(authorizedEnv({ PLAYWRIGHT_E2E_PORT: "4187" }), (options) => {
      called = true;
      return { connected: false, ssl: options.ssl };
    });
    assert.equal(called, true);
    assert.equal(client.connected, false);
    assert.equal(client.ssl, false);
  });

  it("keeps BlessBoard setup and teardown from loading connection code when unauthorized", async () => {
    let setupLoaded = false;
    let teardownLoaded = false;
    await assert.rejects(
      () => v13BbGlobalSetup({ env: {}, loadGlobalSetup() { setupLoaded = true; } }),
      /V13_BROWSER_GUARD/
    );
    await assert.rejects(
      () => v13BbGlobalTeardown({ env: authorizedEnv({
        E2E_DATABASE_URL: `postgresql://local@127.0.0.1:5432/${REQUESTED_DATABASE_NAME}`,
        TEST_DATABASE_URL: `postgresql://local@127.0.0.1:5432/${REQUESTED_DATABASE_NAME}`,
        DATABASE_URL: `postgresql://local@127.0.0.1:5432/${REQUESTED_DATABASE_NAME}`,
      }), loadGlobalTeardown() { teardownLoaded = true; } }),
      /refusing unexpected database name/
    );
    assert.equal(setupLoaded, false);
    assert.equal(teardownLoaded, false);
    let skippedSetup = false;
    let skippedTeardown = false;
    await v13BbGlobalSetup({
      env: authorizedEnv({ GETPRO_V13_SKIP_LEGACY_CHURCH_SCHEMA: "1" }),
      loadGlobalSetup() { skippedSetup = true; },
    });
    await v13BbGlobalTeardown({
      env: authorizedEnv({ GETPRO_V13_SKIP_LEGACY_CHURCH_SCHEMA: "1" }),
      loadGlobalTeardown() { skippedTeardown = true; },
    });
    assert.equal(skippedSetup, false);
    assert.equal(skippedTeardown, false);
    const setup = read("tests/e2e/v13/v13-bb-global-setup.cjs");
    const teardown = read("tests/e2e/v13/v13-bb-global-teardown.cjs");
    assert.ok(setup.indexOf("assertV13BrowserHarness") < setup.indexOf('require("../global-setup.cjs")'));
    assert.ok(teardown.indexOf("assertV13BrowserHarness") < teardown.indexOf('require("../global-teardown.cjs")'));
    assert.doesNotMatch(setup, /getPgPool|new Pool|new Client|\.connect\(/);
    assert.doesNotMatch(teardown, /getPgPool|new Pool|new Client|\.connect\(/);
  });

  it("builds a localhost server environment without inherited provider credentials", () => {
    const harness = assertV13BrowserHarness(authorizedEnv(), { fallbackPort: "4186" });
    const child = buildLocalServerEnv(
      {
        ...authorizedEnv(),
        GETPRO_DATABASE_URL: "postgresql://remote.example/production",
        RESEND_API_KEY: "not-used",
        TWILIO_AUTH_TOKEN: "not-used",
        BLESSBOARD_OTP_EXPOSE_TEST_CODE: "1",
      },
      harness
    );
    assert.equal(child.HOST, "127.0.0.1");
    assert.equal(child.PORT, "4186");
    assert.equal(child.GETPRO_DATABASE_URL, undefined);
    assert.equal(child.RESEND_API_KEY, undefined);
    assert.equal(child.TWILIO_AUTH_TOKEN, undefined);
    assert.equal(child.BLESSBOARD_OTP_EXPOSE_TEST_CODE, undefined);
    assert.equal(child.BLESSBOARD_OTP_PROVIDER, "test");
    assert.equal(child.BASE_DOMAIN, "local.test");
    assert.equal(child.DATABASE_URL, harness.connectionString);
  });

  it("fails closed before the Playwright config or local server can start", () => {
    const bb = spawnNode(["-e", "require('./playwright.v13-bb-qa.config.cjs')"], {});
    const ac = spawnNode(["-e", "require('./playwright.v13-ac-platform.config.cjs')"], {});
    const server = spawnNode(["scripts/ci/observe-v13-local-server.cjs"], {});
    for (const result of [bb, ac, server]) {
      assert.notEqual(result.status, 0);
      assert.match(`${result.stderr || ""}\n${result.stdout || ""}`, /V13_BROWSER_GUARD|V13_CI_DB_GUARD/);
      assert.doesNotMatch(`${result.stdout || ""}`, /T4_PROCESS_LAUNCH|listening on/);
    }
    const observer = read("scripts/ci/observe-v13-local-server.cjs");
    assert.ok(observer.indexOf("assertV13BrowserHarness") < observer.indexOf('require("./observe-blessboard-server.cjs")'));
    const bbConfig = read("playwright.v13-bb-qa.config.cjs");
    const acConfig = read("playwright.v13-ac-platform.config.cjs");
    assert.ok(bbConfig.indexOf("assertV13BrowserHarness") < bbConfig.indexOf("webServer"));
    assert.ok(acConfig.indexOf("assertV13BrowserHarness") < acConfig.indexOf("webServer"));
    assert.match(bbConfig, /v13-bb-global-setup\.cjs/);
    assert.match(acConfig, /E2E_DATABASE_URL is required/);
    assert.match(bbConfig, /reuseExistingServer:\s*false/);
    assert.match(acConfig, /http:\/\/127\.0\.0\.1/);
    assert.match(acConfig, /fallbackPort: "4187"/);
    assert.doesNotMatch(bbConfig, /globalSetup:\s*require\.resolve\("\.\/tests\/e2e\/global-setup\.cjs"\)/);
  });

  it("discovers every browser test holding before navigation", () => {
    for (const rel of [
      "tests/e2e/v13/v13-bb-qa-regression.spec.js",
      "tests/e2e/v13/v13-d161-member-otp.spec.js",
      "tests/e2e/v13/v13-ac-platform-qa.spec.js",
      "tests/e2e/v13/v13-ac-email-otp.spec.js",
    ]) {
      const source = read(rel);
      const body = source.slice(source.indexOf("test.describe"));
      const tests = body.split(/\n  test\(/).slice(1);
      assert.ok(tests.length > 0, rel);
      for (const testBody of tests) {
        const holdAt = testBody.indexOf("hold(");
        const gotoAt = testBody.indexOf("page.goto");
        assert.ok(holdAt >= 0 && (gotoAt === -1 || holdAt < gotoAt));
      }
      assert.match(source, /installLocalOnlyRoutes/);
      assert.match(source, /NOT_RUN/);
      assert.doesNotMatch(source, /page\.goto\(["']https?:\/\/(blessboard\.com|pronline\.org)/);
    }
  });
});

describe("D08 unauthorized HTTP gate", () => {
  it("returns NOT_RUN before a runner or pool factory can execute", async () => {
    const keys = [
      "GETPRO_V13_ALLOW_DB_WRITES",
      "GETPRO_V13_DB_STAGES_AUTHORIZED",
      "GETPRO_V13_BROWSER_AUTHORIZED",
      "DATABASE_URL",
      "TEST_DATABASE_URL",
      "E2E_DATABASE_URL",
      "GETPRO_DATABASE_URL",
    ];
    const saved = new Map(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
    try {
      let ran = false;
      const result = await runGated(
        { diagnostic() {}, skip() {} },
        "D08",
        async () => {
          ran = true;
        }
      );
      assert.equal(result, RESULTS.NOT_RUN);
      assert.equal(ran, false);
    } finally {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("rejects a production URL in the isolation script without opening PostgreSQL", () => {
    const script = read("scripts/ci/v13-assert-db-isolation.cjs");
    assert.doesNotMatch(script, /require\(["']pg["']\)|new Pool|new Client|\.connect\(/);
    const common = {
      GETPRO_V13_CI_RUN_ID: "d08ready01",
      DATABASE_IDENTITY_ENV: "testing",
      GETPRO_TEST_DB: "1",
      NODE_ENV: "test",
      DEPLOYMENT_ENV: "testing",
      GETPRO_V13_REQUIRE_DB_WRITE_AUTH: "1",
      GETPRO_V13_ALLOW_DB_WRITES: "1",
      GETPRO_V13_DB_STAGES_AUTHORIZED: "1",
    };
    const accepted = spawnNode(["scripts/ci/v13-assert-db-isolation.cjs"], {
      ...common,
      E2E_DATABASE_URL: `postgresql://local@127.0.0.1:5432/${ACCEPTED_EXAMPLE}`,
      TEST_DATABASE_URL: `postgresql://local@127.0.0.1:5432/${ACCEPTED_EXAMPLE}`,
    });
    assert.equal(accepted.status, 0);
    assert.match(accepted.stdout, /V13_CI_DB_ISOLATION_OK/);
    const rejected = spawnNode(["scripts/ci/v13-assert-db-isolation.cjs"], {
      ...common,
      E2E_DATABASE_URL: "postgresql://local@db.blessboard.com:5432/getpro_v13_e2e_regression213101",
      TEST_DATABASE_URL: "postgresql://local@db.blessboard.com:5432/getpro_v13_e2e_regression213101",
    });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /refusing/);
  });
});
