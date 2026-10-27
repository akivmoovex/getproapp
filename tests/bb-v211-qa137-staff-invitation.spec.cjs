const { test, expect } = require("@playwright/test");

const run = process.env.V211_QA137_RUN_REAL === "1";

test("BB-V211-06 staff invitation setup uses the tenant host", async ({ page }) => {
  test.skip(!run, "Requires an approved V2.11 browser runtime and authorized staff fixture");
  const response = await page.goto("/login");
  expect(response).toBeTruthy();
  expect(response.status()).toBeLessThan(500);
  await page.goto("/hq/staff");
  await expect(page.getByRole("link", { name: /invite staff/i })).toBeVisible();
});

test("BB-V211-06 invalid invitation is a controlled denial", async ({ page }) => {
  test.skip(!run, "Requires an approved V2.11 browser runtime and invitation fixture");
  await page.goto("/invite/accept?token=invalid");
  await expect(page.getByRole("alert")).toContainText(/invalid|expired|invitation/i);
});
