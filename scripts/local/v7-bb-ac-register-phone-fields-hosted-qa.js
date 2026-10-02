#!/usr/bin/env node
"use strict";

/**
 * Hosted smoke — registration admin step emits split phone fields only.
 * Testing only. Avoid hammering rate limits.
 */

const { chromium } = require("playwright");
const { checkHostedTestingSha } = require("../check-hosted-testing-sha");

async function checkBb(page) {
  await page.goto("https://blessboard.pronline.org/register-church?plan=foundation", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.locator("#register_church_name").fill(`Auth Cleanup QA Church ${Date.now()}`);
  await page.locator("#register_country").selectOption("ZM");
  await page.locator("#register_city").fill("Lusaka");
  await page.locator("#register_branch_name").fill("Main Branch");
  const [resp] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/register-church") && r.request().method() === "POST",
      { timeout: 30000 }
    ),
    page.locator('button[value="next-church"]').click(),
  ]);
  const html = await resp.text();
  return summarize("BB", resp.status(), html, page.url());
}

async function checkAc(page) {
  await page.goto("https://activeclinic.pronline.org/register-clinic", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.locator("#clinicName").fill(`Auth Cleanup QA Clinic ${Date.now()}`);
  await page.locator("#clinicType").selectOption("clinic").catch(() => {});
  await page.locator("#city").fill("Lusaka");
  await page.locator("#provinceSelect").selectOption({ index: 1 }).catch(() => {});
  const [resp] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/register-clinic") && r.request().method() === "POST",
      { timeout: 30000 }
    ),
    page.locator('form[data-ac-register-step="clinic"] button[type="submit"]').click(),
  ]);
  const html = await resp.text();
  return summarize("AC", resp.status(), html, page.url());
}

function summarize(id, status, html, url) {
  return {
    id,
    status,
    url,
    country: /name=["']phone_country["']/.test(html),
    national: /name=["']phone_national["']/.test(html),
    legacyPhone: /<input[^>]*name=["']phone["']/.test(html),
    consentOnAdmin: /name=["']registration_consent["']/.test(html),
  };
}

async function main() {
  const sha = await checkHostedTestingSha({
    expectedSha: process.env.EXPECTED_SHA || undefined,
  });
  console.log(JSON.stringify({ phase: "sha", ok: sha.ok, expectedSha: sha.expectedSha }, null, 2));
  if (!sha.ok) {
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const out = [];
  for (const check of [checkBb, checkAc]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    out.push(await check(page));
    await context.close();
    await new Promise((r) => setTimeout(r, 3000));
  }
  await browser.close();

  const ok = out.every((x) => x.status === 200 && x.country && x.national && !x.legacyPhone);
  console.log(JSON.stringify({ phase: "register-fields", ok, out }, null, 2));
  process.exitCode = ok ? 0 : 2;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
