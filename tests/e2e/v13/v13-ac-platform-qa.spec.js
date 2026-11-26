"use strict";

/**
 * ActiveClinic browser journeys. The billing denial is a separate prepared
 * check. AC-05 is the apex test-database gate and stays held.
 */

const { test, expect } = require("@playwright/test");
const {
  assertV13BrowserHarness,
  installLocalOnlyRoutes,
  openIsolatedContext,
  createAuthorizedPgClient,
} = require("../../v13/helpers/v13BrowserIsolation");

function hold(testInfo, name) {
  if (
    process.env.GETPRO_V13_BROWSER_AUTHORIZED !== "1" ||
    process.env.GETPRO_V13_ALLOW_DB_WRITES !== "1" ||
    process.env.GETPRO_V13_DB_STAGES_AUTHORIZED !== "1"
  ) {
    testInfo.annotations.push({ type: "v13-result", description: "NOT_RUN" });
    throw new Error(`NOT_RUN: ${name} is implemented and waits for disposable browser authorization`);
  }
  assertV13BrowserHarness(process.env, { fallbackPort: "4187" });
}

test.beforeEach(async ({ page }) => {
  await installLocalOnlyRoutes(page, process.env.PLAYWRIGHT_E2E_PORT || "4187");
});

test.afterEach(async () => {
  const email = String(process.env.E2E_AC_ADMIN_EMAIL || "").trim();
  if (!email) return;
  await restoreSyntheticPassword(email);
});

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required for the authorized browser journey`);
  return value;
}

async function restoreSyntheticPassword(email) {
  const client = createAuthorizedPgClient(process.env, (options) => {
    const { Client } = require("pg");
    return new Client(options);
  });
  await client.connect();
  try {
    const { setPlatformIdentityPassword } = require("../../../src/platform/services/platformIdentityCredentialService");
    const found = await client.query(
      "SELECT id FROM platform.identities WHERE email_normalized = $1",
      [String(email || "").trim().toLowerCase()]
    );
    if (found.rowCount !== 1) {
      throw new Error("synthetic identity was not found for password restoration");
    }
    const updated = await setPlatformIdentityPassword(client, {
      identityId: found.rows[0].id,
      password: required("E2E_AC_ADMIN_PASSWORD"),
    });
    if (!updated.ok) throw new Error(`password restoration failed: ${updated.code}`);
  } finally {
    await client.end();
  }
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
    await page.locator("form:has(#patient_number) button[type='submit']").click();
    const confirmBooking = page.getByRole("button", { name: "Confirm booking" });
    if (await confirmBooking.isVisible().catch(() => false)) await confirmBooking.click();
    await expect(page.getByText(/confirmed|created|appointment/i).first()).toBeVisible();
    await page.goto("/app/appointments/new");
    await page.locator("#patient_number").fill(required("E2E_AC_PATIENT_NUMBER"));
    await page.locator("#starts_date").fill("2026-12-01");
    await page.locator("#starts_time").fill("09:00");
    await page.locator("#ends_time").fill("09:30");
    await page.locator("#facility_id").selectOption({ index: 1 });
    await page.locator("#service_type_id").selectOption({ index: 1 });
    await page.locator("#assigned_staff_id").selectOption({ index: 1 });
    await page.locator("form:has(#patient_number) button[type='submit']").click();
    const confirmCollision = page.getByRole("button", { name: "Confirm booking" });
    if (await confirmCollision.isVisible().catch(() => false)) await confirmCollision.click();
    await expect(page.getByText(/collision|already|conflict|not available/i).first()).toBeVisible();
  });

  test("G13 receptionist is denied the practitioner worklist", async ({ page }, testInfo) => {
    hold(testInfo, "G13");
    await staffSignIn(page, required("E2E_AC_RECEPTIONIST_EMAIL"), required("E2E_AC_RECEPTIONIST_PASSWORD"));
    await expect(page).not.toHaveURL(/\/login$/);
    const denied = await page.request.get("/app/clinical");
    expect([401, 403]).toContain(denied.status());
    const body = await denied.text();
    expect(body).not.toMatch(/Practitioner worklist/);
  });

  test("G05 receptionist is denied clinical documents", async ({ page }, testInfo) => {
    hold(testInfo, "G05");
    await staffSignIn(page, required("E2E_AC_RECEPTIONIST_EMAIL"), required("E2E_AC_RECEPTIONIST_PASSWORD"));
    await expect(page).not.toHaveURL(/\/login$/);
    const denied = await page.request.get(
      "/app/clinical/patients/00000000-0000-4000-8000-000000000099/documents"
    );
    expect([401, 403]).toContain(denied.status());
    const body = await denied.text();
    expect(body).not.toMatch(/Clinical Documents/);
  });

  test("G04 receptionist is denied the pharmacy dashboard", async ({ page }, testInfo) => {
    hold(testInfo, "G04");
    await staffSignIn(page, required("E2E_AC_RECEPTIONIST_EMAIL"), required("E2E_AC_RECEPTIONIST_PASSWORD"));
    await expect(page).not.toHaveURL(/\/login$/);
    const denied = await page.request.get("/app/pharmacy");
    expect([401, 403]).toContain(denied.status());
    const body = await denied.text();
    expect(body).not.toMatch(/Prescription queue, inventory, and dispensing/);
  });

  test("G03 receptionist is denied the laboratory queue", async ({ page }, testInfo) => {
    hold(testInfo, "G03");
    await staffSignIn(page, required("E2E_AC_RECEPTIONIST_EMAIL"), required("E2E_AC_RECEPTIONIST_PASSWORD"));
    await expect(page).not.toHaveURL(/\/login$/);
    const denied = await page.request.get("/app/diagnostics/laboratory/queue");
    expect([401, 403]).toContain(denied.status());
    const body = await denied.text();
    expect(body).not.toMatch(/Laboratory orders/);
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
    expect([403, 404]).toContain(pageDenial.status());
    expect(await pageDenial.text()).not.toMatch(/Test Database Management/);
    const preview = await page.request.get("/admin/settings/test-database/preview?scope=selected_test_tenant");
    expect([403, 404]).toContain(preview.status());
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
    await page.locator("input[name='_csrf']").waitFor({ state: "attached" });
    await page.locator("form:has(input[name='firstName']) button[type='submit']").click();
    await expect(page.getByText(/No matching patient record/i).first()).toBeVisible();
    await expect(page).not.toHaveURL(new RegExp(`/clinics/${clinicKey}/patient$`));
  });

  test("AC-AUTH-04 forgot password hides the reset link and signs in after the testing reset", async ({ page }, testInfo) => {
    hold(testInfo, "AC-AUTH-04");
    const email = required("E2E_AC_ADMIN_EMAIL");
    await page.goto("/reset-password/not-a-valid-token");
    await expect(page.getByText(/invalid|expired|unavailable/i)).toBeVisible();
    await expect(page.getByText("Your password has been updated")).toHaveCount(0);
    await page.goto("/forgot-password");
    const identifier = page.locator("input[name='identifier']:visible, input[name='phone_national']:visible").first();
    await identifier.fill(email);
    await page.locator("button[type='submit']").click();
    await expect(page).toHaveURL(/\/forgot-password\/check/);
    await expect(page.locator("body")).not.toContainText("/reset-password/");
    const delivery = await page.request.get(
      `/__platform/qa/activeclinic-password-reset-delivery?identifier=${encodeURIComponent(email)}`
    );
    expect(delivery.status()).toBe(200);
    const body = await delivery.json();
    const token = String(body.resetUrl || "").split("/reset-password/")[1].split(/[?#]/)[0];
    expect(token).toBeTruthy();
    await expect(page.locator("body")).not.toContainText(token);
    await page.goto(`/reset-password/${token}`);
    await page.locator("input[name='password']").fill("Clinic-Recover-13!");
    await page.locator("input[name='password_confirm']").fill("Clinic-Different-13!");
    await page.locator("button[type='submit']").click();
    await expect(page.getByText(/do not match/i)).toBeVisible();
    await page.locator("input[name='password']").fill("Clinic-Recover-13!");
    await page.locator("input[name='password_confirm']").fill("Clinic-Recover-13!");
    await page.locator("button[type='submit']").click();
    await expect(page.getByText("Your password has been updated")).toBeVisible();
    await page.goto(`/reset-password/${token}`);
    await expect(page.getByText(/already been used|not valid|expired|revoked/i)).toBeVisible();
    await expect(page.getByText("Your password has been updated")).toHaveCount(0);
    await page.goto("/login");
    const loginId = page.locator("input[name='login_email']:visible, input[name='identifier']:visible").first();
    await loginId.fill(email);
    await page.locator("input[name='password']:visible").first().fill("Clinic-Recover-13!");
    await page.locator("form button[type='submit']").first().click();
    await expect(page).not.toHaveURL(/\/login$/);
    await expect(page.locator("[data-ac-shell='staff-app']")).toBeVisible();
    await restoreSyntheticPassword(email);
  });

  test("AC-REG-01 duplicate clinic phone denies a mismatched password and allows credential reuse", async ({ page }, testInfo) => {
    hold(testInfo, "AC-REG-01");
    const stamp = Date.now();
    const phone = `97${String(stamp).slice(-7)}`;
    const password = "clinic-admin-pass-12";
    await submitClinicRegistration(page, {
      clinicName: `D04 Clinic ${stamp}`,
      clinicType: "clinic",
      countryCode: "ZM",
      city: "Lusaka",
      contactName: "D04 Admin",
      contactEmail: `d04-clinic-${stamp}@example.invalid`,
      phone_national: phone,
      password,
      passwordConfirm: password,
    });
    await expect(page).toHaveURL(/\/app|submitted|status/i);
    await submitClinicRegistration(page, {
      clinicName: `D04 Clinic Denied ${stamp}`,
      clinicType: "clinic",
      countryCode: "ZM",
      city: "Lusaka",
      contactName: "D04 Denied",
      contactEmail: `d04-denied-${stamp}@example.invalid`,
      phone_national: phone,
      password: "wrong-password-not-matching",
      passwordConfirm: "wrong-password-not-matching",
    });
    await expect(page.getByText(/already registered|already exists|password does not match|email or phone/i).first()).toBeVisible();
    await expect(page).not.toHaveURL(/\/app(\/|$)/);
    await submitClinicRegistration(page, {
      clinicName: `D04 Clinic Reused ${stamp}`,
      clinicType: "clinic",
      countryCode: "ZM",
      city: "Lusaka",
      contactName: "D04 Reused",
      contactEmail: `d04-reused-${stamp}@example.invalid`,
      phone_national: phone,
      password,
      passwordConfirm: password,
    });
    await expect(page).toHaveURL(/\/app|submitted|status/i);
    await expect(page.getByText(/password does not match/i)).toHaveCount(0);
  });

  test("AC-WEB-08 website section is drafted, previewed, published, and isolated", async ({ page, browser }, testInfo) => {
    hold(testInfo, "AC-WEB-08");
    const stamp = Date.now();
    const heading = `D05 section ${stamp}`;
    const email = `d05-web-${stamp}@example.invalid`;
    const password = "clinic-admin-pass-12";
    await submitClinicRegistration(page, {
      clinicName: `D05 Web ${stamp}`,
      clinicType: "clinic",
      countryCode: "ZM",
      city: "Lusaka",
      contactName: "D05 Admin",
      contactEmail: email,
      phone_national: `97${String(stamp).slice(-7)}`,
      password,
      passwordConfirm: password,
    });
    if (!/\/app/.test(page.url())) await staffSignIn(page, email, password);
    await page.goto("/app/settings/website/sections");
    await page.locator("[data-ac-mw-open='ac-mw-add-section']").click();
    await page.locator("#ac-mw-add-section input[name='type'][value='text']").check();
    await page.locator("#ac-mw-add-section button[type='submit']").click();
    await page.locator("[data-ac-section-id] a", { hasText: "Settings" }).last().click();
    await page.locator("input[name='heading']").fill(heading);
    await page.locator("textarea[name='body']").fill("Draft section body");
    await page.locator("input[name='visible']").check();
    await page.locator("button[type='submit']", { hasText: "Save Changes" }).click();
    const previewHref = await page.locator("a[href*='website_mode=draft']").first().getAttribute("href");
    expect(previewHref).toBeTruthy();
    await page.goto(previewHref);
    await expect(page.locator("body")).toContainText(heading);
    const liveHref = previewHref.split("?")[0];
    await page.goto(liveHref);
    await expect(page.locator("body")).not.toContainText(heading);
    await page.goto("/app/settings/website/publish");
    const publishedResponse = page.waitForResponse((response) =>
      response.url().includes("/website/publish") && response.request().method() === "POST"
    );
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("[data-ac-website-action='publish']").click();
    const published = await publishedResponse;
    expect(published.ok() || (published.status() >= 300 && published.status() < 400)).toBeTruthy();
    await page.goto(liveHref);
    await expect(page.locator("body")).toContainText(heading);
    const other = await openIsolatedContext(browser, process.env.PLAYWRIGHT_E2E_PORT || "4187");
    const otherPage = await other.newPage();
    await submitClinicRegistration(otherPage, {
      clinicName: `D05 Other ${stamp}`,
      clinicType: "clinic",
      countryCode: "ZM",
      city: "Kitwe",
      contactName: "D05 Other",
      contactEmail: `d05-other-${stamp}@example.invalid`,
      phone_national: `96${String(stamp).slice(-7)}`,
      password,
      passwordConfirm: password,
    });
    await page.goto("/app/settings/website/sections");
    const sectionHref = await page.locator("[data-ac-section-id] a", { hasText: "Settings" }).last().getAttribute("href");
    await otherPage.goto(sectionHref);
    await expect(otherPage.locator("body")).not.toContainText(heading);
    await other.close();
  });

  test("AC-WEB-09 selected clinic theme is previewed, published, and cross-product themes are absent", async ({ page }, testInfo) => {
    hold(testInfo, "AC-WEB-09");
    await staffSignIn(page, required("E2E_AC_ADMIN_EMAIL"), required("E2E_AC_ADMIN_PASSWORD"));
    await page.goto("/app/settings/website/themes");
    await expect(page.locator("[data-theme-id='ac.family-wellness-mint']").first()).toBeVisible();
    await expect(page.locator("[data-theme-id='bb.community']")).toHaveCount(0);
    await expect(page.locator("[data-theme-id='bb.contemporary-fellowship']")).toHaveCount(0);
    const api = await page.locator("[data-theme-api]").getAttribute("data-theme-api");
    const token = await page.locator("input[name='_csrf']").first().inputValue();
    const rejected = await page.request.post(api, {
      data: { themeId: "bb.community", _csrf: token },
    });
    expect(rejected.status()).toBe(400);
    expect(await rejected.text()).toMatch(/invalid_theme/);
    const applied = await page.request.post(api, {
      data: { themeId: "ac.family-wellness-mint", _csrf: token },
    });
    expect(applied.status()).toBe(200);
    expect(await applied.json()).toMatchObject({ published: false, themeId: "ac.family-wellness-mint" });
    const clinicKey = required("E2E_AC_CLINIC_KEY");
    await page.goto(`/clinics/${clinicKey}?website_mode=draft`);
    expect(await page.content()).toMatch(/gp-website-theme--ac-family-wellness-mint/);
    await page.goto("/app/settings/website/publish");
    const publishedResponse = page.waitForResponse((response) =>
      response.url().includes("/website/publish") && response.request().method() === "POST"
    );
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("[data-ac-website-action='publish']").click();
    const published = await publishedResponse;
    expect(published.ok() || (published.status() >= 300 && published.status() < 400)).toBeTruthy();
    await page.goto(`/clinics/${clinicKey}`);
    await expect(page.locator(".gp-website-theme--ac-family-wellness-mint")).toHaveCount(1);
  });

  test("AC-REC-02 walk-in uses the clinic service point and stays in that clinic", async ({ page, browser }, testInfo) => {
    hold(testInfo, "AC-REC-02");
    await staffSignIn(page, required("E2E_AC_RECEPTIONIST_EMAIL"), required("E2E_AC_RECEPTIONIST_PASSWORD"));
    const stamp = Date.now();
    await page.goto("/app/patients/new");
    await page.getByRole("button", { name: /None of these/ }).click();
    await page.locator("input[name='first_name']").fill("D05");
    await page.locator("input[name='last_name']").fill(`Walker${String(stamp).slice(-6)}`);
    await page.locator("select[name='sex_at_registration']").selectOption("female");
    await page.locator("input[name='date_of_birth']").fill("1992-04-04");
    await page.locator("input[name='phone_national']").fill(`97${String(stamp).slice(-7)}`);
    await page.getByRole("button", { name: "Review" }).click();
    await page.getByRole("button", { name: "Create patient" }).click();
    await expect(page.getByText("Patient created")).toBeVisible();
    const number = (await page.locator("[data-ac-patient-number='1']").innerText()).trim();
    expect(number).toMatch(/^AC-[0-9]{4}-[0-9]{6}$/);
    await page.goto("/app/reception/walk-in");
    await expect(page.locator("select[name='service_point_id']")).toBeVisible();
    const serviceName = await page.locator("select[name='service_point_id'] option").nth(1).innerText();
    const serviceId = await page.locator("select[name='service_point_id'] option").nth(1).getAttribute("value");
    await page.locator("input[name='patient_number']").fill(number);
    await page.locator("select[name='service_point_id']").selectOption(serviceId);
    await page.locator("form[data-ac-form='reception-walk-in'] button[type='submit']").click();
    await expect(page).toHaveURL(/\/app\/reception\/queue\//);
    await expect(page.locator("body")).toContainText(number);
    await expect(page.locator("body")).toContainText(serviceName.trim());
    const other = await openIsolatedContext(browser, process.env.PLAYWRIGHT_E2E_PORT || "4187");
    const otherPage = await other.newPage();
    await otherPage.goto("/login");
    await expect(otherPage.locator("body")).not.toContainText(serviceId);
    await other.close();
  });

  test("AC-REC-03 clinical staff record heart rate and an unauthorized session cannot change it", async ({ page, browser }, testInfo) => {
    hold(testInfo, "AC-REC-03");
    await staffSignIn(page, required("E2E_AC_ADMIN_EMAIL"), required("E2E_AC_ADMIN_PASSWORD"));
    const stamp = Date.now();
    await page.goto("/app/patients/new");
    await page.getByRole("button", { name: /None of these/ }).click();
    await page.locator("input[name='first_name']").fill("D05");
    await page.locator("input[name='last_name']").fill(`Vitals${String(stamp).slice(-6)}`);
    await page.locator("select[name='sex_at_registration']").selectOption("male");
    await page.locator("input[name='date_of_birth']").fill("1988-08-08");
    await page.locator("input[name='phone_national']").fill(`97${String(stamp).slice(-7)}`);
    await page.getByRole("button", { name: "Review" }).click();
    await page.getByRole("button", { name: "Create patient" }).click();
    await expect(page.locator("[data-ac-patient-number='1']")).toBeVisible();
    const number = (await page.locator("[data-ac-patient-number='1']").innerText()).trim();
    const client = createAuthorizedPgClient(process.env, (options) => {
      const { Client } = require("pg");
      return new Client(options);
    });
    await client.connect();
    const found = await client.query(
      "SELECT id FROM activeclinic.patients WHERE patient_number = $1",
      [number]
    );
    await client.end();
    expect(found.rowCount).toBe(1);
    await page.goto("/app/clinical/start-encounter");
    await expect(page.getByText("Start encounter").first()).toBeVisible();
    await page.locator("input[name='patient_id']").fill(found.rows[0].id);
    await page.locator("form:has(input[name='patient_id']) button[type='submit']").click();
    await expect(page).toHaveURL(/\/app\/clinical\/encounter\//);
    const encounterUrl = page.url().split("?")[0];
    await page.goto(`${encounterUrl}/vitals`);
    await expect(page.locator("select[name='observation_type'] option[value='heart_rate']")).toHaveCount(1);
    await page.locator("select[name='observation_type']").selectOption("heart_rate");
    await page.locator("input[name='value_numeric']").fill("72");
    await page.locator("input[name='unit']").fill("bpm");
    await page.locator("form:has(input[name='value_numeric']) button[type='submit']").click();
    await expect(page).toHaveURL(/recorded=1/);
    await page.reload();
    await expect(page.locator("body")).toContainText("72 bpm");
    const correct = page.locator("form[data-ac-vital-correct='1']").first();
    await correct.locator("input[name='value_numeric']").fill("80");
    await correct.locator("input[name='correction_reason']").fill("entry error");
    await correct.locator("button[type='submit']").click();
    await expect(page).toHaveURL(/corrected=1/);
    await expect(page.locator("body")).toContainText("72 bpm");
    await expect(page.locator("body")).toContainText("80 bpm");
    await expect(page.locator("body")).toContainText("Superseded");
    const stranger = await openIsolatedContext(browser, process.env.PLAYWRIGHT_E2E_PORT || "4187");
    const strangerPage = await stranger.newPage();
    const denied = await strangerPage.request.post(`${encounterUrl}/vitals`, {
      maxRedirects: 0,
      form: { observation_type: "heart_rate", value_numeric: "140", unit: "bpm" },
    });
    const deniedStatus = denied.status();
    if (deniedStatus === 302 || deniedStatus === 303) {
      expect(String(denied.headers().location || "")).toMatch(/\/login/i);
    } else {
      expect([401, 403]).toContain(deniedStatus);
    }
    await page.reload();
    await expect(page.locator("body")).toContainText("72 bpm");
    await expect(page.locator("body")).toContainText("80 bpm");
    await expect(page.locator("body")).not.toContainText("140 bpm");
    await stranger.close();
  });

  test("AC-PUB-01 public booking stays disabled and offers no coupon", async ({ page }, testInfo) => {
    hold(testInfo, "AC-PUB-01");
    const stamp = Date.now();
    const email = `d05-book-${stamp}@example.invalid`;
    const password = "clinic-admin-pass-12";
    await submitClinicRegistration(page, {
      clinicName: `D05 Booking ${stamp}`,
      clinicType: "clinic",
      countryCode: "ZM",
      city: "Lusaka",
      contactName: "D05 Admin",
      contactEmail: email,
      phone_national: `95${String(stamp).slice(-7)}`,
      password,
      passwordConfirm: password,
    });
    if (!/\/app/.test(page.url())) await staffSignIn(page, email, password);
    await page.goto("/app/settings/website/sections");
    const previewHref = await page.locator("a[href*='website_mode=draft']").first().getAttribute("href");
    const clinicPath = String(previewHref || "").split("?")[0];
    await page.goto(`${clinicPath}/book`);
    await expect(page.getByText("Booking not available")).toBeVisible();
    await expect(page.getByText(/Online booking is not enabled/i)).toBeVisible();
    await expect(page.getByText(/does not take live bookings/i)).toBeVisible();
    await expect(page.getByText(/coupon/i)).toHaveCount(0);
    await expect(page.getByText(/appointment confirmed/i)).toHaveCount(0);
  });

  test("G66 reference rule preview is not saved", async ({ page }, testInfo) => {
    hold(testInfo, "G66");
    await staffSignIn(page, required("E2E_AC_ADMIN_EMAIL"), required("E2E_AC_ADMIN_PASSWORD"));
    await page.goto("/app/diagnostics/laboratory/reference-rules");
    await expect(page.getByText("Nothing is saved").first()).toBeVisible();
    await expect(page.locator("form[action='/app/diagnostics/laboratory/reference-rules'] input[name='_csrf']")).toHaveCount(1);
    await expect(page.locator("input[name='test_code']")).toBeVisible();
    await page.locator("form[action='/app/diagnostics/laboratory/reference-rules'] button[type='submit']").click();
    await expect(page.getByText("Nothing is saved").first()).toBeVisible();
  });

  test("G67 prescription editor explains the pharmacy queue", async ({ page }, testInfo) => {
    hold(testInfo, "G67");
    await staffSignIn(page, required("E2E_AC_STAFF_EMAIL"), required("E2E_AC_STAFF_PASSWORD"));
    const encounterId = required("E2E_AC_ENCOUNTER_ID");
    await page.goto(`/app/clinical/encounter/${encounterId}/order/prescription`);
    await expect(page.getByText("Manual entry only")).toBeVisible();
    await expect(page.getByLabel("Medication / active compound")).toBeVisible();
    await expect(page.getByText("without placing it on the pharmacy queue")).toBeVisible();
    await expect(page.locator("input[name='medication_catalogue_item_id']")).toHaveCount(1);
  });

  test("AC-FU-PORTAL-01 staff-created patient activates one record and signs in", async ({ page }, testInfo) => {
    hold(testInfo, "AC-FU-PORTAL-01");
    const stamp = Date.now();
    const lastName = `Portal${String(stamp).slice(-6)}`;
    const phone = `97${String(stamp).slice(-7)}`;
    const email = `portal-${stamp}@example.invalid`;
    const password = "V13-synthetic-qa-password";
    const clinicKey = required("E2E_AC_CLINIC_KEY");
    await staffSignIn(page, required("E2E_AC_ADMIN_EMAIL"), required("E2E_AC_ADMIN_PASSWORD"));
    await page.goto("/app/patients/new");
    await page.getByRole("button", { name: /None of these/ }).click();
    await page.locator("input[name='first_name']").fill("Portal");
    await page.locator("input[name='last_name']").fill(lastName);
    await page.locator("select[name='sex_at_registration']").selectOption("female");
    await page.locator("input[name='date_of_birth']").fill("1991-03-03");
    await page.locator("input[name='phone_national']").fill(phone);
    await page.getByRole("button", { name: "Review" }).click();
    await page.getByRole("button", { name: "Create patient" }).click();
    await expect(page.locator("[data-ac-patient-number='1']")).toBeVisible();
    const number = (await page.locator("[data-ac-patient-number='1']").innerText()).trim();
    const client = createAuthorizedPgClient(process.env, (options) => {
      const { Client } = require("pg");
      return new Client(options);
    });
    await client.connect();
    const before = await client.query(
      "SELECT count(*)::int AS n FROM activeclinic.patients WHERE patient_number = $1",
      [number]
    );
    expect(before.rows[0].n).toBe(1);
    await page.context().clearCookies();
    await page.goto(`/clinics/${clinicKey}/patient/register`);
    await page.locator("input[name='firstName']").fill("Portal");
    await page.locator("input[name='lastName']").fill(lastName);
    await page.locator("input[name='phone_national']").fill(phone);
    await page.locator("input[name='email']").fill(email);
    await page.locator("input[name='password']").fill(password);
    await page.locator("form:has(input[name='firstName']) button[type='submit']").click();
    await expect(page).toHaveURL(new RegExp(`/clinics/${clinicKey}/patient/login`));
    await page.goto(`/clinics/${clinicKey}/patient/login`);
    await page.locator("input[name='identifier']").fill(email);
    await page.locator("input[name='password']").fill(password);
    await page.locator("button[type='submit']").click();
    await expect(page).toHaveURL(new RegExp(`/clinics/${clinicKey}/patient(?:\\?|$)`));
    await expect(page.locator("body")).toContainText("Welcome back, Portal");
    await page.goto(`/clinics/${clinicKey}/patient/profile`);
    await expect(page.locator("body")).toContainText(number);
    await page.context().clearCookies();
    await page.goto(`/clinics/${clinicKey}/patient/register`);
    await page.locator("input[name='firstName']").fill("Nobody");
    await page.locator("input[name='lastName']").fill("Unknown");
    await page.locator("input[name='phone_national']").fill(`96${String(stamp).slice(-7)}`);
    await page.locator("input[name='password']").fill(password);
    await page.locator("form:has(input[name='firstName']) button[type='submit']").click();
    await expect(page.getByText(/No matching patient record/i).first()).toBeVisible();
    await expect(page.getByText(/does not create a new patient record/i).first()).toBeVisible();
    await page.goto(`/clinics/${required("E2E_AC_OTHER_CLINIC_KEY")}/patient/register`);
    await page.locator("input[name='firstName']").fill("Portal");
    await page.locator("input[name='lastName']").fill(lastName);
    await page.locator("input[name='phone_national']").fill(phone);
    await page.locator("input[name='password']").fill(password);
    await page.locator("form:has(input[name='firstName']) button[type='submit']").click();
    await expect(page.getByText(/already exists|No matching patient record/i).first()).toBeVisible();
    const after = await client.query(
      "SELECT count(*)::int AS n FROM activeclinic.patients WHERE patient_number = $1",
      [number]
    );
    expect(after.rows[0].n).toBe(1);
    await client.end();
  });

  test("AC-FU-WEB-02 new text stays private until publish and an authorized image renders", async ({ page }, testInfo) => {
    hold(testInfo, "AC-FU-WEB-02");
    const stamp = Date.now();
    const heading = `Public text ${stamp}`;
    const email = `web02-${stamp}@example.invalid`;
    const password = "clinic-admin-pass-12";
    await submitClinicRegistration(page, {
      clinicName: `Web02 ${stamp}`,
      clinicType: "clinic",
      countryCode: "ZM",
      city: "Lusaka",
      contactName: "Web02 Admin",
      contactEmail: email,
      phone_national: `95${String(stamp).slice(-7)}`,
      password,
      passwordConfirm: password,
    });
    if (!/\/app/.test(page.url())) await staffSignIn(page, email, password);
    await page.goto("/app/settings/website/sections");
    await page.locator("[data-ac-mw-open='ac-mw-add-section']").click();
    await page.locator("#ac-mw-add-section input[name='type'][value='text']").check();
    await page.locator("#ac-mw-add-section button[type='submit']").click();
    await page.locator("[data-ac-section-id] a", { hasText: "Settings" }).last().click();
    await page.locator("input[name='heading']").fill(heading);
    await page.locator("textarea[name='body']").fill("Published body text");
    await page.locator("input[name='buttonUrl']").fill("javascript:alert(1)");
    await page.locator("button[type='submit']", { hasText: "Save Changes" }).click();
    await expect(page.getByText(/not allowed/i).first()).toBeVisible();
    await page.goto("/app/settings/website/sections");
    await page.locator("[data-ac-section-id] a", { hasText: "Settings" }).last().click();
    await page.locator("input[name='heading']").fill(heading);
    await page.locator("textarea[name='body']").fill("Published body text");
    await page.locator("input[name='visible']").check();
    await page.locator("button[type='submit']", { hasText: "Save Changes" }).click();
    const previewHref = await page.locator("a[href*='website_mode=draft']").first().getAttribute("href");
    const liveHref = String(previewHref || "").split("?")[0];
    await page.goto(liveHref);
    await expect(page.locator("body")).not.toContainText(heading);
    await page.goto("/app/settings/website/publish");
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("[data-ac-website-action='publish']").click();
    await page.goto(liveHref);
    await expect(page.locator("body")).toContainText(heading);
    await expect(page.locator("body")).toContainText("Published body text");
    await page.reload();
    await expect(page.locator("body")).toContainText(heading);
    await page.goto("/app/settings/website/sections");
    await page.locator("[data-ac-mw-open='ac-mw-add-section']").click();
    await page.locator("#ac-mw-add-section input[name='type'][value='image_text']").check();
    await page.locator("#ac-mw-add-section button[type='submit']").click();
    await page.locator("[data-ac-section-id] a", { hasText: "Settings" }).last().click();
    const imageSrc = "https://example.invalid/v13-synthetic-section.png";
    await page.locator("input[name='imageSrc']").fill(imageSrc);
    await page.locator("input[name='imageAlt']").fill("Synthetic clinic image");
    await page.locator("input[name='visible']").check();
    await page.locator("button[type='submit']", { hasText: "Save Changes" }).click();
    await page.goto(liveHref);
    await expect(page.locator("img[alt='Synthetic clinic image']")).toHaveCount(0);
    await page.goto("/app/settings/website/publish");
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("[data-ac-website-action='publish']").click();
    await page.goto(liveHref);
    await expect(page.locator("img[alt='Synthetic clinic image']")).toHaveAttribute("src", imageSrc);
    await page.reload();
    await expect(page.locator("img[alt='Synthetic clinic image']")).toHaveAttribute("src", imageSrc);
  });

  test("AC-FU-REC-03 a new patient appears on the reception queue", async ({ page }, testInfo) => {
    hold(testInfo, "AC-FU-REC-03");
    await staffSignIn(page, required("E2E_AC_RECEPTIONIST_EMAIL"), required("E2E_AC_RECEPTIONIST_PASSWORD"));
    const stamp = Date.now();
    await page.goto("/app/patients/new");
    await page.getByRole("button", { name: /None of these/ }).click();
    await page.locator("input[name='first_name']").fill("Queue");
    await page.locator("input[name='last_name']").fill(`New${String(stamp).slice(-6)}`);
    await page.locator("select[name='sex_at_registration']").selectOption("female");
    await page.locator("input[name='date_of_birth']").fill("1994-04-04");
    await page.locator("input[name='phone_national']").fill(`97${String(stamp).slice(-7)}`);
    await page.getByRole("button", { name: "Review" }).click();
    await page.getByRole("button", { name: "Create patient" }).click();
    const number = (await page.locator("[data-ac-patient-number='1']").innerText()).trim();
    expect(number).toMatch(/^AC-/);
    await page.goto("/app/reception/walk-in");
    const serviceId = await page.locator("select[name='service_point_id'] option").nth(1).getAttribute("value");
    await page.locator("input[name='patient_number']").fill(number);
    await page.locator("select[name='service_point_id']").selectOption(serviceId);
    await page.locator("form[data-ac-form='reception-walk-in'] button[type='submit']").click();
    await expect(page).toHaveURL(/\/app\/reception\/queue\//);
    await expect(page.locator("body")).toContainText(number);
  });

  test("AC-FU-REC-04 an existing patient number checks in without a second chart", async ({ page }, testInfo) => {
    hold(testInfo, "AC-FU-REC-04");
    const number = required("E2E_AC_PATIENT_NUMBER");
    const clinicKey = required("E2E_AC_CLINIC_KEY");
    await staffSignIn(page, required("E2E_AC_RECEPTIONIST_EMAIL"), required("E2E_AC_RECEPTIONIST_PASSWORD"));
    const client = createAuthorizedPgClient(process.env, (options) => {
      const { Client } = require("pg");
      return new Client(options);
    });
    await client.connect();
    const scopedCount = `SELECT count(*)::int AS n
         FROM activeclinic.patients p
         JOIN platform.organizations o ON o.id = p.organization_id
        WHERE p.patient_number = $1 AND o.organization_key = $2`;
    const before = await client.query(scopedCount, [number, clinicKey]);
    await page.goto("/app/reception/walk-in");
    const serviceId = await page.locator("select[name='service_point_id'] option").nth(1).getAttribute("value");
    await page.locator("input[name='patient_number']").fill(number);
    await page.locator("select[name='service_point_id']").selectOption(serviceId);
    await page.locator("form[data-ac-form='reception-walk-in'] button[type='submit']").click();
    await expect.poll(async () => {
      if (/\/app\/reception\/queue\//.test(page.url())) return "queued";
      const text = await page.locator("body").innerText();
      return text.includes("already has an active queue entry") ? "already" : "pending";
    }).not.toBe("pending");
    if (/\/app\/reception\/queue\//.test(page.url())) {
      await expect(page.locator("body")).toContainText(number);
    }
    const after = await client.query(scopedCount, [number, clinicKey]);
    await client.end();
    expect(before.rows[0].n).toBeGreaterThan(0);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  test("AC-FU-REC-05 clinical staff can open the practitioner worklist", async ({ page }, testInfo) => {
    hold(testInfo, "AC-FU-REC-05");
    await staffSignIn(page, required("E2E_AC_STAFF_EMAIL"), required("E2E_AC_STAFF_PASSWORD"));
    await page.goto("/app/clinical");
    await expect(page.locator("body")).toContainText("Practitioner worklist");
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test("AC-FU-CLIN-01 the clinician worklist offers start encounter", async ({ page }, testInfo) => {
    hold(testInfo, "AC-FU-CLIN-01");
    await staffSignIn(page, required("E2E_AC_STAFF_EMAIL"), required("E2E_AC_STAFF_PASSWORD"));
    await page.goto("/app/clinical");
    await expect(page.locator("a[href='/app/clinical/start-encounter']").first()).toBeVisible();
    await expect(page.locator("[data-ac-action='start-encounter']").first()).toBeVisible();
  });

  test("G165 patient search reads the new chart back and logout closes it", async ({ page }, testInfo) => {
    hold(testInfo, "G165 AC search logout");
    const stamp = Date.now();
    const lastName = `Find${String(stamp).slice(-6)}`;
    await staffSignIn(page, required("E2E_AC_ADMIN_EMAIL"), required("E2E_AC_ADMIN_PASSWORD"));
    await page.goto("/app/patients/new");
    await page.getByRole("button", { name: /None of these/ }).click();
    await page.locator("input[name='first_name']").fill("Search");
    await page.locator("input[name='last_name']").fill(lastName);
    await page.locator("select[name='sex_at_registration']").selectOption("female");
    await page.locator("input[name='date_of_birth']").fill("1993-03-03");
    await page.locator("input[name='phone_national']").fill(`97${String(stamp).slice(-7)}`);
    await page.getByRole("button", { name: "Review" }).click();
    await page.getByRole("button", { name: "Create patient" }).click();
    const number = (await page.locator("[data-ac-patient-number='1']").innerText()).trim();
    expect(number).toMatch(/^AC-/);
    await page.goto(`/app/patients?patient_number=${encodeURIComponent(number)}`);
    await expect(page.locator("body")).toContainText(number);
    await expect(page.locator("body")).toContainText(lastName);
    await page.goto(`/app/patients/${encodeURIComponent(number)}`);
    await expect(page.locator("body")).toContainText(number);
    await page.reload();
    await expect(page.locator("body")).toContainText(number);
    await page.goto("/app/patients?patient_number=AC-1999-000000");
    await expect(page.locator("body")).not.toContainText(number);
    await page.goto("/logout");
    await page.goto("/app/patients");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("body")).not.toContainText(number);
  });

  test("G165 staff phone search finds the existing chart and does not create another", async ({ page }, testInfo) => {
    hold(testInfo, "G165 AC duplicate find");
    const stamp = Date.now();
    const lastName = `Dup${String(stamp).slice(-6)}`;
    const phone = `97${String(stamp).slice(-7)}`;
    await staffSignIn(page, required("E2E_AC_ADMIN_EMAIL"), required("E2E_AC_ADMIN_PASSWORD"));
    await page.goto("/app/patients/new");
    await page.getByRole("button", { name: /None of these/ }).click();
    await page.locator("input[name='first_name']").fill("Duplicate");
    await page.locator("input[name='last_name']").fill(lastName);
    await page.locator("select[name='sex_at_registration']").selectOption("male");
    await page.locator("input[name='date_of_birth']").fill("1988-08-08");
    await page.locator("input[name='phone_national']").fill(phone);
    await page.getByRole("button", { name: "Review" }).click();
    await page.getByRole("button", { name: "Create patient" }).click();
    const number = (await page.locator("[data-ac-patient-number='1']").innerText()).trim();
    expect(number).toMatch(/^AC-/);
    const client = createAuthorizedPgClient(process.env, (options) => {
      const { Client } = require("pg");
      return new Client(options);
    });
    await client.connect();
    const before = await client.query(
      "SELECT count(*)::int AS n FROM activeclinic.patients WHERE patient_number = $1",
      [number]
    );
    expect(before.rows[0].n).toBe(1);
    await page.goto("/app/patients/new");
    await page.locator("input[name='find_phone']").fill(phone);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.locator("[data-ac-find-matches='1']")).toContainText(number);
    await expect(page.locator("[data-ac-find-matches='1']")).toContainText(lastName);
    await page.locator("[data-ac-find-matches='1'] a", { hasText: "Open patient" }).click();
    await expect(page.locator("body")).toContainText(number);
    await page.reload();
    await expect(page.locator("body")).toContainText(number);
    await page.goto("/app/patients/new");
    await page.locator("input[name='find_phone']").fill("960000000");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.locator("[data-ac-find-matches='1']")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(number);
    const after = await client.query(
      "SELECT count(*)::int AS n FROM activeclinic.patients WHERE patient_number = $1",
      [number]
    );
    expect(after.rows[0].n).toBe(1);
    await client.end();
  });

  test("G168 consultation draft is signed on complete and another clinic cannot change it", async ({ page, browser }, testInfo) => {
    hold(testInfo, "G168 consultation");
    const stamp = Date.now();
    const complaint = `Complaint ${stamp}`;
    const lastName = `Note${String(stamp).slice(-6)}`;
    await staffSignIn(page, required("E2E_AC_ADMIN_EMAIL"), required("E2E_AC_ADMIN_PASSWORD"));
    await page.goto("/app/patients/new");
    await page.getByRole("button", { name: /None of these/ }).click();
    await page.locator("input[name='first_name']").fill("Consult");
    await page.locator("input[name='last_name']").fill(lastName);
    await page.locator("select[name='sex_at_registration']").selectOption("female");
    await page.locator("input[name='date_of_birth']").fill("1990-01-09");
    await page.locator("input[name='phone_national']").fill(`97${String(stamp).slice(-7)}`);
    await page.getByRole("button", { name: "Review" }).click();
    await page.getByRole("button", { name: "Create patient" }).click();
    const number = (await page.locator("[data-ac-patient-number='1']").innerText()).trim();
    expect(number).toMatch(/^AC-/);
    const client = createAuthorizedPgClient(process.env, (options) => {
      const { Client } = require("pg");
      return new Client(options);
    });
    await client.connect();
    const found = await client.query(
      "SELECT id FROM activeclinic.patients WHERE patient_number = $1",
      [number]
    );
    expect(found.rowCount).toBe(1);
    await page.goto("/app/clinical/start-encounter");
    await page.locator("input[name='patient_id']").fill(found.rows[0].id);
    await page.locator("form:has(input[name='patient_id']) button[type='submit']").click();
    await expect(page).toHaveURL(/\/app\/clinical\/encounter\//);
    const encounterUrl = page.url().split("?")[0];
    const encounterId = encounterUrl.split("/").pop();
    await page.context().clearCookies();
    await staffSignIn(page, required("E2E_AC_STAFF_EMAIL"), required("E2E_AC_STAFF_PASSWORD"));
    await page.goto(encounterUrl);
    await expect(page.locator("#chief_complaint")).toBeVisible();
    await page.locator("#chief_complaint").fill(complaint);
    await page.locator("#referral").fill(`Refer ortho ${stamp}`);
    await page.locator("[data-ac-action='save-draft']:visible").click();
    await expect(page).toHaveURL(/updated=1/);
    await expect(page.locator("#chief_complaint")).toHaveValue(complaint);
    await expect(page.locator("[data-ac-print-region='soap']")).toContainText(number);
    await expect(page.locator("[data-ac-print-chief-complaint='1']")).toContainText(complaint);
    await expect(page.locator("[data-ac-print-region='referral']")).toContainText(`Refer ortho ${stamp}`);
    await page.evaluate(() => {
      window.__g300PrintCount = 0;
      window.print = () => {
        window.__g300PrintCount += 1;
      };
    });
    await page.getByRole("button", { name: "Print SOAP note" }).click();
    expect(await page.evaluate(() => window.__g300PrintCount)).toBe(1);
    const draft = await client.query(
      `SELECT status, subjective_text, referral_text, signed_at
       FROM activeclinic.consultation_notes
       WHERE encounter_id = $1`,
      [encounterId]
    );
    expect(draft.rowCount).toBe(1);
    expect(draft.rows[0].status).toBe("draft");
    expect(draft.rows[0].subjective_text).toBe(complaint);
    expect(draft.rows[0].referral_text).toBe(`Refer ortho ${stamp}`);
    expect(draft.rows[0].signed_at).toBeNull();
    await page.goto(`${encounterUrl}/order/prescription`);
    await page.locator("#drug_name").fill(`SyntheticCompound ${stamp}`);
    await page.locator("#dose").fill("1");
    await page.locator("#frequency").fill("once");
    await page.locator("#duration").fill("1 day");
    await page.locator("[data-ac-rx-submit='1'] button[type='submit']").click();
    await expect(page).toHaveURL(/pharmacy_queue=waiting_for_catalogue/);
    await expect(page.locator("body")).toContainText("not on the pharmacy queue");
    const orders = await client.query(
      `SELECT count(*)::int AS n FROM activeclinic.clinical_orders
       WHERE encounter_id = $1 AND order_type = 'prescription'`,
      [encounterId]
    );
    const queued = await client.query(
      "SELECT count(*)::int AS n FROM activeclinic.pharmacy_prescriptions WHERE encounter_id = $1",
      [encounterId]
    );
    expect(orders.rows[0].n).toBe(1);
    expect(queued.rows[0].n).toBe(0);
    const other = await openIsolatedContext(browser, process.env.PLAYWRIGHT_E2E_PORT || "4187");
    const otherPage = await other.newPage();
    await staffSignIn(otherPage, "admin-b@v13d19.example", required("E2E_AC_ADMIN_PASSWORD"));
    await otherPage.goto(encounterUrl);
    await expect(otherPage.locator("#chief_complaint")).toHaveCount(0);
    await expect(otherPage.locator("body")).not.toContainText(complaint);
    const denied = await otherPage.request.post(`${encounterUrl}/consultation`, {
      maxRedirects: 0,
      form: { chief_complaint: `Hijack ${stamp}` },
    });
    expect([401, 403, 404, 302, 303]).toContain(denied.status());
    if (denied.status() === 302 || denied.status() === 303) {
      expect(String(denied.headers().location || "")).not.toMatch(/updated=1/);
    }
    const unchanged = await client.query(
      `SELECT status, subjective_text FROM activeclinic.consultation_notes WHERE encounter_id = $1`,
      [encounterId]
    );
    expect(unchanged.rows[0].status).toBe("draft");
    expect(unchanged.rows[0].subjective_text).toBe(complaint);
    await other.close();
    await page.goto(encounterUrl);
    await page.locator("[data-ac-action='complete-encounter']:visible").click();
    await expect(page).toHaveURL(/\/app\/clinical\?completed=1/);
    const signed = await client.query(
      `SELECT status, subjective_text, signed_at, signed_by_staff_id
       FROM activeclinic.consultation_notes WHERE encounter_id = $1`,
      [encounterId]
    );
    expect(signed.rowCount).toBe(1);
    expect(signed.rows[0].status).toBe("signed");
    expect(signed.rows[0].subjective_text).toBe(complaint);
    expect(signed.rows[0].signed_at).toBeTruthy();
    expect(signed.rows[0].signed_by_staff_id).toBeTruthy();
    const stillQueued = await client.query(
      "SELECT count(*)::int AS n FROM activeclinic.pharmacy_prescriptions WHERE encounter_id = $1",
      [encounterId]
    );
    expect(stillQueued.rows[0].n).toBe(0);
    await page.goto(encounterUrl);
    await expect(page.locator("body")).toContainText(complaint);
    await expect(page.locator("[data-ac-action='save-draft']")).toHaveCount(0);
    await client.end();
  });

  test("G177 pharmacist dispenses stocked synthetic inventory once", async ({ page }, testInfo) => {
    hold(testInfo, "G177 stocked dispense");
    const { Pool, Client } = require("pg");
    const { provisionSyntheticStockedDispense } = require("../../v13/fixtures/v13SyntheticStockFixture");
    const pool = createAuthorizedPgClient(process.env, (options) => new Pool(options));
    let prepared;
    try {
      prepared = await provisionSyntheticStockedDispense(pool, {
        password: required("E2E_AC_ADMIN_PASSWORD"),
        env: process.env,
      });
    } finally {
      await pool.end();
    }
    const client = createAuthorizedPgClient(process.env, (options) => new Client(options));
    await client.connect();
    try {
      const readQuantity = async () => {
        const row = await client.query(
          "SELECT current_quantity FROM activeclinic.inventory_items WHERE id = $1",
          [prepared.inventoryItemId]
        );
        return Number(row.rows[0].current_quantity);
      };
      const starting = await readQuantity();
      expect(starting).toBe(5);
      await staffSignIn(page, prepared.receptionistEmail, required("E2E_AC_RECEPTIONIST_PASSWORD"));
      await expect(page).not.toHaveURL(/\/login$/);
      const denied = await page.request.get(
        `/app/pharmacy/prescriptions/${prepared.prescriptionId}/dispense`,
        { maxRedirects: 0 }
      );
      expect([401, 403]).toContain(denied.status());
      expect(await readQuantity()).toBe(starting);
      await page.context().clearCookies();
      await staffSignIn(page, prepared.pharmacistEmail, required("E2E_AC_ADMIN_PASSWORD"));
      await expect(page).not.toHaveURL(/\/login$/);
      const dispenseUrl = `/app/pharmacy/prescriptions/${prepared.prescriptionId}/dispense`;
      await page.goto("/app/select-facility");
      if (await page.locator("#facility_id").count()) {
        await page.locator("#facility_id").selectOption(prepared.facilityId);
        await page.locator("form[data-ac-form='select-facility'] button[type='submit']").click();
      }
      await page.goto(dispenseUrl);
      await expect(page.locator("body")).toContainText(prepared.genericName);
      await page.locator(`#quantity_${prepared.itemId}`).fill("2");
      await page.locator(`#batch_${prepared.itemId}`).selectOption(prepared.batchId);
      await page.getByRole("button", { name: "Continue to confirmation" }).click();
      await page.getByRole("button", { name: "Confirm dispense" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Dispensing completed" })).toBeVisible();
      expect(await readQuantity()).toBe(starting - 2);
      const movements = await client.query(
        `SELECT count(*)::int AS n
           FROM activeclinic.stock_movements
          WHERE inventory_item_id = $1
            AND movement_type = 'dispense_decrement'`,
        [prepared.inventoryItemId]
      );
      expect(movements.rows[0].n).toBe(1);
      await page.goto(dispenseUrl);
      expect(await readQuantity()).toBe(starting - 2);
    } finally {
      await client.end();
    }
  });

  test("G224 laboratory result follows collection, receipt, verification, and clinician read-back", async ({ page }, testInfo) => {
    hold(testInfo, "G224 laboratory");
    const stamp = Date.now();
    const summary = `Hemoglobin recorded ${stamp}`;
    await staffSignIn(page, required("E2E_AC_RECEPTIONIST_EMAIL"), required("E2E_AC_RECEPTIONIST_PASSWORD"));
    const blocked = await page.request.get("/app/diagnostics/laboratory/queue", { maxRedirects: 0 });
    expect([401, 403]).toContain(blocked.status());
    await page.context().clearCookies();
    await staffSignIn(page, required("E2E_AC_ADMIN_EMAIL"), required("E2E_AC_ADMIN_PASSWORD"));
    await page.goto("/app/patients/new");
    await page.getByRole("button", { name: /None of these/ }).click();
    await page.locator("input[name='first_name']").fill("Lab");
    await page.locator("input[name='last_name']").fill(`Journey${String(stamp).slice(-6)}`);
    await page.locator("select[name='sex_at_registration']").selectOption("female");
    await page.locator("input[name='date_of_birth']").fill("1991-03-03");
    await page.locator("input[name='phone_national']").fill(`97${String(stamp).slice(-7)}`);
    await page.getByRole("button", { name: "Review" }).click();
    await page.getByRole("button", { name: "Create patient" }).click();
    const number = (await page.locator("[data-ac-patient-number='1']").innerText()).trim();
    const pool = createAuthorizedPgClient(process.env, (options) => {
      const { Pool } = require("pg");
      return new Pool({ ...options, max: 2 });
    });
    try {
      const found = await pool.query(
        `SELECT p.id, p.organization_id, p.healthcare_organization_id
           FROM activeclinic.patients p
          WHERE p.patient_number = $1`,
        [number]
      );
      expect(found.rowCount).toBe(1);
      const patient = found.rows[0];
      await page.goto("/app/clinical/start-encounter");
      await page.locator("input[name='patient_id']").fill(patient.id);
      await page.locator("form:has(input[name='patient_id']) button[type='submit']").click();
      await expect(page).toHaveURL(/\/app\/clinical\/encounter\//);
      const encounterUrl = page.url().split("?")[0];
      const encounterId = encounterUrl.split("/").pop();
      await page.context().clearCookies();
      await staffSignIn(page, required("E2E_AC_STAFF_EMAIL"), required("E2E_AC_STAFF_PASSWORD"));
      await page.goto(`${encounterUrl}/order/lab`);
      await page.locator("#test_code").fill("CBC");
      await page.getByRole("button", { name: "Create lab request" }).click();
      await expect(page).toHaveURL(/order_created=1/);
      const request = await pool.query(
        `SELECT id, request_number, patient_id, facility_id
           FROM activeclinic.laboratory_requests
          WHERE encounter_id = $1`,
        [encounterId]
      );
      expect(request.rowCount).toBe(1);
      expect(request.rows[0].patient_id).toBe(patient.id);
      const { provisionFacilityStaff } = require("../../v13/fixtures/v13SyntheticFixtures");
      const { LAB_TECHNICIAN } = require("../../../src/activeclinic/services/activeClinicAuthorizationService");
      const password = required("E2E_AC_ADMIN_PASSWORD");
      const enterEmail = `lab-enter-${stamp}@v13d19.example`;
      const verifyEmail = `lab-verify-${stamp}@v13d19.example`;
      await provisionFacilityStaff(pool, {
        organizationId: patient.organization_id,
        healthcareOrganizationId: patient.healthcare_organization_id,
        facilityId: request.rows[0].facility_id,
        env: process.env,
      }, {
        email: enterEmail,
        phone: `+26094${String(stamp).slice(-7)}`,
        password,
      }, LAB_TECHNICIAN);
      await provisionFacilityStaff(pool, {
        organizationId: patient.organization_id,
        healthcareOrganizationId: patient.healthcare_organization_id,
        facilityId: request.rows[0].facility_id,
        env: process.env,
      }, {
        email: verifyEmail,
        phone: `+26093${String(stamp).slice(-7)}`,
        password,
      }, LAB_TECHNICIAN);
      const requestUrl = `/app/diagnostics/laboratory/request/${request.rows[0].id}`;
      await page.context().clearCookies();
      await staffSignIn(page, enterEmail, password);
      await page.goto(requestUrl);
      await page.getByRole("link", { name: "Collect specimen" }).click();
      await page.locator("#specimen_type").selectOption("blood");
      await page.getByRole("button", { name: "Collect specimen" }).click();
      await expect(page).toHaveURL(/collected=1/);
      const specimen = await pool.query(
        `SELECT id, patient_id, status FROM activeclinic.specimens WHERE laboratory_request_id = $1`,
        [request.rows[0].id]
      );
      expect(specimen.rowCount).toBe(1);
      expect(specimen.rows[0].patient_id).toBe(patient.id);
      expect(specimen.rows[0].status).toBe("collected");
      await page.goto(`/app/diagnostics/laboratory/specimen/${specimen.rows[0].id}/receive`);
      await page.getByRole("button", { name: "Receive specimen" }).click();
      await page.goto("/app/diagnostics/laboratory/queue?status=received");
      await expect(page.locator("body")).toContainText(request.rows[0].request_number);
      await page.goto("/app/diagnostics/laboratory/queue?status=processing");
      await expect(page.locator("body")).not.toContainText(request.rows[0].request_number);
      await page.goto("/app/diagnostics/laboratory");
      await expect(page.locator("[data-ac-lab-count='received']")).not.toHaveText("0");
      await page.goto(requestUrl);
      await page.getByRole("link", { name: "Enter result" }).click();
      await page.locator("#result_summary").fill(summary);
      await page.locator("#components").fill(
        JSON.stringify([
          { test_name: "Hemoglobin", test_code: "HGB", value_numeric: 12.4, unit: "g/dL" },
          { test_name: "WBC", test_code: "WBC", value_numeric: 6.1, unit: "10^9/L" },
        ])
      );
      await page.getByRole("button", { name: "Enter result" }).click();
      await expect(page.locator("[data-ac-lab-result-summary='1']")).toHaveText(summary);
      await expect(page.locator("[data-ac-print-region='laboratory-request']")).toContainText(
        request.rows[0].request_number
      );
      await expect(page.locator("[data-ac-print-region='laboratory-result']")).toContainText(summary);
      await expect(page.locator("[data-ac-lab-component-name='Hemoglobin']")).toContainText("12.4");
      await expect(page.locator("[data-ac-lab-component-name='WBC']")).toContainText("6.1");
      const printCalls = [];
      await page.evaluate(() => {
        window.__g266PrintCount = 0;
        window.print = () => {
          window.__g266PrintCount += 1;
        };
      });
      await page.getByRole("button", { name: "Print result" }).click();
      expect(await page.evaluate(() => window.__g266PrintCount)).toBe(1);
      const componentRows = await pool.query(
        `SELECT c.test_name, c.value_numeric, c.unit, r.patient_id
           FROM activeclinic.laboratory_result_components c
           JOIN activeclinic.laboratory_results r ON r.id = c.laboratory_result_id
          WHERE r.laboratory_request_id = $1
          ORDER BY c.component_order ASC`,
        [request.rows[0].id]
      );
      expect(componentRows.rowCount).toBe(2);
      expect(componentRows.rows[0].test_name).toBe("Hemoglobin");
      expect(Number(componentRows.rows[0].value_numeric)).toBe(12.4);
      expect(componentRows.rows[0].patient_id).toBe(patient.id);
      await page.getByRole("button", { name: "Verify result" }).click();
      await expect(page.locator("body")).toContainText("Verification failed");
      await page.context().clearCookies();
      await staffSignIn(page, verifyEmail, password);
      await page.goto(requestUrl);
      await page.getByRole("button", { name: "Verify result" }).click();
      await expect(page).toHaveURL(/verified=1/);
      const finalRow = await pool.query(
        `SELECT lr.status AS request_status, res.status AS result_status, res.patient_id
           FROM activeclinic.laboratory_requests lr
           JOIN activeclinic.laboratory_results res ON res.laboratory_request_id = lr.id
          WHERE lr.id = $1`,
        [request.rows[0].id]
      );
      expect(finalRow.rows[0].request_status).toBe("verified");
      expect(finalRow.rows[0].result_status).toBe("verified");
      expect(finalRow.rows[0].patient_id).toBe(patient.id);
      await page.context().clearCookies();
      await staffSignIn(page, required("E2E_AC_STAFF_EMAIL"), required("E2E_AC_STAFF_PASSWORD"));
      await page.goto(encounterUrl);
      await expect(page.locator("[data-ac-lab-readback='1']")).toHaveText(summary);
    } finally {
      await pool.end();
    }
  });

  test("G229 radiology report follows order, verification, filters, and clinician read-back", async ({ page }, testInfo) => {
    hold(testInfo, "G229 radiology");
    const stamp = Date.now();
    const findings = `Chest clear ${stamp}`;
    const impression = `No acute finding ${stamp}`;
    await staffSignIn(page, required("E2E_AC_RECEPTIONIST_EMAIL"), required("E2E_AC_RECEPTIONIST_PASSWORD"));
    const blocked = await page.request.get("/app/diagnostics/radiology/queue", { maxRedirects: 0 });
    expect([401, 403]).toContain(blocked.status());
    await page.context().clearCookies();
    await staffSignIn(page, required("E2E_AC_ADMIN_EMAIL"), required("E2E_AC_ADMIN_PASSWORD"));
    await page.goto("/app/patients/new");
    await page.getByRole("button", { name: /None of these/ }).click();
    await page.locator("input[name='first_name']").fill("Rad");
    await page.locator("input[name='last_name']").fill(`Journey${String(stamp).slice(-6)}`);
    await page.locator("select[name='sex_at_registration']").selectOption("male");
    await page.locator("input[name='date_of_birth']").fill("1988-07-07");
    await page.locator("input[name='phone_national']").fill(`96${String(stamp).slice(-7)}`);
    await page.getByRole("button", { name: "Review" }).click();
    await page.getByRole("button", { name: "Create patient" }).click();
    const number = (await page.locator("[data-ac-patient-number='1']").innerText()).trim();
    const pool = createAuthorizedPgClient(process.env, (options) => {
      const { Pool } = require("pg");
      return new Pool({ ...options, max: 2 });
    });
    try {
      const found = await pool.query(
        `SELECT p.id, p.organization_id, p.healthcare_organization_id
           FROM activeclinic.patients p
          WHERE p.patient_number = $1`,
        [number]
      );
      expect(found.rowCount).toBe(1);
      const patient = found.rows[0];
      await page.goto("/app/clinical/start-encounter");
      await page.locator("input[name='patient_id']").fill(patient.id);
      await page.locator("form:has(input[name='patient_id']) button[type='submit']").click();
      await expect(page).toHaveURL(/\/app\/clinical\/encounter\//);
      const encounterUrl = page.url().split("?")[0];
      const encounterId = encounterUrl.split("/").pop();
      await page.context().clearCookies();
      await staffSignIn(page, required("E2E_AC_STAFF_EMAIL"), required("E2E_AC_STAFF_PASSWORD"));
      await page.goto(`${encounterUrl}/order/radiology`);
      await page.locator("#imaging_type").selectOption("x_ray");
      await page.locator("#body_part").fill("Chest");
      await page.locator("#instructions").fill("G229 browser radiology order");
      await page.getByRole("button", { name: "Create radiology request" }).click();
      await expect(page).toHaveURL(/order_created=1/);
      const request = await pool.query(
        `SELECT id, request_number, patient_id, facility_id, status
           FROM activeclinic.radiology_requests
          WHERE encounter_id = $1`,
        [encounterId]
      );
      expect(request.rowCount).toBe(1);
      expect(request.rows[0].patient_id).toBe(patient.id);
      expect(request.rows[0].status).toBe("pending");
      const { provisionFacilityStaff } = require("../../v13/fixtures/v13SyntheticFixtures");
      const { RADIOLOGY_STAFF } = require("../../../src/activeclinic/services/activeClinicAuthorizationService");
      const password = required("E2E_AC_ADMIN_PASSWORD");
      const enterEmail = `rad-enter-${stamp}@v13d19.example`;
      const verifyEmail = `rad-verify-${stamp}@v13d19.example`;
      await provisionFacilityStaff(pool, {
        organizationId: patient.organization_id,
        healthcareOrganizationId: patient.healthcare_organization_id,
        facilityId: request.rows[0].facility_id,
        env: process.env,
      }, {
        email: enterEmail,
        phone: `+26094${String(stamp).slice(-7)}`,
        password,
      }, RADIOLOGY_STAFF);
      await provisionFacilityStaff(pool, {
        organizationId: patient.organization_id,
        healthcareOrganizationId: patient.healthcare_organization_id,
        facilityId: request.rows[0].facility_id,
        env: process.env,
      }, {
        email: verifyEmail,
        phone: `+26093${String(stamp).slice(-7)}`,
        password,
      }, RADIOLOGY_STAFF);
      const requestUrl = `/app/diagnostics/radiology/request/${request.rows[0].id}`;
      await page.context().clearCookies();
      await staffSignIn(page, enterEmail, password);
      await page.goto("/app/diagnostics/radiology/queue?status=pending");
      await expect(page.locator("body")).toContainText(request.rows[0].request_number);
      await page.goto("/app/diagnostics/radiology");
      await expect(page.locator("[data-ac-rad-count='pending']")).not.toHaveText("0");
      await page.goto(requestUrl);
      await page.getByRole("link", { name: "Enter report" }).click();
      await page.locator("#findings").fill(findings);
      await page.locator("#impression").fill(impression);
      await page.locator("#technique").fill("PA chest");
      await page.getByRole("button", { name: "Enter report" }).click();
      await expect(page.locator("[data-ac-rad-findings='1']")).toHaveText(findings);
      await expect(page.locator("[data-ac-rad-impression='1']")).toHaveText(impression);
      await expect(page.locator("[data-ac-print-region='radiology-request']")).toContainText(
        request.rows[0].request_number
      );
      await expect(page.locator("[data-ac-print-region='radiology-request']")).toContainText(findings);
      await page.evaluate(() => {
        window.__g266PrintCount = 0;
        window.print = () => {
          window.__g266PrintCount += 1;
        };
      });
      await page.getByRole("button", { name: "Print report" }).click();
      expect(await page.evaluate(() => window.__g266PrintCount)).toBe(1);
      await page.goto("/app/diagnostics/radiology/queue?status=open");
      await expect(page.locator("body")).not.toContainText(request.rows[0].request_number);
      await page.goto("/app/diagnostics/radiology/queue?status=reported");
      await expect(page.locator("body")).toContainText(request.rows[0].request_number);
      await page.goto("/app/diagnostics/radiology");
      await expect(page.locator("[data-ac-rad-count='reported']")).not.toHaveText("0");
      await page.goto(requestUrl);
      await page.getByRole("button", { name: "Verify report" }).click();
      await expect(page.locator("body")).toContainText("Verification failed");
      await page.context().clearCookies();
      await staffSignIn(page, verifyEmail, password);
      await page.goto(requestUrl);
      await page.getByRole("button", { name: "Verify report" }).click();
      await expect(page).toHaveURL(/verified=1/);
      const finalRow = await pool.query(
        `SELECT rr.status AS request_status, rep.status AS report_status, rep.patient_id
           FROM activeclinic.radiology_requests rr
           JOIN activeclinic.radiology_reports rep ON rep.radiology_request_id = rr.id
          WHERE rr.id = $1`,
        [request.rows[0].id]
      );
      expect(finalRow.rows[0].request_status).toBe("verified");
      expect(finalRow.rows[0].report_status).toBe("verified");
      expect(finalRow.rows[0].patient_id).toBe(patient.id);
      await page.context().clearCookies();
      await staffSignIn(page, required("E2E_AC_STAFF_EMAIL"), required("E2E_AC_STAFF_PASSWORD"));
      await page.goto(encounterUrl);
      await expect(page.locator("[data-ac-rad-readback='1']")).toHaveText(findings);
    } finally {
      await pool.end();
    }
  });
});

async function fillVisible(page, name, value) {
  const field = page.locator(`[name='${name}']:visible`);
  if ((await field.count()) === 0) return;
  const kind = await field.first().evaluate((element) => `${element.tagName}:${element.getAttribute("type") || ""}`);
  if (kind.startsWith("SELECT")) {
    const selected = await field.first().selectOption(value).then(() => true).catch(() => false);
    if (!selected) await field.first().selectOption({ index: 1 });
    return;
  }
  if (kind.endsWith(":checkbox")) {
    await field.first().check();
    return;
  }
  await field.first().fill(value);
}

async function submitClinicRegistration(page, values) {
  await page.goto("/register-clinic");
  for (let step = 0; step < 4; step += 1) {
    if (/\/app|submitted|status/i.test(page.url()) && !/register-clinic/.test(page.url())) return;
    for (const [name, value] of Object.entries(values)) {
      await fillVisible(page, name, value);
    }
    const consent = page.locator("[data-gp-registration-consent] input[type='checkbox']:visible");
    if (await consent.count()) await consent.check();
    await page.locator("button[type='submit']:visible").last().click();
    await page.waitForLoadState("domcontentloaded");
  }
  const terms = page.getByRole("checkbox", { name: /Terms of Service/ });
  if (await terms.isVisible().catch(() => false)) await terms.check();
  const createClinic = page.getByRole("button", { name: "Create clinic" });
  if (await createClinic.isVisible().catch(() => false)) {
    await createClinic.click();
    await page.waitForLoadState("domcontentloaded");
  }
}
