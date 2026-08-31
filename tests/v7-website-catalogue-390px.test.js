"use strict";

/**
 * Real Chromium visual pass at 390px for Website Management and the
 * public mini-website. Skips only when Playwright/Chromium cannot launch.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("crypto");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const {
  submitAndProvisionClinicRegistration,
} = require("../src/activeclinic/services/submitClinicRegistrationService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const publicationService = require("../src/platform/website/publicationService");
const instanceRepo = require("../src/platform/website/instanceRepository");
const {
  setClinicWebsiteAvailability,
} = require("../src/activeclinic/services/clinicWebsiteAvailabilityService");
const { createStaffMember } = require("../src/activeclinic/services/activeClinicStaffService");
const { insertServiceType } = require("../src/activeclinic/repositories/appointmentRepository");

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
let browser;
let server;
let baseUrl = "";
let cookieValue = "";
let clinicSlug = "";
let builderPath = "";

function requireReady() {
  if (skipReason) assert.fail(`390px browser QA unavailable: ${skipReason}`);
}

describe("v7 website catalogue 390px visual QA", { timeout: 180000 }, () => {
  before(async () => {
    try {
      const { chromium } = require("playwright");
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
      const stamp = crypto.randomBytes(3).toString("hex");
      const result = await submitAndProvisionClinicRegistration(pool, {
        clinicName: `Mobile QA ${stamp}`,
        contactName: "Website Admin",
        contactEmail: `mwqa-${stamp}@example.invalid`,
        contactPhone: `+2609${String(890000000 + Number.parseInt(stamp, 16)).slice(-8)}`,
        province: "Lusaka",
        city: "Lusaka",
        address: "1 Independence Avenue",
        countryCode: "ZM",
        notes: "390px",
        password: PASSWORD,
        passwordConfirm: PASSWORD,
        acceptTerms: "on",
        deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        dataEnvironment: "testing",
        env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
      });
      if (!result.ok) throw new Error(JSON.stringify(result));
      clinicSlug = result.slug;
      const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
        organizationId: result.organizationId,
        productCode: "activeclinic",
      });
      await publicationService.publishWebsiteDraft(pool, {
        organizationId: result.organizationId,
        instanceId: instance.id,
        expectedProductCode: "activeclinic",
        actorIdentityId: result.identityId,
        allowEmpty: true,
      });
      await setClinicWebsiteAvailability(pool, {
        organizationKey: result.slug,
        public: true,
        overrideReadiness: true,
        reason: "catalogue_390",
      });
      const hco = await pool.query(
        `SELECT id FROM activeclinic.healthcare_organizations WHERE organization_id = $1 LIMIT 1`,
        [result.organizationId]
      );
      const doctor = await createStaffMember(pool, {
        organizationId: result.organizationId,
        healthcareOrganizationId: hco.rows[0].id,
        firstName: "Mobile",
        lastName: "Clinician",
        displayName: "Dr Mobile QA",
        employmentType: "permanent",
        status: "active",
        phone: "+260977000390",
        email: `mobile-doc-${stamp}@example.invalid`,
        jobTitle: "Physician",
      });
      const service = await insertServiceType(pool, {
        organizationId: result.organizationId,
        healthcareOrganizationId: hco.rows[0].id,
        serviceKey: `mobile-consult-${stamp}`,
        displayName: "Mobile consult QA",
        status: "active",
      });
      const session = await createPlatformIdentitySession(pool, {
        deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        platformIdentityId: result.identityId,
        organizationId: result.organizationId,
      });
      cookieValue = session.rawToken;
      const app = createActiveClinicFoundationApp({
        getPool: () => pool,
        env: MINIMAL_AC,
        log: () => {},
      });
      const cookieHeader = `${COOKIE_ACTIVECLINIC_ORG}=${cookieValue}`;
      function mergeCookie(pageRes) {
        const parts = [cookieHeader];
        const set = pageRes.headers["set-cookie"];
        const list = Array.isArray(set) ? set : set ? [set] : [];
        parts.push(...list);
        return parts.join("; ");
      }
      async function csrfPage(path) {
        const page = await request(app).get(path).set("Cookie", cookieHeader);
        const meta = String(page.text).match(/name="csrf-token"\s+content="([^"]+)"/);
        const field = String(page.text).match(
          new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"`)
        );
        return { page, token: (meta && meta[1]) || (field && field[1]), cookie: mergeCookie(page) };
      }
      const doctors = await csrfPage("/app/settings/website/catalogue?tab=doctors");
      await request(app)
        .post(`/app/settings/website/catalogue/doctors/${doctor.staffMember.id}`)
        .set("Cookie", doctors.cookie)
        .type("form")
        .send({ [CSRF_FIELD]: doctors.token, action: "show" });
      const services = await csrfPage("/app/settings/website/catalogue?tab=services");
      await request(app)
        .post(`/app/settings/website/catalogue/services/${service.id}`)
        .set("Cookie", services.cookie)
        .type("form")
        .send({ [CSRF_FIELD]: services.token, action: "show" });
      const createPage = await csrfPage("/app/settings/website/pages/new");
      const created = await request(app)
        .post("/app/settings/website/pages")
        .set("Cookie", createPage.cookie)
        .type("form")
        .send({
          [CSRF_FIELD]: createPage.token,
          title: "QA notes",
          slug: "qa-notes",
          templateKey: "blank",
          inNav: "1",
        });
      builderPath = String(created.headers.location || "");
      if (builderPath.startsWith("http")) {
        builderPath = new URL(builderPath).pathname;
      }
      await publicationService.publishWebsiteDraft(pool, {
        organizationId: result.organizationId,
        instanceId: instance.id,
        expectedProductCode: "activeclinic",
        actorIdentityId: result.identityId,
        allowEmpty: true,
      });
      server = http.createServer(app);
      await new Promise((resolve, reject) => {
        server.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
      });
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      browser = await chromium.launch({ headless: true });
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 400) : String(err);
    }
  });

  after(async () => {
    if (browser) await browser.close().catch(() => {});
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (pool) await pool.end().catch(() => {});
  });

  it("keeps Website Management and public pages usable at 390px without overflow", async () => {
    requireReady();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      extraHTTPHeaders: {
        "X-Forwarded-Host": AC_HOST,
        "X-Forwarded-Proto": "http",
      },
    });
    await context.addCookies([
      {
        name: COOKIE_ACTIVECLINIC_ORG,
        value: cookieValue,
        domain: "127.0.0.1",
        path: "/",
      },
    ]);
    const page = await context.newPage();
    const paths = [
      "/app/settings/website",
      "/app/settings/website/catalogue",
      "/app/settings/website/library",
      "/app/settings/website/branding",
      "/app/settings/website/pages",
      builderPath || "/app/settings/website/pages",
      "/app/settings/website/sections",
      "/app/settings/website/media",
      "/app/settings/website/publish",
      `/clinics/${clinicSlug}`,
      `/clinics/${clinicSlug}/doctors`,
      `/clinics/${clinicSlug}/services`,
      `/clinics/${clinicSlug}/p/qa-notes`,
    ];
    const defects = [];
    for (const path of paths) {
      const response = await page.goto(`${baseUrl}${path}`, { waitUntil: "load" });
      const status = response ? response.status() : 0;
      if (status >= 400) {
        defects.push(`${path} HTTP ${status}`);
        continue;
      }
      const metrics = await page.evaluate(() => {
        const doc = document.documentElement;
        const overflow = Math.max(doc.scrollWidth, document.body.scrollWidth) > doc.clientWidth + 2;
        const targets = Array.from(
          document.querySelectorAll(
            "a.ac-mw-btn, button.ac-mw-btn, .ac-mw-nav__link, [data-ac-website-action], [data-ac-catalogue-action], .ac-mw-hub-tile"
          )
        );
        const small = targets
          .filter((el) => {
            const box = el.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && box.height < 44;
          })
          .map((el) => (el.getAttribute("data-ac-website-action") || el.textContent || "").trim().slice(0, 40));
        const dialogs = Array.from(document.querySelectorAll("dialog, [role='dialog']")).filter((el) => {
          const box = el.getBoundingClientRect();
          return box.width > document.documentElement.clientWidth + 2;
        });
        return { overflow, small, dialogOverflow: dialogs.length };
      });
      if (metrics.overflow) defects.push(`${path} horizontal overflow`);
      if (metrics.dialogOverflow) defects.push(`${path} dialog overflow`);
      if (metrics.small.length) defects.push(`${path} small targets: ${metrics.small.join(", ")}`);
    }
    await context.close();
    assert.deepEqual(defects, [], defects.join(" | "));
  });
});
