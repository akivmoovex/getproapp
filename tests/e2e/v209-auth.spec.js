"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const ROOT = path.join(__dirname, "..", "..");
const AUTH_DIR = path.join(ROOT, "tmp", "e2e-auth");
const BASE_URL = process.env.E2E_BASE_URL || "http://127.0.0.1:4175";

test.describe("V209 minimal cross-product authentication", () => {
  test("BB admin storage state reaches the HQ landing and editor capability", async ({ browser }) => {
    test.skip(!fs.existsSync(path.join(AUTH_DIR, "bb-admin.json")), "run v209-auth-setup first");
    const context = await browser.newContext({
      storageState: path.join(AUTH_DIR, "bb-admin.json"),
      extraHTTPHeaders: {
        "X-Forwarded-Host": "blessboard.neuniversity.org",
        "X-Forwarded-Proto": "http",
      },
    });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/hq`);
    await expect(page).toHaveURL(/\/hq(?:\/)?$/);
    await expect(page.getByRole("link", { name: /website|build|edit/i }).first()).toBeVisible();
    await context.close();
  });

  test("AC admin storage state reaches the staff landing and editor capability", async ({ browser }) => {
    test.skip(!fs.existsSync(path.join(AUTH_DIR, "ac-admin.json")), "run v209-auth-setup first");
    const context = await browser.newContext({
      storageState: path.join(AUTH_DIR, "ac-admin.json"),
      extraHTTPHeaders: {
        "X-Forwarded-Host": "activeclinic.neuniversity.org",
        "X-Forwarded-Proto": "http",
      },
    });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/app`);
    await expect(page).toHaveURL(/\/app/);
    await expect(page.getByRole("link", { name: /website|settings/i }).first()).toBeVisible();
    await context.close();
  });
});
