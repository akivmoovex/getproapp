#!/usr/bin/env node
"use strict";

/**
 * One controlled BlessBoard production registration repro for
 * BB_PRODUCTION_REGISTRATION_INTERMITTENT_P1.
 *
 * Never prints passwords, cookie values, CSRF tokens, emails, or phones in full.
 *
 *   scripts/local/run-with-blessboard-env.sh production \
 *     node scripts/local/v7-bb-prod-reg-p1-repro.js
 */

const crypto = require("crypto");
const { chromium } = require("playwright");
const { Pool } = require("pg");
const { requireDatabaseUrl } = require("../../db/scripts/lib/databaseUrl");
const { buildFoundationPoolConfig } = require("../../db/scripts/lib/foundationPool");
const { checkDatabaseIdentity } = require("../../db/scripts/lib/databaseIdentity");

const EXPECTED_SHA = "3c2cd0384b09e7483e2feef6bd376e126eff7ea9";
const BB = "https://blessboard.com";
const PASS =
  process.env.QA_PASSWORD ||
  `GpQa!${crypto.randomBytes(9).toString("base64url")}9A`;
const STAMP = crypto.randomBytes(3).toString("hex");
const BB_ORG_NAME = `BlessBoard P1 Repro ${STAMP}`;
const BB_EMAIL = `prod.p1.bb.${STAMP}@getproapp.org`;
const BB_PHONE_NATIONAL = `96${String(5300000 + (parseInt(STAMP, 16) % 899999))
  .padStart(7, "0")
  .slice(-7)}`;

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

async function counts(pool) {
  const q = async (sql) => Number((await pool.query(sql)).rows[0].n);
  return {
    organizations: await q(`SELECT count(*)::int AS n FROM platform.organizations`),
    identities: await q(`SELECT count(*)::int AS n FROM platform.identities`),
    bb_registration_applications: await q(
      `SELECT count(*)::int AS n FROM blessboard.platform_church_registration_applications`
    ),
    bb_users: await q(`SELECT count(*)::int AS n FROM blessboard.users`),
    bb_branches: await q(`SELECT count(*)::int AS n FROM blessboard.branches`),
    bb_website_instances: await q(
      `SELECT count(*)::int AS n FROM platform.website_instances WHERE product_code = 'blessboard'`
    ),
  };
}

function cookieNames(context, url) {
  return context.cookies(url).then((cookies) =>
    cookies.map((c) => ({
      name: c.name,
      domain: c.domain,
      secure: c.secure === true,
      httpOnly: c.httpOnly === true,
      sameSite: c.sameSite,
    }))
  );
}

function sanitizeBody(text) {
  const raw = String(text || "");
  const alert =
    (raw.match(/bb-apex-register-alert[\s\S]{0,400}/i) || [""])[0]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240);
  const fieldErr =
    (raw.match(/bb-apex-register-field-error[\s\S]{0,200}/i) || [""])[0]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
  const step = (raw.match(/data-bb-register-step="([^"]+)"/) || [null, null])[1];
  const title = (raw.match(/<h2[^>]*>([^<]+)<\/h2>/) || [null, null])[1];
  return {
    contentTypeHint: raw.includes("<html") ? "html" : "other",
    wizardStep: step,
    heading: title,
    alertText: alert || null,
    fieldErrorText: fieldErr || null,
    alertEmpty: Boolean(raw.includes("bb-apex-register-alert") && !alert.replace(/bb-apex-register-alert/i, "").trim()),
    hasGenericSave: /could not save your request/i.test(raw),
    hasGenericProvision: /could not finish creating your church workspace/i.test(raw),
    hasCsrf: /security token/i.test(raw),
    hasSuccess: /register-church\/success|workspace is ready|Church ID/i.test(raw),
  };
}

async function attachNetwork(page, bag) {
  page.on("response", async (res) => {
    const req = res.request();
    const url = res.url();
    if (!/blessboard\.com\/register-church/i.test(url)) return;
    const headers = res.headers();
    let bodySanitized = null;
    try {
      if ((headers["content-type"] || "").includes("text/html")) {
        const text = await res.text();
        bodySanitized = sanitizeBody(text);
      }
    } catch {
      bodySanitized = { parse: "unavailable" };
    }
    bag.push({
      method: req.method(),
      url: url.split("?")[0],
      query: url.includes("?") ? url.slice(url.indexOf("?") + 1, url.indexOf("?") + 80) : null,
      status: res.status(),
      location: headers.location || null,
      contentType: headers["content-type"] || null,
      requestId: headers["x-request-id"] || null,
      workerPid: headers["x-worker-pid"] || headers["x-pid"] || null,
      redirectedFrom: req.redirectedFrom() ? req.redirectedFrom().url().split("?")[0] : null,
      body: bodySanitized,
    });
  });
}

async function visibleError(page) {
  return page.evaluate(() => {
    const alerts = Array.from(document.querySelectorAll('[role="alert"], .bb-apex-register-alert, .bb-apex-register-field-error'));
    return alerts.map((el) => (el.innerText || "").trim()).filter(Boolean);
  });
}

async function fillChurch(page, name) {
  await page.locator("#register_church_name, input[name='church_name']").first().fill(name);
  const country = page.locator("select[name='country'], #register_country");
  if (await country.count()) {
    await country.first().selectOption({ label: "Zambia" }).catch(async () => {
      await country.first().selectOption("ZM").catch(() => {});
    });
  }
  await page.locator("#register_city, input[name='city']").first().fill("Lusaka");
  const branch = page.locator("#register_branch_name, input[name='branch_name']");
  if (await branch.count()) await branch.first().fill("HQ Campus");
  await page.locator('button[name="action"][value="next-church"]').first().click();
  await page.waitForSelector('form[data-bb-register-step="administrator"]', { timeout: 30000 });
}

async function fillAdmin(page) {
  await page.locator("#register_contact_name, input[name='contact_name']").first().fill("BB P1 Repro Admin");
  await page.locator("#register_email, input[name='email']").first().fill(BB_EMAIL);
  await page.locator("#register_phone_national, input[name='phone_national']").first().fill(BB_PHONE_NATIONAL);
  const role = page.locator(
    "#register_role, #register_role_in_church, select[name='role_in_church'], input[name='role_in_church']"
  );
  if (await role.count()) {
    const tag = await role.first().evaluate((el) => el.tagName.toLowerCase());
    if (tag === "select") await role.first().selectOption({ index: 1 }).catch(() => {});
    else await role.first().fill("Administrator");
  }
  await page.locator("#register_password, input[name='password']").first().fill(PASS);
  const confirm = page.locator("#register_password_confirm, input[name='password_confirm']");
  if (await confirm.count()) await confirm.first().fill(PASS);
  await page.locator('button[name="action"][value="next-admin"]').first().click();
  await page.waitForSelector('form[data-bb-register-step="review"]', { timeout: 30000 });
}

async function submitReview(page) {
  await page.waitForSelector('form[data-bb-register-step="review"]', { timeout: 15000 });
  const consents = page.locator(
    "form[data-bb-register-step='review'] input[name='registration_consent'], form[data-bb-register-step='review'] input[name='consent_contact']"
  );
  const n = await consents.count();
  for (let i = 0; i < n; i += 1) {
    const el = consents.nth(i);
    if (!(await el.isChecked().catch(() => false))) {
      await el.check({ force: true }).catch(() => {});
    }
  }
  const submit = page.locator('form[data-bb-register-step="review"] button[type="submit"]').first();
  await Promise.all([
    page.waitForURL(/register-church\/(success|review)|\/hq|ready=/i, { timeout: 120000 }).catch(() => null),
    submit.click(),
  ]);
}

async function inspectCreated(pool) {
  const apps = await pool.query(
    `SELECT id, created_at, updated_at, application_status, provisioning_status,
            provisioning_error_code, last_provision_stage, public_registration_reference,
            organization_id, church_name
       FROM blessboard.platform_church_registration_applications
      WHERE church_name = $1
      ORDER BY created_at ASC`,
    [BB_ORG_NAME]
  );
  const orgs = await pool.query(
    `SELECT id, organization_key, display_name, status, data_environment, created_at
       FROM platform.organizations WHERE display_name = $1`,
    [BB_ORG_NAME]
  );
  const users = await pool.query(
    `SELECT count(*)::int AS n FROM blessboard.users WHERE email_normalized = $1`,
    [BB_EMAIL.toLowerCase()]
  );
  return {
    applications: apps.rows,
    organizations: orgs.rows,
    userCount: users.rows[0].n,
    email: maskEmail(BB_EMAIL),
  };
}

async function main() {
  const pool = new Pool(buildFoundationPoolConfig(requireDatabaseUrl(), { max: 2 }));
  const report = {
    kind: "BB_PRODUCTION_REGISTRATION_P1_REPRO",
    startedAt: new Date().toISOString(),
    stamp: STAMP,
    churchName: BB_ORG_NAME,
    email: maskEmail(BB_EMAIL),
  };

  try {
    const identity = await checkDatabaseIdentity(pool, { identityKey: "moovex-platform-v7" });
    report.dbIdentity = {
      ok: identity.ok,
      identity_key: identity.row && identity.row.identity_key,
      environment_code: identity.row && identity.row.environment_code,
    };
    const health = await fetch(`${BB}/healthz`).then((r) => r.json());
    report.hosted = {
      gitSha: health.gitSha,
      shaOk: shaOk(health.gitSha),
      deploymentCode: health.deploymentCode,
      schemaCompatibility: health.schemaCompatibility && health.schemaCompatibility.code,
    };
    const dep = await pool.query(
      `SELECT deployment_code, status, application_code
         FROM platform.deployments WHERE deployment_code = 'moovex-platform-production'`
    );
    report.deploymentRow = dep.rows[0] || null;
    report.countsBefore = await counts(pool);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on("dialog", (dialog) => dialog.accept().catch(() => {}));
    const network = [];
    await attachNetwork(page, network);

    await page.goto(`${BB}/register-church?plan=foundation`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    report.stage1 = {
      url: page.url(),
      status: 200,
      cookies: await cookieNames(context, BB),
      csrfCookiePresent: (await cookieNames(context, BB)).some((c) => /csrf/i.test(c.name)),
      draftCookiePresent: (await cookieNames(context, BB)).some((c) => c.name === "bb_reg_draft"),
    };

    await fillChurch(page, BB_ORG_NAME);
    report.stage2 = {
      url: page.url(),
      step: await page.getAttribute("[data-bb-register-step]", "data-bb-register-step"),
      cookies: await cookieNames(context, BB),
      draftCookiePresent: (await cookieNames(context, BB)).some((c) => c.name === "bb_reg_draft"),
      passwordVaultPresent: (await cookieNames(context, BB)).some((c) => c.name === "bb_reg_pwd"),
      visibleErrors: await visibleError(page),
    };

    await fillAdmin(page);
    report.stage3 = {
      url: page.url(),
      step: await page.getAttribute("[data-bb-register-step]", "data-bb-register-step"),
      cookies: await cookieNames(context, BB),
      draftCookiePresent: (await cookieNames(context, BB)).some((c) => c.name === "bb_reg_draft"),
      passwordVaultPresent: (await cookieNames(context, BB)).some((c) => c.name === "bb_reg_pwd"),
      visibleErrors: await visibleError(page),
    };

    const finalStarted = Date.now();
    await submitReview(page);
    const finalMs = Date.now() - finalStarted;
    const finalPosts = network.filter((n) => n.method === "POST");
    const lastPost = finalPosts[finalPosts.length - 1] || null;
    report.firstAttempt = {
      durationMs: finalMs,
      url: page.url(),
      visibleErrors: await visibleError(page),
      lastPost,
      success: /register-church\/success/i.test(page.url()),
      html: sanitizeBody(await page.content()),
    };

    if (!report.firstAttempt.success) {
      await submitReview(page);
      report.retryAttempt = {
        url: page.url(),
        visibleErrors: await visibleError(page),
        success: /register-church\/success/i.test(page.url()),
        html: sanitizeBody(await page.content()),
      };
    }

    report.network = network;
    report.countsAfter = await counts(pool);
    report.created = await inspectCreated(pool);
    await browser.close();

    const apps = report.created.applications;
    if (!apps.length) report.firstAttemptWrite = "FIRST_ATTEMPT_ZERO_WRITE";
    else if (apps.length === 1 && apps[0].provisioning_status === "provisioned") {
      report.firstAttemptWrite = report.firstAttempt.success
        ? "FIRST_ATTEMPT_FULL_WRITE"
        : "FIRST_ATTEMPT_FULL_WRITE_RESPONSE_FAILED";
    } else if (apps.some((a) => a.provisioning_status !== "provisioned") || apps.length > 1) {
      report.firstAttemptWrite = "FIRST_ATTEMPT_PARTIAL_WRITE";
    } else {
      report.firstAttemptWrite = "FIRST_ATTEMPT_STATE_UNKNOWN";
    }
  } catch (err) {
    report.error = String(err && err.message ? err.message : err).slice(0, 400);
  } finally {
    await pool.end();
  }

  report.finishedAt = new Date().toISOString();
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err.message || err).slice(0, 300) }));
  process.exit(1);
});
