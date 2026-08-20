"use strict";

/**
 * ACW10 password recovery, ACW11 public system states, ACW12 shared chrome.
 * Reuses existing identity reset tokens and public-shell architecture.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  createPlatformIdentity,
} = require("../src/platform/services/platformIdentityService");
const {
  setPlatformIdentityPassword,
} = require("../src/platform/services/platformIdentityCredentialService");
const {
  createHealthcareOrganization,
} = require("../src/activeclinic/services/healthcareOrganizationService");
const { createFacility } = require("../src/activeclinic/services/facilityService");
const {
  createStaffMember,
  linkStaffMemberToIdentity,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  NETWORK_ADMIN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  linkIdentityToProductProfile,
} = require("../src/platform/services/identityProductProfileService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createActiveClinicErrorHandler,
} = require("../src/activeclinic/http/createActiveClinicErrorHandler");
const {
  issueAdminPasswordResetLink,
  NEUTRAL_MESSAGE,
} = require("../src/activeclinic/services/activeClinicPasswordRecoveryService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD } = require("../src/platform/http/v5Csrf");

const PASSWORD = "activeclinic-pass-12";
const NEW_PASSWORD = "activeclinic-pass-99";
const AC_HOST = "activeclinic.org";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

const PUBLIC_LINKS = [
  "/",
  "/clinics",
  "/for-clinics",
  "/for-patients",
  "/about",
  "/contact",
  "/login",
  "/register-clinic",
  "/features",
  "/privacy",
  "/terms",
];

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 971800000;

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function app() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: {
      ...MINIMAL_AC,
      DATABASE_URL: databaseUrl || MINIMAL_AC.DATABASE_URL,
    },
  });
}

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

function extractCsrf(html) {
  const field = String(html || "").match(
    new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`)
  );
  return (field && (field[1] || field[2])) || null;
}

async function provisionOrg(stamp) {
  const result = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `acw10_${stamp}`,
    displayName: "ACW10 Clinic",
    productKey: "activeclinic",
    productTenantKey: `acw10-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  const hco = await createHealthcareOrganization(pool, {
    organizationId: result.records.organization.id,
    legalName: "ACW10 Legal",
    publicName: "ACW10 Public",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));
  const facility = await createFacility(pool, {
    organizationId: result.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: "main",
    displayName: "Main",
    facilityType: "hospital",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: "+260970000088",
    city: "Lusaka",
    province: "Lusaka Province",
  });
  assert.equal(facility.ok, true, JSON.stringify(facility));
  return {
    orgId: result.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  };
}

async function seedStaff(stamp) {
  const digits = `${Date.now()}${Math.floor(Math.random() * 90 + 10)}`.slice(-7);
  const phone = `+26097${digits}`;
  const email = `acw10_${stamp}@example.test`;
  const identity = await createPlatformIdentity(pool, {
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
    primaryEmail: email,
    emailNormalized: email.toLowerCase(),
    emailVerifiedAt: new Date().toISOString(),
  });
  assert.equal(identity.ok, true, JSON.stringify(identity));
  const set = await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: PASSWORD,
  });
  assert.equal(set.ok, true, JSON.stringify(set));
  const org = await provisionOrg(stamp);
  const staff = await createStaffMember(pool, {
    organizationId: org.orgId,
    healthcareOrganizationId: org.hcoId,
    firstName: "Ada",
    lastName: "Reset",
    employmentType: "contract",
    status: "active",
    phone: `+26096${digits}`,
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  await linkStaffMemberToIdentity(pool, {
    id: staff.staffMember.id,
    organizationId: org.orgId,
    platformIdentityId: identity.identity.id,
  });
  await linkIdentityToProductProfile(pool, {
    identityId: identity.identity.id,
    productKey: "activeclinic",
    productProfileId: staff.staffMember.id,
  });
  await assignStaffRole(pool, {
    organizationId: org.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey: NETWORK_ADMIN,
    scopeType: "organisation",
  });
  await assignStaffToFacility(pool, {
    organizationId: org.orgId,
    staffMemberId: staff.staffMember.id,
    facilityId: org.facilityId,
    isPrimary: true,
  });
  return { identity: identity.identity, staff: staff.staffMember, org, phone, email };
}

describe("ActiveClinic ACW10–ACW12 recovery, errors, and public chrome", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      resetDeploymentProfileWarningsForTests();
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("ACW10 forgot, check, new password, and success screens exist on the token architecture", async () => {
    const server = app();
    const forgot = await request(server).get("/forgot-password").set("Host", AC_HOST);
    assert.equal(forgot.status, 200);
    assert.match(forgot.text, /data-ac-acw-screen="ACW10-forgot"/);
    assert.match(forgot.text, /data-ac-shell="auth"/);
    assert.match(forgot.text, /Phone number or email/);
    assert.doesNotMatch(forgot.text, /reset-password\/[A-Za-z0-9_-]{20,}/);

    const check = await request(server).get("/forgot-password/check").set("Host", AC_HOST);
    assert.equal(check.status, 200);
    assert.match(check.text, /data-ac-acw-screen="ACW10-verification"/);
    assert.match(check.text, /eligible ActiveClinic account/i);
    assert.doesNotMatch(check.text, /reset-password\/[A-Za-z0-9_-]{20,}/);

    const success = await request(server).get("/reset-password/success").set("Host", AC_HOST);
    assert.equal(success.status, 200);
    assert.match(success.text, /data-ac-acw-screen="ACW10-success"/);
    assert.match(success.text, /Sign in/);
    assert.doesNotMatch(success.text, /Reset link unavailable/);
  });

  it("forgot-password never enumerates accounts and never returns a raw token", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const seeded = await seedStaff(stamp);
    const server = app();
    const page = await request(server).get("/forgot-password").set("Host", AC_HOST);
    const csrf = extractCsrf(page.text);
    const cookie = extractCookie(page, CSRF_COOKIE_ACTIVECLINIC_ORG);
    assert.ok(csrf && cookie);

    async function postIdentifier(identifier) {
      return request(server)
        .post("/forgot-password")
        .set("Host", AC_HOST)
        .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${cookie}`)
        .type("form")
        .send({ identifier, [CSRF_FIELD]: csrf });
    }

    const known = await postIdentifier(seeded.phone);
    const unknown = await postIdentifier(nextPhone());
    assert.equal(known.status, 303);
    assert.equal(unknown.status, 303);
    assert.equal(known.headers.location, unknown.headers.location);
    assert.match(known.headers.location || "", /\/forgot-password\/check/);
    assert.doesNotMatch(known.text + unknown.text, /reset-password\/[A-Za-z0-9_-]{16,}/);
    assert.doesNotMatch(known.text, new RegExp(seeded.phone.replace("+", "\\+")));

    const check = await request(server).get("/forgot-password/check").set("Host", AC_HOST);
    assert.equal(check.status, 200);
    assert.match(check.text, new RegExp(NEUTRAL_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(check.text, /no account|not found|does not exist/i);
    assert.doesNotMatch(check.text, /reset-password\/[A-Za-z0-9_-]{16,}/);
  });

  it("reset token form rejects invalid tokens and weak passwords, then shows success", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}b`;
    const seeded = await seedStaff(stamp);
    const server = app();

    const invalid = await request(server)
      .get("/reset-password/not-a-real-token")
      .set("Host", AC_HOST);
    assert.equal(invalid.status, 400);
    assert.match(invalid.text, /Reset link unavailable|not valid/i);
    assert.doesNotMatch(invalid.text, /data-ac-acw-screen="ACW10-success"/);

    const issued = await issueAdminPasswordResetLink(pool, {
      organizationId: seeded.org.orgId,
      staffMemberId: seeded.staff.id,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      env: MINIMAL_AC,
    });
    assert.equal(issued.ok, true, JSON.stringify(issued));
    assert.ok(issued.resetUrl.includes("/reset-password/"));
    const token = issued.rawToken;

    const form = await request(server).get(`/reset-password/${token}`).set("Host", AC_HOST);
    assert.equal(form.status, 200);
    assert.match(form.text, /data-ac-acw-screen="ACW10-new-password"/);
    const csrf = extractCsrf(form.text);
    const cookie = extractCookie(form, CSRF_COOKIE_ACTIVECLINIC_ORG);

    const weak = await request(server)
      .post(`/reset-password/${token}`)
      .set("Host", AC_HOST)
      .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${cookie}`)
      .type("form")
      .send({
        password: "short",
        password_confirm: "short",
        [CSRF_FIELD]: csrf,
      });
    assert.equal(weak.status, 400);
    assert.match(weak.text, /at least 10 characters/i);

    const csrf2 = extractCsrf(weak.text) || csrf;
    const cookie2 = extractCookie(weak, CSRF_COOKIE_ACTIVECLINIC_ORG) || cookie;
    const ok = await request(server)
      .post(`/reset-password/${token}`)
      .set("Host", AC_HOST)
      .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${cookie2}`)
      .type("form")
      .send({
        password: NEW_PASSWORD,
        password_confirm: NEW_PASSWORD,
        [CSRF_FIELD]: csrf2,
      });
    assert.ok([302, 303].includes(ok.status));
    assert.match(ok.headers.location || "", /\/reset-password\/success/);

    const done = await request(server).get("/reset-password/success").set("Host", AC_HOST);
    assert.equal(done.status, 200);
    assert.match(done.text, /data-ac-acw-screen="ACW10-success"/);
    assert.doesNotMatch(done.text, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("ACW11 public errors keep real status codes and safe CTAs", async () => {
    const isolated = express();
    isolated.use((req, _res, next) => {
      req.requestId = "req_acw11";
      next();
    });
    isolated.get("/boom-404", (_req, _res, next) => {
      const err = new Error("missing");
      err.status = 404;
      next(err);
    });
    isolated.get("/boom-503", (_req, _res, next) => {
      const err = new Error("down");
      err.status = 503;
      next(err);
    });
    isolated.get("/boom-500", (_req, _res, next) => {
      next(new Error("Unexpected internal failure with password=secret"));
    });
    isolated.use(createActiveClinicErrorHandler({ isProduction: true, log: () => {} }));

    const notFound = await isolatedRequest(isolated, "/boom-404");
    assert.equal(notFound.status, 404);
    assert.match(notFound.text, /data-ac-state="not-found"/);
    assert.match(notFound.text, /data-ac-acw-screen="ACW11-404"/);
    assert.match(notFound.text, /href="\/"/);
    assert.match(notFound.text, /href="\/clinics"/);
    assert.match(notFound.text, /href="\/login"/);
    assert.doesNotMatch(notFound.text, /password=secret|Error: missing/i);

    const unavailable = await isolatedRequest(isolated, "/boom-503");
    assert.equal(unavailable.status, 503);
    assert.match(unavailable.text, /data-ac-state="service-unavailable"/);
    assert.match(unavailable.text, /Try again/);
    assert.doesNotMatch(unavailable.text, />200</);

    const unexpected = await isolatedRequest(isolated, "/boom-500");
    assert.equal(unexpected.status, 500);
    assert.match(unexpected.text, /data-ac-state="error"/);
    assert.match(unexpected.text, /data-ac-acw-screen="ACW11-error"/);
    assert.doesNotMatch(unexpected.text, /password=secret|Unexpected internal/i);

    requireDb();
    const server = app();
    const public404 = await request(server)
      .get("/this-acw11-page-does-not-exist")
      .set("Host", AC_HOST)
      .set("Accept", "text/html");
    assert.equal(public404.status, 404);
    assert.match(public404.text, /data-ac-acw-chrome="ACW12"/);
    assert.match(public404.text, /data-ac-state="not-found"/);
    assert.doesNotMatch(public404.text, /this-acw11-page-does-not-exist/);

    const app404 = await request(server)
      .get("/app/this-route-does-not-exist")
      .set("Host", AC_HOST)
      .set("Accept", "text/html");
    assert.equal(app404.status, 404);
    assert.match(app404.text, /data-ac-state="not-found"/);
  });

  it("ACW12 shared chrome exposes primary nav, actions, and current-page state", async () => {
    requireDb();
    const server = app();
    const home = await request(server).get("/").set("Host", AC_HOST);
    assert.equal(home.status, 200);
    assert.match(home.text, /data-ac-acw-chrome="ACW12"/);
    assert.match(home.text, /href="\/clinics"/);
    assert.match(home.text, /href="\/for-clinics"/);
    assert.match(home.text, /href="\/for-patients"/);
    assert.match(home.text, /href="\/about"/);
    assert.match(home.text, /href="\/contact"/);
    assert.match(home.text, /href="\/login"/);
    assert.match(home.text, /Register Your Clinic/);
    assert.match(home.text, /data-ac-nav-open/);
    assert.match(home.text, /id="ac-public-drawer"/);
    assert.doesNotMatch(home.text, /href="#"/);

    const headerPath = path.join(
      __dirname,
      "..",
      "views",
      "activeclinic",
      "partials",
      "public-platform-header.ejs"
    );
    const headerSrc = fs.readFileSync(headerPath, "utf8");
    assert.match(headerSrc, /public-platform-primary-nav/);
    assert.doesNotMatch(headerSrc, /href="\/clinics">Find a Clinic/);

    const about = await request(server).get("/about").set("Host", AC_HOST);
    assert.equal(about.status, 200);
    assert.match(about.text, /href="\/about"[^>]*aria-current="page"/);
    assert.doesNotMatch(about.text, /href="\/clinics"[^>]*aria-current="page"/);

    const clinics = await request(server).get("/clinics").set("Host", AC_HOST);
    assert.equal(clinics.status, 200);
    assert.match(clinics.text, /href="\/clinics"[^>]*aria-current="page"/);

    const patients = await request(server).get("/for-patients").set("Host", AC_HOST);
    assert.equal(patients.status, 200);
    assert.match(patients.text, /href="\/for-patients"[^>]*aria-current="page"/);

    const js = fs.readFileSync(
      path.join(__dirname, "..", "public", "activeclinic", "ac-public.js"),
      "utf8"
    );
    assert.match(js, /Escape/);
    assert.match(js, /trapTab/);
    assert.match(js, /aria-expanded/);

    for (const href of PUBLIC_LINKS) {
      const res = await request(server).get(href).set("Host", AC_HOST).redirects(0);
      assert.ok(
        res.status < 400,
        `${href} returned ${res.status}`
      );
    }
  });

  it("keeps recovery, 404, and public chrome usable at 390px with keyboard drawer", async () => {
    requireDb();
    let browser;
    let httpServer;
    try {
      const { chromium } = require("playwright");
      const expressApp = app();
      httpServer = http.createServer(expressApp);
      await new Promise((resolve, reject) => {
        httpServer.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
      });
      const baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        extraHTTPHeaders: {
          "X-Forwarded-Host": AC_HOST,
          "X-Forwarded-Proto": "http",
        },
      });
      const page = await context.newPage();

      async function overflowOf(label) {
        const metrics = await page.evaluate(() => {
          const doc = document.documentElement;
          const overflow =
            Math.max(doc.scrollWidth, document.body.scrollWidth) > doc.clientWidth + 2;
          return { overflow, width: doc.clientWidth };
        });
        assert.equal(metrics.width, 390, `${label} viewport`);
        assert.equal(metrics.overflow, false, `${label} horizontal overflow`);
      }

      const homeRes = await page.goto(`${baseUrl}/`, { waitUntil: "load" });
      assert.equal(homeRes && homeRes.status(), 200);
      await overflowOf("home");
      await page.click("[data-ac-nav-open]");
      await page.waitForSelector("#ac-public-drawer:not([hidden])");
      assert.equal(await page.getAttribute("[data-ac-nav-open]", "aria-expanded"), "true");
      const minTouch = await page.evaluate(() => {
        const link = document.querySelector("#ac-public-drawer nav a");
        return link ? link.getBoundingClientRect().height : 0;
      });
      assert.ok(minTouch >= 44, `drawer link height ${minTouch}`);
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => {
        const drawer = document.querySelector("#ac-public-drawer");
        return drawer && drawer.hidden;
      });

      const forgotRes = await page.goto(`${baseUrl}/forgot-password`, { waitUntil: "load" });
      assert.equal(forgotRes && forgotRes.status(), 200);
      await overflowOf("forgot");

      const missing = await page.goto(`${baseUrl}/this-acw11-page-does-not-exist`, {
        waitUntil: "load",
      });
      assert.equal(missing && missing.status(), 404);
      await overflowOf("404");
      assert.match(await page.content(), /Find a Clinic/);
    } finally {
      if (browser) await browser.close();
      if (httpServer) {
        await new Promise((resolve) => httpServer.close(resolve));
      }
    }
  });
});

function isolatedRequest(appInstance, url) {
  return request(appInstance).get(url).set("Accept", "text/html");
}
