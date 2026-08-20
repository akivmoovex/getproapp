"use strict";

/**
 * Shared V7 website editable-field schema — inventory, validation, RBAC, tenant isolation.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
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
const { CSRF_FIELD, issueCsrfToken } = require("../src/platform/http/v5Csrf");
const instanceRepo = require("../src/platform/website/instanceRepository");
const contentService = require("../src/platform/website/contentService");
const { PERMISSIONS } = require("../src/platform/website/permissions");
const {
  PRODUCT_CODE,
  assertEditableMutation,
  resolveEditableField,
  listEditableFields,
  hasEditableField,
  ensureProductFieldsRegistered,
} = require("../src/platform/website/editableFieldSchema");
const { registerActiveClinicWebsiteTemplate } = require("../src/activeclinic/website/activeClinicWebsiteTemplate");
const {
  resolveEditableField: resolveBlessboardField,
} = require("../src/blessboard/services/websiteInlineEditableFields");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "clinic-admin-pass-12";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let skipReason = null;
let stamp = 0;
let phoneSeq = 890000000;

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
    clinicName: `Schema Clinic ${stamp}`,
    contactName: "Website Admin",
    contactEmail: `schema-${stamp}@example.invalid`,
    contactPhone: nextPhone(),
    province: "Lusaka Province",
    city: "Lusaka",
    address: "1 Independence Avenue",
    countryCode: "ZM",
    notes: "editable schema",
    password: PASSWORD,
    passwordConfirm: PASSWORD,
      acceptTerms: "on",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    dataEnvironment: "testing",
    env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    ...overrides,
  };
}

async function sessionCookie(identityId, orgId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId: orgId,
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

function extractCsrf(res) {
  const html = String(res.text || "");
  const meta = html.match(/name="csrf-token"\s+content="([^"]+)"/);
  if (meta) return meta[1];
  const field = html.match(new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"`));
  return field ? field[1] : issueCsrfToken(MINIMAL_AC);
}

function cookieHeader(session, pageRes) {
  const parts = [session];
  const set = pageRes && pageRes.headers && pageRes.headers["set-cookie"];
  if (Array.isArray(set)) parts.push(...set);
  else if (set) parts.push(set);
  return parts.join("; ");
}

describe("V7 website editable-field schema", () => {
  before(async () => {
    registerActiveClinicWebsiteTemplate();
    ensureProductFieldsRegistered(PRODUCT_CODE.BLESSBOARD);
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

  it("registers repository keys; does not invent unsupported aliases", () => {
    const ac = listEditableFields(PRODUCT_CODE.ACTIVECLINIC);
    const bb = listEditableFields(PRODUCT_CODE.BLESSBOARD);
    assert.ok(ac.length >= 20, `expected AC fields, got ${ac.length}`);
    assert.ok(bb.length >= 40, `expected BB fields, got ${bb.length}`);

    assert.equal(hasEditableField(PRODUCT_CODE.ACTIVECLINIC, "home.hero.title"), true);
    assert.equal(hasEditableField(PRODUCT_CODE.ACTIVECLINIC, "home.hero.subtitle"), true);
    assert.equal(hasEditableField(PRODUCT_CODE.ACTIVECLINIC, "home.hero.image"), true);
    assert.equal(hasEditableField(PRODUCT_CODE.ACTIVECLINIC, "contact.phone"), true);
    assert.equal(hasEditableField(PRODUCT_CODE.ACTIVECLINIC, "contact.email"), true);
    assert.equal(hasEditableField(PRODUCT_CODE.ACTIVECLINIC, "location.address"), true);
    assert.equal(hasEditableField(PRODUCT_CODE.ACTIVECLINIC, "about.story.body"), true);

    assert.equal(hasEditableField(PRODUCT_CODE.ACTIVECLINIC, "about.introduction"), false);
    assert.equal(hasEditableField(PRODUCT_CODE.ACTIVECLINIC, "contact.address"), false);
    assert.equal(hasEditableField(PRODUCT_CODE.ACTIVECLINIC, "home.hero.heading"), false);

    assert.equal(hasEditableField(PRODUCT_CODE.BLESSBOARD, "home.hero.heading"), true);
    assert.equal(hasEditableField(PRODUCT_CODE.BLESSBOARD, "home.hero.body_text"), true);
    assert.equal(hasEditableField(PRODUCT_CODE.BLESSBOARD, "contact.details.phone"), true);
    assert.equal(hasEditableField(PRODUCT_CODE.BLESSBOARD, "contact.details.email"), true);
    assert.equal(hasEditableField(PRODUCT_CODE.BLESSBOARD, "contact.details.address"), true);
    assert.equal(hasEditableField(PRODUCT_CODE.BLESSBOARD, "about.story.body_text"), true);

    assert.equal(hasEditableField(PRODUCT_CODE.BLESSBOARD, "home.hero.title"), false);
    assert.equal(hasEditableField(PRODUCT_CODE.BLESSBOARD, "about.introduction"), false);
    assert.equal(hasEditableField(PRODUCT_CODE.BLESSBOARD, "contact.phone"), false);

    const title = resolveEditableField({
      productCode: PRODUCT_CODE.ACTIVECLINIC,
      key: "home.hero.title",
    });
    assert.equal(title.ok, true);
    assert.equal(title.field.type, "short_text");
    assert.equal(title.field.permission, PERMISSIONS.EDIT);
    assert.equal(title.field.storage.kind, "platform_content_key");

    const heading = resolveEditableField({
      productCode: PRODUCT_CODE.BLESSBOARD,
      pageKey: "home",
      sectionKey: "hero",
      fieldKey: "heading",
    });
    assert.equal(heading.ok, true);
    assert.equal(heading.field.key, "home.hero.heading");
    assert.equal(heading.field.permission, PERMISSIONS.EDIT);
    assert.equal(heading.field.storage.fieldKey, "heading");
    assert.ok(resolveBlessboardField("home", "hero", "heading"));
    assert.equal(resolveBlessboardField("home", "hero", "notARealField"), null);
  });

  it("valid mutation is accepted; invalid key and value are rejected", () => {
    const valid = assertEditableMutation({
      productCode: PRODUCT_CODE.ACTIVECLINIC,
      key: "home.hero.title",
      value: "Sunrise Clinic",
      grantedPermissions: [PERMISSIONS.EDIT],
    });
    assert.equal(valid.ok, true);
    assert.equal(valid.value, "Sunrise Clinic");

    const unknown = assertEditableMutation({
      productCode: PRODUCT_CODE.ACTIVECLINIC,
      key: "about.introduction",
      value: "nope",
      grantedPermissions: [PERMISSIONS.EDIT],
    });
    assert.equal(unknown.ok, false);
    assert.equal(unknown.code, "unknown_content_key");

    const html = assertEditableMutation({
      productCode: PRODUCT_CODE.ACTIVECLINIC,
      key: "home.hero.title",
      value: "<script>alert(1)</script>",
      grantedPermissions: [PERMISSIONS.EDIT],
    });
    assert.equal(html.ok, false);
    assert.equal(html.code, "validation_failed");

    const bbUnknown = assertEditableMutation({
      productCode: PRODUCT_CODE.BLESSBOARD,
      pageKey: "home",
      sectionKey: "hero",
      fieldKey: "notARealField",
      value: "x",
      grantedPermissions: [PERMISSIONS.EDIT],
    });
    assert.equal(bbUnknown.ok, false);
    assert.equal(bbUnknown.code, "unknown_content_key");

    const bbValid = assertEditableMutation({
      productCode: PRODUCT_CODE.BLESSBOARD,
      pageKey: "home",
      sectionKey: "hero",
      fieldKey: "heading",
      value: "Welcome",
      grantedPermissions: [PERMISSIONS.EDIT],
    });
    assert.equal(bbValid.ok, true);
    assert.equal(bbValid.value, "Welcome");
  });

  it("unauthorized callers cannot mutate through the schema", () => {
    const viewOnly = assertEditableMutation({
      productCode: PRODUCT_CODE.ACTIVECLINIC,
      key: "home.hero.title",
      value: "Hacked",
      grantedPermissions: [PERMISSIONS.VIEW],
    });
    assert.equal(viewOnly.ok, false);
    assert.equal(viewOnly.code, "forbidden");

    const missing = assertEditableMutation({
      productCode: PRODUCT_CODE.BLESSBOARD,
      key: "home.hero.heading",
      value: "Hacked",
      grantedPermissions: [],
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.code, "forbidden");
  });

  it("valid, invalid, unauthorized, and cross-tenant HTTP/service mutations are enforced", async () => {
    if (!requireDb()) return;
    const a = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    const b = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    const instanceA = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: a.organizationId,
      productCode: "activeclinic",
    });
    const valid = await contentService.saveWebsiteDraft(pool, {
      organizationId: a.organizationId,
      instanceId: instanceA.id,
      contentKey: "home.hero.title",
      value: "Schema Live Title",
      grantedPermissions: [PERMISSIONS.EDIT],
    });
    assert.equal(valid.ok, true, JSON.stringify(valid));

    const invalidKey = await contentService.saveWebsiteDraft(pool, {
      organizationId: a.organizationId,
      instanceId: instanceA.id,
      contentKey: "about.introduction",
      value: "invented",
      grantedPermissions: [PERMISSIONS.EDIT],
    });
    assert.equal(invalidKey.ok, false);
    assert.equal(invalidKey.code, "unknown_content_key");

    const invalidValue = await contentService.saveWebsiteDraft(pool, {
      organizationId: a.organizationId,
      instanceId: instanceA.id,
      contentKey: "home.hero.title",
      value: "<b>html</b>",
      grantedPermissions: [PERMISSIONS.EDIT],
    });
    assert.equal(invalidValue.ok, false);
    assert.equal(invalidValue.code, "validation_failed");

    const unauthorized = await contentService.saveWebsiteDraft(pool, {
      organizationId: a.organizationId,
      instanceId: instanceA.id,
      contentKey: "home.hero.title",
      value: "No permission",
      grantedPermissions: [PERMISSIONS.VIEW],
    });
    assert.equal(unauthorized.ok, false);
    assert.equal(unauthorized.code, "forbidden");

    const crossed = await contentService.saveWebsiteDraft(pool, {
      organizationId: b.organizationId,
      instanceId: instanceA.id,
      contentKey: "home.hero.title",
      value: "tenant B rewrite",
      grantedPermissions: [PERMISSIONS.EDIT],
    });
    assert.equal(crossed.ok, false);

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const adminCookie = await sessionCookie(a.identityId, a.organizationId);
    const editPage = await request(app)
      .get(`/clinics/${a.slug}?website_edit=1&website_mode=draft`)
      .set("Cookie", adminCookie);
    const csrf = extractCsrf(editPage);
    const httpUnknown = await request(app)
      .post(`/clinics/${a.slug}/website/drafts`)
      .set("Cookie", cookieHeader(adminCookie, editPage))
      .send({ [CSRF_FIELD]: csrf, contentKey: "about.introduction", value: "nope" });
    assert.equal(httpUnknown.status, 400, httpUnknown.text);
    assert.equal(JSON.parse(httpUnknown.text).code, "unknown_content_key");

    const otherCookie = await sessionCookie(b.identityId, b.organizationId);
    const httpCross = await request(app)
      .post(`/clinics/${a.slug}/website/drafts`)
      .set("Cookie", otherCookie)
      .send({ [CSRF_FIELD]: csrf, contentKey: "home.hero.title", value: "cross" });
    assert.ok(httpCross.status === 403 || httpCross.status === 404);
  });
});
