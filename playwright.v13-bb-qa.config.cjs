const path = require("path");
const { defineConfig, devices } = require("@playwright/test");
const {
  assertV13BrowserHarness,
  buildLocalServerEnv,
  LOCAL_HOST_RESOLVER_ARG,
} = require("./tests/v13/helpers/v13BrowserIsolation");

/**
 * V13 BlessBoard QA browser regression config.
 * E2E_DATABASE_URL is required and must be an approved local disposable database.
 * The guard below runs at load, before global setup, webServer, or navigation.
 */

const harness = assertV13BrowserHarness(process.env, { fallbackPort: "4186" });
const port = harness.port;
const baseURL = harness.baseURL;
const runId = process.env.BLESSBOARD_E2E_RUN_ID || process.env.GETPRO_V13_CI_RUN_ID;
process.env.BLESSBOARD_E2E_RUN_ID = runId;
const platformHost = "admin.local.test";
const d161Selected = process.env.GETPRO_BB_LOGIN_OTP_OBSERVER === "1";
const serverEnv = buildLocalServerEnv(process.env, harness);
delete serverEnv.GETPRO_OTP_ALLOW_FIXED_CODE;
delete serverEnv.GETPRO_OTP_QA_LIVE_DELIVERY;
delete serverEnv.RESEND_API_KEY;
delete serverEnv.GETPRO_OTP_ACTIVATION;
if (d161Selected) {
  serverEnv.GETPRO_OTP_PROVIDER = "qa-observer";
  serverEnv.GETPRO_BB_LOGIN_OTP_OBSERVER = "1";
} else {
  delete serverEnv.GETPRO_OTP_PROVIDER;
  delete serverEnv.GETPRO_BB_LOGIN_OTP_OBSERVER;
}

module.exports = defineConfig({
  testDir: "./tests/e2e/v13",
  testMatch: d161Selected
    ? /v13-d161-member-otp\.spec\.js/
    : /v13-bb-qa-regression\.spec\.js/,
  globalSetup: require.resolve("./tests/e2e/v13/v13-bb-global-setup.cjs"),
  globalTeardown: require.resolve("./tests/e2e/v13/v13-bb-global-teardown.cjs"),
  outputDir: path.join(__dirname, "test-results", "v13-bb-qa"),
  timeout: d161Selected ? 180_000 : 90_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: true,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/v13-bb-qa", open: "never" }],
    ["json", { outputFile: "test-results/v13-bb-qa/results.json" }],
  ],
  use: {
    baseURL,
    storageState: { cookies: [], origins: [] },
    ...devices["Desktop Chrome"],
    launchOptions: {
      args: [LOCAL_HOST_RESOLVER_ARG],
    },
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  expect: { timeout: 10_000 },
  webServer: {
    command: "node scripts/ci/observe-v13-local-server.cjs",
    url: `${baseURL}/healthz`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...serverEnv,
      ADMIN_USERNAME: process.env.E2E_ADMIN_USERNAME || "v13_bb_qa_admin",
      ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD || "V13BbQa-admin-2026!",
      ADMIN_ROLE: "super_admin",
      SESSION_SECRET: process.env.E2E_SESSION_SECRET || `v13-bb-qa-${runId}`,
      BLESSBOARD_E2E_RUN_ID: runId,
      E2E_PLATFORM_HOST: platformHost,
      BLESSBOARD_ADMIN_URL: `http://${platformHost}`,
      GETPRO_REQUIRE_PLATFORM_CSRF: "1",
      GETPRO_REQUIRE_CHURCH_CSRF: "1",
    },
  },
});
