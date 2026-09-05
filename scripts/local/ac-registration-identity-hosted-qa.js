#!/usr/bin/env node
"use strict";

/**
 * Hosted destructive QA — ActiveClinic testing (activeclinic.pronline.org only).
 */

const { chromium } = require("playwright");
const { Client } = require("pg");
const crypto = require("crypto");
const { checkHostedTestingSha } = require("../check-hosted-testing-sha");

const AC = "https://activeclinic.pronline.org";
const PASS = process.env.QA_PASSWORD || "TestPassword99!";
const STAMP = crypto.randomBytes(3).toString("hex");

async function fillClinicStep(page, clinicName) {
  await page.locator("#clinicName").fill(clinicName);
  const type = page.locator("#clinicType, select[name='clinicType'], select[name='clinic_type']");
  if (await type.count()) await type.first().selectOption("clinic").catch(() => type.first().selectOption({ index: 1 }));
  await page.locator("#city, input[name='city']").first().fill("Lusaka");
  const province = page.locator("#provinceSelect, select[name='province']");
  if (await province.count()) await province.first().selectOption({ index: 1 }).catch(() => {});
  const country = page.locator("select[name='countryCode'], #countryCode");
  if (await country.count()) await country.first().selectOption("ZM").catch(() => {});
  await page.locator('form[data-ac-register-step="clinic"] button[type="submit"], button:has-text("Continue")').first().click();
  await page.waitForTimeout(1000);
}

async function fillAdminStep(page, { name, email, phoneNational }) {
  await page.locator("#contactName, input[name='contactName'], input[name='contact_name']").first().fill(name);
  await page.locator("#contactEmail, input[name='contactEmail'], input[name='contact_email'], input[name='email']").first().fill(email);
  const phone = page.locator("#phone_national, input[name='phone_national'], input[name='contactPhone'], input[name='phone']");
  await phone.first().fill(phoneNational, { force: true });
  await page.locator("#password, input[name='password']").first().fill(PASS);
  const confirm = page.locator("#passwordConfirm, input[name='passwordConfirm'], input[name='password_confirm']");
  if (await confirm.count()) await confirm.first().fill(PASS);
  await page.locator('button[type="submit"]').last().click();
  await page.waitForTimeout(1000);
}

async function submitReview(page) {
  const consents = page.locator('input[name="acceptTerms"], input[name="registration_consent"], input[type="checkbox"]');
  const n = await consents.count();
  for (let i = 0; i < n; i++) {
    const el = consents.nth(i);
    if (!(await el.isChecked().catch(() => false))) await el.check({ force: true }).catch(() => {});
  }
  await page.locator('button[type="submit"]').last().click();
}

async function registerClinic(page, opts) {
  await page.goto(`${AC}/register-clinic`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await fillClinicStep(page, opts.clinicName);
  // may already be on admin or need another continue
  if (await page.locator("#contactName, input[name='contactName']").count()) {
    await fillAdminStep(page, opts);
  } else {
    await page.locator('button:has-text("Continue"), button[type="submit"]').first().click().catch(() => {});
    await page.waitForTimeout(800);
    await fillAdminStep(page, opts);
  }
  // review step if present
  if (await page.locator('input[name="acceptTerms"], input[name="registration_consent"]').count()) {
    await submitReview(page);
  } else if (await page.getByText(/review/i).count()) {
    await submitReview(page);
  }
  await page.waitForURL(/register-clinic\/(success|review)|register-clinic\?|\/dashboard|\/portal|\/hq|success|ready/i, {
    timeout: 120000,
  }).catch(() => {});
  return { url: page.url(), body: await page.content() };
}

async function login(page, identifier, mode) {
  await page.goto(`${AC}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (mode === "phone") {
    const tab = page.locator('[data-login-mode="phone"], button:has-text("Phone"), [role="tab"]:has-text("Phone")');
    if (await tab.count()) await tab.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    const phoneField = page.locator('input[name="phone_national"]:not([disabled]), input[name="phone"]:not([disabled])');
    if (await phoneField.count()) await phoneField.first().fill(identifier, { force: true });
    else {
      await page.locator('input[name="phone_national"], input[name="phone"]').first().evaluate((el, v) => {
        el.disabled = false; el.value = v; el.dispatchEvent(new Event("input", { bubbles: true }));
      }, identifier);
    }
  } else {
    const tab = page.locator('[data-login-mode="email"], button:has-text("Email")');
    if (await tab.count()) await tab.first().click({ force: true }).catch(() => {});
    await page.locator('input[name="email"], input[name="contactEmail"], input[name="login_email"], input[type="email"]').first().fill(identifier, { force: true });
  }
  await page.locator('input[name="password"]').fill(PASS, { force: true });
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(4000);
  return page.url();
}

function loginOk(url) {
  const u = String(url || "");
  if (/\/login\/select-organization|\/app(\/|$)|\/portal|\/dashboard/i.test(u)) return true;
  if (/\/login(\?|$)/i.test(u)) return false;
  return !/\/register-clinic/i.test(u);
}

async function logout(page) {
  await page.goto(`${AC}/logout`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function dbChecks(email) {
  if (!process.env.DATABASE_URL) {
    try {
      require("fs").readFileSync(".env.testing.local", "utf8").split("\n").forEach((line) => {
        const m = line.match(/^DATABASE_URL=(.*)$/);
        if (m) {
          let v = m[1].trim();
          if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1);
          process.env.DATABASE_URL = v;
        }
      });
    } catch { /* */ }
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const id = await client.query(
      `SELECT id, email_normalized, phone_normalized, status FROM platform.identities WHERE email_normalized = $1`,
      [email.toLowerCase()]
    );
    const staff = id.rows[0]
      ? await client.query(
          `SELECT organization_id, status FROM activeclinic.staff_members WHERE platform_identity_id = $1 AND status <> 'archived'`,
          [id.rows[0].id]
        )
      : { rows: [] };
    const dbid = await client.query(`SELECT identity_key, environment_code FROM platform.database_identity LIMIT 1`).catch(() => ({ rows: [] }));
    return {
      identityCount: id.rowCount,
      identity: id.rows[0] || null,
      staffOrgs: staff.rows,
      databaseIdentity: dbid.rows[0] || null,
    };
  } finally {
    await client.end();
  }
}

async function main() {
  const sha = await checkHostedTestingSha({});
  if (!sha.ok) {
    console.log(JSON.stringify({ verdict: "HOSTED_NOT_CURRENT", sha }, null, 2));
    process.exit(3);
  }
  const email = `ac-idemp-new-${STAMP}@example.invalid`;
  const phoneNational = `97${String(6000000 + (parseInt(STAMP, 16) % 1000000)).slice(-7)}`;
  const clinic1 = `QA AC Idemp New ${STAMP}`;
  const clinic2 = `QA AC Idemp Reuse ${STAMP}`;

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true })).newPage();
  const evidence = { sha: sha.expectedSha, stamp: STAMP, steps: {} };

  try {
    const r1 = await registerClinic(page, { clinicName: clinic1, name: "AC QA Admin", email, phoneNational });
    evidence.steps.newClinic = {
      url: r1.url,
      success: /register-clinic\/success/i.test(r1.url) && /ready=1/i.test(r1.url),
      genericFailure: /try again shortly|could not finish registration/i.test(r1.body),
    };
    console.error("step newClinic", JSON.stringify(evidence.steps.newClinic));

    await logout(page);
    const r2 = await registerClinic(page, { clinicName: clinic1, name: "AC QA Admin", email, phoneNational });
    evidence.steps.retrySame = {
      url: r2.url,
      success: /register-clinic\/success/i.test(r2.url),
      genericFailure: /try again shortly|could not finish registration/i.test(r2.body),
    };
    console.error("step retrySame", JSON.stringify(evidence.steps.retrySame));

    await logout(page);
    const r3 = await registerClinic(page, { clinicName: clinic2, name: "AC QA Admin", email, phoneNational });
    evidence.steps.reuseExisting = {
      url: r3.url,
      success: /register-clinic\/success/i.test(r3.url) && /ready=1/i.test(r3.url),
      genericFailure: /try again shortly|could not finish registration/i.test(r3.body),
      needsAck: /acknowledg|existing identity|second clinic/i.test(r3.body),
    };
    console.error("step reuseExisting", JSON.stringify(evidence.steps.reuseExisting));

    await logout(page);
    try {
      const u = await login(page, email, "email");
      evidence.steps.loginEmail = { url: u, ok: loginOk(u) };
    } catch (e) {
      evidence.steps.loginEmail = { ok: false, error: String(e.message || e).slice(0, 200) };
    }
    console.error("step loginEmail", JSON.stringify(evidence.steps.loginEmail));
    await logout(page);
    try {
      const u = await login(page, phoneNational, "phone");
      evidence.steps.loginPhone = { url: u, ok: loginOk(u) };
    } catch (e) {
      evidence.steps.loginPhone = { ok: false, error: String(e.message || e).slice(0, 200) };
    }
    console.error("step loginPhone", JSON.stringify(evidence.steps.loginPhone));

    evidence.db = await dbChecks(email);
  } catch (err) {
    evidence.fatal = String(err.message || err).slice(0, 500);
  } finally {
    await browser.close();
  }

  const pass =
    evidence.steps.newClinic?.success &&
    /ready=1|success/i.test(evidence.steps.newClinic?.url || "") &&
    evidence.steps.retrySame?.success &&
    /ready=1|success|already/i.test(evidence.steps.retrySame?.url || "") &&
    evidence.steps.reuseExisting?.success &&
    /ready=1|success/i.test(evidence.steps.reuseExisting?.url || "") &&
    evidence.db?.identityCount === 1 &&
    Array.isArray(evidence.db?.staffOrgs) &&
    evidence.db.staffOrgs.length >= 2 &&
    evidence.steps.loginEmail?.ok;

  evidence.verdict = pass
    ? evidence.steps.loginPhone?.ok
      ? "AC_REGISTRATION_IDENTITY_PARITY_FIXED_HOSTED_QA_PASS"
      : "AC_REGISTRATION_IDENTITY_PARITY_FIXED_WITH_GAPS"
    : "AC_REGISTRATION_IDENTITY_PARITY_NOT_FIXED";
  console.log(JSON.stringify(evidence, null, 2));
  process.exit(pass ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });
