const { test, expect } = require("@playwright/test");
const { Pool } = require("pg");
require("dotenv").config({ path: ".env.test.local" });

const host = "http://activeclinic.pronline.org:4319";
const stamp = `${Date.now()}-${process.pid}`;
const clinic = `QA Staff Clinic ${stamp}`;
const email = `qa-staff-admin-${stamp}@example.test`;
const password = `QA-${stamp}-Pass!`;
const staffEmail = `qa-invite-${stamp}@example.test`;
const staffPassword = `Staff-${stamp}-Pass!`;
const patientName = `QA Patient ${stamp}`;
const patientPhone = `96${String(Date.now()).slice(-7)}`;
const patientEmail = `qa-patient-${stamp}@example.test`;
const phone = `97${String(Date.now()).slice(-7)}`;
const db = new Pool({ connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL });

test.use({ launchOptions: { args: ["--host-resolver-rules=MAP activeclinic.pronline.org 127.0.0.1"] } });

async function fillStep2(page) {
  await page.locator('input[type="email"]').fill(email);
  await page.getByRole("textbox", { name: /Administrator name/i }).fill(`${clinic} Administrator`);
  await page.getByRole("textbox", { name: /Phone/i }).fill(phone);
  const passwords = page.locator('input[type="password"]');
  await passwords.nth(0).fill(password);
  await passwords.nth(1).fill(password);
}

test("ActiveClinic administrator invites staff", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`${host}/register-clinic`, { waitUntil: "domcontentloaded" });
  await page.locator('[name="clinicName"]').fill(clinic);
  await page.locator('[name="clinicType"]').selectOption({ label: "Clinic" });
  await page.locator('[name="countryCode"]').selectOption("ZM");
  await page.locator('[name="city"]').fill("Lusaka");
  await page.getByRole("button", { name: /Continue to Staff Setup/i }).click();
  await fillStep2(page);
  await page.getByRole("button", { name: /Continue to Review/i }).click();
  await page.locator('[name="registration_consent"]').check();
  await page.getByRole("button", { name: /Create clinic/i }).click();
  await expect(page).toHaveURL(/register-clinic\/success/);
  await page.getByRole("link", { name: /dashboard/i }).click();
  await expect(page).toHaveURL(/\/app/);
  await page.goto(`${host}/app/settings/website/publish`, { waitUntil: "domcontentloaded" });
  await page.locator("#ac-mw-publish-form button").click();
  await expect(page.locator("body")).toContainText(/Published|published/);

  await page.goto(`${host}/app/staff/invite`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/app\/staff\/invite/);
  const form = page.locator('form[action="/app/staff"]');
  await expect(form).toBeVisible();
  await page.getByRole("textbox", { name: "First name" }).fill("QA");
  await page.getByRole("textbox", { name: "Last name" }).fill(`Invitee ${stamp}`);
  await page.getByRole("textbox", { name: "Phone required" }).fill(`96${String(Date.now()).slice(-7)}`);
  await page.getByRole("textbox", { name: "Email (optional)" }).fill(staffEmail);
  await page.getByRole("checkbox", { name: /^Staff / }).check();
  await page.getByRole("checkbox", { name: /^Receptionist / }).check();
  await page.getByRole("button", { name: "Create invitation" }).click();
  await expect(page.locator("body")).toContainText("Invitation created");
  const invitationUrl = await page.getByRole("textbox", { name: "Invitation link" }).inputValue();
  const context = await page.context().browser().newContext();
  const staff = await context.newPage();
  await staff.goto(invitationUrl.replace("https://activeclinic.pronline.org", host), { waitUntil: "domcontentloaded" });
  await expect(staff.locator("body")).toContainText(/activate|invitation/i);
  const activationPasswords = staff.locator('input[type="password"]');
  await activationPasswords.nth(0).fill(staffPassword);
  await activationPasswords.nth(1).fill(staffPassword);
  await staff.getByRole("button", { name: /activate|complete|set password/i }).click();
  await expect(staff).toHaveURL(/login/);
  await staff.locator('input[type="email"], input[name="email"]').fill(staffEmail);
  await staff.locator('input[type="password"]').fill(staffPassword);
  await staff.getByRole("button", { name: /sign in|log in|login/i }).click();
  await expect(staff).toHaveURL(/\/app/);
  await expect(staff.locator("body")).toContainText(/ActiveClinic|Staff/);
  await staff.goto(`${host}/app/patients/new`, { waitUntil: "domcontentloaded" });
  await expect(staff).toHaveURL(/\/app\/patients\/new/);
  await staff.getByRole("button", { name: /None of these/i }).click();
  await staff.getByLabel("First name").fill("QA");
  await staff.getByLabel("Surname").fill(patientName.replace("QA Patient ", ""));
  await staff.locator("#date_of_birth").fill("1990-01-01");
  await staff.locator("#phone-national").fill(patientPhone);
  await staff.getByLabel("Email (optional)").fill(patientEmail);
  const reviewResponse = staff.waitForResponse((r) => r.request().method() === "POST", { timeout: 10000 });
  await staff.locator('form button[name="step"][value="review"]').click();
  const response = await reviewResponse;
  expect(response.status()).toBe(200);
  await expect(staff.getByText(/Review registration/i)).toBeVisible();
  const createResponse = staff.waitForResponse((r) => r.request().method() === "POST", { timeout: 10000 });
  await staff.getByRole("button", { name: /Create patient/i }).click();
  const finalResponse = await createResponse;
  expect(finalResponse.status()).toBeLessThan(400);
  await expect(staff.getByText(/Patient registered/i)).toBeVisible();

  const patientResult = await db.query(
    `SELECT p.id, p.organization_id, p.healthcare_organization_id,
            p.platform_identity_id, l.facility_id, o.organization_key
       FROM activeclinic.patients p
       JOIN platform.organizations o ON o.id = p.organization_id
       LEFT JOIN activeclinic.patient_facility_links l
         ON l.patient_id = p.id AND l.status = 'active'
      WHERE p.email_normalized = $1
      ORDER BY p.created_at DESC LIMIT 1`,
    [patientEmail.toLowerCase()]
  );
  expect(patientResult.rows).toHaveLength(1);
  const patient = patientResult.rows[0];
  expect(patient.facility_id).toBeTruthy();
  expect(patient.platform_identity_id).toBeNull();

  const patientContext = await page.context().browser().newContext();
  const portal = await patientContext.newPage();
  const portalPassword = `Portal-${stamp}-Pass!`;
  await portal.goto(`${host}/clinics/${patient.organization_key}/patient/register`);
  await portal.getByLabel("First name").fill("QA");
  await portal.getByLabel("Last name").fill(patientName.replace("QA Patient ", ""));
  await portal.locator("#phone-national").fill(patientPhone);
  await portal.locator("#password").fill(portalPassword);
  await portal.getByRole("button", { name: "Continue" }).click();
  await expect(portal).toHaveURL(/\/patient\/login/);

  const linked = await db.query(
    `SELECT platform_identity_id, organization_id, healthcare_organization_id
       FROM activeclinic.patients WHERE id = $1`,
    [patient.id]
  );
  expect(linked.rows[0].platform_identity_id).toBeTruthy();
  expect(linked.rows[0].organization_id).toBe(patient.organization_id);
  expect(linked.rows[0].healthcare_organization_id).toBe(patient.healthcare_organization_id);

  await portal.getByLabel(/phone or email/i).fill(patientPhone);
  await portal.getByLabel("Password").fill(portalPassword);
  await portal.getByRole("button", { name: /sign in/i }).click();
  await expect(portal).toHaveURL(/\/patient$/);
  await expect(portal.locator("body")).toContainText(/Patient Portal|Dashboard/i);
  await portal.reload();
  await expect(portal).toHaveURL(/\/patient$/);
  await portal.getByRole("button", { name: /sign out|log out/i }).click();
  await expect(portal).toHaveURL(/\/patient\/login/);
  await portal.goto(`${host}/clinics/${patient.organization_key}/patient/login`);
  await portal.getByLabel(/phone or email/i).fill(patientPhone);
  await portal.getByLabel("Password").fill(portalPassword);
  await portal.getByRole("button", { name: /sign in/i }).click();
  await expect(portal).toHaveURL(/\/patient$/);
  await portal.goto(`${host}/app`);
  expect(portal.url()).not.toMatch(/\/app$/);
  await patientContext.close();
  await context.close();
  await db.end();
});
