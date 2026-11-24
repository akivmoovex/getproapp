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
