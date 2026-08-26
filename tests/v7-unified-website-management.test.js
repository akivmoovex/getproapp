"use strict";

/**
 * V7 unified website management — settings, populated templates,
 * inline draft saves, URL builder, and RBAC.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

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
const publicationService = require("../src/platform/website/publicationService");
const resolver = require("../src/platform/website/resolver");
const { authorizeWebsiteInstance } = require("../src/platform/website/authorizeWebsite");
const { PERMISSIONS } = require("../src/platform/website/permissions");
const { INLINE_SAVE_PUBLISHES, assertAllowlistedContentKey, isMultilineFieldType } = require("../src/platform/website/inlineEditorContract");
const { registerActiveClinicWebsiteTemplate } = require("../src/activeclinic/website/activeClinicWebsiteTemplate");
const {
  PRODUCT_CODE,
  buildPublicOrganizationWebsitePath,
  buildPublicOrganizationWebsiteUrl,
  buildPublicWebsiteEditPath,
  publicWebsitePathPrefix,
  canonicalRedirectFromAlias,
} = require("../src/platform/website/publicWebsiteUrl");
const { publicClinicPath } = require("../src/activeclinic/services/clinicWebsiteAvailabilityService");
const { publicChurchHomePath } = require("../src/blessboard/urls/churchUrlHelper");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  STAFF_ROLE,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  createPlatformIdentity,
} = require("../src/platform/services/platformIdentityService");
const {
  setPlatformIdentityPassword,
} = require("../src/platform/services/platformIdentityCredentialService");

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
let phoneSeq = 880000000;
let ipSeq = 20;

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
    clinicName: `UWM Clinic ${stamp}`,
    contactName: "Website Admin",
    contactEmail: `uwm-${stamp}@example.invalid`,
    contactPhone: nextPhone(),
    province: "Lusaka Province",
    city: "Lusaka",
    address: "1 Independence Avenue",
    countryCode: "ZM",
    notes: "unified website management",
    password: PASSWORD,
    passwordConfirm: PASSWORD,
      acceptTerms: "on",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    dataEnvironment: "testing",
    env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    ...overrides,
  };
}

function churchBody(overrides) {
  stamp += 1;
  const key = `uwmch${stamp}${crypto.randomBytes(3).toString("hex")}`;
  return {
    church_name: `UWM Church ${stamp} ${key}`,
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
    requestId: `uwm-${Date.now()}-${ipSeq}`,
    get: () => "uwm-test-agent",
  };
}

async function submitChurch(body) {
  const validation = validatePlatformChurchRegistration(body, { instantFreeEnabled: true });
  assert.equal(validation.ok, true, JSON.stringify(validation));
  return submitChurchRegistration(pool, fakeReq(), validation, {
    env: { PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging" },
    dataEnvironment: "testing",
    deploymentCode: "blessboard-org-staging",
  });
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

function makeApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: MINIMAL_AC,
    log: () => {},
  });
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

describe("V7 unified website management", () => {
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

  it("22-24 shared URL builder uses equivalent templates with product prefixes", () => {
    const ac = buildPublicOrganizationWebsitePath({
      product: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: "sunrise-clinic",
    });
    const bb = buildPublicOrganizationWebsitePath({
      product: PRODUCT_CODE.BLESSBOARD,
      organizationKey: "sunrise-church",
    });
    assert.equal(ac, "/clinics/sunrise-clinic");
    assert.equal(bb, "/c/sunrise-church");
    assert.equal(publicWebsitePathPrefix(PRODUCT_CODE.ACTIVECLINIC), "/clinics");
    assert.equal(publicWebsitePathPrefix(PRODUCT_CODE.BLESSBOARD), "/c");
    assert.equal(publicClinicPath("sunrise-clinic"), ac);
    assert.equal(publicChurchHomePath("sunrise-church"), bb);
    assert.equal(
      buildPublicOrganizationWebsiteUrl({
        product: PRODUCT_CODE.ACTIVECLINIC,
        organizationKey: "sunrise-clinic",
        origin: "https://activeclinic.pronline.org",
      }),
      "https://activeclinic.pronline.org/clinics/sunrise-clinic"
    );
    assert.equal(
      buildPublicOrganizationWebsiteUrl({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: "sunrise-church",
        origin: "https://blessboard.pronline.org",
      }),
      "https://blessboard.pronline.org/c/sunrise-church"
    );
    assert.equal(
      buildPublicWebsiteEditPath({
        product: PRODUCT_CODE.ACTIVECLINIC,
        organizationKey: "sunrise-clinic",
      }),
      "/clinics/sunrise-clinic?website_edit=1&website_mode=draft"
    );
    assert.equal(
      buildPublicWebsiteEditPath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: "sunrise-church",
      }),
      "/c/sunrise-church?website_edit=1"
    );
  });

  it("25 ActiveClinic /c alias maps onto canonical /clinics path", () => {
    assert.equal(
      canonicalRedirectFromAlias(PRODUCT_CODE.ACTIVECLINIC, "/c/sunrise-clinic/about"),
      "/clinics/sunrise-clinic/about"
    );
    assert.equal(
      canonicalRedirectFromAlias(PRODUCT_CODE.ACTIVECLINIC, "/c/sunrise-clinic/about?keep=1"),
      "/clinics/sunrise-clinic/about?keep=1"
    );
    assert.equal(
      canonicalRedirectFromAlias(PRODUCT_CODE.ACTIVECLINIC, "/clinics/sunrise-clinic/about?keep=1"),
      null
    );
    assert.equal(
      canonicalRedirectFromAlias(PRODUCT_CODE.BLESSBOARD, "/c/sunrise-church/about"),
      null
    );
  });

  it("4 new clinic receives populated tenant-owned website draft with registration contact", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    const result = await submitAndProvisionClinicRegistration(pool, payload);
    assert.equal(result.ok, true, JSON.stringify(result));
    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: result.organizationId,
      productCode: "activeclinic",
    });
    assert.ok(instance);
    const rows = await contentService.listWebsiteContent(pool, instance, result.organizationId);
    const byKey = Object.fromEntries(rows.map((row) => [row.contentKey, row.draftValue]));
    assert.equal(byKey["home.hero.title"], payload.clinicName);
    assert.match(String(byKey["home.hero.subtitle"] || ""), /Welcome to/);
    assert.notEqual(String(byKey["home.hero.subtitle"] || ""), "Website being set up");
    assert.equal(byKey["contact.email"], payload.contactEmail);
    assert.ok(String(byKey["contact.phone"] || "").length > 4);
    assert.equal(byKey["location.address"], payload.address);
    assert.ok(Array.isArray(byKey["home.faq"]) && byKey["home.faq"].length >= 1);
    const demoRows = await pool.query(
      `SELECT organization_id FROM platform.website_content WHERE instance_id = $1`,
      [instance.id]
    );
    assert.ok(demoRows.rows.every((row) => row.organization_id === result.organizationId));
  });

  it("5-8 new church receives populated tenant-owned copy; tenants stay isolated", async () => {
    if (!requireDb()) return;
    const aBody = churchBody();
    const bBody = churchBody();
    const a = await submitChurch(aBody);
    const b = await submitChurch(bBody);
    assert.equal(a.ok, true, JSON.stringify(a));
    assert.equal(b.ok, true, JSON.stringify(b));
    const churchA = await pool.query(
      `SELECT id FROM blessboard.churches WHERE organization_id = $1`,
      [a.records.organizationId]
    );
    const churchB = await pool.query(
      `SELECT id FROM blessboard.churches WHERE organization_id = $1`,
      [b.records.organizationId]
    );
    const welcomeA = await pool.query(
      `SELECT ps.id, ps.heading, ps.body_text
         FROM blessboard.page_sections ps
         JOIN blessboard.public_pages pp ON pp.id = ps.page_id
        WHERE pp.church_id = $1 AND pp.page_key = 'home' AND ps.section_key = 'welcome'`,
      [churchA.rows[0].id]
    );
    const welcomeB = await pool.query(
      `SELECT ps.id, ps.heading, ps.body_text
         FROM blessboard.page_sections ps
         JOIN blessboard.public_pages pp ON pp.id = ps.page_id
        WHERE pp.church_id = $1 AND pp.page_key = 'home' AND ps.section_key = 'welcome'`,
      [churchB.rows[0].id]
    );
    assert.equal(welcomeA.rowCount, 1);
    assert.equal(welcomeB.rowCount, 1);
    assert.notEqual(welcomeA.rows[0].id, welcomeB.rows[0].id);
    assert.match(String(welcomeA.rows[0].body_text || welcomeA.rows[0].heading || ""), new RegExp(aBody.church_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.notEqual(String(welcomeA.rows[0].body_text || "").slice(0, 40), "Church is getting started on BlessBoard");
    const contactA = await pool.query(
      `SELECT ps.body_text
         FROM blessboard.page_sections ps
         JOIN blessboard.public_pages pp ON pp.id = ps.page_id
        WHERE pp.church_id = $1 AND pp.page_key = 'contact' AND ps.section_key = 'contact'`,
      [churchA.rows[0].id]
    );
    assert.ok(contactA.rowCount >= 1);
    assert.match(String(contactA.rows[0].body_text || ""), /@example\.org/);
    await pool.query(`UPDATE blessboard.page_sections SET heading = 'Mutated A' WHERE id = $1`, [
      welcomeA.rows[0].id,
    ]);
    const afterB = await pool.query(`SELECT heading FROM blessboard.page_sections WHERE id = $1`, [
      welcomeB.rows[0].id,
    ]);
    assert.notEqual(afterB.rows[0].heading, "Mutated A");
  });

  it("1,3,9,10 settings Website card and detail for authorized admin; ordinary staff is excluded", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    const result = await submitAndProvisionClinicRegistration(pool, payload);
    assert.equal(result.ok, true, JSON.stringify(result));
    const app = makeApp();
    const adminCookie = await sessionCookie(result.identityId, result.organizationId);
    const overview = await request(app).get("/app/settings").set("Cookie", adminCookie);
    assert.equal(overview.status, 200);
    assert.match(overview.text, /data-ac-settings-card="website"/);
    const detail = await request(app).get("/app/settings/website").set("Cookie", adminCookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-ac-website-management="1"/);
    assert.match(detail.text, /data-ac-website-status-label="1"/);
    assert.match(detail.text, /data-ac-website-draft-state="1"/);
    assert.match(detail.text, /data-ac-website-public-url="1"/);
    assert.match(detail.text, /data-ac-website-published-version="1"/);
    assert.match(detail.text, /data-ac-website-unpublished=/);
    assert.match(detail.text, /Website not published yet/);
    assert.doesNotMatch(detail.text, /data-ac-website-action="view-live"/);
    assert.match(detail.text, /data-ac-website-action="edit"/);
    assert.match(detail.text, /data-ac-website-action="preview"/);
    assert.match(detail.text, /data-ac-website-action="publish"/);
    assert.match(detail.text, /data-ac-website-action="history"/);
    assert.match(detail.text, /Website Management/i);
    const expectedPath = buildPublicOrganizationWebsitePath({
      product: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey: result.slug,
    });
    assert.match(detail.text, new RegExp(String(expectedPath).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const staffPhone = nextPhone();
    const staffIdentity = await createPlatformIdentity(pool, {
      primaryPhone: staffPhone,
      phoneNormalized: staffPhone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    await setPlatformIdentityPassword(pool, {
      identityId: staffIdentity.identity.id,
      password: PASSWORD,
    });
    const facility = await pool.query(
      `SELECT id FROM activeclinic.facilities WHERE organization_id = $1 AND is_primary = true LIMIT 1`,
      [result.organizationId]
    );
    const staff = await createStaffMember(pool, {
      organizationId: result.organizationId,
      healthcareOrganizationId: result.healthcareOrganization && result.healthcareOrganization.id,
      firstName: "Ord",
      lastName: "Staff",
      employmentType: "permanent",
      phone: nextPhone(),
      status: "active",
      platformIdentityId: staffIdentity.identity.id,
      jobTitle: "Clerk",
    });
    assert.equal(staff.ok, true, JSON.stringify(staff));
    await assignStaffToFacility(pool, {
      organizationId: result.organizationId,
      staffMemberId: staff.staffMember.id,
      facilityId: facility.rows[0].id,
      isPrimary: true,
    });
    await assignStaffRole(pool, {
      organizationId: result.organizationId,
      staffMemberId: staff.staffMember.id,
      roleKey: STAFF_ROLE,
      scopeType: "facility",
      facilityId: facility.rows[0].id,
    });
    const staffCookie = await sessionCookie(staffIdentity.identity.id, result.organizationId);
    const staffOverview = await request(app).get("/app/settings").set("Cookie", staffCookie);
    assert.equal(staffOverview.status, 200);
    assert.doesNotMatch(staffOverview.text, /data-ac-settings-card="website"/);
    const staffDetail = await request(app).get("/app/settings/website").set("Cookie", staffCookie);
    assert.equal(staffDetail.status, 403);
    assert.doesNotMatch(staffDetail.text, /data-ac-website-action="edit"/);
    assert.doesNotMatch(staffDetail.text, /data-ac-website-action="publish"/);
  });

  it("11,16 edit mode exposes pencils; anonymous visitors do not", async () => {
    if (!requireDb()) return;
    const result = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    const app = makeApp();
    const slug = result.slug;
    const anon = await request(app).get(`/clinics/${slug}?website_edit=1`);
    assert.doesNotMatch(anon.text, /data-website-start/);
    assert.doesNotMatch(anon.text, /data-ac-website-action="edit"/);
    assert.doesNotMatch(anon.text, />Edit website</);
    const adminCookie = await sessionCookie(result.identityId, result.organizationId);
    const edit = await request(app)
      .get(`/clinics/${slug}?website_edit=1&website_mode=draft`)
      .set("Cookie", adminCookie);
    assert.equal(edit.status, 200);
    assert.match(edit.text, /data-website-chrome/);
    assert.match(edit.text, /data-website-chrome-stack/);
    assert.match(edit.text, /website-editor-mobile\.js/);
    assert.match(edit.text, /Edit website|Editing draft|Exit edit mode/);
    assert.match(edit.text, /data-website-preview="1"/);
    assert.match(edit.text, /data-website-start="1"/);
    assert.match(edit.text, /data-website-save="1"/);
    assert.match(edit.text, /data-website-cancel="1"/);
    assert.match(edit.text, /data-website-type="image"/);
    assert.match(edit.text, /data-website-input="1"/);
    assert.match(edit.text, /<textarea[\s\S]*data-website-input="1"/);
    assert.match(edit.text, /data-website-current/);
    assert.match(edit.text, /Choose or replace image/);
    assert.doesNotMatch(edit.text, /contenteditable/);
    assert.match(edit.text, /data-website-key="home.hero.title"/);
    assert.match(edit.text, /data-website-key="home.hero.subtitle"/);
    assert.match(edit.text, /data-website-key="home.hero.image"/);
    assert.match(edit.text, /data-website-key="home.hero.eyebrow"/);
  });

  it("13,18-21 field save writes draft only; publish is required for live", async () => {
    if (!requireDb()) return;
    const result = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: result.organizationId,
      productCode: "activeclinic",
    });
    const published = await publicationService.publishWebsiteDraft(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
    });
    assert.equal(published.ok, true, JSON.stringify(published));
    const liveTitle = (
      await resolver.resolveWebsiteContent(pool, {
        organizationId: result.organizationId,
        instance,
        mode: resolver.MODE.LIVE,
      })
    ).values["home.hero.title"];
    const saved = await publicationService.saveDraftAndMaybePublish(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      contentKey: "home.hero.title",
      value: "Draft After Live",
    });
    assert.equal(saved.ok, true);
    assert.equal(saved.published, false);
    assert.equal(saved.code === "saved_and_published", false);
    const live = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(live.values["home.hero.title"], liveTitle);
    const draft = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.DRAFT,
    });
    assert.equal(draft.values["home.hero.title"], "Draft After Live");
    const afterPublish = await publicationService.publishWebsiteDraft(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
    });
    assert.equal(afterPublish.ok, true);
    const live2 = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(live2.values["home.hero.title"], "Draft After Live");

    const app = makeApp();
    const adminCookie = await sessionCookie(result.identityId, result.organizationId);
    const editPage = await request(app)
      .get(`/clinics/${result.slug}?website_edit=1&website_mode=draft`)
      .set("Cookie", adminCookie);
    const csrf = extractCsrf(editPage);
    const httpSave = await request(app)
      .post(`/clinics/${result.slug}/website/drafts`)
      .set("Cookie", cookieHeader(adminCookie, editPage))
      .send({ [CSRF_FIELD]: csrf, contentKey: "home.hero.title", value: "HTTP Draft Only" });
    assert.equal(httpSave.status, 200, httpSave.text);
    const httpBody = JSON.parse(httpSave.text);
    assert.equal(httpBody.ok, true);
    assert.equal(httpBody.published, false);
    assert.equal(httpBody.code, "saved_to_draft");
    const liveAfterHttp = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(liveAfterHttp.values["home.hero.title"], "Draft After Live");
    const draftAfterHttp = await resolver.resolveWebsiteContent(pool, {
      organizationId: result.organizationId,
      instance,
      mode: resolver.MODE.DRAFT,
    });
    assert.equal(draftAfterHttp.values["home.hero.title"], "HTTP Draft Only");
  });

  it("28-30 unknown paths, cross-tenant, and missing website.edit are blocked", async () => {
    if (!requireDb()) return;
    const a = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    const b = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    const instanceA = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: a.organizationId,
      productCode: "activeclinic",
    });
    const unknown = await contentService.saveWebsiteDraft(pool, {
      organizationId: a.organizationId,
      instanceId: instanceA.id,
      contentKey: "not.an.allowlisted.path",
      value: "nope",
    });
    assert.equal(unknown.ok, false);
    assert.equal(unknown.code, "unknown_content_key");
    const crossed = await contentService.saveWebsiteDraft(pool, {
      organizationId: b.organizationId,
      instanceId: instanceA.id,
      contentKey: "home.hero.title",
      value: "tenant B rewrite",
    });
    assert.equal(crossed.ok, false);
    const app = makeApp();
    const adminCookie = await sessionCookie(a.identityId, a.organizationId);
    const editPage = await request(app)
      .get(`/clinics/${a.slug}?website_edit=1&website_mode=draft`)
      .set("Cookie", adminCookie);
    const csrf = extractCsrf(editPage);
    const unknownHttp = await request(app)
      .post(`/clinics/${a.slug}/website/drafts`)
      .set("Cookie", cookieHeader(adminCookie, editPage))
      .send({ [CSRF_FIELD]: csrf, contentKey: "not.an.allowlisted.path", value: "nope" });
    assert.equal(unknownHttp.status, 400, unknownHttp.text);
    assert.equal(JSON.parse(unknownHttp.text).code, "unknown_content_key");
    const forbidden = await authorizeWebsiteInstance(pool, {
      organizationId: a.organizationId,
      instanceId: instanceA.id,
      grantedPermissions: ["website.view"],
      permission: PERMISSIONS.EDIT,
    });
    assert.equal(forbidden.ok, false);
    assert.equal(forbidden.code, "forbidden");
    const allowed = await authorizeWebsiteInstance(pool, {
      organizationId: a.organizationId,
      instanceId: instanceA.id,
      grantedPermissions: [PERMISSIONS.EDIT],
      permission: PERMISSIONS.EDIT,
    });
    assert.equal(allowed.ok, true);
  });

  it("31 user lacking website.publish cannot authorize publish", async () => {
    if (!requireDb()) return;
    const result = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: result.organizationId,
      productCode: "activeclinic",
    });
    const denied = await authorizeWebsiteInstance(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      grantedPermissions: [PERMISSIONS.EDIT],
      permission: PERMISSIONS.PUBLISH,
    });
    assert.equal(denied.ok, false);
    const ok = await authorizeWebsiteInstance(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      grantedPermissions: [PERMISSIONS.PUBLISH],
      permission: PERMISSIONS.PUBLISH,
    });
    assert.equal(ok.ok, true);
  });

  it("25 HTTP /c/:clinicKey redirects to canonical /clinics path", async () => {
    if (!requireDb()) return;
    const result = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    const app = makeApp();
    const res = await request(app).get(`/c/${result.slug}/about?keep=1`);
    assert.equal(res.status, 301);
    assert.equal(res.headers.location, `/clinics/${encodeURIComponent(result.slug)}/about?keep=1`);
  });

  it("shared editor markup uses pencil then save/cancel; field save is draft-only in JS", () => {
    const acJs = fs.readFileSync(
      path.join(__dirname, "../public/platform/website-inline-edit.js"),
      "utf8"
    );
    const acField = fs.readFileSync(
      path.join(__dirname, "../views/activeclinic/partials/website-editable-field.ejs"),
      "utf8"
    );
    const bbField = fs.readFileSync(
      path.join(__dirname, "../views/blessboard/v5/partials/editable-text.ejs"),
      "utf8"
    );
    assert.match(acField, /data-website-start/);
    assert.match(acField, /data-website-save/);
    assert.match(acField, /data-website-cancel/);
    assert.match(acField, /data-website-input="1"/);
    assert.match(acField, /<textarea/);
    assert.doesNotMatch(acField, /contenteditable/);
    assert.match(bbField, /data-bb-inline-start|data-bb-inline-save/);
    assert.match(bbField, /data-bb-inline-cancel/);
    assert.match(bbField, /data-bb-inline-input="1"/);
    assert.doesNotMatch(bbField, /data-bb-inline-save-publish/);
    assert.doesNotMatch(bbField, /contenteditable/);
    assert.match(acJs, /Saved to draft/);
    assert.match(acJs, /published === true/);
    assert.doesNotMatch(acJs, /drafts\/discard/);
    const bbJs = fs.readFileSync(
      path.join(__dirname, "../public/blessboard/v5/website-inline-edit.js"),
      "utf8"
    );
    assert.match(bbJs, /result\.data\.published/);
    assert.doesNotMatch(bbJs, /saveAndPublishField/);
    assert.equal(INLINE_SAVE_PUBLISHES, false);
    assert.equal(isMultilineFieldType("long_text"), true);
    assert.equal(isMultilineFieldType("short_text"), false);
    registerActiveClinicWebsiteTemplate();
    const allowed = assertAllowlistedContentKey({
      templateId: "activeclinic_clinic",
      templateVersion: 1,
      contentKey: "home.hero.title",
    });
    assert.equal(allowed.ok, true);
    const blocked = assertAllowlistedContentKey({
      templateId: "activeclinic_clinic",
      templateVersion: 1,
      contentKey: "not.an.allowlisted.path",
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, "unknown_content_key");
  });

  it("26-27 settings and preview URLs come from the shared builder", () => {
    const urls = require("../src/platform/website/publicWebsiteUrl");
    assert.equal(
      urls.buildPublicWebsiteEditPath({
        product: PRODUCT_CODE.ACTIVECLINIC,
        organizationKey: "demo",
      }),
      "/clinics/demo?website_edit=1&website_mode=draft"
    );
    assert.equal(
      urls.buildPublicWebsitePreviewPath({
        product: PRODUCT_CODE.ACTIVECLINIC,
        organizationKey: "demo",
      }),
      "/clinics/demo/website/preview"
    );
    assert.equal(
      urls.buildPublicWebsiteSettingsPath({ product: PRODUCT_CODE.ACTIVECLINIC }),
      "/app/settings/website"
    );
    assert.equal(
      urls.buildPublicWebsiteEditPath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: "demo",
      }),
      "/c/demo?website_edit=1"
    );
    assert.equal(
      urls.buildPublicWebsitePreviewPath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: "demo",
      }),
      "/c/demo?website_mode=draft"
    );
    assert.equal(
      urls.buildPublicWebsiteSettingsPath({ product: PRODUCT_CODE.BLESSBOARD }),
      "/hq/website"
    );
  });
});
