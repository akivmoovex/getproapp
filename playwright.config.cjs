const path = require("path");
const { defineConfig, devices } = require("@playwright/test");

const PORT = process.env.PLAYWRIGHT_PORT || "4175";
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Visual snapshots: flat names under tests/__screenshots__ (no OS suffix) so one baseline
 * can be updated per release. Cross-OS font AA may still differ — use tolerant thresholds.
 *
 * Scope is intentionally only the public UI visual specs — not the repo's node:test suites
 * (*.test.js) which share the tests/ directory.
 */
module.exports = defineConfig({
  testDir: "./tests",
  testMatch: [
    "ui.spec.js",
    "brand-home-stability.spec.js",
    "bb-v211-hq-member-invitation-security.spec.js",
    "bb-v211-branch-member-invitation-security.spec.js",
    "bb-v211-member-invitation-acceptance-security.spec.js",
    "bb-v211-qa137-*.spec.cjs",
  ],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  snapshotDir: path.join(__dirname, "tests", "__screenshots__"),
  snapshotPathTemplate: "{snapshotDir}/{arg}{ext}",
  use: {
    baseURL: BASE_URL,
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 720 },
    extraHTTPHeaders: process.env.BB_BROWSER_SECURITY ? {} : {
      "X-Forwarded-Host": process.env.PLAYWRIGHT_TENANT_HOST || "v211-qa-bb.blessboard.org",
      "X-Forwarded-Proto": "http",
    },
    trace: "retain-on-failure",
  },
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixels: 4000,
      maxDiffPixelRatio: 0.06,
      caretColor: "transparent",
    },
  },
  webServer: {
    command: `node scripts/local/run-local-qa-server.js`,
    url: `${BASE_URL}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      PORT,
      HOST: "127.0.0.1",
      BASE_DOMAIN: process.env.BASE_DOMAIN || "blessboard.org",
      GETPRO_HTML_DATA_BRAND: "getpro",
      APP_BRAND: "getpro",
      NODE_ENV: "test",
      DEPLOYMENT_ENV: "testing",
      BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
      BLESSBOARD_APEX_ORIGIN: process.env.BLESSBOARD_APEX_ORIGIN || BASE_URL,
      PLAYWRIGHT_TENANT_HOST: process.env.PLAYWRIGHT_TENANT_HOST || "v211-qa-bb.blessboard.org",
      GETPRO_TEST_DB: "1",
      DATABASE_URL: process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/getpro_v211_qa_disposable_03",
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || "postgresql://127.0.0.1:5432/getpro_v211_qa_disposable_03",
      FOUNDATION_DATABASE_URL: process.env.FOUNDATION_DATABASE_URL || "postgresql://127.0.0.1:5432/getpro_v211_qa_disposable_03",
      PLATFORM_DEPLOYMENT_CODE: process.env.PLATFORM_DEPLOYMENT_CODE || "blessboard-org-staging",
      BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: process.env.BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST || "qa75-91225-1792873862949.blessboard.org",
      GETPRO_PG_SSL: process.env.GETPRO_PG_SSL || "off",
      GETPRO_DB_MISSING_EXIT_DELAY_MS: process.env.GETPRO_DB_MISSING_EXIT_DELAY_MS || "0",
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "playwright-ci-admin-password",
      SESSION_SECRET: process.env.SESSION_SECRET || "playwright-ci-session-secret",
      TRUST_PROXY: "1",
    },
  },
});
