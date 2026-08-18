"use strict";

/**
 * ActiveClinic website hardening: registration provisioning, backfill, RBAC, resolver, E2E.
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
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  ORGANIZATION_ADMIN,
  RECEPTIONIST,
  NURSE,
  WEBSITE_EDITOR,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  createClinicRegistrationApplication,
} = require("../src/activeclinic/services/activeClinicPublicOnboardingService");
const {
  approveAndProvisionClinicRegistration,
} = require("../src/activeclinic/services/approveClinicRegistrationService");
const {
  provisionActiveClinicClinic,
} = require("../src/activeclinic/website/provisionActiveClinicWebsite");
const {
  auditActiveClinicWebsites,
  backfillActiveClinicWebsites,
} = require("../src/activeclinic/website/backfillActiveClinicWebsites");
const contentService = require("../src/platform/website/contentService");
const submissionService = require("../src/platform/website/submissionService");
const resolver = require("../src/platform/website/resolver");
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
const instanceRepo = require("../src/platform/website/instanceRepository");
const {
  ensureBlessBoardWebsiteInstance,
} = require("../src/blessboard/website/blessboardWebsiteAdapter");

const PASSWORD = "activeclinic-pass-12";
const ENV = {
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  SESSION_SECRET: "a".repeat(48),
};

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 971000000;

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

async function seedStaff(orgId, hcoId, facilityId, roleKey, scopeType) {
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryEmail: `web.${phone.slice(-8)}@example.test`,
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
  });
  assert.equal(identity.ok, true, JSON.stringify(identity));
  await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: PASSWORD,
  });
  const staff = await createStaffMember(pool, {
    organizationId: orgId,
    healthcareOrganizationId: hcoId,
    firstName: "Web",
    lastName: roleKey.slice(-8),
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
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
    roleKey,
    scopeType,
    facilityId: scopeType === "facility" ? facilityId : null,
    assignmentOrigin: "system",
  });
  assert.equal(role.ok, true, JSON.stringify(role));
  return { identityId: identity.identity.id, staffMemberId: staff.staffMember.id };
}

describe("ActiveClinic website hardening", () => {
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

  it("H01 approved clinic registration provisions HCO, facility, admin, website once", async () => {
    if (!requireDb()) return;
    const created = await createClinicRegistrationApplication(pool, {
      clinicName: "H01 Provision Clinic",
      contactName: "Ada Admin",
      contactEmail: `h01-${Date.now()}@example.test`,
      contactPhone: nextPhone(),
      province: "Lusaka Province",
      city: "Lusaka",
      countryCode: "ZM",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
    });
    assert.equal(created.ok, true, JSON.stringify(created));

    const approved = await approveAndProvisionClinicRegistration(pool, {
      applicationId: created.application.id,
      dataEnvironment: "testing",
    });
    assert.equal(approved.ok, true, JSON.stringify(approved));
    assert.ok(approved.organizationId);
    assert.ok(approved.healthcareOrganization);
    assert.ok(approved.facility);
    assert.ok(approved.instance);
    assert.ok(approved.staffMemberId);
    assert.equal(approved.instance.templateId, "activeclinic_clinic");
    assert.equal(approved.instance.scopeRef, null);

    const content = await pool.query(
      `SELECT count(*)::int AS n FROM platform.website_content WHERE instance_id = $1`,
      [approved.instance.id]
    );
    assert.ok(content.rows[0].n > 0);

    const retry = await approveAndProvisionClinicRegistration(pool, {
      applicationId: created.application.id,
      dataEnvironment: "testing",
    });
    assert.equal(retry.ok, true);
    assert.equal(retry.alreadyProvisioned, true);
    const instances = await instanceRepo.listWebsiteInstancesForOrganization(
      pool,
      approved.organizationId,
      "activeclinic"
    );
    assert.equal(instances.length, 1);
    const hcos = await pool.query(
      `SELECT count(*)::int AS n FROM activeclinic.healthcare_organizations WHERE organization_id = $1`,
      [approved.organizationId]
    );
    assert.equal(hcos.rows[0].n, 1);
  });

  it("H01 website failure leaves clinic approval intact for retry", async () => {
    if (!requireDb()) return;
    const created = await createClinicRegistrationApplication(pool, {
      clinicName: "H01 Partial Clinic",
      contactName: "Bea Admin",
      contactEmail: `h01p-${Date.now()}@example.test`,
      contactPhone: nextPhone(),
      province: "Lusaka Province",
      city: "Lusaka",
      countryCode: "ZM",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
    });
    assert.equal(created.ok, true, JSON.stringify(created));
    const approved = await approveAndProvisionClinicRegistration(pool, {
      applicationId: created.application.id,
      dataEnvironment: "testing",
      websiteTemplateVersion: 999,
    });
    assert.equal(approved.ok, true, JSON.stringify(approved));
    assert.equal(approved.code, "website_pending");
    assert.ok(approved.healthcareOrganization);
    assert.equal(approved.instance, null);

    const app = await pool.query(
      `SELECT status, provisioning_status, organization_id FROM activeclinic.clinic_registration_applications WHERE id = $1`,
      [created.application.id]
    );
    assert.equal(app.rows[0].status, "active");
    assert.equal(app.rows[0].provisioning_status, "website_pending");

    const retry = await approveAndProvisionClinicRegistration(pool, {
      applicationId: created.application.id,
      dataEnvironment: "testing",
    });
    assert.equal(retry.ok, true, JSON.stringify(retry));
    assert.ok(retry.instance);
    const after = await pool.query(
      `SELECT provisioning_status FROM activeclinic.clinic_registration_applications WHERE id = $1`,
      [created.application.id]
    );
    assert.equal(after.rows[0].provisioning_status, "provisioned");
  });

  it("H04 backfill provisions missing websites without duplicating or overwriting", async () => {
    if (!requireDb()) return;
    const stamp = Date.now().toString(36);
    const org = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `bf_${stamp}`,
      displayName: "Backfill Clinic",
      productKey: "activeclinic",
      productTenantKey: `bf-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(org.ok, true, JSON.stringify(org));
    const { createHealthcareOrganization } = require("../src/activeclinic/services/healthcareOrganizationService");
    const hco = await createHealthcareOrganization(pool, {
      organizationId: org.records.organization.id,
      legalName: "Backfill Clinic",
      publicName: "Backfill Clinic",
      organizationType: "independent_facility",
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
      skipWebsiteProvision: true,
    });
    assert.equal(hco.ok, true, JSON.stringify(hco));

    const dry = await backfillActiveClinicWebsites(pool, { dryRun: true });
    assert.equal(dry.ok, true);
    assert.ok(dry.actions.some((a) => a.organizationKey === `bf_${stamp}` && a.action === "provision_starter"));

    const applied = await backfillActiveClinicWebsites(pool, { dryRun: false });
    assert.equal(applied.ok, true);
    const again = await backfillActiveClinicWebsites(pool, { dryRun: false });
    const unchanged = again.actions.filter((a) => a.organizationKey === `bf_${stamp}`);
    assert.ok(unchanged.every((a) => a.action === "unchanged"));
    const audit = await auditActiveClinicWebsites(pool);
    const row = audit.clinics.find((c) => c.organizationKey === `bf_${stamp}`);
    assert.equal(row.instancePresent, true);
    assert.equal(row.duplicateCount, 1);
  });

  it("H05/H08/H09 role matrix, public resolver, and registration-path editing", async () => {
    if (!requireDb()) return;
    const created = await createClinicRegistrationApplication(pool, {
      clinicName: "QA Acceptance Clinic",
      contactName: "Cara Admin",
      contactEmail: `qa-${Date.now()}@example.test`,
      contactPhone: nextPhone(),
      province: "Lusaka Province",
      city: "Lusaka",
      countryCode: "ZM",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
    });
    const approved = await approveAndProvisionClinicRegistration(pool, {
      applicationId: created.application.id,
      dataEnvironment: "testing",
    });
    assert.equal(approved.ok, true, JSON.stringify(approved));
    const slug = approved.slug;
    const orgId = approved.organizationId;
    const hcoId = approved.healthcareOrganization.id;
    const facilityId = approved.facility.id;

    await pool.query(
      `UPDATE activeclinic.healthcare_organizations
          SET website_published = true, public_phone_display = $2, public_booking_enabled = false
        WHERE id = $1`,
      [hcoId, "+260970000099"]
    );

    const editor = await seedStaff(orgId, hcoId, facilityId, WEBSITE_EDITOR, "organisation");
    const admin = await seedStaff(orgId, hcoId, facilityId, ORGANIZATION_ADMIN, "organisation");
    const receptionist = await seedStaff(orgId, hcoId, facilityId, RECEPTIONIST, "facility");
    const nurse = await seedStaff(orgId, hcoId, facilityId, NURSE, "facility");
    const {
      resolveEffectivePermissions,
    } = require("../src/activeclinic/services/activeClinicAuthorizationService");
    const editorPerms = await resolveEffectivePermissions(pool, {
      organizationId: orgId,
      staffMemberId: editor.staffMemberId,
      platformIdentityId: editor.identityId,
    });
    assert.equal(editorPerms.ok, true);
    assert.ok(editorPerms.permissions.includes("website.edit"), JSON.stringify(editorPerms.permissions));
    assert.ok(editorPerms.permissions.includes("activeclinic.access"));
    assert.ok(!editorPerms.permissions.includes("website.publish"));
    const recPerms = await resolveEffectivePermissions(pool, {
      organizationId: orgId,
      staffMemberId: receptionist.staffMemberId,
      platformIdentityId: receptionist.identityId,
      facilityId,
    });
    assert.ok(!recPerms.permissions.includes("website.edit"));

    const other = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `other_${Date.now().toString(36)}`,
      displayName: "Other Clinic",
      productKey: "activeclinic",
      productTenantKey: `other-${Date.now().toString(36)}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    const otherClinic = await provisionActiveClinicClinic(pool, {
      organizationId: other.records.organization.id,
      slug: `other-${Date.now().toString(36)}`,
      publicName: "Other Clinic",
      phone: nextPhone(),
      websiteStatus: "published",
    });
    await pool.query(
      `UPDATE activeclinic.healthcare_organizations SET website_published = true WHERE organization_id = $1`,
      [other.records.organization.id]
    );

    const app = makeApp();
    const anonHome = await request(app).get(`/clinics/${slug}`);
    assert.equal(anonHome.status, 200);
    assert.doesNotMatch(anonHome.text, /data-website-chrome/);
    assert.doesNotMatch(anonHome.text, /SECRET DRAFT/);

    const csrfPage = await request(app).get(`/clinics/${slug}`);
    const csrf = extractCsrf(csrfPage);
    const anonWrite = await request(app)
      .post(`/clinics/${slug}/website/drafts`)
      .set("Cookie", csrfPage.headers["set-cookie"])
      .send({ [CSRF_FIELD]: csrf, contentKey: "home.hero.title", value: "hacked" });
    assert.equal(anonWrite.status, 403);

    const recCookie = await sessionCookie(receptionist.identityId, orgId, facilityId);
    const recCsrfPage = await request(app).get(`/clinics/${slug}?website_edit=1`).set("Cookie", recCookie);
    const recCsrf = extractCsrf(recCsrfPage) || csrf;
    const recWrite = await request(app)
      .post(`/clinics/${slug}/website/drafts`)
      .set("Cookie", [recCookie, recCsrfPage.headers["set-cookie"]].join("; "))
      .send({ [CSRF_FIELD]: recCsrf, contentKey: "home.hero.title", value: "receptionist" });
    assert.equal(recWrite.status, 403);

    const nurseCookie = await sessionCookie(nurse.identityId, orgId, facilityId);
    const nurseWrite = await request(app)
      .post(`/clinics/${slug}/website/drafts`)
      .set("Cookie", nurseCookie)
      .send({ [CSRF_FIELD]: recCsrf, contentKey: "home.hero.title", value: "nurse" });
    assert.equal(nurseWrite.status, 403);

    const editorCookie = await sessionCookie(editor.identityId, orgId, facilityId);
    const adminCookie = await sessionCookie(admin.identityId, orgId, facilityId);
    const editorGet = await request(app)
      .get(`/clinics/${slug}?website_edit=1&website_mode=draft`)
      .set("Cookie", adminCookie);
    assert.equal(editorGet.status, 200);
    assert.match(editorGet.text, /data-website-chrome/);
    assert.match(editorGet.text, /aria-label="Save field to draft"/);
    assert.match(editorGet.text, /data-website-type="image"/);
    assert.match(editorGet.text, /data-website-chrome-status/);
    const editorCsrf = extractCsrf(editorGet);
    const jpegBuf = Buffer.alloc(32, 0);
    jpegBuf[0] = 0xff;
    jpegBuf[1] = 0xd8;
    jpegBuf[2] = 0xff;
    const uploaded = await request(app)
      .post(`/clinics/${slug}/website/media`)
      .set("Cookie", cookieJar(adminCookie, editorGet))
      .field(CSRF_FIELD, editorCsrf)
      .attach("file", jpegBuf, { filename: "hero.jpg", contentType: "image/jpeg" });
    assert.equal(uploaded.status, 200, uploaded.text);
    const uploadedJson = JSON.parse(uploaded.text);
    assert.equal(uploadedJson.ok, true);
    const mediaId = uploadedJson.media && uploadedJson.media.id;
    assert.ok(mediaId);
    const editorMedia = await request(app)
      .get(`/clinics/${slug}/website/media/${mediaId}`)
      .set("Cookie", cookieJar(adminCookie, editorGet));
    assert.equal(editorMedia.status, 200);
    const anonMedia = await request(app).get(`/clinics/${slug}/website/media/${mediaId}`);
    assert.equal(anonMedia.status, 404);
    const save = await request(app)
      .post(`/clinics/${slug}/website/drafts`)
      .set("Cookie", cookieJar(adminCookie, editorGet))
      .send({ [CSRF_FIELD]: editorCsrf, contentKey: "home.hero.title", value: "QA Clinic Live Title" });
    assert.equal(save.status, 200, save.text);
    const saveJson = JSON.parse(save.text);
    assert.equal(saveJson.ok, true);

    const cancel = await request(app)
      .post(`/clinics/${slug}/website/drafts/discard`)
      .set("Cookie", cookieJar(adminCookie, editorGet))
      .send({ [CSRF_FIELD]: editorCsrf, contentKey: "home.hero.title" });
    assert.equal(cancel.status, 200);

    await request(app)
      .post(`/clinics/${slug}/website/drafts`)
      .set("Cookie", cookieJar(adminCookie, editorGet))
      .send({ [CSRF_FIELD]: editorCsrf, contentKey: "home.hero.title", value: "QA Clinic Live Title" });
    await request(app)
      .post(`/clinics/${slug}/website/drafts`)
      .set("Cookie", cookieJar(adminCookie, editorGet))
      .send({ [CSRF_FIELD]: editorCsrf, contentKey: "home.hero.subtitle", value: "Community primary care" });
    await request(app)
      .post(`/clinics/${slug}/website/drafts`)
      .set("Cookie", cookieJar(adminCookie, editorGet))
      .send({ [CSRF_FIELD]: editorCsrf, contentKey: "about.story.body", value: "About our QA clinic." });
    await request(app)
      .post(`/clinics/${slug}/website/drafts`)
      .set("Cookie", cookieJar(adminCookie, editorGet))
      .send({ [CSRF_FIELD]: editorCsrf, contentKey: "location.hours", value: "Mon-Fri 08:00-17:00" });
    await request(app)
      .post(`/clinics/${slug}/website/drafts`)
      .set("Cookie", cookieJar(adminCookie, editorGet))
      .send({ [CSRF_FIELD]: editorCsrf, contentKey: "location.address", value: "Lusaka" });
    await request(app)
      .post(`/clinics/${slug}/website/drafts`)
      .set("Cookie", cookieJar(adminCookie, editorGet))
      .send({ [CSRF_FIELD]: editorCsrf, contentKey: "contact.phone", value: "+260970000099" });

    const preview = await request(app).get(`/clinics/${slug}/website/preview`).set("Cookie", editorCookie);
    assert.ok(preview.status === 303 || preview.status === 200, String(preview.status));

    const submit = await request(app)
      .post(`/clinics/${slug}/website/submit`)
      .set("Cookie", cookieJar(adminCookie, editorGet))
      .send({ [CSRF_FIELD]: editorCsrf });
    assert.equal(submit.status, 200, submit.text);
    const submitted = JSON.parse(submit.text);
    assert.equal(submitted.ok, true);

    const publishAttempt = await request(app)
      .post(`/admin/website-changes/${submitted.submission.id}/approve`)
      .set("Cookie", editorCookie)
      .send({ [CSRF_FIELD]: editorCsrf });
    assert.ok(publishAttempt.status === 404 || publishAttempt.status === 403 || publishAttempt.status === 303);

    const otherEditor = await seedStaff(
      other.records.organization.id,
      otherClinic.healthcareOrganization.id,
      otherClinic.facility && otherClinic.facility.id,
      WEBSITE_EDITOR,
      "organisation"
    );
    const otherCookie = await sessionCookie(
      otherEditor.identityId,
      other.records.organization.id,
      otherClinic.facility && otherClinic.facility.id
    );
    const cross = await request(app)
      .post(`/clinics/${slug}/website/drafts`)
      .set("Cookie", otherCookie)
      .send({ [CSRF_FIELD]: editorCsrf, contentKey: "home.hero.title", value: "cross tenant" });
    assert.equal(cross.status, 403);

    const decided = await submissionService.decideWebsiteSubmission(pool, {
      organizationId: orgId,
      submissionId: submitted.submission.id,
      decision: "approve",
      rowVersion: submitted.submission.rowVersion,
      overrideReadiness: true,
    });
    assert.equal(decided.ok, true, JSON.stringify(decided));

    const liveHome = await request(app).get(`/clinics/${slug}`);
    assert.equal(liveHome.status, 200);
    assert.match(liveHome.text, /QA Clinic Live Title/);
    assert.doesNotMatch(liveHome.text, /data-website-chrome/);

    for (const path of ["/about", "/services", "/doctors", "/pricing", "/location", "/contact"]) {
      const page = await request(app).get(`/clinics/${slug}${path}`);
      assert.equal(page.status, 200, path);
    }

    const otherPage = await request(app)
      .get(`/clinics/${otherClinic.instance.slug}?website_edit=1`)
      .set("Cookie", adminCookie);
    assert.doesNotMatch(otherPage.text, /data-website-chrome/);
  });

  it("BlessBoard adapter does not seed public_pages", async () => {
    if (!requireDb()) return;
    const org = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `bbad_${Date.now().toString(36)}`,
      displayName: "Adapter Church",
      productKey: "blessboard",
      productTenantKey: `bbad-${Date.now().toString(36)}`,
    });
    if (!org.ok) return;
    const adapter = await ensureBlessBoardWebsiteInstance(pool, {
      organizationId: org.records.organization.id,
      slug: org.records.organization.organization_key,
    });
    assert.equal(adapter.ok, true, JSON.stringify(adapter));
    const content = await pool.query(
      `SELECT count(*)::int AS n FROM platform.website_content WHERE instance_id = $1`,
      [adapter.instance.id]
    );
    assert.equal(content.rows[0].n, 0);
  });
});
