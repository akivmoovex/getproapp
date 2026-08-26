"use strict";

/**
 * Testing-only disposable ActiveClinic clinic for hosted authenticated QA.
 * Fail closed outside moovex-platform-v7 / testing. Never logs passwords.
 */

const crypto = require("crypto");
const {
  submitAndProvisionClinicRegistration,
} = require("../services/submitClinicRegistrationService");
const {
  createAppointmentServiceType,
} = require("../services/activeClinicAppointmentService");
const {
  purgeActiveClinicTestingOrganization,
  assertDatabaseTestingIdentity,
  EXPECTED_IDENTITY_KEY,
  EXPECTED_DB_ENV,
  STATUS: PURGE_STATUS,
} = require("../services/purgeActiveClinicTestingOrganization");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
} = require("../../platform/config/canonicalDeploymentProfiles");
const { RESERVED_ORGANIZATION_KEYS } = require("../repositories/activeClinicTestingPurgeRepository");

const TOOL = "activeclinic-hosted-auth-qa";
const KEY_PREFIX = "ac-hqa-";
const ALLOWED_KEY_PREFIXES = Object.freeze(["ac-hqa-", "hosted-qa-"]);

function isHostedQaOrganizationKey(organizationKey) {
  const key = String(organizationKey || "").trim().toLowerCase();
  return ALLOWED_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function generateQaPassword() {
  return `Hq${crypto.randomBytes(12).toString("base64url")}9!`;
}

function generatePhone() {
  return `+26097${String(Date.now()).slice(-7)}`;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function hostedQaEnv(env) {
  const source = env || process.env;
  return {
    ...source,
    PLATFORM_DEPLOYMENT_CODE: source.PLATFORM_DEPLOYMENT_CODE || CODE_MOOVEX_PLATFORM_TESTING,
    DEPLOYMENT_ENV: "testing",
    DATABASE_IDENTITY_EXPECTED: EXPECTED_IDENTITY_KEY,
    DATABASE_IDENTITY_ENV: EXPECTED_DB_ENV,
  };
}

/**
 * @param {{ query: Function }} db
 * @param {object} input
 * @param {NodeJS.ProcessEnv} [env]
 */
async function provisionHostedAuthQaClinic(db, input, env) {
  const sourceEnv = hostedQaEnv(env);
  const identity = await assertDatabaseTestingIdentity(db, sourceEnv);
  if (!identity.ok) return identity;

  const stamp = `${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
  const organizationHint = `${KEY_PREFIX}${stamp}`.slice(0, 48);
  const password = String((input && input.password) || generateQaPassword());
  const adminEmail = `hosted-qa-${stamp}@example.invalid`;
  const adminPhone = generatePhone();
  const clinicName = `Ac Hqa ${stamp}`;

  const clinic = await submitAndProvisionClinicRegistration(db, {
    clinicName,
    contactName: "Hosted QA Admin",
    contactEmail: adminEmail,
    contactPhone: adminPhone,
    province: "Lusaka Province",
    city: "Lusaka",
    address: "QA Avenue",
    countryCode: "ZM",
    password,
    passwordConfirm: password,
    acceptTerms: "on",
    deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
    dataEnvironment: "testing",
    organizationKey: organizationHint,
    env: sourceEnv,
  });

  if (!clinic.ok || clinic.reviewRequired) {
    return {
      ok: false,
      reason: clinic.code || "provision_failed",
      reviewRequired: clinic.reviewRequired === true,
    };
  }

  const organizationId = clinic.organizationId;
  const org = organizationId
    ? (
        await db.query(
          `SELECT organization_key, test_cleanup_eligible, data_environment
             FROM platform.organizations WHERE id = $1`,
          [organizationId]
        )
      ).rows[0]
    : null;
  const organizationKey = String(
    (org && org.organization_key) || clinic.slug || organizationHint
  ).toLowerCase();

  if (RESERVED_ORGANIZATION_KEYS.includes(organizationKey)) {
    return { ok: false, reason: "reserved_demo_tenant", organizationKey };
  }
  if (!org || org.test_cleanup_eligible !== true) {
    if (organizationId) {
      await db.query(
        `UPDATE platform.organizations SET test_cleanup_eligible = true WHERE id = $1`,
        [organizationId]
      );
    }
  }

  const prepared = await prepareHostedAuthQaBookable(db, {
    organizationId,
    organizationKey,
    identityId: clinic.identityId || null,
  });
  const published = await publishHostedAuthQaWebsite(
    db,
    {
      organizationId,
      organizationKey,
      identityId: clinic.identityId || null,
    },
    sourceEnv
  );

  return {
    ok: true,
    tool: TOOL,
    organizationKey,
    clinicKey: organizationKey,
    adminEmail,
    adminPhone,
    password,
    organizationId,
    identityId: clinic.identityId || null,
    serviceKey: prepared.serviceKey || null,
    bookable: prepared.ok === true,
    websitePublished: published.ok === true,
    websitePublishReason: published.reason || null,
  };
}

async function assertHostedQaOrganization(db, organizationId, organizationKey) {
  const id = String(organizationId || "");
  const key = String(organizationKey || "").trim().toLowerCase();
  if (!id || !key) return { ok: false, reason: "missing_organization" };
  if (!isHostedQaOrganizationKey(key) || RESERVED_ORGANIZATION_KEYS.includes(key)) {
    return { ok: false, reason: "organization_key_not_hosted_qa_prefix" };
  }
  const row = await db.query(
    `SELECT organization_key FROM platform.organizations WHERE id = $1`,
    [id]
  );
  const found = String((row.rows[0] && row.rows[0].organization_key) || "").toLowerCase();
  if (found !== key) {
    return { ok: false, reason: "organization_key_mismatch" };
  }
  return { ok: true, organizationId: id, organizationKey: key };
}

/**
 * Scoped to the disposable org only. Creates one consultation service and
 * enables public booking so hosted MF10 can run without touching demo tenants.
 * @param {{ query: Function }} db
 * @param {{ organizationId: string, organizationKey: string, identityId: string|null }} input
 */
async function prepareHostedAuthQaBookable(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const identityId = String((input && input.identityId) || "");
  const scoped = await assertHostedQaOrganization(db, organizationId, input && input.organizationKey);
  if (!scoped.ok) return scoped;
  const hco = await db.query(
    `SELECT id FROM activeclinic.healthcare_organizations
      WHERE organization_id = $1 AND status = 'active' LIMIT 1`,
    [organizationId]
  );
  const healthcareOrganizationId = hco.rows[0] && hco.rows[0].id;
  if (!healthcareOrganizationId) {
    return { ok: false, reason: "missing_hco" };
  }
  const staff = identityId
    ? await db.query(
        `SELECT id FROM activeclinic.staff_members
          WHERE organization_id = $1 AND platform_identity_id = $2 AND status = 'active'
          LIMIT 1`,
        [organizationId, identityId]
      )
    : { rows: [] };
  const staffMemberId = staff.rows[0] && staff.rows[0].id;
  const serviceKey = "qa-consultation";
  const created = staffMemberId
    ? await createAppointmentServiceType(db, {
        organizationId,
        healthcareOrganizationId,
        serviceKey,
        displayName: "QA consultation",
        defaultDurationMinutes: 30,
        actor: { staffMemberId, organizationId, platformIdentityId: identityId || undefined },
      })
    : { ok: false };
  if (!created.ok) {
    const repo = require("../repositories/appointmentRepository");
    await repo.insertServiceType(db, {
      organizationId,
      healthcareOrganizationId,
      serviceKey,
      displayName: "QA consultation",
      defaultDurationMinutes: 30,
      requiresAssignedStaff: false,
      status: "active",
    }).catch(() => {});
  }
  await db.query(
    `UPDATE activeclinic.appointment_service_types
        SET public_website_visible = true
      WHERE organization_id = $1 AND service_key = $2`,
    [organizationId, serviceKey]
  );
  await db.query(
    `UPDATE activeclinic.healthcare_organizations
        SET public_booking_enabled = true
      WHERE id = $1 AND organization_id = $2`,
    [healthcareOrganizationId, organizationId]
  );
  return { ok: true, serviceKey };
}

/**
 * Publish the disposable clinic website using the same product services as CMS.
 * Guarded to hosted-QA organization keys only.
 * @param {{ query: Function }} db
 * @param {{ organizationId: string, organizationKey: string, identityId: string|null }} input
 * @param {NodeJS.ProcessEnv} [env]
 */
async function publishHostedAuthQaWebsite(db, input, env) {
  const scoped = await assertHostedQaOrganization(
    db,
    input && input.organizationId,
    input && input.organizationKey
  );
  if (!scoped.ok) return scoped;
  const instanceRepo = require("../../platform/website/instanceRepository");
  const publicationService = require("../../platform/website/publicationService");
  const { setClinicWebsiteAvailability } = require("../services/clinicWebsiteAvailabilityService");
  const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(db, {
    organizationId: scoped.organizationId,
    productCode: "activeclinic",
  });
  if (!instance) return { ok: false, reason: "website_instance_missing" };
  const published = await publicationService.publishWebsiteDraft(db, {
    organizationId: scoped.organizationId,
    instanceId: instance.id,
    expectedProductCode: "activeclinic",
    actorIdentityId: input.identityId || null,
    allowEmpty: true,
  });
  if (!published.ok) {
    return { ok: false, reason: published.code || "publish_failed" };
  }
  const availability = await setClinicWebsiteAvailability(db, {
    organizationKey: scoped.organizationKey,
    public: true,
    actorIdentityId: input.identityId || null,
    overrideReadiness: true,
    reason: "hosted_auth_qa",
    env: hostedQaEnv(env),
  });
  return {
    ok: availability.ok === true,
    reason: availability.code || null,
    websitePublished: availability.websitePublished === true,
  };
}

/**
 * @param {{ query: Function }} db
 * @param {string} organizationKey
 * @param {NodeJS.ProcessEnv} [env]
 */
async function cleanupHostedAuthQaClinic(db, organizationKey, env) {
  const key = String(organizationKey || "").trim().toLowerCase();
  if (!isHostedQaOrganizationKey(key)) {
    return {
      ok: false,
      status: PURGE_STATUS.INVALID_INPUT,
      reason: "organization_key_not_hosted_qa_prefix",
    };
  }
  if (RESERVED_ORGANIZATION_KEYS.includes(key)) {
    return {
      ok: false,
      status: PURGE_STATUS.NOT_ELIGIBLE,
      reason: "reserved_demo_tenant",
      organizationKey: key,
    };
  }
  return purgeActiveClinicTestingOrganization(
    db,
    {
      organizationKey: key,
      dryRun: false,
      confirmDestructive: true,
      actor: `cli:${TOOL}`,
    },
    hostedQaEnv(env)
  );
}

function publicFixtureRecord(fixture) {
  if (!fixture || !fixture.ok) return fixture;
  return {
    ok: true,
    tool: TOOL,
    organizationKey: fixture.organizationKey,
    clinicKey: fixture.clinicKey,
    adminEmail: fixture.adminEmail,
    passwordSet: true,
    bookable: fixture.bookable === true,
    websitePublished: fixture.websitePublished === true,
  };
}

module.exports = {
  TOOL,
  KEY_PREFIX,
  ALLOWED_KEY_PREFIXES,
  isHostedQaOrganizationKey,
  EXPECTED_IDENTITY_KEY,
  EXPECTED_DB_ENV,
  hostedQaEnv,
  provisionHostedAuthQaClinic,
  prepareHostedAuthQaBookable,
  publishHostedAuthQaWebsite,
  cleanupHostedAuthQaClinic,
  publicFixtureRecord,
};
