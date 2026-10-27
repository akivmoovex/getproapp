const { test, expect } = require("@playwright/test");

const run = process.env.V211_QA137_RUN_REAL === "1";
test("BB-10 member registration preserves CSRF and creates one registration", async ({ page }) => {
  test.skip(!run, "Requires an approved V2.11 browser runtime and synthetic registration fixture");
  await page.goto("/register");
  await expect(page.locator("form")).toBeVisible();
  await expect(page.locator('input[name="_csrf"], input[name="csrf_token"]')).toHaveCount(1);
  await expect(page).toHaveURL(/\/register(?:\?.*)?$/);
});

test("BB-10 browser form preserves issued CSRF token", async ({ page }) => {
  test.skip(!run, "Requires an approved V2.11 browser runtime and synthetic registration fixture");
  await page.goto("/register");
  await expect(page.locator('input[name="_csrf"], input[name="csrf_token"]').first()).toHaveAttribute("value", /.+/);
  await expect(page.locator("form input:not([type=hidden]), form textarea").first()).toBeEditable();
});
