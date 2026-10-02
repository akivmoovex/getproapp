#!/usr/bin/env node
"use strict";

/**
 * ActiveClinic QA wave 1 hosted checks against testing only.
 * Never prints secrets, tokens, cookie values, or full emails/phones.
 *
 *   EXPECTED_SHA=494cf2828a580d6c5032f8b242a79ab19b4f796d \
 *   scripts/local/run-with-blessboard-env.sh testing \
 *     node scripts/local/v7-ac-qa-wave1-hosted.js
 */

const crypto = require("crypto");
const { chromium } = require("playwright");
const { Pool } = require("pg");
const { requireDatabaseUrl } = require("../../db/scripts/lib/databaseUrl");
const { buildFoundationPoolConfig } = require("../../db/scripts/lib/foundationPool");
const { checkDatabaseIdentity } = require("../../db/scripts/lib/databaseIdentity");

const AC = "https://activeclinic.pronline.org";
const EXPECTED_SHA =
  process.env.EXPECTED_SHA || "494cf2828a580d6c5032f8b242a79ab19b4f796d";
const PASS =
  process.env.QA_PASSWORD ||
  `GpQa!${crypto.randomBytes(9).toString("base64url")}9A`;
const STAMP = crypto.randomBytes(3).toString("hex");

function shaOk(hosted) {
  const h = String(hosted || "").toLowerCase();
  const e = EXPECTED_SHA.toLowerCase();
  return h && (e.startsWith(h) || h.startsWith(e.slice(0, 12)));
}

function maskEmail(value) {
  const s = String(value || "").trim().toLowerCase();
  if (!s.includes("@")) return s ? "present" : null;
  const [local, domain] = s.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

async function fillClinic(page, name) {
  await page.locator("#clinicName, input[name='clinicName']").first().fill(name);
  const type = page.locator("#clinicType, select[name='clinicType']");
  if (await type.count()) await type.first().selectOption("clinic").catch(() => {});
  const country = page.locator("select[name='countryCode'], #countryCode");
  if (await country.count()) {
    await country.first().selectOption("ZM").catch(() => {});
  }
  await page.locator("#city, input[name='city']").first().fill("Lusaka");
  const province = page.locator("#provinceSelect, select[name='province']");
  if (await province.count()) await province.first().selectOption({ index: 1 }).catch(() => {});
  await page.locator('form[data-ac-register-step="clinic"] button[type="submit"]').first().click();
  await page.waitForSelector('form[data-ac-register-step="administrator"]', { timeout: 30000 });
}

async function submitAdminPhone(page, { name, email, phoneNational }) {
  await page.locator("#contactName, input[name='contactName']").first().fill(name);
  await page.locator("#contactEmail, input[name='contactEmail']").first().fill(email);
  const country = page.locator("select[name='phone_country'], #phone_country");
  if (await country.count()) await country.first().selectOption("ZM").catch(() => {});
  await page
    .locator("#phone_national, input[name='phone_national']")
    .first()
    .fill(phoneNational);
  await page.locator("#password, input[name='password']").first().fill(PASS);
  const confirm = page.locator("#passwordConfirm, input[name='password_confirm'], input[name='passwordConfirm']");
  if (await confirm.count()) await confirm.first().fill(PASS);
  await page.locator('form[data-ac-register-step="administrator"] button[type="submit"]').first().click();
  await page.waitForTimeout(2000);
}

async function visibleErrors(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="alert"], .ac-field-error, .gp-field-error, .ac-auth-alert'))
      .map((el) => (el.innerText || "").trim())
      .filter(Boolean)
      .slice(0, 8)
  );
}

async function main() {
  const report = {
    kind: "ACTIVECLINIC_QA_WAVE1_HOSTED",
    stamp: STAMP,
    startedAt: new Date().toISOString(),
  };
  const pool = new Pool(buildFoundationPoolConfig(requireDatabaseUrl(), { max: 2 }));

  try {
    const identity = await checkDatabaseIdentity(pool, { identityKey: "moovex-platform-v7" });
    report.dbIdentity = {
      ok: identity.ok,
      identity_key: identity.row && identity.row.identity_key,
      environment_code: identity.row && identity.row.environment_code,
    };
    if (!identity.ok || (identity.row && identity.row.environment_code) !== "testing") {
      report.error = "testing DB identity gate failed";
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = 1;
      return;
    }

    const health = await fetch(`${AC}/healthz`).then((r) => r.json());
    report.hosted = {
      gitSha: health.gitSha,
      shaOk: shaOk(health.gitSha),
      environment: health.environment,
      deploymentCode: health.deploymentCode,
      schemaCompatible: health.schemaCompatible,
    };
    if (!report.hosted.shaOk || health.environment !== "testing") {
      report.error = "hosted testing SHA/environment gate failed";
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = 1;
      return;
    }

    const browser = await chromium.launch({ headless: true });
    const phoneCases = [];
    for (const national of ["123", "1234", "971234567"]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      page.on("dialog", (d) => d.accept().catch(() => {}));
      const email = `ac.wave1.${STAMP}.${national}@getproapp.org`;
      await page.goto(`${AC}/register-clinic`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await fillClinic(page, `AC Wave1 Phone ${STAMP} ${national}`);
      await submitAdminPhone(page, {
        name: "Wave1 Admin",
        email,
        phoneNational: national,
      });
      const step = await page.getAttribute("[data-ac-register-step]", "data-ac-register-step");
      const body = await page.content();
      const rejected =
        step === "administrator" &&
        (/valid phone|enter an administrator phone|phone number/i.test(body) ||
          (await visibleErrors(page)).length > 0);
      const advanced = step === "review" || /register-clinic\/success/i.test(page.url());
      phoneCases.push({
        nationalLength: String(national).length,
        step,
        rejected,
        advanced,
        errors: await visibleErrors(page),
      });
      await context.close();
    }
    report.phoneValidation = {
      short3Rejected: phoneCases[0].rejected && !phoneCases[0].advanced,
      short4Rejected: phoneCases[1].rejected && !phoneCases[1].advanced,
      validAccepted: phoneCases[2].advanced === true,
      cases: phoneCases,
    };

    // Full valid registration for recovery known-identity path
    const clinicName = `AC Wave1 Clinic ${STAMP}`;
    const email = `ac.wave1.rec.${STAMP}@getproapp.org`;
    const phoneNational = `97${String(2000000 + (parseInt(STAMP, 16) % 7999999)).padStart(7, "0").slice(-7)}`;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on("dialog", (d) => d.accept().catch(() => {}));
    await page.goto(`${AC}/register-clinic`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await fillClinic(page, clinicName);
    await submitAdminPhone(page, { name: "Wave1 Recovery Admin", email, phoneNational });
    if ((await page.getAttribute("[data-ac-register-step]", "data-ac-register-step")) === "review") {
      const consents = page.locator("input[name='registration_consent'], input[name='acceptTerms']");
      const n = await consents.count();
      for (let i = 0; i < n; i += 1) {
        const el = consents.nth(i);
        if (!(await el.isChecked().catch(() => false))) await el.check({ force: true }).catch(() => {});
      }
      await Promise.all([
        page.waitForURL(/register-clinic\/success|ready=/i, { timeout: 120000 }).catch(() => null),
        page.locator('form[data-ac-register-step="review"] button[type="submit"]').first().click(),
      ]);
    }
    report.registration = {
      email: maskEmail(email),
      success: /register-clinic\/success|ready=1/i.test(page.url()),
      urlPath: new URL(page.url()).pathname,
    };
    await ctx.close();

    async function forgot(identifier) {
      const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const p = await c.newPage();
      await p.goto(`${AC}/forgot-password`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await p.locator('input[name="identifier"]').first().fill(identifier);
      await Promise.all([
        p.waitForURL(/forgot-password\/check/i, { timeout: 60000 }).catch(() => null),
        p.locator('button[type="submit"]').first().click(),
      ]);
      const html = await p.content();
      const out = {
        reachedCheck: /forgot-password\/check/i.test(p.url()),
        messagePreview: ((html.match(/ac-auth-alert[\s\S]{0,300}/i) || [""])[0] || "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 180),
        revealsExistence: /no account|not found|doesn't exist|does not exist/i.test(html),
      };
      await c.close();
      return out;
    }

    const tokensBefore = await pool.query(
      `SELECT count(*)::int AS n FROM platform.identity_action_tokens
        WHERE purpose = 'activeclinic_password_reset' AND created_at > now() - interval '10 minutes'`
    );
    const unknown = await forgot(`nobody.${STAMP}@example.invalid`);
    const tokensAfterUnknown = await pool.query(
      `SELECT count(*)::int AS n FROM platform.identity_action_tokens
        WHERE purpose = 'activeclinic_password_reset' AND created_at > now() - interval '10 minutes'`
    );
    const known = report.registration.success ? await forgot(email) : { skipped: true };

    report.recovery = {
      unknown,
      known,
      tokenCountDeltaAfterUnknown:
        Number(tokensAfterUnknown.rows[0].n) - Number(tokensBefore.rows[0].n),
      delivery: "CONFIGURATION_BLOCKED",
      deliveryNote:
        "Public forgot-password creates hashed tokens for eligible identities but does not send email/SMS; testing has no live Resend transport.",
    };

    await browser.close();
    report.ok =
      report.phoneValidation.short3Rejected &&
      report.phoneValidation.short4Rejected &&
      report.phoneValidation.validAccepted &&
      report.recovery.unknown.reachedCheck &&
      !report.recovery.unknown.revealsExistence &&
      report.recovery.tokenCountDeltaAfterUnknown === 0;
  } catch (err) {
    report.error = String(err && err.message ? err.message : err).slice(0, 400);
    report.ok = false;
  } finally {
    await pool.end();
  }

  report.finishedAt = new Date().toISOString();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err.message || err).slice(0, 300) }));
  process.exit(1);
});
