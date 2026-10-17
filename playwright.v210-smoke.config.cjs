"use strict";

const path = require("path");
const { defineConfig } = require("@playwright/test");

const port = process.env.PLAYWRIGHT_V210_PORT || "4195";
const databaseUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!databaseUrl || !/getpro_v210_qa_test/i.test(databaseUrl)) {
  throw new Error("TEST_DATABASE_URL must target getpro_v210_qa_test isolated QA database.");
}

module.exports = defineConfig({
  testDir: "./tests/browser",
  testMatch: /v210-(bb|ac)-smoke\.spec\.js/,
  workers: 2,
  fullyParallel: true,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  outputDir: path.join(__dirname, "test-results", "v210-browser-smoke"),
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile-390", use: { viewport: { width: 390, height: 844 }, isMobile: true } },
  ],
  webServer: {
    command: "node server.js",
    url: `http://127.0.0.1:${port}/healthz`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      ...process.env,
      NODE_ENV: "test",
      GETPRO_TEST_DB: "1",
      TEST_DATABASE_URL: databaseUrl,
      DATABASE_URL: databaseUrl,
      DEPLOYMENT_ENV: "testing",
      DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
      DATABASE_IDENTITY_ENV: "testing",
      GETPRO_PG_SSL: "off",
      PORT: port,
      HOST: "127.0.0.1",
      BASE_DOMAIN: "pronline.org",
      PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
      TRUST_PROXY: "1",
      SESSION_SECRET: "v210-browser-smoke-session-secret",
    },
  },
});
