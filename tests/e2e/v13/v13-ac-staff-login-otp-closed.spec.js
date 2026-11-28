"use strict";

/**
 * Staff login OTP with the observer flag and no delivery provider.
 * The password check still happens. No session is created.
 */

const { test, expect } = require("@playwright/test");
const { Client } = require("pg");
const bcrypt = require("bcryptjs");
const { installLocalOnlyRoutes } = require("../../v13/helpers/v13BrowserIsolation");

const PASSWORD = "V13-G333-staff-closed-9!";
const EMAIL_SUFFIX = "@g333closed.v13d19.example";
const ROLE_KEY = "activeclinic_organization_admin";

function hold(testInfo, name) {
  if (
    process.env.GETPRO_V13_BROWSER_AUTHORIZED !== "1" ||
    process.env.GETPRO_V13_ALLOW_DB_WRITES !== "1" ||
    process.env.GETPRO_V13_DB_STAGES_AUTHORIZED !== "1" ||
    process.env.GETPRO_AC_STAFF_LOGIN_OTP_OBSERVER !== "1" ||
    process.env.GETPRO_OTP_PROVIDER === "qa-observer"
  ) {
    testInfo.annotations.push({ type: "v13-result", description: "NOT_RUN" });
    throw new Error(`NOT_RUN: ${name} waits for staff OTP without a provider`);
  }
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

test("missing provider keeps the staff session closed after a correct password", async ({ page }, testInfo) => {
  hold(testInfo, "STAFF-OTP-CLOSED");
  await installLocalOnlyRoutes(page, process.env.PLAYWRIGHT_E2E_PORT || "4192");
  const stamp = Date.now();
  const email = `g333-closed-${stamp}${EMAIL_SUFFIX}`;
  const passwordHash = await bcrypt.hash(PASSWORD, 8);
  let accountId = null;
  await withIsolatedDb(async (client) => {
    const clinic = await client.query(
      `SELECT o.id AS organization_id, h.id AS healthcare_id
         FROM platform.organizations o
         JOIN activeclinic.healthcare_organizations h ON h.organization_id = o.id
        WHERE o.organization_key = 'v13-d19-clinic-a'
        LIMIT 1`
    );
    const role = await client.query(`SELECT id FROM blessboard.roles WHERE role_key = $1 LIMIT 1`, [ROLE_KEY]);
    const facility = await client.query(
      `SELECT id FROM activeclinic.facilities
        WHERE organization_id = $1 AND facility_key = 'hq' AND status = 'active'
        LIMIT 1`,
      [clinic.rows[0].organization_id]
    );
    const identity = await client.query(
      `INSERT INTO platform.identities
         (status, primary_email, email_normalized, email_verified_at, password_hash, must_change_password)
       VALUES ('active', $1, $1, now(), $2, false)
       RETURNING id`,
      [email, passwordHash]
    );
    accountId = identity.rows[0].id;
    const staff = await client.query(
      `INSERT INTO activeclinic.staff_members
         (organization_id, healthcare_organization_id, platform_identity_id,
          staff_number, first_name, last_name, display_name,
          phone_normalized, phone_display, email_normalized, email_display,
          employment_type, status)
       VALUES ($1,$2,$3,$4,'G333','Closed','G333 Closed',$5,$5,$6,$6,'permanent','active')
       RETURNING id`,
      [clinic.rows[0].organization_id, clinic.rows[0].healthcare_id, accountId, `G333C${stamp}`.slice(0, 24), `+260976700${String(stamp).slice(-4)}`, email]
    );
    await client.query(
      `INSERT INTO platform.identity_product_profiles
         (identity_id, product_key, profile_type, product_profile_id, status)
       VALUES ($1, 'activeclinic', 'activeclinic_staff', $2, 'active')`,
      [accountId, staff.rows[0].id]
    );
    await client.query(
      `INSERT INTO activeclinic.staff_role_assignments
         (organization_id, healthcare_organization_id, staff_member_id,
          role_id, scope_type, scope_id, status, assignment_origin)
       VALUES ($1,$2,$3,$4,'organisation',$1,'active','system')`,
      [clinic.rows[0].organization_id, clinic.rows[0].healthcare_id, staff.rows[0].id, role.rows[0].id]
    );
    if (facility.rows[0]) {
      await client.query(
        `INSERT INTO activeclinic.staff_facility_assignments
           (organization_id, healthcare_organization_id, staff_member_id, facility_id, status, is_primary)
         VALUES ($1,$2,$3,$4,'active',true)`,
        [clinic.rows[0].organization_id, clinic.rows[0].healthcare_id, staff.rows[0].id, facility.rows[0].id]
      );
    }
  });
  try {
    await page.goto("/login");
    await page.locator("input[name='login_email']").fill(email);
    await page.locator("input[name='password']").fill(PASSWORD);
    await page.locator("form[data-ac-login-form] button[type='submit']").click();
    await expect(page.getByText("Sign-in is temporarily unavailable.")).toBeVisible();
    await expect(page.locator("[data-ac-otp-required='1']")).toHaveCount(0);
    const cookies = await page.context().cookies();
    expect(cookies.some((cookie) => /sid/i.test(cookie.name) && cookie.value)).toBe(false);
    const app = await page.request.get("/app", { maxRedirects: 0 });
    expect(app.status()).toBeGreaterThanOrEqual(300);
    const sessions = await withIsolatedDb((client) => client.query(
      `SELECT count(*)::int AS n FROM platform.deployment_sessions
        WHERE platform_identity_id = $1 AND revoked_at IS NULL`,
      [accountId]
    ));
    expect(sessions.rows[0].n).toBe(0);
  } finally {
    await withIsolatedDb(async (client) => {
      const staff = await client.query(`SELECT id FROM activeclinic.staff_members WHERE platform_identity_id = $1`, [accountId]);
      const staffIds = staff.rows.map((row) => row.id);
      await client.query(`DELETE FROM platform.otp_challenges WHERE account_id = $1`, [accountId]);
      await client.query(`DELETE FROM platform.deployment_sessions WHERE platform_identity_id = $1`, [accountId]);
      if (staffIds.length) {
        await client.query(`DELETE FROM activeclinic.staff_role_assignments WHERE staff_member_id = ANY($1::uuid[])`, [staffIds]);
        await client.query(`DELETE FROM activeclinic.staff_facility_assignments WHERE staff_member_id = ANY($1::uuid[])`, [staffIds]);
      }
      await client.query(`DELETE FROM platform.identity_product_profiles WHERE identity_id = $1`, [accountId]);
      await client.query(`DELETE FROM activeclinic.staff_members WHERE platform_identity_id = $1`, [accountId]);
      await client.query(`DELETE FROM platform.identities WHERE id = $1`, [accountId]);
    });
  }
});
