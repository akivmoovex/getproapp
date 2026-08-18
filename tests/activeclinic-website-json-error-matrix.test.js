"use strict";

/**
 * JSON/editor clinic-key error matrix. No unexpected 500s.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
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
const { createStaffMember } = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  ORGANIZATION_ADMIN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  provisionActiveClinicClinic,
} = require("../src/activeclinic/website/provisionActiveClinicWebsite");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, getCsrfCookieName } = require("../src/platform/http/v5Csrf");
const { LIFECYCLE_STATUS } = require("../src/platform/website/lifecycleStatus");

const PASSWORD = "activeclinic-pass-12";
const ENV = {
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  SESSION_SECRET: "a".repeat(48),
};

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 974000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb() {
  if (skipReason) {
    // eslint-disable-next-line no-console
    console.log("skip:", skipReason);
    return false;
  }
  return true;
}

function makeApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: { ...ENV, DATABASE_URL: databaseUrl },
    log: () => {},
  });
}

function cookieJar(sessionCookieValue, res) {
  const parts = [sessionCookieValue];
  for (const line of [].concat((res && res.headers && res.headers["set-cookie"]) || [])) {
    parts.push(String(line).split(";")[0]);
  }
  return parts.filter(Boolean).join("; ");
}

function extractCsrf(res) {
  const cookies = [].concat(res.headers["set-cookie"] || []);
  const name = getCsrfCookieName({ PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 });
  const raw = cookies.find((c) => String(c).startsWith(`${name}=`)) || "";
  const match = String(raw).match(new RegExp(`${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function parseJson(res) {
  try {
    return JSON.parse(res.text);
  } catch {
    return null;
  }
}

function assertSafeJsonError(res, status, code) {
  assert.equal(res.status, status, res.text && String(res.text).slice(0, 240));
  assert.match(String(res.headers["content-type"] || ""), /json/i);
  const body = parseJson(res);
  assert.ok(body);
  assert.equal(body.ok, false);
  assert.equal(body.code, code);
  const raw = String(res.text || "");
  assert.doesNotMatch(raw, /at\s+\S+\s+\(/);
  assert.doesNotMatch(raw, /password_hash/i);
  assert.doesNotMatch(raw, /DATABASE_URL/i);
}

async function sessionCookie(identityId, orgId, facilityId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId: orgId,
    contextJson: facilityId ? { selectedFacilityId: facilityId } : {},
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

async function seedClinic(opts) {
  const stamp = Date.now().toString(36);
  const slug = opts.slug || `jsonqa_${stamp}`;
  const tenant = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: slug,
    displayName: opts.displayName || `JSON QA ${stamp}`,
    productKey: "activeclinic",
    productTenantKey: slug,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(tenant.ok, true, JSON.stringify(tenant));
  const orgId = tenant.records.organization.id;
  const clinic = await provisionActiveClinicClinic(pool, {
    organizationId: orgId,
    slug,
    publicName: opts.displayName || `JSON QA ${stamp}`,
    phone: nextPhone(),
    websiteStatus: opts.websiteStatus || "coming_soon",
  });
  assert.equal(clinic.ok, true, JSON.stringify(clinic));
  if (opts.publish === true) {
    await pool.query(
      `UPDATE activeclinic.healthcare_organizations SET website_published = true WHERE organization_id = $1`,
      [orgId]
    );
  }
  if (opts.lifecycle) {
    await pool.query(
      `UPDATE platform.website_instances SET lifecycle_status = $2 WHERE organization_id = $1`,
      [orgId, opts.lifecycle]
    );
  }
  const adminPhone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryEmail: `json.${adminPhone.slice(-8)}@example.test`,
    primaryPhone: adminPhone,
    phoneNormalized: adminPhone,
    phoneVerifiedAt: new Date().toISOString(),
  });
  assert.equal(identity.ok, true, JSON.stringify(identity));
  await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: PASSWORD,
  });
  const staff = await createStaffMember(pool, {
    organizationId: orgId,
    healthcareOrganizationId: clinic.healthcareOrganization.id,
    firstName: "Json",
    lastName: "Admin",
    employmentType: "permanent",
    status: "active",
    phone: nextPhone(),
    platformIdentityId: identity.identity.id,
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  const facilityId = clinic.facility && clinic.facility.id;
  if (facilityId) {
    await assignStaffToFacility(pool, {
      organizationId: orgId,
      staffMemberId: staff.staffMember.id,
      facilityId,
      isPrimary: true,
    });
  }
  const role = await assignStaffRole(pool, {
    organizationId: orgId,
    staffMemberId: staff.staffMember.id,
    roleKey: ORGANIZATION_ADMIN,
    scopeType: "organisation",
    assignmentOrigin: "system",
  });
  assert.equal(role.ok, true, JSON.stringify(role));
  return {
    slug,
    orgId,
    facilityId,
    identityId: identity.identity.id,
    instanceId: clinic.instance && clinic.instance.id,
  };
}

describe("ActiveClinic website JSON error matrix", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("returns controlled JSON for forged, auth, CSRF, tenant, and lifecycle cases", async () => {
    if (!requireDb()) return;
    const app = makeApp();
    const published = await seedClinic({
      websiteStatus: "published",
      publish: true,
      lifecycle: LIFECYCLE_STATUS.PUBLIC,
    });
    const unpublished = await seedClinic({
      websiteStatus: "coming_soon",
      publish: false,
      lifecycle: LIFECYCLE_STATUS.PROVISIONAL,
    });
    const other = await seedClinic({
      websiteStatus: "published",
      publish: true,
      lifecycle: LIFECYCLE_STATUS.PUBLIC,
    });
    const adminCookie = await sessionCookie(published.identityId, published.orgId, published.facilityId);
    const otherCookie = await sessionCookie(other.identityId, other.orgId, other.facilityId);
    const unpublishedAdmin = await sessionCookie(
      unpublished.identityId,
      unpublished.orgId,
      unpublished.facilityId
    );

    const csrfPage = await request(app).get(`/clinics/${published.slug}`);
    assert.equal(csrfPage.status, 200);
    const csrf = extractCsrf(csrfPage);
    const adminCsrfPage = await request(app)
      .get(`/clinics/${published.slug}?website_edit=1`)
      .set("Cookie", adminCookie);
    const adminCsrf = extractCsrf(adminCsrfPage) || csrf;

    const forged = await request(app)
      .post("/clinics/does-not-exist-json-qa/website/drafts")
      .set("Accept", "application/json")
      .set("Cookie", cookieJar(adminCookie, adminCsrfPage))
      .send({ [CSRF_FIELD]: adminCsrf, contentKey: "home.hero.title", value: "forged" });
    assertSafeJsonError(forged, 404, "clinic_not_found");
    assert.doesNotMatch(String(forged.text), /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);

    const anon = await request(app)
      .post(`/clinics/${published.slug}/website/drafts`)
      .set("Accept", "application/json")
      .set("Cookie", csrfPage.headers["set-cookie"])
      .send({ [CSRF_FIELD]: csrf, contentKey: "home.hero.title", value: "anon" });
    assert.notEqual(anon.status, 500);
    assertSafeJsonError(anon, 403, "forbidden");

    const cross = await request(app)
      .post(`/clinics/${published.slug}/website/drafts`)
      .set("Accept", "application/json")
      .set("Cookie", cookieJar(otherCookie, adminCsrfPage))
      .send({ [CSRF_FIELD]: adminCsrf, contentKey: "home.hero.title", value: "cross" });
    assert.notEqual(cross.status, 500);
    assert.ok(cross.status === 403 || cross.status === 404);
    const crossBody = parseJson(cross);
    assert.equal(crossBody && crossBody.ok, false);

    const missingCsrf = await request(app)
      .post(`/clinics/${published.slug}/website/drafts`)
      .set("Accept", "application/json")
      .set("Cookie", adminCookie)
      .send({ contentKey: "home.hero.title", value: "no csrf" });
    assertSafeJsonError(missingCsrf, 403, "csrf");

    const badCsrf = await request(app)
      .post(`/clinics/${published.slug}/website/drafts`)
      .set("Accept", "application/json")
      .set("Cookie", cookieJar(adminCookie, adminCsrfPage))
      .send({ [CSRF_FIELD]: "not-a-valid-csrf-token", contentKey: "home.hero.title", value: "bad" });
    assertSafeJsonError(badCsrf, 403, "csrf");

    const okSave = await request(app)
      .post(`/clinics/${published.slug}/website/drafts`)
      .set("Accept", "application/json")
      .set("Cookie", cookieJar(adminCookie, adminCsrfPage))
      .send({ [CSRF_FIELD]: adminCsrf, contentKey: "home.hero.title", value: "JSON QA Live Title" });
    assert.equal(okSave.status, 200, okSave.text);
    const okBody = parseJson(okSave);
    assert.equal(okBody.ok, true);

    const unpublishedAnon = await request(app)
      .post(`/clinics/${unpublished.slug}/website/drafts`)
      .set("Accept", "application/json")
      .send({ contentKey: "home.hero.title", value: "anon unpublished" });
    assertSafeJsonError(unpublishedAnon, 403, "clinic_not_published");

    const unpublishedGet = await request(app)
      .get(`/clinics/${unpublished.slug}?website_edit=1`)
      .set("Cookie", unpublishedAdmin);
    const unpublishedCsrf = extractCsrf(unpublishedGet);
    const unpublishedSave = await request(app)
      .post(`/clinics/${unpublished.slug}/website/drafts`)
      .set("Accept", "application/json")
      .set("Cookie", cookieJar(unpublishedAdmin, unpublishedGet))
      .send({ [CSRF_FIELD]: unpublishedCsrf, contentKey: "home.hero.title", value: "Provisional edit" });
    assert.equal(unpublishedSave.status, 200, unpublishedSave.text);

    await pool.query(
      `UPDATE platform.website_instances SET lifecycle_status = $2 WHERE organization_id = $1`,
      [published.orgId, LIFECYCLE_STATUS.SUSPENDED]
    );
    const suspendedPublic = await request(app).get(`/clinics/${published.slug}`);
    assert.notEqual(suspendedPublic.status, 500);
    assert.ok(suspendedPublic.status === 403 || suspendedPublic.status === 404);
    const suspendedJson = await request(app)
      .post(`/clinics/${published.slug}/website/drafts`)
      .set("Accept", "application/json")
      .set("Cookie", cookieJar(adminCookie, adminCsrfPage))
      .send({ [CSRF_FIELD]: adminCsrf, contentKey: "home.hero.subtitle", value: "still editing" });
    assert.notEqual(suspendedJson.status, 500);

    await pool.query(
      `UPDATE platform.website_instances SET lifecycle_status = $2 WHERE organization_id = $1`,
      [published.orgId, LIFECYCLE_STATUS.OFFLINE]
    );
    const offlinePublic = await request(app).get(`/clinics/${published.slug}`);
    assert.notEqual(offlinePublic.status, 500);
    assert.ok(offlinePublic.status === 403 || offlinePublic.status === 404);
    const offlineJson = await request(app)
      .post(`/clinics/${published.slug}/website/drafts`)
      .set("Accept", "application/json")
      .set("Cookie", cookieJar(adminCookie, adminCsrfPage))
      .send({ [CSRF_FIELD]: adminCsrf, contentKey: "contact.intro", value: "offline edit" });
    assert.notEqual(offlineJson.status, 500);

    const restore = await request(app)
      .post(`/clinics/${other.slug}/website/drafts`)
      .set("Accept", "application/json")
      .set("Cookie", cookieJar(adminCookie, adminCsrfPage))
      .send({ [CSRF_FIELD]: adminCsrf, contentKey: "home.hero.title", value: "cross restore" });
    assert.notEqual(restore.status, 500);
    assert.ok(restore.status === 403 || restore.status === 404);
  });
});
