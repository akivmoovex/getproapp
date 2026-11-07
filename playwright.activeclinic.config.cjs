"use strict";

const base = require("./playwright.config.cjs");

module.exports = {
  ...base,
  testMatch: ["tests/browser/v210-ac-smoke.spec.js"],
  testIgnore: [],
  webServer: {
    ...base.webServer,
    command: "node scripts/ci/run-activeclinic-qa-server.js",
    env: {
      ...base.webServer.env,
      PLATFORM_DEPLOYMENT_CODE: "activeclinic-org-v6",
      BASE_DOMAIN: process.env.BASE_DOMAIN || "activeclinic-demo.local.test",
      PLAYWRIGHT_TENANT_HOST:
        process.env.PLAYWRIGHT_TENANT_HOST || "activeclinic-demo.local.test",
    },
  },
};
