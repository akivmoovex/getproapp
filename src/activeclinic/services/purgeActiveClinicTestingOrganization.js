"use strict";

/**
 * Testing-only ActiveClinic tenant purge.
 * Fail closed. Single-tenant. Never runs outside moovex-platform-v7 / testing.
 */

const { isTestingDataMaintenanceAllowed } = require("../../platform/config/testingDataMaintenance");
const { checkDatabaseIdentity } = require("../../../db/scripts/lib/databaseIdentity");
const { withProvisioningTransaction } = require("../../platform/db/provisioningTransaction");
const repo = require("../repositories/activeClinicTestingPurgeRepository");

const STATUS = Object.freeze({
  OK: "ok",
  FORBIDDEN: "forbidden",
  IDENTITY_BLOCKED: "identity_blocked",
  INVALID_INPUT: "invalid_input",
  NOT_ELIGIBLE: "not_eligible",
  PRODUCT_DENIED: "product_denied",
  BLOCKED: "blocked",
  MUTATION_ERROR: "mutation_error",
});

const EXPECTED_IDENTITY_KEY = "moovex-platform-v7";
const EXPECTED_DB_ENV = "testing";
const TOOL = "activeclinic-purge-testing-tenant";

function deny(status, reason, extra = {}) {
  return { ok: false, status, reason, ...extra };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function assertRuntimeTestingGate(env) {
  if (!isTestingDataMaintenanceAllowed(env)) {
    return deny(STATUS.FORBIDDEN, "deployment_env_not_testing");
  }
  return { ok: true };
}

/**
 * @param {{ query: Function }} db
 * @param {NodeJS.ProcessEnv} env
 */
async function assertDatabaseTestingIdentity(db, env) {
  const runtime = assertRuntimeTestingGate(env);
  if (!runtime.ok) return runtime;

  const expectedRaw = env && env.DATABASE_IDENTITY_EXPECTED;
  if (expectedRaw != null && String(expectedRaw).trim() !== "") {
    const expected = String(expectedRaw).trim().toLowerCase();
    if (expected !== EXPECTED_IDENTITY_KEY) {
      return deny(STATUS.IDENTITY_BLOCKED, "expected_identity_not_moovex_platform_v7");
    }
  }

  const identity = await checkDatabaseIdentity(db, { identityKey: EXPECTED_IDENTITY_KEY });
  if (!identity.ok) {
    return deny(STATUS.IDENTITY_BLOCKED, identity.code || "identity_failed");
  }
  const key = identity.row && identity.row.identity_key;
  const envCode = identity.row && identity.row.environment_code;
  if (key !== EXPECTED_IDENTITY_KEY) {
    return deny(STATUS.IDENTITY_BLOCKED, "identity_key_mismatch");
  }
  if (String(envCode || "").toLowerCase() !== EXPECTED_DB_ENV) {
    return deny(STATUS.IDENTITY_BLOCKED, "database_env_not_testing");
  }
  return {
    ok: true,
    identityKey: key,
    environmentCode: envCode,
    hostFingerprint: identity.row && identity.row.host_fingerprint,
    databaseName: identity.row && identity.row.database_name,
  };
}

/**
 * @param {object} orgRow
 * @param {string[]} preserveOrgIds
 * @param {string[]} productKeys
 * @param {string[]} hostnames
 */
function evaluateEligibility(orgRow, preserveOrgIds, productKeys, hostnames) {
  const organizationKey = String(orgRow.organization_key || "");
  if (repo.RESERVED_ORGANIZATION_KEYS.includes(organizationKey)) {
    return deny(STATUS.NOT_ELIGIBLE, "reserved_demo_tenant", {
      organizationKey,
    });
  }
  if (preserveOrgIds.includes(String(orgRow.id))) {
    return deny(STATUS.NOT_ELIGIBLE, "preserved_platform_admin_organization", {
      organizationKey,
    });
  }
  if (String(orgRow.data_environment || "").toLowerCase() !== "testing") {
    return deny(STATUS.NOT_ELIGIBLE, "organization_data_environment_not_testing", {
      organizationKey,
      dataEnvironment: orgRow.data_environment,
    });
  }
  if (orgRow.test_cleanup_eligible !== true) {
    return deny(STATUS.NOT_ELIGIBLE, "not_test_cleanup_eligible", {
      organizationKey,
    });
  }
  if (!productKeys.includes("activeclinic")) {
    return deny(STATUS.PRODUCT_DENIED, "product_not_activeclinic", {
      organizationKey,
      productKeys,
    });
  }
  if (productKeys.includes("blessboard")) {
    return deny(STATUS.PRODUCT_DENIED, "blessboard_product_enrolment", {
      organizationKey,
      productKeys,
    });
  }
  const productionHosts = hostnames.filter((h) => repo.PRODUCTION_HOSTNAME_RE.test(h));
  if (productionHosts.length) {
    return deny(STATUS.NOT_ELIGIBLE, "production_domain_reference", {
      organizationKey,
      productionHosts,
    });
  }
  return { ok: true };
}

/**
 * @param {object} input
 */
function resolveLookup(input) {
  const organizationKey = String((input && input.organizationKey) || "")
    .trim()
    .toLowerCase();
  const healthcareOrganizationId = String((input && input.healthcareOrganizationId) || "").trim();
  if (organizationKey) {
    return { ok: true, organizationKey, healthcareOrganizationId: null };
  }
  if (healthcareOrganizationId) {
    if (!repo.UUID_RE.test(healthcareOrganizationId)) {
      return deny(STATUS.INVALID_INPUT, "invalid_healthcare_organization_id");
    }
    return { ok: true, organizationKey: null, healthcareOrganizationId };
  }
  return deny(STATUS.INVALID_INPUT, "missing_organization_key");
}

/**
 * @param {object} counts
 * @param {object} operational
 * @param {object[]} unexpected
 * @param {object[]} sharedMedia
 * @param {number} siblingDuplicates
 */
function collectBlockers(counts, operational, unexpected, sharedMedia, siblingDuplicates) {
  const blockers = [];
  for (const [key, n] of Object.entries(operational || {})) {
    if (Number(n) > 0) {
      blockers.push({ code: "operational_data", table: key, count: Number(n) });
    }
  }
  for (const row of unexpected || []) {
    blockers.push({
      code: "unexpected_reference",
      table: row.table,
      column: row.column,
      count: row.count,
    });
  }
  if (sharedMedia && sharedMedia.length) {
    blockers.push({
      code: "shared_media_referenced_by_other_tenant",
      count: sharedMedia.length,
      media: sharedMedia,
    });
  }
  if (siblingDuplicates > 0) {
    blockers.push({
      code: "sibling_registration_duplicate_reference",
      count: siblingDuplicates,
    });
  }
  return blockers;
}

function buildAudit(input, identity, orgRow, hcoId, mode, counts, deleted, blockers) {
  return {
    tool: TOOL,
    actor: String((input && input.actor) || TOOL),
    targetOrganizationKey: orgRow ? String(orgRow.organization_key) : null,
    targetOrganizationId: orgRow ? String(orgRow.id) : null,
    healthcareOrganizationId: hcoId || null,
    timestamp: new Date().toISOString(),
    environment: EXPECTED_DB_ENV,
    identityKey: identity && identity.identityKey,
    databaseName: identity && identity.databaseName,
    mode,
    dryRunCounts: counts || null,
    deletedCounts: deleted || null,
    blockers: blockers || [],
  };
}

/**
 * Preview or purge one marked ActiveClinic testing organization.
 *
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   organizationKey?: string,
 *   healthcareOrganizationId?: string,
 *   dryRun?: boolean,
 *   confirmDestructive?: boolean,
 *   actor?: string,
 *   failAfter?: string,
 *   allowTestFailureInjection?: boolean,
 * }} input
 * @param {NodeJS.ProcessEnv} [env]
 */
async function purgeActiveClinicTestingOrganization(db, input, env) {
  const sourceEnv = env || process.env;
  const dryRun = input && input.dryRun === false ? false : true;
  if (!dryRun && !(input && input.confirmDestructive === true)) {
    return deny(STATUS.INVALID_INPUT, "confirm_required");
  }

  const identity = await assertDatabaseTestingIdentity(db, sourceEnv);
  if (!identity.ok) return identity;

  const lookup = resolveLookup(input || {});
  if (!lookup.ok) return lookup;

  const orgRow = lookup.organizationKey
    ? await repo.findOrganizationByKey(db, lookup.organizationKey)
    : await repo.findOrganizationByHealthcareOrganizationId(db, lookup.healthcareOrganizationId);
  if (!orgRow) {
    return deny(STATUS.NOT_ELIGIBLE, lookup.organizationKey ? "organization_not_found" : "healthcare_organization_not_found");
  }

  const organizationId = String(orgRow.id);
  const preserve = await repo.listPlatformAdminPreserveSet(db);
  const productKeys = await repo.listActiveProductKeys(db, organizationId);
  const hostnames = await repo.listDomainHostnames(db, organizationId);
  const eligibility = evaluateEligibility(
    orgRow,
    preserve.orgIds || [],
    productKeys,
    hostnames
  );
  if (!eligibility.ok) {
    return {
      ...eligibility,
      audit: buildAudit(input, identity, orgRow, orgRow.healthcare_organization_id || null, dryRun ? "dry_run" : "blocked", null, null, []),
    };
  }

  const scope = await repo.loadScopedIds(db, organizationId);
  const { counts, operational, operationalTotal } = await repo.collectCounts(db, organizationId, scope);
  const unexpected = await repo.listUnexpectedActiveClinicOrgReferences(db, organizationId);
  const sharedMedia = await repo.listSharedMediaBlockers(db, organizationId);
  const siblingDuplicates = await repo.countSiblingDuplicateReferences(
    db,
    scope.applicationIds,
    organizationId
  );
  const ownedMedia = await repo.listOwnedMediaStorageKeys(db, organizationId);
  const identityClass = await repo.classifyIdentities(db, organizationId, scope.identityIds);
  const blockers = collectBlockers(
    counts,
    operational,
    unexpected,
    sharedMedia,
    siblingDuplicates
  );

  const reportBase = {
    organization: {
      id: organizationId,
      organizationKey: String(orgRow.organization_key),
      displayName: String(orgRow.display_name),
      dataEnvironment: String(orgRow.data_environment),
      testCleanupEligible: true,
    },
    healthcareOrganizationIds: scope.healthcareOrganizationIds,
    facilityIds: scope.facilityIds,
    staffIds: scope.staffIds,
    counts,
    operational,
    operationalTotal,
    blockers,
    retained: { identities: identityClass.retained },
    orphanCandidates: ownedMedia.map((m) => ({
      kind: "website_media_storage",
      mediaId: m.mediaId,
      storageKey: m.storageKey,
      note: "DB row is tenant-owned and will be deleted; object storage is not deleted by this tool",
    })),
  };

  if (blockers.length) {
    return {
      ok: false,
      status: STATUS.BLOCKED,
      reason: blockers[0].code,
      dryRun,
      ...reportBase,
      audit: buildAudit(
        input,
        identity,
        orgRow,
        scope.healthcareOrganizationIds[0] || null,
        "blocked",
        counts,
        null,
        blockers
      ),
    };
  }

  if (dryRun) {
    return {
      ok: true,
      status: STATUS.OK,
      reason: "dry_run",
      dryRun: true,
      deleted: null,
      ...reportBase,
      audit: buildAudit(
        input,
        identity,
        orgRow,
        scope.healthcareOrganizationIds[0] || null,
        "dry_run",
        counts,
        null,
        []
      ),
    };
  }

  const failAfter =
    input &&
    input.allowTestFailureInjection === true &&
    String(sourceEnv.NODE_ENV || "") === "test"
      ? input.failAfter || null
      : null;

  try {
    const mutated = await withProvisioningTransaction(db, async (client) => {
      const liveOrg = lookup.organizationKey
        ? await repo.findOrganizationByKey(client, lookup.organizationKey)
        : await repo.findOrganizationByHealthcareOrganizationId(
            client,
            lookup.healthcareOrganizationId
          );
      if (!liveOrg || String(liveOrg.id) !== organizationId) {
        const err = new Error("organization_changed");
        err.code = "ELIGIBILITY_RACE";
        throw err;
      }
      const liveProducts = await repo.listActiveProductKeys(client, organizationId);
      const liveHosts = await repo.listDomainHostnames(client, organizationId);
      const livePreserve = await repo.listPlatformAdminPreserveSet(client);
      const liveElig = evaluateEligibility(
        liveOrg,
        livePreserve.orgIds || [],
        liveProducts,
        liveHosts
      );
      if (!liveElig.ok) {
        const err = new Error(liveElig.reason);
        err.code = "ELIGIBILITY_RACE";
        throw err;
      }
      const liveScope = await repo.loadScopedIds(client, organizationId);
      const liveCounts = await repo.collectCounts(client, organizationId, liveScope);
      const liveUnexpected = await repo.listUnexpectedActiveClinicOrgReferences(
        client,
        organizationId
      );
      const liveShared = await repo.listSharedMediaBlockers(client, organizationId);
      const liveDupes = await repo.countSiblingDuplicateReferences(
        client,
        liveScope.applicationIds,
        organizationId
      );
      const liveBlockers = collectBlockers(
        liveCounts.counts,
        liveCounts.operational,
        liveUnexpected,
        liveShared,
        liveDupes
      );
      if (liveBlockers.length) {
        const err = new Error(liveBlockers[0].code);
        err.code = "BLOCKED_IN_TRANSACTION";
        err.blockers = liveBlockers;
        throw err;
      }
      const liveIdentities = await repo.classifyIdentities(
        client,
        organizationId,
        liveScope.identityIds
      );
      return repo.deleteActiveClinicTestingOrganization(client, {
        organizationId,
        preserveOrgIds: livePreserve.orgIds || [],
        preserveUserIds: livePreserve.userIds || [],
        identityIds: liveIdentities.deletable,
        failAfter,
      });
    });

    return {
      ok: true,
      status: STATUS.OK,
      reason: "purged",
      dryRun: false,
      deleted: mutated.deleted,
      ...reportBase,
      retained: { identities: identityClass.retained },
      audit: buildAudit(
        input,
        identity,
        orgRow,
        scope.healthcareOrganizationIds[0] || null,
        "purged",
        counts,
        mutated.deleted,
        []
      ),
    };
  } catch (err) {
    const reason =
      (err && err.code === "BLOCKED_IN_TRANSACTION" && err.message) ||
      (err && err.code) ||
      "mutation_error";
    return {
      ok: false,
      status: STATUS.MUTATION_ERROR,
      reason: String(reason),
      dryRun: false,
      message: err && err.message ? String(err.message) : "purge_failed",
      blockers: (err && err.blockers) || blockers,
      ...reportBase,
      audit: buildAudit(
        input,
        identity,
        orgRow,
        scope.healthcareOrganizationIds[0] || null,
        "mutation_error",
        counts,
        null,
        (err && err.blockers) || blockers
      ),
    };
  }
}

module.exports = {
  STATUS,
  EXPECTED_IDENTITY_KEY,
  EXPECTED_DB_ENV,
  TOOL,
  assertRuntimeTestingGate,
  assertDatabaseTestingIdentity,
  purgeActiveClinicTestingOrganization,
};
