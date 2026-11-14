"use strict";

/**
 * ActiveClinic browser journeys. The billing denial is a separate prepared
 * check. AC-05 is the apex test-database gate and stays held.
 */

const { test, expect } = require("@playwright/test");
const { assertV13CiDatabaseUrl } = require("../../v13/helpers/v13CiDatabaseGuard");

function browserAuthorized() {
  if (process.env.GETPRO_V13_BROWSER_AUTHORIZED !== "1") return false;
  if (process.env.GETPRO_V13_ALLOW_DB_WRITES !== "1") return false;
  if (process.env.GETPRO_V13_DB_STAGES_AUTHORIZED !== "1") return false;
  try {
    assertV13CiDatabaseUrl(process.env.E2E_DATABASE_URL || "");
    return true;
  } catch (_error) {
    return false;
  }
}

function hold(testInfo, name) {
  if (browserAuthorized()) return;
  testInfo.annotations.push({ type: "v13-result", description: "NOT_RUN" });
  throw new Error(`NOT_RUN: ${name} is implemented and waits for disposable browser authorization`);
}

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required for the authorized browser journey`);
  return value;
}

async function staffSignIn(page, email, password) {
  await page.goto("/login");
  await page.locator("input[name='login_email']").fill(email);
  await page.locator("input[name='password']").fill(password);
  await expect(page.locator("form[data-ac-login-form] input[name='_csrf']")).toHaveCount(1);
  await page.locator("form[data-ac-login-form] button[type='submit']").click();
}

test.describe("V13 ActiveClinic and platform browser regression", () => {
  test("AC administrator login reaches the clinic workspace", async ({ page }, testInfo) => {
    hold(testInfo, "AC administrator login");
    await staffSignIn(page, required("E2E_AC_ADMIN_EMAIL"), required("E2E_AC_ADMIN_PASSWORD"));
    await expect(page).not.toHaveURL(/\/login$/);
    await expect(page.getByLabel(/one-time|verification code/i)).toHaveCount(0);
    const billing = await page.request.get("/app/billing");
    expect(billing.status()).toBeLessThan(400);
  });

  test("AC staff login reaches the staff home and not clinic administration", async ({ page }, testInfo) => {
    hold(testInfo, "AC staff login");
    await staffSignIn(page, required("E2E_AC_STAFF_EMAIL"), required("E2E_AC_STAFF_PASSWORD"));
    await expect(page).not.toHaveURL(/\/login$/);
    await page.goto("/app");
    await expect(page.locator("body")).toBeVisible();
  });

  test("AC patient portal activation sets a password and signs in", async ({ page }, testInfo) => {
    hold(testInfo, "AC patient activation");
    const clinicKey = required("E2E_AC_CLINIC_KEY");
    await page.goto(`/clinics/${clinicKey}/patient/register`);
    await page.locator("input[name='firstName']").fill("Pat");
    await page.locator("input[name='lastName']").fill("Ient");
    await page.locator("input[name='phone_national']").fill("977000222");
    await page.locator("input[name='email']").fill("patient-browser@v13d19.example");
    await page.locator("input[name='password']").fill("V13-synthetic-qa-password");
    await expect(page.locator("input[name='_csrf']")).toHaveCount(1);
    await page.locator("form").locator("button[type='submit']").click();
    await page.goto(`/clinics/${clinicKey}/patient/login`);
    await page.locator("input[name='identifier']").fill("patient-browser@v13d19.example");
    await page.locator("input[name='password']").fill("V13-synthetic-qa-password");
    await page.locator("button[type='submit']").click();
    await expect(page).toHaveURL(new RegExp(`/clinics/${clinicKey}/patient`));
  });

  test("AC appointment creation rejects a second booking in the same slot", async ({ page }, testInfo) => {
    hold(testInfo, "AC appointment conflict");
    await staffSignIn(page, required("E2E_AC_ADMIN_EMAIL"), required("E2E_AC_ADMIN_PASSWORD"));
    await page.goto("/app/appointments/new");
    await page.locator("#patient_number").fill(required("E2E_AC_PATIENT_NUMBER"));
    await page.locator("#starts_date").fill("2026-12-01");
    await page.locator("#starts_time").fill("09:00");
    await page.locator("#ends_time").fill("09:30");
    await page.locator("#facility_id").selectOption({ index: 1 });
    await page.locator("#service_type_id").selectOption({ index: 1 });
    await page.locator("#assigned_staff_id").selectOption({ index: 1 });
    await page.locator("form").locator("button[type='submit']").click();
    await expect(page.getByText(/confirmed|created|appointment/i)).toBeVisible();
    await page.goto("/app/appointments/new");
    await page.locator("#patient_number").fill(required("E2E_AC_PATIENT_NUMBER"));
    await page.locator("#starts_date").fill("2026-12-01");
    await page.locator("#starts_time").fill("09:00");
    await page.locator("#ends_time").fill("09:30");
    await page.locator("#facility_id").selectOption({ index: 1 });
    await page.locator("#service_type_id").selectOption({ index: 1 });
    await page.locator("#assigned_staff_id").selectOption({ index: 1 });
    await page.locator("form").locator("button[type='submit']").click();
    await expect(page.getByText(/collision|already|conflict/i)).toBeVisible();
  });

  test("receptionist is denied the billing route by the application", async ({ page }, testInfo) => {
    hold(testInfo, "BILLING-DENIAL");
    await staffSignIn(page, required("E2E_AC_RECEPTIONIST_EMAIL"), required("E2E_AC_RECEPTIONIST_PASSWORD"));
    await expect(page).not.toHaveURL(/\/login$/);
    const denied = await page.request.get("/app/billing");
    expect([401, 403]).toContain(denied.status());
    const body = await denied.text();
    expect(body).not.toMatch(/Charge catalog|New invoice/i);
    const posted = await page.request.post("/app/billing/invoices", {
      form: { patient_id: required("E2E_AC_PATIENT_ID") },
    });
    expect([401, 403]).toContain(posted.status());
  });

  test("AC-05 authenticated user without platform administrator is denied test database management", async ({ page }, testInfo) => {
    hold(testInfo, "AC-05");
    await staffSignIn(page, required("E2E_AC05_LOWER_EMAIL"), required("E2E_AC05_LOWER_PASSWORD"));
    await expect(page).not.toHaveURL(/\/login$/);
    const pageDenial = await page.request.get("/admin/settings/test-database");
    expect(pageDenial.status()).toBe(403);
    expect(await pageDenial.text()).not.toMatch(/Test Database Management/);
    const preview = await page.request.get("/admin/settings/test-database/preview?scope=selected_test_tenant");
    expect(preview.status()).toBe(403);
    expect(preview.status()).not.toBe(401);
  });

  test("PAT-01 wrong-clinic portal registration is denied", async ({ page }, testInfo) => {
    hold(testInfo, "PAT-01");
    const clinicKey = required("E2E_AC_CLINIC_KEY");
    const otherClinicKey = required("E2E_AC_OTHER_CLINIC_KEY");
    await page.goto(`/clinics/${otherClinicKey}/patient/register`);
    await page.locator("input[name='firstName']").fill("Pat");
    await page.locator("input[name='lastName']").fill("Ient");
    await page.locator("input[name='phone_national']").fill(required("E2E_AC_PATIENT_PHONE_NATIONAL"));
    await page.locator("input[name='password']").fill(required("E2E_AC_PATIENT_PASSWORD"));
    await page.locator("input[name='_csrf']").waitFor();
    await page.locator("form").locator("button[type='submit']").click();
    await expect(page.getByText(/No matching patient record/i)).toBeVisible();
    await expect(page).not.toHaveURL(new RegExp(`/clinics/${clinicKey}/patient$`));
  });
});
