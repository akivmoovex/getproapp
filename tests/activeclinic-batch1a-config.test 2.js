"use strict";

/**
 * V2.03 Batch 1A — ACN01–ACN05 services/practitioners configuration.
 * Covers RBAC, tenant isolation, persistence, validation, and checklist derivation.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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
const { createStaffMember } = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  ORGANIZATION_ADMIN,
  RECEPTIONIST,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  calculateOrganizationSetupState,
  loadOrganizationClinicSetup,
} = require("../src/activeclinic/services/loadActiveClinicSettingsScreens");
const {
  saveOpsService,
  listOpsServices,
  parsePriceMajorToMinor,
} = require("../src/activeclinic/services/activeClinicOpsCatalogueService");
const {
  savePractitionerWorkspace,
  listPractitioners,
} = require("../src/activeclinic/services/activeClinicPractitionerConfigService");
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
const { CSRF_FIELD, issueCsrfToken } = require("../src/platform/http/v5Csrf");

const PASSWORD = "activeclinic-pass-12";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

const ROOT = path.join(__dirname, "..");
let pool;
let skipReason = null;
let phoneSeq = 770000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function itemByKey(setup, key) {
  return ((setup && setup.items) || []).find((item) => item.key === key) || null;
}

function extractCsrf(res) {
  const html = String(res.text || "");
  const meta = html.match(/name="csrf-token"\s+content="([^"]+)"/);
  if (meta) return meta[1];
  const field = html.match(new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"`));
  return field ? field[1] : issueCsrfToken(MINIMAL_AC);
}

function cookieHeader(sessionCookie, pageRes) {
  const parts = [sessionCookie];
  const set = pageRes && pageRes.headers && pageRes.headers["set-cookie"];
  if (Array.isArray(set)) parts.push(...set);
  else if (set) parts.push(set);
  return parts.join("; ");
}

async function provisionClinic(label) {
  const stamp = `${label}_${Date.now().toString(36)}`;
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: stamp,
    displayName: `Batch1A ${label}`,
    productKey: "activeclinic",
    productTenantKey: stamp,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: `${label} Legal`,
    publicName: `${label} Clinic`,
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `hq-${stamp}`,
    displayName: "HQ",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
    city: "Lusaka",
  });
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
  });
  await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: PASSWORD,
  });
  const staff = await createStaffMember(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    firstName: "Ada",
    lastName: "Admin",
    employmentType: "permanent",
    phone,
    status: "active",
    platformIdentityId: identity.identity.id,
    jobTitle: "Administrator",
  });
  await assignStaffToFacility(pool, {
    organizationId: org.records.organization.id,
    staffMemberId: staff.staffMember.id,
    facilityId: facility.facility.id,
    isPrimary: true,
  });
  await assignStaffRole(pool, {
    organizationId: org.records.organization.id,
    staffMemberId: staff.staffMember.id,
    roleKey: ORGANIZATION_ADMIN,
    scopeType: "organisation",
  });
  return {
    organizationId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
    staffId: staff.staffMember.id,
    identityId: identity.identity.id,
  };
}

async function sessionCookie(clinic) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: clinic.identityId,
    organizationId: clinic.organizationId,
  });
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

describe("ActiveClinic V2.03 Batch 1A config (ACN01–05)", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("ships Stitch views, migration, and Batch1A CSS for 1440/390", () => {
    const views = [
      "services-catalogue-content.ejs",
      "service-editor-content.ejs",
      "practitioners-directory-content.ejs",
      "practitioner-workspace-content.ejs",
    ];
    for (const name of views) {
      const tpl = fs.readFileSync(
        path.join(ROOT, "views/activeclinic/app", name),
        "utf8"
      );
      assert.match(tpl, /data-ac-stitch="ACN0[2-5]"/);
      assert.match(tpl, /ac-batch1a/);
    }
    const css = fs.readFileSync(path.join(ROOT, "public/activeclinic/ac-app.css"), "utf8");
    assert.match(css, /\.ac-batch1a/);
    assert.match(css, /@media \(max-width: 720px\)/);
    const migration = fs.readFileSync(
      path.join(ROOT, "db/migrations/activeclinic/036_batch1a_services_practitioners.sql"),
      "utf8"
    );
    assert.match(migration, /service_staff_assignments/);
    assert.match(migration, /staff_weekly_availability/);
    assert.match(migration, /staff_availability_blocks/);
    assert.match(migration, /amount_minor/);
    assert.match(migration, /public_bookable/);
  });

  it("derives ACN01 clinical_services and practitioners from persisted counts", () => {
    const incomplete = calculateOrganizationSetupState({
      healthcareOrganization: {
        publicName: "A",
        legalName: "A Ltd",
        countryCode: "ZM",
        timezone: "Africa/Lusaka",
        organizationType: "private_healthcare",
      },
      primaryFacility: {
        operational: true,
        phoneDisplay: "+260955000000",
        facilityKey: "hq",
      },
      hasActiveAdministrator: true,
      primaryDepartments: [{ status: "active" }],
      staffCounts: { active: 1, invited: 0 },
      serviceCounts: { active: 0, total: 0 },
      practitionerCounts: { active: 1, configured: 0 },
      website: { provisioned: true, published: false },
    });
    assert.equal(itemByKey(incomplete, "clinical_services").complete, false);
    assert.equal(itemByKey(incomplete, "practitioners").complete, false);
    assert.equal(itemByKey(incomplete, "clinical_services").destinationUrl, "/app/services");
    assert.equal(itemByKey(incomplete, "practitioners").destinationUrl, "/app/practitioners");

    const complete = calculateOrganizationSetupState({
      healthcareOrganization: incomplete.checks
        ? {
            publicName: "A",
            legalName: "A Ltd",
            countryCode: "ZM",
            timezone: "Africa/Lusaka",
            organizationType: "private_healthcare",
          }
        : {
            publicName: "A",
            legalName: "A Ltd",
            countryCode: "ZM",
            timezone: "Africa/Lusaka",
            organizationType: "private_healthcare",
          },
      primaryFacility: {
        operational: true,
        phoneDisplay: "+260955000000",
        facilityKey: "hq",
      },
      hasActiveAdministrator: true,
      primaryDepartments: [{ status: "active" }],
      staffCounts: { active: 2, invited: 0 },
      serviceCounts: { active: 2, total: 2 },
      practitionerCounts: { active: 2, configured: 1 },
      website: { provisioned: true, published: false },
    });
    assert.equal(itemByKey(complete, "clinical_services").complete, true);
    assert.equal(itemByKey(complete, "practitioners").complete, true);
  });

  it("validates price parsing and rejects forged tenant on service save", async () => {
    requireDb();
    const clinic = await provisionClinic("svcval");
    const badPrice = parsePriceMajorToMinor("-12");
    assert.equal(badPrice.ok, false);
    const forged = await saveOpsService(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      permissions: ["website.edit"],
      body: { organizationId: "00000000-0000-4000-8000-000000000099" },
      displayName: "Forged",
      defaultDurationMinutes: 30,
    });
    assert.equal(forged.ok, false);
    assert.equal(forged.code, "forged_tenant");
  });

  it("persists service pricing/practitioners and practitioner availability with RBAC", async () => {
    requireDb();
    const clinic = await provisionClinic("persist");
    const perms = ["website.view", "website.edit", "activeclinic.staff.view", "activeclinic.staff.update"];

    const deniedList = await listOpsServices(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      permissions: [],
      query: {},
    });
    assert.equal(deniedList.ok, false);

    const saved = await saveOpsService(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      permissions: perms,
      body: {},
      displayName: "General Consultation",
      description: "Outpatient consult",
      defaultDurationMinutes: 30,
      status: "active",
      publicBookable: "1",
      publicWebsiteVisible: "1",
      priceMajor: "250.00",
      followUpPriceMajor: "150.00",
      currencyCode: "ZMW",
      bufferMinutes: 5,
      facilityId: clinic.facilityId,
      staffMemberIds: [clinic.staffId],
    });
    assert.equal(saved.ok, true, JSON.stringify(saved));
    assert.equal(saved.service.amountMinor, 25000);
    assert.equal(saved.service.followUpAmountMinor, 15000);
    assert.equal(saved.service.publicBookable, true);
    assert.equal(saved.assignedStaffIds.includes(clinic.staffId), true);

    const listed = await listOpsServices(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      permissions: perms,
      query: { q: "General" },
    });
    assert.equal(listed.ok, true);
    assert.ok(listed.services.some((s) => s.id === saved.service.id));

    const other = await provisionClinic("other");
    const cross = await listOpsServices(pool, {
      organizationId: other.organizationId,
      healthcareOrganizationId: other.hcoId,
      permissions: perms,
      query: {},
    });
    assert.equal(cross.ok, true);
    assert.equal(
      cross.services.some((s) => s.id === saved.service.id),
      false,
      "tenant isolation: other org must not see service"
    );

    const workspace = await savePractitionerWorkspace(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      permissions: perms,
      staffId: clinic.staffId,
      body: {
        day_1_enabled: "1",
        day_1_start: "09:00",
        day_1_end: "13:00",
        day_3_enabled: "1",
        day_3_start: "14:00",
        day_3_end: "17:00",
      },
      firstName: "Ada",
      lastName: "Admin",
      displayName: "Dr Ada Admin",
      jobTitle: "General Practitioner",
      credentialsText: "MBChB, HPCZ",
      licenseNumber: "HPCZ-1001",
      specialtiesText: "General Practice, Paediatrics",
      publicBookable: "1",
      publicProfileEnabled: "1",
      publicBio: "Family medicine clinic lead.",
      blockStartsAt: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
      blockEndsAt: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16),
      blockKind: "leave",
      blockReason: "Annual leave",
      actorStaffId: clinic.staffId,
    });
    assert.equal(workspace.ok, true, JSON.stringify(workspace));
    assert.equal(workspace.practitioner.credentialsText, "MBChB, HPCZ");
    assert.equal(workspace.practitioner.publicBookable, true);
    assert.ok(workspace.weekly.length >= 2);
    assert.ok(workspace.blocks.some((b) => b.blockKind === "leave"));
    assert.match(workspace.rbacGuardrail, /does not grant application permissions/i);

    const directory = await listPractitioners(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      permissions: perms,
      query: { q: "Ada" },
    });
    assert.equal(directory.ok, true);
    assert.ok(directory.practitioners.some((p) => p.id === clinic.staffId));

    const setup = await loadOrganizationClinicSetup(pool, {
      organizationId: clinic.organizationId,
    });
    assert.equal(itemByKey(setup, "clinical_services").complete, true);
    assert.equal(itemByKey(setup, "practitioners").complete, true);
  });

  it("HTTP routes enforce RBAC and render Stitch markers", async () => {
    requireDb();
    const clinic = await provisionClinic("http");
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const cookie = await sessionCookie(clinic);

    const services = await request(app).get("/app/services").set("Cookie", cookie);
    assert.equal(services.status, 200);
    assert.match(services.text, /data-ac-stitch="ACN02"/);
    assert.match(services.text, /Services &amp; Pricing Catalogue|Services & Pricing Catalogue/);
    assert.match(services.text, /href="\/app\/services"/);

    const newSvc = await request(app).get("/app/services/new").set("Cookie", cookie);
    assert.equal(newSvc.status, 200);
    assert.match(newSvc.text, /data-ac-stitch="ACN03"/);
    const csrf = extractCsrf(newSvc);
    const cookies = cookieHeader(cookie, newSvc);
    const created = await request(app)
      .post("/app/services")
      .set("Cookie", cookies)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        displayName: "Antenatal Visit",
        defaultDurationMinutes: "45",
        description: "ANC visit",
        priceMajor: "180",
        currencyCode: "ZMW",
        status: "active",
        publicBookable: "1",
        staffMemberIds: clinic.staffId,
      });
    assert.ok([302, 303].includes(created.status), String(created.status));
    assert.match(String(created.headers.location || ""), /\/app\/services\/.+\/edit/);

    const practitioners = await request(app)
      .get("/app/practitioners")
      .set("Cookie", cookie);
    assert.equal(practitioners.status, 200);
    assert.match(practitioners.text, /data-ac-stitch="ACN04"/);
    assert.match(practitioners.text, /data-ac-rbac-guardrail="1"/);

    const workspace = await request(app)
      .get(`/app/practitioners/${clinic.staffId}`)
      .set("Cookie", cookie);
    assert.equal(workspace.status, 200);
    assert.match(workspace.text, /data-ac-stitch="ACN05"/);
    assert.match(workspace.text, /Weekly working schedule/);

    const onboarding = await request(app).get("/app/onboarding").set("Cookie", cookie);
    assert.equal(onboarding.status, 200);
    assert.match(onboarding.text, /data-ac-onboarding-step="clinical_services"/);
    assert.match(onboarding.text, /data-ac-onboarding-step="practitioners"/);

    // Receptionist: staff.view may apply; website.edit should not.
    const recPhone = nextPhone();
    const recIdentity = await createPlatformIdentity(pool, {
      primaryPhone: recPhone,
      phoneNormalized: recPhone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    await setPlatformIdentityPassword(pool, {
      identityId: recIdentity.identity.id,
      password: PASSWORD,
    });
    const recStaff = await createStaffMember(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      firstName: "Rita",
      lastName: "Reception",
      employmentType: "permanent",
      phone: recPhone,
      status: "active",
      platformIdentityId: recIdentity.identity.id,
      jobTitle: "Receptionist",
    });
    await assignStaffToFacility(pool, {
      organizationId: clinic.organizationId,
      staffMemberId: recStaff.staffMember.id,
      facilityId: clinic.facilityId,
      isPrimary: true,
    });
    await assignStaffRole(pool, {
      organizationId: clinic.organizationId,
      staffMemberId: recStaff.staffMember.id,
      roleKey: RECEPTIONIST,
      scopeType: "organisation",
    });
    const recSession = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: recIdentity.identity.id,
      organizationId: clinic.organizationId,
    });
    const recCookie = `${COOKIE_ACTIVECLINIC_ORG}=${recSession.rawToken}`;
    const deniedNew = await request(app).get("/app/services/new").set("Cookie", recCookie);
    assert.ok([403, 302, 303].includes(deniedNew.status), String(deniedNew.status));
  });
});
