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
    otp: /6-digit|Enter the code we sent|verification code input/i.test(text),
    sso: /Sign in with Google|Sign in with Apple|Continue with Google/i.test(text),
    theme: /\bTheme customization\b|\bstaging URL\b/i.test(text),
    labs: /data-ac-widget="labs"|href="[^"]*\/patient\/labs"|Request Lab/i.test(text),
    medications: /Request Refill|data-ac-widget="medications"|href="[^"]*\/patient\/medications"/i.test(text),
    telehealth: /Join Call|data-ac-widget="telehealth"/i.test(text),
    mf11: /data-ac-widget="records"|href="[^"]*\/patient\/records"/i.test(text),
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
        httpOnly: /_sid$/i.test(part.slice(0, eq)),
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

const REQUIRED_CHECKS = [
  "staffLoginGet",
  "staffLoginPost",
  "staffDashboard",
  "onboarding",
  "websiteHub",
  "websitePages",
  "staffInviteGet",
  "staffDeniedPatient",
  "staffLogout",
  "publicBooking",
  "bookingSubmit",
  "pendingCopy",
  "patientRegistration",
  "patientLoginPost",
  "patientDashboard",
  "patientDeniedApp",
  "patientProfile",
  "deferredFeaturesAbsent",
];

async function followPage(client, first) {
  let res = first;
  const seen = new Set();
  for (let i = 0; i < 4; i += 1) {
    if (res.status < 300 || res.status >= 400 || !res.location) break;
    const loc = String(res.location).replace(/^https?:\/\/[^/]+/i, "");
    if (/\/login(\?|$)/i.test(loc)) {
      res = { ...res, location: loc };
      break;
    }
    if (seen.has(loc)) break;
    seen.add(loc);
    res = await client.get(loc);
  }
  return res;
}

function getPage(client, path) {
  return client.get(path).then((first) => followPage(client, first));
}

async function getStaffPage(client, path) {
  let res = await getPage(client, path);
  if (res.status >= 300 && res.status < 400) {
    res = await getPage(client, path);
  }
  if (res.status === 303 && /\/login/i.test(String(res.location || ""))) {
    await getPage(client, "/app");
    res = await getPage(client, path);
  }
  return res;
}

function requiredPassed(checks) {
  return REQUIRED_CHECKS.every((name) => checks[name] && checks[name].ok === true);
}

async function runBookingContinuity(client, clinicPath, fixture) {
  const book = await client.get(`${clinicPath}/book`);
  if (book.status !== 200) {
    return { ok: false, reason: "book_not_available", status: book.status, html: book.text };
  }
  const serviceKey =
    fixture.serviceKey ||
    extractMatch(book.text, /name="serviceKey"[^>]*value="([^"]+)"/) ||
    extractMatch(book.text, /value="([^"]+)"[^>]*name="serviceKey"/) ||
    "";
  const bookCsrf = extractCsrfField(book.text);
  const toDoctor = await client.postForm(`${clinicPath}/book`, {
    [CSRF_FIELD]: bookCsrf,
    wizardAction: "continue",
    serviceKey,
  });
  await client.follow(toDoctor);
  const doctor = await client.get(`${clinicPath}/book/doctor`);
  const toSlot = await client.postForm(`${clinicPath}/book/doctor`, {
    [CSRF_FIELD]: extractCsrfField(doctor.text),
    doctorChoice: "any",
  });
  await client.follow(toSlot);
  const slot = await client.get(`${clinicPath}/book/slot`);
  const toPatient = await client.postForm(`${clinicPath}/book/slot`, {
    [CSRF_FIELD]: extractCsrfField(slot.text),
    preferredDate: "2030-09-01",
    preferredTime: "10:00",
    preferredStartsAt: "2030-09-01T10:00",
  });
  await client.follow(toPatient);
  const patientPage = await client.get(`${clinicPath}/book/patient`);
  const patientPhone = `+26095${String(Date.now()).slice(-7)}`;
  const patientFirst = "Hosted";
  const patientLast = `Qa${Date.now().toString(36).slice(-4)}`;
  const toReview = await client.postForm(`${clinicPath}/book/patient`, {
    [CSRF_FIELD]: extractCsrfField(patientPage.text),
    patientFirstName: patientFirst,
    patientLastName: patientLast,
    patientPhone,
    phone_country: "ZM",
    phone_national: patientPhone.replace(/^\+260/, ""),
    visitReason: "Hosted QA",
  });
  await client.follow(toReview);
  const review = await client.get(`${clinicPath}/book/review`);
  const idem = extractMatch(review.text, /name="idempotencyKey"[^>]*value="([^"]+)"/);
  const submitted = await client.postForm(`${clinicPath}/book/submit`, {
    [CSRF_FIELD]: extractCsrfField(review.text),
    idempotencyKey: idem,
  });
  const successHtml = submitted.text || "";
  const guestHref = extractMatch(successHtml, /href="([^"]*patient\/register\?guestToken=[^"]+)"/);
  return {
    ok: submitted.status === 200 && /Pending clinic confirmation/i.test(successHtml),
    status: submitted.status,
    pendingCopy: /Pending clinic confirmation/i.test(successHtml),
    registerHref: guestHref,
    patientPhone,
    patientFirst,
    patientLast,
    html: successHtml,
  };
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
    cookieNames: client.jar.names(),
    sessionCookie: client.jar.sessionPresent(),
    csrfCookie: client.jar.names().some((name) => /_csrf$/i.test(name)),
    cookieFlags: client.jar.flagSummaries(),
  });
  record(checks, "clinicSelector", /select-organization/i.test(loginPost.location || "") === false, {
    location: loginPost.location ? String(loginPost.location).split("?")[0] : "",
  });

  const dashboard = afterLogin.status === 200 ? afterLogin : await getStaffPage(client, "/app");
  record(checks, "staffDashboard", dashboard.status === 200 && /ac-app|data-ac-shell/i.test(dashboard.text), {
    status: dashboard.status,
  });

  const onboardingRaw = await client.get("/app/onboarding");
  const onboarding =
    onboardingRaw.status === 200
      ? onboardingRaw
      : await getStaffPage(client, "/app/onboarding");
  record(checks, "onboarding", onboarding.status === 200 && /data-ac-mf-family="MF05"/i.test(onboarding.text), {
    status: onboarding.status,
    firstStatus: onboardingRaw.status,
    firstLocation: onboardingRaw.location ? String(onboardingRaw.location).split("?")[0] : "",
  });

  const website = await getStaffPage(client, "/app/settings/website");
  record(checks, "websiteHub", website.status === 200 && !/Theme customization|staging URL/i.test(website.text), {
    status: website.status,
    location: website.location ? String(website.location).split("?")[0] : "",
  });
  const websitePages = await getStaffPage(client, "/app/settings/website/pages");
  record(checks, "websitePages", websitePages.status === 200, { status: websitePages.status });
  const websitePublish = await getStaffPage(client, "/app/settings/website/publish");
  record(checks, "websitePublishGet", websitePublish.status === 200, { status: websitePublish.status });

  const invite = await getStaffPage(client, "/app/staff/invite");
  record(checks, "staffInviteGet", invite.status === 200, {
    status: invite.status,
    location: invite.location ? String(invite.location).split("?")[0] : "",
  });
  const inviteForm = await getStaffPage(client, "/app/staff/new?invite=1");
  record(checks, "staffInviteForm", inviteForm.status === 200 && /data-ac-mf-family="MF07"/i.test(inviteForm.text), {
    status: inviteForm.status,
  });
  const inviteCsrf = extractCsrfField(inviteForm.text) || client.jar.csrf();
  const facilityId =
    extractMatch(inviteForm.text, /name="facility_ids"[^>]*value="([^"]+)"/) ||
    extractMatch(inviteForm.text, /value="([^"]+)"[^>]*name="facility_ids"/) ||
    extractMatch(inviteForm.text, /id="facility_ids"[^>]*value="([^"]+)"/);
  const roleKey =
    extractMatch(inviteForm.text, /name="role_keys"[^>]*value="(activeclinic_receptionist)"/) ||
    extractMatch(inviteForm.text, /name="role_keys"[^>]*value="([^"]+)"/) ||
    "activeclinic_receptionist";
  const formAction =
    extractMatch(inviteForm.text, /ac-staff-invite-mf__card"[^>]*action="([^"]+)"/) ||
    extractMatch(inviteForm.text, /action="(\/app\/staff[^"]*)"/) ||
    "/app/staff";
  const invitePhoneNational = `96${String(Date.now()).slice(-7)}`;
  const invitePost = await client.postForm(formAction, {
    [CSRF_FIELD]: inviteCsrf,
    invite_mode: "1",
    issue_invitation: "1",
    first_name: "Qa",
    last_name: "Invitee",
    phone: `+260${invitePhoneNational}`,
    phone_country: "ZM",
    phone_national: invitePhoneNational,
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
  const inviteCreated =
    (invitePost.status === 303 && !/\/login/i.test(invitePost.location || "")) ||
    (invitePost.status === 200 &&
      /Invitation created|activation link|data-ac-page-section="staff-invite-result"/i.test(inviteHtml) &&
      !/Please fix the following/i.test(inviteHtml));
  record(checks, "staffInviteCreate", inviteCreated, {
    status: invitePost.status,
    location: invitePost.location ? String(invitePost.location).split("?")[0] : "",
    gated: /not_production|EMAIL_INVITE_GATED|does not send automated invitation email/i.test(inviteHtml + inviteForm.text),
    fieldError: extractMatch(inviteHtml, /ac-field-error[^>]*>([^<]{1,80})/) ||
      extractMatch(inviteHtml, /ac-flash--error[\s\S]{0,180}<li>([^<]{1,80})/),
  });

  const staffCookieHeader = client.jar.header();
  mobile.mf05 = await measureOverflow(client.origin, "/app/onboarding", staffCookieHeader);
  mobile.mf06 = await measureOverflow(client.origin, "/app/settings/website", staffCookieHeader);
  mobile.mf07 = await measureOverflow(client.origin, "/app/staff/invite", staffCookieHeader);

  const websitePublishFresh = await getPage(client, "/app/settings/website/publish");
  const publishCsrf = extractCsrfField(websitePublishFresh.text) || client.jar.csrf();
  const publishAction =
    extractMatch(websitePublishFresh.text, /id="ac-mw-publish-form"[^>]*action="([^"]+)"/) ||
    extractMatch(websitePublishFresh.text, /data-ac-website-action="publish"[\s\S]*?action="([^"]+)"/) ||
    `${clinicPath}/website/publish`;
  if (publishCsrf && /canPublish|Publish All Changes/i.test(websitePublishFresh.text)) {
    const published = await client.postForm(publishAction, {
      [CSRF_FIELD]: publishCsrf,
      makePublic: "1",
      returnTo: "/app/settings/website/publish",
    });
    record(checks, "websitePublish", published.status === 303 || published.status === 200, {
      status: published.status,
      location: published.location ? String(published.location).split("?")[0] : "",
      code: extractMatch(published.text, /"code"\s*:\s*"([^"]+)"/),
    });
  } else {
    record(checks, "websitePublish", fixture.websitePublished === true, {
      status: websitePublishFresh.status,
      reason: fixture.websitePublished === true ? "fixture_published" : "publish_cta_absent",
    });
  }

  const staffOnPatient = await client.get(`${clinicPath}/patient`);
  record(checks, "staffDeniedPatient", staffOnPatient.status === 403 || staffOnPatient.status === 303, {
    status: staffOnPatient.status,
  });

  const staffLogout = await client.get("/logout");
  await client.follow(staffLogout);
  record(checks, "staffLogout", staffLogout.status === 303 || staffLogout.status === 200, {
    status: staffLogout.status,
    sessionCleared: client.jar.sessionPresent() === false,
  });

  const publicClient = createHostedClient(client.origin);
  const booking = await runBookingContinuity(publicClient, clinicPath, fixture);
  record(checks, "publicBooking", booking.status === 200 || booking.ok === true, {
    status: booking.status,
    reason: booking.reason || null,
  });
  record(checks, "bookingSubmit", booking.ok === true, { status: booking.status, pendingCopy: booking.pendingCopy === true });
  record(checks, "pendingCopy", booking.pendingCopy === true, { status: booking.status });

  let patientDashboard = { status: 0, text: "" };
  let patientRegister = { status: 0, text: "" };
  const patientLoginGet = await publicClient.get(`${clinicPath}/patient/login`);
  record(checks, "patientLoginGet", patientLoginGet.status === 200, { status: patientLoginGet.status });

  if (patientLoginGet.status === 200) {
    const registerPath = booking.registerHref
      ? booking.registerHref.replace(/^https?:\/\/[^/]+/, "")
      : `${clinicPath}/patient/register`;
    patientRegister = await publicClient.get(registerPath);
    const guestToken = decodeURIComponent(extractMatch(registerPath, /guestToken=([^&]+)/) || "");
    const registerPost = await publicClient.postForm(`${clinicPath}/patient/register`, {
      [CSRF_FIELD]: extractCsrfField(patientRegister.text) || publicClient.jar.csrf(),
      firstName: booking.patientFirst || "Hosted",
      lastName: booking.patientLast || "Qa",
      phone: booking.patientPhone || `+26095${String(Date.now()).slice(-7)}`,
      phone_country: "ZM",
      phone_national: String(booking.patientPhone || "").replace(/^\+260/, "") || String(Date.now()).slice(-9),
      password: fixture.password,
      guestToken,
    });
    record(checks, "patientRegistration", registerPost.status === 303 || registerPost.status === 200, {
      status: registerPost.status,
    });
    const pLogin = await publicClient.get(`${clinicPath}/patient/login`);
    const pPost = await publicClient.postForm(`${clinicPath}/patient/login`, {
      [CSRF_FIELD]: extractCsrfField(pLogin.text) || publicClient.jar.csrf(),
      identifier: booking.patientPhone || "",
      phone_country: "ZM",
      password: fixture.password,
    });
    const pFollow = await publicClient.follow(pPost);
    record(checks, "patientLoginPost", pPost.status === 303 && publicClient.jar.sessionPresent(), {
      status: pPost.status,
    });
    patientDashboard = pFollow.status === 200 ? pFollow : await publicClient.get(`${clinicPath}/patient`);
    record(checks, "patientDashboard", patientDashboard.status === 200 && /data-ac-mf-family="MF09"|Patient Portal/i.test(patientDashboard.text), {
      status: patientDashboard.status,
    });
    const dashPending = /Pending clinic confirmation/i.test(patientDashboard.text);
    record(checks, "dashboardPendingCopy", dashPending || booking.ok !== true, { present: dashPending });
    const bookingDetailHref = extractMatch(patientDashboard.text, /href="(\/clinics\/[^"]+\/patient\/bookings\/[^"]+)"/);
    if (bookingDetailHref) {
      const detail = await publicClient.get(bookingDetailHref);
      record(checks, "patientBookingDetail", detail.status === 200 && /Pending clinic confirmation/i.test(detail.text), {
        status: detail.status,
      });
    } else {
      record(checks, "patientBookingDetail", booking.ok !== true, { reason: "no_dashboard_booking_link" });
    }
    const flags = pageFlags(patientDashboard.text);
    record(checks, "patientUnsupportedWidgetsAbsent", !flags.labs && !flags.medications && !flags.telehealth && !flags.mf11, flags);
    const patientApp = await publicClient.get("/app");
    record(checks, "patientDeniedApp", patientApp.status === 303 || patientApp.status === 401 || patientApp.status === 403, {
      status: patientApp.status,
    });
    const foreign = await publicClient.get("/clinics/activeclinic-demo/patient");
    const foreignDashboard = /data-ac-mf-family="MF09"/i.test(foreign.text);
    record(
      checks,
      "foreignClinicDenied",
      foreign.status === 403 ||
        foreign.status === 404 ||
        foreign.status === 303 ||
        (foreign.status === 200 && foreignDashboard === false),
      { status: foreign.status, dashboardChrome: foreignDashboard }
    );
    const profile = await publicClient.get(`${clinicPath}/patient/profile`);
    record(checks, "patientProfile", profile.status === 200, { status: profile.status });
    mobile.mf09 = await measureOverflow(publicClient.origin, `${clinicPath}/patient`, publicClient.jar.header());
    const logoutPage = await publicClient.get(`${clinicPath}/patient`);
    const pLogout = await publicClient.postForm(`${clinicPath}/patient/logout`, {
      [CSRF_FIELD]: extractCsrfField(logoutPage.text) || publicClient.jar.csrf(),
    });
    record(checks, "patientLogout", pLogout.status === 303 || pLogout.status === 200, { status: pLogout.status });
  } else {
    record(checks, "patientRegistration", false, { reason: "clinic_not_public" });
    record(checks, "patientLoginPost", false, { reason: "clinic_not_public" });
    record(checks, "patientDashboard", false, { reason: "clinic_not_public" });
    record(checks, "patientProfile", false, { reason: "clinic_not_public" });
    record(checks, "patientDeniedApp", false, { reason: "clinic_not_public" });
    record(checks, "patientLogout", false, { reason: "clinic_not_public" });
    record(checks, "patientUnsupportedWidgetsAbsent", true, { reason: "skipped_unpublished" });
    record(checks, "foreignClinicDenied", true, { reason: "skipped_unpublished" });
    record(checks, "patientBookingDetail", false, { reason: "clinic_not_public" });
    record(checks, "dashboardPendingCopy", false, { reason: "clinic_not_public" });
  }

  const deferred = pageFlags(
    `${loginGet.text}\n${website.text}\n${patientDashboard.text}\n${patientRegister.text}\n${booking.html || ""}`
  );
  record(
    checks,
    "deferredFeaturesAbsent",
    !deferred.otp && !deferred.sso && !deferred.theme && !deferred.labs && !deferred.medications && !deferred.telehealth && !deferred.mf11,
    deferred
  );

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
  const checksOk = requiredPassed(checks);
  return {
    ok: checksOk && cleanup && cleanup.ok === true,
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
