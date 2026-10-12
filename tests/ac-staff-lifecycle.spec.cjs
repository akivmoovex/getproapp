const { test, expect } = require("@playwright/test");
require("dotenv").config({ path: ".env.test.local" });

const host = "http://activeclinic.pronline.org:4319";
const stamp = `${Date.now()}-${process.pid}`;
const clinic = `QA Staff Clinic ${stamp}`;
const email = `qa-staff-admin-${stamp}@example.test`;
const password = `QA-${stamp}-Pass!`;
const staffEmail = `qa-invite-${stamp}@example.test`;
const staffPassword = `Staff-${stamp}-Pass!`;
const phone = `97${String(Date.now()).slice(-7)}`;

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

  await page.goto(`${host}/app/staff/invite`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/app\/staff\/invite/);
  const form = page.locator('form[action="/app/staff"]');
  await expect(form).toBeVisible();
  await page.getByRole("textbox", { name: "First name" }).fill("QA");
  await page.getByRole("textbox", { name: "Last name" }).fill(`Invitee ${stamp}`);
  await page.getByRole("textbox", { name: "Phone required" }).fill(`96${String(Date.now()).slice(-7)}`);
  await page.getByRole("textbox", { name: "Email (optional)" }).fill(staffEmail);
  await page.getByRole("checkbox", { name: /^Staff / }).check();
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
});
