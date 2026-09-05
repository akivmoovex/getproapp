#!/usr/bin/env node
"use strict";

/**
 * One controlled BlessBoard production postfix QA after data_environment fix.
 * Creates at most one new QA church. Does not print secrets.
 *
 *   scripts/local/run-with-blessboard-env.sh production \
 *     node scripts/local/v7-bb-production-postfix-qa.js
 */

const crypto = require("crypto");
const { chromium } = require("playwright");
const { Pool } = require("pg");
const { requireDatabaseUrl } = require("../../db/scripts/lib/databaseUrl");
const { buildFoundationPoolConfig } = require("../../db/scripts/lib/foundationPool");
const { checkDatabaseIdentity } = require("../../db/scripts/lib/databaseIdentity");

const EXPECTED_SHA = process.env.EXPECTED_SHA || "d4f5b190074dd07980c8b537b3c9b32d631a21b4";
const BB = "https://blessboard.com";
const PASS =
  process.env.QA_PASSWORD ||
  `GpQa!${crypto.randomBytes(9).toString("base64url")}9A`;
const STAMP = crypto.randomBytes(3).toString("hex");
const BB_ORG_NAME = `BlessBoard Postfix QA ${STAMP}`;
const BB_ORG_KEY = `bb-postfix-qa-${STAMP}`;
const BB_EMAIL = `prod.postfix.bb.${STAMP}@getproapp.org`;
const BB_PHONE_NATIONAL = `96${String(5400000 + (parseInt(STAMP, 16) % 899999))
  .padStart(7, "0")
  .slice(-7)}`;

function shaOk(hosted) {
  const h = String(hosted || "").toLowerCase();
  const e = EXPECTED_SHA.toLowerCase();
  return h && (e.startsWith(h) || h.startsWith(e.slice(0, 12)));
}

async function submitConsents(page) {
  const consents = page.locator(
    'input[name="registration_consent"], input[name="consent_terms"], input[type="checkbox"]'
  );
  const n = await consents.count();
  for (let i = 0; i < n; i += 1) {
    const el = consents.nth(i);
    if (!(await el.isChecked().catch(() => false))) await el.check({ force: true }).catch(() => {});
  }
  await page.locator('button[type="submit"]').last().click();
}

async function registerBb(page) {
  await page.goto(`${BB}/register-church?plan=foundation`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.locator("#register_church_name, input[name='church_name']").first().fill(BB_ORG_NAME);
  const country = page.locator('select[name="country"], #register_country');
  if (await country.count()) {
    await country.first().selectOption({ label: "Zambia" }).catch(async () => {
      await country.first().selectOption("ZM").catch(() => {});
    });
  }
  const city = page.locator('#register_city, input[name="city"]');
  if (await city.count()) await city.first().fill("Lusaka");
  const branch = page.locator('#register_branch_name, input[name="branch_name"]');
  if (await branch.count()) await branch.first().fill("HQ Campus");
  const org = page.locator('#register_organization_key, input[name="organization_key"]');
  if (await org.count()) {
    await org.first().evaluate((el, value) => {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, BB_ORG_KEY);
  }
  const nextChurch = page.locator('button[value="next-church"], button[name="action"][value="next-church"]');
  if (await nextChurch.count()) await nextChurch.first().click();
  else await page.locator('button:has-text("Continue"), button:has-text("Next")').first().click();
  await page.waitForTimeout(1000);

  await page.locator('#register_contact_name, input[name="contact_name"]').first().fill("BB Postfix QA Admin");
  await page.locator('#register_email, input[name="email"]').first().fill(BB_EMAIL);
  await page
    .locator('#register_phone_national, input[name="phone_national"], input[name="phone"]')
    .first()
    .fill(BB_PHONE_NATIONAL);
  const role = page.locator('#register_role_in_church, select[name="role_in_church"], input[name="role_in_church"]');
  if (await role.count()) {
    const tag = await role.first().evaluate((el) => el.tagName.toLowerCase());
    if (tag === "select") await role.first().selectOption({ index: 1 }).catch(() => {});
    else await role.first().fill("Administrator");
  }
  await page.locator('#register_password, input[name="password"]').first().fill(PASS);
  const confirm = page.locator('#register_password_confirm, input[name="password_confirm"]');
  if (await confirm.count()) await confirm.first().fill(PASS);
  const nextAdmin = page.locator('button[value="next-admin"], button[name="action"][value="next-admin"]');
  if (await nextAdmin.count()) await nextAdmin.first().click();
  else await page.locator('button:has-text("Continue"), button:has-text("Next")').first().click();
  await page.waitForTimeout(1000);
  await submitConsents(page);
  await page.waitForURL(/register-church\/(success|review)|\/hq|ready=/i, { timeout: 120000 }).catch(() => {});
  const body = await page.content();
  return {
    url: page.url(),
    ready: /ready=1/i.test(page.url()) || /ready=1/i.test(body),
    successPath: /register-church\/success|\/hq/i.test(page.url()),
    genericFailure: /try again shortly|could not finish|provisioning failed|deployment_not_found/i.test(body),
  };
}

async function login(page, identifier, mode) {
  await page.goto(`${BB}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (mode === "phone") {
    const tab = page.locator('[data-login-mode="phone"], button:has-text("Phone"), [role="tab"]:has-text("Phone")');
    if (await tab.count()) await tab.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
    const phoneField = page.locator(
      'input[name="phone_national"]:not([disabled]), input[name="phone"]:not([disabled])'
    );
    if (await phoneField.count()) {
      await phoneField.first().click({ force: true });
      await phoneField.first().fill("");
      await phoneField.first().type(identifier, { delay: 20 });
    } else {
      await page.locator('input[name="phone_national"], input[name="phone"]').first().evaluate((el, v) => {
        el.disabled = false;
        el.value = v;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }, identifier);
    }
  } else {
    const tab = page.locator('[data-login-mode="email"], button:has-text("Email")');
    if (await tab.count()) await tab.first().click({ force: true }).catch(() => {});
    await page
      .locator('input[name="email"], input[name="login_email"], input[data-bb-auth-email], input[type="email"]')
      .first()
      .fill(identifier, { force: true });
  }
  await page.locator('input[name="password"]').fill(PASS, { force: true });
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(5000);
  return { url: page.url(), stillLogin: /\/login(\?|$)/i.test(page.url()) };
}

async function logout(page) {
  await page.goto(`${BB}/logout`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function main() {
  if (process.env.PLATFORM_DEPLOYMENT_CODE !== "moovex-platform-production") {
    console.error("refuse: not production deployment code");
    process.exit(2);
  }
  const pool = new Pool(buildFoundationPoolConfig(requireDatabaseUrl(), { max: 3 }));
  const browser = await chromium.launch({ headless: true });
  const report = {
    kind: "BB_PRODUCTION_POSTFIX_QA",
    stamp: STAMP,
    orgKey: BB_ORG_KEY,
    expectedSha: EXPECTED_SHA,
  };
  try {
    const identity = await checkDatabaseIdentity(pool, { identityKey: "moovex-platform-v7" });
    report.dbIdentity = {
      ok: identity.ok,
      key: identity.row && identity.row.identity_key,
      env: identity.row && identity.row.environment_code,
    };
    const health = await fetch(`${BB}/healthz`).then((r) => r.json());
    report.hostedSha = health.gitSha;
    report.shaMatch = shaOk(health.gitSha);
    const dep = await pool.query(
      `SELECT deployment_code, status, environment_code, session_cookie_name
         FROM platform.deployments WHERE deployment_code='moovex-platform-production'`
    );
    report.deploymentRow = dep.rows[0] || null;

    const before = {
      orgs: Number((await pool.query(`SELECT count(*)::int AS n FROM platform.organizations`)).rows[0].n),
      users: Number((await pool.query(`SELECT count(*)::int AS n FROM blessboard.users`)).rows[0].n),
    };

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    report.registration = await registerBb(page);
    console.error("reg", JSON.stringify(report.registration));

    await logout(page);
    report.retry = await registerBb(page);
    console.error("retry", JSON.stringify(report.retry));

    await logout(page);
    report.emailLogin = await login(page, BB_EMAIL, "email");
    console.error("email", JSON.stringify(report.emailLogin));
    await logout(page);
    report.phoneLogin = await login(page, BB_PHONE_NATIONAL, "phone");
    console.error("phone", JSON.stringify(report.phoneLogin));
    await ctx.close();

    const org = await pool.query(
      `SELECT id, organization_key, display_name, data_environment, status
         FROM platform.organizations WHERE organization_key=$1`,
      [BB_ORG_KEY]
    );
    const users = await pool.query(
      `SELECT id, email_normalized, status FROM blessboard.users WHERE email_normalized=$1`,
      [BB_EMAIL.toLowerCase()]
    );
    const roles = users.rows[0]
      ? await pool.query(
          `SELECT role_key, status FROM blessboard.user_roles WHERE user_id=$1 AND status='active' ORDER BY role_key`,
          [users.rows[0].id]
        )
      : { rows: [] };
    const branches = org.rows[0]
      ? await pool.query(
          `SELECT b.branch_key, b.display_name, b.is_primary, b.status
             FROM blessboard.branches b
             JOIN blessboard.churches c ON c.id = b.church_id
            WHERE c.organization_id = $1`,
          [org.rows[0].id]
        )
      : { rows: [] };
    const after = {
      orgs: Number((await pool.query(`SELECT count(*)::int AS n FROM platform.organizations`)).rows[0].n),
      users: Number((await pool.query(`SELECT count(*)::int AS n FROM blessboard.users`)).rows[0].n),
    };

    report.org = org.rows[0]
      ? {
          organization_key: org.rows[0].organization_key,
          data_environment: org.rows[0].data_environment,
          status: org.rows[0].status,
        }
      : null;
    report.userCount = users.rowCount;
    report.roles = roles.rows.map((r) => r.role_key);
    report.branches = branches.rows;
    report.deltas = { orgs: after.orgs - before.orgs, users: after.users - before.users };

    const pass =
      report.shaMatch &&
      report.deploymentRow &&
      report.deploymentRow.status === "active" &&
      report.registration &&
      report.registration.ready &&
      !report.registration.genericFailure &&
      report.retry &&
      (report.retry.ready || report.retry.successPath) &&
      report.emailLogin &&
      !report.emailLogin.stillLogin &&
      report.phoneLogin &&
      !report.phoneLogin.stillLogin &&
      report.org &&
      report.org.data_environment === "production" &&
      report.userCount === 1 &&
      report.deltas.orgs === 1 &&
      report.deltas.users === 1 &&
      report.roles.includes("church_hq_admin");

    report.verdict = pass ? "BB_PRODUCTION_POSTFIX_QA_PASS" : "BB_PRODUCTION_POSTFIX_QA_FAIL";
    const text = JSON.stringify(report);
    if (text.includes(PASS)) {
      console.error("PASSWORD_LEAK");
      process.exit(1);
    }
    console.log(JSON.stringify(report, null, 2));
    process.exit(pass ? 0 : 4);
  } catch (err) {
    console.error(JSON.stringify({ verdict: "BB_PRODUCTION_POSTFIX_QA_FAIL", error: String(err.message || err).slice(0, 400) }, null, 2));
    process.exit(1);
  } finally {
    await browser.close().catch(() => {});
    await pool.end().catch(() => {});
  }
}

main();
