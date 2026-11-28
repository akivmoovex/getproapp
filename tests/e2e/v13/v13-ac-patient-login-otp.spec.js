"use strict";

/**
 * Patient login OTP for a staff-created chart.
 * Registration of an unmatched phone still creates no patient.
 * The portal session cookie appears only after the code.
 */

const crypto = require("crypto");
const { test, expect } = require("@playwright/test");
const { Client } = require("pg");
const { installLocalOnlyRoutes } = require("../../v13/helpers/v13BrowserIsolation");

const PASSWORD = "V13-G333-patient-otp-9!";
const WRONG_CODE = "000000";

function hold(testInfo, name) {
  if (
    process.env.GETPRO_V13_BROWSER_AUTHORIZED !== "1" ||
    process.env.GETPRO_V13_ALLOW_DB_WRITES !== "1" ||
    process.env.GETPRO_V13_DB_STAGES_AUTHORIZED !== "1" ||
    process.env.GETPRO_AC_PATIENT_LOGIN_OTP_OBSERVER !== "1" ||
    process.env.GETPRO_OTP_PROVIDER !== "qa-observer"
  ) {
    testInfo.annotations.push({ type: "v13-result", description: "NOT_RUN" });
    throw new Error(`NOT_RUN: ${name} waits for the isolated patient OTP observer`);
  }
}

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertDistinctCode(code) {
  if (!/^\d{6}$/.test(String(code || "")) || String(code) === WRONG_CODE) {
    throw new Error("patient OTP observer did not return a distinct code");
  }
}

function contextBucket() {
  const hash = crypto.createHash("sha256").update("otp-ctx:activeclinic.patient_login").digest("hex");
  return `context:${hash}:login`;
}

async function withIsolatedDb(work) {
  const client = new Client({
    host: "127.0.0.1",
    port: 55432,
    user: "v13_regression_213101",
    database: "getpro_v13_e2e_g78d2301",
    password: String(process.env.PGPASSWORD || ""),
    ssl: false,
  });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function noSession(page) {
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => /sid/i.test(cookie.name) && cookie.value)).toBe(false);
}

async function staffSignIn(page) {
  await page.goto("/login");
  await page.locator("input[name='login_email']").fill(required("E2E_AC_ADMIN_EMAIL"));
  await page.locator("input[name='password']").fill(required("E2E_AC_ADMIN_PASSWORD"));
  await page.locator("form[data-ac-login-form] button[type='submit']").click();
  await expect(page).toHaveURL(/\/app/);
}

async function createActivatedPatient(page, fields) {
  const clinicKey = required("E2E_AC_CLINIC_KEY");
  await staffSignIn(page);
  await page.goto("/app/patients/new");
  await page.getByRole("button", { name: /None of these/ }).click();
  await page.locator("input[name='first_name']").fill(fields.firstName);
  await page.locator("input[name='last_name']").fill(fields.lastName);
  await page.locator("select[name='sex_at_registration']").selectOption("female");
  await page.locator("input[name='date_of_birth']").fill(fields.dateOfBirth);
  await page.locator("input[name='phone_national']").fill(fields.phone);
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("button", { name: "Create patient" })).toBeVisible();
  await page.getByRole("button", { name: "Create patient" }).click();
  await expect(page.getByText("Patient created")).toBeVisible({ timeout: 15000 });
  await expect(page.locator("[data-ac-patient-number='1']")).toBeVisible();
  const number = (await page.locator("[data-ac-patient-number='1']").innerText()).trim();
  await page.context().clearCookies();
  await page.goto(`/clinics/${clinicKey}/patient/register`);
  await page.locator("input[name='firstName']").fill(fields.firstName);
  await page.locator("input[name='lastName']").fill(fields.lastName);
  await page.locator("input[name='phone_national']").fill(fields.phone);
  await page.locator("input[name='email']").fill(fields.email);
  await page.locator("input[name='password']").fill(PASSWORD);
  await page.locator("form:has(input[name='firstName']) button[type='submit']").click();
  await expect(page).toHaveURL(new RegExp(`/clinics/${clinicKey}/patient/login`));
  const identity = await withIsolatedDb((client) => client.query(
    `SELECT id FROM platform.identities WHERE email_normalized = $1 LIMIT 1`,
    [fields.email]
  ));
  return { ...fields, number, accountId: identity.rows[0].id, clinicKey };
}

async function startChallenge(page, member) {
  const clinicKey = member.clinicKey;
  await page.context().clearCookies();
  await page.goto(`/clinics/${clinicKey}/patient/login`);
  await page.locator("input[name='identifier']").fill(member.email);
  await page.locator("input[name='password']").fill(PASSWORD);
  await page.locator("form:has(input[name='password']) button[type='submit']").click();
  await expect(page.locator("[data-ac-otp-required='1']")).toBeVisible();
  const attemptId = await page.locator("[data-ac-otp-attempt]").getAttribute("data-ac-otp-attempt");
  expect(attemptId).toMatch(/^[0-9a-f-]{36}$/i);
  const delivery = await page.request.get(
    `/__platform/qa/activeclinic-recovery-otp-delivery?attemptId=${encodeURIComponent(attemptId)}`
  );
  expect(delivery.status()).toBe(200);
  const code = String((await delivery.json()).code || "");
  assertDistinctCode(code);
  await expect(page.locator("body")).not.toContainText(code);
  await noSession(page);
  const portal = await page.request.get(`/clinics/${clinicKey}/patient`, { maxRedirects: 0 });
  expect(portal.status()).toBeGreaterThanOrEqual(300);
  return { attemptId, code };
}

test.describe("V13 AC patient login OTP", () => {
  const members = {};

  test.beforeAll(async ({ browser }) => {
    await withIsolatedDb((client) => client.query(
      `DELETE FROM platform.otp_rate_buckets WHERE bucket_key = ANY($1::text[])`,
      [[contextBucket(), "provider:qa-observer:email"]]
    ));
    const context = await browser.newContext();
    const page = await context.newPage();
    await installLocalOnlyRoutes(page, process.env.PLAYWRIGHT_E2E_PORT || "4191");
    const stamp = Date.now();
    const specs = [
      ["success", "Portal"],
      ["wrong", "Wrong"],
      ["expired", "Expired"],
      ["replay", "Replay"],
      ["cross", "Cross"],
      ["other", "Other"],
    ];
    let index = 0;
    for (const [key, firstName] of specs) {
      index += 1;
      const suffix = String(1000000 + index + Number(String(stamp).slice(-4))).slice(-7);
      members[key] = await createActivatedPatient(page, {
        firstName: `${firstName}${String(stamp).slice(-5)}`,
        lastName: `G333${key}${String(stamp).slice(-4)}`,
        dateOfBirth: `1992-03-${String(10 + index).padStart(2, "0")}`,
        phone: `95${suffix}`,
        email: `g333-${key}-${stamp}@example.invalid`,
      });
    }
    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    await installLocalOnlyRoutes(page, process.env.PLAYWRIGHT_E2E_PORT || "4191");
  });

  test("password then the correct code opens only that patient's portal", async ({ page }, testInfo) => {
    hold(testInfo, "PATIENT-OTP-SUCCESS");
    const member = members.success;
    const started = await startChallenge(page, member);
    const row = await withIsolatedDb((client) => client.query(
      `SELECT product_code, purpose, organization_id, account_id, status, consumed
         FROM platform.otp_challenges WHERE attempt_id = $1`,
      [started.attemptId]
    ));
    expect(row.rows[0]).toMatchObject({
      product_code: "activeclinic",
      purpose: "login",
      account_id: member.accountId,
      status: "pending",
      consumed: false,
    });
    await page.locator("input[name='otp_code']").fill(started.code);
    await page.locator("form:has(input[name='otp_code']) button[type='submit']").click();
    await expect(page).toHaveURL(new RegExp(`/clinics/${member.clinicKey}/patient(?:\\?|$)`));
    const cookies = await page.context().cookies();
    expect(cookies.some((cookie) => /sid/i.test(cookie.name) && cookie.value)).toBe(true);
    await page.goto(`/clinics/${member.clinicKey}/patient/profile`);
    await expect(page.locator("body")).toContainText(member.number);
    await expect(page.locator("body")).not.toContainText(members.other.number);
    await page.locator("form.ac-patient-nav__logout button[type='submit']").click();
    await noSession(page);
    const portal = await page.request.get(`/clinics/${member.clinicKey}/patient/profile`, { maxRedirects: 0 });
    expect(portal.status()).toBeGreaterThanOrEqual(300);
  });

  test("an incorrect code and another patient's challenge do not open the portal", async ({ page }, testInfo) => {
    hold(testInfo, "PATIENT-OTP-WRONG");
    const started = await startChallenge(page, members.wrong);
    await page.locator("input[name='otp_code']").fill(WRONG_CODE);
    await page.locator("form:has(input[name='otp_code']) button[type='submit']").click();
    await expect(page.locator("[data-ac-otp-reason='invalid_code']")).toBeVisible();
    await noSession(page);
    const moved = await withIsolatedDb((client) => client.query(
      `UPDATE platform.otp_challenges
          SET account_id = $2
        WHERE attempt_id = $1 AND account_id = $3 AND status = 'pending'`,
      [started.attemptId, members.other.accountId, members.wrong.accountId]
    ));
    expect(moved.rowCount).toBe(1);
    await page.locator("input[name='otp_code']").fill(started.code);
    await page.locator("form:has(input[name='otp_code']) button[type='submit']").click();
    await expect(page.locator("[data-ac-otp-reason='verification_failed']")).toBeVisible();
    await noSession(page);
  });

  test("an expired code does not open the portal", async ({ page }, testInfo) => {
    hold(testInfo, "PATIENT-OTP-EXPIRED");
    const started = await startChallenge(page, members.expired);
    const expired = await page.request.post(
      `/__platform/qa/activeclinic-recovery-otp-expire?attemptId=${encodeURIComponent(started.attemptId)}`
    );
    expect(expired.status()).toBe(200);
    await page.locator("input[name='otp_code']").fill(started.code);
    await page.locator("form:has(input[name='otp_code']) button[type='submit']").click();
    await expect(page.locator("[data-ac-otp-reason='expired']")).toBeVisible();
    await noSession(page);
  });

  test("a consumed code cannot be replayed", async ({ page }, testInfo) => {
    hold(testInfo, "PATIENT-OTP-REPLAY");
    const member = members.replay;
    const started = await startChallenge(page, member);
    const before = await page.context().cookies();
    const otpCookie = before.find((cookie) => cookie.name === "ac_patient_login_otp");
    const csrfCookie = before.find((cookie) => /csrf/i.test(cookie.name));
    const csrf = await page.locator("form:has(input[name='otp_code']) input[name='_csrf']").inputValue();
    await page.locator("input[name='otp_code']").fill(started.code);
    await page.locator("form:has(input[name='otp_code']) button[type='submit']").click();
    await expect(page).toHaveURL(new RegExp(`/clinics/${member.clinicKey}/patient(?:\\?|$)`));
    await page.context().clearCookies();
    await page.context().addCookies([otpCookie, csrfCookie].filter(Boolean));
    const replay = await page.request.post(`/clinics/${member.clinicKey}/patient/login/otp`, {
      form: { _csrf: csrf, otp_code: started.code },
      maxRedirects: 0,
    });
    expect(replay.status()).toBe(401);
    const sessions = await withIsolatedDb((client) => client.query(
      `SELECT count(*)::int AS n FROM platform.deployment_sessions
        WHERE platform_identity_id = $1 AND revoked_at IS NULL`,
      [member.accountId]
    ));
    expect(sessions.rows[0].n).toBe(1);
  });

  test("another clinic and another patient cannot use the challenge", async ({ page }, testInfo) => {
    hold(testInfo, "PATIENT-OTP-CROSS");
    const member = members.cross;
    const started = await startChallenge(page, member);
    const csrf = await page.locator("form:has(input[name='otp_code']) input[name='_csrf']").inputValue();
    const otherClinic = required("E2E_AC_OTHER_CLINIC_KEY");
    const crossed = await page.request.post(`/clinics/${otherClinic}/patient/login/otp`, {
      form: { _csrf: csrf, otp_code: started.code },
      maxRedirects: 0,
    });
    expect(crossed.status()).toBe(401);
    await noSession(page);
  });

  test("unmatched public registration creates no chart", async ({ page }, testInfo) => {
    hold(testInfo, "PATIENT-OTP-UNMATCHED");
    const clinicKey = required("E2E_AC_CLINIC_KEY");
    const phone = `94${String(Date.now()).slice(-7)}`;
    const before = await withIsolatedDb((client) => client.query(
      `SELECT count(*)::int AS n FROM activeclinic.patients
        WHERE phone_normalized LIKE $1 OR phone_display LIKE $1`,
      [`%${phone}%`]
    ));
    await page.goto(`/clinics/${clinicKey}/patient/register`);
    await page.locator("input[name='firstName']").fill("Nobody");
    await page.locator("input[name='lastName']").fill("Unmatched");
    await page.locator("input[name='phone_national']").fill(phone);
    await page.locator("input[name='password']").fill(PASSWORD);
    await page.locator("form:has(input[name='firstName']) button[type='submit']").click();
    await expect(page.getByText(/No matching patient record/i).first()).toBeVisible();
    await expect(page.getByText(/does not create a new patient record/i).first()).toBeVisible();
    const after = await withIsolatedDb((client) => client.query(
      `SELECT count(*)::int AS n FROM activeclinic.patients
        WHERE phone_normalized LIKE $1 OR phone_display LIKE $1`,
      [`%${phone}%`]
    ));
    expect(after.rows[0].n).toBe(before.rows[0].n);
    await noSession(page);
  });

  test("password recovery stays bound to the activated patient", async ({ page }, testInfo) => {
    hold(testInfo, "PATIENT-OTP-RECOVERY");
    const member = members.other;
    await page.goto(`/clinics/${member.clinicKey}/patient/forgot-password`);
    await page.locator("input[name='identifier']").fill(member.email);
    await page.locator("form:has(input[name='identifier']) button[type='submit']").click();
    await expect(page.locator("body")).toContainText(/unavailable/i);
    await expect(page.locator("body")).not.toContainText(members.success.number);
    const body = await page.locator("body").innerText();
    const token = (body.match(/TEST TOKEN:\s*([a-f0-9]{64})/i) || [])[1];
    expect(token).toBeTruthy();
    const bound = await withIsolatedDb((client) => client.query(
      `SELECT i.email_normalized
         FROM platform.identity_action_tokens t
         JOIN platform.identities i ON i.id = t.platform_identity_id
        WHERE i.email_normalized = $1
        ORDER BY t.created_at DESC
        LIMIT 1`,
      [member.email]
    ));
    expect(bound.rows[0].email_normalized).toBe(member.email);
    await noSession(page);
  });
});
