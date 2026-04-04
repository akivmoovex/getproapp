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
  await page.addInitScript(() => {
    const el = document.createElement("style");
    el.textContent = "html{overflow-y:scroll!important;}";
    document.documentElement.appendChild(el);
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await freezeUiMotion(page);
});

test.describe("Public layout band alignment", () => {
  const tol = 2;

  /**
   * Horizontal content-box edges (inside padding) for layout-band elements.
   * @param {import('@playwright/test').Locator} locator
   */
  async function contentBoxHorizontalEdges(locator) {
    return locator.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      const pl = parseFloat(cs.paddingLeft) || 0;
      const pr = parseFloat(cs.paddingRight) || 0;
      return { left: r.left + pl, right: r.right - pr };
    });
  }

  /**
   * @param {import('@playwright/test').Page} page
   * @param {string} headerSel
   * @param {import('@playwright/test').Locator} band
   */
  async function expectHeaderBandEdgesMatch(page, headerSel, band) {
    const header = page.locator(headerSel);
    await expect(header).toBeVisible({ timeout: 30_000 });
    await expect(band).toBeVisible({ timeout: 30_000 });
    const h = await contentBoxHorizontalEdges(header);
    const b = await contentBoxHorizontalEdges(band);
    expect(Math.abs(h.left - b.left), "content left edge").toBeLessThanOrEqual(tol);
    expect(Math.abs(h.right - b.right), "content right edge").toBeLessThanOrEqual(tol);
  }

  /**
   * @param {import('@playwright/test').Locator} search
   * @param {import('@playwright/test').Locator} band
   */
  async function expectSearchFillsBandContent(search, band) {
    await expect(search).toBeVisible({ timeout: 30_000 });
    await expect(band).toBeVisible({ timeout: 30_000 });
    const s = await search.boundingBox();
    const inner = await contentBoxHorizontalEdges(band);
    expect(s, "search bounding box").toBeTruthy();
    expect(Math.abs(s.x - inner.left), "search outer left vs band content left").toBeLessThanOrEqual(tol);
    expect(Math.abs(s.x + s.width - inner.right), "search outer right vs band content right").toBeLessThanOrEqual(
      tol,
    );
  }

  for (const size of [
    { width: 375, height: 720 },
    { width: 768, height: 720 },
    { width: 1280, height: 720 },
  ]) {
    test(`home + directory bands match header @ ${size.width}px`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto("/", { waitUntil: "networkidle", timeout: 60_000 });
      await waitForFonts(page);
      const heroBand = page.locator("main.gp-home .ds-container").first();
      await expectHeaderBandEdgesMatch(page, ".app-top-app-bar__inner", heroBand);
      await expectSearchFillsBandContent(page.locator("#site-search-bar").first(), heroBand);

      await page.goto("/directory?q=&city=", { waitUntil: "networkidle", timeout: 60_000 });
      await waitForFonts(page);
      const dirBand = page.locator(".ds-container.directory-page").first();
      await expectHeaderBandEdgesMatch(page, ".app-top-app-bar__inner", dirBand);
      await expectSearchFillsBandContent(page.locator("#site-search-bar").first(), dirBand);
    });

    test(`company profile inner band matches header @ ${size.width}px`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto("/company/1", { waitUntil: "networkidle", timeout: 60_000 });
      await waitForFonts(page);
      await expectHeaderBandEdgesMatch(page, ".app-top-app-bar__inner", page.locator(".pro-company-profile__inner"));
    });
  }
});

test.describe("SearchBar cross-page consistency", () => {
  /**
   * Same snapshot name twice: second assertion compares directory against the baseline
   * captured from home, so any visual drift between routes fails the test. Raw PNG buffers
   * are not compared (metadata/timing can differ); pixel diff uses project thresholds.
   */
  test("home and directory #site-search-bar match one baseline", async ({ page }) => {
    const search = page.locator("#site-search-bar");
    const masks = [search.locator(".pro-ac-dropdown")];

    await page.goto("/", { waitUntil: "networkidle", timeout: 60_000 });
    await expect(search).toBeVisible({ timeout: 30_000 });
    await waitForFonts(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(search).toHaveScreenshot("search-bar-consistent.png", { mask: masks });

    await page.goto("/directory?q=&city=", { waitUntil: "networkidle", timeout: 60_000 });
    await expect(search).toBeVisible({ timeout: 30_000 });
    await waitForFonts(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(search).toHaveScreenshot("search-bar-consistent.png", { mask: masks });
  });
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
