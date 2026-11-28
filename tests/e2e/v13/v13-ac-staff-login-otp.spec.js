"use strict";

/**
 * ActiveClinic staff login OTP on the isolated observer.
 * The password is accepted first. The clinic session cookie is created
 * only after the code. Hosted testing does not set this observer flag.
 */

const crypto = require("crypto");
const { test, expect } = require("@playwright/test");
const { Client } = require("pg");
const bcrypt = require("bcryptjs");
const { installLocalOnlyRoutes } = require("../../v13/helpers/v13BrowserIsolation");

const PASSWORD = "V13-G333-staff-otp-9!";
const EMAIL_SUFFIX = "@g333staff.v13d19.example";
const WRONG_CODE = "000000";
const ROLE_KEY = "activeclinic_organization_admin";

function hold(testInfo, name) {
  if (
    process.env.GETPRO_V13_BROWSER_AUTHORIZED !== "1" ||
    process.env.GETPRO_V13_ALLOW_DB_WRITES !== "1" ||
    process.env.GETPRO_V13_DB_STAGES_AUTHORIZED !== "1" ||
    process.env.GETPRO_AC_STAFF_LOGIN_OTP_OBSERVER !== "1" ||
    process.env.GETPRO_OTP_PROVIDER !== "qa-observer"
  ) {
    testInfo.annotations.push({ type: "v13-result", description: "NOT_RUN" });
    throw new Error(`NOT_RUN: ${name} waits for the isolated staff OTP observer`);
  }
}

function assertDistinctCode(code) {
  if (!/^\d{6}$/.test(String(code || "")) || String(code) === WRONG_CODE) {
    throw new Error("staff OTP observer did not return a distinct code");
  }
}

function contextBucket() {
  const hash = crypto.createHash("sha256").update("otp-ctx:activeclinic.staff_login").digest("hex");
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

async function cleanup() {
  await withIsolatedDb(async (client) => {
    await client.query(`DELETE FROM platform.otp_rate_buckets WHERE bucket_key = ANY($1::text[])`, [
      [contextBucket(), "provider:qa-observer:email"],
    ]);
    const identities = await client.query(
      `SELECT id FROM platform.identities WHERE email_normalized LIKE $1`,
      [`%${EMAIL_SUFFIX}`]
    );
    const identityIds = identities.rows.map((row) => row.id);
    if (!identityIds.length) return;
    const staff = await client.query(
      `SELECT id FROM activeclinic.staff_members WHERE platform_identity_id = ANY($1::uuid[])`,
      [identityIds]
    );
    const staffIds = staff.rows.map((row) => row.id);
    await client.query(`DELETE FROM platform.otp_challenges WHERE account_id = ANY($1::uuid[])`, [identityIds]);
    await client.query(`DELETE FROM platform.deployment_sessions WHERE platform_identity_id = ANY($1::uuid[])`, [identityIds]);
    if (staffIds.length) {
      await client.query(`DELETE FROM activeclinic.staff_role_assignments WHERE staff_member_id = ANY($1::uuid[])`, [staffIds]);
      await client.query(`DELETE FROM activeclinic.staff_facility_assignments WHERE staff_member_id = ANY($1::uuid[])`, [staffIds]);
    }
    await client.query(`DELETE FROM platform.identity_product_profiles WHERE identity_id = ANY($1::uuid[])`, [identityIds]);
    await client.query(`DELETE FROM activeclinic.staff_members WHERE platform_identity_id = ANY($1::uuid[])`, [identityIds]);
    await client.query(
      `DELETE FROM platform.identities WHERE id = ANY($1::uuid[]) AND email_normalized LIKE $2`,
      [identityIds, `%${EMAIL_SUFFIX}`]
    );
  });
}

async function provisionStaff(client, fields, passwordHash, roleId) {
  const identity = await client.query(
    `INSERT INTO platform.identities
       (status, primary_email, email_normalized, email_verified_at, password_hash, must_change_password)
     VALUES ('active', $1, $2, now(), $3, false)
     RETURNING id`,
    [fields.email, fields.email, passwordHash]
  );
  const identityId = identity.rows[0].id;
  const staff = await client.query(
    `INSERT INTO activeclinic.staff_members
       (organization_id, healthcare_organization_id, platform_identity_id,
        staff_number, first_name, last_name, display_name,
        phone_normalized, phone_display, email_normalized, email_display,
        employment_type, status)
     VALUES ($1,$2,$3,$4,'G333',$5,$6,$7,$8,$9,$10,'permanent','active')
     RETURNING id`,
    [
      fields.organizationId,
      fields.healthcareId,
      identityId,
      fields.staffNumber,
      fields.key,
      `G333 ${fields.key}`,
      fields.phone,
      fields.phone,
      fields.email,
      fields.email,
    ]
  );
  const staffId = staff.rows[0].id;
  await client.query(
    `INSERT INTO platform.identity_product_profiles
       (identity_id, product_key, profile_type, product_profile_id, status)
     VALUES ($1, 'activeclinic', 'activeclinic_staff', $2, 'active')`,
    [identityId, staffId]
  );
  await client.query(
    `INSERT INTO activeclinic.staff_role_assignments
       (organization_id, healthcare_organization_id, staff_member_id,
        role_id, scope_type, scope_id, status, assignment_origin)
     VALUES ($1,$2,$3,$4,'organisation',$1,'active','system')`,
    [fields.organizationId, fields.healthcareId, staffId, roleId]
  );
  if (fields.facilityId) {
    await client.query(
      `INSERT INTO activeclinic.staff_facility_assignments
         (organization_id, healthcare_organization_id, staff_member_id, facility_id, status, is_primary)
       VALUES ($1,$2,$3,$4,'active',true)`,
      [fields.organizationId, fields.healthcareId, staffId, fields.facilityId]
    );
  }
  return { ...fields, accountId: identityId };
}

async function noSession(page) {
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => /sid/i.test(cookie.name) && cookie.value)).toBe(false);
}

async function hasSession(page) {
  const cookies = await page.context().cookies();
  return cookies.some((cookie) => /sid/i.test(cookie.name) && cookie.value);
}

async function startChallenge(page, member) {
  await page.context().clearCookies();
  await page.goto("/login");
  await expect(page.locator("input[name='password']")).toBeVisible();
  await page.locator("input[name='login_email']").fill(member.email);
  await page.locator("input[name='password']").fill(PASSWORD);
  await page.locator("form[data-ac-login-form] button[type='submit']").click();
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
  const app = await page.request.get("/app", { maxRedirects: 0 });
  expect(app.status()).toBeGreaterThanOrEqual(300);
  expect(app.status()).toBeLessThan(400);
  return { attemptId, code };
}

async function openSessions(accountId) {
  const result = await withIsolatedDb((client) => client.query(
    `SELECT count(*)::int AS n
       FROM platform.deployment_sessions
      WHERE platform_identity_id = $1
        AND revoked_at IS NULL`,
    [accountId]
  ));
  return result.rows[0].n;
}

test.describe("V13 AC staff login OTP", () => {
  const members = {};

  test.beforeAll(async () => {
    await cleanup();
    const stamp = Date.now();
    const passwordHash = await bcrypt.hash(PASSWORD, 8);
    await withIsolatedDb(async (client) => {
      const clinics = await client.query(
        `SELECT o.organization_key, o.id AS organization_id, h.id AS healthcare_id
           FROM platform.organizations o
           JOIN activeclinic.healthcare_organizations h ON h.organization_id = o.id
          WHERE o.organization_key = ANY($1::text[])`,
        [["v13-d19-clinic-a", "v13-d19-clinic-b"]]
      );
      const byKey = new Map(clinics.rows.map((row) => [row.organization_key, row]));
      const clinicA = byKey.get("v13-d19-clinic-a");
      const clinicB = byKey.get("v13-d19-clinic-b");
      if (!clinicA || !clinicB) throw new Error("staff OTP fixture clinics are missing");
      const role = await client.query(`SELECT id FROM blessboard.roles WHERE role_key = $1 LIMIT 1`, [ROLE_KEY]);
      if (!role.rowCount) throw new Error("staff OTP fixture role is missing");
      const facility = await client.query(
        `SELECT id FROM activeclinic.facilities
          WHERE organization_id = $1 AND facility_key = 'hq' AND status = 'active'
          LIMIT 1`,
        [clinicA.organization_id]
      );
      const specs = ["show", "wrong", "expired", "complete", "concurrent", "clinic", "account", "resend", "rate", "other"];
      let index = 0;
      for (const key of specs) {
        index += 1;
        const clinic = key === "other" ? clinicB : clinicA;
        members[key] = await provisionStaff(client, {
          key,
          email: `g333-${key}-${stamp}${EMAIL_SUFFIX}`,
          phone: `+2609766${String(10000 + index).slice(-5)}`,
          staffNumber: `G333${key}${stamp}`.slice(0, 24),
          organizationId: clinic.organization_id,
          healthcareId: clinic.healthcare_id,
          facilityId: clinic === clinicA ? facility.rows[0] && facility.rows[0].id : null,
        }, passwordHash, role.rows[0].id);
      }
    });
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test.beforeEach(async ({ page }) => {
    await installLocalOnlyRoutes(page, process.env.PLAYWRIGHT_E2E_PORT || "4190");
  });

  test("password is accepted, the code form is shown, and no staff session exists", async ({ page }, testInfo) => {
    hold(testInfo, "STAFF-OTP-SHOW");
    const started = await startChallenge(page, members.show);
    const row = await withIsolatedDb((client) => client.query(
      `SELECT product_code, purpose, channel, organization_id, account_id, status, consumed
         FROM platform.otp_challenges
        WHERE attempt_id = $1`,
      [started.attemptId]
    ));
    expect(row.rowCount).toBe(1);
    expect(row.rows[0]).toMatchObject({
      product_code: "activeclinic",
      purpose: "login",
      channel: "email",
      organization_id: members.show.organizationId,
      account_id: members.show.accountId,
      status: "pending",
      consumed: false,
    });
    expect(await openSessions(members.show.accountId)).toBe(0);
  });

  test("an incorrect code does not authenticate", async ({ page }, testInfo) => {
    hold(testInfo, "STAFF-OTP-WRONG");
    await startChallenge(page, members.wrong);
    await page.locator("input[name='otp_code']").fill(WRONG_CODE);
    await page.locator("form[data-ac-staff-otp-form] button[type='submit']").click();
    await expect(page.locator("[data-ac-otp-reason='invalid_code']")).toBeVisible();
    await noSession(page);
    expect(await openSessions(members.wrong.accountId)).toBe(0);
    const app = await page.request.get("/app", { maxRedirects: 0 });
    expect(app.status()).toBeGreaterThanOrEqual(300);
  });

  test("an expired code does not authenticate", async ({ page }, testInfo) => {
    hold(testInfo, "STAFF-OTP-EXPIRED");
    const started = await startChallenge(page, members.expired);
    const expired = await page.request.post(
      `/__platform/qa/activeclinic-recovery-otp-expire?attemptId=${encodeURIComponent(started.attemptId)}`
    );
    expect(expired.status()).toBe(200);
    await page.locator("input[name='otp_code']").fill(started.code);
    await page.locator("form[data-ac-staff-otp-form] button[type='submit']").click();
    await expect(page.locator("[data-ac-otp-reason='expired']")).toBeVisible();
    await noSession(page);
    expect(await openSessions(members.expired.accountId)).toBe(0);
  });

  test("the correct code opens one session, a replay does not, and logout ends it", async ({ page }, testInfo) => {
    hold(testInfo, "STAFF-OTP-COMPLETE");
    const member = members.complete;
    const started = await startChallenge(page, member);
    const otpCookie = (await page.context().cookies()).find((cookie) => cookie.name === "ac_staff_login_otp");
    const csrf = await page.locator("form[data-ac-staff-otp-form] input[name='_csrf']").inputValue();
    await page.locator("input[name='otp_code']").fill(started.code);
    await page.locator("form[data-ac-staff-otp-form] button[type='submit']").click();
    await expect(page).toHaveURL(/\/app/);
    expect(await hasSession(page)).toBe(true);
    const protectedPage = await page.goto("/app");
    expect(protectedPage.status()).toBeLessThan(400);
    await expect(page).not.toHaveURL(/\/login/);
    expect(await openSessions(member.accountId)).toBe(1);
    await page.context().addCookies([otpCookie]);
    const replay = await page.request.post("/login/otp", {
      form: { _csrf: csrf, otp_code: started.code },
      maxRedirects: 0,
    });
    expect(replay.status()).not.toBe(303);
    expect(await openSessions(member.accountId)).toBe(1);
    await page.goto("/logout");
    await expect(page).toHaveURL(/\/login/);
    await noSession(page);
    const after = await page.request.get("/app", { maxRedirects: 0 });
    expect(after.status()).toBeGreaterThanOrEqual(300);
    const revoked = await withIsolatedDb((client) => client.query(
      `SELECT count(*)::int AS n
         FROM platform.deployment_sessions
        WHERE platform_identity_id = $1
          AND revoked_at IS NULL`,
      [member.accountId]
    ));
    expect(revoked.rows[0].n).toBe(0);
  });

  test("simultaneous verification creates one session", async ({ page }, testInfo) => {
    hold(testInfo, "STAFF-OTP-CONCURRENT");
    const member = members.concurrent;
    const started = await startChallenge(page, member);
    const csrf = await page.locator("form[data-ac-staff-otp-form] input[name='_csrf']").inputValue();
    const attempts = await Promise.all([
      page.request.post("/login/otp", { form: { _csrf: csrf, otp_code: started.code }, maxRedirects: 0 }),
      page.request.post("/login/otp", { form: { _csrf: csrf, otp_code: started.code }, maxRedirects: 0 }),
    ]);
    expect(attempts.filter((response) => response.status() === 303)).toHaveLength(1);
    expect(await openSessions(member.accountId)).toBe(1);
  });

  test("a challenge moved to another clinic or account is rejected", async ({ page }, testInfo) => {
    hold(testInfo, "STAFF-OTP-CROSS");
    const clinicStarted = await startChallenge(page, members.clinic);
    const movedClinic = await withIsolatedDb((client) => client.query(
      `UPDATE platform.otp_challenges
          SET organization_id = $2
        WHERE attempt_id = $1
          AND organization_id = $3
          AND status = 'pending'`,
      [clinicStarted.attemptId, members.other.organizationId, members.clinic.organizationId]
    ));
    expect(movedClinic.rowCount).toBe(1);
    await page.locator("input[name='otp_code']").fill(clinicStarted.code);
    await page.locator("form[data-ac-staff-otp-form] button[type='submit']").click();
    await expect(page.locator("[data-ac-otp-reason='cross_tenant']")).toBeVisible();
    await noSession(page);
    expect(await openSessions(members.clinic.accountId)).toBe(0);

    const accountStarted = await startChallenge(page, members.account);
    const movedAccount = await withIsolatedDb((client) => client.query(
      `UPDATE platform.otp_challenges
          SET account_id = $2
        WHERE attempt_id = $1
          AND account_id = $3
          AND status = 'pending'`,
      [accountStarted.attemptId, members.other.accountId, members.account.accountId]
    ));
    expect(movedAccount.rowCount).toBe(1);
    await page.locator("input[name='otp_code']").fill(accountStarted.code);
    await page.locator("form[data-ac-staff-otp-form] button[type='submit']").click();
    await expect(page.locator("[data-ac-otp-reason='verification_failed']")).toBeVisible();
    await noSession(page);
    expect(await openSessions(members.account.accountId)).toBe(0);
    expect(await openSessions(members.other.accountId)).toBe(0);
  });

  test("resend cooldown keeps the session closed", async ({ page }, testInfo) => {
    hold(testInfo, "STAFF-OTP-RESEND");
    await startChallenge(page, members.resend);
    await page.locator("form[action='/login/otp/resend'] button[type='submit']").click();
    await expect(page.locator("[data-ac-otp-reason='resend_cooldown']")).toBeVisible();
    await noSession(page);
    expect(await openSessions(members.resend.accountId)).toBe(0);
  });

  test("the account attempt cap fails closed", async ({ page }, testInfo) => {
    hold(testInfo, "STAFF-OTP-RATE");
    const member = members.rate;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await startChallenge(page, member);
      await withIsolatedDb((client) => client.query(
        `DELETE FROM platform.otp_challenges WHERE account_id = $1 AND purpose = 'login'`,
        [member.accountId]
      ));
    }
    await page.context().clearCookies();
    await page.goto("/login");
    await page.locator("input[name='login_email']").fill(member.email);
    await page.locator("input[name='password']").fill(PASSWORD);
    await page.locator("form[data-ac-login-form] button[type='submit']").click();
    await expect(page.getByText("Sign-in is temporarily unavailable.")).toBeVisible();
    await expect(page.locator("[data-ac-otp-required='1']")).toHaveCount(0);
    await noSession(page);
    expect(await openSessions(member.accountId)).toBe(0);
  });
});
