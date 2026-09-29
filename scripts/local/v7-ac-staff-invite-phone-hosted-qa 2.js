#!/usr/bin/env node
"use strict";

/**
 * Hosted QA — ActiveClinic staff invite phone fix + narrow RBAC check.
 * Testing only.
 */

const { chromium } = require("playwright");
const { checkHostedTestingSha } = require("../check-hosted-testing-sha");

const BASE = "https://activeclinic.pronline.org";
const EMAIL =
  process.env.QA_EMAIL || "demo_organization_admin@demo.activeclinic.example";
const PASS = process.env.QA_PASSWORD || "1234567890";
const EXPECTED = "+260977198697";

const PHONE_CASES = [
  { label: "national", phoneNational: "977198697" },
  { label: "local0", phoneNational: "0977198697" },
];

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('[data-gp-auth-id-tab="email"]').click().catch(() => {});
  await page.locator('input[name="login_email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 });
  return page.url();
}

async function loginPhone(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('[data-gp-auth-id-tab="phone"]').click();
  await page.locator('input[name="phone_national"]').fill("0970000001");
  await page.locator('input[name="password"]').fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 60000 });
  return page.url();
}

async function inviteOnce(page, phoneNational, stamp) {
  await page.goto(`${BASE}/app/staff/invite`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const form = page.locator("form").filter({ has: page.locator('input[name="phone_national"]') });
  await form.locator('input[name="first_name"]').fill(`Qa${stamp}`);
  await form.locator('input[name="last_name"]').fill("Invitee");
  await form.locator('input[name="phone_national"]').fill(phoneNational);

  const role = form.locator(`input[name="role_keys"][value="activeclinic_clinician"]`);
  if (await role.count()) {
    await role.check({ force: true });
  } else {
    const anyRole = form.locator('input[name="role_keys"]').first();
    if (await anyRole.count()) await anyRole.check({ force: true });
  }

  const mid = await form.evaluate((f) => ({
    phone: f.querySelector('[name="phone"]')?.value || "",
    national: f.querySelector('[name="phone_national"]')?.value || "",
    country: f.querySelector('[name="phone_country"]')?.value || "",
    valid: f.checkValidity(),
  }));

  const [post] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().includes("/app/staff"),
      { timeout: 30000 }
    ),
    form.locator('button[type="submit"]').click(),
  ]);

  const payload = post.request().postData() || "";
  const text = await post.text();
  const finalUrl = page.url();
  const errors = await page.locator(".ac-field-error, .ac-flash").allTextContents();
  const inviteOk =
    /Invitation created|Invitation ready|data-ac-invite-url|invite_url/i.test(text) ||
    /staff-invite-result/i.test(await page.content());
  const requiredBug = /Phone is required|Phone number is required/i.test(text);

  let staffId = null;
  const idMatch = finalUrl.match(/\/app\/staff\/([0-9a-f-]{36})/i);
  if (idMatch) staffId = idMatch[1];
  if (!staffId) {
    const href = await page.locator('a[href*="/app/staff/"]').first().getAttribute("href").catch(() => null);
    const m = href && href.match(/\/app\/staff\/([0-9a-f-]{36})/i);
    if (m) staffId = m[1];
  }

  return {
    mid,
    status: post.status(),
    payload,
    finalUrl,
    errors: errors.map((e) => e.trim()).filter(Boolean),
    inviteOk,
    requiredBug,
    staffId,
    payloadHasNational: payload.includes(`phone_national=${encodeURIComponent(phoneNational)}`) ||
      payload.includes(`phone_national=${phoneNational}`),
    payloadLegacyEmpty: /(?:^|&)phone=(?:&|$)/.test(payload) || payload.includes("phone=&"),
  };
}

async function verifyStaffVisible(page, firstName) {
  await page.goto(`${BASE}/app/staff`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const body = await page.content();
  return body.includes(firstName);
}

async function rbacCheck(page, staffId) {
  if (!staffId) {
    return { skipped: true, reason: "no staffId" };
  }
  // Admin should reach staff profile; unauthorized area sample: platform admin if linked
  await page.goto(`${BASE}/app/staff/${staffId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const profileOk = page.url().includes(`/app/staff/${staffId}`) && !(await page.content()).match(/Access Restricted|Forbidden/i);
  await page.goto(`${BASE}/app/settings`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const settingsOk = page.url().includes("/app/settings");
  // Clinician-created invitee is not logged in here — verify admin still blocked from inventing patient portal ownership routes if any.
  await page.goto(`${BASE}/platform-admin`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  const deniedPlatform = !page.url().includes("/platform-admin") || /404|Forbidden|not found|Access/i.test(await page.content());
  return { profileOk, settingsOk, deniedPlatform };
}

async function main() {
  const sha = await checkHostedTestingSha();
  if (!sha.ok) {
    console.error(JSON.stringify({ sha, error: "hosted testing SHA mismatch" }, null, 2));
    process.exit(3);
  }

  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const vp of [
    { label: "1440", width: 1440, height: 900 },
    { label: "390", width: 390, height: 844 },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    try {
      const emailLogin = await login(page);
      await ctx.clearCookies();
      const phoneLogin = await loginPhone(page);

      const inviteResults = [];
      for (const c of PHONE_CASES) {
        const stamp = `${vp.label}${Date.now().toString(36).slice(-4)}`;
        const invited = await inviteOnce(page, c.phoneNational, stamp);
        const visible = invited.inviteOk
          ? await verifyStaffVisible(page, `Qa${stamp}`)
          : false;
        inviteResults.push({
          case: c.label,
          input: c.phoneNational,
          expectedCanonical: EXPECTED,
          ...invited,
          staffVisible: visible,
          pass: invited.inviteOk && !invited.requiredBug && invited.mid.national === c.phoneNational,
        });
      }

      const rbac = await rbacCheck(page, inviteResults.find((r) => r.staffId)?.staffId);

      results.push({
        viewport: vp.label,
        emailLoginPath: new URL(emailLogin).pathname,
        phoneLoginPath: new URL(phoneLogin).pathname,
        inviteResults,
        rbac,
        pass:
          emailLogin.includes("/app") &&
          phoneLogin.includes("/app") &&
          inviteResults.every((r) => r.pass),
      });
    } finally {
      await ctx.close();
    }
  }

  await browser.close();
  const failures = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ sha: sha.expectedSha, expectedCanonical: EXPECTED, results, failures: failures.length }, null, 2));
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
