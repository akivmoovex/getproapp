const path = require("path");
const { defineConfig, devices } = require("@playwright/test");

/**
 * ActiveClinic and shared-platform browser config.
 * Stage C remains gated. The suite fails closed until journeys are implemented.
 * E2E_DATABASE_URL must be a run-owned disposable database before this file can load.
 */

const e2eDatabaseUrl = String(process.env.E2E_DATABASE_URL || "").trim();
if (!e2eDatabaseUrl) {
  throw new Error(
    "E2E_DATABASE_URL is required for V13 ActiveClinic browser tests and must be a disposable CI database."
  );
}

const port = process.env.PLAYWRIGHT_E2E_PORT || "4187";

module.exports = defineConfig({
  testDir: "./tests/e2e/v13",
  testMatch: /v13-ac-platform-qa\.spec\.js/,
  outputDir: path.join(__dirname, "test-results", "v13-ac-platform"),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    video: "off",
  },
});
