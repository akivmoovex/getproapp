#!/usr/bin/env node
"use strict";

/**
 * Hosted QA — email vs phone tab login (testing only).
 */

const { chromium } = require("playwright");
const { checkHostedTestingSha } = require("../check-hosted-testing-sha");

const PASS = process.env.QA_PASSWORD || "1234567890";

const CASES = [
  {
    product: "blessboard",
    base: "https://blessboard.pronline.org",
    email: "qa.organisation_administrator@demo-church.example.test",
    // Same QA user as email (seed sequence +260971000001).
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

async function loginEmail(page, base, email) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('[data-gp-auth-id-tab="email"]').click();
  await page.locator('input[name="login_email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 });
  return { ok: true, url: page.url() };
}

async function loginPhoneTab(page, base, phoneLocal) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('[data-gp-auth-id-tab="phone"]').click();
  const validity = await page.evaluate(() => {
    const email = document.querySelector('input[name="login_email"]');
    const phone = document.querySelector('input[name="phone_national"]');
    return {
      login_mode: document.querySelector('input[name="login_mode"]')?.value,
      emailRequired: email?.required,
      emailDisabled: email?.disabled,
      phoneRequired: phone?.required,
      phoneDisabled: phone?.disabled,
    };
  });
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
    validity: { ...validity, formValid },
    status: r.status(),
    location: r.headers()["location"] || "",
    finalUrl: page.url(),
    ok: !page.url().includes("/login"),
  };
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
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      try {
        const email = await loginEmail(page, c.base, c.email);
        await context.clearCookies();
        const phone = await loginPhoneTab(page, c.base, c.phoneLocal);
        const emailPath = new URL(email.url).pathname;
        const phonePath = new URL(phone.finalUrl).pathname;
        const sameAccount =
          emailPath.startsWith(c.expectPath) && phonePath.startsWith(c.expectPath);
        results.push({
          product: c.product,
          viewport: vp.label,
          email,
          phone,
          sameAccount,
          pass:
            email.ok &&
            phone.ok &&
            phone.status === 303 &&
            sameAccount &&
            phone.validity &&
            phone.validity.emailDisabled === true &&
            phone.validity.phoneDisabled === false &&
            phone.validity.formValid === true,
        });
      } finally {
        await context.close();
      }
    }
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
