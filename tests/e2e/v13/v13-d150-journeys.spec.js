"use strict";

/**
 * D150 browser journeys. Implemented, not executed in D150.
 * They fail closed unless disposable browser authorization is present.
 * They are not registered in the default Playwright config.
 */

const { test, expect } = require("@playwright/test");
const { installLocalOnlyRoutes } = require("../../v13/helpers/v13BrowserIsolation");

function hold(testInfo, name) {
  if (
    process.env.GETPRO_V13_BROWSER_AUTHORIZED !== "1" ||
    process.env.GETPRO_V13_ALLOW_DB_WRITES !== "1" ||
    process.env.GETPRO_V13_DB_STAGES_AUTHORIZED !== "1"
  ) {
    testInfo.annotations.push({ type: "v13-result", description: "NOT_RUN" });
    throw new Error(`NOT_RUN: ${name} is implemented and waits for disposable browser authorization`);
  }
}

test.beforeEach(async ({ page }) => {
  const errors = [];
  const failures = [];
  page.on("pageerror", (error) => errors.push(String(error && error.message)));
  page.on("requestfailed", (request) => failures.push(request.url()));
  page._d150Errors = errors;
  page._d150Failures = failures;
  await installLocalOnlyRoutes(page, process.env.PLAYWRIGHT_E2E_PORT || "4187");
});

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required for the authorized browser journey`);
  return value;
}

async function signIn(page, email, password) {
  await page.goto("/login");
  await page.locator("input[name='login_email']").fill(email);
  await page.locator("input[name='password']").fill(password);
  await expect(page.locator("input[name='_csrf']")).toHaveCount(1);
  await page.locator("form").filter({ has: page.locator("input[name='login_email']") }).locator("button[type='submit']").click();
}

test("G224 laboratory counters match the received filter", async ({ page }, testInfo) => {
  hold(testInfo, "G224");
  await signIn(page, required("E2E_AC_ADMIN_EMAIL"), required("E2E_AC_ADMIN_PASSWORD"));
  await page.goto("/app/diagnostics/laboratory/queue?status=received");
  const tab = page.locator("[data-gp-ops-tab='received']");
  await expect(tab).toBeVisible();
  const shown = Number((await tab.locator(".gp-ops-status-tabs__count").innerText()).trim());
  const rows = await page.locator("[data-ac-screen='laboratory-queue'] table tbody tr").count();
  expect(shown).toBe(rows);
  await page.reload();
  await expect(tab.locator(".gp-ops-status-tabs__count")).toHaveText(String(shown));
  expect(page._d150Errors).toEqual([]);
});

test("G229 radiology counters match the pending filter", async ({ page }, testInfo) => {
  hold(testInfo, "G229");
  await signIn(page, required("E2E_AC_ADMIN_EMAIL"), required("E2E_AC_ADMIN_PASSWORD"));
  await page.goto("/app/diagnostics/radiology/queue?status=pending");
  const tab = page.locator("[data-gp-ops-tab='pending']");
  await expect(tab).toBeVisible();
  const shown = Number((await tab.locator(".gp-ops-status-tabs__count").innerText()).trim());
  const rows = await page.locator("[data-ac-screen='radiology-queue'] table tbody tr").count();
  expect(shown).toBe(rows);
  if (rows > 0) {
    await page.locator("[data-ac-screen='radiology-queue'] a[href*='/diagnostics/radiology/request/']").first().click();
    await expect(page.locator("[data-ac-print-region='radiology-request']")).toContainText("Patient");
    const findings = page.locator("[data-ac-rad-findings]");
    if (await findings.count()) await expect(findings.first()).not.toBeEmpty();
  }
  expect(page._d150Errors).toEqual([]);
});

test("G266 laboratory print region contains the patient and any recorded component", async ({ page }, testInfo) => {
  hold(testInfo, "G266");
  await signIn(page, required("E2E_AC_ADMIN_EMAIL"), required("E2E_AC_ADMIN_PASSWORD"));
  await page.goto("/app/diagnostics/laboratory/queue?status=resulted");
  const link = page.locator("[data-ac-screen='laboratory-queue'] table tbody tr a").first();
  await expect(link).toBeVisible();
  await link.click();
  const region = page.locator("[data-ac-print-region='laboratory-result']");
  await expect(region).toBeVisible();
  await expect(page.locator("[data-ac-print-region='laboratory-request']")).toContainText("Patient");
  await expect(region.locator("[data-ac-lab-component-value]").first()).not.toBeEmpty();
  expect(page._d150Errors).toEqual([]);
});

test("BB-05 HQ member form rejects a missing CSRF token", async ({ page }, testInfo) => {
  hold(testInfo, "BB-05");
  await signIn(page, required("E2E_BB_ADMIN_EMAIL"), required("E2E_BB_ADMIN_PASSWORD"));
  await page.goto("/hq/members/new");
  await expect(page.locator("input[name='_csrf']")).toHaveCount(1);
  await page.locator("input[name='_csrf']").evaluate((node) => {
    node.value = "";
  });
  await page.locator("input[name='full_name']").fill("Synthetic Member");
  await page.locator("form[data-bb-hq-add-member-form] button[type='submit']").click();
  await expect(page.getByRole("heading", { name: "Review new member" })).toHaveCount(0);
  expect(page._d150Errors).toEqual([]);
});

test("BB-04 sermon draft stays unpublished after reload", async ({ page }, testInfo) => {
  hold(testInfo, "BB-04");
  await signIn(page, required("E2E_BB_ADMIN_EMAIL"), required("E2E_BB_ADMIN_PASSWORD"));
  const stamp = Date.now();
  await page.goto(required("E2E_BB_SERMON_NEW_PATH"));
  await page.locator("input[name='title']").fill(`D150 sermon ${stamp}`);
  await page.locator("input[name='speakerName']").fill("Pastor Ada");
  await page.locator("input[name='preachedAt']").fill("2026-07-18");
  await page.locator("button[type='submit']").click();
  await page.reload();
  await expect(page.getByText("draft")).toBeVisible();
  await page.goto(required("E2E_BB_PUBLIC_SERMONS_PATH"));
  await expect(page.getByText(`D150 sermon ${stamp}`)).toHaveCount(0);
});

test("AC-PUB-01 public booking stays disabled", async ({ page }, testInfo) => {
  hold(testInfo, "AC-PUB-01");
  await page.goto(required("E2E_AC_PUBLIC_BOOK_PATH"));
  await expect(page.getByText("Booking not available")).toBeVisible();
  await expect(page.getByText(/Online booking is not enabled/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm booking" })).toHaveCount(0);
});

test("D14C login does not set a session cookie before the OTP code", async ({ page }, testInfo) => {
  hold(testInfo, "D14C");
  test.skip(process.env.GETPRO_V13_OTP_BROWSER_MOCK !== "1", "NOT_RUN: mocked OTP browser journey is separately gated");
  await page.goto("/login");
  await page.locator("input[name='login_email']").fill(required("E2E_BB_MEMBER_EMAIL"));
  await page.locator("input[name='password']").fill(required("E2E_BB_MEMBER_PASSWORD"));
  await page.locator("button[type='submit']").click();
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => /session/i.test(cookie.name))).toBe(false);
  await expect(page.getByText(/verification code/i)).toBeVisible();
});

test("CB-POSTING community settlement does not create a ledger entry", async ({ page }, testInfo) => {
  hold(testInfo, "CB-POSTING");
  await signIn(page, required("E2E_AC_ADMIN_EMAIL"), required("E2E_AC_ADMIN_PASSWORD"));
  await page.goto("/app/community-benefits");
  await expect(page.getByText(/posting disabled|not posted|no community discount|community benefits/i)).toBeVisible();
  await expect(page.locator("[data-ac-ledger-row]")).toHaveCount(0);
  expect(page._d150Errors).toEqual([]);
});
