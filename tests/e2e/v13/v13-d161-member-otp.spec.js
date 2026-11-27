"use strict";

/**
 * D161 BlessBoard OTP login browser journey.
 * Implemented against future run-owned synthetic fixtures.
 * This file does not bypass OTP and is not executed in D161.
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
  await installLocalOnlyRoutes(page, process.env.PLAYWRIGHT_E2E_PORT || "4187");
});

async function signIn(page) {
  await page.goto("/member/login");
  await page.locator("input[name='member_number']").fill(process.env.E2E_BB_MEMBER_NUMBER || "");
  await page.locator("input[name='password']").fill(process.env.E2E_BB_MEMBER_PASSWORD || "");
  await page.locator("form").filter({ has: page.locator("input[name='member_number']") }).locator("button[type='submit']").click();
}

test("BB-OTP login form is reachable from the keyboard", async ({ page }, testInfo) => {
  hold(testInfo, "BB-OTP-FORM");
  await page.goto("/member/login");
  await page.locator("a.bb-auth-skip").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("input[name='member_number']")).toBeVisible();
  await expect(page.locator("input[name='password']")).toBeVisible();
});

test("BB-OTP credentials leave the session closed until the code form", async ({ page }, testInfo) => {
  hold(testInfo, "BB-OTP-PENDING");
  await signIn(page);
  await expect(page.locator("input[name='otp_code']")).toBeFocused();
  await expect(page.locator("label[for='otp_code']")).toBeVisible();
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => /sid/.test(cookie.name))).toBe(false);
});

test("BB-OTP wrong code is announced without a session", async ({ page }, testInfo) => {
  hold(testInfo, "BB-OTP-WRONG");
  await signIn(page);
  await page.locator("input[name='otp_code']").fill("000000");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toBeVisible();
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => /sid/.test(cookie.name))).toBe(false);
});

test("BB-OTP expired code is announced without a session", async ({ page }, testInfo) => {
  hold(testInfo, "BB-OTP-EXPIRED");
  await signIn(page);
  await page.locator("input[name='otp_code']").fill(process.env.E2E_BB_OTP_EXPIRED_CODE || "000000");
  await page.locator("button[type='submit']").first().click();
  await expect(page.getByRole("alert")).toContainText(/expired|not correct/i);
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => /sid/.test(cookie.name))).toBe(false);
});

test("BB-OTP correct code redirects and the session survives reload", async ({ page }, testInfo) => {
  hold(testInfo, "BB-OTP-COMPLETE");
  await signIn(page);
  await page.locator("input[name='otp_code']").fill(process.env.E2E_BB_OTP_CODE || "");
  await page.locator("button[type='submit']").first().click();
  await expect(page).toHaveURL(/\/member/);
  await page.reload();
  await expect(page).toHaveURL(/\/member/);
});

test("BB-OTP cross-tenant verification does not sign in", async ({ page }, testInfo) => {
  hold(testInfo, "BB-OTP-CROSS-TENANT");
  await signIn(page);
  await page.goto(process.env.E2E_BB_OTHER_TENANT_VERIFY_PATH || "/member/login/verify");
  await page.locator("input[name='otp_code']").fill(process.env.E2E_BB_OTP_CODE || "");
  await page.locator("button[type='submit']").first().click();
  await expect(page).not.toHaveURL(/\/member$/);
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => /sid/.test(cookie.name))).toBe(false);
});
