"use strict";

/**
 * Website editor at phone, tablet, and desktop widths.
 * A draft stays off the public page until publish.
 */

const { test, expect } = require("@playwright/test");
const { installLocalOnlyRoutes } = require("../../v13/helpers/v13BrowserIsolation");

const WIDTHS = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

function hold(testInfo, name) {
  if (
    process.env.GETPRO_V13_BROWSER_AUTHORIZED !== "1" ||
    process.env.GETPRO_V13_ALLOW_DB_WRITES !== "1" ||
    process.env.GETPRO_V13_DB_STAGES_AUTHORIZED !== "1" ||
    process.env.GETPRO_AC_CMS_RESPONSIVE !== "1"
  ) {
    testInfo.annotations.push({ type: "v13-result", description: "NOT_RUN" });
    throw new Error(`NOT_RUN: ${name} waits for the isolated CMS viewport run`);
  }
}

async function fillVisible(page, name, value) {
  const field = page.locator(`[name='${name}']:visible`);
  if ((await field.count()) === 0) return;
  const kind = await field.first().evaluate((element) => `${element.tagName}:${element.getAttribute("type") || ""}`);
  if (kind.startsWith("SELECT")) {
    const selected = await field.first().selectOption(value).then(() => true).catch(() => false);
    if (!selected) await field.first().selectOption({ index: 1 });
    return;
  }
  if (kind.endsWith(":checkbox")) {
    await field.first().check();
    return;
  }
  await field.first().fill(value);
}

async function submitClinicRegistration(page, values) {
  await page.goto("/register-clinic");
  for (let step = 0; step < 4; step += 1) {
    if (/\/app|submitted|status/i.test(page.url()) && !/register-clinic/.test(page.url())) return;
    for (const [name, value] of Object.entries(values)) {
      await fillVisible(page, name, value);
    }
    const consent = page.locator("[data-gp-registration-consent] input[type='checkbox']:visible");
    if (await consent.count()) await consent.check();
    await page.locator("button[type='submit']:visible").last().click();
    await page.waitForLoadState("domcontentloaded");
  }
  const terms = page.getByRole("checkbox", { name: /Terms of Service/ });
  if (await terms.isVisible().catch(() => false)) await terms.check();
  const createClinic = page.getByRole("button", { name: "Create clinic" });
  if (await createClinic.isVisible().catch(() => false)) {
    await createClinic.click();
    await page.waitForLoadState("domcontentloaded");
  }
}

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("text and image sections stay in the viewport and publish only after confirmation", async ({ page }, testInfo) => {
  hold(testInfo, "CMS-RESPONSIVE");
  await installLocalOnlyRoutes(page, process.env.PLAYWRIGHT_E2E_PORT || "4194");
  const stamp = Date.now();
  const heading = `G333 section ${stamp}`;
  const email = `g333-cms-${stamp}@example.invalid`;
  const password = "clinic-admin-pass-12";
  await submitClinicRegistration(page, {
    clinicName: `G333 CMS ${stamp}`,
    clinicType: "clinic",
    countryCode: "ZM",
    city: "Lusaka",
    contactName: "G333 Editor",
    contactEmail: email,
    phone_national: `92${String(stamp).slice(-7)}`,
    password,
    passwordConfirm: password,
  });
  if (!/\/app/.test(page.url())) {
    await page.goto("/login");
    await page.locator("input[name='login_email']").fill(email);
    await page.locator("input[name='password']").fill(password);
    await page.locator("form[data-ac-login-form] button[type='submit']").click();
  }
  await expect(page).toHaveURL(/\/app/);

  for (const viewport of WIDTHS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/app/settings/website/sections");
    await expect(page.locator("[data-ac-website-cms-nav='1']")).toBeVisible();
    await expect(page.locator("[data-ac-mw-nav='publish']")).toBeVisible();
    expect(await overflow(page), viewport.name).toBeLessThanOrEqual(1);
    if (viewport.width < 900) {
      await expect(page.locator(".ac-mw-editor__tabs")).toBeHidden();
      await expect(page.locator(".ac-mw-editor__rail-nav")).toBeVisible();
    } else {
      await expect(page.locator(".ac-mw-editor__tabs")).toBeVisible();
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/settings/website/sections");
  await page.locator("[data-ac-mw-open='ac-mw-add-section']").click();
  await page.locator("#ac-mw-add-section input[name='type'][value='text']").check();
  await page.locator("#ac-mw-add-section button[type='submit']").click();
  await page.locator("[data-ac-section-id] a", { hasText: "Settings" }).last().click();
  await expect(page.locator("[data-ac-draft-published='1']")).toBeVisible();
  await page.locator("input[name='title']").fill("");
  await page.locator("button[type='submit']", { hasText: "Save Changes" }).click();
  await expect(page.locator("[data-ac-section-validation]")).toBeVisible();
  await page.locator("input[name='title']").fill("Text section");
  await page.locator("input[name='heading']").fill(heading);
  await page.locator("textarea[name='body']").fill("Draft section body");
  await page.locator("input[name='title']").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("input[name='heading']")).toBeFocused();
  await page.locator("button[type='submit']", { hasText: "Save Changes" }).click();
  const previewHref = await page.locator("a[href*='website_mode=draft']").first().getAttribute("href");
  expect(previewHref).toBeTruthy();
  await page.goto(previewHref);
  await expect(page.locator("body")).toContainText(heading);
  const liveHref = previewHref.split("?")[0];
  await page.goto(liveHref);
  await expect(page.locator("body")).not.toContainText(heading);

  await page.goto("/app/settings/website/sections");
  await page.locator("[data-ac-mw-open='ac-mw-add-section']").click();
  await page.locator("#ac-mw-add-section input[name='type'][value='image_text']").check();
  await page.locator("#ac-mw-add-section button[type='submit']").click();
  await page.locator("[data-ac-section-id] a", { hasText: "Settings" }).last().click();
  await expect(page.locator("input[name='imageAlt']")).toBeVisible();
  await page.locator("input[name='title']").fill("Image section");
  await page.locator("input[name='imageAlt']").fill("");
  await page.locator("button[type='submit']", { hasText: "Save Changes" }).click();
  await expect(page.locator("[data-ac-section-validation]")).toBeVisible();
  await expect(page.locator("input[name='imageAlt']")).toHaveAttribute("aria-invalid", "true");
  await page.locator("input[name='imageAlt']").fill("Clinic entrance");
  await page.locator("input[name='heading']").fill(`${heading} image`);
  await page.locator("button[type='submit']", { hasText: "Save Changes" }).click();

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/app/settings/website/publish");
  await expect(page.locator("[data-ac-draft-published='1']")).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/settings/website/publish");
  const box = await page.locator("[data-ac-draft-published='1']").boundingBox();
  expect(box.width).toBeGreaterThan(700);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  const publishedResponse = page.waitForResponse((response) =>
    response.url().includes("/website/publish") && response.request().method() === "POST"
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("[data-ac-website-action='publish']").click();
  const published = await publishedResponse;
  expect(published.ok() || (published.status() >= 300 && published.status() < 400)).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(liveHref);
  await expect(page.locator("body")).toContainText(heading);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});
