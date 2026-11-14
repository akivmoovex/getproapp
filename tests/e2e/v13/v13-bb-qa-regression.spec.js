"use strict";

/**
 * BlessBoard browser journeys. They exercise the real forms when disposable
 * browser provisioning is authorized. Otherwise they fail closed as NOT_RUN.
 */

const { test, expect } = require("@playwright/test");
const { assertV13CiDatabaseUrl } = require("../../v13/helpers/v13CiDatabaseGuard");

function browserAuthorized() {
  if (process.env.GETPRO_V13_BROWSER_AUTHORIZED !== "1") return false;
  if (process.env.GETPRO_V13_ALLOW_DB_WRITES !== "1") return false;
  if (process.env.GETPRO_V13_DB_STAGES_AUTHORIZED !== "1") return false;
  try {
    assertV13CiDatabaseUrl(process.env.E2E_DATABASE_URL || "");
    return true;
  } catch (_error) {
    return false;
  }
}

function hold(testInfo, name) {
  if (browserAuthorized()) return;
  testInfo.annotations.push({ type: "v13-result", description: "NOT_RUN" });
  throw new Error(`NOT_RUN: ${name} is implemented and waits for disposable browser authorization`);
}

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
  await expect(page.locator("[role='alert']")).toHaveCount(0);
}

test.describe.configure({ mode: "serial" });

test.describe("V13 BB QA browser regression", () => {
  test("BB-01 administrator creates a homepage section", async ({ page }, testInfo) => {
    hold(testInfo, "BB-01 create");
    await signIn(page, required("E2E_BB_ADMIN_EMAIL"), required("E2E_BB_ADMIN_PASSWORD"));
    await page.goto("/hq/website");
    await page.locator("a[href*='/pages/']").first().click();
    await page.locator("input[name='section_key']").fill("text_intro");
    await page.locator("input[name='section_type']").fill("text");
    await page.locator("input[name='heading']").fill("V13 D19 heading");
    await expect(page.locator("form[data-bb-section-create-form] input[name='_csrf']")).toHaveCount(1);
    await page.locator("form[data-bb-section-create-form] button[type='submit']").click();
    await expect(page.getByText("V13 D19 heading")).toBeVisible();
  });

  test("BB-01 administrator edits a newly created homepage section", async ({ page }, testInfo) => {
    hold(testInfo, "BB-01 edit");
    await signIn(page, required("E2E_BB_ADMIN_EMAIL"), required("E2E_BB_ADMIN_PASSWORD"));
    await page.goto("/hq/website");
    await page.locator("a[href*='/pages/']").first().click();
    await page.locator("input[name='heading']").last().fill("V13 D19 edited");
    await page.locator("input[name='buttonUrl'], input[name='button_url']").first().fill("javascript:alert(1)");
    await page.locator("form").last().locator("button[type='submit']").click();
    await expect(page.getByText(/javascript/i)).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("V13 D19 edited");
  });

  test("BB-02 administrator uploads and publishes an announcement", async ({ page }, testInfo) => {
    hold(testInfo, "BB-02 upload");
    await signIn(page, required("E2E_BB_ADMIN_EMAIL"), required("E2E_BB_ADMIN_PASSWORD"));
    await page.goto("/hq/announcements/new");
    await page.locator("input[name='title']").fill("V13 D19 notice");
    await page.locator("textarea[name='body']").fill("Published notice");
    await page.locator("input[type='file']").setInputFiles({
      name: "notice.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
    });
    await expect(page.locator("input[name='_csrf']")).toHaveCount(1);
    await page.locator("button[type='submit'][value='publish'], button[name='_intent'][value='publish']").click();
    await expect(page.getByText("V13 D19 notice")).toBeVisible();
  });

  test("BB-02 public visitor views the published announcement", async ({ page }, testInfo) => {
    hold(testInfo, "BB-02 public");
    await page.goto(required("E2E_BB_PUBLIC_ANNOUNCEMENTS_PATH"));
    await expect(page.getByText("V13 D19 notice")).toBeVisible();
    await expect(page.getByText("Hidden draft")).toHaveCount(0);
  });

  test("BB-03 administrator creates and publishes an event", async ({ page }, testInfo) => {
    hold(testInfo, "BB-03");
    await signIn(page, required("E2E_BB_BRANCH_ADMIN_EMAIL"), required("E2E_BB_BRANCH_ADMIN_PASSWORD"));
    await page.goto("/branch/events/new");
    await expect(page.getByRole("heading", { name: "New event" })).toBeVisible();
    await page.locator("input[name='title']").fill("V13 D19 gathering");
    await page.locator("input[name='event_date']").fill("2026-12-01");
    await page.locator("input[name='start_time']").fill("11:00 AM");
    await page.locator("input[name='end_time']").fill("9:00 AM");
    await page.locator("button[name='_intent'][value='publish']").click();
    await expect(page.locator("[role='alert']")).toBeVisible();
    await page.locator("input[name='end_time']").fill("12:00 PM");
    await page.locator("button[name='_intent'][value='publish']").click();
    await expect(page.getByText("V13 D19 gathering")).toBeVisible();
  });

  test("BB-04 administrator creates and publishes a sermon", async ({ page }, testInfo) => {
    hold(testInfo, "BB-04");
    await signIn(page, required("E2E_BB_BRANCH_ADMIN_EMAIL"), required("E2E_BB_BRANCH_ADMIN_PASSWORD"));
    await page.goto("/branch/sermons/new");
    await expect(page.getByRole("heading", { name: "Add sermon" })).toBeVisible();
    await page.locator("input[name='title']").fill("V13 D19 sermon");
    await page.locator("input[name='speaker']").fill("V13 Speaker");
    await page.locator("input[name='sermon_date']").fill("2026-02-31");
    await page.locator("input[name='media_url']").fill("http://media.v13d19.example/clip.mp3");
    await page.locator("button[name='_intent'][value='publish']").click();
    await expect(page.locator("[role='alert']")).toBeVisible();
    await page.locator("input[name='sermon_date']").fill("2026-07-18");
    await page.locator("input[name='media_url']").fill("https://media.v13d19.example/clip.mp3");
    await page.locator("button[name='_intent'][value='publish']").click();
    await expect(page.getByText("V13 D19 sermon")).toBeVisible();
  });

  test("BB-05 HQ administrator registers a new member", async ({ page }, testInfo) => {
    hold(testInfo, "BB-05");
    await signIn(page, required("E2E_BB_ADMIN_EMAIL"), required("E2E_BB_ADMIN_PASSWORD"));
    await page.goto("/hq/members/new");
    const token = await page.locator("form[data-bb-hq-add-member-form] input[name='_csrf']").inputValue();
    await expect(token.length).toBeGreaterThan(8);
    await page.locator("input[name='full_name']").fill("V13 D19 Member");
    await page.locator("input[name='email']").fill("member-browser@v13d19.example");
    await page.locator("input[name='phone']").fill("977000111");
    const response = await page.request.post("/hq/members/new", { form: { full_name: "No Token" } });
    expect(response.status()).toBe(403);
    await page.locator("form[data-bb-hq-add-member-form] button[type='submit']").click();
    await expect(page.getByText("Portal activation remains pending")).toBeVisible();
  });

  test("BB-06 member activates portal access", async ({ page }, testInfo) => {
    hold(testInfo, "BB-06 activate");
    const token = required("E2E_BB_MEMBER_INVITE_TOKEN");
    await page.goto(`/member/invite/accept?token=${encodeURIComponent(token)}`);
    await page.locator("input[name='password']").fill("V13-synthetic-qa-password");
    await page.locator("input[name='password_confirm']").fill("V13-synthetic-qa-password");
    await expect(page.locator("input[name='_csrf']")).toHaveCount(1);
    await page.locator("button[type='submit']").click();
    await page.goto(`/member/invite/accept?token=${encodeURIComponent(token)}`);
    await page.locator("input[name='password']").fill("V13-synthetic-qa-password");
    await page.locator("input[name='password_confirm']").fill("V13-synthetic-qa-password");
    await page.locator("button[type='submit']").click();
    await expect(page.locator("[role='alert']")).toBeVisible();
  });

  test("BB-06 member logs in with the activated account", async ({ page }, testInfo) => {
    hold(testInfo, "BB-06 login");
    await page.goto("/member/login");
    await page.locator("input[name='member_number']").fill(required("E2E_BB_MEMBER_NUMBER"));
    await page.locator("input[name='password']").fill("V13-synthetic-qa-password");
    await page.locator("button[type='submit']").click();
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("link", { name: /website|members admin|hq/i })).toHaveCount(0);
  });

  test("BB-24 public visitor contacts a selected church", async ({ page }, testInfo) => {
    hold(testInfo, "BB-24 contact");
    await page.goto("/directory");
    await page.getByRole("link", { name: required("E2E_BB_CHURCH_A_NAME") }).click();
    await expect(page.getByRole("link", { name: /register a new church/i })).toHaveCount(0);
    await page.getByRole("link", { name: /contact/i }).first().click();
    await page.locator("#bb-church-contact-name").fill("Directory Visitor");
    await page.locator("#bb-church-contact-email").fill("visitor@v13d19.example");
    await page.locator("#bb-church-contact-message").fill("Message for the selected church");
    await page.locator("form").filter({ has: page.locator("#bb-church-contact-message") }).locator("button[type='submit']").click();
    await expect(page.getByText(/sent|received|thank/i)).toBeVisible();
  });

  test("BB-24 church administrator receives the correct enquiry", async ({ page }, testInfo) => {
    hold(testInfo, "BB-24 inbox");
    await signIn(page, required("E2E_BB_ADMIN_EMAIL"), required("E2E_BB_ADMIN_PASSWORD"));
    await page.goto(required("E2E_BB_ENQUIRY_INBOX_PATH"));
    await expect(page.getByText("Message for the selected church")).toBeVisible();
    await page.goto(required("E2E_BB_OTHER_ENQUIRY_INBOX_PATH"));
    await expect(page.getByText("Message for the selected church")).toHaveCount(0);
  });

  test("INV-01 staff member accepts invitation and sets password", async ({ page }, testInfo) => {
    hold(testInfo, "INV-01 accept");
    const token = required("E2E_BB_STAFF_INVITE_TOKEN");
    await page.goto(`/invite/accept?token=${encodeURIComponent(token)}`);
    await page.locator("input[name='password']").fill("V13-synthetic-qa-password");
    await page.locator("input[name='password_confirm']").fill("V13-synthetic-qa-password");
    await expect(page.locator("input[name='token']")).toHaveValue(token);
    await expect(page.locator("input[name='_csrf']")).toHaveCount(1);
    await page.locator("button[type='submit']").click();
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
    await page.goto(`/invite/accept?token=${encodeURIComponent(token)}`);
    await page.locator("input[name='password']").fill("V13-synthetic-qa-password");
    await page.locator("input[name='password_confirm']").fill("V13-synthetic-qa-password");
    await page.locator("button[type='submit']").click();
    await expect(page.locator("[role='alert'], .error")).toBeVisible();
  });

  test("INV-01 invited staff member signs in with the correct permissions", async ({ page }, testInfo) => {
    hold(testInfo, "INV-01 login");
    await signIn(page, required("E2E_BB_STAFF_EMAIL"), "V13-synthetic-qa-password");
    await expect(page).not.toHaveURL(/\/login$/);
    await page.goto("/hq/members/new");
    const denied = page.url().includes("/login") || (await page.locator("[role='alert']").count()) > 0;
    expect(denied).toBe(true);
  });

  test("D14C OTP session gate stays blocked on existing deployments", async ({ page }, testInfo) => {
    hold(testInfo, "OTP gate");
    await signIn(page, required("E2E_BB_ADMIN_EMAIL"), required("E2E_BB_ADMIN_PASSWORD"));
    await expect(page.getByLabel(/one-time|verification code/i)).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/login$/);
  });
});
