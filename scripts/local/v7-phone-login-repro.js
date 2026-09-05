#!/usr/bin/env node
"use strict";

/**
 * Reproduce email vs phone login on hosted testing (no secrets logged).
 */

const { chromium } = require("playwright");

const PASS = process.env.QA_PASSWORD || "1234567890";
const BB = "https://blessboard.pronline.org";
const AC = "https://activeclinic.pronline.org";

const BB_USER = {
  email: "qa.organisation_administrator@demo-church.example.test",
  phoneE164: "+260971000001",
  phoneLocal: "0971000001",
  phoneNational: "971000001",
  expectPath: "/hq",
};

const AC_USER = {
  email: "qa.fullproduct.260817235630@example.test",
  phoneE164: "+260970000001",
  phoneLocal: "0970000001",
  phoneNational: "970000001",
  expectPath: "/app",
};

async function fetchLoginCsrf(page, base) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const csrf = await page.locator('input[name="_csrf"]').inputValue();
  const cookies = await page.context().cookies();
  return { csrf, cookies };
}

async function postForm(page, base, body) {
  const { csrf } = await fetchLoginCsrf(page, base);
  const res = await page.request.post(`${base}/login`, {
    form: { _csrf: csrf, password: PASS, ...body },
    maxRedirects: 0,
  });
  const loc = res.headers()["location"] || "";
  const text = await res.text().catch(() => "");
  return { status: res.status(), location: loc, snippet: text.slice(0, 200) };
}

async function browserPhoneTabLogin(page, base, national, label) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-gp-auth-id-tab="phone"]').click();
  await page.locator('input[name="phone_national"]').fill(national);
  await page.locator('input[name="password"]').fill(PASS);
  const resp = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes("/login"),
    { timeout: 20000 }
  );
  await page.locator('button[type="submit"]').first().click();
  const r = await resp;
  return {
    label,
    status: r.status(),
    url: r.url(),
    location: r.headers()["location"] || "",
    finalUrl: page.url(),
  };
}

async function browserEmailLogin(page, base, email) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-gp-auth-id-tab="email"]').click();
  await page.locator('input[name="login_email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 }).catch(() => {});
  return { ok: !page.url().includes("/login"), finalUrl: page.url() };
}

async function testProduct(name, base, user, page) {
  const results = { product: name, attempts: [] };

  const emailBrowser = await browserEmailLogin(page, base, user.email);
  results.attempts.push({
    method: "browser_email",
    ...emailBrowser,
    identifierType: "email",
  });

  await page.context().clearCookies();
  const phoneTab = await browserPhoneTabLogin(page, base, user.phoneLocal, "phone_tab_local");
  results.attempts.push({
    method: "browser_phone_tab",
    identifierType: "phone",
    format: "local_0",
    ...phoneTab,
  });

  await page.context().clearCookies();
  const phoneNational = await browserPhoneTabLogin(page, base, user.phoneNational, "phone_tab_national");
  results.attempts.push({
    method: "browser_phone_tab",
    identifierType: "phone",
    format: "national",
    ...phoneNational,
  });

  await page.context().clearCookies();
  const legacyE164 = await postForm(page, base, {
    login_mode: "phone",
    phone_country: "ZM",
    phone_national: user.phoneLocal,
  });
  results.attempts.push({
    method: "http_phone_tab_form",
    identifierType: "phone",
    format: "local_0",
    ...legacyE164,
  });

  await page.context().clearCookies();
  const legacyId = await postForm(page, base, { identifier: user.phoneE164 });
  results.attempts.push({
    method: "http_legacy_identifier",
    identifierType: "phone",
    format: "e164",
    ...legacyId,
  });

  await page.context().clearCookies();
  const wrongMode = await postForm(page, base, {
    login_mode: "email",
    login_email: user.phoneLocal,
  });
  results.attempts.push({
    method: "http_email_mode_with_phone_value",
    identifierType: "phone",
    format: "local_0",
    ...wrongMode,
  });

  return results;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const out = [];
  out.push(await testProduct("blessboard", BB, BB_USER, page));
  await context.close();
  const context2 = await browser.newContext();
  const page2 = await context2.newPage();
  out.push(await testProduct("activeclinic", AC, AC_USER, page2));
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
