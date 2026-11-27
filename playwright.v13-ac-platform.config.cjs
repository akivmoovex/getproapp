const path = require("path");
const { defineConfig, devices } = require("@playwright/test");
const {
  assertV13BrowserHarness,
  buildLocalServerEnv,
  LOCAL_HOST_RESOLVER_ARG,
} = require("./tests/v13/helpers/v13BrowserIsolation");

/**
 * ActiveClinic browser config.
 * E2E_DATABASE_URL is required for V13 ActiveClinic browser tests and must be a disposable CI database.
 * The base URL is http://127.0.0.1 on port 4187, or another port in 4100-4999.
 * No web server is registered unless the local disposable-database guard accepts the environment.
 * This file does not start the server while it is being loaded without authorization.
 */

const harness = assertV13BrowserHarness(process.env, { fallbackPort: "4187" });
const port = harness.port;
const baseURL = harness.baseURL;
const runId = process.env.BLESSBOARD_E2E_RUN_ID || process.env.GETPRO_V13_CI_RUN_ID;
const acOtpSelected = process.env.GETPRO_AC_RECOVERY_OTP_OBSERVER === "1";
const serverEnv = buildLocalServerEnv(process.env, harness);
delete serverEnv.GETPRO_OTP_ALLOW_FIXED_CODE;
delete serverEnv.GETPRO_OTP_QA_LIVE_DELIVERY;
delete serverEnv.RESEND_API_KEY;
delete serverEnv.GETPRO_OTP_ACTIVATION;
delete serverEnv.GETPRO_BB_LOGIN_OTP_OBSERVER;
if (acOtpSelected) {
  serverEnv.GETPRO_OTP_PROVIDER = "qa-observer";
  serverEnv.GETPRO_AC_RECOVERY_OTP_OBSERVER = "1";
} else {
  delete serverEnv.GETPRO_OTP_PROVIDER;
  delete serverEnv.GETPRO_AC_RECOVERY_OTP_OBSERVER;
}

module.exports = defineConfig({
  testDir: "./tests/e2e/v13",
  testMatch: acOtpSelected
    ? /v13-ac-email-otp\.spec\.js/
    : /v13-ac-platform-qa\.spec\.js/,
  outputDir: path.join(__dirname, "test-results", "v13-ac-platform"),
  timeout: acOtpSelected ? 180_000 : 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [["list"]],
  use: {
    baseURL,
    storageState: { cookies: [], origins: [] },
    ...devices["Desktop Chrome"],
    launchOptions: {
      args: [LOCAL_HOST_RESOLVER_ARG],
    },
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: {
    command: "node scripts/ci/observe-v13-local-server.cjs",
    url: `${baseURL}/healthz`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...serverEnv,
      SESSION_SECRET: process.env.E2E_SESSION_SECRET || `v13-ac-qa-${runId}`,
      BLESSBOARD_E2E_RUN_ID: runId,
      GETPRO_REQUIRE_PLATFORM_CSRF: "1",
    },
  },
});
