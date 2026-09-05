#!/usr/bin/env node
"use strict";

/**
 * Hosted QA — phone-login P2 (JS on + no-JS mode URLs). Testing only.
 */

const { chromium } = require("playwright");
const { checkHostedTestingSha } = require("../check-hosted-testing-sha");

const PASS = process.env.QA_PASSWORD || "1234567890";

const CASES = [
  {
    product: "blessboard",
    base: "https://blessboard.pronline.org",
    email: "qa.organisation_administrator@demo-church.example.test",
    phoneLocal: "0971000001",
    expectPath: "/hq",
  },
  {
    product: "activeclinic",
    base: "https://activeclinic.pronline.org",
    email: "qa.fullproduct.260817235630@example.test",
    phoneLocal: "0970000001",
    expectPath: "/app",
  },
];

async function fieldState(page) {
  return page.evaluate(() => {
    const email = document.querySelector('input[name="login_email"]');
    const phone = document.querySelector('input[name="phone_national"]');
    const mode = document.querySelector('input[name="login_mode"]');
    return {
      login_mode: mode?.value || null,
      emailRequired: Boolean(email?.required),
      emailDisabled: Boolean(email?.disabled),
      phoneRequired: Boolean(phone?.required),
      phoneDisabled: Boolean(phone?.disabled),
      emailHref: document.querySelector('[data-gp-auth-id-tab="email"]')?.getAttribute("href"),
      phoneHref: document.querySelector('[data-gp-auth-id-tab="phone"]')?.getAttribute("href"),
    };
  });
}

async function loginEmailJs(page, base, email) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('[data-gp-auth-id-tab="email"]').click();
  await page.locator('input[name="login_email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 });
  return { ok: true, url: page.url(), path: new URL(page.url()).pathname };
}

async function loginPhoneJs(page, base, phoneLocal) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('[data-gp-auth-id-tab="phone"]').click();
  const state = await fieldState(page);
  await page.locator('input[name="phone_national"]').fill(phoneLocal);
  await page.locator('input[name="password"]').fill(PASS);
  const formValid = await page.evaluate(() => document.querySelector("form")?.checkValidity());
  const resp = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().includes("/login"),
    { timeout: 30000 }
  );
  await page.locator('button[type="submit"]').first().click();
  const r = await resp;
  await page.waitForTimeout(1500);
  return {
    state: { ...state, formValid },
    status: r.status(),
    finalUrl: page.url(),
    path: new URL(page.url()).pathname,
    ok: !page.url().includes("/login"),
  };
}

async function tabSwitchRegression(page, base, email, phoneLocal) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('[data-gp-auth-id-tab="email"]').click();
  await page.locator('input[name="login_email"]').fill(email);
  await page.locator('[data-gp-auth-id-tab="phone"]').click();
  let mid = await fieldState(page);
  await page.locator('input[name="phone_national"]').fill(phoneLocal);
  await page.locator('[data-gp-auth-id-tab="email"]').click();
  const backEmail = await fieldState(page);
  await page.locator('input[name="password"]').fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 });
  const emailPath = new URL(page.url()).pathname;
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('[data-gp-auth-id-tab="phone"]').click();
  await page.locator('input[name="phone_national"]').fill(phoneLocal);
  await page.locator('input[name="password"]').fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 });
  return {
    mid,
    backEmail,
    emailPath,
    phonePath: new URL(page.url()).pathname,
    ok:
      mid.emailDisabled === true &&
      mid.phoneDisabled === false &&
      backEmail.emailDisabled === false &&
      backEmail.phoneDisabled === true &&
      backEmail.emailRequired === true &&
      backEmail.phoneRequired === false,
  };
}

async function noJsModeLogin(browser, base, mode, fill, expectPath) {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  try {
    await page.goto(`${base}/login?mode=${mode}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    const state = await fieldState(page);
    if (mode === "email") {
      await page.locator('input[name="login_email"]').fill(fill.email);
    } else {
      await page.locator('input[name="phone_national"]').fill(fill.phoneLocal);
    }
    await page.locator('input[name="password"]').fill(PASS);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2500);
    const path = new URL(page.url()).pathname;
    return {
      state,
      path,
      url: page.url(),
      ok: path.startsWith(expectPath),
      modeOk:
        mode === "email"
          ? state.emailDisabled === false &&
            state.emailRequired === true &&
            state.phoneDisabled === true &&
            state.phoneRequired === false
          : state.emailDisabled === true &&
            state.emailRequired === false &&
            state.phoneDisabled === false &&
            state.phoneRequired === true,
    };
  } finally {
    await context.close();
  }
}

async function noJsWrongPassword(browser, base, phoneLocal) {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  try {
    await page.goto(`${base}/login?mode=phone`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.locator('input[name="phone_national"]').fill(phoneLocal);
    await page.locator('input[name="password"]').fill("definitely-wrong-password");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2500);
    const state = await fieldState(page);
    const body = await page.content();
    return {
      state,
      stayedPhone: state.login_mode === "phone" && state.phoneDisabled === false,
      hasError: /invalid|failed|try again|credentials/i.test(body),
      url: page.url(),
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const sha = await checkHostedTestingSha();
  if (!sha.ok) {
    console.error(JSON.stringify({ sha, error: "hosted testing SHA mismatch" }, null, 2));
    process.exit(3);
  }

  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const c of CASES) {
    for (const vp of [
      { label: "1440", width: 1440, height: 900 },
      { label: "390", width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      const page = await context.newPage();
      try {
        const email = await loginEmailJs(page, c.base, c.email);
        await context.clearCookies();
        const phone = await loginPhoneJs(page, c.base, c.phoneLocal);
        await context.clearCookies();
        const switchReg = await tabSwitchRegression(page, c.base, c.email, c.phoneLocal);
        results.push({
          product: c.product,
          viewport: vp.label,
          kind: "js-enabled",
          email,
          phone,
          switchReg,
          sameAccount:
            email.path.startsWith(c.expectPath) && phone.path.startsWith(c.expectPath),
          pass:
            email.ok &&
            phone.ok &&
            phone.status === 303 &&
            switchReg.ok &&
            email.path.startsWith(c.expectPath) &&
            phone.path.startsWith(c.expectPath),
        });
      } finally {
        await context.close();
      }
    }

    const emailNoJs = await noJsModeLogin(
      browser,
      c.base,
      "email",
      { email: c.email, phoneLocal: c.phoneLocal },
      c.expectPath
    );
    const phoneNoJs = await noJsModeLogin(
      browser,
      c.base,
      "phone",
      { email: c.email, phoneLocal: c.phoneLocal },
      c.expectPath
    );
    const wrongPw = await noJsWrongPassword(browser, c.base, c.phoneLocal);
    results.push({
      product: c.product,
      viewport: "1440",
      kind: "js-disabled",
      emailNoJs,
      phoneNoJs,
      wrongPw,
      pass:
        emailNoJs.ok &&
        emailNoJs.modeOk &&
        phoneNoJs.ok &&
        phoneNoJs.modeOk &&
        wrongPw.stayedPhone &&
        wrongPw.hasError,
    });
  }

  await browser.close();
  const failures = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ sha: sha.expectedSha, results, failures: failures.length }, null, 2));
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
