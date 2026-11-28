"use strict";

/**
 * Patient login OTP with the observer flag and no delivery provider.
 * Staff can still create the chart. The patient session stays closed.
 */

const { test, expect } = require("@playwright/test");
const { installLocalOnlyRoutes } = require("../../v13/helpers/v13BrowserIsolation");

const PASSWORD = "V13-G333-patient-closed-9!";

function hold(testInfo, name) {
  if (
    process.env.GETPRO_V13_BROWSER_AUTHORIZED !== "1" ||
    process.env.GETPRO_V13_ALLOW_DB_WRITES !== "1" ||
    process.env.GETPRO_V13_DB_STAGES_AUTHORIZED !== "1" ||
    process.env.GETPRO_AC_PATIENT_LOGIN_OTP_OBSERVER !== "1" ||
    process.env.GETPRO_OTP_PROVIDER === "qa-observer"
  ) {
    testInfo.annotations.push({ type: "v13-result", description: "NOT_RUN" });
    throw new Error(`NOT_RUN: ${name} waits for patient OTP without a provider`);
  }
}

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

test("missing provider keeps the patient portal closed after a correct password", async ({ page }, testInfo) => {
  hold(testInfo, "PATIENT-OTP-CLOSED");
  await installLocalOnlyRoutes(page, process.env.PLAYWRIGHT_E2E_PORT || "4193");
  const clinicKey = required("E2E_AC_CLINIC_KEY");
  const stamp = Date.now();
  const phone = `93${String(stamp).slice(-7)}`;
  const email = `g333-patient-closed-${stamp}@example.invalid`;
  await page.goto("/login");
  await page.locator("input[name='login_email']").fill(required("E2E_AC_ADMIN_EMAIL"));
  await page.locator("input[name='password']").fill(required("E2E_AC_ADMIN_PASSWORD"));
  await page.locator("form[data-ac-login-form] button[type='submit']").click();
  await expect(page).toHaveURL(/\/app/);
  await page.goto("/app/patients/new");
  await page.getByRole("button", { name: /None of these/ }).click();
  await page.locator("input[name='first_name']").fill("Closed");
  await page.locator("input[name='last_name']").fill(`Patient${String(stamp).slice(-4)}`);
  await page.locator("select[name='sex_at_registration']").selectOption("female");
  await page.locator("input[name='date_of_birth']").fill("1994-07-17");
  await page.locator("input[name='phone_national']").fill(phone);
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Create patient" }).click();
  await expect(page.locator("[data-ac-patient-number='1']")).toBeVisible();
  await page.context().clearCookies();
  await page.goto(`/clinics/${clinicKey}/patient/register`);
  await page.locator("input[name='firstName']").fill("Closed");
  await page.locator("input[name='lastName']").fill(`Patient${String(stamp).slice(-4)}`);
  await page.locator("input[name='phone_national']").fill(phone);
  await page.locator("input[name='email']").fill(email);
  await page.locator("input[name='password']").fill(PASSWORD);
  await page.locator("form:has(input[name='firstName']) button[type='submit']").click();
  await expect(page).toHaveURL(new RegExp(`/clinics/${clinicKey}/patient/login`));
  await page.locator("input[name='identifier']").fill(email);
  await page.locator("input[name='password']").fill(PASSWORD);
  await page.locator("form:has(input[name='password']) button[type='submit']").click();
  await expect(page.locator(".ac-patient-alert--error")).toHaveText("Sign-in is temporarily unavailable.");
  await expect(page.locator("#identifier-error")).toHaveCount(0);
  await expect(page.locator("[data-ac-otp-required='1']")).toHaveCount(0);
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => /sid/i.test(cookie.name) && cookie.value)).toBe(false);
  const portal = await page.request.get(`/clinics/${clinicKey}/patient`, { maxRedirects: 0 });
  expect(portal.status()).toBeGreaterThanOrEqual(300);
});
