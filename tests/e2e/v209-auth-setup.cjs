"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(ROOT, "tmp", "e2e-auth");
const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:4175";
const BB_HOST = "blessboard.neuniversity.org";
const AC_HOST = "activeclinic.neuniversity.org";

function credentials(prefix, fallbackEmail, fallbackPassword) {
  return {
    email: process.env[`E2E_${prefix}_ADMIN_EMAIL`] || fallbackEmail,
    password: process.env[`E2E_${prefix}_ADMIN_PASSWORD`] || fallbackPassword,
  };
}

async function login(browser, { product, host, path: loginPath, landing, email, password, state }) {
  const context = await browser.newContext({
    extraHTTPHeaders: { "X-Forwarded-Host": host, "X-Forwarded-Proto": "http" },
  });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}${loginPath}`);
  await page.locator("#login_email, #identifier, #username").first().fill(email);
  await page.locator("#password").fill(password);
  await page.locator("form button[type=submit], form input[type=submit]").first().click();
  await page.waitForTimeout(500);
  if (page.url().includes(loginPath)) throw new Error(`${product} login rejected credentials`);
  await page.goto(`${BASE_URL}${landing}`);
  if (!/admin|dashboard|app|\/hq(?:\/|$)/.test(page.url())) throw new Error(`${product} login did not reach authenticated landing`);
  await context.storageState({ path: state });
  await context.close();
}

async function main() {
  if (!process.env.E2E_DATABASE_URL) throw new Error("E2E_DATABASE_URL is required");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const bb = credentials("BB", "v209-e2e-bb-admin@example.test", "V209-local-BB-admin!");
    const ac = credentials("AC", "v209-e2e-ac-admin@example.test", "V209-local-AC-admin!");
    await login(browser, {
      product: "BB",
      host: BB_HOST,
      path: "/login",
      landing: "/hq",
      ...bb,
      state: path.join(OUT, "bb-admin.json"),
    });
    await login(browser, {
      product: "AC",
      host: AC_HOST,
      path: "/login",
      landing: "/app",
      ...ac,
      state: path.join(OUT, "ac-admin.json"),
    });
    console.log(JSON.stringify({ ok: true, bb: "bb-admin.json", ac: "ac-admin.json" }));
  } finally {
    await browser.close();
  }
}

if (require.main === module) main().catch((error) => {
  console.error(`[v209-auth] ${error.message}`);
  process.exitCode = 1;
});

module.exports = { login, BASE_URL, BB_HOST, AC_HOST, OUT };
