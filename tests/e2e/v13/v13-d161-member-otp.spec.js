"use strict";

/**
 * D161 BlessBoard member-login OTP browser journey.
 * Synthetic members on the isolated disposable database. The code is read
 * only from the loopback observer. The page must not render it.
 */

const crypto = require("crypto");
const { test, expect } = require("@playwright/test");
const { Client } = require("pg");
const bcrypt = require("bcryptjs");
const { installLocalOnlyRoutes } = require("../../v13/helpers/v13BrowserIsolation");

const MEMBER_PASSWORD = "V13-D161-member-otp-9!";
const EMAIL_SUFFIX = "@d161.v13d19.example";
const WRONG_CODE = "000000";

function hold(testInfo, name) {
  if (
    process.env.GETPRO_V13_BROWSER_AUTHORIZED !== "1" ||
    process.env.GETPRO_V13_ALLOW_DB_WRITES !== "1" ||
    process.env.GETPRO_V13_DB_STAGES_AUTHORIZED !== "1" ||
    process.env.GETPRO_BB_LOGIN_OTP_OBSERVER !== "1"
  ) {
    testInfo.annotations.push({ type: "v13-result", description: "NOT_RUN" });
    throw new Error(`NOT_RUN: ${name} is implemented and waits for disposable browser authorization`);
  }
}

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required for the authorized browser journey`);
  return value;
}

function assertDistinctCode(code) {
  if (!/^\d{6}$/.test(String(code || "")) || String(code) === WRONG_CODE) {
    throw new Error("login OTP observer did not return a code distinct from the wrong-code sentinel");
  }
}

async function withIsolatedDb(work) {
  const password = String(process.env.PGPASSWORD || "");
  if (!password) throw new Error("D161 fixture is missing the isolated role password");
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

async function provisionMember(client, fields, passwordHash) {
  const user = await client.query(
    `INSERT INTO blessboard.users
       (email_normalized, email_display, password_hash, status, display_name,
        email_verified_at, password_changed_at, password_change_required)
     VALUES ($1, $2, $3, 'active', $4, now(), now(), false)
     RETURNING id`,
    [fields.email, fields.email, passwordHash, fields.fullName]
  );
  const member = await client.query(
    `INSERT INTO blessboard.members
       (church_id, user_id, first_name, last_name, email_normalized, email_display,
        member_number, status, portal_access_status, phone_verification_required)
     VALUES ($1, $2, $3, $4, $5, $5, $6, 'active', 'active', false)
     RETURNING id, member_number`,
    [fields.churchId, user.rows[0].id, "D161", fields.key, fields.email, fields.number]
  );
  const branch = await client.query(
    `SELECT id
       FROM blessboard.branches
      WHERE church_id = $1
        AND status = 'active'
      ORDER BY CASE WHEN lower(branch_key) = 'hq' THEN 0 ELSE 1 END, created_at ASC
      LIMIT 1`,
    [fields.churchId]
  );
  if (!branch.rows[0]) throw new Error("D161 fixture branch is missing");
  await client.query(
    `INSERT INTO blessboard.member_branch_memberships
       (member_id, branch_id, membership_status, is_primary)
     VALUES ($1, $2, 'active', true)`,
    [member.rows[0].id, branch.rows[0].id]
  );
  return {
    number: member.rows[0].member_number,
    fullName: fields.fullName,
    email: fields.email,
    home: fields.home,
    churchName: fields.churchName,
    password: MEMBER_PASSWORD,
  };
}

async function noSession(page) {
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => /sid/.test(cookie.name) && cookie.value)).toBe(false);
}

async function beginLogin(page, member) {
  await page.context().clearCookies();
  await page.goto(`${member.home}/member/login`);
  await page.locator("input[name='member_number']").fill(member.number);
  await page.locator("input[name='password']").fill(member.password);
  await page.locator("form").filter({ has: page.locator("input[name='member_number']") }).locator("button[type='submit']").click();
  await expect(page.locator("input[name='otp_code']")).toBeVisible();
  const attemptId = await page.locator("form[data-bb-login-attempt]").getAttribute("data-bb-login-attempt");
  expect(attemptId).toMatch(/^[0-9a-f-]{36}$/i);
  const delivery = await page.request.get(
    `/__platform/qa/blessboard-login-otp-delivery?attemptId=${encodeURIComponent(attemptId)}`
  );
  expect(delivery.status()).toBe(200);
  const payload = await delivery.json();
  const code = String(payload.code || "");
  assertDistinctCode(code);
  await expect(page.locator("body")).not.toContainText(code);
  await expect(page.locator("body")).not.toContainText("Test code:");
  return { attemptId, code };
}

function memberLoginContextBucket() {
  const hash = crypto.createHash("sha256").update("otp-ctx:blessboard.member_login").digest("hex");
  return `context:${hash}:login`;
}

async function cleanupD161Members() {
  await withIsolatedDb(async (client) => {
    // Previous D161 runs share the member-login context bucket and the
    // qa-observer provider bucket. Reset only those disposable counters.
    await client.query(
      `DELETE FROM platform.otp_rate_buckets WHERE bucket_key = ANY($1::text[])`,
      [[memberLoginContextBucket(), "provider:qa-observer:email"]]
    );
    const pattern = `%${EMAIL_SUFFIX}`;
    const members = await client.query(
      `SELECT id, user_id FROM blessboard.members WHERE email_normalized LIKE $1`,
      [pattern]
    );
    const memberIds = members.rows.map((row) => row.id);
    const userIds = members.rows.map((row) => row.user_id).filter(Boolean);
    if (userIds.length) {
      await client.query(`DELETE FROM platform.otp_challenges WHERE account_id = ANY($1::uuid[])`, [userIds]);
      await client.query(`DELETE FROM platform.deployment_sessions WHERE user_id = ANY($1::uuid[])`, [userIds]);
    }
    if (memberIds.length) {
      await client.query(`DELETE FROM blessboard.member_branch_memberships WHERE member_id = ANY($1::uuid[])`, [memberIds]);
      await client.query(`DELETE FROM blessboard.members WHERE id = ANY($1::uuid[])`, [memberIds]);
    }
    if (userIds.length) {
      await client.query(`DELETE FROM blessboard.users WHERE id = ANY($1::uuid[]) AND email_normalized LIKE $2`, [userIds, pattern]);
    }
  });
}

test.describe("V13 BB D161 member login OTP", () => {
  const members = {};

  test.beforeAll(async () => {
    await cleanupD161Members();
    const homeA = required("E2E_BB_PUBLIC_HOME_PATH");
    const homeB = homeA.replace("church-a", "church-b");
    const churchA = required("E2E_BB_CHURCH_A_NAME");
    const churchB = "V13 D19 Church B";
    const stamp = Date.now();
    const passwordHash = await bcrypt.hash(MEMBER_PASSWORD, 8);
    await withIsolatedDb(async (client) => {
      const churches = await client.query(
        `SELECT id, church_key, display_name FROM blessboard.churches WHERE church_key = ANY($1::text[])`,
        [["v13d19-church-a", "v13d19-church-b"]]
      );
      const byKey = new Map(churches.rows.map((row) => [row.church_key, row]));
      const specs = [
        ["pending", "v13d19-church-a", homeA, churchA],
        ["wrong", "v13d19-church-a", homeA, churchA],
        ["expired", "v13d19-church-a", homeA, churchA],
        ["complete", "v13d19-church-a", homeA, churchA],
        ["tenant", "v13d19-church-a", homeA, churchA],
        ["memberA", "v13d19-church-a", homeA, churchA],
        ["memberB", "v13d19-church-a", homeA, churchA],
        ["otherTenant", "v13d19-church-b", homeB, churchB],
        ["concurrent", "v13d19-church-b", homeB, churchB],
        ["limited", "v13d19-church-b", homeB, churchB],
      ];
      for (const [key, churchKey, home, churchName] of specs) {
        const church = byKey.get(churchKey);
        if (!church) throw new Error(`D161 fixture church ${churchKey} is missing`);
        members[key] = await provisionMember(client, {
          key,
          churchId: church.id,
          number: `D161${key}${stamp}`.slice(0, 24),
          fullName: `D161 ${key} ${stamp}`,
          email: `d161-${key}-${stamp}${EMAIL_SUFFIX}`,
          home,
          churchName,
        }, passwordHash);
      }
    });
  });

  test.afterAll(async () => {
    await cleanupD161Members();
  });

  test.beforeEach(async ({ page }) => {
    await installLocalOnlyRoutes(page, process.env.PLAYWRIGHT_E2E_PORT || "4188");
  });

  test("BB-OTP login form is reachable from the keyboard", async ({ page }, testInfo) => {
    hold(testInfo, "BB-OTP-FORM");
    await page.goto(`${required("E2E_BB_PUBLIC_HOME_PATH")}/member/login`);
    await page.locator("a.bb-auth-skip").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("input[name='member_number']")).toBeVisible();
    await expect(page.locator("input[name='password']")).toBeVisible();
  });

  test("BB-OTP credentials leave the session closed until the code form", async ({ page }, testInfo) => {
    hold(testInfo, "BB-OTP-PENDING");
    const started = await beginLogin(page, members.pending);
    await expect(page.locator("input[name='otp_code']")).toBeFocused();
    await expect(page.locator("label[for='otp_code']")).toBeVisible();
    expect(started.attemptId).toBeTruthy();
    await noSession(page);
  });

  test("BB-OTP wrong code is announced without a session", async ({ page }, testInfo) => {
    hold(testInfo, "BB-OTP-WRONG");
    await beginLogin(page, members.wrong);
    await page.locator("input[name='otp_code']").fill(WRONG_CODE);
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-bb-otp-reason='invalid_code']")).toBeVisible();
    await noSession(page);
  });

  test("BB-OTP expired code is announced without a session", async ({ page }, testInfo) => {
    hold(testInfo, "BB-OTP-EXPIRED");
    const started = await beginLogin(page, members.expired);
    assertDistinctCode(started.code);
    const expired = await page.request.post(
      `/__platform/qa/blessboard-login-otp-expire?attemptId=${encodeURIComponent(started.attemptId)}`
    );
    expect(expired.status()).toBe(200);
    const body = await expired.json();
    expect(body.expired).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/\d{6}/);
    await page.locator("input[name='otp_code']").fill(started.code);
    await page.locator("button[type='submit']").first().click();
    await expect(page.locator("[data-bb-otp-reason='expired']")).toContainText(/expired/i);
    await noSession(page);
  });

  test("BB-OTP correct code redirects and the session survives reload", async ({ page }, testInfo) => {
    hold(testInfo, "BB-OTP-COMPLETE");
    const member = members.complete;
    const started = await beginLogin(page, member);
    const jar = (await page.context().cookies()).map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    const csrf = await page.locator("form[data-bb-login-attempt] input[name='_csrf']").inputValue();
    await page.locator("input[name='otp_code']").fill(started.code);
    await page.locator("button[type='submit']").first().click();
    await expect(page).toHaveURL(/\/member$/);
    await expect(page.locator("[data-bb-member-dashboard='1']")).toBeVisible();
    await expect(page.getByRole("heading", { name: member.fullName })).toBeVisible();
    await expect(page.locator("[data-bb-member-dashboard='1']")).toContainText(member.churchName);
    await page.reload();
    await expect(page).toHaveURL(/\/member$/);
    await expect(page.getByRole("heading", { name: member.fullName })).toBeVisible();
    const cookies = await page.context().cookies();
    expect(cookies.some((cookie) => /sid/.test(cookie.name) && cookie.value)).toBe(true);
    const replay = await page.request.post(`${member.home}/member/login/verify`, {
      form: { _csrf: csrf, otp_code: started.code },
      headers: { cookie: jar },
      maxRedirects: 0,
    });
    expect(replay.status()).toBe(401);
    expect(await replay.text()).toMatch(/already used/i);
  });

  test("BB-OTP cross-tenant verification does not sign in", async ({ page }, testInfo) => {
    hold(testInfo, "BB-OTP-CROSS-TENANT");
    const started = await beginLogin(page, members.tenant);
    const other = await beginLogin(page, members.otherTenant);
    await page.goto(`${members.otherTenant.home}/member/login/verify`);
    await page.locator("input[name='otp_code']").fill(started.code);
    await page.locator("button[type='submit']").first().click();
    await expect(page.locator("[data-bb-member-dashboard='1']")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: members.tenant.fullName })).toHaveCount(0);
    await noSession(page);
    assertDistinctCode(other.code);
    assertDistinctCode(started.code);
  });

  test("BB-OTP wrong-member challenge does not sign in", async ({ page }, testInfo) => {
    hold(testInfo, "BB-OTP-WRONG-MEMBER");
    const first = await beginLogin(page, members.memberA);
    const second = await beginLogin(page, members.memberB);
    await page.locator("input[name='otp_code']").fill(first.code);
    await page.locator("button[type='submit']").first().click();
    await expect(page.locator("[data-bb-otp-reason='invalid_code']")).toBeVisible();
    await expect(page.getByRole("heading", { name: members.memberA.fullName })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: members.memberB.fullName })).toHaveCount(0);
    await noSession(page);
    expect(second.attemptId).not.toBe(first.attemptId);
  });

  test("BB-OTP concurrent completion allows one session", async ({ page }, testInfo) => {
    hold(testInfo, "BB-OTP-CONCURRENT");
    const member = members.concurrent;
    const started = await beginLogin(page, member);
    const csrf = await page.locator("form[data-bb-login-attempt] input[name='_csrf']").inputValue();
    const action = await page.locator("form[data-bb-login-attempt]").getAttribute("action");
    const attempts = await Promise.all([
      page.request.post(action, { form: { _csrf: csrf, otp_code: started.code }, maxRedirects: 0 }),
      page.request.post(action, { form: { _csrf: csrf, otp_code: started.code }, maxRedirects: 0 }),
    ]);
    const winners = attempts.filter((response) => response.status() === 303);
    expect(winners).toHaveLength(1);
    await page.goto(`${member.home}/member`);
    await expect(page.locator("[data-bb-member-dashboard='1']")).toBeVisible();
    await expect(page.getByRole("heading", { name: member.fullName })).toBeVisible();
  });

  test("BB-OTP rate limit keeps the session closed", async ({ page }, testInfo) => {
    hold(testInfo, "BB-OTP-RATE");
    const started = await beginLogin(page, members.limited);
    const form = page.locator("form[data-bb-login-attempt]");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await form.locator("input[name='otp_code']").fill(WRONG_CODE);
      await form.locator("button[type='submit']").click();
      if (await page.locator("[data-bb-otp-reason='exhausted']").count()) break;
    }
    await expect(page.locator("[data-bb-otp-reason='exhausted']")).toContainText(/Too many attempts/i);
    await noSession(page);
    await form.locator("input[name='otp_code']").fill(started.code);
    await form.locator("button[type='submit']").click();
    await expect(page.locator("[data-bb-member-dashboard='1']")).toHaveCount(0);
    await noSession(page);
  });

  test("BB-OTP missing observer challenge fails closed", async ({ page }, testInfo) => {
    hold(testInfo, "BB-OTP-OBSERVER-MISSING");
    const missing = await page.request.get("/__platform/qa/blessboard-login-otp-delivery");
    expect(missing.status()).toBe(400);
    expect(JSON.stringify(await missing.json())).not.toMatch(/\d{6}/);
    const unknown = await page.request.get(
      "/__platform/qa/blessboard-login-otp-delivery?attemptId=11111111-1111-4111-8111-111111111111"
    );
    expect(unknown.status()).toBe(404);
    expect(JSON.stringify(await unknown.json())).not.toMatch(/\d{6}/);
  });
});
