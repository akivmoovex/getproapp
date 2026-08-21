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
  purgeActiveClinicTestingOrganization,
  assertDatabaseTestingIdentity,
  EXPECTED_IDENTITY_KEY,
  EXPECTED_DB_ENV,
} = require("../services/purgeActiveClinicTestingOrganization");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
} = require("../../platform/config/canonicalDeploymentProfiles");
const { RESERVED_ORGANIZATION_KEYS } = require("../repositories/activeClinicTestingPurgeRepository");

const TOOL = "activeclinic-hosted-auth-qa";
const KEY_PREFIX = "ac-hqa-";

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
  const clinicName = `Hosted QA ${stamp}`;

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
  };
}

/**
 * @param {{ query: Function }} db
 * @param {string} organizationKey
 * @param {NodeJS.ProcessEnv} [env]
 */
async function cleanupHostedAuthQaClinic(db, organizationKey, env) {
  return purgeActiveClinicTestingOrganization(
    db,
    {
      organizationKey,
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
  };
}

module.exports = {
  TOOL,
  KEY_PREFIX,
  EXPECTED_IDENTITY_KEY,
  EXPECTED_DB_ENV,
  hostedQaEnv,
  provisionHostedAuthQaClinic,
  cleanupHostedAuthQaClinic,
  publicFixtureRecord,
};
