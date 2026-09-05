#!/usr/bin/env node
"use strict";

/**
 * Hosted QA — BB/AC auth-reg legacy cleanup (testing only).
 * Checks SHA, registration phone fields, login email/phone, mode preservation.
 */

const { chromium } = require("playwright");
const { checkHostedTestingSha } = require("../check-hosted-testing-sha");

const PASS = process.env.QA_PASSWORD || "1234567890";
const EXPECTED = process.env.EXPECTED_SHA || null;

const PRODUCTS = [
  {
    id: "BB",
    base: "https://blessboard.pronline.org",
    registerPath: "/register-church?plan=foundation",
    email: "qa.organisation_administrator@demo-church.example.test",
    phoneLocal: "0971000001",
    expectPath: "/hq",
  },
  {
    id: "AC",
    base: "https://activeclinic.pronline.org",
    registerPath: "/register-clinic",
    email: "demo_organization_admin@demo.activeclinic.example",
    phoneLocal: "0970000001",
    expectPath: "/app",
  },
];

async function inspectRegister(page, product) {
  await page.context().clearCookies();
  let html = "";
  if (product.id === "BB") {
    await page.goto(`${product.base}/register-church?plan=foundation`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.locator("#register_church_name").fill("Auth Cleanup QA Church");
    await page.locator("#register_country").selectOption("ZM").catch(async () => {
      await page.locator("#register_country").fill("ZM");
    });
    await page.locator("#register_city").fill("Lusaka");
    await page.locator("#register_branch_name").fill("Main Branch");
    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/register-church") && r.request().method() === "POST",
        { timeout: 45000 }
      ),
      page.locator('button[value="next-church"]').click(),
    ]);
    html = await resp.text();
    await page.waitForSelector('[data-bb-register-step="administrator"]', { timeout: 45000 });
  } else {
    await page.goto(`${product.base}/register-clinic`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.locator("#clinicName").fill("Auth Cleanup QA Clinic");
    await page.locator("#clinicType").selectOption("clinic").catch(() => {});
    await page.locator("#city").fill("Lusaka");
    await page.locator("#provinceSelect").selectOption({ index: 1 }).catch(() => {});
    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/register-clinic") && r.request().method() === "POST",
        { timeout: 45000 }
      ),
      page.locator('form[data-ac-register-step="clinic"] button[type="submit"]').click(),
    ]);
    html = await resp.text();
    await page.waitForSelector(
      '[data-ac-register-step="administrator"], [data-ac-acw-step="administrator"]',
      { timeout: 45000 }
    );
  }

  const hasPhoneCountry = /name=["']phone_country["']/.test(html);
  const hasPhoneNational = /name=["']phone_national["']/.test(html);
  const legacyMatches = [...html.matchAll(/<input[^>]*name=["']phone["'][^>]*>/gi)].map((m) =>
    m[0]
  );
  const legacyEmptyOnly =
    !legacyMatches.length ||
    legacyMatches.every((tag) => /type=["']hidden["']/i.test(tag) && !/value=["'][^"']+["']/.test(tag));

  return {
    hasPhoneCountry,
    hasPhoneNational,
    legacyInputs: legacyMatches,
    legacyEmptyOnly,
    hasConsentOnAdmin: /name=["']registration_consent["']/.test(html),
    url: page.url(),
    step: "administrator",
  };
}

async function loginEmail(page, base, email, expectPath) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('[data-gp-auth-id-tab="email"]').click();
  await page.locator('input[name="login_email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 });
  const path = new URL(page.url()).pathname;
  return { ok: path.includes(expectPath) || !path.includes("/login"), path, url: page.url() };
}

async function loginPhone(page, base, phoneLocal, expectPath) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('[data-gp-auth-id-tab="phone"]').click();
  await page.locator('input[name="phone_national"]').fill(phoneLocal);
  await page.locator('input[name="password"]').fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 });
  const path = new URL(page.url()).pathname;
  return { ok: path.includes(expectPath) || !path.includes("/login"), path, url: page.url() };
}

async function wrongPasswordPreservesPhoneMode(page, base, phoneLocal) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('[data-gp-auth-id-tab="phone"]').click();
  await page.locator('input[name="phone_national"]').fill(phoneLocal);
  await page.locator('input[name="password"]').fill("definitely-wrong-password");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2000);
  return page.evaluate(() => {
    const mode = document.querySelector('input[name="login_mode"]')?.value;
    const phoneDisabled = Boolean(document.querySelector('input[name="phone_national"]')?.disabled);
    const phoneRequired = Boolean(document.querySelector('input[name="phone_national"]')?.required);
    const emailDisabled = Boolean(document.querySelector('input[name="login_email"]')?.disabled);
    return {
      url: location.href,
      mode,
      phoneDisabled,
      phoneRequired,
      emailDisabled,
      stillOnLogin: location.pathname.includes("/login"),
    };
  });
}

async function noJsPhoneLogin(browser, base, phoneLocal, expectPath) {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${base}/login?mode=phone`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('input[name="phone_national"]').fill(phoneLocal);
  await page.locator('input[name="password"]').fill(PASS);
  await Promise.all([
    page.waitForNavigation({ timeout: 60000 }).catch(() => null),
    page.locator('button[type="submit"]').first().click(),
  ]);
  const path = new URL(page.url()).pathname;
  const result = {
    ok: path.includes(expectPath) || !path.includes("/login"),
    path,
    url: page.url(),
  };
  await context.close();
  return result;
}

async function main() {
  const sha = await checkHostedTestingSha({
    expectedSha: EXPECTED || undefined,
    blessboardUrl: "https://blessboard.pronline.org",
    activeclinicUrl: "https://activeclinic.pronline.org",
  });
  console.log(JSON.stringify({ phase: "sha", ...sha }, null, 2));
  if (!sha.ok) {
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const product of PRODUCTS) {
    for (const viewport of [
      { name: "desktop", width: 1440, height: 900 },
      { name: "mobile", width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();
      const row = { product: product.id, viewport: viewport.name };

      try {
        row.register = await inspectRegister(page, product);
        row.registerOk =
          row.register.hasPhoneCountry &&
          row.register.hasPhoneNational &&
          row.register.legacyEmptyOnly &&
          /register-(church|clinic)/.test(row.register.url);

        row.emailLogin = await loginEmail(page, product.base, product.email, product.expectPath);
        await page.goto(`${product.base}/logout`).catch(() => {});
        await page.waitForTimeout(500);

        row.phoneLogin = await loginPhone(page, product.base, product.phoneLocal, product.expectPath);
        await page.goto(`${product.base}/logout`).catch(() => {});
        await page.waitForTimeout(500);

        row.wrongPassword = await wrongPasswordPreservesPhoneMode(
          page,
          product.base,
          product.phoneLocal
        );
        row.wrongPasswordOk =
          row.wrongPassword.stillOnLogin &&
          (row.wrongPassword.mode === "phone" ||
            (!row.wrongPassword.phoneDisabled && row.wrongPassword.phoneRequired));

        if (viewport.name === "desktop") {
          row.noJsPhone = await noJsPhoneLogin(
            browser,
            product.base,
            product.phoneLocal,
            product.expectPath
          );
        }

        row.ok =
          row.registerOk &&
          row.emailLogin.ok &&
          row.phoneLogin.ok &&
          row.wrongPasswordOk &&
          (viewport.name !== "desktop" || (row.noJsPhone && row.noJsPhone.ok));
      } catch (err) {
        row.ok = false;
        row.error = String(err && err.message ? err.message : err);
      }

      results.push(row);
      await context.close();
    }
  }

  await browser.close();

  const allOk = results.every((r) => r.ok);
  console.log(JSON.stringify({ phase: "flows", allOk, results }, null, 2));
  process.exitCode = allOk ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
