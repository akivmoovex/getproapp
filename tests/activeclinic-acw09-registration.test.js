"use strict";

/**
 * ACW09 register-clinic: existing unified registration engine,
 * two-step wizard + review + success, then login → Website Hub.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("crypto");
const fs = require("node:fs");
const path = require("node:path");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const instanceRepo = require("../src/platform/website/instanceRepository");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "clinic-admin-pass-12";
const AC_HOST = "activeclinic.org";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let skipReason = null;
let phoneSeq = 971100000;

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
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
  const text = String(html || "");
  const meta = text.match(/name="csrf-token"\s+content="([^"]+)"/);
  if (meta) return meta[1];
  const field = text.match(
    new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`)
  );
  return (field && (field[1] || field[2])) || null;
}

function csrfCookie(res) {
  const value = extractCookie(res, CSRF_COOKIE_ACTIVECLINIC_ORG);
  return value ? `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${value}` : "";
}

function app() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: MINIMAL_AC,
    log: () => {},
  });
}

describe("ActiveClinic ACW09 clinic registration", { timeout: 180000 }, () => {
  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 240) : "no foundation db";
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("GET step 1 is clinic information with desktop/mobile CSS", async () => {
    requireDb();
    const page = await request(app()).get("/register-clinic").set("Host", AC_HOST);
    assert.equal(page.status, 200);
    assert.match(page.text, /data-ac-acw-screen="ACW09-clinic"/);
    assert.match(page.text, /data-ac-acw-step="clinic"/);
    assert.match(page.text, /name="clinicName"/);
    assert.match(page.text, /name="clinicType"/);
    assert.match(page.text, /name="countryCode"/);
    assert.match(page.text, /name="address"/);
    assert.doesNotMatch(page.text, /name="password"/);
    assert.match(page.text, /acw-platform.css\?v=v7-ac-platform-02/);
    const css = fs.readFileSync(
      path.join(__dirname, "..", "public", "activeclinic", "acw-platform.css"),
      "utf8"
    );
    assert.match(css, /@media \(max-width: 390px\)/);
    assert.match(css, /overflow-x:\s*clip/);
  });

  it("walks clinic → administrator → review → success on the existing engine", async () => {
    requireDb();
    const server = app();
    const stamp = uniq("acw09");
    const payload = {
      clinicName: `ACW09 Clinic ${stamp}`,
      clinicType: "hospital",
      countryCode: "ZM",
      city: "Lusaka",
      province: "Lusaka",
      address: "1 Independence Avenue",
      contactName: "Ada Admin",
      contactEmail: `${stamp}@clinic.example`,
      contactPhone: nextPhone(),
      password: PASSWORD,
      passwordConfirm: PASSWORD,
    };

    const step1 = await request(server).get("/register-clinic").set("Host", AC_HOST);
    const cookie = csrfCookie(step1);
    const csrf1 = extractCsrf(step1.text);
    const step2 = await request(server)
      .post("/register-clinic")
      .set("Host", AC_HOST)
      .set("Cookie", cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf1,
        action: "next-clinic",
        clinicName: payload.clinicName,
        clinicType: payload.clinicType,
        countryCode: payload.countryCode,
        city: payload.city,
        province: payload.province,
        address: payload.address,
      });
    assert.equal(step2.status, 200, step2.text.slice(0, 400));
    assert.match(step2.text, /data-ac-acw-screen="ACW09-admin"/);
    assert.match(step2.text, /name="password"/);
    assert.match(step2.text, /name="passwordConfirm"/);
    assert.match(step2.text, /Administrator name/);

    const csrf2 = extractCsrf(step2.text);
    const review = await request(server)
      .post("/register-clinic")
      .set("Host", AC_HOST)
      .set("Cookie", csrfCookie(step2) || cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf2,
        action: "next-admin",
        ...payload,
        phone_country: "ZM",
        phone_national: payload.contactPhone.replace("+260", ""),
      });
    assert.equal(review.status, 200, review.text.slice(0, 400));
    assert.match(review.text, /data-ac-acw-screen="ACW09-review"/);
    assert.match(review.text, /Hospital/);
    assert.match(review.text, /Ada Admin/);
    assert.match(review.text, /name="acceptTerms"/);

    const csrf3 = extractCsrf(review.text);
    const confirm = await request(server)
      .post("/register-clinic")
      .set("Host", AC_HOST)
      .set("Cookie", csrfCookie(review) || cookie)
      .redirects(0)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf3,
        action: "confirm",
        acceptTerms: "on",
        ...payload,
        phone_country: "ZM",
        phone_national: payload.contactPhone.replace("+260", ""),
      });
    assert.equal(confirm.status, 303, confirm.text.slice(0, 400));
    assert.match(String(confirm.headers.location || ""), /\/register-clinic\/success\?ref=AC-/);
    assert.match(String(confirm.headers.location || ""), /ready=1/);

    const success = await request(server)
      .get(confirm.headers.location)
      .set("Host", AC_HOST);
    assert.equal(success.status, 200);
    assert.match(success.text, /data-ac-acw-screen="ACW09-success"/);
    assert.match(success.text, /data-ac-sign-in="1"/);
    assert.match(success.text, /Sign in/);
    assert.match(success.text, /unpublished/i);
    assert.match(success.text, /Website Management/);
    assert.doesNotMatch(success.text, /under review by our onboarding team/i);

    const dup = await request(server)
      .post("/register-clinic")
      .set("Host", AC_HOST)
      .set("Cookie", csrfCookie(review) || cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf3,
        action: "confirm",
        acceptTerms: "on",
        ...payload,
        phone_country: "ZM",
        phone_national: payload.contactPhone.replace("+260", ""),
      });
    assert.equal(dup.status, 400);
    assert.match(dup.text, /already|recently submitted/i);

    const org = await pool.query(
      `SELECT cra.organization_id, f.facility_type
         FROM activeclinic.clinic_registration_applications cra
         JOIN activeclinic.facilities f ON f.organization_id = cra.organization_id
        WHERE cra.contact_email_normalized = $1`,
      [payload.contactEmail]
    );
    assert.equal(org.rows[0].facility_type, "hospital");
  });

  it("registers then signs in to clinic Website Hub without Platform Admin", async () => {
    requireDb();
    const server = app();
    const stamp = uniq("acw09e2e");
    const payload = {
      clinicName: `ACW09 Hub ${stamp}`,
      clinicType: "clinic",
      contactName: "Hub Admin",
      contactEmail: `${stamp}@clinic.example`,
      contactPhone: nextPhone(),
      province: "Lusaka",
      city: "Lusaka",
      address: "2 Cairo Road",
      countryCode: "ZM",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      acceptTerms: "on",
    };
    const form = await request(server).get("/register-clinic").set("Host", AC_HOST);
    const confirm = await request(server)
      .post("/register-clinic")
      .set("Host", AC_HOST)
      .set("Cookie", csrfCookie(form))
      .redirects(0)
      .type("form")
      .send({ [CSRF_FIELD]: extractCsrf(form.text), action: "confirm", ...payload });
    assert.equal(confirm.status, 303, confirm.text.slice(0, 400));

    const row = await pool.query(
      `SELECT organization_id, status, provisioning_status
         FROM activeclinic.clinic_registration_applications
        WHERE contact_email_normalized = $1`,
      [payload.contactEmail]
    );
    assert.equal(row.rows.length, 1);
    assert.equal(row.rows[0].status, "active");
    const organizationId = row.rows[0].organization_id;
    const facility = await pool.query(
      `SELECT facility_type FROM activeclinic.facilities WHERE organization_id = $1`,
      [organizationId]
    );
    assert.equal(facility.rows[0].facility_type, "clinic");

    const loginGet = await request(server).get("/login").set("Host", AC_HOST);
    const loginPost = await request(server)
      .post("/login")
      .set("Host", AC_HOST)
      .set("Cookie", csrfCookie(loginGet))
      .set("Accept", "text/html")
      .redirects(0)
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(loginGet.text),
        identifier: payload.contactEmail,
        password: PASSWORD,
      });
    assert.equal(loginPost.status, 303, loginPost.text.slice(0, 400));
    const sid = extractCookie(loginPost, COOKIE_ACTIVECLINIC_ORG);
    assert.ok(sid);
    const session = `${COOKIE_ACTIVECLINIC_ORG}=${sid}`;

    const clinic = await request(server).get("/app").set("Host", AC_HOST).set("Cookie", session);
    assert.equal(clinic.status, 200);
    assert.match(clinic.text, /data-ac-shell="staff-app"/);

    const hub = await request(server)
      .get("/app/settings/website")
      .set("Host", AC_HOST)
      .set("Cookie", session);
    assert.equal(hub.status, 200, hub.text.slice(0, 400));
    assert.match(hub.text, /data-ac-website-hub="1"/);
    assert.match(hub.text, /Website Management Hub/);
    assert.doesNotMatch(hub.text, /data-ac-provisioning-incomplete/);

    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId,
      productCode: "activeclinic",
    });
    assert.ok(instance);
    assert.notEqual(String(instance.status || ""), "published");

    const admin = await request(server).get("/admin").set("Host", AC_HOST).set("Cookie", session);
    assert.notEqual(admin.status, 200);
  });

  it("validates administrator passwords on the server", async () => {
    requireDb();
    const server = app();
    const form = await request(server).get("/register-clinic").set("Host", AC_HOST);
    const bad = await request(server)
      .post("/register-clinic")
      .set("Host", AC_HOST)
      .set("Cookie", csrfCookie(form))
      .type("form")
      .send({
        [CSRF_FIELD]: extractCsrf(form.text),
        action: "next-admin",
        clinicName: "Valid Clinic Name",
        clinicType: "clinic",
        countryCode: "ZM",
        contactName: "Ada Admin",
        contactEmail: `bad-${Date.now()}@clinic.example`,
        contactPhone: nextPhone(),
        password: "short",
        passwordConfirm: "different",
      });
    assert.equal(bad.status, 400);
    assert.match(bad.text, /data-ac-acw-step="administrator"/);
    assert.match(bad.text, /Password must be at least 10 characters|do not match/);
  });

  it("keeps register, review, success, and Website Hub usable at 390px", async () => {
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
      const stamp = uniq("m09");
      const email = `${stamp}@clinic.example`;
      const phoneNational = `97${String(Date.now()).slice(-7)}`;

      async function overflowOf(label) {
        const metrics = await page.evaluate(() => {
          const doc = document.documentElement;
          const overflow = Math.max(doc.scrollWidth, document.body.scrollWidth) > doc.clientWidth + 2;
          return { overflow, width: doc.clientWidth };
        });
        assert.equal(metrics.width, 390, `${label} viewport`);
        assert.equal(metrics.overflow, false, `${label} horizontal overflow`);
      }

      const res1 = await page.goto(`${baseUrl}/register-clinic`, { waitUntil: "load" });
      assert.ok(res1 && res1.status() < 400, `step1 ${res1 && res1.status()}`);
      await overflowOf("step 1");
      await page.fill("#clinicName", `Mobile Clinic ${stamp}`);
      await page.selectOption("#clinicType", "clinic");
      await page.fill("#city", "Lusaka");
      await page.click("button[type=submit]");
      await page.waitForSelector("[data-ac-acw-step='administrator']");
      await overflowOf("step 2");
      await page.fill("#contactName", "Mobile Admin");
      await page.fill("#contactPhone-national", phoneNational);
      await page.fill("#contactEmail", email);
      await page.fill("#password", PASSWORD);
      await page.fill("#passwordConfirm", PASSWORD);
      await page.click("button[name=action][value=next-admin]");
      await page.waitForSelector("[data-ac-acw-step='review']");
      await overflowOf("review");
      await page.check("#acceptTerms");
      await Promise.all([
        page.waitForURL(/\/register-clinic\/success/),
        page.click(".ac-review-actions__confirm button[type=submit]"),
      ]);
      await overflowOf("success");
      assert.match(await page.content(), /Sign in/);

      await context.clearCookies();
      await page.click("[data-ac-sign-in='1']");
      await page.waitForURL(/\/login/);
      await page.waitForSelector("#identifier, input[name=identifier]");
      const identifierSel = (await page.$("#identifier")) ? "#identifier" : "input[name=identifier]";
      await page.fill(identifierSel, email);
      await page.fill("input[type=password]", PASSWORD);
      await page.click("button[type=submit]");
      await page.waitForURL(/\/app/);
      const hubRes = await page.goto(`${baseUrl}/app/settings/website`, { waitUntil: "load" });
      assert.ok(hubRes && hubRes.status() < 400, `hub ${hubRes && hubRes.status()}`);
      await overflowOf("website hub");
      await context.close();
    } finally {
      if (browser) await browser.close().catch(() => {});
      if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
    }
  });
});
