const path = require("path");
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/e2e/v13",
  testMatch: /v13-ac-community-benefits\.spec\.js/,
  outputDir: path.join(__dirname, "test-results", "v13-ac-community"),
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4191",
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    video: "off",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node tests/e2e/v13/communityBenefitsServer.cjs",
    url: "http://127.0.0.1:4191/app/community/enroll",
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      ...process.env,
      PORT: "4191",
      NODE_ENV: "test",
      GETPRO_AC_COMMUNITY_BENEFITS_ENABLED: "1",
    },
  },
});
