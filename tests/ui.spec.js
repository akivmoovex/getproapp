// @ts-check
const { test, expect } = require("@playwright/test");

/**
 * Stable footer row (copyright year + links text can drift).
 * @param {import('@playwright/test').Page} page
 */
function maskFooter(page) {
  return page.locator(".pro-footer-bottom");
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test.describe("Visual regression", () => {
  test("homepage", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main.gp-home")).toBeVisible({ timeout: 30_000 });
    // Story block uses JS timers in some browsers; mask entire section for pixel stability.
    await expect(page.locator("body")).toHaveScreenshot("homepage.png", {
      fullPage: true,
      mask: [maskFooter(page), page.locator(".gp-home-story")],
    });
  });

  test("directory page", async ({ page }) => {
    await page.goto("/directory", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".pro-directory-toolbar")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("body")).toHaveScreenshot("directory.png", {
      fullPage: true,
      mask: [
        maskFooter(page),
        page.locator(".pro-directory-results"),
        page.locator(".pro-directory-toolbar__count"),
        page.locator(".pro-directory-toolbar__filters"),
      ],
    });
  });

  test("company page", async ({ page }) => {
    await page.goto("/company/1", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1.pro-company-profile__title")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("body")).toHaveScreenshot("company.png", {
      fullPage: true,
      mask: [
        maskFooter(page),
        page.locator(".pro-company-profile__logo-wrap"),
        page.locator(".pro-company-profile__reviews"),
        page.locator(".pro-company-sticky-cta"),
        page.locator("#lead_form"),
        page.locator("#lead_status"),
      ],
    });
  });
});
