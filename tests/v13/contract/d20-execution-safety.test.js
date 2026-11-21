"use strict";

/**
 * D20 execution-safety contracts. These checks do not connect to PostgreSQL,
 * start a browser, or create a database.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { runV13FoundationBootstrap } = require("../../../scripts/ci/v13-foundation-bootstrap.cjs");
const {
  isolatedBootstrapEnv,
  isolatedConnectionString,
} = require("../helpers/v13IsolatedExecutionPlan");
const { assertV13BrowserHarness, isAllowedBrowserRequest } = require("../helpers/v13BrowserIsolation");
const {
  buildRegressionClinicOperationsPlan,
  assertRegressionClinicOperationsPlan,
  applyActiveClinicFixtures,
  buildV213RegressionFixturePlan,
} = require("../fixtures/v13SyntheticFixtures");

const ROOT = path.join(__dirname, "../../..");
const URL = isolatedConnectionString();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function env(overrides = {}) {
  return {
    DEPLOYMENT_ENV: "testing",
    GETPRO_V13_CI_RUN_ID: "d20safety1",
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

describe("D20 execution safety", () => {
  it("rejects the shared port, a remote host, missing authorization, and shared identity before pg loads", async () => {
    const sharedPort = `postgresql://v13_regression_213101@127.0.0.1:5432/getpro_v13_e2e_regression213101`;
    await rejectsBeforeLoad(
      env({
        E2E_DATABASE_URL: sharedPort,
        TEST_DATABASE_URL: sharedPort,
        DATABASE_URL: sharedPort,
        GETPRO_V13_ISOLATED_PG_PORT: "5432",
      }),
      /5432/
    );
    const remote = `postgresql://v13_regression_213101@db.example.com:55432/getpro_v13_e2e_regression213101`;
    await rejectsBeforeLoad(
      env({
        E2E_DATABASE_URL: remote,
        TEST_DATABASE_URL: remote,
        DATABASE_URL: remote,
      }),
      /non-local|127\.0\.0\.1/
    );
    await rejectsBeforeLoad(
      env({ GETPRO_V13_ALLOW_DB_WRITES: "", GETPRO_V13_DB_STAGES_AUTHORIZED: "" }),
      /authorization|ALLOW_DB_WRITES|DB_STAGES/
    );
    await rejectsBeforeLoad(
      env({ GETPRO_V13_ISOLATED_INSTANCE_AUTHORIZED: "" }),
      /ISOLATED_INSTANCE_AUTHORIZED/
    );
    await rejectsBeforeLoad(
      env({
        GETPRO_V13_PG_DATA_DIR: "/Users/akivsolomon/Library/Application Support/Postgres/var-16",
        GETPRO_V13_PG_CLUSTER_NAME: "Postgres.app",
      }),
      /Postgres\.app|data directory|shared/
    );
    const superuser = `postgresql://postgres@127.0.0.1:55432/getpro_v13_e2e_regression213101`;
    await rejectsBeforeLoad(
      env({
        E2E_DATABASE_URL: superuser,
        TEST_DATABASE_URL: superuser,
        DATABASE_URL: superuser,
        GETPRO_V13_REGRESSION_ROLE_PRIVILEGES: "LOGIN,SUPERUSER,CREATEDB",
      }),
      /role|privileges/
    );
    const bootstrap = read("scripts/ci/v13-foundation-bootstrap.cjs");
    assert.match(bootstrap, /assertIsolatedBootstrapLaunch/);
    assert.doesNotMatch(bootstrap, /require\(["']pg["']\)|CREATE\s+DATABASE|CREATE\s+ROLE/);
    const production = read("db/scripts/bootstrap-foundation.js");
    assert.match(production, /require\("\.\/lib\/foundationBootstrap"\)/);
    assert.doesNotMatch(production, /assertIsolatedBootstrapLaunch/);
  });

  it("fails unauthorized browser setup before any navigation", () => {
    assert.throws(() => assertV13BrowserHarness({}), /browser authorization is missing/);
    assert.equal(isAllowedBrowserRequest("https://example.com/", "4187"), false);
    assert.equal(isAllowedBrowserRequest("http://127.0.0.1:5432/", "4187"), false);
  });

  it("keeps ActiveClinic fixtures from enabling public booking and detects missing prerequisites", () => {
    const plan = assertRegressionClinicOperationsPlan(buildRegressionClinicOperationsPlan());
    assert.equal(plan.publicBookingEnabled, false);
    assert.equal(plan.coupon, null);
    assert.equal(plan.clinics[0].receptionist.roleKey, "activeclinic_receptionist");
    assert.equal(plan.clinics[0].receptionist.departmentKey, "reception");
    assert.equal(plan.clinics[0].clinician.roleKey, "activeclinic_clinician");
    assert.equal(plan.clinics[0].clinician.departmentKey, "opd");
    assert.equal(plan.clinics[0].servicePoint.servicePointKey, "v13d19-walk-in");
    assert.equal(plan.clinics[0].servicePoint.facilityKey, "v13d19-facility-a");
    assert.notEqual(plan.clinics[0].servicePoint.servicePointKey, plan.clinics[1].servicePoint.servicePointKey);
    assert.throws(
      () => assertRegressionClinicOperationsPlan({ ...plan, publicBookingEnabled: true }),
      /public booking/
    );
    const missingPoint = structuredClone(plan);
    missingPoint.clinics[0].servicePoint = null;
    assert.throws(() => assertRegressionClinicOperationsPlan(missingPoint), /service point/);
    const missingRole = structuredClone(plan);
    missingRole.clinics[0].clinician = null;
    assert.throws(() => assertRegressionClinicOperationsPlan(missingRole), /clinical staff role/);
    const missingDepartment = structuredClone(plan);
    missingDepartment.clinics[0].receptionist.departmentKey = "billing";
    assert.throws(
      () => assertRegressionClinicOperationsPlan(missingDepartment),
      /department membership/
    );
    const source = read("tests/v13/fixtures/v13SyntheticFixtures.js");
    assert.doesNotMatch(source, /provisionHostedAuthQaClinic|public_booking_enabled\s*=\s*true/);
    assert.match(source, /createFacilityServicePoint/);
    assert.match(source, /activeclinic_receptionist|RECEPTIONIST/);
    assert.match(source, /activeclinic_clinician|CLINICIAN/);
  });

  it("refuses fixture apply before a database call when writes are not authorized", async () => {
    let queries = 0;
    await assert.rejects(
      () =>
        applyActiveClinicFixtures(
          {
            query() {
              queries += 1;
              throw new Error("query called");
            },
          },
          "postgres://127.0.0.1/getpro_v13_int_abcdef",
          {}
        ),
      /V13_FIXTURE_HOLD/
    );
    assert.equal(queries, 0);
  });

  it("keeps the sixteen regression workflows on their supported contracts", () => {
    const plan = buildV213RegressionFixturePlan();
    assert.equal(plan.blessboard.member.otpProvider, "test");
    assert.equal(plan.blessboard.member.exposeCodeOnPage, false);
    assert.equal(plan.blessboard.invitation.delivery, "testing-only");
    assert.equal(plan.activeclinic.recovery.channel, "testing-outbox");
    assert.equal(plan.activeclinic.recovery.liveEmail, false);
    assert.equal(plan.activeclinic.publicBookingEnabled, false);
    assert.equal(plan.activeclinic.coupon, null);
    assert.equal(plan.activeclinic.servicePoint.acceptsWalkIn, true);
    assert.equal(plan.blessboard.theme.key, "bb.community");
    assert.equal(plan.activeclinic.theme.key, "ac.family-wellness-mint");
    assert.match(plan.blessboard.publicRoutes.announcements, /^\/announcements/);

    const memberForm = read("views/blessboard/v5/hq/member-add.ejs");
    assert.match(memberForm, /data-bb-hq-add-member-form="1"/);
    assert.match(memberForm, /name="<%= csrfField %>"/);
    const announcements = read("src/blessboard/repositories/announcementsRepository.js");
    assert.match(announcements, /audience_key = 'public'/);
    assert.match(announcements, /a\.status = 'published'/);
    const themes = read("src/platform/website/websiteThemeService.js");
    assert.match(themes, /function selectAppliedTheme/);
    const vitals = read("views/activeclinic/app/vital-signs-entry-content.ejs");
    assert.match(vitals, /function formatVitalNumber/);
    const walkIn = read("views/activeclinic/app/reception-walk-in-content.ejs");
    assert.match(walkIn, /data-ac-form="reception-walk-in"/);
    const booking = read("src/activeclinic/http/activeClinicPublicBookingRoutes.js");
    assert.match(booking, /publicBookingEnabled !== true/);
    assert.match(booking, /coupon or voucher fields are deferred/);
    const runners = read("tests/v13/integration/d05RegressionRunners.js");
    assert.match(runners, /attachRegressionClinicOperations/);
    assert.match(runners, /publicBookingEnabled: false/);
    assert.match(runners, /72 bpm/);
    assert.match(runners, /service_point_id/);
    assert.doesNotMatch(runners, /provisionHostedAuthQaClinic/);
  });
});
