#!/usr/bin/env node
"use strict";

/**
 * Resume/completion of production controlled write QA after AC org already created.
 * Creates ONE BlessBoard Production QA org; completes AC auth smoke + integrity.
 *
 *   set -a; source /tmp/prod-write-qa-resume.env; set +a
 *   scripts/local/run-with-blessboard-env.sh production \
 *     node scripts/local/v7-production-controlled-write-qa-resume.js
 */

const crypto = require("crypto");
const { chromium } = require("playwright");
const { Pool } = require("pg");
const { requireDatabaseUrl } = require("../../db/scripts/lib/databaseUrl");
const { buildFoundationPoolConfig } = require("../../db/scripts/lib/foundationPool");
const { checkDatabaseIdentity } = require("../../db/scripts/lib/databaseIdentity");

const EXPECTED_SHA = "3c2cd0384b09e7483e2feef6bd376e126eff7ea9";
const AC = "https://activeclinic.org";
const BB = "https://blessboard.com";
const PASS = process.env.QA_PASSWORD || "GpProdQaWrite99!";
const STAMP = crypto.randomBytes(3).toString("hex");

const AC_EMAIL = process.env.AC_EMAIL || "prod.qa.ac.e7e6a6@getproapp.org";
const AC_PHONE_NATIONAL = process.env.AC_PHONE_NATIONAL || "975897878";
const AC_ORG_NAME = process.env.AC_ORG_NAME || "ActiveClinic Production QA e7e6a6";
const AC_ORG_KEY = process.env.AC_ORG_KEY || "activeclinic-production-qa-e7e6a6";

const BB_ORG_NAME = `BlessBoard Production QA ${STAMP}`;
const BB_ORG_KEY = `bb-prod-qa-${STAMP}`;
const BB_EMAIL = `prod.qa.bb.${STAMP}@getproapp.org`;
const BB_PHONE_NATIONAL = `96${String(5200000 + (parseInt(STAMP, 16) % 899999)).padStart(7, "0").slice(-7)}`;

async function counts(pool) {
  const q = async (sql) => Number((await pool.query(sql)).rows[0].n);
  return {
    organizations: await q(`SELECT count(*)::int AS n FROM platform.organizations`),
    identities: await q(`SELECT count(*)::int AS n FROM platform.identities`),
    ac_registration_applications: await q(
      `SELECT count(*)::int AS n FROM activeclinic.clinic_registration_applications`
    ),
    ac_staff_members: await q(`SELECT count(*)::int AS n FROM activeclinic.staff_members`),
    ac_facilities: await q(`SELECT count(*)::int AS n FROM activeclinic.facilities`),
    bb_registration_applications: await q(
      `SELECT count(*)::int AS n FROM blessboard.platform_church_registration_applications`
    ),
    bb_users: await q(`SELECT count(*)::int AS n FROM blessboard.users`),
    bb_branches: await q(`SELECT count(*)::int AS n FROM blessboard.branches`),
    patients: await q(`SELECT count(*)::int AS n FROM activeclinic.patients`),
    appointments: await q(`SELECT count(*)::int AS n FROM activeclinic.appointments`),
  };
}

function attach(page, bag) {
  page.on("console", (m) => {
    if (m.type() === "error") bag.console.push(String(m.text()).slice(0, 300));
  });
  page.on("pageerror", (e) => bag.pageErrors.push(String(e.message || e).slice(0, 300)));
  page.on("response", (res) => {
    if (res.status() >= 400 && !/google|facebook|hotjar/i.test(res.url())) {
      bag.bad.push({ url: res.url().slice(0, 200), status: res.status(), type: res.request().resourceType() });
    }
  });
}

async function cookieAudit(ctx) {
  return (await ctx.cookies())
    .filter((c) => /sid|session|csrf/i.test(c.name))
    .map((c) => ({
      name: c.name,
      domain: c.domain,
      secure: !!c.secure,
      httpOnly: !!c.httpOnly,
      sameSite: c.sameSite,
      testingName: /testing|pronline|demo/i.test(c.name),
    }));
}

async function login(page, base, identifier, mode) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (mode === "phone") {
    const tab = page.locator('[data-login-mode="phone"], button:has-text("Phone"), [role="tab"]:has-text("Phone")');
    if (await tab.count()) await tab.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    const phoneField = page.locator(
      'input[name="phone_national"]:not([disabled]), input[name="phone"]:not([disabled])'
    );
    if (await phoneField.count()) await phoneField.first().fill(identifier, { force: true });
    else {
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
  if (/select-organization|choose/i.test(page.url())) {
    const btn = page.locator('button:has-text("Continue"), button:has-text("Open"), button[type="submit"]');
    if (await btn.count()) {
      await btn.first().click().catch(() => {});
      await page.waitForTimeout(3000);
    }
  }
  return { url: page.url(), title: await page.title().catch(() => ""), stillLogin: /\/login(\?|$)/i.test(page.url()) };
}

async function logout(page, base) {
  await page.goto(`${base}/logout`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function submitConsents(page) {
  const consents = page.locator(
    'input[name="acceptTerms"], input[name="registration_consent"], input[name="consent_terms"], input[type="checkbox"]'
  );
  const n = await consents.count();
  for (let i = 0; i < n; i += 1) {
    const el = consents.nth(i);
    if (!(await el.isChecked().catch(() => false))) await el.check({ force: true }).catch(() => {});
  }
  await page.locator('button[type="submit"]').last().click();
}

async function registerBb(page) {
  await page.goto(`${BB}/register-church?plan=foundation`, { waitUntil: "domcontentloaded", timeout: 60000 });
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

  await page.locator('#register_contact_name, input[name="contact_name"]').first().fill("BB Production QA Admin");
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
    already: /already_provisioned|already provisioned/i.test(page.url() + body),
    successPath: /register-church\/success|\/hq/i.test(page.url()),
    genericFailure: /try again shortly|could not finish|provisioning failed/i.test(body),
    title: await page.title().catch(() => ""),
  };
}

async function smoke(page, base, routes) {
  const out = [];
  for (const path of routes) {
    let status = 0;
    let finalUrl = "";
    let title = "";
    let err = null;
    try {
      const res = await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      status = res ? res.status() : 0;
      finalUrl = page.url();
      title = await page.title();
    } catch (e) {
      err = String(e.message || e).slice(0, 200);
      finalUrl = page.url();
    }
    const html = await page.content().catch(() => "");
    out.push({
      path,
      status,
      finalUrl,
      title,
      err,
      loginLoop: /\/login(\?|$)/i.test(finalUrl),
      testing: /\.pronline\.org|testing environment/i.test(html + finalUrl),
      hasQaContext: html.includes(AC_ORG_NAME) || html.includes(BB_ORG_NAME) || html.includes(AC_ORG_KEY) || html.includes(BB_ORG_KEY),
      serverError: status >= 500,
    });
  }
  return out;
}

async function main() {
  if (process.env.PLATFORM_DEPLOYMENT_CODE !== "moovex-platform-production") {
    console.error("refuse deployment");
    process.exit(2);
  }
  const pool = new Pool(buildFoundationPoolConfig(requireDatabaseUrl(), { max: 4 }));
  const browser = await chromium.launch({ headless: true });
  const report = {
    kind: "PRODUCTION_CONTROLLED_WRITE_QA_RESUME",
    startedAt: new Date().toISOString(),
    expectedSha: EXPECTED_SHA,
    stamp: STAMP,
    defects: [],
    knownDebtImpact: [],
  };

  try {
    const identity = await checkDatabaseIdentity(pool, { identityKey: "moovex-platform-v7" });
    report.dbIdentity = {
      ok: identity.ok,
      identity_key: identity.row && identity.row.identity_key,
      environment_code: identity.row && identity.row.environment_code,
    };
    const acH = await fetch(`${AC}/healthz`).then((r) => r.json());
    const bbH = await fetch(`${BB}/healthz`).then((r) => r.json());
    report.hostedSha = { ac: acH.gitSha, bb: bbH.gitSha };

    // Original baseline from first smoke (empty) — also capture current pre-BB counts
    report.originalBaseline = {
      organizations: 0,
      identities: 0,
      ac_registration_applications: 0,
      ac_staff_members: 0,
      ac_facilities: 0,
      bb_registration_applications: 1,
      bb_users: 0,
      bb_branches: 0,
      patients: 0,
      appointments: 0,
      note: "Captured at write-QA start before AC registration; BB had 1 failed Test Church app",
    };
    report.preBbCounts = await counts(pool);

    const dep = await pool.query(
      `SELECT deployment_code, status, canonical_domain, session_cookie_name
         FROM platform.deployments WHERE deployment_code='moovex-platform-production'`
    );
    report.deploymentRow = dep.rows[0] || null;
    report.knownDebtImpact.push({
      id: "missing_moovex_platform_production_row",
      classification_was: "NONBLOCKING_DEBT",
      runtime_finding: "Blocks registration provisioning (deployment_not_found) and deployment sessions",
      action_taken: "Inserted active catalogue row before write QA",
      promoted_severity_if_absent: "P0",
      current: report.deploymentRow,
    });

    // AC already registered in prior run
    report.ac = {
      registration: {
        fromPriorRun: true,
        url: "https://activeclinic.org/register-clinic/success?ref=AC-MTOL1BK6-A9F459&ready=1",
        ready: true,
        ref: "AC-MTOL1BK6-A9F459",
        organization_key: AC_ORG_KEY,
        label: "AC_PRODUCTION_REGISTRATION_PASS",
      },
    };

    const acBag = { console: [], pageErrors: [], bad: [] };
    const acCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const acPage = await acCtx.newPage();
    attach(acPage, acBag);

    // Retry AC registration (idempotency)
    await acPage.goto(`${AC}/register-clinic`, { waitUntil: "domcontentloaded", timeout: 60000 });
    // minimal retry: fill same clinic/admin again using helpers inline
    await acPage.locator("#clinicName, input[name='clinicName']").first().fill(AC_ORG_NAME);
    const type = acPage.locator("#clinicType, select[name='clinicType']");
    if (await type.count()) await type.first().selectOption("clinic").catch(() => type.first().selectOption({ index: 1 }));
    await acPage.locator("#city, input[name='city']").first().fill("Lusaka");
    const province = acPage.locator("#provinceSelect, select[name='province']");
    if (await province.count()) await province.first().selectOption({ index: 1 }).catch(() => {});
    await acPage.locator('button:has-text("Continue"), button[type="submit"]').first().click();
    await acPage.waitForTimeout(1000);
    await acPage.locator("#contactName, input[name='contactName']").first().fill("AC Production QA Admin");
    await acPage.locator("#contactEmail, input[name='contactEmail'], input[name='email']").first().fill(AC_EMAIL);
    await acPage
      .locator("#phone_national, input[name='phone_national']")
      .first()
      .fill(AC_PHONE_NATIONAL, { force: true });
    await acPage.locator("#password, input[name='password']").first().fill(PASS);
    const conf = acPage.locator("#passwordConfirm, input[name='passwordConfirm'], input[name='password_confirm']");
    if (await conf.count()) await conf.first().fill(PASS);
    await acPage.locator('button[type="submit"]').last().click();
    await acPage.waitForTimeout(1000);
    if (await acPage.locator('input[name="acceptTerms"], input[name="registration_consent"]').count()) {
      await submitConsents(acPage);
    }
    await acPage.waitForURL(/register-clinic\/success|ready=/i, { timeout: 90000 }).catch(() => {});
    report.ac.retry = {
      url: acPage.url(),
      ready: /ready=1/i.test(acPage.url()),
      successPath: /success/i.test(acPage.url()),
      bodyHint: (await acPage.content()).slice(0, 200),
    };
    console.error("AC retry", JSON.stringify({ url: report.ac.retry.url, ready: report.ac.retry.ready }));

    await logout(acPage, AC);
    report.ac.emailLogin = await login(acPage, AC, AC_EMAIL, "email");
    report.ac.emailLogin.cookies = await cookieAudit(acCtx);
    console.error("AC email", JSON.stringify({ url: report.ac.emailLogin.url, still: report.ac.emailLogin.stillLogin }));

    report.ac.authSmoke = await smoke(acPage, AC, [
      "/app",
      "/settings",
      "/settings/website",
      "/settings/access",
      "/website",
      "/website/hub",
      "/staff",
      "/staff/access",
    ]);

    await logout(acPage, AC);
    report.ac.logoutCookies = await cookieAudit(acCtx);
    report.ac.phoneLogin = await login(acPage, AC, AC_PHONE_NATIONAL, "phone");
    report.ac.phoneLogin.cookies = await cookieAudit(acCtx);
    console.error("AC phone", JSON.stringify({ url: report.ac.phoneLogin.url, still: report.ac.phoneLogin.stillLogin }));

    // public website via org key
    const pubRes = await acPage.goto(`${AC}/clinics/${AC_ORG_KEY}`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    }).catch(() => null);
    const pubHtml = await acPage.content().catch(() => "");
    report.ac.publicWebsite = {
      url: acPage.url(),
      status: pubRes ? pubRes.status() : 0,
      title: await acPage.title().catch(() => ""),
      hasQaName: pubHtml.includes(AC_ORG_NAME),
      websitePublishedFalse: true,
      testing: /\.pronline\.org/i.test(pubHtml),
      blessboardBleed: /data-brand="blessboard"/i.test(pubHtml),
    };
    await acCtx.close();

    // BB
    const bbBag = { console: [], pageErrors: [], bad: [] };
    const bbCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const bbPage = await bbCtx.newPage();
    attach(bbPage, bbBag);
    report.bb = {};
    report.bb.registration = await registerBb(bbPage);
    console.error("BB registration", JSON.stringify(report.bb.registration));
    await logout(bbPage, BB);
    report.bb.retry = await registerBb(bbPage);
    console.error("BB retry", JSON.stringify(report.bb.retry));
    await logout(bbPage, BB);
    report.bb.emailLogin = await login(bbPage, BB, BB_EMAIL, "email");
    report.bb.emailLogin.cookies = await cookieAudit(bbCtx);
    console.error("BB email", JSON.stringify({ url: report.bb.emailLogin.url, still: report.bb.emailLogin.stillLogin }));
    report.bb.authSmoke = await smoke(bbPage, BB, [
      "/hq",
      "/home",
      "/members",
      "/users",
      "/settings/users",
      "/settings/roles",
      "/settings/access",
      "/website",
      "/website/hub",
      "/settings/website",
      "/branches",
      "/settings/branches",
    ]);
    await logout(bbPage, BB);
    report.bb.logoutCookies = await cookieAudit(bbCtx);
    report.bb.phoneLogin = await login(bbPage, BB, BB_PHONE_NATIONAL, "phone");
    report.bb.phoneLogin.cookies = await cookieAudit(bbCtx);
    console.error("BB phone", JSON.stringify({ url: report.bb.phoneLogin.url, still: report.bb.phoneLogin.stillLogin }));

    // public church URL
    report.bb.publicWebsite = { tried: [] };
    for (const u of [`${BB}/c/${BB_ORG_KEY}`, `${BB}/${BB_ORG_KEY}`]) {
      const res = await bbPage.goto(u, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
      const html = await bbPage.content().catch(() => "");
      const item = {
        url: bbPage.url(),
        status: res ? res.status() : 0,
        title: await bbPage.title().catch(() => ""),
        hasQaName: html.includes(BB_ORG_NAME),
        testing: /\.pronline\.org/i.test(html),
        activeclinicBleed: /ActiveClinic/i.test(html) && !/Powered by GetPro/i.test(html),
      };
      report.bb.publicWebsite.tried.push(item);
      if (item.status === 200 && !report.bb.publicWebsite.best) report.bb.publicWebsite.best = item;
    }
    await bbCtx.close();

    report.after = await counts(pool);
    report.deltasFromOriginal = Object.fromEntries(
      Object.keys(report.originalBaseline)
        .filter((k) => k !== "note")
        .map((k) => [k, report.after[k] - report.originalBaseline[k]])
    );

    // DB details
    const acOrg = (
      await pool.query(`SELECT id, organization_key, display_name, status, data_environment FROM platform.organizations WHERE organization_key=$1`, [
        AC_ORG_KEY,
      ])
    ).rows[0];
    const bbOrg = (
      await pool.query(`SELECT id, organization_key, display_name, status, data_environment FROM platform.organizations WHERE organization_key=$1`, [
        BB_ORG_KEY,
      ])
    ).rows[0];
    const acIdent = (
      await pool.query(`SELECT id, email_normalized, phone_normalized, status FROM platform.identities WHERE email_normalized=$1`, [
        AC_EMAIL.toLowerCase(),
      ])
    ).rows;
    const bbUser = (
      await pool.query(`SELECT id, email_normalized, phone_normalized, status FROM blessboard.users WHERE email_normalized=$1`, [
        BB_EMAIL.toLowerCase(),
      ])
    ).rows;
    const bbIdent = (
      await pool.query(`SELECT id, email_normalized, status FROM platform.identities WHERE email_normalized=$1`, [
        BB_EMAIL.toLowerCase(),
      ])
    ).rows;
    const acStaff = await pool.query(
      `SELECT sm.id, sm.status, array_remove(array_agg(DISTINCT r.role_key), NULL) AS roles
         FROM activeclinic.staff_members sm
         LEFT JOIN activeclinic.staff_role_assignments sra ON sra.staff_member_id=sm.id AND sra.status='active'
         LEFT JOIN blessboard.roles r ON r.id=sra.role_id
        WHERE sm.organization_id=$1
        GROUP BY sm.id, sm.status`,
      [acOrg.id]
    );
    const acFac = await pool.query(`SELECT id, name, facility_type, status FROM activeclinic.facilities WHERE organization_id=$1`, [
      acOrg.id,
    ]);
    const bbRoles = bbUser[0]
      ? await pool.query(`SELECT role_key, status, organization_id FROM blessboard.user_roles WHERE user_id=$1 AND status='active'`, [
          bbUser[0].id,
        ])
      : { rows: [] };
    const bbBranches = bbOrg
      ? await pool.query(
          `SELECT id, branch_key, display_name, is_primary, status, church_id FROM blessboard.branches WHERE church_id IN (SELECT id FROM blessboard.churches WHERE organization_id=$1)`,
          [bbOrg.id]
        )
      : { rows: [] };
    const allOrgs = await pool.query(
      `SELECT organization_key, display_name, status, data_environment FROM platform.organizations ORDER BY created_at`
    );

    report.created = {
      ac: {
        org: acOrg,
        identityCount: acIdent.length,
        staff: acStaff.rows,
        facilities: acFac.rows,
        applicationRef: "AC-MTOL1BK6-A9F459",
      },
      bb: {
        org: bbOrg || null,
        userCount: bbUser.length,
        identityCount: bbIdent.length,
        roles: bbRoles.rows,
        branches: bbBranches.rows,
        emailDomain: BB_EMAIL.split("@")[1],
      },
      allOrganizations: allOrgs.rows.map((r) => ({
        key: r.organization_key,
        name: r.display_name,
        status: r.status,
        data_environment: r.data_environment,
        ours: r.organization_key === AC_ORG_KEY || r.organization_key === BB_ORG_KEY,
      })),
    };

    report.browserErrors = { ac: acBag, bb: bbBag };

    // scoring
    const acRetryOk = report.ac.retry && (report.ac.retry.ready || report.ac.retry.successPath);
    const acEmailOk = report.ac.emailLogin && !report.ac.emailLogin.stillLogin;
    const acPhoneOk = report.ac.phoneLogin && !report.ac.phoneLogin.stillLogin;
    const acSmokeOk =
      acEmailOk &&
      report.ac.authSmoke.some((r) => r.status === 200 && !r.loginLoop) &&
      !report.ac.authSmoke.some((r) => r.serverError);
    const acWeb =
      report.ac.publicWebsite &&
      (report.ac.publicWebsite.status === 200 || report.ac.publicWebsite.status === 404) &&
      !report.ac.publicWebsite.testing;
    // unpublished site may 404 — classify as gap not fail if org exists
    const acWebPass = report.ac.publicWebsite && report.ac.publicWebsite.status === 200 && report.ac.publicWebsite.hasQaName;

    const bbRegOk =
      report.bb.registration &&
      (report.bb.registration.ready || report.bb.registration.successPath) &&
      !report.bb.registration.genericFailure &&
      bbOrg;
    const bbRetryOk =
      report.bb.retry &&
      (report.bb.retry.ready || report.bb.retry.already || report.bb.retry.successPath) &&
      !report.bb.retry.genericFailure &&
      bbUser.length === 1;
    const bbEmailOk = report.bb.emailLogin && !report.bb.emailLogin.stillLogin;
    const bbPhoneOk = report.bb.phoneLogin && !report.bb.phoneLogin.stillLogin;
    const bbSmokeOk =
      bbEmailOk &&
      report.bb.authSmoke.some((r) => r.status === 200 && !r.loginLoop) &&
      !report.bb.authSmoke.some((r) => r.serverError);
    const bbWebPass = report.bb.publicWebsite && report.bb.publicWebsite.best && report.bb.publicWebsite.best.status === 200;

    const sessionCookies = []
      .concat(report.ac.emailLogin.cookies || [])
      .concat(report.ac.phoneLogin.cookies || [])
      .concat(report.bb.emailLogin.cookies || [])
      .concat(report.bb.phoneLogin.cookies || [])
      .filter((c) => /sid/i.test(c.name) && !/csrf/i.test(c.name));
    const sessionOk =
      sessionCookies.length > 0 &&
      sessionCookies.every(
        (c) =>
          c.secure &&
          c.httpOnly &&
          /^Lax$/i.test(String(c.sameSite)) &&
          !c.testingName &&
          /moovex_platform_production_sid/i.test(c.name)
      );
    report.sessionSecurity = { ok: sessionOk, cookies: sessionCookies };

    const integrityIssues = [];
    if (report.after.patients !== 0) integrityIssues.push("patients_nonzero");
    if (report.after.appointments !== 0) integrityIssues.push("appointments_nonzero");
    if (acIdent.length !== 1) integrityIssues.push("ac_identity_dup_or_missing");
    if (bbRegOk && bbUser.length !== 1) integrityIssues.push("bb_user_dup_or_missing");
    if (acStaff.rows.length !== 1) integrityIssues.push("ac_staff_count");
    if (!acStaff.rows.some((r) => (r.roles || []).includes("activeclinic_organization_admin"))) {
      integrityIssues.push("ac_missing_organization_admin");
    }
    // Expected orgs: AC QA + BB QA + preexisting Test Church 01
    const orgKeys = allOrgs.rows.map((r) => r.organization_key);
    if (!orgKeys.includes(AC_ORG_KEY)) integrityIssues.push("ac_org_missing");
    if (bbRegOk && !orgKeys.includes(BB_ORG_KEY)) integrityIssues.push("bb_org_missing");
    report.integrityIssues = integrityIssues;

    report.scorecards = {
      activeclinic: {
        registration: "AC_PRODUCTION_REGISTRATION_PASS",
        retry: acRetryOk ? "AC_PRODUCTION_REGISTRATION_RETRY_PASS" : "AC_PRODUCTION_REGISTRATION_RETRY_FAIL",
        email_login: acEmailOk ? "AC_PRODUCTION_EMAIL_LOGIN_PASS" : "AC_PRODUCTION_EMAIL_LOGIN_FAIL",
        phone_login: acPhoneOk ? "AC_PRODUCTION_PHONE_LOGIN_PASS" : "AC_PRODUCTION_PHONE_LOGIN_FAIL",
        authenticated_app: acSmokeOk ? "AC_PRODUCTION_AUTH_SMOKE_PASS" : "AC_PRODUCTION_AUTH_SMOKE_FAIL",
        public_website: acWebPass
          ? "AC_PRODUCTION_PUBLIC_WEBSITE_PASS"
          : report.ac.publicWebsite && report.ac.publicWebsite.status === 200
            ? "AC_PRODUCTION_PUBLIC_WEBSITE_PASS"
            : "AC_PRODUCTION_PUBLIC_WEBSITE_UNPUBLISHED_OR_FAIL",
        db_integrity: integrityIssues.length === 0 ? "PRODUCTION_WRITE_QA_DB_INTEGRITY_PASS" : "PRODUCTION_WRITE_QA_DB_INTEGRITY_FAIL",
      },
      blessboard: {
        registration: bbRegOk ? "BB_PRODUCTION_REGISTRATION_PASS" : "BB_PRODUCTION_REGISTRATION_FAIL",
        retry: bbRetryOk ? "BB_PRODUCTION_REGISTRATION_RETRY_PASS" : "BB_PRODUCTION_REGISTRATION_RETRY_FAIL",
        email_login: bbEmailOk ? "BB_PRODUCTION_EMAIL_LOGIN_PASS" : "BB_PRODUCTION_EMAIL_LOGIN_FAIL",
        phone_login: bbPhoneOk ? "BB_PRODUCTION_PHONE_LOGIN_PASS" : "BB_PRODUCTION_PHONE_LOGIN_FAIL",
        authenticated_app: bbSmokeOk ? "BB_PRODUCTION_AUTH_SMOKE_PASS" : "BB_PRODUCTION_AUTH_SMOKE_FAIL",
        public_website: bbWebPass ? "BB_PRODUCTION_PUBLIC_WEBSITE_PASS" : "BB_PRODUCTION_PUBLIC_WEBSITE_FAIL",
        db_integrity: integrityIssues.length === 0 ? "PRODUCTION_WRITE_QA_DB_INTEGRITY_PASS" : "PRODUCTION_WRITE_QA_DB_INTEGRITY_FAIL",
      },
    };

    if (!report.deploymentRow) {
      report.defects.push({
        severity: "P0",
        product: "PLATFORM",
        route: "platform.deployments",
        action: "provision",
        expected: "moovex-platform-production row",
        actual: "missing",
        httpStatus: null,
        error: "deployment_not_found",
      });
    }
    if (!acRetryOk) {
      report.defects.push({
        severity: "P1",
        product: "ACTIVECLINIC",
        route: "/register-clinic",
        action: "retry",
        expected: "idempotent success",
        actual: report.ac.retry,
        httpStatus: null,
        error: "retry_failed",
      });
    }
    if (!acEmailOk || !acPhoneOk) {
      report.defects.push({
        severity: "P1",
        product: "ACTIVECLINIC",
        route: "/login",
        action: !acEmailOk ? "email login" : "phone login",
        expected: "auth success",
        actual: !acEmailOk ? report.ac.emailLogin.url : report.ac.phoneLogin.url,
        httpStatus: null,
        error: "login_failed",
      });
    }
    if (!bbRegOk) {
      report.defects.push({
        severity: "P1",
        product: "BLESSBOARD",
        route: "/register-church",
        action: "fresh registration",
        expected: "success + org",
        actual: report.bb.registration,
        httpStatus: null,
        error: "registration_failed",
      });
    }
    if (bbRegOk && (!bbEmailOk || !bbPhoneOk)) {
      report.defects.push({
        severity: bbEmailOk ? "P2" : "P1",
        product: "BLESSBOARD",
        route: "/login",
        action: !bbEmailOk ? "email login" : "phone login",
        expected: "auth success",
        actual: !bbEmailOk ? report.bb.emailLogin.url : report.bb.phoneLogin.url,
        httpStatus: null,
        error: "login_failed",
      });
    }
    if (!sessionOk) {
      report.defects.push({
        severity: "P1",
        product: "PLATFORM",
        route: "session cookie",
        action: "audit",
        expected: "moovex_platform_production_sid Secure HttpOnly Lax",
        actual: report.sessionSecurity,
        httpStatus: null,
        error: "cookie_flags",
      });
    }
    if (!acWebPass) {
      report.defects.push({
        severity: "P3",
        product: "ACTIVECLINIC",
        route: `/clinics/${AC_ORG_KEY}`,
        action: "public GET",
        expected: "200 published QA site or intentional unpublished state",
        actual: report.ac.publicWebsite,
        httpStatus: report.ac.publicWebsite && report.ac.publicWebsite.status,
        error: "unpublished_or_missing",
      });
    }
    if (bbRegOk && !bbWebPass) {
      report.defects.push({
        severity: "P2",
        product: "BLESSBOARD",
        route: `/c/${BB_ORG_KEY}`,
        action: "public GET",
        expected: "200",
        actual: report.bb.publicWebsite,
        httpStatus: null,
        error: "public_site_unavailable",
      });
    }
    // Test Church concurrent tenant
    if (allOrgs.rows.some((r) => r.organization_key === "test-church-01")) {
      report.defects.push({
        severity: "P2",
        product: "BLESSBOARD",
        route: "n/a",
        action: "observe preexisting/concurrent tenant",
        expected: "only dedicated QA tenants from this run",
        actual: "test-church-01 exists with data_environment=testing on production DB",
        httpStatus: null,
        error: "foreign_tenant_present",
      });
    }

    report.retention = {
      ac: {
        classification: "SAFE_TO_RETAIN_AS_PRODUCTION_QA_TENANT",
        organization_key: AC_ORG_KEY,
        organization_id: acOrg.id,
        display_name: AC_ORG_NAME,
        application_ref: "AC-MTOL1BK6-A9F459",
        email_domain: AC_EMAIL.split("@")[1],
      },
      bb: bbOrg
        ? {
            classification: "SAFE_TO_RETAIN_AS_PRODUCTION_QA_TENANT",
            organization_key: BB_ORG_KEY,
            organization_id: bbOrg.id,
            display_name: BB_ORG_NAME,
            email_domain: BB_EMAIL.split("@")[1],
          }
        : { classification: "CLEANUP_REQUIRED_BEFORE_PUBLIC_RELEASE", reason: "bb_registration_failed" },
      test_church_01: {
        classification: "CLEANUP_REQUIRED_BEFORE_PUBLIC_RELEASE",
        organization_key: "test-church-01",
        note: "Not created by this controlled QA script; provisioned after deployment-row fix (data_environment=testing)",
      },
      failed_bb_application_93d23f75: {
        classification: "CLEANUP_REQUIRED_BEFORE_PUBLIC_RELEASE",
        note: "Earlier provision_failed application with deployment_not_found",
      },
    };

    const p0 = report.defects.filter((d) => d.severity === "P0");
    const p1 = report.defects.filter((d) => d.severity === "P1");
    const core =
      acRetryOk &&
      acEmailOk &&
      bbRegOk &&
      bbRetryOk &&
      bbEmailOk &&
      integrityIssues.length === 0 &&
      sessionOk &&
      p0.length === 0 &&
      p1.length === 0;

    if (!core) {
      report.verdict = "PRODUCTION_CONTROLLED_WRITE_QA_FAILED";
      report.nextAction =
        "Fix remaining P0/P1 defects (registration/login/session/integrity), then re-run remaining failed steps only.";
    } else if (report.defects.some((d) => d.severity === "P2" || d.severity === "P3") || !acPhoneOk || !bbPhoneOk || !acSmokeOk || !bbSmokeOk || !acWebPass || !bbWebPass) {
      report.verdict = "PRODUCTION_CONTROLLED_WRITE_QA_PASS_WITH_GAPS";
      report.nextAction =
        "Proceed to production release certification, resolve any FIX_BEFORE_PUBLIC_RELEASE items, and decide whether to retain or explicitly clean up the two dedicated production QA tenants.";
    } else {
      report.verdict = "PRODUCTION_CONTROLLED_WRITE_QA_PASS";
      report.nextAction =
        "Proceed to production release certification, resolve any FIX_BEFORE_PUBLIC_RELEASE items, and decide whether to retain or explicitly clean up the two dedicated production QA tenants.";
    }

    report.finishedAt = new Date().toISOString();
    const text = JSON.stringify(report);
    if (text.includes(PASS)) {
      console.error("PASSWORD_LEAK_GUARD");
      process.exit(1);
    }
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.verdict === "PRODUCTION_CONTROLLED_WRITE_QA_FAILED" ? 4 : 0);
  } catch (err) {
    console.error(JSON.stringify({ verdict: "PRODUCTION_CONTROLLED_WRITE_QA_FAILED", error: String(err.message || err).slice(0, 500) }, null, 2));
    process.exit(1);
  } finally {
    await browser.close().catch(() => {});
    await pool.end().catch(() => {});
  }
}

main();
