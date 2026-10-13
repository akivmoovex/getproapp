const { test, expect } = require("@playwright/test");
const { Pool } = require("pg");
require("dotenv").config({ path: ".env.test.local" });

const host = "http://activeclinic.pronline.org:4319";
const run = `${Date.now()}-${process.pid}`;
const adminEmail = `ac-admin-${run}@example.test`;
const adminPassword = `Admin-${run}-Pass!`;
const staffEmail = `ac-receptionist-${run}@example.test`;
const staffPassword = `Reception-${run}-Pass!`;
const db = new Pool({ connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL });

test.use({ launchOptions: { args: ["--host-resolver-rules=MAP activeclinic.pronline.org 127.0.0.1"] } });

test("receptionist patient creation and administrator denial", async ({ browser }) => {
  const admin = await browser.newPage();
  await admin.goto(`${host}/register-clinic`);
  await admin.locator('[name="clinicName"]').fill(`QA Receptionist ${run}`);
  await admin.locator('[name="clinicType"]').selectOption({ label: "Clinic" });
  await admin.locator('[name="countryCode"]').selectOption("ZM");
  await admin.locator('[name="city"]').fill("Lusaka");
  await admin.getByRole("button", { name: /Continue to Staff Setup/i }).click();
  await admin.locator('input[type="email"]').fill(adminEmail);
  await admin.getByRole("textbox", { name: /Administrator name/i }).fill("QA Administrator");
  await admin.getByRole("textbox", { name: /Phone/i }).fill(`97${String(Date.now()).slice(-7)}`);
  await admin.locator('input[type="password"]').nth(0).fill(adminPassword);
  await admin.locator('input[type="password"]').nth(1).fill(adminPassword);
  await admin.getByRole("button", { name: /Continue to Review/i }).click();
  await admin.locator('[name="registration_consent"]').check();
  await admin.getByRole("button", { name: /Create clinic/i }).click();
  await expect(admin).toHaveURL(/register-clinic\/success/);
  await admin.getByRole("link", { name: /dashboard/i }).click();
  await expect(admin).toHaveURL(/\/app/);

  await admin.goto(`${host}/app/staff/invite`);
  await admin.getByRole("textbox", { name: "First name" }).fill("QA");
  await admin.getByRole("textbox", { name: "Last name" }).fill("Receptionist");
  await admin.getByRole("textbox", { name: "Phone required" }).fill(`96${String(Date.now()).slice(-7)}`);
  await admin.getByRole("textbox", { name: "Email (optional)" }).fill(staffEmail);
  await admin.getByRole("checkbox", { name: /^Staff / }).check();
  await admin.getByRole("checkbox", { name: /^Receptionist / }).check();
  await admin.getByRole("button", { name: "Create invitation" }).click();
  const invitation = await admin.getByRole("textbox", { name: "Invitation link" }).inputValue();

  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  await staff.goto(invitation.replace("https://activeclinic.pronline.org", host));
  const passwords = staff.locator('input[type="password"]');
  await passwords.nth(0).fill(staffPassword);
  await passwords.nth(1).fill(staffPassword);
  await staff.getByRole("button", { name: /activate|complete|set password/i }).click();
  await staff.locator('input[type="email"], input[name="email"]').fill(staffEmail);
  await staff.locator('input[type="password"]').fill(staffPassword);
  await staff.getByRole("button", { name: /sign in|log in|login/i }).click();
  await expect(staff).toHaveURL(/\/app/);

  await staff.goto(`${host}/app/patients/new`);
  await expect(staff).toHaveURL(/\/app\/patients\/new/);
  await staff.getByRole("button", { name: /None of these/i }).click();
  await staff.getByLabel("First name").fill("Reception");
  await staff.getByLabel("Surname").fill(`Patient ${run}`);
  await staff.locator("#date_of_birth").fill("1990-01-01");
  const patientEmail = `created-${run}@example.test`;
  await staff.locator("#phone-national").fill(`95${String(Date.now()).slice(-7)}`);
  await staff.getByLabel("Email (optional)").fill(patientEmail);
  await staff.locator('form button[name="step"][value="review"]').click();
  await expect(staff.getByText(/Review registration/i)).toBeVisible();
  await staff.getByRole("button", { name: /Create patient/i }).click();
  await expect(staff.getByText(/Patient registered/i)).toBeVisible();
  const persisted = await db.query(
    "SELECT id FROM activeclinic.patients WHERE email_normalized=$1 ORDER BY created_at DESC LIMIT 1",
    [patientEmail]
  );
  expect(persisted.rows).toHaveLength(1);

  const rolePage = await staff.goto(`${host}/app/staff/invite`);
  expect([302, 403]).toContain(rolePage.status());
  const adminManage = await staff.goto(`${host}/app/staff`);
  expect([302, 403]).toContain(adminManage.status());
  await staffContext.close();
  await admin.close();
});

test.afterAll(async () => db.end());
