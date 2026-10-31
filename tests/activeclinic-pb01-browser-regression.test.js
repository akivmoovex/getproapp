"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const baseUrl = process.env.AC_QA_BASE_URL || "http://v212-ac-app:3000";

test("PB-01 patient wizard preserves review step and creates a patient", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const suffix = Date.now();
  try {
    await page.goto(`${baseUrl}/app`);
    await page.locator('input[name="login_email"]').fill(
      "demo_receptionist@demo.activeclinic.example"
    );
    await page.locator('input[name="password"]').fill(
      "V212-QA-Random-AC-9!"
    );
    await page.locator('form button[type="submit"]').click();
    await page.goto(`${baseUrl}/app/patients/new`);
    await page.getByRole("button", { name: /None of these/ }).click();
    await page.locator('input[name="first_name"]').fill("QA");
    await page.locator('input[name="last_name"]').fill(`PB01${suffix}`);
    await page.locator('input[name="date_of_birth"]').fill("1990-01-01");
    await page.locator('input[name="phone_national"]').fill(`097${String(suffix).slice(-7)}`);
    await page.getByRole("button", { name: "Review" }).click();
    await assert.doesNotReject(
      page.getByText("Registration review").waitFor({ state: "visible" })
    );
    await page.getByRole("button", { name: "Create patient" }).click();
    await assert.doesNotReject(
      page.getByText("Administrative registration completed successfully.").waitFor({
        state: "visible",
      })
    );
  } finally {
    await browser.close();
  }
});
