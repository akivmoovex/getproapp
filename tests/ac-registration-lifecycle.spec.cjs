const { test, expect } = require("@playwright/test");
const { Client } = require("pg");
require("dotenv").config({ path: ".env.test.local" });

const host = "http://activeclinic.pronline.org:4319";
const stamp = `${Date.now()}-${process.pid}`;
const clinic = `QA Clinic ${stamp}`;
const email = `qa-ac-${stamp}@example.test`;
const password = `QA-${stamp}-Pass!`;
const phone = `97${String(Date.now()).slice(-7)}`;

test.use({
  launchOptions: {
    args: [
      "--host-resolver-rules=MAP activeclinic.pronline.org 127.0.0.1,MAP blessboard.pronline.org 127.0.0.1",
    ],
  },
});

async function fillRequired(page) {
  for (const field of await page.locator("input,select,textarea").all()) {
    if (!(await field.isVisible()) || !(await field.isEditable())) continue;
    const type = await field.getAttribute("type");
    const name = await field.getAttribute("name");
    if (type === "hidden" || type === "submit" || type === "checkbox" || !name) continue;
    if (type === "email") await field.fill(email);
    else if (type === "password") await field.fill(password);
    else if (name.toLowerCase().includes("phone")) await field.fill(phone);
    else if ((await field.evaluate((e) => e.tagName)) === "SELECT") {
      const values = await field.locator("option").evaluateAll((o) => o.map((x) => x.value).filter(Boolean));
      if (values[0]) await field.selectOption(values[0]);
    } else await field.fill(name.toLowerCase().includes("name") ? clinic : `${name}-${stamp}`);
  }
}

test("ActiveClinic complete registration and authentication lifecycle", async ({ page, request }) => {
  const traffic = [];
  page.on("request", (r) => traffic.push(r.url()));
  await page.goto(`${host}/register-clinic`, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.locator('[name="clinicName"]').fill(clinic);
  await page.locator('[name="clinicType"]').selectOption({ label: "Clinic" });
  await page.locator('[name="countryCode"]').selectOption("ZM");
  await page.locator('[name="city"]').fill("Lusaka");
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST", { timeout: 15000 }),
    page.getByRole("button", { name: /Continue to Staff Setup/i }).click(),
  ]);
  await fillRequired(page);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').nth(0).fill(password);
  await page.locator('input[type="password"]').nth(1).fill(password);
  await page.getByRole("button", { name: /Continue to Review/i }).click();
  await expect(page.locator('[name="registration_consent"]')).toBeVisible();
  await page.locator('[name="registration_consent"]').check();
  const finalPost = page.waitForResponse((r) => r.request().method() === "POST", { timeout: 15000 });
  await page.getByRole("button", { name: /Create clinic/i }).click();
  expect((await finalPost).status()).toBeLessThan(400);
  await expect(page).toHaveURL(/\/register-clinic\/success/);
  await page.getByRole("link", { name: /dashboard/i }).click();
  await expect(page).toHaveURL(/\/app/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("group").filter({ hasText: clinic }).first().click();
  await expect(page.getByText(/sign out/i).first()).toBeVisible();
  await page.getByText(/logout|sign out/i).first().click();
  await expect(page).toHaveURL(/login/);
  await page.locator('input[type="email"], input[name="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /sign in|log in|login/i }).click();
  await expect(page).toHaveURL(/\/app/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("group").filter({ hasText: clinic }).first().click();
  await expect(page.getByText(/sign out/i).first()).toBeVisible();
  await page.getByText(/logout|sign out/i).first().click();
  await page.locator('input[type="email"], input[name="email"]').fill(email);
  await page.locator('input[type="password"]').fill(`${password}-wrong`);
  await page.getByRole("button", { name: /sign in|log in|login/i }).click();
  await expect(page).not.toHaveURL(/\/app/);
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const result = await db.query(
    "select 1 from activeclinic.healthcare_organizations where legal_name=$1 or public_name=$1",
    [clinic]
  );
  await db.end();
  expect(result.rowCount).toBe(1);
});
