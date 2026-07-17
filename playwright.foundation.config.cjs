const path = require("path");
const { defineConfig, devices } = require("@playwright/test");

const e2eDatabaseUrl = String(process.env.E2E_DATABASE_URL || "").trim();
if (!e2eDatabaseUrl) {
  throw new Error(
    "E2E_DATABASE_URL is required and must point to the dedicated BlessBoard E2E PostgreSQL database."
  );
}

const port = process.env.PLAYWRIGHT_E2E_PORT || "4185";
const baseURL = `http://127.0.0.1:${port}`;
const runId =
  process.env.BLESSBOARD_E2E_RUN_ID ||
  `${Date.now().toString(36)}-${process.pid.toString(36)}`;
process.env.BLESSBOARD_E2E_RUN_ID = runId;

const platformHost = process.env.E2E_PLATFORM_HOST || "admin.local.test";

module.exports = defineConfig({
  testDir: "./tests/e2e",
  testMatch: /foundation-security\.spec\.js/,
  globalSetup: require.resolve("./tests/e2e/global-setup.cjs"),
  globalTeardown: require.resolve("./tests/e2e/global-teardown.cjs"),
  outputDir: path.join(__dirname, "test-results", "foundation-e2e"),
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: true,
  reporter: [["list"], ["html", { outputFolder: "playwright-report/foundation-e2e", open: "never" }]],
  use: {
    baseURL,
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  expect: {
    timeout: 10_000,
  },
  webServer: {
    command: "node server.js",
    url: `${baseURL}/healthz`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      PORT: port,
      HOST: "127.0.0.1",
      NODE_ENV: "test",
      DEPLOYMENT_ENV: "testing",
      EXPECTED_DATABASE_ENV: "testing",
      DATABASE_URL: e2eDatabaseUrl,
      TEST_DATABASE_URL: e2eDatabaseUrl,
      GETPRO_TEST_DB: "1",
      GETPRO_PG_SSL: process.env.GETPRO_PG_SSL || "off",
      BASE_DOMAIN: "local.test",
      BLESSBOARD_CANONICAL_DOMAIN: "local.test",
      CHURCH_HOST_DOMAIN: "local.test",
      BLESSBOARD_APEX_DOMAINS: "local.test,www.local.test,admin.local.test",
      BLESSBOARD_PUBLIC_URL: "http://local.test",
      BLESSBOARD_ADMIN_URL: `http://${platformHost}`,
      TRUST_PROXY: "1",
      ADMIN_USERNAME: process.env.E2E_ADMIN_USERNAME || "foundation_e2e_admin",
      ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD || "FoundationE2E-admin-2026!",
      ADMIN_ROLE: "super_admin",
      SESSION_SECRET: process.env.E2E_SESSION_SECRET || `foundation-e2e-${runId}`,
      BLESSBOARD_E2E_RUN_ID: runId,
      E2E_PLATFORM_HOST: platformHost,
      // Prefer realistic CSRF enforcement; UI forms always include tokens.
      GETPRO_REQUIRE_PLATFORM_CSRF: "1",
      GETPRO_REQUIRE_CHURCH_CSRF: "1",
    },
  },
});
