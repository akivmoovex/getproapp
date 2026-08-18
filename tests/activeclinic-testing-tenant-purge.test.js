"use strict";

/**
 * ActiveClinic testing-tenant purge: eligibility, dry-run, transactional delete.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
  foundationDbUnavailableSkipReason,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createPlatformIdentity } = require("../src/platform/services/platformIdentityService");
const { setPlatformIdentityPassword } = require("../src/platform/services/platformIdentityCredentialService");
const { createStaffMember } = require("../src/activeclinic/services/activeClinicStaffService");
const { assignStaffToFacility } = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  ORGANIZATION_ADMIN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  provisionActiveClinicClinic,
} = require("../src/activeclinic/website/provisionActiveClinicWebsite");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const {
  purgeActiveClinicTestingOrganization,
  STATUS,
  EXPECTED_IDENTITY_KEY,
} = require("../src/activeclinic/services/purgeActiveClinicTestingOrganization");

const PASSWORD = "activeclinic-pass-12";
const TESTING_ENV = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
  DATABASE_IDENTITY_EXPECTED: EXPECTED_IDENTITY_KEY,
});

let pool;
let skipReason = null;
let phoneSeq = 931000000;

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

async function seedActiveClinic(opts = {}) {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const organizationKey = opts.organizationKey || `qa-purge-${stamp}`;
  const tenant = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: opts.dataEnvironment || "testing",
    organizationKey,
    displayName: opts.displayName || `QA Purge ${stamp}`,
    productKey: "activeclinic",
    productTenantKey: organizationKey,
    deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
  });
  assert.equal(tenant.ok, true, JSON.stringify(tenant));
  const orgId = tenant.records.organization.id;
  const clinic = await provisionActiveClinicClinic(pool, {
    organizationId: orgId,
    slug: organizationKey,
    publicName: opts.displayName || `QA Purge ${stamp}`,
    phone: nextPhone(),
    websiteStatus: "coming_soon",
  });
  assert.equal(clinic.ok, true, JSON.stringify(clinic));
  const identityPhone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryEmail: `purge.${organizationKey.slice(-12)}@example.test`,
    primaryPhone: identityPhone,
    phoneNormalized: identityPhone,
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
    firstName: "Purge",
    lastName: "Admin",
    phone: nextPhone(),
    employmentType: "permanent",
    status: "active",
    platformIdentityId: identity.identity.id,
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  const assigned = await assignStaffToFacility(pool, {
    organizationId: orgId,
    staffMemberId: staff.staffMember.id,
    facilityId: clinic.facility.id,
    isPrimary: true,
  });
  assert.equal(assigned.ok, true, JSON.stringify(assigned));
  const role = await assignStaffRole(pool, {
    organizationId: orgId,
    staffMemberId: staff.staffMember.id,
    roleKey: ORGANIZATION_ADMIN,
    scopeType: "organisation",
    assignmentOrigin: "system",
  });
  assert.equal(role.ok, true, JSON.stringify(role));

  if (opts.cleanupEligible === false) {
    await pool.query(
      `UPDATE platform.organizations SET test_cleanup_eligible = false WHERE id = $1`,
      [orgId]
    );
  } else {
    await pool.query(
      `UPDATE platform.organizations SET test_cleanup_eligible = true WHERE id = $1`,
      [orgId]
    );
  }

  const instance = await pool.query(
    `SELECT id FROM platform.website_instances WHERE organization_id = $1 LIMIT 1`,
    [orgId]
  );

  return {
    organizationKey,
    orgId,
    hcoId: clinic.healthcareOrganization.id,
    facilityId: clinic.facility.id,
    staffId: staff.staffMember.id,
    identityId: identity.identity.id,
    instanceId: instance.rows[0] ? String(instance.rows[0].id) : null,
  };
}

async function seedBlessBoard(organizationKey) {
  const tenant = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey,
    displayName: "BlessBoard Purge Guard",
    productKey: "blessboard",
    productTenantKey: organizationKey,
    deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
  });
  assert.equal(tenant.ok, true, JSON.stringify(tenant));
  const church = await provisionBlessBoardChurch(pool, {
    organizationKey,
    churchKey: organizationKey,
    displayName: "BlessBoard Purge Guard",
    legalName: null,
    dataEnvironment: "testing",
    hqBranchKey: "hq",
    hqBranchDisplayName: "Headquarters",
  });
  assert.equal(church.ok, true, JSON.stringify(church));
  await pool.query(
    `UPDATE platform.organizations SET test_cleanup_eligible = true WHERE organization_key = $1`,
    [organizationKey]
  );
  return {
    organizationKey,
    orgId: tenant.records.organization.id,
    churchId: church.records.church.id,
  };
}

async function orgExists(organizationKey) {
  const r = await pool.query(
    `SELECT 1 FROM platform.organizations WHERE organization_key = $1`,
    [organizationKey]
  );
  return r.rowCount > 0;
}

describe("ActiveClinic testing tenant purge", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: EXPECTED_IDENTITY_KEY,
        environmentCode: "testing",
      });
      await pool.query(
        `INSERT INTO platform.deployments (
           deployment_code, application_code, release_version, canonical_domain,
           environment_code, status, jobs_enabled, database_access_mode, session_cookie_name
         ) VALUES (
           $1, 'platform', 'v7', 'pronline.org',
           'testing', 'active', false, 'read_write', 'moovex_platform_testing_sid'
         )
         ON CONFLICT (deployment_code) DO UPDATE SET
           status = 'active',
           updated_at = now()`,
        [CODE_MOOVEX_PLATFORM_TESTING]
      );
    } catch (err) {
      skipReason = foundationDbUnavailableSkipReason(err && err.message ? err.message : String(err));
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("refuses production identity", async () => {
    if (!requireDb()) return;
    await pool.query(
      `UPDATE platform.database_identity SET identity_key = 'moovex-platform-production' WHERE id = 1`
    );
    try {
      const result = await purgeActiveClinicTestingOrganization(
        pool,
        { organizationKey: "anything", dryRun: true },
        TESTING_ENV
      );
      assert.equal(result.ok, false);
      assert.equal(result.status, STATUS.IDENTITY_BLOCKED);
    } finally {
      await pool.query(
        `UPDATE platform.database_identity SET identity_key = $1 WHERE id = 1`,
        [EXPECTED_IDENTITY_KEY]
      );
    }
  });

  it("refuses production deployment environment", async () => {
    if (!requireDb()) return;
    const result = await purgeActiveClinicTestingOrganization(
      pool,
      { organizationKey: "anything", dryRun: true },
      { ...TESTING_ENV, DEPLOYMENT_ENV: "production" }
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.FORBIDDEN);
    assert.equal(result.reason, "deployment_env_not_testing");
  });

  it("refuses unmarked tenant", async () => {
    if (!requireDb()) return;
    const clinic = await seedActiveClinic({ cleanupEligible: false });
    const result = await purgeActiveClinicTestingOrganization(
      pool,
      { organizationKey: clinic.organizationKey, dryRun: true },
      TESTING_ENV
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.NOT_ELIGIBLE);
    assert.equal(result.reason, "not_test_cleanup_eligible");
    assert.equal(await orgExists(clinic.organizationKey), true);
  });

  it("refuses missing organization key", async () => {
    if (!requireDb()) return;
    const result = await purgeActiveClinicTestingOrganization(pool, { dryRun: true }, TESTING_ENV);
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.INVALID_INPUT);
    assert.equal(result.reason, "missing_organization_key");
  });

  it("refuses wrong product tenant", async () => {
    if (!requireDb()) return;
    const key = `qa-wrong-product-${Date.now().toString(36)}`;
    const church = await seedBlessBoard(key);
    const result = await purgeActiveClinicTestingOrganization(
      pool,
      { organizationKey: church.organizationKey, dryRun: true },
      TESTING_ENV
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.PRODUCT_DENIED);
    assert.equal(result.reason, "product_not_activeclinic");
    assert.equal(await orgExists(church.organizationKey), true);
  });

  it("dry-run reports counts and performs zero mutations", async () => {
    if (!requireDb()) return;
    const clinic = await seedActiveClinic();
    const beforeStaff = await pool.query(
      `SELECT COUNT(*)::int AS n FROM activeclinic.staff_members WHERE organization_id = $1`,
      [clinic.orgId]
    );
    const result = await purgeActiveClinicTestingOrganization(
      pool,
      { organizationKey: clinic.organizationKey, dryRun: true },
      TESTING_ENV
    );
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.dryRun, true);
    assert.equal(result.deleted, null);
    assert.equal(result.counts.organization, 1);
    assert.ok(result.counts.healthcareOrganizations >= 1);
    assert.ok(result.counts.facilities >= 1);
    assert.ok(result.counts.staffMembers >= 1);
    assert.ok(result.counts.websiteInstances >= 1);
    const after = await pool.query(
      `SELECT COUNT(*)::int AS n FROM activeclinic.staff_members WHERE organization_id = $1`,
      [clinic.orgId]
    );
    assert.equal(after.rows[0].n, beforeStaff.rows[0].n);
    assert.equal(await orgExists(clinic.organizationKey), true);
  });

  it("purges a clean QA clinic", async () => {
    if (!requireDb()) return;
    const clinic = await seedActiveClinic();
    const result = await purgeActiveClinicTestingOrganization(
      pool,
      {
        organizationKey: clinic.organizationKey,
        dryRun: false,
        confirmDestructive: true,
      },
      TESTING_ENV
    );
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.reason, "purged");
    assert.equal(result.deleted.organizations, 1);
    assert.equal(result.deleted.healthcareOrganizations, 1);
    assert.ok(result.deleted.staffMembers >= 1);
    assert.equal(await orgExists(clinic.organizationKey), false);
    const hco = await pool.query(
      `SELECT 1 FROM activeclinic.healthcare_organizations WHERE id = $1`,
      [clinic.hcoId]
    );
    assert.equal(hco.rowCount, 0);
  });

  it("purges a tenant with website versions and moderation events", async () => {
    if (!requireDb()) return;
    const clinic = await seedActiveClinic();
    assert.ok(clinic.instanceId);
    await pool.query(
      `INSERT INTO platform.website_versions
         (organization_id, instance_id, version_number, snapshot_json, status)
       VALUES ($1, $2, 1, '{}'::jsonb, 'published')
       ON CONFLICT (instance_id, version_number) DO NOTHING`,
      [clinic.orgId, clinic.instanceId]
    );
    await pool.query(
      `INSERT INTO platform.website_edit_sessions
         (organization_id, instance_id, status, started_at, last_activity_at, closed_at, close_reason)
       VALUES ($1, $2, 'closed', now(), now(), now(), 'test')`,
      [clinic.orgId, clinic.instanceId]
    );
    await pool.query(
      `INSERT INTO platform.website_moderation_events
         (organization_id, instance_id, product_code, action_key, previous_state, new_state)
       VALUES ($1, $2, 'activeclinic', 'auto_publish', 'provisional', 'public')`,
      [clinic.orgId, clinic.instanceId]
    );
    const appNumber = `AC-PURGE-${Date.now().toString(36).toUpperCase()}`;
    const app = await pool.query(
      `INSERT INTO activeclinic.clinic_registration_applications (
         application_number, clinic_name, contact_name,
         contact_email_normalized, contact_email_display,
         contact_phone_normalized, contact_phone_display,
         organization_id, healthcare_organization_id, facility_id, website_instance_id,
         status, provisioning_status, provisioned_at
       ) VALUES (
         $1, 'QA Purge Clinic', 'QA Contact',
         $2, $2, '+260977000001', '+260977000001',
         $3, $4, $5, $6, 'approved', 'provisioned', now()
       ) RETURNING id`,
      [
        appNumber,
        `qa.${clinic.organizationKey}@example.test`,
        clinic.orgId,
        clinic.hcoId,
        clinic.facilityId,
        clinic.instanceId,
      ]
    );
    await pool.query(
      `INSERT INTO activeclinic.clinic_registration_review_events
         (application_id, event_type, visibility, body)
       VALUES ($1, 'approval', 'history', 'approved for testing cleanup')`,
      [app.rows[0].id]
    );

    const result = await purgeActiveClinicTestingOrganization(
      pool,
      {
        organizationKey: clinic.organizationKey,
        dryRun: false,
        confirmDestructive: true,
      },
      TESTING_ENV
    );
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(await orgExists(clinic.organizationKey), false);
    const leftover = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.website_moderation_events WHERE organization_id = $1`,
      [clinic.orgId]
    );
    assert.equal(leftover.rows[0].n, 0);
    const apps = await pool.query(
      `SELECT 1 FROM activeclinic.clinic_registration_applications WHERE id = $1`,
      [app.rows[0].id]
    );
    assert.equal(apps.rowCount, 0);
  });

  it("refuses a tenant with unsupported operational dependency", async () => {
    if (!requireDb()) return;
    const clinic = await seedActiveClinic();
    await pool.query(
      `INSERT INTO activeclinic.patients (
         organization_id, healthcare_organization_id, patient_number,
         first_name, last_name, status
       ) VALUES ($1, $2, $3, 'Ada', 'Patient', 'active')`,
      [clinic.orgId, clinic.hcoId, `AC-${new Date().getFullYear()}-000001`]
    );
    const result = await purgeActiveClinicTestingOrganization(
      pool,
      {
        organizationKey: clinic.organizationKey,
        dryRun: false,
        confirmDestructive: true,
      },
      TESTING_ENV
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.BLOCKED);
    assert.equal(result.reason, "operational_data");
    assert.ok(result.operational.patients >= 1);
    assert.equal(await orgExists(clinic.organizationKey), true);
  });

  it("rolls back when an injected failure occurs mid-purge", async () => {
    if (!requireDb()) return;
    const clinic = await seedActiveClinic();
    const result = await purgeActiveClinicTestingOrganization(
      pool,
      {
        organizationKey: clinic.organizationKey,
        dryRun: false,
        confirmDestructive: true,
        allowTestFailureInjection: true,
        failAfter: "staff_members",
      },
      TESTING_ENV
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.MUTATION_ERROR);
    assert.equal(await orgExists(clinic.organizationKey), true);
    const staff = await pool.query(
      `SELECT 1 FROM activeclinic.staff_members WHERE id = $1`,
      [clinic.staffId]
    );
    assert.equal(staff.rowCount, 1);
    const hco = await pool.query(
      `SELECT 1 FROM activeclinic.healthcare_organizations WHERE id = $1`,
      [clinic.hcoId]
    );
    assert.equal(hco.rowCount, 1);
  });

  it("leaves a sibling tenant untouched", async () => {
    if (!requireDb()) return;
    const target = await seedActiveClinic();
    const sibling = await seedActiveClinic();
    const result = await purgeActiveClinicTestingOrganization(
      pool,
      {
        organizationKey: target.organizationKey,
        dryRun: false,
        confirmDestructive: true,
      },
      TESTING_ENV
    );
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(await orgExists(target.organizationKey), false);
    assert.equal(await orgExists(sibling.organizationKey), true);
    const siblingHco = await pool.query(
      `SELECT 1 FROM activeclinic.healthcare_organizations WHERE id = $1`,
      [sibling.hcoId]
    );
    assert.equal(siblingHco.rowCount, 1);
  });

  it("cannot purge a BlessBoard tenant through the ActiveClinic path", async () => {
    if (!requireDb()) return;
    const church = await seedBlessBoard(`qa-bb-purge-${Date.now().toString(36)}`);
    const result = await purgeActiveClinicTestingOrganization(
      pool,
      {
        organizationKey: church.organizationKey,
        dryRun: false,
        confirmDestructive: true,
      },
      TESTING_ENV
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.PRODUCT_DENIED);
    assert.equal(await orgExists(church.organizationKey), true);
    const remaining = await pool.query(
      `SELECT 1 FROM blessboard.churches WHERE id = $1`,
      [church.churchId]
    );
    assert.equal(remaining.rowCount, 1);
  });
});
