"use strict";

/**
 * Platform Admin website control for ActiveClinic and BlessBoard.
 * Local/ephemeral foundation Postgres only.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
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
  submitChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationService");
const {
  validatePlatformChurchRegistration,
} = require("../src/blessboard/services/platformChurchRegistrationValidation");
const { CODE_ACTIVECLINIC_ORG_V6, CODE_ORG_STAGING } = require("../src/platform/config/deploymentProfiles");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_FIELD, getCsrfCookieName } = require("../src/platform/http/v5Csrf");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const {
  listPlatformAdminWebsites,
  loadPlatformAdminWebsiteDetail,
  applyPlatformAdminWebsiteAction,
} = require("../src/platform/website/platformAdminWebsitesService");
const publicationService = require("../src/platform/website/publicationService");
const instanceRepo = require("../src/platform/website/instanceRepository");
const { LIFECYCLE_STATUS } = require("../src/platform/website/lifecycleStatus");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const BB_ENV = {
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING,
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
  SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
  BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
  BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
};

let pool;
let skipReason = null;
let stamp = 0;
let phoneSeq = 920000000;
let ipSeq = 80;

function requireDb() {
  if (skipReason) {
    // eslint-disable-next-line no-console
    console.log("skip:", skipReason);
    return false;
  }
  return true;
}

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function clinicPayload(overrides) {
  stamp += 1;
  return {
    clinicName: `PA Web Clinic ${stamp}`,
    contactName: "Clinic Administrator",
    contactEmail: `pa-web-clinic-${stamp}@example.invalid`,
    contactPhone: nextPhone(),
    province: "Lusaka Province",
    city: "Lusaka",
    address: "1 Independence Avenue",
    countryCode: "ZM",
    notes: "platform admin website control",
    password: "clinic-admin-pass-12",
    passwordConfirm: "clinic-admin-pass-12",
    acceptTerms: "on",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    dataEnvironment: "testing",
    env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    ...overrides,
  };
}

function churchBody(overrides) {
  stamp += 1;
  const key = `pawb${stamp}${crypto.randomBytes(3).toString("hex")}`;
  return {
    church_name: `PA Web Church ${stamp} ${key}`,
    country: "Zambia",
    city: "Lusaka",
    contact_name: "Church Administrator",
    role_in_church: "Pastor",
    phone: nextPhone(),
    email: `${key}@example.org`,
    selected_plan: "foundation",
    organization_key: key,
    password: PASSWORD,
    password_confirm: PASSWORD,
    branch_name: "HQ Campus",
    consent_contact: "on",
    ...overrides,
  };
}

function fakeReq() {
  ipSeq += 1;
  return {
    ip: `203.0.113.${ipSeq % 250}`,
    requestId: `paw-${Date.now()}-${ipSeq}`,
    get: () => "paw-test-agent",
  };
}

async function submitChurch(body) {
  const validation = validatePlatformChurchRegistration(body, { instantFreeEnabled: true });
  assert.equal(validation.ok, true, JSON.stringify(validation));
  return submitChurchRegistration(pool, fakeReq(), validation, {
    env: { PLATFORM_DEPLOYMENT_CODE: CODE_ORG_STAGING },
    dataEnvironment: "testing",
    deploymentCode: CODE_ORG_STAGING,
  });
}

function extractCsrf(res, env) {
  const cookies = [].concat((res.headers && res.headers["set-cookie"]) || []);
  const name = getCsrfCookieName(env);
  const raw = cookies.find((c) => String(c).startsWith(`${name}=`)) || "";
  const match = String(raw).match(new RegExp(`${name}=([^;]+)`));
  if (match) return decodeURIComponent(match[1]);
  const html = String(res.text || "");
  const m = html.match(new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"`));
  return (m && m[1]) || "";
}

function cookieJar(sessionCookie, res) {
  const parts = [sessionCookie];
  for (const line of [].concat((res && res.headers && res.headers["set-cookie"]) || [])) {
    parts.push(String(line).split(";")[0]);
  }
  return parts.filter(Boolean).join("; ");
}

function makeApp() {
  return createV5FoundationApp({
    getPool: () => pool,
    env: BB_ENV,
  });
}

function assertVisibility(html, site) {
  assert.match(html, new RegExp(site.organizationKey));
  assert.match(html, /Product/);
  assert.match(html, /Public URL/);
  assert.match(html, /Website status/);
  assert.match(html, /Published version|current published version/i);
  assert.match(html, /Current draft/);
  assert.match(html, /Unpublished changes/);
  assert.match(html, /Last editor/);
  assert.match(html, /Last publisher/);
}

describe("v7 platform admin website control", () => {
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

  it("lists and details both products with required visibility and actions", async () => {
    if (!requireDb()) return;
    const clinic = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    assert.equal(clinic.ok, true, JSON.stringify(clinic));
    const body = churchBody();
    const church = await submitChurch(body);
    assert.equal(church.ok, true, JSON.stringify(church));
    const clinicKey = clinic.slug;
    const churchKey = church.records.organizationKey;

    const listed = await listPlatformAdminWebsites(pool, { tab: "overview" });
    const clinicRow = listed.websites.find((row) => row.organizationKey === clinicKey);
    const churchRow = listed.websites.find((row) => row.organizationKey === churchKey);
    assert.ok(clinicRow, "clinic missing from PA website list");
    assert.ok(churchRow, "church missing from PA website list");
    assert.equal(clinicRow.productCode, "activeclinic");
    assert.equal(churchRow.productCode, "blessboard");
    assert.equal(clinicRow.publicPath, `/clinics/${clinicKey}`);
    assert.equal(churchRow.publicPath, `/c/${churchKey}`);
    assert.ok(clinicRow.websiteStatus);
    assert.ok(churchRow.websiteStatus);
    assert.ok(clinicRow.currentDraft);
    assert.ok(churchRow.currentDraft);
    assert.equal(typeof clinicRow.unpublishedCount, "number");
    assert.equal(typeof churchRow.unpublishedCount, "number");
    assert.ok("lastEditor" in clinicRow && "lastPublisher" in clinicRow);
    assert.ok("lastEditor" in churchRow && "lastPublisher" in churchRow);
    assert.ok(clinicRow.actions.viewLive);
    assert.ok(clinicRow.actions.previewDraft);
    assert.ok(clinicRow.actions.history);
    assert.ok(churchRow.actions.viewLive);
    assert.ok(churchRow.actions.previewDraft);
    assert.ok(churchRow.actions.history);
    assert.ok(churchRow.currentVersionNumber >= 1);

    const clinicDetail = await loadPlatformAdminWebsiteDetail(pool, clinicKey);
    const churchDetail = await loadPlatformAdminWebsiteDetail(pool, churchKey);
    assert.equal(clinicDetail.ok, true);
    assert.equal(churchDetail.ok, true);
    assert.equal(clinicDetail.productCode, "activeclinic");
    assert.equal(churchDetail.productCode, "blessboard");
    assert.equal(clinicDetail.publicPath, `/clinics/${clinicKey}`);
    assert.equal(churchDetail.publicPath, `/c/${churchKey}`);
    assert.ok(clinicDetail.actions.changeSummary);
    assert.ok(churchDetail.actions.unpublish);
    assert.ok(churchDetail.actions.suspend);
    assert.ok(churchDetail.actions.resume);

    const paUser = await createBlessBoardUser(pool, {
      email: `pa-web-${stamp}@example.org`,
      password: PASSWORD,
      displayName: "Platform Admin",
    });
    assert.equal(paUser.ok, true, JSON.stringify(paUser));
    await pool.query(
      `INSERT INTO blessboard.user_roles (user_id, organization_id, role_key, status)
       VALUES ($1, $2, 'platform_admin', 'active')`,
      [paUser.user.id, clinic.organizationId]
    );
    const session = await createV5Session(pool, {
      deploymentCode: CODE_ORG_STAGING,
      userId: paUser.user.id,
      organizationId: clinic.organizationId,
    });
    assert.equal(session.ok, true, JSON.stringify(session));
    const paCookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
    const app = makeApp();

    const listPage = await request(app).get("/admin/websites").set("Host", "blessboard.org").set("Cookie", paCookie);
    assert.equal(listPage.status, 200, listPage.text.slice(0, 400));
    assert.match(listPage.text, /data-bb-pa-websites="1"/);
    assert.match(listPage.text, new RegExp(`data-bb-pa-website-row="${clinicKey}"`));
    assert.match(listPage.text, new RegExp(`data-bb-pa-website-row="${churchKey}"`));
    assert.match(listPage.text, /data-product="activeclinic"/);
    assert.match(listPage.text, /data-product="blessboard"/);
    assert.match(listPage.text, new RegExp(`/clinics/${clinicKey}`));
    assert.match(listPage.text, new RegExp(`/c/${churchKey}`));
    assert.match(listPage.text, /data-action-view-live="1"/);
    assert.match(listPage.text, /data-action-preview-draft="1"/);
    assert.match(listPage.text, /data-action-history="1"/);

    const clinicPage = await request(app)
      .get(`/admin/organizations/${clinicKey}/website`)
      .set("Host", "blessboard.org")
      .set("Cookie", paCookie);
    assert.equal(clinicPage.status, 200, clinicPage.text.slice(0, 400));
    assertVisibility(clinicPage.text, { organizationKey: clinicKey });
    assert.match(clinicPage.text, /data-product="activeclinic"/);
    assert.match(clinicPage.text, /data-action-view-live="1"/);
    assert.match(clinicPage.text, /data-action-preview-draft="1"/);
    assert.match(clinicPage.text, /data-action-change-summary="1"/);
    assert.match(clinicPage.text, /data-action-history="1"/);
    assert.match(clinicPage.text, /data-website-moderation="suspend"/);
    assert.match(clinicPage.text, /id="website-history"/);

    const churchPage = await request(app)
      .get(`/admin/organizations/${churchKey}/website`)
      .set("Host", "blessboard.org")
      .set("Cookie", paCookie);
    assert.equal(churchPage.status, 200, churchPage.text.slice(0, 400));
    assertVisibility(churchPage.text, { organizationKey: churchKey });
    assert.match(churchPage.text, /data-product="blessboard"/);
    assert.match(churchPage.text, /data-website-availability="public"/);
    assert.match(churchPage.text, /data-website-availability-form="unpublish"/);
    assert.match(churchPage.text, /data-website-moderation="suspend"/);
    assert.match(churchPage.text, /data-action-restore="1"/);
    assert.match(churchPage.text, /data-website-version-history="1"/);

    const clinicCsrf = extractCsrf(clinicPage, BB_ENV);
    const clinicJar = cookieJar(paCookie, clinicPage);
    const suspended = await request(app)
      .post(`/admin/organizations/${clinicKey}/website/suspend`)
      .set("Host", "blessboard.org")
      .set("Cookie", clinicJar)
      .type("form")
      .send({ [CSRF_FIELD]: clinicCsrf, reason: "PA website control audit" });
    assert.equal(suspended.status, 303);
    const clinicInst = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: clinic.organizationId,
      productCode: "activeclinic",
    });
    assert.equal(clinicInst.lifecycleStatus, LIFECYCLE_STATUS.SUSPENDED);

    const clinicAfter = await request(app)
      .get(`/admin/organizations/${clinicKey}/website`)
      .set("Host", "blessboard.org")
      .set("Cookie", paCookie);
    assert.match(clinicAfter.text, /data-website-moderation="restore"/);
    const resumeCsrf = extractCsrf(clinicAfter, BB_ENV);
    const resumed = await request(app)
      .post(`/admin/organizations/${clinicKey}/website/restore-site`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookieJar(paCookie, clinicAfter))
      .type("form")
      .send({ [CSRF_FIELD]: resumeCsrf });
    assert.equal(resumed.status, 303);

    const churchCsrf = extractCsrf(churchPage, BB_ENV);
    const unpublished = await request(app)
      .post(`/admin/organizations/${churchKey}/website/unpublish`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookieJar(paCookie, churchPage))
      .type("form")
      .send({ [CSRF_FIELD]: churchCsrf });
    assert.equal(unpublished.status, 303);
    const settings = await pool.query(
      `SELECT s.website_status
         FROM blessboard.church_settings s
         JOIN blessboard.churches c ON c.id = s.church_id
        WHERE c.organization_id = $1`,
      [church.records.organizationId]
    );
    assert.equal(settings.rows[0].website_status, "draft");

    const churchAfter = await request(app)
      .get(`/admin/organizations/${churchKey}/website`)
      .set("Host", "blessboard.org")
      .set("Cookie", paCookie);
    assert.match(churchAfter.text, /data-website-availability="not-public"/);
    assert.match(churchAfter.text, /data-website-availability-form="publish"/);
    const publishCsrf = extractCsrf(churchAfter, BB_ENV);
    const republished = await request(app)
      .post(`/admin/organizations/${churchKey}/website/publish`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookieJar(paCookie, churchAfter))
      .type("form")
      .send({ [CSRF_FIELD]: publishCsrf });
    assert.equal(republished.status, 303);
    const settingsAgain = await pool.query(
      `SELECT s.website_status
         FROM blessboard.church_settings s
         JOIN blessboard.churches c ON c.id = s.church_id
        WHERE c.organization_id = $1`,
      [church.records.organizationId]
    );
    assert.equal(settingsAgain.rows[0].website_status, "published");

    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: clinic.organizationId,
      productCode: "activeclinic",
    });
    const published = await publicationService.publishWebsiteDraft(pool, {
      organizationId: clinic.organizationId,
      instanceId: instance.id,
    });
    assert.equal(published.ok, true, JSON.stringify(published));
    const restored = await applyPlatformAdminWebsiteAction(pool, {
      organizationKey: clinicKey,
      action: "restore-version",
      versionId: published.version.id,
      actorIdentityId: clinic.identityId,
    });
    assert.equal(restored.ok, true, JSON.stringify(restored));
  });
});
