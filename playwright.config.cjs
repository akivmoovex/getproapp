const path = require("path");
const { defineConfig, devices } = require("@playwright/test");

const PORT = process.env.PLAYWRIGHT_PORT || "4175";
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Visual snapshots: flat names under tests/__screenshots__ (no OS suffix) so one baseline
 * can be updated per release. Cross-OS font AA may still differ — use tolerant thresholds.
 */
module.exports = defineConfig({
  testDir: "./tests",
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
    extraHTTPHeaders: {
      "X-Forwarded-Host": "demo.local.test",
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
    command: `node server.js`,
    url: `${BASE_URL}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      PORT,
      HOST: "127.0.0.1",
      BASE_DOMAIN: "local.test",
      GETPRO_HTML_DATA_BRAND: "getpro",
      NODE_ENV: "test",
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "playwright-ci-admin-password",
      SESSION_SECRET: process.env.SESSION_SECRET || "playwright-ci-session-secret",
      TRUST_PROXY: "1",
    },
  },
});
