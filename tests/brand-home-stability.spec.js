// @ts-check
const { test, expect } = require("@playwright/test");

/**
 * Homepage must keep SSR GetPro branding after theme-prefs runs and after reload,
 * even if gp-brand in localStorage conflicts (public pages: SSR wins).
 */
test.describe("Brand lockup SSR stability (APP_BRAND=getpro)", () => {
  test("homepage stays GetPro after load + reload; html[data-brand] stable", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("gp-brand", "proonline");
      } catch (e) {
        /* ignore */
      }
    });

    await page.goto("/", { waitUntil: "networkidle", timeout: 60_000 });
    await expect(page.locator("main.gp-home")).toBeVisible({ timeout: 30_000 });

    await expect(page.locator("html")).toHaveAttribute("data-brand", "getpro");
    await expect(page.locator(".wf-brand-lockup-product--getpro")).toBeVisible();
    await expect(page.locator(".wf-brand-lockup-product--pro")).toBeHidden();

    await page.waitForTimeout(300);

    await expect(page.locator("html")).toHaveAttribute("data-brand", "getpro");
    await expect(page.locator(".wf-brand-lockup-product--getpro")).toBeVisible();

    await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
    await expect(page.locator("main.gp-home")).toBeVisible({ timeout: 30_000 });

    await expect(page.locator("html")).toHaveAttribute("data-brand", "getpro");
    await expect(page.locator(".wf-brand-lockup-product--getpro")).toBeVisible();
    await expect(page.locator(".wf-brand-lockup-product--pro")).toBeHidden();

    await page.waitForTimeout(300);
    await expect(page.locator("html")).toHaveAttribute("data-brand", "getpro");
  });
});
