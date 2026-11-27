"use strict";

/**
 * D163 browser journeys that D150, D159, and D161 do not already specify.
 * Implemented against future run-owned fixtures. Not executed in D163.
 * Login is not bypassed with a manufactured session cookie.
 */

const { test, expect } = require("@playwright/test");
const { installLocalOnlyRoutes } = require("../../v13/helpers/v13BrowserIsolation");

function hold(testInfo, name) {
  if (
    process.env.GETPRO_V13_BROWSER_AUTHORIZED !== "1" ||
    process.env.GETPRO_V13_ALLOW_DB_WRITES !== "1" ||
    process.env.GETPRO_V13_DB_STAGES_AUTHORIZED !== "1"
  ) {
    testInfo.annotations.push({ type: "v13-result", description: "NOT_RUN" });
    throw new Error(`NOT_RUN: ${name} is implemented and waits for disposable browser authorization`);
  }
}

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error && error.message)));
  page._d163Errors = errors;
  await installLocalOnlyRoutes(page, process.env.PLAYWRIGHT_E2E_PORT || "4187");
});

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required for the authorized browser journey`);
  return value;
}

async function memberSignIn(page) {
  await page.goto("/member/login");
  await page.locator("input[name='member_number']").fill(required("E2E_BB_MEMBER_NUMBER"));
  await page.locator("input[name='password']").fill(required("E2E_BB_MEMBER_PASSWORD"));
  await page.locator("form").filter({ has: page.locator("input[name='member_number']") }).locator("button[type='submit']").click();
}

test("D163 laboratory forged filter does not activate the received tab", async ({ page }, testInfo) => {
  hold(testInfo, "D163-LAB-FILTER");
  await page.goto("/login");
  await page.locator("input[name='login_email']").fill(required("E2E_AC_ADMIN_EMAIL"));
  await page.locator("input[name='password']").fill(required("E2E_AC_ADMIN_PASSWORD"));
  await page.locator("form").filter({ has: page.locator("input[name='login_email']") }).locator("button[type='submit']").click();
  await page.goto("/app/diagnostics/laboratory/queue?status=forged");
  await expect(page.locator("[data-gp-ops-tab='received']")).not.toHaveAttribute("aria-current", "page");
  await expect(page.locator("input[name='status']")).toHaveValue("forged");
  expect(page._d163Errors).toEqual([]);
});

test("D163 radiology reported filter is separate from the open count", async ({ page }, testInfo) => {
  hold(testInfo, "D163-RAD-FILTER");
  await page.goto("/login");
  await page.locator("input[name='login_email']").fill(required("E2E_AC_ADMIN_EMAIL"));
  await page.locator("input[name='password']").fill(required("E2E_AC_ADMIN_PASSWORD"));
  await page.locator("form").filter({ has: page.locator("input[name='login_email']") }).locator("button[type='submit']").click();
  await page.goto("/app/diagnostics/radiology/queue?status=reported");
  await expect(page.locator("[data-gp-ops-tab='reported']")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("[data-gp-ops-tab='pending']")).not.toHaveAttribute("aria-current", "page");
  await expect(page.locator("[data-gp-ops-tab='reported'] .gp-ops-status-tabs__count")).toBeVisible();
  expect(page._d163Errors).toEqual([]);
});

test("D163 OTP exhaustion is announced and does not sign in", async ({ page }, testInfo) => {
  hold(testInfo, "D163-OTP-EXHAUSTED");
  await memberSignIn(page);
  const code = page.locator("input[name='otp_code']");
  await expect(code).toBeVisible();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await code.fill("000000");
    await page.locator("button[type='submit']").first().click();
  }
  await expect(page.getByRole("alert")).toContainText(/too many attempts/i);
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => /sid/.test(cookie.name))).toBe(false);
  expect(page._d163Errors).toEqual([]);
});

test("D163 OTP verification rejects a missing CSRF token", async ({ page }, testInfo) => {
  hold(testInfo, "D163-OTP-CSRF");
  await memberSignIn(page);
  await expect(page.locator("input[name='otp_code']")).toBeVisible();
  const response = await page.request.post("/member/login/verify", {
    form: { otp_code: required("E2E_BB_OTP_CODE") },
  });
  expect(response.status()).toBe(403);
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => /sid/.test(cookie.name))).toBe(false);
  expect(page._d163Errors).toEqual([]);
});
