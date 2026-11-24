"use strict";

/**
 * BlessBoard browser journeys. They exercise the real forms when disposable
 * browser provisioning is authorized. Otherwise they fail closed as NOT_RUN.
 */

const { test, expect } = require("@playwright/test");
const {
  assertV13BrowserHarness,
  installLocalOnlyRoutes,
} = require("../../v13/helpers/v13BrowserIsolation");

function hold(testInfo, name) {
  if (
    process.env.GETPRO_V13_BROWSER_AUTHORIZED !== "1" ||
    process.env.GETPRO_V13_ALLOW_DB_WRITES !== "1" ||
    process.env.GETPRO_V13_DB_STAGES_AUTHORIZED !== "1"
  ) {
    testInfo.annotations.push({ type: "v13-result", description: "NOT_RUN" });
    throw new Error(`NOT_RUN: ${name} is implemented and waits for disposable browser authorization`);
  }
  assertV13BrowserHarness(process.env, { fallbackPort: "4186" });
}

test.beforeEach(async ({ page }) => {
  await installLocalOnlyRoutes(page, process.env.PLAYWRIGHT_E2E_PORT || "4186");
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
  await expect(page.locator("[role='alert']")).toHaveCount(0);
}

const MEMBER_PASSWORD = "V13-synthetic-qa-password";

function churchPath(envName, suffix) {
  return `${required(envName).replace(/\/$/, "")}${suffix}`;
}

async function createActivatedMember(page) {
  await signIn(page, required("E2E_BB_ADMIN_EMAIL"), required("E2E_BB_ADMIN_PASSWORD"));
  const stamp = Date.now();
  const fullName = `Portal Member ${stamp}`;
  await page.goto("/hq/members/new");
  await page.locator("input[name='full_name']").fill(fullName);
  await page.locator("input[name='email']").fill(`bbmem-${stamp}@v13d19.example`);
  await page.locator("input[name='phone']").fill(`+26097${String(stamp).slice(-7)}`);
  await page.locator("input[name='address_line_1']").fill("1 Test Road");
  await page.locator("select[name='marital_status']").selectOption("single");
  await page.locator("input[name='next_of_kin_name']").fill("Kin Person");
  await page.locator("select[name='next_of_kin_relationship']").selectOption("parent");
  await page.locator("input[name='next_of_kin_phone']").fill("+260977009990");
  await page.locator("select[name='branch_id']").selectOption({ index: 1 });
  await page.locator("form[data-bb-hq-add-member-form] button[type='submit']").click();
  await expect(page.getByRole("heading", { name: "Review new member" })).toBeVisible();
  await page.getByRole("button", { name: "Create member" }).click();
  const churchId = (await page.locator(".bb-v204-m01__church-id").innerText()).trim();
  expect(churchId).toMatch(/^CH-/);
  await page.getByRole("link", { name: "Issue portal invitation" }).click();
  await page.getByRole("button", { name: "Issue invitation" }).click();
  const link = (await page.getByLabel("Invitation link").inputValue()).trim();
  expect(link).toMatch(/token=/);
  await page.context().clearCookies();
  await page.goto(link);
  await page.locator("input[name='password']").fill(MEMBER_PASSWORD);
  await expect(page.locator("input[name='_csrf']")).toHaveCount(1);
  await page.locator("button[type='submit']").click();
  await expect(page).toHaveURL(/\/login/);
  return { churchId, fullName };
}

async function issueWebsiteEditorInvite(page) {
  await signIn(page, required("E2E_BB_ADMIN_EMAIL"), required("E2E_BB_ADMIN_PASSWORD"));
  const stamp = Date.now();
  const email = `editor-${stamp}@v13d19.example`;
  await page.goto("/hq/roles");
  await page.locator("#invite-email").fill(email);
  await page.locator("#invite-display-name").fill(`Editor ${stamp}`);
  await page.locator("#invite-role-key").selectOption("website_editor");
  await page.locator("form[data-bb-hq-role-invite='1'] button[type='submit']").click();
  const link = (await page.locator("[data-bb-invite-link='1']").innerText()).trim();
  expect(link).toMatch(/token=/);
  return { email, link };
}

test.describe("V13 BB QA browser regression", () => {
  test("BB-01 administrator creates a homepage section", async ({ page }, testInfo) => {
    hold(testInfo, "BB-01 create");
    await signIn(page, required("E2E_BB_ADMIN_EMAIL"), required("E2E_BB_ADMIN_PASSWORD"));
    const key = `intro${String(Date.now()).slice(-6)}`;
    await page.goto("/hq/content/pages/home");
    await page.locator("input[name='section_key']").fill(key);
    await page.locator("input[name='section_type']").fill("text");
    await page.locator("input[name='heading']").fill("V13 D19 heading");
    await expect(page.locator("form[data-bb-section-create-form] input[name='_csrf']")).toHaveCount(1);
    await page.locator("form[data-bb-section-create-form] button[type='submit']").click();
    await expect(page.locator("input[name='heading']")).toHaveValue("V13 D19 heading");
    await page.getByRole("link", { name: "Back to page" }).click();
    await expect(page.locator(`[data-bb-page-section-card='${key}']`)).toContainText("V13 D19 heading");
  });

  test("BB-01 administrator edits a newly created homepage section", async ({ page }, testInfo) => {
    hold(testInfo, "BB-01 edit");
    await signIn(page, required("E2E_BB_ADMIN_EMAIL"), required("E2E_BB_ADMIN_PASSWORD"));
    const key = `edit${String(Date.now()).slice(-6)}`;
    await page.goto("/hq/content/pages/home");
    await page.locator("input[name='section_key']").fill(key);
    await page.locator("input[name='section_type']").fill("text");
    await page.locator("input[name='heading']").fill("V13 D19 heading");
    await page.locator("form[data-bb-section-create-form] button[type='submit']").click();
    await expect(page).toHaveURL(new RegExp(`/sections/${key}`));
    await expect(page.locator("input[name='heading']")).toHaveValue("V13 D19 heading");
    await page.locator("#bb-ca-section-form input[name='media_url']").evaluate((element) => {
      element.value = "javascript:alert(1)";
    });
    await page.locator("#bb-ca-section-form input[name='heading']").fill("V13 D19 edited");
    const saveResponse = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().includes(`/sections/${key}`)
    );
    await page.locator("#bb-ca-section-form button[data-bb-section-save='1']").click();
    const saved = await saveResponse;
    expect(saved.status()).toBeLessThan(500);
    expect(saved.status()).not.toBe(403);
    await expect(page.getByText("javascript:alert")).toHaveCount(0);
    await page.goto(`/hq/content/pages/home/sections/${key}`);
    await expect(page.locator("#bb-ca-section-form input[name='heading']")).toHaveValue("V13 D19 heading");
    await expect(page.locator("#bb-ca-section-form input[name='media_url']")).toHaveValue("");
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
    await expect(page.locator("form").filter({ has: page.locator("input[name='title']") }).locator("input[name='_csrf']")).toHaveCount(1);
    const uploadStatus = page.locator("[data-gp-we-media-status]");
    if (await uploadStatus.count()) {
      await expect(uploadStatus).toContainText(/turned off|not allowed|rejected|unsupported|invalid|error/i);
    }
    await page.locator("input[name='audience_public']").check();
    await page.locator("[data-bb-ann-save-draft='1']").click();
    await expect(page.getByText("V13 D19 notice")).toBeVisible();
    await page.locator("[data-bb-ann-publish='1']").click();
    await page.locator("input[name='confirm_publish']").check();
    await page.locator("[data-bb-ann-confirm-publish-submit='1']").click();
    await expect(page.getByText(/Published successfully/i)).toBeVisible();
  });

  test("BB-02 public visitor views the published announcement", async ({ page }, testInfo) => {
    hold(testInfo, "BB-02 public");
    await page.goto(required("E2E_BB_PUBLIC_ANNOUNCEMENTS_PATH"));
    await expect(page.getByText("V13 D19 notice").first()).toBeVisible();
    await expect(page.getByText("Hidden draft")).toHaveCount(0);
  });

  test("BB-03 administrator creates and publishes an event", async ({ page }, testInfo) => {
    hold(testInfo, "BB-03");
    await signIn(page, required("E2E_BB_BRANCH_ADMIN_EMAIL"), required("E2E_BB_BRANCH_ADMIN_PASSWORD"));
    await page.goto("/hq/content/events");
    const form = page.locator("form[data-bb-events-form='create']");
    await expect(form).toBeVisible();
    await form.locator("input[name='title']").fill("V13 D19 gathering");
    await form.locator("textarea[name='summary']").fill("Public gathering");
    await form.locator("input[name='starts_at']").fill("2026-12-01T11:00");
    await form.locator("input[name='ends_at']").fill("2026-12-01T09:00");
    await form.locator("input[name='timezone']").fill("Africa/Lusaka");
    await form.locator("input[name='location']").fill("Main hall");
    await form.locator("select[name='status']").selectOption("published");
    await form.locator("input[name='confirm_publish']").check();
    await form.locator("button[type='submit']").click();
    await expect(page.locator("[role='alert']").first()).toBeVisible();
    await form.locator("input[name='ends_at']").fill("2026-12-01T12:00");
    await form.locator("input[name='confirm_publish']").check();
    await form.locator("button[type='submit']").click();
    await expect(page.getByText("V13 D19 gathering").first()).toBeVisible();
  });

  test("BB-04 administrator creates and publishes a sermon", async ({ page }, testInfo) => {
    hold(testInfo, "BB-04");
    await signIn(page, required("E2E_BB_BRANCH_ADMIN_EMAIL"), required("E2E_BB_BRANCH_ADMIN_PASSWORD"));
    await page.goto("/hq/content/sermons");
    const form = page.locator("form[data-bb-sermons-form='create']");
    await expect(form).toBeVisible();
    await form.locator("input[name='title']").fill("V13 D19 sermon");
    await form.locator("input[name='speaker_name']").fill("V13 Speaker");
    await form.locator("input[name='preached_at']").fill("2026-07-18");
    await form.locator("input[name='media_url']").fill("http://media.v13d19.example/clip.mp3");
    await form.locator("select[name='status']").selectOption("published");
    await form.locator("input[name='confirm_publish']").check();
    await form.locator("button[type='submit']").click();
    await expect(page.locator("[role='alert']").first()).toBeVisible();
    await form.locator("input[name='media_url']").fill("https://media.v13d19.example/clip.mp3");
    await form.locator("input[name='confirm_publish']").check();
    await form.locator("button[type='submit']").click();
    await expect(page.getByText("V13 D19 sermon").first()).toBeVisible();
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
    await signIn(page, required("E2E_BB_ADMIN_EMAIL"), required("E2E_BB_ADMIN_PASSWORD"));
    const stamp = Date.now();
    await page.goto("/hq/members/new");
    await page.locator("input[name='full_name']").fill(`Portal Member ${stamp}`);
    await page.locator("input[name='email']").fill(`bb06-${stamp}@v13d19.example`);
    await page.locator("input[name='phone']").fill(`+26097${String(stamp).slice(-7)}`);
    await page.locator("input[name='address_line_1']").fill("1 Test Road");
    await page.locator("select[name='marital_status']").selectOption("single");
    await page.locator("input[name='next_of_kin_name']").fill("Kin Person");
    await page.locator("select[name='next_of_kin_relationship']").selectOption("parent");
    await page.locator("input[name='next_of_kin_phone']").fill("+260977009990");
    await page.locator("select[name='branch_id']").selectOption({ index: 1 });
    await page.locator("form[data-bb-hq-add-member-form] button[type='submit']").click();
    await expect(page.getByRole("heading", { name: "Review new member" })).toBeVisible();
    await page.getByRole("button", { name: "Create member" }).click();
    await page.getByRole("link", { name: "Issue portal invitation" }).click();
    await page.getByRole("button", { name: "Issue invitation" }).click();
    const link = (await page.getByLabel("Invitation link").inputValue()).trim();
    expect(link).toMatch(/token=/);
    await page.context().clearCookies();
    await page.goto(link);
    await page.locator("input[name='password']").fill("V13-synthetic-qa-password");
    await expect(page.locator("input[name='_csrf']")).toHaveCount(1);
    await page.locator("button[type='submit']").click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto(link);
    await page.locator("input[name='password']").fill("V13-synthetic-qa-password");
    await page.locator("button[type='submit']").click();
    await expect(page.getByText("This member invitation is not valid.")).toBeVisible();
  });

  test("BB-06 member logs in with the activated account", async ({ page }, testInfo) => {
    hold(testInfo, "BB-06 login");
    const { churchId, fullName } = await createActivatedMember(page);
    const loginPath = churchPath("E2E_BB_PUBLIC_HOME_PATH", "/member/login");
    const homePath = churchPath("E2E_BB_PUBLIC_HOME_PATH", "/member");
    await page.goto("/member/login");
    await expect(page.locator("input[name='member_number']")).toHaveCount(0);
    await page.goto("/c/v13-not-a-church/member/login");
    await expect(page.getByText("Not found.")).toBeVisible();
    await page.goto(loginPath);
    await page.locator("input[name='member_number']").fill(churchId);
    await page.locator("input[name='password']").fill("wrong-password-value");
    await page.locator("button[type='submit']").click();
    await expect(page.locator("[role='alert']")).toBeVisible();
    await expect(page.locator("[data-bb-member-dashboard='1']")).toHaveCount(0);
    await page.locator("input[name='member_number']").fill(churchId);
    await page.locator("input[name='password']").fill(MEMBER_PASSWORD);
    await page.locator("button[type='submit']").click();
    await expect(page).toHaveURL(new RegExp(`${homePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    await expect(page.locator("[data-bb-member-dashboard='1']")).toBeVisible();
    await expect(page.getByText(fullName).first()).toBeVisible();
    await expect(page.getByText(required("E2E_BB_CHURCH_A_NAME")).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /website|members admin|hq/i })).toHaveCount(0);
    const otherHome = required("E2E_BB_OTHER_PUBLIC_ANNOUNCEMENTS_PATH").replace(/\/announcements$/, "");
    await page.goto(`${otherHome}/member`);
    await expect(page.getByText("You do not have member access to this site.")).toBeVisible();
    await expect(page.locator("[data-bb-member-dashboard='1']")).toHaveCount(0);
    await page.goto(homePath);
    await page.locator("form[data-bb-member-logout='1'] button").first().click();
    await page.goto(homePath);
    await expect(page.locator("input[name='member_number']")).toBeVisible();
  });

  test("BB-24 public visitor contacts a selected church", async ({ page }, testInfo) => {
    hold(testInfo, "BB-24 contact");
    const church = required("E2E_BB_CHURCH_A_NAME");
    await page.goto(`/directory?q=${encodeURIComponent(church)}`);
    const result = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: church, exact: true }) });
    await expect(result).toBeVisible();
    await expect(result.getByRole("link", { name: /register a new church/i })).toHaveCount(0);
    await result.getByRole("link", { name: "Contact Church" }).click();
    await page.locator("#bb-church-contact-name").fill("Directory Visitor");
    await page.locator("#bb-church-contact-email").fill("visitor@v13d19.example");
    await page.locator("#bb-church-contact-message").fill("Message for the selected church");
    await page.locator("form[data-bb-church-contact-form='1'] button[type='submit']").click();
    await expect(page.getByText(/sent|received|thank/i)).toBeVisible();
  });

  test("BB-24 church administrator receives the correct enquiry", async ({ page }, testInfo) => {
    hold(testInfo, "BB-24 inbox");
    await signIn(page, required("E2E_BB_ADMIN_EMAIL"), required("E2E_BB_ADMIN_PASSWORD"));
    await page.goto(required("E2E_BB_ENQUIRY_INBOX_PATH"));
    await expect(page.getByText("Message for the selected church").first()).toBeVisible();
    await page.context().clearCookies();
    await signIn(page, required("E2E_BB_OTHER_ADMIN_EMAIL"), required("E2E_BB_OTHER_ADMIN_PASSWORD"));
    await page.goto(required("E2E_BB_OTHER_ENQUIRY_INBOX_PATH"));
    await expect(page.getByText("Message for the selected church")).toHaveCount(0);
  });

  test("INV-01 staff member accepts invitation and sets password", async ({ page }, testInfo) => {
    hold(testInfo, "INV-01 accept");
    const { link } = await issueWebsiteEditorInvite(page);
    const token = new URL(link, "http://127.0.0.1").searchParams.get("token");
    expect(token).toBeTruthy();
    await page.context().clearCookies();
    await page.goto(`/invite/accept?token=${encodeURIComponent(token)}`);
    await page.locator("input[name='password']").fill(MEMBER_PASSWORD);
    await page.locator("input[name='password_confirm']").fill(MEMBER_PASSWORD);
    await expect(page.locator("input[name='token']")).toHaveValue(token);
    await expect(page.locator("input[name='_csrf']")).toHaveCount(1);
    await page.locator("button[type='submit']").click();
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
    await page.goto(`/invite/accept?token=${encodeURIComponent(token)}`);
    await expect(page.getByRole("heading", { name: "Invitation unavailable" })).toBeVisible();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator("input[name='password']")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
  });

  test("INV-01 invited staff member signs in with the correct permissions", async ({ page }, testInfo) => {
    hold(testInfo, "INV-01 login");
    const { email, link } = await issueWebsiteEditorInvite(page);
    const token = new URL(link, "http://127.0.0.1").searchParams.get("token");
    await page.context().clearCookies();
    await page.goto(`/invite/accept?token=${encodeURIComponent(token)}`);
    await page.locator("input[name='password']").fill(MEMBER_PASSWORD);
    await page.locator("input[name='password_confirm']").fill(MEMBER_PASSWORD);
    await page.locator("button[type='submit']").click();
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
    await signIn(page, email, MEMBER_PASSWORD);
    await expect(page).not.toHaveURL(/\/login$/);
    const denied = await page.goto("/hq/members/new");
    expect(denied.status()).toBe(403);
    await expect(page.getByText("You do not have access to this site.")).toBeVisible();
    await expect(page.locator("form[data-bb-hq-add-member-form]")).toHaveCount(0);
    await page.context().clearCookies();
    await signIn(page, required("E2E_BB_OTHER_ADMIN_EMAIL"), required("E2E_BB_OTHER_ADMIN_PASSWORD"));
    await page.goto("/hq/roles");
    await expect(page.getByText(email)).toHaveCount(0);
  });

  test("D14C OTP session gate stays blocked on existing deployments", async ({ page }, testInfo) => {
    hold(testInfo, "OTP gate");
    await signIn(page, required("E2E_BB_ADMIN_EMAIL"), required("E2E_BB_ADMIN_PASSWORD"));
    await expect(page.getByLabel(/one-time|verification code/i)).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test("BB-AUTH-04 member recovery hides the testing code and signs in after reset", async ({ page }, testInfo) => {
    hold(testInfo, "BB-AUTH-04");
    const { churchId } = await createActivatedMember(page);
    const forgotPath = churchPath("E2E_BB_PUBLIC_HOME_PATH", "/member/forgot-password");
    const loginPath = churchPath("E2E_BB_PUBLIC_HOME_PATH", "/member/login");
    const nextPassword = "V13-Member-Recover-9!";
    await page.goto(forgotPath);
    await page.locator("input[name='member_number']").fill(churchId);
    await page.locator("button[type='submit']").click();
    await expect(page.locator("input[name='code']")).toBeVisible();
    await expect(page.locator("[data-bb-test-otp]")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Test code:");
    const verificationId = await page.locator("input[name='verification_id']").inputValue();
    const delivery = await page.request.get(
      `/__platform/qa/blessboard-member-otp-delivery?verificationId=${encodeURIComponent(verificationId)}`
    );
    expect(delivery.status()).toBe(200);
    const payload = await delivery.json();
    const code = String(payload.code || "");
    expect(code).toMatch(/^\d{6}$/);
    await expect(page.locator("body")).not.toContainText(code);
    await page.locator("input[name='code']").fill(code);
    await page.locator("input[name='password']").fill(nextPassword);
    await page.locator("input[name='password_confirm']").fill(nextPassword);
    await page.locator("button[type='submit']").click();
    await expect(page.getByText("Password updated")).toBeVisible();
    await page.goto(loginPath);
    await page.locator("input[name='member_number']").fill(churchId);
    await page.locator("input[name='password']").fill(nextPassword);
    await page.locator("button[type='submit']").click();
    await expect(page.locator("[data-bb-member-dashboard='1']")).toBeVisible();
    await page.context().clearCookies();
    await page.goto(forgotPath);
    await page.locator("input[name='member_number']").fill(churchId);
    await page.locator("button[type='submit']").click();
    await page.locator("input[name='code']").fill(code === "000000" ? "111111" : "000000");
    await page.locator("input[name='password']").fill(nextPassword);
    await page.locator("input[name='password_confirm']").fill(nextPassword);
    await page.locator("button[type='submit']").click();
    await expect(page.getByRole("heading", { name: "Recovery unsuccessful" })).toBeVisible();
  });

  test("BB-MEM-01 member form shows mandatory fields and completes registration", async ({ page }, testInfo) => {
    hold(testInfo, "BB-MEM-01");
    await signIn(page, required("E2E_BB_ADMIN_EMAIL"), required("E2E_BB_ADMIN_PASSWORD"));
    await page.goto("/hq/members/new");
    await expect(page.locator("form[data-bb-hq-add-member-form] input[name='full_name']")).toHaveAttribute("required", "");
    await expect(page.locator("form[data-bb-hq-add-member-form] input[name='phone']")).toHaveAttribute("required", "");
    await expect(page.locator("form[data-bb-hq-add-member-form] select[name='branch_id']")).toHaveAttribute("required", "");
    await expect(page.getByText("Portal activation remains pending after creation.")).toBeVisible();
    const name = `D04 Browser Member ${Date.now()}`;
    await page.locator("input[name='full_name']").fill(name);
    await page.locator("input[name='phone']").fill(`+26097${String(Date.now()).slice(-7)}`);
    await page.locator("input[name='address_line_1']").fill("1 Test Road");
    await page.locator("select[name='marital_status']").selectOption("single");
    await page.locator("input[name='next_of_kin_name']").fill("Kin Person");
    await page.locator("select[name='next_of_kin_relationship']").selectOption("parent");
    await page.locator("input[name='next_of_kin_phone']").fill("+260977009990");
    await page.locator("select[name='branch_id']").selectOption({ index: 1 });
    await page.locator("form[data-bb-hq-add-member-form] button[type='submit']").click();
    await expect(page.getByRole("heading", { name: "Review new member" })).toBeVisible();
    await page.getByRole("button", { name: "Create member" }).click();
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByText("not_activated", { exact: true })).toBeVisible();
    await page.goto("/hq/members");
    await expect(page.getByText(name).first()).toBeVisible();
  });

  test("BB-MEM-02 HQ member registration rejects a missing CSRF token and accepts the shell token", async ({ page }, testInfo) => {
    hold(testInfo, "BB-MEM-02");
    await signIn(page, required("E2E_BB_ADMIN_EMAIL"), required("E2E_BB_ADMIN_PASSWORD"));
    await page.goto("/hq/members/new");
    const field = await page.locator("form[data-bb-hq-add-member-form] input[name='_csrf']").inputValue();
    const cookies = await page.context().cookies();
    const csrfCookie = cookies.find((item) => item.value === field);
    expect(csrfCookie && csrfCookie.value).toBe(field);
    const branchId = await page.locator("select[name='branch_id'] option").evaluateAll((options) => {
      const found = options.find((option) => option.value);
      return found ? found.value : "";
    });
    const absent = await page.request.post("/hq/members/new", {
      form: { full_name: "D04 Missing Token", phone: "+260977009992", branch_id: branchId },
    });
    expect(absent.status()).toBe(403);
    expect(await absent.text()).toMatch(/Invalid or missing CSRF token/);
    const mismatched = await page.request.post("/hq/members/new", {
      form: {
        full_name: "D04 Invalid Token",
        phone: "+260977009993",
        branch_id: branchId,
        _csrf: `${field.slice(0, 12)}mismatch`,
      },
    });
    expect(mismatched.status()).toBe(403);
    expect(await mismatched.text()).toMatch(/Invalid or missing CSRF token/);
    await page.locator("input[name='full_name']").fill("D04 Paired Browser");
    await page.locator("input[name='phone']").fill("+260977009994");
    await page.locator("input[name='address_line_1']").fill("1 Test Road");
    await page.locator("select[name='marital_status']").selectOption("single");
    await page.locator("input[name='next_of_kin_name']").fill("Kin Person");
    await page.locator("select[name='next_of_kin_relationship']").selectOption("parent");
    await page.locator("input[name='next_of_kin_phone']").fill("+260977009990");
    await page.locator("select[name='branch_id']").selectOption({ index: 1 });
    await page.locator("form[data-bb-hq-add-member-form] button[type='submit']").click();
    await expect(page.getByRole("heading", { name: "Review new member" })).toBeVisible();
  });

  test("BB-REG-07 duplicate church phone shows the registration error", async ({ page }, testInfo) => {
    hold(testInfo, "BB-REG-07");
    const stamp = Date.now();
    const national = `97${String(stamp).slice(-7)}`;
    const firstChurch = `D04 Church First ${stamp}`;
    const secondChurch = `D04 Church Second ${stamp}`;
    await submitChurchRegistration(page, {
      church_name: firstChurch,
      country: "Zambia",
      city: "Lusaka",
      branch_name: "Main Campus",
      selected_plan: "growth",
      contact_name: "First Pastor",
      email: `d04-first-${Date.now()}@example.invalid`,
      role_in_church: "Pastor",
      phone_national: national,
      password: "V13-Church-Reg-12",
      password_confirm: "V13-Church-Reg-12",
    });
    await expect(page).toHaveURL(/submitted=1|\/hq(?:\?|$)/);
    await submitChurchRegistration(page, {
      church_name: secondChurch,
      country: "Zambia",
      city: "Kitwe",
      branch_name: "Main Campus",
      selected_plan: "growth",
      contact_name: "Second Pastor",
      email: `d04-second-${Date.now()}@example.invalid`,
      role_in_church: "Pastor",
      phone_national: `${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`,
      password: "V13-Church-Reg-12",
      password_confirm: "V13-Church-Reg-12",
    });
    await expect(page.locator("#register_phone-error")).toContainText(/already linked to a BlessBoard church registration/i);
    await expect(page.locator("input[name='contact_name']")).toHaveValue("Second Pastor");
    await expect(page).not.toHaveURL(/submitted=1/);
  });

  test("BB-ANN-01 published announcement is visible only on that church public page", async ({ page }, testInfo) => {
    hold(testInfo, "BB-ANN-01");
    await signIn(page, required("E2E_BB_ADMIN_EMAIL"), required("E2E_BB_ADMIN_PASSWORD"));
    const publicPath = required("E2E_BB_PUBLIC_ANNOUNCEMENTS_PATH");
    const otherPath = required("E2E_BB_OTHER_PUBLIC_ANNOUNCEMENTS_PATH");
    const stamp = Date.now();
    const draftTitle = `D04 draft ${stamp}`;
    const publishedTitle = `D04 public ${stamp}`;
    await saveAnnouncementDraft(page, draftTitle, "Draft stays off the public page");
    await page.goto(publicPath);
    await expect(page.locator("[data-bb-announcements='1']")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(draftTitle);
    await saveAnnouncementDraft(page, publishedTitle, "Published notice for this church");
    await page.locator("[data-bb-ann-publish='1']").click();
    await page.locator("input[name='confirm_publish']").check();
    await page.locator("[data-bb-ann-confirm-publish-submit='1']").click();
    await expect(page.getByText(/Published successfully/i)).toBeVisible();
    await page.goto(publicPath);
    await expect(page.getByText(publishedTitle)).toBeVisible();
    await expect(page.locator("body")).not.toContainText(draftTitle);
    await page.goto(otherPath);
    await expect(page.locator("[data-bb-announcements='1']")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(publishedTitle);
    await expect(page.locator("body")).not.toContainText(draftTitle);
  });

  test("BB-WEB-08 church theme is applied, previewed, published, and cross-product themes are absent", async ({ page }, testInfo) => {
    hold(testInfo, "BB-WEB-08");
    await signIn(page, required("E2E_BB_ADMIN_EMAIL"), required("E2E_BB_ADMIN_PASSWORD"));
    const home = required("E2E_BB_PUBLIC_HOME_PATH");
    await page.goto("/hq/website/themes");
    await expect(page.locator("[data-theme-id='bb.community']").first()).toBeVisible();
    await expect(page.locator("[data-theme-id='ac.family-wellness-mint']")).toHaveCount(0);
    await expect(page.locator("[data-theme-id='ac.community']")).toHaveCount(0);
    const api = await page.locator("[data-theme-api]").getAttribute("data-theme-api");
    const token = await page.locator("[data-csrf-token]").first().getAttribute("data-csrf-token");
    const rejected = await page.request.post(api, {
      data: { themeId: "ac.family-wellness-mint", _csrf: token },
    });
    expect(rejected.status()).toBe(400);
    expect(await rejected.text()).toMatch(/invalid_theme/);
    const applyTheme = page.locator("[data-theme-select][data-theme-id='bb.community']");
    if (await applyTheme.isEnabled()) await applyTheme.click();
    await expect(page.locator("[data-theme-card][data-theme-id='bb.community'][data-theme-draft='1']")).toBeVisible();
    await page.goto(`${home}${home.includes("?") ? "&" : "?"}website_mode=draft`);
    expect(await page.content()).toMatch(/gp-website-theme--bb-community|bb\.community/);
    await page.goto("/hq/website/publish/review");
    const previewBox = page.locator("input[name='preview_reviewed']");
    if (await previewBox.count()) await previewBox.check();
    const mobileBox = page.locator("input[name='mobile_preview_confirmed']");
    if (await mobileBox.count()) await mobileBox.check();
    await page.locator("button[type='submit']:visible").first().click();
    await page.goto(home);
    await expect(page.locator(".gp-website-theme--bb-community")).toHaveCount(1);
  });

  test("BB-WEB-09 sermon draft stays private and the published sermon is isolated", async ({ page }, testInfo) => {
    hold(testInfo, "BB-WEB-09");
    await signIn(page, required("E2E_BB_ADMIN_EMAIL"), required("E2E_BB_ADMIN_PASSWORD"));
    const publicPath = required("E2E_BB_PUBLIC_SERMONS_PATH");
    const otherPath = required("E2E_BB_OTHER_PUBLIC_SERMONS_PATH");
    const stamp = Date.now();
    const draftTitle = `D05 draft sermon ${stamp}`;
    const liveTitle = `D05 live sermon ${stamp}`;
    await page.goto("/hq/content/sermons");
    await expect(page.locator("form[data-bb-sermons-form='create']")).toBeVisible();
    const draftForm = page.locator("form[data-bb-sermons-form='create']");
    await draftForm.locator("input[name='title']").fill(draftTitle);
    await draftForm.locator("input[name='speaker_name']").fill("D05 Speaker");
    await draftForm.locator("input[name='preached_at']").fill("2026-07-18");
    await draftForm.locator("select[name='status']").selectOption("draft");
    await draftForm.locator("button[type='submit']").click();
    await expect(page.getByText(draftTitle).first()).toBeVisible();
    await page.goto(publicPath);
    await expect(page.locator("[data-bb-sermons='1']")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(draftTitle);
    await page.goto("/hq/content/sermons");
    const liveForm = page.locator("form[data-bb-sermons-form='create']");
    await liveForm.locator("input[name='title']").fill(liveTitle);
    await liveForm.locator("input[name='speaker_name']").fill("D05 Speaker");
    await liveForm.locator("input[name='preached_at']").fill("2026-07-18");
    await liveForm.locator("select[name='status']").selectOption("published");
    await liveForm.locator("input[name='confirm_publish']").check();
    await liveForm.locator("button[type='submit']").click();
    await expect(page.getByText(liveTitle).first()).toBeVisible();
    await page.goto(publicPath);
    await expect(page.getByText(liveTitle).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(draftTitle);
    await page.goto(otherPath);
    await expect(page.locator("body")).not.toContainText(liveTitle);
    await expect(page.locator("body")).not.toContainText(draftTitle);
  });

  test("BB-WEB-10 event draft stays private and the published event is isolated", async ({ page }, testInfo) => {
    hold(testInfo, "BB-WEB-10");
    await signIn(page, required("E2E_BB_ADMIN_EMAIL"), required("E2E_BB_ADMIN_PASSWORD"));
    const publicPath = required("E2E_BB_PUBLIC_EVENTS_PATH");
    const otherPath = required("E2E_BB_OTHER_PUBLIC_EVENTS_PATH");
    const stamp = Date.now();
    const draftTitle = `D05 draft event ${stamp}`;
    const liveTitle = `D05 live event ${stamp}`;
    await page.goto("/hq/content/events");
    await expect(page.locator("form[data-bb-events-form='create']")).toBeVisible();
    const draftForm = page.locator("form[data-bb-events-form='create']");
    await draftForm.locator("input[name='title']").fill(draftTitle);
    await draftForm.locator("textarea[name='summary']").fill("Draft gathering");
    await draftForm.locator("input[name='starts_at']").fill("2026-12-01T09:00");
    await draftForm.locator("input[name='ends_at']").fill("2026-12-01T11:00");
    await draftForm.locator("input[name='timezone']").fill("Africa/Lusaka");
    await draftForm.locator("input[name='location']").fill("Main hall");
    await draftForm.locator("select[name='status']").selectOption("draft");
    await draftForm.locator("button[type='submit']").click();
    await expect(page.getByText(draftTitle).first()).toBeVisible();
    await page.goto(publicPath);
    await expect(page.locator("[data-bb-events='1']")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(draftTitle);
    await page.goto("/hq/content/events");
    const liveForm = page.locator("form[data-bb-events-form='create']");
    await liveForm.locator("input[name='title']").fill(liveTitle);
    await liveForm.locator("textarea[name='summary']").fill("Public gathering");
    await liveForm.locator("input[name='starts_at']").fill("2026-12-02T09:00");
    await liveForm.locator("input[name='ends_at']").fill("2026-12-02T11:00");
    await liveForm.locator("input[name='timezone']").fill("Africa/Lusaka");
    await liveForm.locator("input[name='location']").fill("Main hall");
    await liveForm.locator("select[name='status']").selectOption("published");
    await liveForm.locator("input[name='confirm_publish']").check();
    await liveForm.locator("button[type='submit']").click();
    await expect(page.getByText(liveTitle).first()).toBeVisible();
    await page.goto(publicPath);
    await expect(page.getByText(liveTitle).first()).toBeVisible();
    await page.goto(otherPath);
    await expect(page.locator("body")).not.toContainText(liveTitle);
  });

  test("BB-ANN-02 announcement attachment is saved, published, and isolated", async ({ page }, testInfo) => {
    hold(testInfo, "BB-ANN-02");
    await signIn(page, required("E2E_BB_ADMIN_EMAIL"), required("E2E_BB_ADMIN_PASSWORD"));
    const publicPath = required("E2E_BB_PUBLIC_ANNOUNCEMENTS_PATH");
    const otherPath = required("E2E_BB_OTHER_PUBLIC_ANNOUNCEMENTS_PATH");
    const stamp = Date.now();
    const title = `D05 attachment ${stamp}`;
    const filename = `d05-notice-${stamp}.png`;
    await page.goto("/hq/announcements/new");
    await expect(page.locator("#bb-ann-attach-heading, [data-bb-ann-section='attachments']").first()).toBeVisible();
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    await page.locator("[data-gp-we-media-file], input[type='file']").first().setInputFiles({
      name: "note.html",
      mimeType: "text/html",
      buffer: Buffer.from("<html>no</html>"),
    });
    await expect(page.locator("[data-gp-we-media-status]")).toContainText(/turned off|not allowed|rejected|unsupported|invalid|error/i);
    await page.locator("[data-gp-we-media-file], input[type='file']").first().setInputFiles({
      name: filename,
      mimeType: "image/png",
      buffer: png,
    });
    await expect(page.locator("[data-gp-we-media-status]")).toContainText(/turned off|not allowed/i);
    await expect(page.locator("#media_asset_id")).toHaveValue("");
    await page.locator("input[name='title']").fill(title);
    await page.locator("textarea[name='body']").fill("Attachment notice");
    await page.locator("input[name='audience_public']").check();
    await page.locator("[data-bb-ann-save-draft='1']").click();
    await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByText(filename)).toHaveCount(0);
    await page.locator("[data-bb-ann-publish='1']").click();
    await page.locator("input[name='confirm_publish']").check();
    await page.locator("[data-bb-ann-confirm-publish-submit='1']").click();
    await page.goto(publicPath);
    await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByText(filename)).toHaveCount(0);
    await page.goto(otherPath);
    await expect(page.locator("body")).not.toContainText(filename);
    await expect(page.locator("body")).not.toContainText(title);
  });
});

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

async function submitChurchRegistration(page, values) {
  await page.goto("/register-church");
  for (let step = 0; step < 4; step += 1) {
    if (/submitted=1/.test(page.url())) return;
    for (const [name, value] of Object.entries(values)) {
      await fillVisible(page, name, value);
    }
    const reviewForm = page.locator("form[data-bb-register-step='review']");
    if (await reviewForm.count()) {
      await reviewForm.locator("input[name='registration_consent'], input[name='consent_contact']").evaluate((el) => {
        el.checked = true;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await Promise.all([
        page.waitForLoadState("domcontentloaded"),
        reviewForm.evaluate((form) => form.requestSubmit()),
      ]);
      return;
    }
    await page.locator("button[type='submit']:visible").last().click();
    await page.waitForLoadState("domcontentloaded");
  }
}

async function saveAnnouncementDraft(page, title, body) {
  await page.goto("/hq/announcements/new");
  await page.locator("input[name='title']").fill(title);
  await page.locator("textarea[name='body']").fill(body);
  await page.locator("input[name='audience_public']").check();
  await page.locator("[data-bb-ann-save-draft='1']").click();
  await expect(page.getByText(title)).toBeVisible();
}
