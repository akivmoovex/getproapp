"use strict";

/**
 * ActiveClinic email OTP is the forgot-password code gate.
 * A reset link is issued only after that protected action completes.
 * Staff login, clinic-administrator login, and patient login have no code
 * form. Patient forgot-password does not prove an account before the hold,
 * so it stays on the link path. Those workflows are not treated as email OTP.
 */

const crypto = require("crypto");
const { test, expect } = require("@playwright/test");
const { Client } = require("pg");
const bcrypt = require("bcryptjs");
const { installLocalOnlyRoutes } = require("../../v13/helpers/v13BrowserIsolation");

const MEMBER_PASSWORD = "V13-G319-ac-otp-9!";
const RESET_PASSWORD = "V13-G319-reset-9!";
const EMAIL_SUFFIX = "@g319.v13d19.example";
const WRONG_CODE = "000000";
const ROLE_KEY = "activeclinic_organization_admin";

function hold(testInfo, name) {
  if (
    process.env.GETPRO_V13_BROWSER_AUTHORIZED !== "1" ||
    process.env.GETPRO_V13_ALLOW_DB_WRITES !== "1" ||
    process.env.GETPRO_V13_DB_STAGES_AUTHORIZED !== "1" ||
    process.env.GETPRO_AC_RECOVERY_OTP_OBSERVER !== "1"
  ) {
    testInfo.annotations.push({ type: "v13-result", description: "NOT_RUN" });
    throw new Error(`NOT_RUN: ${name} is implemented and waits for disposable browser authorization`);
  }
}

function assertDistinctCode(code) {
  if (!/^\d{6}$/.test(String(code || "")) || String(code) === WRONG_CODE) {
    throw new Error("recovery OTP observer did not return a code distinct from the wrong-code sentinel");
  }
}

async function withIsolatedDb(work) {
  const password = String(process.env.PGPASSWORD || "");
  if (!password) throw new Error("AC OTP fixture is missing the isolated role password");
  const client = new Client({
    host: "127.0.0.1",
    port: 55432,
    user: "v13_regression_213101",
    database: "getpro_v13_e2e_g78d2301",
    password,
    ssl: false,
  });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

function recoveryContextBucket() {
  const hash = crypto.createHash("sha256").update("otp-ctx:activeclinic.forgot_password").digest("hex");
  return `context:${hash}:password_recovery`;
}

async function cleanupAcOtpIdentities() {
  await withIsolatedDb(async (client) => {
    await client.query(
      `DELETE FROM platform.otp_rate_buckets WHERE bucket_key = ANY($1::text[])`,
      [[recoveryContextBucket(), "provider:qa-observer:email"]]
    );
    const pattern = `%${EMAIL_SUFFIX}`;
    const identities = await client.query(
      `SELECT id FROM platform.identities WHERE email_normalized LIKE $1`,
      [pattern]
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
    await client.query(`DELETE FROM platform.identity_action_tokens WHERE platform_identity_id = ANY($1::uuid[])`, [identityIds]);
    if (staffIds.length) {
      await client.query(`DELETE FROM activeclinic.staff_role_assignments WHERE staff_member_id = ANY($1::uuid[])`, [staffIds]);
      await client.query(`DELETE FROM activeclinic.staff_facility_assignments WHERE staff_member_id = ANY($1::uuid[])`, [staffIds]);
    }
    await client.query(`DELETE FROM platform.identity_product_profiles WHERE identity_id = ANY($1::uuid[])`, [identityIds]);
    await client.query(`DELETE FROM activeclinic.staff_members WHERE platform_identity_id = ANY($1::uuid[])`, [identityIds]);
    await client.query(
      `DELETE FROM platform.identities WHERE id = ANY($1::uuid[]) AND email_normalized LIKE $2`,
      [identityIds, pattern]
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
  const phone = fields.phone;
  const staff = await client.query(
    `INSERT INTO activeclinic.staff_members
       (organization_id, healthcare_organization_id, platform_identity_id,
        staff_number, first_name, last_name, display_name,
        phone_normalized, phone_display, email_normalized, email_display,
        employment_type, status)
     VALUES ($1,$2,$3,$4,'G319',$5,$6,$7,$8,$9,$10,'permanent','active')
     RETURNING id`,
    [
      fields.organizationId,
      fields.healthcareId,
      identityId,
      fields.staffNumber,
      fields.key,
      `G319 ${fields.key}`,
      phone,
      phone,
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
  return {
    key: fields.key,
    email: fields.email,
    accountId: identityId,
    staffId,
    organizationId: fields.organizationId,
    healthcareId: fields.healthcareId,
  };
}

async function noSession(page) {
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => /sid/i.test(cookie.name) && cookie.value)).toBe(false);
}

async function requestOtp(page, member) {
  await page.goto("/forgot-password");
  const identifier = page.locator("input[name='identifier']:visible, input[name='phone_national']:visible").first();
  await identifier.fill(member.email);
  await page.locator("button[type='submit']").click();
  await expect(page.locator("[data-ac-otp-required='1']")).toBeVisible();
  await expect(page.locator("input[name='otp_code']")).toBeVisible();
  const attemptId = await page.locator("[data-ac-otp-attempt]").getAttribute("data-ac-otp-attempt");
  expect(attemptId).toMatch(/^[0-9a-f-]{36}$/i);
  await expect(page.locator("input[name='otp_account_id']")).toHaveValue(member.accountId);
  await expect(page.locator("input[name='otp_organization_id']")).toHaveValue(member.organizationId);
  const delivery = await page.request.get(
    `/__platform/qa/activeclinic-recovery-otp-delivery?attemptId=${encodeURIComponent(attemptId)}`
  );
  expect(delivery.status()).toBe(200);
  const payload = await delivery.json();
  const code = String(payload.code || "");
  assertDistinctCode(code);
  await expect(page.locator("body")).not.toContainText(code);
  await expect(page.locator("body")).not.toContainText("/reset-password/");
  await noSession(page);
  return { attemptId, code };
}

async function resetDeliveryStatus(page, email) {
  const delivery = await page.request.get(
    `/__platform/qa/activeclinic-password-reset-delivery?identifier=${encodeURIComponent(email)}`
  );
  return delivery.status();
}

test.describe("V13 AC email OTP recovery", () => {
  const members = {};

  test.beforeAll(async () => {
    await cleanupAcOtpIdentities();
    const stamp = Date.now();
    const passwordHash = await bcrypt.hash(MEMBER_PASSWORD, 8);
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
      if (!clinicA || !clinicB) throw new Error("AC OTP fixture clinics are missing");
      const role = await client.query(
        `SELECT id FROM blessboard.roles WHERE role_key = $1 LIMIT 1`,
        [ROLE_KEY]
      );
      if (!role.rowCount) throw new Error("AC OTP fixture role is missing");
      const facility = await client.query(
        `SELECT id FROM activeclinic.facilities
          WHERE organization_id = $1 AND facility_key = 'hq' AND status = 'active'
          LIMIT 1`,
        [clinicA.organization_id]
      );
      const specs = [
        ["bind", clinicA],
        ["wrong", clinicA],
        ["expired", clinicA],
        ["product", clinicA],
        ["clinic", clinicA],
        ["account", clinicA],
        ["complete", clinicA],
        ["concurrent", clinicA],
        ["other", clinicB],
      ];
      let index = 0;
      for (const [key, clinic] of specs) {
        index += 1;
        members[key] = await provisionStaff(client, {
          key,
          email: `g319-${key}-${stamp}${EMAIL_SUFFIX}`,
          phone: `+2609773${String(10000 + index).slice(-5)}`,
          staffNumber: `G319${key}${stamp}`.slice(0, 24),
          organizationId: clinic.organization_id,
          healthcareId: clinic.healthcare_id,
          facilityId: clinic === clinicA ? facility.rows[0] && facility.rows[0].id : null,
        }, passwordHash, role.rows[0].id);
      }
    });
  });

  test.afterAll(async () => {
    await cleanupAcOtpIdentities();
  });

  test.beforeEach(async ({ page }) => {
    await installLocalOnlyRoutes(page, process.env.PLAYWRIGHT_E2E_PORT || "4189");
  });

  test("AC-OTP eligible account receives a bound challenge and no session", async ({ page }, testInfo) => {
    hold(testInfo, "AC-OTP-BIND");
    const started = await requestOtp(page, members.bind);
    const row = await withIsolatedDb((client) => client.query(
      `SELECT product_code, purpose, channel, organization_id, account_id, status
         FROM platform.otp_challenges
        WHERE attempt_id = $1`,
      [started.attemptId]
    ));
    expect(row.rowCount).toBe(1);
    expect(row.rows[0].product_code).toBe("activeclinic");
    expect(row.rows[0].purpose).toBe("password_recovery");
    expect(row.rows[0].channel).toBe("email");
    expect(row.rows[0].status).toBe("pending");
    expect(row.rows[0].organization_id).toBe(members.bind.organizationId);
    expect(row.rows[0].account_id).toBe(members.bind.accountId);
    expect(await resetDeliveryStatus(page, members.bind.email)).toBe(404);
  });

  test("AC-OTP wrong code is rejected", async ({ page }, testInfo) => {
    hold(testInfo, "AC-OTP-WRONG");
    await requestOtp(page, members.wrong);
    await page.locator("input[name='otp_code']").fill(WRONG_CODE);
    await page.locator("form[data-ac-otp-form='1'] button[type='submit']").click();
    await expect(page.locator("[data-ac-otp-reason='invalid_code']")).toBeVisible();
    await expect(page).not.toHaveURL(/\/forgot-password\/check/);
    await noSession(page);
    expect(await resetDeliveryStatus(page, members.wrong.email)).toBe(404);
  });

  test("AC-OTP expired challenge is rejected", async ({ page }, testInfo) => {
    hold(testInfo, "AC-OTP-EXPIRED");
    const started = await requestOtp(page, members.expired);
    assertDistinctCode(started.code);
    const expired = await page.request.post(
      `/__platform/qa/activeclinic-recovery-otp-expire?attemptId=${encodeURIComponent(started.attemptId)}`
    );
    expect(expired.status()).toBe(200);
    const body = await expired.json();
    expect(body.expired).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/\d{6}/);
    await page.locator("input[name='otp_code']").fill(started.code);
    await page.locator("form[data-ac-otp-form='1'] button[type='submit']").click();
    await expect(page.locator("[data-ac-otp-reason='expired']")).toBeVisible();
    await noSession(page);
    expect(await resetDeliveryStatus(page, members.expired.email)).toBe(404);
  });

  test("AC-OTP wrong product is rejected", async ({ page }, testInfo) => {
    hold(testInfo, "AC-OTP-PRODUCT");
    const started = await requestOtp(page, members.product);
    const moved = await withIsolatedDb((client) => client.query(
      `UPDATE platform.otp_challenges
          SET product_code = 'blessboard'
        WHERE attempt_id = $1
          AND product_code = 'activeclinic'
          AND purpose = 'password_recovery'
          AND status = 'pending'`,
      [started.attemptId]
    ));
    expect(moved.rowCount).toBe(1);
    await page.locator("input[name='otp_code']").fill(started.code);
    await page.locator("form[data-ac-otp-form='1'] button[type='submit']").click();
    await expect(page.locator("[data-ac-otp-reason='verification_failed']")).toBeVisible();
    await noSession(page);
    expect(await resetDeliveryStatus(page, members.product.email)).toBe(404);
  });

  test("AC-OTP wrong clinic is rejected", async ({ page }, testInfo) => {
    hold(testInfo, "AC-OTP-CLINIC");
    const started = await requestOtp(page, members.clinic);
    await page.locator("input[name='otp_organization_id']").evaluate((input, value) => {
      input.value = value;
    }, members.other.organizationId);
    await page.locator("input[name='otp_code']").fill(started.code);
    await page.locator("form[data-ac-otp-form='1'] button[type='submit']").click();
    await expect(page.locator("[data-ac-otp-reason='cross_tenant']")).toBeVisible();
    await noSession(page);
    expect(await resetDeliveryStatus(page, members.clinic.email)).toBe(404);
  });

  test("AC-OTP wrong account is rejected", async ({ page }, testInfo) => {
    hold(testInfo, "AC-OTP-ACCOUNT");
    const started = await requestOtp(page, members.account);
    await page.locator("input[name='otp_account_id']").evaluate((input, value) => {
      input.value = value;
    }, members.other.accountId);
    await page.locator("input[name='otp_code']").fill(started.code);
    await page.locator("form[data-ac-otp-form='1'] button[type='submit']").click();
    await expect(page.locator("[data-ac-otp-reason='verification_failed']")).toBeVisible();
    await noSession(page);
    expect(await resetDeliveryStatus(page, members.account.email)).toBe(404);
  });

  test("AC-OTP correct code completes recovery once and then signs in", async ({ page }, testInfo) => {
    hold(testInfo, "AC-OTP-COMPLETE");
    const member = members.complete;
    const started = await requestOtp(page, member);
    const jar = (await page.context().cookies()).map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    const csrf = await page.locator("form[data-ac-otp-form='1'] input[name='_csrf']").inputValue();
    await page.locator("input[name='otp_code']").fill(started.code);
    await page.locator("form[data-ac-otp-form='1'] button[type='submit']").click();
    await expect(page).toHaveURL(/\/forgot-password\/check/);
    await expect(page.locator("body")).not.toContainText("/reset-password/");
    await noSession(page);
    const replay = await page.request.post("/forgot-password/otp-verify", {
      form: {
        _csrf: csrf,
        otp_code: started.code,
        otp_attempt_id: started.attemptId,
        otp_account_id: member.accountId,
        otp_organization_id: member.organizationId,
        identifier: member.email,
      },
      headers: { cookie: jar },
      maxRedirects: 0,
    });
    expect(replay.status()).toBe(401);
    expect(await replay.text()).toMatch(/data-ac-otp-reason="replay"/);
    const delivery = await page.request.get(
      `/__platform/qa/activeclinic-password-reset-delivery?identifier=${encodeURIComponent(member.email)}`
    );
    expect(delivery.status()).toBe(200);
    const issued = await delivery.json();
    const token = String(issued.resetUrl || "").split("/reset-password/")[1].split(/[?#]/)[0];
    expect(token).toBeTruthy();
    await expect(page.locator("body")).not.toContainText(token);
    await page.goto(`/reset-password/${token}`);
    await page.locator("input[name='password']").fill(RESET_PASSWORD);
    await page.locator("input[name='password_confirm']").fill(RESET_PASSWORD);
    await page.locator("button[type='submit']").click();
    await expect(page.getByText("Your password has been updated")).toBeVisible();
    await page.goto("/login");
    await page.locator("input[name='login_email']").fill(member.email);
    await page.locator("input[name='password']").fill(RESET_PASSWORD);
    await page.locator("form[data-ac-login-form] button[type='submit']").click();
    await expect(page.locator("[data-ac-shell='staff-app']")).toBeVisible();
    const cookies = await page.context().cookies();
    expect(cookies.some((cookie) => /sid/i.test(cookie.name) && cookie.value)).toBe(true);
  });

  test("AC-OTP concurrent completion allows one recovery", async ({ page }, testInfo) => {
    hold(testInfo, "AC-OTP-CONCURRENT");
    const member = members.concurrent;
    const started = await requestOtp(page, member);
    const csrf = await page.locator("form[data-ac-otp-form='1'] input[name='_csrf']").inputValue();
    const attempts = await Promise.all([
      page.request.post("/forgot-password/otp-verify", {
        form: {
          _csrf: csrf,
          otp_code: started.code,
          otp_attempt_id: started.attemptId,
          otp_account_id: member.accountId,
          otp_organization_id: member.organizationId,
          identifier: member.email,
        },
        maxRedirects: 0,
      }),
      page.request.post("/forgot-password/otp-verify", {
        form: {
          _csrf: csrf,
          otp_code: started.code,
          otp_attempt_id: started.attemptId,
          otp_account_id: member.accountId,
          otp_organization_id: member.organizationId,
          identifier: member.email,
        },
        maxRedirects: 0,
      }),
    ]);
    const winners = attempts.filter((response) => response.status() === 303);
    expect(winners).toHaveLength(1);
    expect(await resetDeliveryStatus(page, member.email)).toBe(200);
    const tokens = await withIsolatedDb((client) => client.query(
      `SELECT count(*)::int AS n
         FROM platform.identity_action_tokens
        WHERE platform_identity_id = $1
          AND purpose = 'activeclinic_password_reset'`,
      [member.accountId]
    ));
    expect(tokens.rows[0].n).toBe(1);
    await noSession(page);
  });

  test("AC-OTP missing observer challenge fails closed", async ({ page }, testInfo) => {
    hold(testInfo, "AC-OTP-OBSERVER-MISSING");
    const missing = await page.request.get("/__platform/qa/activeclinic-recovery-otp-delivery");
    expect(missing.status()).toBe(400);
    expect(JSON.stringify(await missing.json())).not.toMatch(/\d{6}/);
    const unknown = await page.request.get(
      "/__platform/qa/activeclinic-recovery-otp-delivery?attemptId=11111111-1111-4111-8111-111111111111"
    );
    expect(unknown.status()).toBe(404);
    expect(JSON.stringify(await unknown.json())).not.toMatch(/\d{6}/);
  });
});
