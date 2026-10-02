#!/usr/bin/env node
"use strict";

/**
 * Hosted QA — BlessBoard registration identity conflict fix (testing only).
 */

const { chromium } = require("playwright");
const { Client } = require("pg");
const crypto = require("crypto");
const { checkHostedTestingSha } = require("../check-hosted-testing-sha");

const BB = "https://blessboard.pronline.org";
const PASS = process.env.QA_PASSWORD || "TestPassword99!";
const STAMP = crypto.randomBytes(3).toString("hex");

function phone(n) {
  return `+26097${String(7000000 + n).slice(-7)}`;
}

async function csrfAndCookie(page) {
  await page.goto(`${BB}/register-church?plan=foundation`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  const token = await page.locator('input[name="_csrf"], input[name="csrf"]').first().inputValue();
  return token;
}

async function fillChurchStep(page, churchName, orgKey) {
  await page.locator("#register_church_name").fill(churchName);
  const country = page.locator('select[name="country"], #register_country');
  if (await country.count()) {
    await country.first().selectOption({ label: "Zambia" }).catch(async () => {
      await country.first().selectOption("ZM").catch(() => {});
    });
  }
  const city = page.locator('#register_city, input[name="city"]');
  if (await city.count()) await city.first().fill("Lusaka");
  const branch = page.locator('#register_branch_name, input[name="branch_name"]');
  if (await branch.count()) await branch.first().fill("Main Campus");
  const org = page.locator('#register_organization_key, input[name="organization_key"]');
  if (await org.count()) {
    await org.first().evaluate((el, value) => {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, orgKey);
  }
  const next = page.locator('button[value="next-church"], button[name="action"][value="next-church"]');
  if (await next.count()) {
    await next.first().click();
  } else {
    await page.locator('button:has-text("Continue"), button:has-text("Next")').first().click();
  }
  await page.waitForTimeout(800);
}

async function fillAdminStep(page, { name, email, phoneNational }) {
  await page.locator('#register_contact_name, input[name="contact_name"]').first().fill(name);
  await page.locator('#register_email, input[name="email"]').first().fill(email);
  const phoneInput = page.locator(
    '#register_phone_national, input[name="phone_national"], input[name="phone"]'
  );
  await phoneInput.first().fill(phoneNational);
  const role = page.locator('#register_role_in_church, select[name="role_in_church"], input[name="role_in_church"]');
  if (await role.count()) {
    const tag = await role.first().evaluate((el) => el.tagName.toLowerCase());
    if (tag === "select") await role.first().selectOption({ index: 1 }).catch(() => {});
    else await role.first().fill("Administrator");
  }
  await page.locator('#register_password, input[name="password"]').first().fill(PASS);
  const confirm = page.locator('#register_password_confirm, input[name="password_confirm"]');
  if (await confirm.count()) await confirm.first().fill(PASS);
  const next = page.locator('button[value="next-admin"], button[name="action"][value="next-admin"]');
  if (await next.count()) await next.first().click();
  else await page.locator('button:has-text("Continue"), button:has-text("Next")').first().click();
  await page.waitForTimeout(800);
}

async function submitReview(page) {
  const consent = page.locator(
    'input[name="registration_consent"], input[name="consent_terms"], #registration_consent'
  );
  if (await consent.count()) {
    const checked = await consent.first().isChecked().catch(() => false);
    if (!checked) await consent.first().check({ force: true });
  }
  const contactConsent = page.locator('input[name="consent_contact"]');
  if (await contactConsent.count()) {
    const checked = await contactConsent.first().isChecked().catch(() => false);
    if (!checked) await contactConsent.first().check({ force: true }).catch(() => {});
  }
  await page.locator('button[type="submit"]').last().click();
}

async function registerChurch(page, opts) {
  await page.goto(`${BB}/register-church?plan=foundation`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await fillChurchStep(page, opts.churchName, opts.orgKey);
  await fillAdminStep(page, opts);
  await submitReview(page);
  await page.waitForURL(/register-church\/(success|review)|register-church\?|\/hq|\/home/i, {
    timeout: 90000,
  });
  return {
    url: page.url(),
    body: await page.content(),
  };
}

async function login(page, identifier, mode) {
  await page.goto(`${BB}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (mode === "phone") {
    const phoneTab = page.locator(
      '[data-login-mode="phone"], button:has-text("Phone"), [role="tab"]:has-text("Phone"), a:has-text("Phone")'
    );
    if (await phoneTab.count()) {
      await phoneTab.first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(400);
    }
    const phoneField = page.locator(
      'input[name="phone_national"]:not([disabled]), input[name="phone"]:not([disabled]), input[data-bb-auth-phone]:not([disabled])'
    );
    if (await phoneField.count()) {
      await phoneField.first().fill(identifier, { force: true });
    } else {
      await page
        .locator('input[name="phone_national"], input[name="phone"]')
        .first()
        .evaluate((el, value) => {
          el.disabled = false;
          el.value = value;
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }, identifier);
    }
  } else {
    const emailTab = page.locator(
      '[data-login-mode="email"], button:has-text("Email"), [role="tab"]:has-text("Email")'
    );
    if (await emailTab.count()) await emailTab.first().click({ force: true }).catch(() => {});
    const emailField = page.locator(
      'input[name="email"], input[name="login_email"], input[data-bb-auth-email]'
    );
    await emailField.first().fill(identifier, { force: true });
  }
  await page.locator('input[name="password"]').fill(PASS, { force: true });
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(4000);
  return page.url();
}

async function logout(page) {
  await page.goto(`${BB}/logout`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(500);
}

async function dbChecks(emails) {
  const url = process.env.DATABASE_URL;
  if (!url) return { skipped: true, reason: "no DATABASE_URL in process" };
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const out = {};
    for (const email of emails) {
      const users = await client.query(
        `SELECT id, email_normalized, phone_normalized, status
           FROM blessboard.users WHERE email_normalized = $1`,
        [email.toLowerCase()]
      );
      const roles = users.rows[0]
        ? await client.query(
            `SELECT organization_id, role_key, status
               FROM blessboard.user_roles
              WHERE user_id = $1 AND status = 'active'
              ORDER BY organization_id, role_key`,
            [users.rows[0].id]
          )
        : { rows: [] };
      out[email] = {
        userCount: users.rowCount,
        user: users.rows[0] || null,
        roles: roles.rows,
      };
    }
    const identity = await client.query(
      `SELECT identity_key, environment_code FROM platform.database_identity LIMIT 1`
    ).catch(() => ({ rows: [] }));
    out.databaseIdentity = identity.rows[0] || null;
    return out;
  } finally {
    await client.end();
  }
}

async function main() {
  const sha = await checkHostedTestingSha({});
  if (!sha.ok) {
    console.log("HOSTED_NOT_CURRENT");
    console.log(JSON.stringify(sha, null, 2));
    process.exit(3);
  }

  const email1 = `bb-idemp-new-${STAMP}@example.invalid`;
  const email2 = `bb-idemp-reuse-${STAMP}@example.invalid`;
  const phone1National = `97${String(8000000 + (parseInt(STAMP, 16) % 1000000)).slice(-7)}`;
  const phone2National = `96${String(8000000 + (parseInt(STAMP, 16) % 1000000)).slice(-7)}`;
  const church1 = `QA Idemp New ${STAMP}`;
  const church2 = `QA Idemp Retry ${STAMP}`;
  const church3 = `QA Idemp Reuse ${STAMP}`;
  const org1 = `qa-idemp-new-${STAMP}`;
  const org2 = `qa-idemp-retry-${STAMP}`;
  const org3 = `qa-idemp-reuse-${STAMP}`;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  const evidence = {
    sha: sha.expectedSha,
    hostedSha: sha.hosts && sha.hosts[0] && sha.hosts[0].gitSha,
    stamp: STAMP,
    steps: {},
  };

  try {
    const r1 = await registerChurch(page, {
      churchName: church1,
      orgKey: org1,
      name: "QA New Admin",
      email: email1,
      phoneNational: phone1National,
    });
    evidence.steps.newAdmin = {
      url: r1.url,
      success: /success|ready=1|\/hq/i.test(r1.url) || /ready=1|workspace/i.test(r1.body),
    };
    console.error("step newAdmin", JSON.stringify(evidence.steps.newAdmin));

    await logout(page);
    const r2 = await registerChurch(page, {
      churchName: church1,
      orgKey: org1,
      name: "QA New Admin",
      email: email1,
      phoneNational: phone1National,
    });
    evidence.steps.retrySame = {
      url: r2.url,
      success:
        /success|ready=1|\/hq/i.test(r2.url) ||
        /already|ready|workspace/i.test(r2.body) ||
        !/could not finish creating/i.test(r2.body),
      genericFailure: /could not finish creating/i.test(r2.body),
    };
    console.error("step retrySame", JSON.stringify(evidence.steps.retrySame));

    await logout(page);
    const r3 = await registerChurch(page, {
      churchName: church3,
      orgKey: org3,
      name: "QA New Admin",
      email: email1,
      phoneNational: phone1National,
    });
    evidence.steps.reuseExisting = {
      url: r3.url,
      success: /success|ready=1|\/hq/i.test(r3.url) || /ready=1/i.test(r3.body),
      genericFailure: /could not finish creating/i.test(r3.body),
    };
    console.error("step reuseExisting", JSON.stringify(evidence.steps.reuseExisting));

    await logout(page);
    try {
      const loginEmailUrl = await login(page, email1, "email");
      evidence.steps.loginEmail = {
        url: loginEmailUrl,
        ok: !/\/login/i.test(loginEmailUrl),
      };
    } catch (err) {
      evidence.steps.loginEmail = { ok: false, error: String(err.message || err).slice(0, 200) };
    }
    console.error("step loginEmail", JSON.stringify(evidence.steps.loginEmail));
    await logout(page);
    try {
      const loginPhoneUrl = await login(page, phone1National, "phone");
      evidence.steps.loginPhone = {
        url: loginPhoneUrl,
        ok: !/\/login/i.test(loginPhoneUrl),
      };
    } catch (err) {
      evidence.steps.loginPhone = { ok: false, error: String(err.message || err).slice(0, 200) };
    }
    console.error("step loginPhone", JSON.stringify(evidence.steps.loginPhone));

    if (!process.env.DATABASE_URL) {
      try {
        require("fs")
          .readFileSync(".env.testing.local", "utf8")
          .split("\n")
          .forEach((line) => {
            const m = line.match(/^DATABASE_URL=(.*)$/);
            if (m) {
              let v = m[1].trim();
              if (
                (v.startsWith("'") && v.endsWith("'")) ||
                (v.startsWith('"') && v.endsWith('"'))
              ) {
                v = v.slice(1, -1);
              }
              process.env.DATABASE_URL = v;
            }
          });
      } catch {
        /* optional */
      }
    }
    evidence.db = await dbChecks([email1, email2]);
  } catch (err) {
    evidence.fatal = String(err && err.message ? err.message : err).slice(0, 400);
  } finally {
    await browser.close();
  }

  const pass =
    evidence.steps.newAdmin &&
    evidence.steps.newAdmin.success &&
    evidence.steps.retrySame &&
    evidence.steps.retrySame.success &&
    !evidence.steps.retrySame.genericFailure &&
    evidence.steps.reuseExisting &&
    evidence.steps.reuseExisting.success &&
    !evidence.steps.reuseExisting.genericFailure &&
    evidence.db &&
    evidence.db[email1] &&
    evidence.db[email1].userCount === 1 &&
    evidence.steps.loginEmail &&
    evidence.steps.loginEmail.ok;

  const gaps = [];
  if (!(evidence.steps.loginPhone && evidence.steps.loginPhone.ok)) {
    gaps.push("phone_login_ui");
  }
  if (evidence.db && evidence.db[email1] && evidence.db[email1].roles) {
    const orgIds = new Set(evidence.db[email1].roles.map((r) => r.organization_id));
    if (orgIds.size < 2) gaps.push("expected_multi_org_roles");
  }
  evidence.gaps = gaps;

  evidence.verdict = !pass
    ? "BB_REGISTRATION_IDENTITY_CONFLICT_NOT_FIXED"
    : gaps.length
      ? "BB_REGISTRATION_IDENTITY_CONFLICT_FIXED_WITH_GAPS"
      : "BB_REGISTRATION_IDENTITY_CONFLICT_FIXED_HOSTED_QA_PASS";

  console.log(JSON.stringify(evidence, null, 2));
  process.exit(pass ? 0 : 2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
