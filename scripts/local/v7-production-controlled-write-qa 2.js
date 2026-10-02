#!/usr/bin/env node
"use strict";

/**
 * Controlled PRODUCTION write QA — exactly one AC + one BB QA organization.
 * Uses public production registration/login flows only.
 * Does not print passwords or cookie values.
 *
 *   scripts/local/run-with-blessboard-env.sh production \
 *     node scripts/local/v7-production-controlled-write-qa.js
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
const PASS =
  process.env.QA_PASSWORD ||
  `GpQa!${crypto.randomBytes(9).toString("base64url")}9A`;
const STAMP = crypto.randomBytes(3).toString("hex");

const AC_ORG_NAME = `ActiveClinic Production QA ${STAMP}`;
const BB_ORG_NAME = `BlessBoard Production QA ${STAMP}`;
const AC_EMAIL = `prod.qa.ac.${STAMP}@getproapp.org`;
const BB_EMAIL = `prod.qa.bb.${STAMP}@getproapp.org`;
const AC_PHONE_NATIONAL = `97${String(5100000 + (parseInt(STAMP, 16) % 899999)).padStart(7, "0").slice(-7)}`;
const BB_PHONE_NATIONAL = `96${String(5200000 + (parseInt(STAMP, 16) % 899999)).padStart(7, "0").slice(-7)}`;
const BB_ORG_KEY = `bb-prod-qa-${STAMP}`;

function shaOk(hosted) {
  const h = String(hosted || "").toLowerCase();
  const e = EXPECTED_SHA.toLowerCase();
  return h && (e.startsWith(h) || h.startsWith(e.slice(0, 12)));
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function counts(pool) {
  const q = async (sql) => {
    try {
      const r = await pool.query(sql);
      return Number(r.rows[0].n);
    } catch (err) {
      return { error: err.message };
    }
  };
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
    bookings: await (async () => {
      const exists = await pool.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema='activeclinic' AND table_name='patient_bookings'
        ) AS ok`);
      if (!exists.rows[0].ok) return { note: "table_absent", count: null };
      return q(`SELECT count(*)::int AS n FROM activeclinic.patient_bookings`);
    })(),
  };
}

function delta(before, after) {
  const out = {};
  for (const k of Object.keys(before)) {
    const b = before[k];
    const a = after[k];
    if (typeof b === "number" && typeof a === "number") out[k] = a - b;
    else out[k] = { before: b, after: a };
  }
  return out;
}

async function attachCollectors(page, bag) {
  page.on("console", (msg) => {
    if (msg.type() === "error") bag.consoleErrors.push(String(msg.text() || "").slice(0, 400));
  });
  page.on("pageerror", (err) => {
    bag.pageErrors.push(String(err && err.message ? err.message : err).slice(0, 400));
  });
  page.on("response", (res) => {
    const status = res.status();
    if (status >= 400) {
      const url = res.url();
      if (/google|facebook|hotjar|doubleclick/i.test(url)) return;
      bag.badResponses.push({ url: url.slice(0, 250), status, type: res.request().resourceType() });
    }
  });
}

async function cookieAudit(context, hostHint) {
  const cookies = await context.cookies();
  return cookies
    .filter((c) => /sid|session|csrf/i.test(c.name))
    .map((c) => ({
      name: c.name,
      domain: c.domain,
      secure: c.secure === true,
      httpOnly: c.httpOnly === true,
      sameSite: c.sameSite,
      hostHint,
      testingName: /testing|pronline|demo/i.test(c.name),
      // never include value
    }));
}

async function fillAcClinic(page, clinicName) {
  await page.locator("#clinicName, input[name='clinicName'], input[name='clinic_name']").first().fill(clinicName);
  const type = page.locator("#clinicType, select[name='clinicType'], select[name='clinic_type']");
  if (await type.count()) {
    await type.first().selectOption("clinic").catch(() => type.first().selectOption({ index: 1 }));
  }
  await page.locator("#city, input[name='city']").first().fill("Lusaka");
  const province = page.locator("#provinceSelect, select[name='province'], select[name='provinceCode']");
  if (await province.count()) {
    await province.first().selectOption({ index: 1 }).catch(async () => {
      await province.first().selectOption({ label: /Lusaka/i }).catch(() => {});
    });
  }
  const country = page.locator("select[name='countryCode'], #countryCode, select[name='country']");
  if (await country.count()) await country.first().selectOption("ZM").catch(() => {});
  await page
    .locator('form[data-ac-register-step="clinic"] button[type="submit"], button:has-text("Continue")')
    .first()
    .click();
  await page.waitForTimeout(1200);
}

async function fillAcAdmin(page, { name, email, phoneNational }) {
  await page
    .locator("#contactName, input[name='contactName'], input[name='contact_name']")
    .first()
    .fill(name);
  await page
    .locator("#contactEmail, input[name='contactEmail'], input[name='contact_email'], input[name='email']")
    .first()
    .fill(email);
  const phone = page.locator(
    "#phone_national, input[name='phone_national'], input[name='contactPhone'], input[name='phone']"
  );
  await phone.first().fill(phoneNational, { force: true });
  await page.locator("#password, input[name='password']").first().fill(PASS);
  const confirm = page.locator(
    "#passwordConfirm, input[name='passwordConfirm'], input[name='password_confirm']"
  );
  if (await confirm.count()) await confirm.first().fill(PASS);
  await page.locator('button[type="submit"]').last().click();
  await page.waitForTimeout(1200);
}

async function submitConsents(page) {
  const consents = page.locator(
    'input[name="acceptTerms"], input[name="registration_consent"], input[name="consent_terms"], input[type="checkbox"]'
  );
  const n = await consents.count();
  for (let i = 0; i < n; i += 1) {
    const el = consents.nth(i);
    if (!(await el.isChecked().catch(() => false))) {
      await el.check({ force: true }).catch(() => {});
    }
  }
  await page.locator('button[type="submit"]').last().click();
}

async function registerAc(page) {
  await page.goto(`${AC}/register-clinic`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await fillAcClinic(page, AC_ORG_NAME);
  if (await page.locator("#contactName, input[name='contactName']").count()) {
    await fillAcAdmin(page, {
      name: "AC Production QA Admin",
      email: AC_EMAIL,
      phoneNational: AC_PHONE_NATIONAL,
    });
  } else {
    await page.locator('button:has-text("Continue"), button[type="submit"]').first().click().catch(() => {});
    await page.waitForTimeout(800);
    await fillAcAdmin(page, {
      name: "AC Production QA Admin",
      email: AC_EMAIL,
      phoneNational: AC_PHONE_NATIONAL,
    });
  }
  if (await page.locator('input[name="acceptTerms"], input[name="registration_consent"], input[name="consent_terms"]').count()) {
    await submitConsents(page);
  } else if (await page.getByText(/review|terms/i).count()) {
    await submitConsents(page);
  }
  await page
    .waitForURL(/register-clinic\/(success|review)|\/app|\/portal|ready=/i, { timeout: 120000 })
    .catch(() => {});
  const body = await page.content();
  return {
    url: page.url(),
    ready: /ready=1/i.test(page.url()) || /ready=1/i.test(body),
    already: /already_provisioned|already provisioned/i.test(page.url() + body),
    successPath: /register-clinic\/success/i.test(page.url()),
    genericFailure: /try again shortly|could not finish registration|provisioning failed/i.test(body),
    title: await page.title().catch(() => ""),
  };
}

async function fillBbChurch(page) {
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
  const next = page.locator('button[value="next-church"], button[name="action"][value="next-church"]');
  if (await next.count()) await next.first().click();
  else await page.locator('button:has-text("Continue"), button:has-text("Next")').first().click();
  await page.waitForTimeout(1000);
}

async function fillBbAdmin(page) {
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
  const next = page.locator('button[value="next-admin"], button[name="action"][value="next-admin"]');
  if (await next.count()) await next.first().click();
  else await page.locator('button:has-text("Continue"), button:has-text("Next")').first().click();
  await page.waitForTimeout(1000);
}

async function registerBb(page) {
  await page.goto(`${BB}/register-church?plan=foundation`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await fillBbChurch(page);
  await fillBbAdmin(page);
  await submitConsents(page);
  await page
    .waitForURL(/register-church\/(success|review)|\/hq|\/home|ready=/i, { timeout: 120000 })
    .catch(() => {});
  const body = await page.content();
  return {
    url: page.url(),
    ready: /ready=1/i.test(page.url()) || /ready=1/i.test(body),
    already: /already_provisioned|already provisioned/i.test(page.url() + body),
    successPath: /register-church\/success|\/hq/i.test(page.url()),
    genericFailure: /try again shortly|could not finish|provisioning failed|not yet available/i.test(body),
    title: await page.title().catch(() => ""),
  };
}

async function login(page, base, identifier, mode) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (mode === "phone") {
    const tab = page.locator(
      '[data-login-mode="phone"], button:has-text("Phone"), [role="tab"]:has-text("Phone"), a:has-text("Phone")'
    );
    if (await tab.count()) await tab.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    const phoneField = page.locator(
      'input[name="phone_national"]:not([disabled]), input[name="phone"]:not([disabled]), input[data-bb-auth-phone]:not([disabled])'
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
    const tab = page.locator('[data-login-mode="email"], button:has-text("Email"), [role="tab"]:has-text("Email")');
    if (await tab.count()) await tab.first().click({ force: true }).catch(() => {});
    await page
      .locator('input[name="email"], input[name="login_email"], input[data-bb-auth-email], input[type="email"]')
      .first()
      .fill(identifier, { force: true });
  }
  await page.locator('input[name="password"]').fill(PASS, { force: true });
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(5000);
  // org select if present
  const selectBtn = page.locator(
    'button:has-text("Continue"), button:has-text("Open"), a:has-text("Continue"), form[action*="select"] button[type="submit"]'
  );
  if (/select-organization|choose.?org|select.?church/i.test(page.url()) && (await selectBtn.count())) {
    await selectBtn.first().click().catch(() => {});
    await page.waitForTimeout(3000);
  }
  return {
    url: page.url(),
    title: await page.title().catch(() => ""),
    stillLogin: /\/login(\?|$)/i.test(page.url()),
  };
}

async function logout(page, base) {
  await page.goto(`${base}/logout`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(500);
}

async function smokeRoutes(page, base, routes, product) {
  const out = [];
  for (const path of routes) {
    const url = path.startsWith("http") ? path : `${base}${path}`;
    let status = 0;
    let finalUrl = url;
    let title = "";
    let heading = "";
    let err = null;
    try {
      const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      status = res ? res.status() : 0;
      finalUrl = page.url();
      title = await page.title();
      heading = await page.evaluate(() => {
        const h1 = document.querySelector("h1");
        return h1 && h1.innerText ? h1.innerText.trim().slice(0, 160) : "";
      });
    } catch (e) {
      err = String(e.message || e).slice(0, 240);
    }
    const html = await page.content().catch(() => "");
    out.push({
      path,
      status,
      finalUrl,
      title,
      heading,
      err,
      loginLoop: /\/login(\?|$)/i.test(finalUrl),
      testing: /\.pronline\.org|testing environment/i.test(html + finalUrl),
      crossProduct:
        product === "activeclinic"
          ? /data-brand="blessboard"|BlessBoard Church/i.test(html)
          : /data-brand="activeclinic"/i.test(html) && !/Powered by/i.test(html),
      contextHint: html.includes(AC_ORG_NAME) || html.includes(BB_ORG_NAME) || html.includes(BB_ORG_KEY),
    });
  }
  return out;
}

async function inspectCreated(pool) {
  const acOrg = await pool.query(
    `SELECT id, organization_key, display_name, status, data_environment
       FROM platform.organizations
      WHERE display_name = $1 OR organization_key ILIKE $2
      ORDER BY created_at DESC LIMIT 3`,
    [AC_ORG_NAME, `%${STAMP}%`]
  );
  const bbOrg = await pool.query(
    `SELECT id, organization_key, display_name, status, data_environment
       FROM platform.organizations
      WHERE display_name = $1 OR organization_key = $2
      ORDER BY created_at DESC LIMIT 3`,
    [BB_ORG_NAME, BB_ORG_KEY]
  );
  const acIdent = await pool.query(
    `SELECT id, email_normalized, phone_normalized, status
       FROM platform.identities WHERE email_normalized = $1`,
    [AC_EMAIL.toLowerCase()]
  );
  const bbUser = await pool.query(
    `SELECT id, email_normalized, phone_normalized, status
       FROM blessboard.users WHERE email_normalized = $1`,
    [BB_EMAIL.toLowerCase()]
  );
  const bbIdent = await pool.query(
    `SELECT id, email_normalized, phone_normalized, status
       FROM platform.identities WHERE email_normalized = $1`,
    [BB_EMAIL.toLowerCase()]
  );

  let acDetail = null;
  if (acOrg.rows[0]) {
    const orgId = acOrg.rows[0].id;
    const staff = await pool.query(
      `SELECT sm.id, sm.status, sm.platform_identity_id,
              array_remove(array_agg(DISTINCT sra.role_key), NULL) AS roles
         FROM activeclinic.staff_members sm
         LEFT JOIN activeclinic.staff_role_assignments sra
           ON sra.staff_member_id = sm.id AND sra.status = 'active'
        WHERE sm.organization_id = $1 AND sm.status <> 'archived'
        GROUP BY sm.id, sm.status, sm.platform_identity_id`,
      [orgId]
    );
    const facilities = await pool.query(
      `SELECT id, name, facility_type, status FROM activeclinic.facilities WHERE organization_id = $1`,
      [orgId]
    );
    const hco = await pool.query(
      `SELECT id, public_slug, website_published, legal_name, public_name
         FROM activeclinic.healthcare_organizations WHERE organization_id = $1`,
      [orgId]
    ).catch(() => ({ rows: [] }));
    const apps = await pool.query(
      `SELECT id, application_number, status, provisioning_status, organization_id
         FROM activeclinic.clinic_registration_applications
        WHERE organization_id = $1 OR contact_email_normalized = $2
        ORDER BY created_at DESC LIMIT 5`,
      [orgId, AC_EMAIL.toLowerCase()]
    ).catch(async () =>
      pool.query(
        `SELECT id, application_number, status, provisioning_status, organization_id, contact_email
           FROM activeclinic.clinic_registration_applications
          WHERE organization_id = $1 OR lower(contact_email) = $2
          ORDER BY created_at DESC LIMIT 5`,
        [orgId, AC_EMAIL.toLowerCase()]
      )
    );
    acDetail = {
      org: acOrg.rows[0],
      identities: acIdent.rowCount,
      identity: acIdent.rows[0]
        ? {
            id: acIdent.rows[0].id,
            emailDomain: AC_EMAIL.split("@")[1],
            phonePrefix: String(acIdent.rows[0].phone_normalized || "").slice(0, 6),
            status: acIdent.rows[0].status,
          }
        : null,
      staff: staff.rows.map((r) => ({
        id: r.id,
        status: r.status,
        roles: r.roles,
        identityMatch: r.platform_identity_id === (acIdent.rows[0] && acIdent.rows[0].id),
      })),
      facilities: facilities.rows,
      healthcare: hco.rows,
      applications: apps.rows.map((r) => ({
        id: r.id,
        application_number: r.application_number,
        status: r.status,
        provisioning_status: r.provisioning_status,
        organization_id: r.organization_id,
      })),
    };
  }

  let bbDetail = null;
  if (bbOrg.rows[0]) {
    const orgId = bbOrg.rows[0].id;
    // V7 branches are church-scoped (church_id); organization_id is on churches.
    const branches = await pool.query(
      `SELECT b.id, b.branch_key, b.display_name, b.is_primary, b.status, b.church_id
         FROM blessboard.branches b
         JOIN blessboard.churches c ON c.id = b.church_id
        WHERE c.organization_id = $1`,
      [orgId]
    );
    const roles = bbUser.rows[0]
      ? await pool.query(
          `SELECT organization_id, role_key, status FROM blessboard.user_roles
            WHERE user_id = $1 AND status = 'active'`,
          [bbUser.rows[0].id]
        )
      : { rows: [] };
    const church = await pool.query(
      `SELECT id, name, organization_id FROM blessboard.churches WHERE organization_id = $1 LIMIT 3`,
      [orgId]
    ).catch(() => ({ rows: [] }));
    const apps = await pool.query(
      `SELECT id, public_registration_reference, application_status, provisioning_status,
              organization_id, last_provision_stage, provisioning_error_detail
         FROM blessboard.platform_church_registration_applications
        WHERE organization_id = $1 OR lower(contact_email) = $2
        ORDER BY created_at DESC LIMIT 5`,
      [orgId, BB_EMAIL.toLowerCase()]
    );
    const website = await pool.query(
      `SELECT id, organization_id, status, public_path
         FROM platform.website_instances WHERE organization_id = $1 LIMIT 5`,
      [orgId]
    ).catch(() => ({ rows: [] }));
    bbDetail = {
      org: bbOrg.rows[0],
      users: bbUser.rowCount,
      user: bbUser.rows[0]
        ? {
            id: bbUser.rows[0].id,
            emailDomain: BB_EMAIL.split("@")[1],
            phonePrefix: String(bbUser.rows[0].phone_normalized || "").slice(0, 6),
            status: bbUser.rows[0].status,
          }
        : null,
      identities: bbIdent.rowCount,
      roles: roles.rows,
      branches: branches.rows,
      churches: church.rows,
      applications: apps.rows.map((r) => ({
        id: r.id,
        ref: r.public_registration_reference,
        application_status: r.application_status,
        provisioning_status: r.provisioning_status,
        organization_id: r.organization_id,
        last_provision_stage: r.last_provision_stage,
        error: r.provisioning_error_detail,
      })),
      websites: website.rows,
    };
  }

  const dep = await pool.query(
    `SELECT deployment_code, status, canonical_domain, session_cookie_name
       FROM platform.deployments WHERE deployment_code = 'moovex-platform-production'`
  );

  return {
    ac: acDetail,
    bb: bbDetail,
    deploymentRow: dep.rows[0] || null,
    orgCountForStamp: acOrg.rowCount + bbOrg.rowCount,
  };
}

function passLabel(ok, pass, fail) {
  return ok ? pass : fail;
}

async function main() {
  if (String(process.env.PLATFORM_DEPLOYMENT_CODE) !== "moovex-platform-production") {
    console.error("Refusing: PLATFORM_DEPLOYMENT_CODE must be moovex-platform-production");
    process.exit(2);
  }
  if (String(process.env.DEPLOYMENT_ENV).toLowerCase() !== "production") {
    console.error("Refusing: DEPLOYMENT_ENV must be production");
    process.exit(2);
  }

  const report = {
    kind: "PRODUCTION_CONTROLLED_WRITE_QA",
    startedAt: new Date().toISOString(),
    expectedSha: EXPECTED_SHA,
    stamp: STAMP,
    qaNames: { ac: AC_ORG_NAME, bb: BB_ORG_NAME, bbOrgKey: BB_ORG_KEY },
    emails: { acDomain: AC_EMAIL.split("@")[1], bbDomain: BB_EMAIL.split("@")[1] },
    phones: { acPrefix: "+26097…", bbPrefix: "+26096…" },
    defects: [],
    knownDebtImpact: [],
  };

  const pool = new Pool(buildFoundationPoolConfig(requireDatabaseUrl(), { max: 4 }));
  const browser = await chromium.launch({ headless: true });

  try {
    const identity = await checkDatabaseIdentity(pool, { identityKey: "moovex-platform-v7" });
    report.dbIdentity = {
      ok: identity.ok === true,
      identity_key: identity.row && identity.row.identity_key,
      environment_code: identity.row && identity.row.environment_code,
    };

    const acHealth = await fetchJson(`${AC}/healthz`);
    const bbHealth = await fetchJson(`${BB}/healthz`);
    report.hostedSha = {
      ac: acHealth.json && acHealth.json.gitSha,
      bb: bbHealth.json && bbHealth.json.gitSha,
      match:
        shaOk(acHealth.json && acHealth.json.gitSha) &&
        shaOk(bbHealth.json && bbHealth.json.gitSha),
    };

    report.baseline = await counts(pool);
    report.baselineLabel = "PRODUCTION_WRITE_QA_BASELINE_CAPTURED";

    const acBag = { consoleErrors: [], pageErrors: [], badResponses: [] };
    const bbBag = { consoleErrors: [], pageErrors: [], badResponses: [] };

    const acCtx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      ignoreHTTPSErrors: true,
    });
    const acPage = await acCtx.newPage();
    await attachCollectors(acPage, acBag);

    // AC registration
    report.ac = { registration: null, retry: null, emailLogin: null, phoneLogin: null, authSmoke: null, publicWebsite: null };
    report.ac.registration = await registerAc(acPage);
    console.error("AC registration", JSON.stringify(report.ac.registration));

    await logout(acPage, AC);
    report.ac.retry = await registerAc(acPage);
    console.error("AC retry", JSON.stringify(report.ac.retry));

    await logout(acPage, AC);
    report.ac.emailLogin = await login(acPage, AC, AC_EMAIL, "email");
    report.ac.emailLogin.cookies = await cookieAudit(acCtx, "activeclinic.org");
    console.error("AC email login", JSON.stringify({ url: report.ac.emailLogin.url, stillLogin: report.ac.emailLogin.stillLogin, cookies: report.ac.emailLogin.cookies }));

    const acAuthRoutes = ["/app", "/app/", "/settings", "/settings/website", "/settings/access", "/website", "/website/settings"];
    // discover workable routes from current landing
    report.ac.authSmoke = {
      landing: { url: acPage.url(), title: report.ac.emailLogin.title },
      routes: await smokeRoutes(acPage, AC, acAuthRoutes, "activeclinic"),
    };
    // also try common portal paths if /app redirected
    const extraAc = ["/portal", "/dashboard", "/hq"];
    report.ac.authSmoke.routes.push(...(await smokeRoutes(acPage, AC, extraAc, "activeclinic")));

    await logout(acPage, AC);
    const afterLogoutAc = await cookieAudit(acCtx, "activeclinic.org-after-logout");
    report.ac.logoutCookies = afterLogoutAc;
    report.ac.phoneLogin = await login(acPage, AC, AC_PHONE_NATIONAL, "phone");
    report.ac.phoneLogin.cookies = await cookieAudit(acCtx, "activeclinic.org-phone");
    console.error("AC phone login", JSON.stringify({ url: report.ac.phoneLogin.url, stillLogin: report.ac.phoneLogin.stillLogin }));

    // public website probe from DB later; try slug guess
    const createdMid = await inspectCreated(pool);
    const acSlug =
      (createdMid.ac &&
        createdMid.ac.healthcare &&
        createdMid.ac.healthcare[0] &&
        (createdMid.ac.healthcare[0].public_slug || createdMid.ac.org.organization_key)) ||
      (createdMid.ac && createdMid.ac.org && createdMid.ac.org.organization_key);
    if (acSlug) {
      const pub = await acPage.goto(`${AC}/clinics/${acSlug}`, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      }).catch((e) => ({ status: () => 0, err: e }));
      const status = pub && typeof pub.status === "function" ? pub.status() : 0;
      const html = await acPage.content().catch(() => "");
      report.ac.publicWebsite = {
        url: acPage.url(),
        status,
        title: await acPage.title().catch(() => ""),
        hasQaName: html.includes(AC_ORG_NAME),
        testing: /\.pronline\.org/i.test(html),
        blessboardBleed: /BlessBoard Church|data-brand="blessboard"/i.test(html),
      };
    } else {
      report.ac.publicWebsite = { skipped: true, reason: "no_slug_yet" };
    }

    await acCtx.close();

    // BB flows
    const bbCtx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      ignoreHTTPSErrors: true,
    });
    const bbPage = await bbCtx.newPage();
    await attachCollectors(bbPage, bbBag);
    report.bb = { registration: null, retry: null, emailLogin: null, phoneLogin: null, authSmoke: null, publicWebsite: null };

    report.bb.registration = await registerBb(bbPage);
    console.error("BB registration", JSON.stringify(report.bb.registration));

    await logout(bbPage, BB);
    report.bb.retry = await registerBb(bbPage);
    console.error("BB retry", JSON.stringify(report.bb.retry));

    await logout(bbPage, BB);
    report.bb.emailLogin = await login(bbPage, BB, BB_EMAIL, "email");
    report.bb.emailLogin.cookies = await cookieAudit(bbCtx, "blessboard.com");
    console.error("BB email login", JSON.stringify({ url: report.bb.emailLogin.url, stillLogin: report.bb.emailLogin.stillLogin, cookies: report.bb.emailLogin.cookies }));

    const bbAuthRoutes = [
      "/hq",
      "/home",
      "/portal",
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
    ];
    report.bb.authSmoke = {
      landing: { url: bbPage.url(), title: report.bb.emailLogin.title },
      routes: await smokeRoutes(bbPage, BB, bbAuthRoutes, "blessboard"),
    };

    await logout(bbPage, BB);
    report.bb.logoutCookies = await cookieAudit(bbCtx, "blessboard.com-after-logout");
    report.bb.phoneLogin = await login(bbPage, BB, BB_PHONE_NATIONAL, "phone");
    report.bb.phoneLogin.cookies = await cookieAudit(bbCtx, "blessboard.com-phone");
    console.error("BB phone login", JSON.stringify({ url: report.bb.phoneLogin.url, stillLogin: report.bb.phoneLogin.stillLogin }));

    const created = await inspectCreated(pool);
    report.created = created;

    // public church URL
    const churchId = created.bb && created.bb.churches && created.bb.churches[0] && created.bb.churches[0].id;
    const orgKey = created.bb && created.bb.org && created.bb.org.organization_key;
    const publicCandidates = [];
    if (orgKey) publicCandidates.push(`${BB}/c/${orgKey}`);
    if (orgKey) publicCandidates.push(`${BB}/${orgKey}`);
    if (churchId) publicCandidates.push(`${BB}/c/${churchId}`);
    report.bb.publicWebsite = { tried: [], best: null };
    for (const u of publicCandidates) {
      const res = await bbPage.goto(u, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => null);
      const status = res ? res.status() : 0;
      const html = await bbPage.content().catch(() => "");
      const item = {
        url: bbPage.url(),
        status,
        title: await bbPage.title().catch(() => ""),
        hasQaName: html.includes(BB_ORG_NAME),
        testing: /\.pronline\.org/i.test(html),
        activeclinicBleed: /ActiveClinic/i.test(html) && !/Powered by/i.test(html),
      };
      report.bb.publicWebsite.tried.push(item);
      if (status === 200 && !report.bb.publicWebsite.best) report.bb.publicWebsite.best = item;
    }

    await bbCtx.close();

    report.after = await counts(pool);
    report.deltas = delta(report.baseline, report.after);
    report.browserErrors = { ac: acBag, bb: bbBag };

    // Score results
    const acRegOk =
      report.ac.registration &&
      (report.ac.registration.ready || report.ac.registration.successPath) &&
      !report.ac.registration.genericFailure &&
      created.ac &&
      created.ac.org;
    const acRetryOk =
      report.ac.retry &&
      (report.ac.retry.ready || report.ac.retry.already || report.ac.retry.successPath) &&
      !report.ac.retry.genericFailure &&
      created.ac &&
      created.ac.identities === 1 &&
      created.ac.staff.length === 1;
    const acEmailOk = report.ac.emailLogin && !report.ac.emailLogin.stillLogin;
    const acPhoneOk = report.ac.phoneLogin && !report.ac.phoneLogin.stillLogin;
    const acSmokeRoutes = (report.ac.authSmoke && report.ac.authSmoke.routes) || [];
    const acSmokeOk =
      acEmailOk &&
      acSmokeRoutes.some((r) => r.status === 200 && !r.loginLoop && r.status < 500) &&
      !acSmokeRoutes.some((r) => r.status >= 500);
    const acWebOk =
      report.ac.publicWebsite &&
      !report.ac.publicWebsite.skipped &&
      report.ac.publicWebsite.status === 200 &&
      !report.ac.publicWebsite.testing &&
      !report.ac.publicWebsite.blessboardBleed;

    const bbRegOk =
      report.bb.registration &&
      (report.bb.registration.ready || report.bb.registration.successPath) &&
      !report.bb.registration.genericFailure &&
      created.bb &&
      created.bb.org;
    const bbRetryOk =
      report.bb.retry &&
      (report.bb.retry.ready || report.bb.retry.already || report.bb.retry.successPath) &&
      !report.bb.retry.genericFailure &&
      created.bb &&
      created.bb.users === 1 &&
      created.bb.identities <= 1;
    const bbEmailOk = report.bb.emailLogin && !report.bb.emailLogin.stillLogin;
    const bbPhoneOk = report.bb.phoneLogin && !report.bb.phoneLogin.stillLogin;
    const bbSmokeRoutes = (report.bb.authSmoke && report.bb.authSmoke.routes) || [];
    const bbSmokeOk =
      bbEmailOk &&
      bbSmokeRoutes.some((r) => r.status === 200 && !r.loginLoop) &&
      !bbSmokeRoutes.some((r) => r.status >= 500 && !/find-a-church/i.test(r.path));
    const bbWebOk =
      report.bb.publicWebsite &&
      report.bb.publicWebsite.best &&
      report.bb.publicWebsite.best.status === 200 &&
      !report.bb.publicWebsite.best.testing;

    // Integrity
    const integrityIssues = [];
    if (report.deltas.patients !== 0) integrityIssues.push("patients_delta");
    if (report.deltas.appointments !== 0) integrityIssues.push("appointments_delta");
    if (typeof report.deltas.bookings === "number" && report.deltas.bookings !== 0) {
      integrityIssues.push("bookings_delta");
    }
    if (created.ac && created.ac.identities !== 1) integrityIssues.push("ac_identity_count");
    if (created.bb && created.bb.users !== 1) integrityIssues.push("bb_user_count");
    if (created.ac && created.ac.staff.length !== 1) integrityIssues.push("ac_staff_count");
    if (report.deltas.organizations < 1 || report.deltas.organizations > 2) {
      integrityIssues.push(`org_delta_${report.deltas.organizations}`);
    }
    // Expect +1 or +2 orgs depending on whether both succeeded
    const expectedOrgDelta = (acRegOk ? 1 : 0) + (bbRegOk ? 1 : 0);
    if (report.deltas.organizations !== expectedOrgDelta) {
      integrityIssues.push(`org_delta_expected_${expectedOrgDelta}_got_${report.deltas.organizations}`);
    }

    const sessionOk = (() => {
      const all = []
        .concat(report.ac.emailLogin?.cookies || [])
        .concat(report.ac.phoneLogin?.cookies || [])
        .concat(report.bb.emailLogin?.cookies || [])
        .concat(report.bb.phoneLogin?.cookies || []);
      const sid = all.filter((c) => /sid|session/i.test(c.name) && !/csrf/i.test(c.name));
      if (!sid.length) return { ok: false, reason: "no_session_cookie_observed" };
      const bad = sid.filter(
        (c) =>
          c.secure !== true ||
          c.httpOnly !== true ||
          !/^Lax$/i.test(String(c.sameSite || "")) ||
          c.testingName ||
          !/moovex_platform_production_sid/i.test(c.name)
      );
      return { ok: bad.length === 0, cookies: sid, bad };
    })();

    report.scorecards = {
      activeclinic: {
        registration: passLabel(acRegOk, "AC_PRODUCTION_REGISTRATION_PASS", "AC_PRODUCTION_REGISTRATION_FAIL"),
        retry: passLabel(acRetryOk, "AC_PRODUCTION_REGISTRATION_RETRY_PASS", "AC_PRODUCTION_REGISTRATION_RETRY_FAIL"),
        email_login: passLabel(acEmailOk, "AC_PRODUCTION_EMAIL_LOGIN_PASS", "AC_PRODUCTION_EMAIL_LOGIN_FAIL"),
        phone_login: passLabel(acPhoneOk, "AC_PRODUCTION_PHONE_LOGIN_PASS", "AC_PRODUCTION_PHONE_LOGIN_FAIL"),
        authenticated_app: passLabel(acSmokeOk, "AC_PRODUCTION_AUTH_SMOKE_PASS", "AC_PRODUCTION_AUTH_SMOKE_FAIL"),
        public_website: passLabel(acWebOk, "AC_PRODUCTION_PUBLIC_WEBSITE_PASS", acSlug ? "AC_PRODUCTION_PUBLIC_WEBSITE_FAIL" : "AC_PRODUCTION_PUBLIC_WEBSITE_SKIPPED"),
        db_integrity: null,
      },
      blessboard: {
        registration: passLabel(bbRegOk, "BB_PRODUCTION_REGISTRATION_PASS", "BB_PRODUCTION_REGISTRATION_FAIL"),
        retry: passLabel(bbRetryOk, "BB_PRODUCTION_REGISTRATION_RETRY_PASS", "BB_PRODUCTION_REGISTRATION_RETRY_FAIL"),
        email_login: passLabel(bbEmailOk, "BB_PRODUCTION_EMAIL_LOGIN_PASS", "BB_PRODUCTION_EMAIL_LOGIN_FAIL"),
        phone_login: passLabel(bbPhoneOk, "BB_PRODUCTION_PHONE_LOGIN_PASS", "BB_PRODUCTION_PHONE_LOGIN_FAIL"),
        authenticated_app: passLabel(bbSmokeOk, "BB_PRODUCTION_AUTH_SMOKE_PASS", "BB_PRODUCTION_AUTH_SMOKE_FAIL"),
        public_website: passLabel(bbWebOk, "BB_PRODUCTION_PUBLIC_WEBSITE_PASS", "BB_PRODUCTION_PUBLIC_WEBSITE_FAIL"),
        db_integrity: null,
      },
    };

    const integrityPass = integrityIssues.length === 0 && acRegOk && bbRegOk;
    report.scorecards.activeclinic.db_integrity = passLabel(
      integrityPass,
      "PRODUCTION_WRITE_QA_DB_INTEGRITY_PASS",
      "PRODUCTION_WRITE_QA_DB_INTEGRITY_FAIL"
    );
    report.scorecards.blessboard.db_integrity = report.scorecards.activeclinic.db_integrity;
    report.integrityIssues = integrityIssues;
    report.sessionSecurity = sessionOk;

    // Defects
    if (!created.deploymentRow) {
      report.defects.push({
        severity: "P0",
        product: "PLATFORM",
        route: "registration/provision",
        action: "provision tenant",
        expected: "moovex-platform-production deployment row present",
        actual: "missing",
        httpStatus: null,
        error: "deployment_not_found",
      });
    } else {
      report.knownDebtImpact.push({
        id: "missing_moovex_platform_production_row",
        was: "missing at smoke time",
        now: "inserted for write QA",
        impact: "Required for registration provisioning and deployment sessions; previously blocked BB provision (deployment_not_found)",
        severity_if_unfixed: "P0",
      });
    }

    if (!acRegOk) {
      report.defects.push({
        severity: "P1",
        product: "ACTIVECLINIC",
        route: "/register-clinic",
        action: "fresh registration",
        expected: "success ready=1 + org",
        actual: report.ac.registration,
        httpStatus: null,
        error: report.ac.registration && report.ac.registration.genericFailure ? "generic_failure" : "registration_incomplete",
      });
    }
    if (!bbRegOk) {
      report.defects.push({
        severity: "P1",
        product: "BLESSBOARD",
        route: "/register-church",
        action: "fresh registration",
        expected: "success ready=1 + org",
        actual: report.bb.registration,
        httpStatus: null,
        error: "registration_incomplete",
      });
    }
    if (acRegOk && !acEmailOk) {
      report.defects.push({
        severity: "P1",
        product: "ACTIVECLINIC",
        route: "/login",
        action: "email login",
        expected: "authenticated staff route",
        actual: report.ac.emailLogin && report.ac.emailLogin.url,
        httpStatus: null,
        error: "still_on_login",
      });
    }
    if (bbRegOk && !bbEmailOk) {
      report.defects.push({
        severity: "P1",
        product: "BLESSBOARD",
        route: "/login",
        action: "email login",
        expected: "authenticated portal",
        actual: report.bb.emailLogin && report.bb.emailLogin.url,
        httpStatus: null,
        error: "still_on_login",
      });
    }
    if (acRegOk && !acPhoneOk) {
      report.defects.push({
        severity: "P2",
        product: "ACTIVECLINIC",
        route: "/login",
        action: "phone login",
        expected: "authenticated",
        actual: report.ac.phoneLogin && report.ac.phoneLogin.url,
        httpStatus: null,
        error: "phone_login_failed",
      });
    }
    if (bbRegOk && !bbPhoneOk) {
      report.defects.push({
        severity: "P2",
        product: "BLESSBOARD",
        route: "/login",
        action: "phone login",
        expected: "authenticated",
        actual: report.bb.phoneLogin && report.bb.phoneLogin.url,
        httpStatus: null,
        error: "phone_login_failed",
      });
    }
    if (!sessionOk.ok && (acEmailOk || bbEmailOk)) {
      report.defects.push({
        severity: "P1",
        product: "PLATFORM",
        route: "session",
        action: "authenticated cookie audit",
        expected: "moovex_platform_production_sid Secure HttpOnly SameSite=Lax",
        actual: sessionOk,
        httpStatus: null,
        error: sessionOk.reason || "cookie_flags",
      });
    }

    report.retention = {
      ac: acRegOk
        ? {
            classification: "SAFE_TO_RETAIN_AS_PRODUCTION_QA_TENANT",
            organization_key: created.ac && created.ac.org && created.ac.org.organization_key,
            organization_id: created.ac && created.ac.org && created.ac.org.id,
            display_name: AC_ORG_NAME,
            email_domain: AC_EMAIL.split("@")[1],
          }
        : { classification: "CLEANUP_REQUIRED_BEFORE_PUBLIC_RELEASE", reason: "registration_failed_or_partial" },
      bb: bbRegOk
        ? {
            classification: "SAFE_TO_RETAIN_AS_PRODUCTION_QA_TENANT",
            organization_key: created.bb && created.bb.org && created.bb.org.organization_key,
            organization_id: created.bb && created.bb.org && created.bb.org.id,
            display_name: BB_ORG_NAME,
            email_domain: BB_EMAIL.split("@")[1],
          }
        : { classification: "CLEANUP_REQUIRED_BEFORE_PUBLIC_RELEASE", reason: "registration_failed_or_partial" },
      preexisting_bb_failed_application: {
        note: "Baseline already had 1 BB application (Test Church 01) with provision_failed/deployment_not_found — not created by this QA run",
        classification: "CLEANUP_REQUIRED_BEFORE_PUBLIC_RELEASE",
      },
    };

    const p0 = report.defects.filter((d) => d.severity === "P0");
    const p1 = report.defects.filter((d) => d.severity === "P1");
    const corePass =
      acRegOk &&
      acRetryOk &&
      acEmailOk &&
      bbRegOk &&
      bbRetryOk &&
      bbEmailOk &&
      integrityPass &&
      sessionOk.ok &&
      p0.length === 0 &&
      p1.length === 0;

    const gaps =
      !acPhoneOk ||
      !bbPhoneOk ||
      !acWebOk ||
      !bbWebOk ||
      !acSmokeOk ||
      !bbSmokeOk ||
      report.defects.some((d) => d.severity === "P2" || d.severity === "P3");

    if (!corePass || p0.length || p1.length) {
      report.verdict = "PRODUCTION_CONTROLLED_WRITE_QA_FAILED";
      report.nextAction =
        "Fix P0/P1 registration/login/session defects, confirm moovex-platform-production deployment row remains active, then re-run controlled write QA.";
    } else if (gaps) {
      report.verdict = "PRODUCTION_CONTROLLED_WRITE_QA_PASS_WITH_GAPS";
      report.nextAction =
        "Proceed to production release certification, resolve any FIX_BEFORE_PUBLIC_RELEASE items, and decide whether to retain or explicitly clean up the two dedicated production QA tenants.";
    } else {
      report.verdict = "PRODUCTION_CONTROLLED_WRITE_QA_PASS";
      report.nextAction =
        "Proceed to production release certification, resolve any FIX_BEFORE_PUBLIC_RELEASE items, and decide whether to retain or explicitly clean up the two dedicated production QA tenants.";
    }

    report.finishedAt = new Date().toISOString();
    // Ensure password never appears
    const text = JSON.stringify(report);
    if (text.includes(PASS)) {
      console.error("REFUSING_TO_PRINT_REPORT_PASSWORD_LEAK");
      process.exit(1);
    }
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.verdict === "PRODUCTION_CONTROLLED_WRITE_QA_FAILED" ? 4 : 0);
  } catch (err) {
    console.error(
      JSON.stringify(
        {
          verdict: "PRODUCTION_CONTROLLED_WRITE_QA_FAILED",
          error: String(err && err.message ? err.message : err).slice(0, 500),
        },
        null,
        2
      )
    );
    process.exit(1);
  } finally {
    await browser.close().catch(() => {});
    await pool.end().catch(() => {});
  }
}

main();
