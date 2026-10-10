"use strict";

const { test, expect } = require("@playwright/test");

const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:4175";
const BB_HEADERS = {
  "X-Forwarded-Host": "blessboard.neuniversity.org",
  "X-Forwarded-Proto": "http",
  "X-Forwarded-For": "10.209.0.13",
};

async function reachPasswordStep(page) {
  await page.goto(`${BASE_URL}/register-church?plan=foundation`);
  await page.locator("#register_company_website").fill(`v209-${Date.now()}.example.test`);
  await page.locator("#register_church_name").fill("V209 Browser Policy");
  await page.locator("#register_city").fill("Lusaka");
  await page.locator("#register_branch_name").fill("Main");
  await page.locator("#register_branch_count").fill("1");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#register_password")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Your session expired. Please try again.");
}

test.describe("V209 BlessBoard password policy browser coverage", () => {
  test.use({ extraHTTPHeaders: BB_HEADERS });

  test("V209-13 live password indicators update while typing", async ({ page }) => {
    await reachPasswordStep(page);
    const rules = page.locator("[data-gp-password-rule]");
    const count = await rules.count();
    expect(count).toBeGreaterThan(0);
    const initial = await rules.evaluateAll((items) => items.map((item) => item.getAttribute("aria-checked")));
    await page.locator("#register_password").fill("1234567890");
    const complete = await rules.evaluateAll((items) => items.map((item) => item.getAttribute("aria-checked")));
    expect(complete).not.toEqual(initial);
  });

  test("V209-14 satisfied indicators expose class and ARIA state", async ({ page }) => {
    await reachPasswordStep(page);
    const rule = page.locator('[data-gp-password-rule="min_length"]');
    await expect(rule).toHaveClass(/is-unmet/);
    await expect(rule).toHaveAttribute("aria-checked", "false");
    await page.locator("#register_password").fill("1234567890");
    await expect(rule).toHaveClass(/is-met/);
    await expect(rule).toHaveAttribute("aria-checked", "true");
  });

  test("V209-15 weak password cannot continue", async ({ page }) => {
    await reachPasswordStep(page);
    await page.locator("#register_contact_name").fill("V209 Browser User");
    await page.locator("#register_email").fill(`v209-weak-${Date.now()}@example.test`);
    await page.locator("#register_role").fill("Administrator");
    await page.locator("#register_password").fill("weak");
    await page.locator("#register_password_confirm").fill("weak");
    await page.locator("form button[type=submit]").click();
    await expect(page.locator("#register_password")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Your session expired. Please try again.");
  });

  test("V209-16 valid password continues", async ({ page }) => {
    await reachPasswordStep(page);
    await page.locator("#register_contact_name").fill("V209 Browser User");
    await page.locator("#register_email").fill(`v209-valid-${Date.now()}@example.test`);
    await page.locator("#register_phone-national").fill("971234567");
    await page.locator("#register_role").fill("Administrator");
    await page.locator("#register_password").fill("ValidPassword1!");
    await page.locator("#register_password_confirm").fill("ValidPassword1!");
    await page.locator("form button[type=submit]").click();
    await expect(page.getByRole("button", { name: /create church workspace/i })).toBeVisible();
    await expect(page).not.toHaveURL(/session-expired/);
  });
});
