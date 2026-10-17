const { test, expect } = require("@playwright/test");

async function smokePage(page, path, markers) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response && response.status()).toBeLessThan(500);
  for (const marker of markers) await expect(page.locator("body")).toContainText(marker);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(errors, `console errors on ${path}`).toEqual([]);
}

test.describe("V2.10 ActiveClinic browser smoke", () => {
  test("public About is 2.10", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "X-Forwarded-Host": "activeclinic.pronline.org" });
    await smokePage(page, "/about", ["ActiveClinic", "2.10"]);
  });

  test("registration, login, portal and directory entry surfaces load", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "X-Forwarded-Host": "activeclinic.pronline.org" });
    await smokePage(page, "/register-clinic", ["Register"]);
    await smokePage(page, "/login", ["Sign in"]);
    await smokePage(page, "/clinics", ["Clinics"]);
    const portal = await page.goto("/patient/login", { waitUntil: "domcontentloaded" });
    expect(portal.status()).toBeLessThan(500);
  });

  test("guest booking and theme routes remain reachable", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "X-Forwarded-Host": "activeclinic.pronline.org" });
    const booking = await page.goto("/clinics", { waitUntil: "domcontentloaded" });
    expect(booking.status()).toBeLessThan(500);
    const theme = await page.goto("/clinics/activeclinic-demo/website/themes", {
      waitUntil: "domcontentloaded",
    });
    expect([200, 302, 303, 401, 403, 404]).toContain(theme.status());
  });
});
