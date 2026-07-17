"use strict";

const { test: base, expect } = require("@playwright/test");
const { Pool } = require("pg");
const {
  PLATFORM_HOST,
  DOMAIN,
  readState,
  writeState,
  tenantHost,
  STATE_PATH,
} = require("./helpers.cjs");

const diagnosticSinks = new Set();

function attachPageDiagnostics(page, sink) {
  page.on("console", (message) => {
    if (message.type() === "error") {
      sink.consoleErrors.push({ url: page.url(), text: message.text() });
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      sink.failedResponses.push({
        status: response.status(),
        method: response.request().method(),
        url: response.url(),
      });
    }
  });
  page.on("requestfailed", (request) => {
    sink.requestFailures.push({
      method: request.method(),
      url: request.url(),
      error: request.failure()?.errorText || "unknown",
    });
  });
}

function defaultBaseURL() {
  const port = process.env.PLAYWRIGHT_E2E_PORT || "4185";
  return `http://127.0.0.1:${port}`;
}

const test = base.extend({
  e2eState: async ({}, use) => {
    await use(readState());
  },

  shared: [
    async ({}, use) => {
      const state = readState();
      const bag = state.shared && typeof state.shared === "object" ? { ...state.shared } : {};
      await use(bag);
      writeState({ shared: bag });
    },
    { scope: "worker" },
  ],

  db: [
    async ({}, use) => {
      const connectionString = String(process.env.E2E_DATABASE_URL || "").trim();
      if (!connectionString) throw new Error("E2E_DATABASE_URL is required.");
      const ssl =
        String(process.env.GETPRO_PG_SSL || "off").toLowerCase() === "off"
          ? false
          : { rejectUnauthorized: false };
      const pool = new Pool({ connectionString, ssl, max: 3 });
      await pool.query("SELECT 1");
      await use(pool);
      await pool.end();
    },
    { scope: "worker" },
  ],

  diagnostics: [
    async ({ context }, use, testInfo) => {
      const sink = {
        consoleErrors: [],
        failedResponses: [],
        requestFailures: [],
      };
      diagnosticSinks.add(sink);

      const attachPage = (page) => attachPageDiagnostics(page, sink);
      context.pages().forEach(attachPage);
      context.on("page", attachPage);
      await use(sink);

      diagnosticSinks.delete(sink);
      if (testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach("browser-console-errors.json", {
          body: Buffer.from(JSON.stringify(sink.consoleErrors, null, 2)),
          contentType: "application/json",
        });
        await testInfo.attach("failed-http-responses.json", {
          body: Buffer.from(JSON.stringify(sink.failedResponses, null, 2)),
          contentType: "application/json",
        });
        await testInfo.attach("request-failures.json", {
          body: Buffer.from(JSON.stringify(sink.requestFailures, null, 2)),
          contentType: "application/json",
        });
      }
    },
    { auto: true },
  ],
});

async function newHostContext(browser, host, options = {}) {
  const context = await browser.newContext({
    baseURL: options.baseURL || defaultBaseURL(),
    ...options,
    extraHTTPHeaders: {
      "X-Forwarded-Host": host,
      "X-Forwarded-Proto": "http",
      ...(options.extraHTTPHeaders || {}),
    },
  });

  const attachAll = (page) => {
    for (const sink of diagnosticSinks) {
      attachPageDiagnostics(page, sink);
    }
  };
  context.pages().forEach(attachAll);
  context.on("page", attachAll);
  return context;
}

async function expectTestingDatabaseIdentity(db) {
  const result = await db.query(
    `SELECT environment_code, deployment_name, database_instance_id
       FROM public.church_database_identity
      WHERE id = 1`
  );
  expect(result.rows[0]?.environment_code).toBe("testing");
  return result.rows[0];
}

module.exports = {
  test,
  expect,
  readE2eState: readState,
  writeE2eState: writeState,
  newHostContext,
  expectTestingDatabaseIdentity,
  PLATFORM_HOST,
  DOMAIN,
  tenantHost,
  STATE_PATH,
};
