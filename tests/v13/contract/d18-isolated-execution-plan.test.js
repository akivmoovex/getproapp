"use strict";

/**
 * D18 isolated execution plan. File and string checks only.
 * Does not connect to PostgreSQL, start a container, or create a database.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { discoverMigrations, discoverSeeds } = require("../../../db/scripts/lib/migrator");
const {
  ISOLATED_HOST,
  ISOLATED_POSTGRES_PORT,
  TARGET_DATABASE_NAME,
  TARGET_ROLE,
  G78_HTTP_DATABASE,
  isolatedBootstrapEnv,
  assertIsolatedBootstrapLaunch,
  assertIsolatedConnectionTarget,
  assertIsolatedDataDirectory,
  assertIsolatedHba,
  assertDedicatedRole,
  assertTeardownPlan,
  assertFutureStageAuthorized,
} = require("../helpers/v13IsolatedExecutionPlan");
const { isAllowedBrowserRequest } = require("../helpers/v13BrowserIsolation");
const { buildV213RegressionFixturePlan } = require("../fixtures/v13SyntheticFixtures");

const ROOT = path.join(__dirname, "../../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const ISOLATED_URL =
  `postgresql://${TARGET_ROLE}@${ISOLATED_HOST}:${ISOLATED_POSTGRES_PORT}/${TARGET_DATABASE_NAME}`;

function authorized(stageExtra = {}) {
  return {
    GETPRO_V13_ISOLATED_INSTANCE_AUTHORIZED: "1",
    GETPRO_V13_ALLOW_DB_WRITES: "1",
    GETPRO_V13_DB_STAGES_AUTHORIZED: "1",
    GETPRO_V13_HTTP_AUTHORIZED: "1",
    GETPRO_V13_BROWSER_AUTHORIZED: "1",
    GETPRO_V13_TEARDOWN_AUTHORIZED: "1",
    E2E_DATABASE_URL: ISOLATED_URL,
    TEST_DATABASE_URL: ISOLATED_URL,
    DATABASE_URL: ISOLATED_URL,
    ...stageExtra,
  };
}

describe("D18 isolated execution plan", () => {
  it("counts 223 migrations and seeds 001 through 011 without a connection", () => {
    const migrations = discoverMigrations();
    const seeds = discoverSeeds().map((file) => file.filename);
    assert.equal(migrations.length, 223);
    assert.deepEqual(seeds, [
      "001_deployments.sql",
      "002_products.sql",
      "003_blessboard_plans.sql",
      "004_activeclinic_product_and_deployment.sql",
      "005_blessboard_deployment_code_rename.sql",
      "006_v7_unified_deployments.sql",
      "007_production_catalogue_hygiene.sql",
      "008_moovex_platform_production_deployment.sql",
      "009_moovex_platform_v8_testing_deployment.sql",
      "010_platform_city_catalogue.sql",
      "011_production_catalogue_after_identity.sql",
    ]);
    assert.equal(migrations.some((file) => /CREATE\s+EXTENSION/i.test(file.sql)), false);
    assert.equal(
      migrations.some((file) => file.filename === "003_database_identity.sql"),
      true
    );
  });

  it("refuses the shared cluster and keeps teardown on the isolated database", () => {
    const shared = `postgresql://${TARGET_ROLE}@127.0.0.1:5432/${TARGET_DATABASE_NAME}`;
    assert.throws(() => assertIsolatedConnectionTarget(shared), /5432/);
    assert.throws(
      () => assertIsolatedConnectionTarget(`postgresql://postgres@127.0.0.1:55432/${TARGET_DATABASE_NAME}`),
      /role must be/
    );
    const accepted = assertIsolatedConnectionTarget(`${ISOLATED_URL}?sslmode=disable`);
    assert.equal(accepted.password, undefined);
    assert.equal(accepted.port, "55432");

    const dirs = assertIsolatedDataDirectory(ROOT, path.join(ROOT, ".v13-isolated-pg", "data"));
    assert.match(dirs.dataDir, /\.v13-isolated-pg\/data$/);
    assert.throws(
      () =>
        assertIsolatedDataDirectory(
          ROOT,
          "/Users/akivsolomon/Library/Application Support/Postgres/var-16"
        ),
      /project-local/
    );
    assert.throws(
      () => assertIsolatedHba("host all all 0.0.0.0/0 trust"),
      /trust|remote/
    );
    assert.equal(
      assertIsolatedHba(
        "host all v13_regression_213101 127.0.0.1/32 scram-sha-256\nhost all v13_regression_213101 ::1/128 scram-sha-256\n"
      ),
      true
    );
    assert.equal(
      assertDedicatedRole({
        name: TARGET_ROLE,
        login: true,
        superuser: false,
        createdb: false,
        createrole: false,
        replication: false,
        bypassrls: false,
        inherit: false,
      }),
      true
    );
    const teardown = assertTeardownPlan({
      connectionString: ISOLATED_URL,
      teardownAuthorized: "1",
    });
    assert.deepEqual(teardown.statements, [
      "DROP DATABASE IF EXISTS getpro_v13_e2e_regression213101;",
      "DROP ROLE IF EXISTS v13_regression_213101;",
    ]);
    assert.throws(
      () => assertTeardownPlan({ connectionString: shared, teardownAuthorized: "1" }),
      /5432/
    );
  });

  it("keeps bootstrap, browser, and fixture gates fail-closed", () => {
    const bootstrap = read("scripts/ci/v13-foundation-bootstrap.cjs");
    assert.match(bootstrap, /getpro_v13_e2e_regression213101/);
    assert.match(bootstrap, /assertIsolatedBootstrapLaunch/);
    assert.doesNotMatch(bootstrap, /CREATE\s+DATABASE|CREATE\s+ROLE|require\(["']pg["']\)/);
    assert.match(read(".gitignore"), /^\.v13-isolated-pg\/$/m);

    assert.equal(assertFutureStageAuthorized("bootstrap", authorized()).target.port, "55432");
    assert.throws(
      () => assertFutureStageAuthorized("browser", authorized({ GETPRO_V13_BROWSER_AUTHORIZED: "0" })),
      /BROWSER_AUTHORIZED/
    );
    assert.throws(
      () => assertFutureStageAuthorized("http", authorized({ GETPRO_V13_HTTP_AUTHORIZED: "" })),
      /HTTP_AUTHORIZED/
    );
    assert.throws(
      () =>
        assertFutureStageAuthorized(
          "create_instance",
          authorized({
            GETPRO_V13_ISOLATED_INSTANCE_AUTHORIZED: "1",
            DATABASE_URL: `postgresql://local@127.0.0.1:5432/${TARGET_DATABASE_NAME}`,
          })
        ),
      /5432/
    );

    assert.equal(isAllowedBrowserRequest("http://127.0.0.1:4187/healthz", "4187"), true);
    assert.equal(isAllowedBrowserRequest("http://admin.local.test:4186/hq", "4186"), true);
    assert.equal(isAllowedBrowserRequest("https://example.com/", "4187"), false);
    assert.match(read("playwright.v13-ac-platform.config.cjs"), /LOCAL_HOST_RESOLVER_ARG/);
    assert.match(read("playwright.v13-bb-qa.config.cjs"), /reuseExistingServer: false/);
    assert.match(read("tests/e2e/v13/v13-ac-platform-qa.spec.js"), /installLocalOnlyRoutes/);

    const plan = buildV213RegressionFixturePlan();
    assert.equal(plan.persisted, false);
    assert.equal(plan.activeclinic.servicePoint.servicePointKey, "v13d19-walk-in");
    assert.equal(plan.activeclinic.servicePoint.facilityKey, "v13d19-facility-a");
    assert.equal(plan.activeclinic.publicBookingEnabled, false);
    assert.equal(plan.activeclinic.coupon, null);
    const applySource = read("tests/v13/fixtures/v13SyntheticFixtures.js");
    assert.doesNotMatch(applySource, /provisionHostedAuthQaClinic/);
    assert.doesNotMatch(applySource, /public_booking_enabled\s*=\s*true/);
    assert.match(applySource, /submitAndProvisionClinicRegistration/);
    assert.match(
      read("src/activeclinic/qa/activeClinicHostedAuthQaFixture.js"),
      /public_booking_enabled = true/
    );
  });

  it("accepts only the G78 disposable database when HTTP execution is authorized", () => {
    const base = {
      ...isolatedBootstrapEnv(ROOT),
      GETPRO_V13_ISOLATED_INSTANCE_AUTHORIZED: "1",
      GETPRO_V13_ALLOW_DB_WRITES: "1",
      GETPRO_V13_DB_STAGES_AUTHORIZED: "1",
      GETPRO_V13_HTTP_AUTHORIZED: "1",
      GETPRO_V13_HTTP_DATABASE_NAME: G78_HTTP_DATABASE,
    };
    const url = `postgresql://${TARGET_ROLE}@127.0.0.1:55432/${G78_HTTP_DATABASE}`;
    const snapshot = JSON.stringify({
      rolname: TARGET_ROLE,
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
      rolbypassrls: false,
      rolinherit: false,
      rolcanlogin: true,
      databases: [G78_HTTP_DATABASE],
    });
    const accepted = assertIsolatedBootstrapLaunch({
      ...base,
      E2E_DATABASE_URL: url,
      TEST_DATABASE_URL: url,
      DATABASE_URL: url,
      GETPRO_V13_ROLE_CATALOG_SNAPSHOT: snapshot,
    });
    assert.equal(accepted.database, G78_HTTP_DATABASE);
    assert.equal(accepted.port, "55432");
    const oldUrl = `postgresql://${TARGET_ROLE}@127.0.0.1:55432/${TARGET_DATABASE_NAME}`;
    assert.throws(
      () =>
        assertIsolatedBootstrapLaunch({
          ...base,
          E2E_DATABASE_URL: oldUrl,
          TEST_DATABASE_URL: oldUrl,
          DATABASE_URL: oldUrl,
          GETPRO_V13_ROLE_CATALOG_SNAPSHOT: snapshot,
        }),
      /existing regression database/
    );
    const shared = `postgresql://${TARGET_ROLE}@127.0.0.1:5432/${G78_HTTP_DATABASE}`;
    assert.throws(
      () =>
        assertIsolatedBootstrapLaunch({
          ...base,
          E2E_DATABASE_URL: shared,
          TEST_DATABASE_URL: shared,
          DATABASE_URL: shared,
          GETPRO_V13_ROLE_CATALOG_SNAPSHOT: snapshot,
        }),
      /5432/
    );
    assert.throws(
      () => assertIsolatedConnectionTarget(url),
      /database must be/
    );
  });
});
