"use strict";

/**
 * AC post-registration website editor routing.
 * Canonical edit CTA must open /clinics/:clinicKey?website_edit=1&website_mode=draft
 * — never the Website Management Hub (/app/settings/website).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const {
  submitAndProvisionClinicRegistration,
} = require("../src/activeclinic/services/submitClinicRegistrationService");
const {
  resolveActiveClinicRegistrationSuccessWebsite,
} = require("../src/activeclinic/services/resolveActiveClinicRegistrationSuccessWebsite");
const {
  buildPublicWebsiteEditPath,
  PRODUCT_CODE,
} = require("../src/platform/website/publicWebsiteUrl");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");

const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let skipReason = null;
let app;
let phoneSeq = 771100000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function extractBuildWebsiteHref(html) {
  const m = String(html).match(
    /href="([^"]+)"[^>]*data-ac-build-website="1"|data-ac-build-website="1"[^>]*href="([^"]+)"/
  );
  if (!m) return null;
  return String(m[1] || m[2] || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
}

async function provisionClinic(label) {
  const stamp = `${Date.now().toString(36)}_${label}`;
  const password = "AcPostReg-Edit-12!";
  const payload = {
    clinicName: `PostReg ${label} ${stamp}`,
    clinicType: "clinic",
    countryCode: "ZM",
    city: "Lusaka",
    address: "1 Independence Ave",
    contactName: `${label} Admin`,
    contactEmail: `postreg-${stamp}@example.invalid`,
    contactPhone: nextPhone(),
    password,
    passwordConfirm: password,
    acceptTerms: "on",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    dataEnvironment: "testing",
    env: MINIMAL_AC,
  };
  const result = await submitAndProvisionClinicRegistration(pool, payload);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.slug, "provisioned organizationKey/slug required");
  return { result, payload, password, clinicKey: result.slug };
}

async function sessionCookie(result) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: result.identityId,
    organizationId: result.organizationId,
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

describe("AC post-registration canonical website editor route", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      app = createActiveClinicFoundationApp({
        getPool: () => pool,
        env: MINIMAL_AC,
        log: () => {},
      });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("A–F: success CTA uses dynamic clinicKey edit URL; seeded content visible; refresh keeps edit mode", async () => {
    requireDb();
    const { result, clinicKey, payload } = await provisionClinic("a");
    const expectedEdit = buildPublicWebsiteEditPath({
      product: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: clinicKey,
    });
    assert.equal(
      expectedEdit,
      `/clinics/${clinicKey}?website_edit=1&website_mode=draft`
    );

    const resolved = await resolveActiveClinicRegistrationSuccessWebsite(pool, {
      reference: result.application.applicationNumber,
      ready: true,
    });
    assert.equal(resolved.showWebsite, true);
    assert.equal(resolved.organizationKey, clinicKey);
    assert.equal(resolved.editPath, expectedEdit);
    assert.equal(resolved.hubPath, "/app/settings/website");
    assert.notEqual(resolved.editPath, resolved.hubPath);

    const success = await request(app).get(
      `/register-clinic/success?ref=${encodeURIComponent(result.application.applicationNumber)}&ready=1`
    );
    assert.equal(success.status, 200);
    assert.match(success.text, /Edit your website/);
    const href = extractBuildWebsiteHref(success.text);
    assert.equal(href, expectedEdit);
    assert.match(href, /website_edit=1/);
    assert.match(href, /website_mode=draft/);
    assert.doesNotMatch(href, /\/app\/settings\/website/);

    const cookie = await sessionCookie(result);
    const edit = await request(app).get(expectedEdit).set("Cookie", cookie);
    assert.equal(edit.status, 200);
    assert.match(edit.text, /website_edit=1|data-gp-website-editor|data-website-chrome|data-website-start/);
    assert.match(
      edit.text,
      new RegExp(payload.clinicName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
    // Seeded hero / welcome content from provision
    assert.match(edit.text, /Welcome to|hero|clinic/i);

    const refresh = await request(app).get(expectedEdit).set("Cookie", cookie);
    assert.equal(refresh.status, 200);
    assert.match(String(refresh.req.path || expectedEdit), /website_edit=1/);
    assert.match(refresh.text, /data-website-chrome|data-gp-website-editor|data-website-start/);

    // Hub remains available (not removed)
    const hub = await request(app).get("/app/settings/website").set("Cookie", cookie);
    assert.equal(hub.status, 200);
    assert.match(hub.text, /data-ac-website-management="1"|Website Management Hub/);
  });

  it("G: different clinics get distinct clinicKey edit destinations", async () => {
    requireDb();
    const a = await provisionClinic("g1");
    const b = await provisionClinic("g2");
    assert.notEqual(a.clinicKey, b.clinicKey);
    const editA = buildPublicWebsiteEditPath({
      product: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: a.clinicKey,
    });
    const editB = buildPublicWebsiteEditPath({
      product: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: b.clinicKey,
    });
    assert.equal(editA, `/clinics/${a.clinicKey}?website_edit=1&website_mode=draft`);
    assert.equal(editB, `/clinics/${b.clinicKey}?website_edit=1&website_mode=draft`);
    assert.notEqual(editA, editB);

    const successA = await request(app).get(
      `/register-clinic/success?ref=${encodeURIComponent(a.result.application.applicationNumber)}&ready=1`
    );
    const successB = await request(app).get(
      `/register-clinic/success?ref=${encodeURIComponent(b.result.application.applicationNumber)}&ready=1`
    );
    assert.equal(extractBuildWebsiteHref(successA.text), editA);
    assert.equal(extractBuildWebsiteHref(successB.text), editB);
  });

  it("H: cross-tenant editor access denied without note/content ownership leak", async () => {
    requireDb();
    const owner = await provisionClinic("hown");
    const other = await provisionClinic("hoth");
    const ownerEdit = buildPublicWebsiteEditPath({
      product: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: owner.clinicKey,
    });
    const otherCookie = await sessionCookie(other.result);
    const denied = await request(app).get(ownerEdit).set("Cookie", otherCookie);
    assert.ok(
      [403, 404].includes(denied.status),
      `cross-tenant expected 403/404, got ${denied.status}`
    );
    assert.doesNotMatch(
      denied.text,
      new RegExp(owner.payload.clinicName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  });

  it("I: existing direct editor links still open edit mode for owning admin", async () => {
    requireDb();
    const { result, clinicKey } = await provisionClinic("i");
    const editPath = `/clinics/${encodeURIComponent(clinicKey)}?website_edit=1&website_mode=draft`;
    const cookie = await sessionCookie(result);
    const page = await request(app).get(editPath).set("Cookie", cookie);
    assert.equal(page.status, 200);
    assert.match(page.text, /data-website-chrome|data-gp-website-editor|data-website-start/);
  });
});
