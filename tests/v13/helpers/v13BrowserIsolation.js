"use strict";

/**
 * Fail-closed isolation for V13 Playwright. These checks do not open a
 * database connection and do not start a browser.
 */

const {
  BANNED_HOST_MARKERS,
  assertDbWritingStagesAuthorized,
  assertHarnessDatabaseTarget,
} = require("./v13CiDatabaseGuard");
const { assertIsolatedBootstrapLaunch } = require("./v13IsolatedExecutionPlan");

const LOCAL_HOST_RESOLVER_ARG =
  "--host-resolver-rules=MAP *.local.test 127.0.0.1,MAP local.test 127.0.0.1";

const BROWSER_TARGET_ENV_KEYS = Object.freeze([
  "BLESSBOARD_PUBLIC_URL",
  "BLESSBOARD_ADMIN_URL",
  "BASE_DOMAIN",
  "CHURCH_HOST_DOMAIN",
  "BLESSBOARD_CANONICAL_DOMAIN",
  "E2E_PLATFORM_HOST",
]);

const PROVIDER_ENV_RE = /^(RESEND|TWILIO|INFOBIP|SENDGRID|MAILGUN)_/i;

/**
 * @param {string | number | undefined} value
 * @param {string | number} [fallback]
 */
function assertDisposableBrowserPort(value, fallback) {
  const raw = String(value || fallback || "").trim();
  if (!/^[0-9]+$/.test(raw)) {
    throw new Error("V13_BROWSER_GUARD: browser port must be numeric");
  }
  const port = Number(raw);
  if (port < 4100 || port > 4999) {
    throw new Error("V13_BROWSER_GUARD: browser port must be in 4100-4999");
  }
  return String(port);
}

/**
 * @param {string} url
 */
function assertLocalBaseUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("V13_BROWSER_GUARD: base URL is malformed");
  }
  if (parsed.protocol !== "http:") {
    throw new Error("V13_BROWSER_GUARD: base URL must be http");
  }
  if (parsed.hostname !== "127.0.0.1") {
    throw new Error("V13_BROWSER_GUARD: base URL host must be 127.0.0.1");
  }
  if (parsed.username || parsed.password) {
    throw new Error("V13_BROWSER_GUARD: base URL must not carry credentials");
  }
  const port = assertDisposableBrowserPort(parsed.port);
  return `http://127.0.0.1:${port}`;
}

/**
 * @param {string} rawUrl
 * @param {string | number} port
 */
function isAllowedBrowserRequest(rawUrl, port) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:") return false;
  const allowedPort = String(port);
  const requestPort = parsed.port || "80";
  if (requestPort !== allowedPort) return false;
  const host = String(parsed.hostname || "").toLowerCase();
  if (host === "127.0.0.1" || host === "localhost" || host === "::1") return true;
  if (host === "local.test" || host.endsWith(".local.test")) return true;
  return false;
}

/**
 * @param {NodeJS.ProcessEnv} env
 */
function assertNoProductionBrowserTarget(env) {
  for (const key of BROWSER_TARGET_ENV_KEYS) {
    const value = String(env[key] || "").trim().toLowerCase();
    if (!value) continue;
    for (const token of BANNED_HOST_MARKERS) {
      if (value.includes(token)) {
        throw new Error(`V13_BROWSER_GUARD: refusing production browser target in ${key}`);
      }
    }
  }
  const provider = String(env.BLESSBOARD_OTP_PROVIDER || "test").trim().toLowerCase();
  if (provider !== "test") {
    throw new Error("V13_BROWSER_GUARD: BLESSBOARD_OTP_PROVIDER must be test");
  }
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ fallbackPort?: string | number }} [opts]
 */
function assertV13BrowserHarness(env = process.env, opts = {}) {
  if (String(env.GETPRO_V13_BROWSER_AUTHORIZED || "") !== "1") {
    throw new Error("V13_BROWSER_GUARD: browser authorization is missing");
  }
  assertDbWritingStagesAuthorized(env);
  assertNoProductionBrowserTarget(env);
  const target = assertHarnessDatabaseTarget(env);
  const isolated = assertIsolatedBootstrapLaunch(env);
  if (isolated.database !== target.database || isolated.host !== "127.0.0.1" || isolated.port !== "55432") {
    throw new Error("V13_BROWSER_GUARD: browser setup requires the isolated PostgreSQL target");
  }
  const port = assertDisposableBrowserPort(env.PLAYWRIGHT_E2E_PORT, opts.fallbackPort || "4186");
  const baseURL = assertLocalBaseUrl(`http://127.0.0.1:${port}`);
  return { ...target, port, baseURL };
}

/**
 * Child environment for the localhost application process.
 * @param {NodeJS.ProcessEnv} env
 * @param {{ connectionString: string, port: string, baseURL: string }} harness
 */
function buildLocalServerEnv(env, harness) {
  const next = { ...env };
  delete next.GETPRO_DATABASE_URL;
  delete next.BLESSBOARD_OTP_EXPOSE_TEST_CODE;
  for (const key of Object.keys(next)) {
    if (PROVIDER_ENV_RE.test(key)) delete next[key];
  }
  next.HOST = "127.0.0.1";
  next.PORT = harness.port;
  next.PLAYWRIGHT_E2E_PORT = harness.port;
  next.NODE_ENV = "test";
  next.DEPLOYMENT_ENV = "testing";
  next.EXPECTED_DATABASE_ENV = "testing";
  next.DATABASE_IDENTITY_ENV = "testing";
  next.GETPRO_TEST_DB = "1";
  next.GETPRO_PG_SSL = "off";
  next.DATABASE_URL = harness.connectionString;
  next.TEST_DATABASE_URL = harness.connectionString;
  next.E2E_DATABASE_URL = harness.connectionString;
  next.BASE_DOMAIN = "local.test";
  next.BLESSBOARD_CANONICAL_DOMAIN = "local.test";
  next.CHURCH_HOST_DOMAIN = "local.test";
  next.BLESSBOARD_APEX_DOMAINS = "local.test,www.local.test,admin.local.test";
  next.BLESSBOARD_PUBLIC_URL = "http://local.test";
  next.BLESSBOARD_ADMIN_URL = "http://admin.local.test";
  next.E2E_PLATFORM_HOST = "admin.local.test";
  next.BLESSBOARD_OTP_PROVIDER = "test";
  next.TRUST_PROXY = "1";
  return next;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string | number} port
 */
async function installLocalOnlyRoutes(page, port) {
  const allowedPort = assertDisposableBrowserPort(port, "4186");
  await page.context().route("**/*", (route) => {
    if (isAllowedBrowserRequest(route.request().url(), allowedPort)) return route.continue();
    return route.abort();
  });
}

/**
 * @param {import('@playwright/test').Browser} browser
 * @param {string | number} port
 */
async function openIsolatedContext(browser, port) {
  const allowedPort = assertDisposableBrowserPort(port, "4187");
  const baseURL = assertLocalBaseUrl(`http://127.0.0.1:${allowedPort}`);
  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  await context.route("**/*", (route) => {
    if (isAllowedBrowserRequest(route.request().url(), allowedPort)) return route.continue();
    return route.abort();
  });
  return context;
}

/**
 * Guard immediately before a caller-supplied client factory. The factory is
 * not invoked when authorization or the database target is rejected.
 * @param {NodeJS.ProcessEnv} env
 * @param {(options: { connectionString: string, ssl: false }) => object} clientFactory
 */
function createAuthorizedPgClient(env, clientFactory) {
  const harness = assertV13BrowserHarness(env, {
    fallbackPort: env.PLAYWRIGHT_E2E_PORT || "4187",
  });
  if (typeof clientFactory !== "function") {
    throw new Error("V13_BROWSER_GUARD: client factory is required");
  }
  return clientFactory({ connectionString: harness.connectionString, ssl: false });
}

module.exports = {
  LOCAL_HOST_RESOLVER_ARG,
  assertDisposableBrowserPort,
  assertLocalBaseUrl,
  isAllowedBrowserRequest,
  assertNoProductionBrowserTarget,
  assertV13BrowserHarness,
  buildLocalServerEnv,
  installLocalOnlyRoutes,
  openIsolatedContext,
  createAuthorizedPgClient,
};
