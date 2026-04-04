// @ts-check
const { test, expect } = require("@playwright/test");

/**
 * Stable footer row (copyright year + links text can drift).
 * @param {import('@playwright/test').Page} page
 */
function maskFooter(page) {
  return page.locator(".pro-footer-bottom");
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function freezeUiMotion(page) {
  await page.addStyleTag({
    content:
      "html,html *,html *::before,html *::after{animation-duration:0.001ms!important;animation-iteration-count:1!important;transition-duration:0.001ms!important;scroll-behavior:auto!important}",
  });
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function waitForFonts(page) {
  await page.evaluate(() => document.fonts.ready);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await freezeUiMotion(page);
});

test.describe("Visual regression", () => {
  test("homepage", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle", timeout: 60_000 });
    await expect(page.locator("main.gp-home")).toBeVisible({ timeout: 30_000 });
    const search = page.locator("#site-search-bar");
    await expect(search).toBeVisible({ timeout: 30_000 });
    await waitForFonts(page);
    await expect(search).toHaveScreenshot("homepage.png", {
      mask: [search.locator(".pro-ac-dropdown")],
    });
  });

  test("directory page", async ({ page }) => {
    await page.goto("/directory", { waitUntil: "networkidle", timeout: 60_000 });
    await expect(page.locator(".pro-directory-toolbar")).toBeVisible({ timeout: 30_000 });
    const search = page.locator("#site-search-bar");
    await expect(search).toBeVisible({ timeout: 30_000 });
    await waitForFonts(page);
    await expect(search).toHaveScreenshot("directory.png", {
      mask: [
        search.locator(".pro-ac-dropdown"),
        page.locator(".pro-directory-toolbar__count"),
        page.locator(".pro-directory-toolbar__filters"),
      ],
    });
  });

  test("company page", async ({ page }) => {
    await page.goto("/company/1", { waitUntil: "networkidle", timeout: 60_000 });
    await expect(page.locator("h1.pro-company-profile__title")).toBeVisible({ timeout: 30_000 });
    await waitForFonts(page);
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
