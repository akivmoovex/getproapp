"use strict";

/**
 * D21 provisioning-readiness contracts. No PostgreSQL process is started and
 * no connection is opened.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { runV13FoundationBootstrap } = require("../../../scripts/ci/v13-foundation-bootstrap.cjs");
const {
  isolatedBootstrapEnv,
  isolatedConnectionString,
  expectedRoleCatalogSnapshot,
  assertIsolatedDataDirectory,
  assertProjectLocalIsolationPath,
  assertRoleCatalogSnapshot,
} = require("../helpers/v13IsolatedExecutionPlan");
const { assertV13BrowserHarness } = require("../helpers/v13BrowserIsolation");

const ROOT = path.join(__dirname, "../../..");
const URL = isolatedConnectionString();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function env(overrides = {}) {
  return {
    DEPLOYMENT_ENV: "testing",
    GETPRO_V13_CI_RUN_ID: "d21ready01",
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
    GETPRO_V13_OWNED_DB_NAME: "getpro_v13_e2e_regression213101",
    PLAYWRIGHT_E2E_PORT: "4186",
    BLESSBOARD_OTP_PROVIDER: "test",
    GETPRO_V13_BROWSER_AUTHORIZED: "1",
    ...overrides,
  };
}

async function rejectsBeforeLoad(candidate, pattern) {
  let loaded = false;
  await assert.rejects(
    () =>
      runV13FoundationBootstrap({
        env: candidate,
        loadBootstrap() {
          loaded = true;
          throw new Error("bootstrap module must not load");
        },
      }),
    pattern
  );
  assert.equal(loaded, false);
}

describe("D21 isolated PostgreSQL provisioning readiness", () => {
  it("rejects shared port, shared data directory, remote hosts, missing flags, and the wrong identity", async () => {
    const sharedPort = "postgresql://v13_regression_213101@127.0.0.1:5432/getpro_v13_e2e_regression213101";
    await rejectsBeforeLoad(
      env({
        E2E_DATABASE_URL: sharedPort,
        TEST_DATABASE_URL: sharedPort,
        DATABASE_URL: sharedPort,
        GETPRO_V13_ISOLATED_PG_PORT: "5432",
      }),
      /5432/
    );
    await rejectsBeforeLoad(
      env({
        GETPRO_V13_PG_DATA_DIR: "/Users/akivsolomon/Library/Application Support/Postgres/var-16",
      }),
      /project-local|Postgres|shared/
    );
    const remote = "postgresql://v13_regression_213101@db.example.com:55432/getpro_v13_e2e_regression213101";
    await rejectsBeforeLoad(
      env({
        E2E_DATABASE_URL: remote,
        TEST_DATABASE_URL: remote,
        DATABASE_URL: remote,
      }),
      /non-local|127\.0\.0\.1/
    );
    await rejectsBeforeLoad(env({ GETPRO_V13_ALLOW_DB_WRITES: "" }), /authorization|ALLOW_DB_WRITES/);
    await rejectsBeforeLoad(env({ GETPRO_V13_DB_STAGES_AUTHORIZED: "" }), /authorization|DB_STAGES/);
    await rejectsBeforeLoad(
      env({ GETPRO_V13_ISOLATED_INSTANCE_ID: "postgres.app" }),
      /instance id/
    );
    const wrongDb = "postgresql://v13_regression_213101@127.0.0.1:55432/getpro_v13_e2e_othername01";
    await rejectsBeforeLoad(
      env({
        E2E_DATABASE_URL: wrongDb,
        TEST_DATABASE_URL: wrongDb,
        DATABASE_URL: wrongDb,
        GETPRO_V13_OWNED_DB_NAME: "getpro_v13_e2e_othername01",
      }),
      /unexpected database name|database must be/
    );
  });

  it("rejects prohibited role attributes and a missing catalog snapshot before pg loads", async () => {
    const snapshot = expectedRoleCatalogSnapshot();
    await rejectsBeforeLoad(
      env({
        GETPRO_V13_ROLE_CATALOG_SNAPSHOT: JSON.stringify({ ...snapshot, rolsuper: true }),
      }),
      /rolsuper/
    );
    await rejectsBeforeLoad(
      env({
        GETPRO_V13_ROLE_CATALOG_SNAPSHOT: JSON.stringify({
          ...snapshot,
          databases: ["postgres", snapshot.databases[0]],
        }),
      }),
      /disposable database/
    );
    await rejectsBeforeLoad(env({ GETPRO_V13_ROLE_CATALOG_SNAPSHOT: "" }), /catalog snapshot/);
    assert.throws(
      () => assertRoleCatalogSnapshot({ ...snapshot, rolcreatedb: true }),
      /rolcreatedb/
    );
  });

  it("rejects a symlink and a path outside the isolation root without creating directories", () => {
    const layout = assertIsolatedDataDirectory(ROOT, path.join(ROOT, ".v13-isolated-pg", "data"));
    const isolationRoot = path.join(ROOT, ".v13-isolated-pg");
    if (fs.existsSync(isolationRoot)) {
      assert.equal(layout.dataExists, true);
      assert.equal(layout.socketExists, true);
      for (const target of [isolationRoot, layout.dataDir, layout.socketDir]) {
        const info = fs.lstatSync(target);
        assert.equal(info.isSymbolicLink(), false);
        assert.equal(fs.realpathSync(target).startsWith(`${fs.realpathSync(ROOT)}${path.sep}`), true);
      }
    } else {
      assert.equal(layout.dataExists, false);
      assert.equal(layout.socketExists, false);
    }

    // Keep the disposable worktree inside the project isolation root. Shared
    // /tmp paths are refused before symlink inspection, so /tmp fixtures cannot
    // exercise the symlink denial this case is meant to prove.
    const scratchRoot = path.join(ROOT, ".v13-isolated-pg", "d21-scratch");
    fs.mkdirSync(scratchRoot, { recursive: true });
    const worktree = fs.mkdtempSync(path.join(scratchRoot, "root-"));
    const outside = fs.mkdtempSync(path.join(scratchRoot, "out-"));
    try {
      fs.symlinkSync(outside, path.join(worktree, ".v13-isolated-pg"));
      assert.throws(
        () => assertIsolatedDataDirectory(worktree, path.join(worktree, ".v13-isolated-pg", "data")),
        /symlink/
      );
      assert.throws(
        () => assertProjectLocalIsolationPath(worktree, "/tmp/not-the-isolation-root"),
        /outside|shared temporary|symlink/
      );
    } finally {
      fs.rmSync(worktree, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("keeps browser setup behind isolation verification and localhost-only configs", () => {
    const harness = assertV13BrowserHarness(env({ PLAYWRIGHT_E2E_PORT: "" }), { fallbackPort: "4187" });
    assert.equal(harness.baseURL, "http://127.0.0.1:4187");
    assert.equal(harness.database, "getpro_v13_e2e_regression213101");
    assert.throws(
      () => assertV13BrowserHarness(env({ GETPRO_V13_BROWSER_AUTHORIZED: "" }), { fallbackPort: "4187" }),
      /browser authorization is missing/
    );
    const shared = "postgresql://v13_regression_213101@127.0.0.1:5432/getpro_v13_e2e_regression213101";
    assert.throws(
      () =>
        assertV13BrowserHarness(
          env({
            E2E_DATABASE_URL: shared,
            TEST_DATABASE_URL: shared,
            DATABASE_URL: shared,
            GETPRO_V13_ISOLATED_PG_PORT: "5432",
          }),
          { fallbackPort: "4186" }
        ),
      /5432/
    );
    for (const rel of ["playwright.v13-ac-platform.config.cjs", "playwright.v13-bb-qa.config.cjs"]) {
      const source = read(rel);
      assert.ok(source.indexOf("assertV13BrowserHarness") < source.indexOf("webServer"));
      assert.match(source, /reuseExistingServer:\s*false/);
      assert.match(source, /LOCAL_HOST_RESOLVER_ARG/);
      assert.match(source, /baseURL/);
    }
    assert.match(read("tests/v13/helpers/v13BrowserIsolation.js"), /assertIsolatedBootstrapLaunch/);
  });

  it("keeps fixture provisioning on supported contracts and the isolated database", () => {
    const fixtures = read("tests/v13/fixtures/v13SyntheticFixtures.js");
    assert.match(fixtures, /assertIsolatedBootstrapLaunch/);
    assert.match(fixtures, /publicBookingEnabled !== false/);
    assert.match(fixtures, /RECEPTIONIST/);
    assert.match(fixtures, /CLINICIAN/);
    assert.match(fixtures, /NURSE/);
    assert.match(fixtures, /createFacilityServicePoint/);
    assert.doesNotMatch(fixtures, /provisionHostedAuthQaClinic|public_booking_enabled\s*=\s*true/);
    const production = read("db/scripts/bootstrap-foundation.js");
    assert.match(production, /require\("\.\/lib\/foundationBootstrap"\)/);
    assert.doesNotMatch(production, /assertIsolatedBootstrapLaunch|55432/);
    const bootstrap = read("db/scripts/lib/foundationBootstrap.js");
    assert.match(bootstrap, /phase: "migrations"/);
    assert.match(bootstrap, /ensureDatabaseIdentity/);
    assert.match(bootstrap, /phase: "seeds"/);
  });
});
