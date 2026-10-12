const { test, expect } = require("@playwright/test");
const { Client } = require("pg");
require("dotenv").config({ path: ".env.test.local" });

const host = "http://blessboard.pronline.org:4319";
const stamp = `${Date.now()}-${process.pid}`;
const church = `QA Church ${stamp}`;
const email = `qa-bb-${stamp}@example.test`;
const password = `BB-${stamp}-Secure!`;
const phone = `97${String(Date.now()).slice(-7)}`;

test.use({
  launchOptions: {
    args: ["--host-resolver-rules=MAP blessboard.pronline.org 127.0.0.1"],
  },
});

async function fillVisibleRequired(page) {
  for (const field of await page.locator("input,select,textarea").all()) {
    if (!(await field.isVisible()) || !(await field.isEditable())) continue;
    const type = await field.getAttribute("type");
    const name = (await field.getAttribute("name")) || "";
    if (type === "hidden" || type === "submit" || type === "checkbox") continue;
    if (type === "email") await field.fill(email);
    else if (type === "password") await field.fill(password);
    else if (name.toLowerCase().includes("phone")) await field.fill(phone);
    else if ((await field.evaluate((e) => e.tagName)) === "SELECT") {
      const values = await field.locator("option").evaluateAll((o) => o.map((x) => x.value).filter(Boolean));
      if (values[0]) await field.selectOption(values[0]);
    } else if (await field.getAttribute("required")) await field.fill(`${name}-${stamp}`);
  }
}

test("BlessBoard complete registration and authentication lifecycle", async ({ page }) => {
  await page.goto(`${host}/register-church`, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.locator('[name="church_name"]').fill(church);
  await page.locator('[name="country"]').selectOption({ label: "Zambia" });
  await page.locator('[name="city"]').fill("Lusaka");
  await page.locator('[name="branch_name"]').fill(`${church} HQ`);
  await page.locator('[name="branch_count"]').fill("1");
  await page.getByRole("button", { name: "Continue" }).click();
  await fillVisibleRequired(page);
  await page.getByRole("textbox", { name: "Full name" }).fill(`${church} Administrator`);
  await page.getByRole("textbox", { name: "Role in church" }).fill("Administrator");
  await page.locator("#register_password").fill(password);
  await page.locator("#register_password_confirm").fill(password);
  await expect(page.locator("#register_password")).toHaveValue(password);
  await expect(page.locator("#register_password_confirm")).toHaveValue(password);
  await page.getByRole("button", { name: "Continue" }).click();
  const consent = page.locator('input[type="checkbox"], [name*="consent"]');
  if (await consent.count()) await consent.first().check();
  const post = page.waitForResponse((r) => r.request().method() === "POST", { timeout: 15000 });
  await page.getByRole("button", { name: /create|submit|complete|register/i }).last().click();
  expect((await post).status()).toBeLessThan(400);
  await expect(page).toHaveURL(/register.*success/);
  await page.getByRole("link", { name: /continue to dashboard/i }).click();
  await expect(page).toHaveURL(/\/(app|dashboard|hq)/);
  await expect(page.locator("body")).toContainText(church);
  await page.reload({ waitUntil: "domcontentloaded" });
  const profile = page.getByRole("group").filter({ hasText: church }).first();
  if (await profile.count()) {
    await profile.click();
    await expect(page.getByText(/sign out/i).first()).toBeVisible();
    await page.getByText(/sign out/i).first().click();
  } else {
    await page.getByText(/logout|sign out/i).first().click();
  }
  if (!/\/login/.test(page.url())) await page.getByRole("link", { name: /sign in/i }).first().click();
  await expect(page).toHaveURL(/login/);
  await page.locator('input[type="email"], input[name="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /sign in|log in|login/i }).click();
  await expect(page).toHaveURL(/\/(app|dashboard|hq)/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Account").first().click();
  await expect(page.getByText("Logout").last()).toBeVisible();
  await page.getByText("Logout").last().click();
  if (!/\/login/.test(page.url())) await page.getByRole("link", { name: /sign in/i }).first().click();
  await page.locator('input[type="email"], input[name="email"]').fill(email);
  await page.locator('input[type="password"]').fill(`${password}-wrong`);
  await page.getByRole("button", { name: /sign in|log in|login/i }).click();
  await expect(page).not.toHaveURL(/\/(app|dashboard|hq)/);

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const result = await db.query(
    "select 1 from blessboard.churches where display_name=$1 or legal_name=$1",
    [church]
  );
  await db.end();
  expect(result.rowCount).toBe(1);
});
