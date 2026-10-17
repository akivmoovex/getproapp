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

test.describe("V2.10 BlessBoard browser smoke", () => {
  test("public About is 2.10", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "X-Forwarded-Host": "blessboard.pronline.org" });
    await smokePage(page, "/about", ["BlessBoard", "2.10"]);
  });

  test("registration, login and member entry surfaces load", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "X-Forwarded-Host": "blessboard.pronline.org" });
    await smokePage(page, "/register-church", ["Register"]);
    await smokePage(page, "/login", ["Sign in"]);
    const member = await page.goto("/member", { waitUntil: "domcontentloaded" });
    expect(member.status()).toBeLessThan(500);
  });

  test("prayer navigation and public website routes are wired", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "X-Forwarded-Host": "blessboard.pronline.org" });
    const member = await page.goto("/member/prayer-request", { waitUntil: "domcontentloaded" });
    expect([200, 301, 302, 303, 401, 403, 404]).toContain(member.status());
    const editor = await page.goto("/hq/website", { waitUntil: "domcontentloaded" });
    expect(editor.status()).toBeLessThan(500);
  });
});
