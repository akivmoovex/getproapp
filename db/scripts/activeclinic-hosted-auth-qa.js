#!/usr/bin/env node
"use strict";

/**
 * Testing-only hosted authenticated QA for ActiveClinic.
 *
 *   scripts/local/run-with-blessboard-env.sh testing \
 *     npm run activeclinic:hosted-auth-qa:testing -- --confirm
 *
 * Provisions a disposable clinic, exercises hosted /login and /app against
 * https://activeclinic.pronline.org, then purges the organization.
 * Never prints passwords, cookies, or tokens.
 */

const {
  resolveDatabaseUrlSafe,
  requireMatchedIdentity,
  redactSecretsDeep,
  assertNoSecretsInText,
  createProvisionPool,
  parseWriteMode,
} = require("./lib/provisionCliSafety");
const {
  TOOL,
  EXPECTED_IDENTITY_KEY,
  EXPECTED_DB_ENV,
  provisionHostedAuthQaClinic,
  cleanupHostedAuthQaClinic,
  publicFixtureRecord,
  hostedQaEnv,
} = require("../../src/activeclinic/qa/activeClinicHostedAuthQaFixture");
const {
  CSRF_FIELD,
  SESSION_COOKIE,
  CSRF_COOKIE,
  createHostedClient,
  extractCsrfField,
  extractMatch,
} = require("../../src/activeclinic/qa/activeClinicHostedAuthQaClient");

const DEFAULT_BASE = "https://activeclinic.pronline.org";
const FORBIDDEN_WIDGETS = [
  "Lab Results",
  "Medications",
  "Messages",
  "Join Call",
  "Medical Records",
  "Sign in with Google",
  "Sign in with Apple",
];

function parseArgs(argv) {
  const mode = parseWriteMode(argv);
  let baseUrl = DEFAULT_BASE;
  let repeat = false;
  for (const arg of mode.rest) {
    if (arg.startsWith("--base-url=")) baseUrl = arg.slice("--base-url=".length);
    if (arg === "--repeat") repeat = true;
  }
  return {
    dryRun: mode.dryRun,
    confirm: mode.confirm,
    baseUrl: String(baseUrl || DEFAULT_BASE).replace(/\/$/, ""),
    repeat,
  };
}

function emit(obj) {
  const text = JSON.stringify(redactSecretsDeep(obj), null, 2);
  assertNoSecretsInText(text);
  // eslint-disable-next-line no-console
  console.log(text);
}

function record(checks, name, ok, extra) {
  checks[name] = { ok: ok === true, ...(extra && typeof extra === "object" ? extra : {}) };
}

function pageFlags(html) {
  const text = String(html || "");
  return {
    otp: /6-digit|verification code/i.test(text),
    sso: /Sign in with Google|Sign in with Apple|Continue with Google/i.test(text),
    theme: /\bTheme customization\b|\bstaging URL\b/i.test(text),
    labs: /Lab Results/i.test(text),
    medications: /\bMedications\b|\bRequest Refill\b/i.test(text),
    telehealth: /Join Call|telehealth/i.test(text),
    mf11: /Medical Records/i.test(text),
  };
}

async function measureOverflow(baseUrl, path, cookies, viewport) {
  let browser;
  try {
    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: viewport || { width: 390, height: 844 },
    });
    const cookieHeader = cookies || "";
    const parsed = [];
    for (const part of cookieHeader.split(";").map((s) => s.trim()).filter(Boolean)) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      parsed.push({
        name: part.slice(0, eq),
        value: part.slice(eq + 1),
        domain: "activeclinic.pronline.org",
        path: "/",
        secure: true,
        httpOnly: true,
      });
    }
    if (parsed.length) await context.addCookies(parsed);
    const page = await context.newPage();
    const res = await page.goto(`${baseUrl}${path}`, { waitUntil: "load", timeout: 45000 });
    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const overflow = Math.max(doc.scrollWidth, document.body.scrollWidth) > doc.clientWidth + 2;
      return { overflow, width: doc.clientWidth, title: document.title };
    });
    return {
      ok: Boolean(res && res.status() < 400 && metrics.overflow === false),
      status: res ? res.status() : 0,
      overflow: metrics.overflow,
      width: metrics.width,
    };
  } catch (err) {
    return { ok: false, error: err && err.message ? String(err.message).slice(0, 180) : "playwright_failed" };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function runHostedPass(client, fixture) {
  const checks = {};
  const mobile = { mf05: null, mf06: null, mf07: null, mf09: null };
  const clinicPath = `/clinics/${fixture.clinicKey}`;

  const loginGet = await client.get("/login");
  record(checks, "staffLoginGet", loginGet.status === 200, { status: loginGet.status });
  const csrf = extractCsrfField(loginGet.text) || client.jar.csrf();
  const loginPost = await client.postForm("/login", {
    [CSRF_FIELD]: csrf,
    identifier: fixture.adminEmail,
    password: fixture.password,
  });
  const afterLogin = await client.follow(loginPost);
  record(checks, "staffLoginPost", loginPost.status === 303 && client.jar.sessionPresent(), {
    status: loginPost.status,
    location: loginPost.location ? String(loginPost.location).split("?")[0] : "",
    sessionCookie: client.jar.has(SESSION_COOKIE),
    csrfCookie: client.jar.has(CSRF_COOKIE),
  });
  record(checks, "clinicSelector", /select-organization/i.test(loginPost.location || "") === false, {
    location: loginPost.location ? String(loginPost.location).split("?")[0] : "",
  });

  const dashboard = afterLogin.status === 200 ? afterLogin : await client.get("/app");
  record(checks, "staffDashboard", dashboard.status === 200 && /ac-app|data-ac-shell/i.test(dashboard.text), {
    status: dashboard.status,
  });

  const onboarding = await client.get("/app/onboarding");
  record(checks, "onboarding", onboarding.status === 200 && /data-ac-mf-family="MF05"/i.test(onboarding.text), {
    status: onboarding.status,
  });

  const website = await client.get("/app/settings/website");
  record(checks, "websiteHub", website.status === 200 && !/Theme customization|staging URL/i.test(website.text), {
    status: website.status,
  });
  const websitePages = await client.get("/app/settings/website/pages");
  record(checks, "websitePages", websitePages.status === 200, { status: websitePages.status });
  const websitePublish = await client.get("/app/settings/website/publish");
  record(checks, "websitePublishGet", websitePublish.status === 200, { status: websitePublish.status });

  const invite = await client.get("/app/staff/invite");
  record(checks, "staffInviteGet", invite.status === 200 && /data-ac-page-section="staff-invite"|Continue to invite form/i.test(invite.text), {
    status: invite.status,
  });
  const inviteForm = await client.get("/app/staff/new?invite=1");
  record(checks, "staffInviteForm", inviteForm.status === 200 && /data-ac-mf-family="MF07"/i.test(inviteForm.text), {
    status: inviteForm.status,
  });
  const inviteCsrf = extractCsrfField(inviteForm.text);
  const facilityId = extractMatch(inviteForm.text, /name="facility_ids"[^>]*value="([^"]+)"/) ||
    extractMatch(inviteForm.text, /id="facility_ids"[^>]*value="([^"]+)"/);
  const roleKey =
    extractMatch(inviteForm.text, /name="role_keys"[^>]*value="(activeclinic_receptionist)"/) ||
    "activeclinic_receptionist";
  const formAction =
    extractMatch(inviteForm.text, /<form[^>]*action="([^"]+)"/) || "/app/staff";
  const invitePost = await client.postForm(formAction, {
    [CSRF_FIELD]: inviteCsrf,
    invite_mode: "1",
    first_name: "Qa",
    last_name: "Invitee",
    phone: `+26096${String(Date.now()).slice(-7)}`,
    email: `qa-invite-${Date.now().toString(36)}@example.invalid`,
    job_title: "Reception",
    employment_type: "permanent",
    facility_ids: facilityId,
    role_keys: roleKey,
    role_scope: "facility",
    role_facility_id: facilityId,
  });
  const inviteFollow = await client.follow(invitePost);
  const inviteHtml = `${invitePost.text || ""}\n${inviteFollow.text || ""}`;
  record(checks, "staffInviteCreate", invitePost.status < 400, {
    status: invitePost.status,
    gated: /not_production|EMAIL_INVITE_GATED|does not send automated invitation email/i.test(inviteHtml + inviteForm.text),
  });

  const staffCookieHeader = client.jar.header();
  mobile.mf05 = await measureOverflow(client.origin, "/app/onboarding", staffCookieHeader);
  mobile.mf06 = await measureOverflow(client.origin, "/app/settings/website", staffCookieHeader);
  mobile.mf07 = await measureOverflow(client.origin, "/app/staff/invite", staffCookieHeader);

  const publishCsrf = extractCsrfField(websitePublish.text);
  const publishAction =
    extractMatch(websitePublish.text, /id="ac-mw-publish-form"[^>]*action="([^"]+)"/) ||
    extractMatch(websitePublish.text, /data-ac-website-action="publish"[\s\S]*?action="([^"]+)"/) ||
    `${clinicPath}/website/publish`;
  if (publishCsrf && /canPublish|Publish All Changes/i.test(websitePublish.text)) {
    const published = await client.postForm(publishAction, {
      [CSRF_FIELD]: publishCsrf,
      makePublic: "1",
      returnTo: "/app/settings/website/publish",
    });
    record(checks, "websitePublish", published.status === 303 || published.status === 200, {
      status: published.status,
    });
  } else {
    record(checks, "websitePublish", false, { status: websitePublish.status, reason: "publish_cta_absent" });
  }

  const patientsNew = await client.get("/app/patients/new");
  record(checks, "staffPatientNewGet", patientsNew.status === 200, { status: patientsNew.status });
  const patientCsrf = extractCsrfField(patientsNew.text);
  const patientFacility =
    extractMatch(patientsNew.text, /id="facility_id"[\s\S]*?<option value="([^"]+)"/) || facilityId;
  const patientPhone = `+26095${String(Date.now()).slice(-7)}`;
  const patientFirst = "Hosted";
  const patientLast = `Qa${Date.now().toString(36).slice(-4)}`;
  const patientCreate = await client.postForm("/app/patients", {
    [CSRF_FIELD]: patientCsrf,
    step: "confirm",
    first_name: patientFirst,
    last_name: patientLast,
    phone: patientPhone,
    phone_country: "ZM",
    phone_national: patientPhone.replace("+260", ""),
    facility_id: patientFacility,
    registration_method: "walk_in",
    country_code: "ZM",
  });
  const patientCreatedFollow = await client.follow(patientCreate);
  record(checks, "staffPatientCreate", patientCreate.status === 303 || patientCreate.status === 200, {
    status: patientCreate.status,
    location: patientCreate.location ? String(patientCreate.location).split("?")[0] : "",
  });

  const staffLogout = await client.get("/logout");
  await client.follow(staffLogout);
  record(checks, "staffLogout", staffLogout.status === 303 || staffLogout.status === 200, {
    status: staffLogout.status,
    sessionCleared: client.jar.sessionPresent() === false,
  });

  const patientLoginGet = await client.get(`${clinicPath}/patient/login`);
  record(checks, "patientLoginGet", patientLoginGet.status === 200 || patientLoginGet.status === 403, {
    status: patientLoginGet.status,
  });

  let patientDashboard = { status: 0, text: "" };
  let patientRegister = { status: 0, text: "" };
  if (patientLoginGet.status === 200) {
    patientRegister = await client.get(`${clinicPath}/patient/register`);
    const regCsrf = extractCsrfField(patientRegister.text);
    const registerPost = await client.postForm(`${clinicPath}/patient/register`, {
      [CSRF_FIELD]: regCsrf,
      firstName: patientFirst,
      lastName: patientLast,
      phone: patientPhone,
      password: fixture.password,
    });
    record(checks, "patientRegistration", registerPost.status === 303 || registerPost.status === 200, {
      status: registerPost.status,
    });
    const pLogin = await client.get(`${clinicPath}/patient/login`);
    const pCsrf = extractCsrfField(pLogin.text);
    const pPost = await client.postForm(`${clinicPath}/patient/login`, {
      [CSRF_FIELD]: pCsrf,
      identifier: patientPhone,
      password: fixture.password,
    });
    const pFollow = await client.follow(pPost);
    record(checks, "patientLoginPost", pPost.status === 303 && client.jar.sessionPresent(), {
      status: pPost.status,
    });
    patientDashboard = pFollow.status === 200 ? pFollow : await client.get(`${clinicPath}/patient`);
    record(checks, "patientDashboard", patientDashboard.status === 200 && /data-ac-mf-family="MF09"|Patient Portal/i.test(patientDashboard.text), {
      status: patientDashboard.status,
    });
    const flags = pageFlags(patientDashboard.text);
    record(checks, "patientUnsupportedWidgetsAbsent", !flags.labs && !flags.medications && !flags.telehealth && !flags.mf11, flags);
    const patientApp = await client.get("/app");
    record(checks, "patientDeniedApp", patientApp.status === 303 || patientApp.status === 401 || patientApp.status === 403, {
      status: patientApp.status,
    });
    const profile = await client.get(`${clinicPath}/patient/profile`);
    record(checks, "patientProfile", profile.status === 200, { status: profile.status });
    mobile.mf09 = await measureOverflow(client.origin, `${clinicPath}/patient`, client.jar.header());
    const pLogout = await client.postForm(`${clinicPath}/patient/logout`, {
      [CSRF_FIELD]: extractCsrfField(patientDashboard.text),
    });
    record(checks, "patientLogout", pLogout.status === 303 || pLogout.status === 200, { status: pLogout.status });
  } else {
    record(checks, "patientRegistration", false, { reason: "clinic_not_public" });
    record(checks, "patientLoginPost", false, { reason: "clinic_not_public" });
    record(checks, "patientDashboard", false, { reason: "clinic_not_public" });
    record(checks, "patientProfile", false, { reason: "clinic_not_public" });
    record(checks, "patientDeniedApp", true, { reason: "skipped_unpublished" });
    record(checks, "patientLogout", false, { reason: "clinic_not_public" });
    record(checks, "patientUnsupportedWidgetsAbsent", true, { reason: "skipped_unpublished" });
  }

  const publicBook = await client.get(`${clinicPath}/book`);
  record(checks, "publicBooking", publicBook.status === 200, { status: publicBook.status });

  const deferred = pageFlags(`${loginGet.text}\n${website.text}\n${patientDashboard.text}\n${patientRegister.text}`);
  record(checks, "deferredFeaturesAbsent", !deferred.otp && !deferred.sso && !deferred.theme && !deferred.labs, deferred);

  return { checks, mobile };
}

async function runOnce(pool, args, env) {
  const fixture = await provisionHostedAuthQaClinic(pool, {}, env);
  if (!fixture.ok) {
    return { ok: false, phase: "provision", fixture: publicFixtureRecord(fixture), cleanup: null };
  }
  const client = createHostedClient(args.baseUrl);
  let checks = {};
  let mobile = {};
  try {
    const hosted = await runHostedPass(client, fixture);
    checks = hosted.checks;
    mobile = hosted.mobile;
  } catch (err) {
    checks.runnerError = {
      ok: false,
      message: err && err.message ? String(err.message).slice(0, 200) : "hosted_run_failed",
    };
  }
  const cleanup = await cleanupHostedAuthQaClinic(pool, fixture.organizationKey, env);
  return {
    ok: cleanup && cleanup.ok === true,
    fixture: publicFixtureRecord(fixture),
    checks,
    mobile,
    cleanup: {
      ok: Boolean(cleanup && cleanup.ok),
      status: cleanup && cleanup.status,
      reason: cleanup && cleanup.reason,
      deleted: cleanup && cleanup.deleted ? Object.keys(cleanup.deleted) : [],
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = resolveDatabaseUrlSafe();
  if (!url.ok) {
    emit({ ok: false, tool: TOOL, reason: url.message });
    process.exitCode = 2;
    return;
  }
  const pool = createProvisionPool(url.connectionString);
  try {
    const matched = await requireMatchedIdentity(pool);
    if (!matched.ok || matched.identityKey !== EXPECTED_IDENTITY_KEY) {
      emit({
        ok: false,
        tool: TOOL,
        reason: "expected_identity_not_moovex_platform_v7",
        identityKey: matched.identityKey || null,
      });
      process.exitCode = 2;
      return;
    }
    if (String(matched.environmentCode || "").toLowerCase() !== EXPECTED_DB_ENV) {
      emit({ ok: false, tool: TOOL, reason: "database_env_not_testing" });
      process.exitCode = 2;
      return;
    }
    if (args.dryRun) {
      emit({
        ok: true,
        tool: TOOL,
        dryRun: true,
        baseUrl: args.baseUrl,
        message: "Dry-run only. Pass --confirm to provision, test hosted auth, and purge.",
      });
      return;
    }

    const env = hostedQaEnv(process.env);
    const run1 = await runOnce(pool, args, env);
    const run2 = args.repeat ? await runOnce(pool, args, env) : null;
    emit({
      ok: Boolean(run1.ok && (!run2 || run2.ok)),
      tool: TOOL,
      baseUrl: args.baseUrl,
      hostedShaCheckedSeparately: true,
      run1,
      run2,
    });
    if (!(run1.ok && (!run2 || run2.ok))) process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((err) => {
  emit({
    ok: false,
    tool: TOOL,
    reason: "cli_error",
    message: err && err.message ? String(err.message) : "unknown_error",
  });
  process.exitCode = 1;
});
