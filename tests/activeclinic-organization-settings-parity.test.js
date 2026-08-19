"use strict";

/**
 * ActiveClinic V6 — organization settings (AC-V6-S07).
 */

const { describe, it, before, after, beforeEach } = require("node:test");
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
  createHealthcareOrganization,
  updateHealthcareOrganization,
} = require("../src/activeclinic/services/healthcareOrganizationService");
const {
  createFacility,
} = require("../src/activeclinic/services/facilityService");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  NETWORK_ADMIN,
  STAFF_ROLE,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  calculateOrganizationSetupState,
  updateHealthcareOrganizationSettings,
} = require("../src/activeclinic/services/loadActiveClinicSettingsScreens");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, issueCsrfToken } = require("../src/platform/http/v5Csrf");

const PASSWORD = "activeclinic-pass-12";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 870000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

async function provisionOrg(input) {
  const result = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    ...input,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}

async function seedAcTenant(stamp, keyPrefix, opts) {
  const org = await provisionOrg({
    organizationKey: `${keyPrefix}_${stamp}`,
    displayName: `AC ${keyPrefix}`,
    productKey: "activeclinic",
    productTenantKey: `${keyPrefix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: (opts && opts.legalName) || "Legal Hospital Settings",
    publicName: (opts && opts.publicName) || "Settings Clinic",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    registrationNumber: (opts && opts.registrationNumber) || "REG-100",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));
  let facility = null;
  if (!opts || opts.withFacility !== false) {
    facility = await createFacility(pool, {
      organizationId: org.records.organization.id,
      healthcareOrganizationId: hco.healthcareOrganization.id,
      facilityKey: `${keyPrefix}-main`,
      displayName: "Main Hospital",
      facilityType: "hospital",
      status: "active",
      isPrimary: true,
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
      phone: nextPhone(),
      city: "Lusaka",
    });
    assert.equal(facility.ok, true, JSON.stringify(facility));
  }
  return {
    orgId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    hco: hco.healthcareOrganization,
    facilityId: facility ? facility.facility.id : null,
    facilityKey: facility ? facility.facility.facilityKey : null,
  };
}

async function seedStaff(ac, opts) {
  const phone = opts.phone || nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
  });
  assert.equal(identity.ok, true);
  await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: PASSWORD,
  });
  const staff = await createStaffMember(pool, {
    organizationId: ac.orgId,
    healthcareOrganizationId: ac.hcoId,
    firstName: opts.firstName || "Staff",
    lastName: opts.lastName || "Member",
    employmentType: "permanent",
    phone,
    status: "active",
    platformIdentityId: identity.identity.id,
    jobTitle: opts.jobTitle || "Administrator",
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  if (ac.facilityId) {
    await assignStaffToFacility(pool, {
      organizationId: ac.orgId,
      staffMemberId: staff.staffMember.id,
      facilityId: ac.facilityId,
      isPrimary: true,
    });
  }
  await assignStaffRole(pool, {
    organizationId: ac.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey: opts.roleKey || STAFF_ROLE,
    scopeType: opts.scopeType || (opts.roleKey === NETWORK_ADMIN ? "organisation" : "facility"),
    facilityId:
      opts.roleKey === NETWORK_ADMIN || opts.scopeType === "organisation"
        ? null
        : ac.facilityId,
  });
  return { identity: identity.identity, staff: staff.staffMember, phone };
}

async function sessionCookie(identityId, orgId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId: orgId,
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return { cookie: `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}` };
}

function makeApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: MINIMAL_AC,
    log: () => {},
  });
}

describe("ActiveClinic organization settings parity (AC-V6-S07)", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  beforeEach(() => {
    resetDeploymentProfileWarningsForTests();
  });

  function requireDb() {
    if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("settings overview shows permitted categories and real summaries", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "sset");
    const admin = await seedStaff(ac, {
      roleKey: NETWORK_ADMIN,
      firstName: "Set",
      lastName: "Admin",
    });
    const ordinary = await seedStaff(ac, {
      roleKey: STAFF_ROLE,
      firstName: "Ord",
      lastName: "User",
    });
    const app = makeApp();
    const { cookie: adminCookie } = await sessionCookie(admin.identity.id, ac.orgId);
    const overview = await request(app).get("/app/settings").set("Cookie", adminCookie);
    assert.equal(overview.status, 200);
    assert.match(overview.text, /data-ac-page-section="settings-overview"/);
    assert.match(overview.text, /data-ac-visual="stitch-gap"/);
    assert.match(overview.text, /data-ac-settings-card="organization"/);
    assert.match(overview.text, /data-ac-settings-card="facilities"/);
    assert.match(overview.text, /data-ac-settings-card="website"/);
    assert.match(overview.text, /data-ac-settings-card="account"/);
    assert.match(overview.text, /Settings Clinic|Main Hospital/);
    assert.match(overview.text, /Profile complete|Setup incomplete/);
    assert.doesNotMatch(overview.text, /BlessBoard/i);
    // Shell nav may include Billing/Pharmacy for org admins (Stitch P02). Settings
    // content must still omit commercial widgets and operational census copy.
    assert.doesNotMatch(
      overview.text,
      /subscription|patient census|appointments today/i
    );
    assert.doesNotMatch(overview.text, /data-environment|deployment_id|organization_id/i);

    const { cookie: staffCookie } = await sessionCookie(ordinary.identity.id, ac.orgId);
    const staffOverview = await request(app).get("/app/settings").set("Cookie", staffCookie);
    assert.equal(staffOverview.status, 200);
    assert.match(staffOverview.text, /data-ac-settings-card="account"/);
    assert.match(staffOverview.text, /data-ac-settings-card="organization"/);
    assert.doesNotMatch(staffOverview.text, /data-ac-settings-card="access"/);
    assert.doesNotMatch(staffOverview.text, /data-ac-settings-card="website"/);

    const staffWebsite = await request(app)
      .get("/app/settings/website")
      .set("Cookie", staffCookie);
    assert.equal(staffWebsite.status, 403);

    const websiteDetail = await request(app)
      .get("/app/settings/website")
      .set("Cookie", adminCookie);
    assert.equal(websiteDetail.status, 200);
    assert.match(websiteDetail.text, /data-ac-website-management="1"/);
    assert.match(websiteDetail.text, /Website not published yet/);
    assert.match(websiteDetail.text, /data-ac-website-action="edit"/);
    assert.match(websiteDetail.text, /data-ac-website-action="preview"/);
    assert.match(websiteDetail.text, /data-ac-website-action="history"/);
    assert.doesNotMatch(websiteDetail.text, /data-ac-website-action="view-live"/);
    assert.doesNotMatch(websiteDetail.text, /data-ac-website-action="publish"/);

    const staffOrg = await request(app)
      .get("/app/settings/organization")
      .set("Cookie", staffCookie);
    assert.equal(staffOrg.status, 200);
    assert.doesNotMatch(staffOrg.text, /Edit organization profile|settings-organization-edit/);

    const deniedEdit = await request(app)
      .get("/app/settings/organization/edit")
      .set("Cookie", staffCookie);
    assert.equal(deniedEdit.status, 403);
  });

  it("organization profile and edit enforce permissions, CSRF, and protected fields", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "sorg");
    const other = await seedAcTenant(`${stamp}x`, "sorgx");
    const admin = await seedStaff(ac, { roleKey: NETWORK_ADMIN });
    const foreignAdmin = await seedStaff(other, { roleKey: NETWORK_ADMIN });
    const { cookie } = await sessionCookie(admin.identity.id, ac.orgId);
    const app = makeApp();

    const profile = await request(app)
      .get("/app/settings/organization")
      .set("Cookie", cookie);
    assert.equal(profile.status, 200);
    assert.match(profile.text, /data-ac-page-section="settings-organization"/);
    assert.match(profile.text, /Legal Hospital Settings/);
    assert.match(profile.text, /Private healthcare/);
    assert.match(profile.text, /Africa\/Lusaka/);
    assert.match(profile.text, /ActiveClinic enabled|product enrolment/i);
    assert.match(profile.text, /Healthcare organization/);
    assert.doesNotMatch(profile.text, new RegExp(ac.orgId, "i"));
    assert.doesNotMatch(profile.text, new RegExp(ac.hcoId, "i"));

    const editPage = await request(app)
      .get("/app/settings/organization/edit")
      .set("Cookie", cookie);
    assert.equal(editPage.status, 200);
    assert.match(editPage.text, /data-ac-page-section="settings-organization-edit"/);
    assert.match(editPage.text, /name="organization_type"/);
    assert.match(editPage.text, /name="timezone"/);

    const noCsrf = await request(app)
      .post("/app/settings/organization")
      .set("Cookie", cookie)
      .type("form")
      .send({
        public_name: "Hacked",
        legal_name: "Hacked Legal",
        organization_type: "private_healthcare",
        country_code: "ZM",
        timezone: "Africa/Lusaka",
      });
    assert.equal(noCsrf.status, 403);

    const csrf = issueCsrfToken(MINIMAL_AC);
    const badType = await request(app)
      .post("/app/settings/organization")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        public_name: "Updated Clinic",
        legal_name: "Updated Legal",
        organization_type: "not_a_real_type",
        country_code: "ZM",
        timezone: "Africa/Lusaka",
        status: "archived",
        organization_id: other.orgId,
      });
    assert.equal(badType.status, 400);
    assert.match(badType.text, /approved organization type|fix the following/i);

    const csrf2 = issueCsrfToken(MINIMAL_AC);
    const saved = await request(app)
      .post("/app/settings/organization")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf2}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf2,
        public_name: "Updated Clinic",
        legal_name: "Updated Legal",
        organization_type: "faith_based_healthcare",
        country_code: "ZM",
        registration_number: "REG-UPDATED",
        timezone: "Africa/Lusaka",
        status: "archived",
        organization_id: other.orgId,
      });
    assert.equal(saved.status, 303);
    assert.match(saved.headers.location, /\/app\/settings\/organization/);

    const after = await request(app)
      .get("/app/settings/organization")
      .set("Cookie", cookie);
    assert.match(after.text, /Updated Clinic/);
    assert.match(after.text, /Faith-based healthcare/);
    assert.match(after.text, /REG-UPDATED/);
    assert.match(after.text, /Active/);
    assert.doesNotMatch(after.text, />Archived</);

    const cross = await updateHealthcareOrganizationSettings(pool, {
      auth: {
        organization: { id: other.orgId },
        permissions: ["activeclinic.organization.manage"],
        staffMember: foreignAdmin.staff,
      },
      // Spoofed target org must be ignored; update applies only to session org.
      organizationId: ac.orgId,
      publicName: "Cross Tenant Attempt",
      legalName: "Cross Tenant Legal",
      organizationType: "private_healthcare",
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
    });
    assert.equal(cross.ok, true);
    assert.equal(cross.healthcareOrganization.publicName, "Cross Tenant Attempt");
    // Original tenant HCO must remain unchanged by the spoofed organizationId.
    const original = await pool.query(
      `SELECT public_name FROM activeclinic.healthcare_organizations
        WHERE id = $1 AND organization_id = $2`,
      [ac.hcoId, ac.orgId]
    );
    assert.equal(original.rows[0].public_name, "Updated Clinic");

    const audits = await pool.query(
      `SELECT action_key, metadata_json
         FROM platform.audit_events
        WHERE organization_id = $1
          AND action_key = 'activeclinic.healthcare_organization.update'
        ORDER BY created_at DESC
        LIMIT 1`,
      [ac.orgId]
    );
    assert.ok(audits.rows[0]);
    const meta = audits.rows[0].metadata_json || {};
    assert.ok(Array.isArray(meta.field_keys));
    assert.ok(meta.field_keys.includes("public_name"));
  });

  it("primary facility incomplete and completeness checks are deterministic", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "sinc", { withFacility: false });
    const admin = await seedStaff(ac, { roleKey: NETWORK_ADMIN });
    const { cookie } = await sessionCookie(admin.identity.id, ac.orgId);
    const app = makeApp();

    const overview = await request(app).get("/app/settings").set("Cookie", cookie);
    assert.equal(overview.status, 200);
    assert.match(overview.text, /Setup incomplete|No primary facility/);

    const profile = await request(app)
      .get("/app/settings/organization")
      .set("Cookie", cookie);
    assert.match(profile.text, /No primary facility|Configure facilities/);

    const incomplete = calculateOrganizationSetupState({
      healthcareOrganization: {
        publicName: "A",
        legalName: "B",
        countryCode: "ZM",
        timezone: "Africa/Lusaka",
        organizationType: "private_healthcare",
      },
      primaryFacility: null,
      hasActiveAdministrator: true,
    });
    assert.equal(incomplete.complete, false);
    assert.equal(incomplete.label, "Setup incomplete");
    assert.ok(incomplete.missing.some((m) => m.key === "primary_facility"));

    const complete = calculateOrganizationSetupState({
      healthcareOrganization: {
        publicName: "A",
        legalName: "B",
        countryCode: "ZM",
        timezone: "Africa/Lusaka",
        organizationType: "private_healthcare",
      },
      primaryFacility: {
        operational: true,
        phoneDisplay: "+260955000000",
      },
      hasActiveAdministrator: true,
    });
    assert.equal(complete.complete, true);
    assert.equal(complete.label, "Profile complete");
  });

  it("direct status and ownership fields cannot be changed through settings update", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "sprot");
    const admin = await seedStaff(ac, { roleKey: NETWORK_ADMIN });
    const result = await updateHealthcareOrganizationSettings(pool, {
      auth: {
        organization: { id: ac.orgId },
        permissions: ["activeclinic.organization.manage"],
        staffMember: admin.staff,
      },
      publicName: "Protected Name",
      legalName: "Protected Legal",
      organizationType: "private_healthcare",
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
      status: "archived",
      productStatus: "suspended",
    });
    assert.equal(result.ok, true);
    assert.equal(result.healthcareOrganization.status, "active");
    assert.equal(result.healthcareOrganization.publicName, "Protected Name");

    const allowed = await updateHealthcareOrganization(pool, {
      id: ac.hcoId,
      organizationId: ac.orgId,
      patch: {
        publicName: "Still Active Name",
        status: "archived",
      },
    });
    // Status stripped unless allowStatusChange
    assert.equal(allowed.ok, true);
    assert.equal(allowed.healthcareOrganization.status, "active");
    assert.equal(allowed.healthcareOrganization.publicName, "Still Active Name");
  });
});
