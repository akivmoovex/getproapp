const { test, expect } = require("@playwright/test");
const { Pool } = require("pg");
require("dotenv").config({ path: ".env.test.local" });

const host = "http://activeclinic.pronline.org:4319";
const db = new Pool({ connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL });
const run = `${Date.now()}-${process.pid}`;
const password = `Isolation-${run}-Pass!`;
const staffPassword = `Staff-${run}-Pass!`;

test.use({ launchOptions: { args: ["--host-resolver-rules=MAP activeclinic.pronline.org 127.0.0.1"] } });

async function createClinic(page, label) {
  const clinic = `QA Isolation ${label} ${run}`;
  const adminEmail = `iso-admin-${label.toLowerCase()}-${run}@example.test`;
  const phone = `97${String(Date.now()).slice(-7)}`;
  await page.goto(`${host}/register-clinic`);
  await page.locator('[name="clinicName"]').fill(clinic);
  await page.locator('[name="clinicType"]').selectOption({ label: "Clinic" });
  await page.locator('[name="countryCode"]').selectOption("ZM");
  await page.locator('[name="city"]').fill("Lusaka");
  await page.getByRole("button", { name: /Continue to Staff Setup/i }).click();
  await page.locator('input[type="email"]').fill(adminEmail);
  await page.getByRole("textbox", { name: /Administrator name/i }).fill(`${clinic} Administrator`);
  await page.getByRole("textbox", { name: /Phone/i }).fill(phone);
  await page.locator('input[type="password"]').nth(0).fill(password);
  await page.locator('input[type="password"]').nth(1).fill(password);
  await page.getByRole("button", { name: /Continue to Review/i }).click();
  await page.locator('[name="registration_consent"]').check();
  await page.getByRole("button", { name: /Create clinic/i }).click();
  await expect(page).toHaveURL(/register-clinic\/success/);
  await page.getByRole("link", { name: /dashboard/i }).click();
  await expect(page).toHaveURL(/\/app/);
  await page.goto(`${host}/app/settings/website/publish`);
  await page.once("dialog", (dialog) => dialog.accept());
  await page.locator('[data-ac-website-action="publish"]').click();
  await expect(page.locator("body")).toContainText(/Published|published/);
  const row = await db.query(
    "SELECT organization_key FROM platform.organizations WHERE display_name = $1 ORDER BY created_at DESC LIMIT 1",
    [clinic]
  );
  expect(row.rows).toHaveLength(1);
  return { clinic, adminEmail, clinicKey: row.rows[0].organization_key };
}

async function createPatient(page, email, suffix) {
  try {
    await page.goto(`${host}/app/patients/new`, { waitUntil: "domcontentloaded" });
  } catch (err) {
    if (!String(err).includes("ERR_ABORTED")) throw err;
    await page.waitForURL(/\/app\/patients\/new/, { timeout: 5000 });
  }
  await page.getByRole("button", { name: /None of these/i }).click();
  await page.getByLabel("First name").fill("Isolation");
  await page.getByLabel("Surname").fill(suffix);
  await page.locator("#date_of_birth").fill("1990-01-01");
  const phone = `96${String(Date.now()).slice(-7)}`;
  await page.locator("#phone-national").fill(phone);
  await page.getByLabel("Email (optional)").fill(email);
  await page.locator('form button[name="step"][value="review"]').click();
  await expect(page.getByText(/Review registration/i)).toBeVisible();
  await page.getByRole("button", { name: /Create patient/i }).click();
  await expect(page.getByText(/Patient registered/i)).toBeVisible();
  const row = await db.query(
    `SELECT patient_number FROM activeclinic.patients
     WHERE email_normalized = $1 ORDER BY created_at DESC LIMIT 1`,
    [email.toLowerCase()]
  );
  expect(row.rows).toHaveLength(1);
  return { phone, patientNumber: row.rows[0].patient_number, firstName: "Isolation", lastName: suffix };
}

async function browserFetch(page, url, options = {}) {
  return page.evaluate(async ({ url, options }) => {
    const response = await fetch(url, {
      method: options.method || "GET",
      credentials: "include",
      headers: options.headers || {},
      body: options.body,
      redirect: options.redirect || "follow",
    });
    return {
      status: response.status,
      text: await response.text(),
      url: response.url,
      location: response.headers.get("location"),
    };
  }, { url, options });
}

test("isolates patients within and across clinics", async ({ browser }) => {
  const admin = await browser.newPage();
  const a = await createClinic(admin, "A");
  const aStaffContext = await browser.newContext({ storageState: await admin.context().storageState() });
  const aStaff = await aStaffContext.newPage();
  const a1 = await createPatient(aStaff, `a1-${run}@example.test`, "A1");
  const a2 = await createPatient(aStaff, `a2-${run}@example.test`, "A2");
  await aStaffContext.close();
  await admin.close();

  const adminB = await browser.newPage();
  const b = await createClinic(adminB, "B");
  const bStaffContext = await browser.newContext({ storageState: await adminB.context().storageState() });
  const bStaff = await bStaffContext.newPage();
  const b1 = await createPatient(bStaff, `b1-${run}@example.test`, "B1");
  await bStaffContext.close();
  await adminB.close();

  const pa = await browser.newPage();
  await pa.goto(`${host}/clinics/${a.clinicKey}/patient/register`);
  await pa.getByLabel("First name").fill(a1.firstName);
  await pa.getByLabel("Last name").fill(a1.lastName);
  await pa.locator("#phone-national").fill(a1.phone);
  await pa.locator("#password").fill(password);
  await pa.getByRole("button", { name: "Continue" }).click();
  await pa.getByLabel(/phone or email/i).fill(a1.phone);
  await pa.getByLabel("Password").fill(password);
  await pa.getByRole("button", { name: /sign in/i }).click();
  await expect(pa).toHaveURL(/\/patient$/);

  const own = await browserFetch(pa, `${host}/clinics/${a.clinicKey}/patient/profile`);
  expect(own.status).toBe(200);
  const unauth = await browser.newPage();
  await unauth.goto(`${host}/clinics/${a.clinicKey}/patient/login`);
  const wrongResponse = unauth.waitForResponse((response) =>
    response.url().includes("/patient/login") && response.request().method() === "POST"
  );
  await unauth.getByLabel(/phone or email/i).fill(a1.phone);
  await unauth.getByLabel("Password").fill("wrong-password");
  await unauth.getByRole("button", { name: /sign in/i }).click();
  expect((await wrongResponse).status()).toBe(401);
  expect(await unauth.context().cookies()).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: "moovex_platform_testing_sid" })]));
  await unauth.close();

  const other = await browserFetch(pa, `${host}/clinics/${a.clinicKey}/patient/profile?patientId=${a2.phone}`);
  expect(other.status).toBe(200);
  expect(other.text).not.toContain(a2.phone);
  const cross = await browserFetch(pa, `${host}/clinics/${b.clinicKey}/patient/profile`);
  expect([401, 403, 404]).toContain(cross.status);
  const staff = await browserFetch(pa, "/app/patients");
  expect(staff.status).toBe(200);
  expect(staff.url).toMatch(/\/login$/);
  expect(staff.text).toMatch(/Sign in|Log in/i);
  const detail = await browserFetch(pa, `/app/patients/${encodeURIComponent(a1.patientNumber)}`);
  expect(detail.status).toBe(200);
  expect(detail.url).toMatch(/\/login$/);
  const create = await browserFetch(pa, "/app/patients/new");
  expect(create.status).toBe(200);
  expect(create.url).toMatch(/\/login$/);
  const createPost = await browserFetch(pa, "/app/patients", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "firstName=&lastName=",
  });
  expect(createPost.status).toBe(200);
  expect(createPost.url).toMatch(/\/login$/);
  await pa.close();
  expect(b1.phone).toMatch(/^\d+$/);
});

test.afterAll(async () => db.end());
