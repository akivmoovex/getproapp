"use strict";

/**
 * D159 browser journeys. Implemented, not executed.
 * They fail closed unless disposable browser authorization is present.
 * The live-mailbox test stays closed unless a separate mailbox flag is set.
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
  page._d159Errors = errors;
  await installLocalOnlyRoutes(page, process.env.PLAYWRIGHT_E2E_PORT || "4187");
});

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required for the authorized browser journey`);
  return value;
}

test("AC-PAT-01 staff patient form rejects a missing name", async ({ page }, testInfo) => {
  hold(testInfo, "AC-PAT-01");
  await page.goto("/login");
  await page.locator("input[name='login_email']").fill(required("E2E_AC_ADMIN_EMAIL"));
  await page.locator("input[name='password']").fill(required("E2E_AC_ADMIN_PASSWORD"));
  await page.locator("form").filter({ has: page.locator("input[name='login_email']") }).locator("button[type='submit']").click();
  await page.goto(required("E2E_AC_PATIENT_NEW_PATH"));
  await page.locator("input[name='last_name']").fill("Member");
  await page.locator("button[type='submit']").click();
  await expect(page.getByText(/name|required/i)).toBeVisible();
  await expect(page.locator("[data-ac-patient-number]")).toHaveCount(0);
  expect(page._d159Errors).toEqual([]);
});

test("INV-01 invitation acceptance rejects a short password", async ({ page }, testInfo) => {
  hold(testInfo, "INV-01");
  await page.goto(required("E2E_BB_INVITE_ACCEPT_PATH"));
  await page.locator("input[name='password']").fill("short");
  await page.locator("input[name='password_confirm']").fill("short");
  await page.locator("button[type='submit']").click();
  await expect(page.getByText(/password/i)).toBeVisible();
  await expect(page.locator("input[name='password']")).toHaveValue("");
  expect(page._d159Errors).toEqual([]);
});

test("BB-06 member record remains after reload", async ({ page }, testInfo) => {
  hold(testInfo, "BB-06");
  await page.goto("/login");
  await page.locator("input[name='login_email']").fill(required("E2E_BB_ADMIN_EMAIL"));
  await page.locator("input[name='password']").fill(required("E2E_BB_ADMIN_PASSWORD"));
  await page.locator("form").filter({ has: page.locator("input[name='login_email']") }).locator("button[type='submit']").click();
  const stamp = `D159 Member ${Date.now()}`;
  await page.goto(required("E2E_BB_MEMBER_NEW_PATH"));
  await page.locator("input[name='full_name']").fill(stamp);
  await page.locator("button[type='submit']").click();
  await page.reload();
  await expect(page.getByText(stamp)).toBeVisible();
  await page.goto(required("E2E_BB_OTHER_CHURCH_MEMBERS_PATH"));
  await expect(page.getByText(stamp)).toHaveCount(0);
  expect(page._d159Errors).toEqual([]);
});

test("D14C-LIVE mailbox login stays closed in this stage", async ({ page }, testInfo) => {
  if (process.env.GETPRO_V13_OTP_LIVE_MAILBOX !== "1") {
    testInfo.annotations.push({ type: "v13-result", description: "NOT_RUN" });
    throw new Error("NOT_RUN: live mailbox journey waits for a separate mailbox authorization");
  }
  hold(testInfo, "D14C-LIVE");
  await page.goto(required("E2E_BB_MEMBER_LOGIN_PATH"));
  await page.locator("input[name='member_number']").fill(required("E2E_BB_MEMBER_NUMBER"));
  await page.locator("input[name='password']").fill(required("E2E_BB_MEMBER_PASSWORD"));
  await page.locator("button[type='submit']").click();
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => /session/i.test(cookie.name))).toBe(false);
  await expect(page.locator("input[name='otp_code'], input[name='verification_code']")).toBeVisible();
  expect(page._d159Errors).toEqual([]);
});
