#!/usr/bin/env node
"use strict";

/**
 * Disposable registration/provisioning QA against moovex-platform-v7 / testing.
 * Creates one ActiveClinic clinic and one BlessBoard church, verifies stages,
 * then purges the organizations. Never prints credentials.
 *
 * Usage:
 *   scripts/local/run-with-blessboard-env.sh testing \
 *     node db/scripts/v7-testing-registration-qa.js
 */

const crypto = require("crypto");
const { Pool } = require("pg");
const { requireDatabaseUrl } = require("./lib/databaseUrl");
const { buildFoundationPoolConfig } = require("./lib/foundationPool");
const { checkDatabaseIdentity } = require("./lib/databaseIdentity");
const {
  submitAndProvisionClinicRegistration,
} = require("../../src/activeclinic/services/submitClinicRegistrationService");
const {
  submitChurchRegistration,
} = require("../../src/blessboard/services/platformChurchRegistrationService");
const {
  validatePlatformChurchRegistration,
} = require("../../src/blessboard/services/platformChurchRegistrationValidation");
const {
  purgeActiveClinicTestingOrganization,
} = require("../../src/activeclinic/services/purgeActiveClinicTestingOrganization");
const {
  purgeOrganizationTree,
  listPlatformAdminPreserveSet,
} = require("../../src/platform/repositories/testingDataResetRepository");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
} = require("../../src/platform/config/canonicalDeploymentProfiles");

const EXPECTED_KEY = "moovex-platform-v7";
const EXPECTED_ENV = "testing";
const PASSWORD = "Bugfix04QaPass99!";
const stamp = Date.now().toString(36);
const nonce = crypto.randomBytes(3).toString("hex");

function fakeReq() {
  return {
    ip: "203.0.113.40",
    requestId: `bugfix04-qa-${stamp}`,
    get: () => "bugfix04-qa-agent",
  };
}

async function main() {
  const env = {
    ...process.env,
    PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
    DEPLOYMENT_ENV: "testing",
    DATABASE_IDENTITY_EXPECTED: EXPECTED_KEY,
    DATABASE_IDENTITY_ENV: EXPECTED_ENV,
  };
  const pool = new Pool(buildFoundationPoolConfig(requireDatabaseUrl(), { max: 4 }));
  const created = { clinicOrgKey: null, churchOrgId: null, churchAppId: null };
  try {
    const identity = await checkDatabaseIdentity(pool, { identityKey: EXPECTED_KEY });
    if (!identity.ok || String(identity.row.environment_code || "").toLowerCase() !== EXPECTED_ENV) {
      // eslint-disable-next-line no-console
      console.error("[v7-testing-registration-qa] identity is not moovex-platform-v7/testing.");
      process.exit(2);
    }

    const clinic = await submitAndProvisionClinicRegistration(pool, {
      clinicName: `BF04 QA Clinic ${stamp}`,
      contactName: "QA Clinic Admin",
      contactEmail: `bf04-clinic-${stamp}-${nonce}@example.invalid`,
      contactPhone: `+26097${String(Date.now()).slice(-7)}`,
      province: "Lusaka Province",
      city: "Lusaka",
      address: "QA Avenue",
      countryCode: "ZM",
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      acceptTerms: "on",
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
      dataEnvironment: "testing",
      env,
    });

    const clinicOrgId = clinic.organizationId || (clinic.application && clinic.application.organizationId);
    let clinicOrgKey = null;
    let clinicRow = null;
    if (clinicOrgId) {
      const org = await pool.query(
        `SELECT organization_key, test_cleanup_eligible FROM platform.organizations WHERE id = $1`,
        [clinicOrgId]
      );
      clinicOrgKey = org.rows[0] && org.rows[0].organization_key;
      created.clinicOrgKey = clinicOrgKey;
      clinicRow = (
        await pool.query(
          `SELECT status, provisioning_status, last_provision_stage, last_provision_error,
                  organization_id, healthcare_organization_id, facility_id, website_instance_id,
                  clinic_admin_staff_id
             FROM activeclinic.clinic_registration_applications
            WHERE id = $1`,
          [clinic.application && clinic.application.id]
        )
      ).rows[0];
    }

    const churchKey = `bf04ch${stamp}${nonce}`.slice(0, 32);
    const churchBody = {
      church_name: `BF04 QA Church ${stamp} ${nonce}`,
      country: "Zambia",
      city: "Lusaka",
      contact_name: "QA Church Admin",
      role_in_church: "Pastor",
      phone: `+26096${String(Date.now()).slice(-7)}`,
      email: `bf04-church-${stamp}-${nonce}@example.org`,
      selected_plan: "foundation",
      organization_key: churchKey,
      password: PASSWORD,
      password_confirm: PASSWORD,
      branch_name: "HQ Campus",
      consent_contact: "on",
    };
    const validation = validatePlatformChurchRegistration(churchBody, { instantFreeEnabled: true });
    const church = validation.ok
      ? await submitChurchRegistration(pool, fakeReq(), validation, {
          env,
          dataEnvironment: "testing",
          deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
        })
      : { ok: false, error: "validation_failed", validation };
    const churchApp = church.application || null;
    created.churchAppId = churchApp && churchApp.id;
    const churchOrgId =
      (church.records && church.records.organizationId) ||
      (church.provision && church.provision.organizationId) ||
      (churchApp && (churchApp.organization_id || churchApp.organizationId)) ||
      null;
    created.churchOrgId = churchOrgId;
    let churchRow = null;
    if (churchApp && churchApp.id) {
      churchRow = (
        await pool.query(
          `SELECT application_status, provisioning_status, last_provision_stage, provisioning_error_code,
                  organization_id
             FROM blessboard.platform_church_registration_applications
            WHERE id = $1`,
          [churchApp.id]
        )
      ).rows[0];
    }

    let clinicCounts = null;
    if (clinicOrgId) {
      clinicCounts = (
        await pool.query(
          `SELECT
             (SELECT count(*)::int FROM activeclinic.healthcare_organizations WHERE organization_id = $1) AS healthcare_orgs,
             (SELECT count(*)::int FROM activeclinic.facilities WHERE organization_id = $1) AS facilities,
             (SELECT count(*)::int FROM activeclinic.staff_members WHERE organization_id = $1) AS staff,
             (SELECT count(*)::int FROM platform.website_instances WHERE organization_id = $1 AND product_code = 'activeclinic') AS websites`,
          [clinicOrgId]
        )
      ).rows[0];
    }
    let churchCounts = null;
    if (churchOrgId) {
      churchCounts = (
        await pool.query(
          `SELECT
             (SELECT count(*)::int FROM blessboard.churches WHERE organization_id = $1) AS churches,
             (SELECT count(*)::int FROM blessboard.user_roles WHERE organization_id = $1) AS admin_roles,
             (SELECT count(*)::int FROM platform.website_instances WHERE organization_id = $1 AND product_code = 'blessboard') AS websites`,
          [churchOrgId]
        )
      ).rows[0];
    }

    let clinicPurge = null;
    let churchPurge = null;
    async function purgeCreated() {
      if (created.clinicOrgKey && !clinicPurge) {
        clinicPurge = await purgeActiveClinicTestingOrganization(
          pool,
          { organizationKey: created.clinicOrgKey, dryRun: false, confirmDestructive: true },
          env
        );
      }
      if (created.churchOrgId && !churchPurge) {
        const preserve = await listPlatformAdminPreserveSet(pool);
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          churchPurge = await purgeOrganizationTree(client, {
            organizationId: created.churchOrgId,
            preserveOrgIds: preserve.orgIds || [],
            preserveUserIds: preserve.userIds || [],
          });
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK").catch(() => {});
          churchPurge = { ok: false, error: err && err.message ? err.message : String(err) };
        } finally {
          client.release();
        }
      }
      if (created.churchAppId) {
        await pool
          .query(`DELETE FROM blessboard.platform_church_registration_applications WHERE id = $1`, [
            created.churchAppId,
          ])
          .catch(() => {});
      }
    }

    const clinicOk =
      clinic.ok === true &&
      clinic.code !== "schema_mismatch" &&
      clinicRow &&
      clinicRow.provisioning_status === "provisioned" &&
      clinicRow.last_provision_stage == null &&
      clinicCounts &&
      clinicCounts.healthcare_orgs >= 1 &&
      clinicCounts.facilities >= 1 &&
      clinicCounts.staff >= 1 &&
      clinicCounts.websites >= 1;
    const churchOk =
      church.ok === true &&
      churchRow &&
      String(churchRow.application_status) === "active" &&
      churchOrgId &&
      churchCounts &&
      churchCounts.churches >= 1;

    await purgeCreated();

    const report = {
      ok: clinicOk && churchOk,
      identity_key: identity.row.identity_key,
      environment_code: identity.row.environment_code,
      activeclinic: {
        ok: clinicOk,
        code: clinic.code || null,
        schemaMismatch: clinic.code === "schema_mismatch",
        applicationStatus: clinicRow && clinicRow.status,
        provisioningStatus: clinicRow && clinicRow.provisioning_status,
        lastProvisionStage: clinicRow && clinicRow.last_provision_stage,
        lastProvisionError: clinicRow && clinicRow.last_provision_error,
        counts: clinicCounts,
        purged: Boolean(clinicPurge && clinicPurge.ok),
      },
      blessboard: {
        ok: churchOk,
        engineOk: church.ok === true,
        error: church.error || church.code || null,
        applicationStatus: churchRow && churchRow.application_status,
        provisioningStatus: churchRow && churchRow.provisioning_status,
        lastProvisionStage: churchRow && churchRow.last_provision_stage,
        provisioningErrorCode: churchRow && churchRow.provisioning_error_code,
        counts: churchCounts,
        purged: Boolean(churchPurge && churchPurge.ok !== false),
      },
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 4);
  } catch (err) {
    try {
      if (created.clinicOrgKey) {
        await purgeActiveClinicTestingOrganization(
          pool,
          { organizationKey: created.clinicOrgKey, dryRun: false, confirmDestructive: true },
          { ...process.env, PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING, DEPLOYMENT_ENV: "testing" }
        );
      }
      if (created.churchOrgId) {
        const preserve = await listPlatformAdminPreserveSet(pool);
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await purgeOrganizationTree(client, {
            organizationId: created.churchOrgId,
            preserveOrgIds: preserve.orgIds || [],
            preserveUserIds: preserve.userIds || [],
          });
          await client.query("COMMIT");
        } catch {
          await client.query("ROLLBACK").catch(() => {});
        } finally {
          client.release();
        }
      }
    } catch {
      /* purge best-effort */
    }
    // eslint-disable-next-line no-console
    console.error(`[v7-testing-registration-qa] ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
