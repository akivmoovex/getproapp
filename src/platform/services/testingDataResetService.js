"use strict";

/**
 * BlessBoard V5 testing-only data reset orchestration.
 * Destructive. Requires DEPLOYMENT_ENV=testing + identity gates + confirmation.
 */

const crypto = require("crypto");
const { isTestingDataMaintenanceAllowed } = require("../config/testingDataMaintenance");
const { checkDatabaseIdentity } = require("../../../db/scripts/lib/databaseIdentity");
const { createMediaStorage } = require("../../blessboard/media/storage/createMediaStorage");
const { recordAuditEventSafe } = require("./auditEventService");
const repo = require("../repositories/testingDataResetRepository");

const STATUS = Object.freeze({
  OK: "ok",
  FORBIDDEN: "forbidden",
  INVALID_INPUT: "invalid_input",
  IDENTITY_BLOCKED: "identity_blocked",
  LOCK_BUSY: "lock_busy",
  PREVIEW_REQUIRED: "preview_required",
  PREVIEW_STALE: "preview_stale",
  LOOKUP_ERROR: "lookup_error",
  MUTATION_ERROR: "mutation_error",
  VERIFY_FAILED: "verify_failed",
});

const FULL_RESET_CONFIRM_PHRASE = "CLEAR BLESSBOARD TEST DATA";
const EXPECTED_IDENTITY_KEY = "blessboard-platform-v5";
const EXPECTED_DB_ENV = "testing";
const ADVISORY_LOCK_KEY = 824510019;
const PREVIEW_TTL_MS = 10 * 60 * 1000;

const CATEGORY_ACTIONS = Object.freeze([
  "clear_registrations",
  "clear_organizations",
  "clear_invitations",
  "clear_all",
]);

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function assertRuntimeTestingGate(env) {
  if (!isTestingDataMaintenanceAllowed(env)) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "deployment_env_not_testing" };
  }
  return { ok: true };
}

/**
 * @param {string} secret
 * @param {object} payload
 */
function signPreviewToken(secret, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/**
 * @param {string} secret
 * @param {string} token
 */
function verifyPreviewToken(secret, token) {
  const raw = String(token || "");
  const parts = raw.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [body, sig] = parts;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "bad_payload" };
  }
  if (!payload || typeof payload !== "object") return { ok: false, reason: "bad_payload" };
  if (Number(payload.exp) < Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {NodeJS.ProcessEnv} env
 */
async function assertDatabaseTestingIdentity(db, env) {
  const identity = await checkDatabaseIdentity(db, {
    identityKey: EXPECTED_IDENTITY_KEY,
  });
  if (!identity.ok) {
    return {
      ok: false,
      status: STATUS.IDENTITY_BLOCKED,
      reason: identity.code || "identity_failed",
    };
  }
  const key = identity.row && identity.row.identity_key;
  const envCode = identity.row && identity.row.environment_code;
  if (key !== EXPECTED_IDENTITY_KEY) {
    return { ok: false, status: STATUS.IDENTITY_BLOCKED, reason: "identity_key_mismatch" };
  }
  if (String(envCode || "").toLowerCase() !== EXPECTED_DB_ENV) {
    return { ok: false, status: STATUS.IDENTITY_BLOCKED, reason: "database_env_not_testing" };
  }
  // Runtime env must also be testing (already checked) — surface both for UI.
  if (!isTestingDataMaintenanceAllowed(env)) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "deployment_env_not_testing" };
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
 * @param {{ query: Function, connect?: Function }} db
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 */
async function loadMaintenancePageModel(db, opts = {}) {
  const env = opts.env || process.env;
  const runtime = assertRuntimeTestingGate(env);
  if (!runtime.ok) return runtime;

  const idGate = await assertDatabaseTestingIdentity(db, env);
  if (!idGate.ok) return idGate;

  try {
    const preserve = await repo.listPlatformAdminPreserveSet(db);
    const counts = await repo.countResettableCategories(db, {
      preserveOrgIds: preserve.orgIds,
      preserveUserIds: preserve.userIds,
    });
    const orphans = await repo.countOrphanTenantIdentities(db, preserve.userIds);
    return {
      ok: true,
      status: STATUS.OK,
      identityKey: idGate.identityKey,
      environmentCode: idGate.environmentCode,
      hostFingerprint: idGate.hostFingerprint,
      databaseName: idGate.databaseName,
      runtimeDeploymentEnv: "testing",
      counts,
      orphanTenantIdentities: orphans,
      preserve: {
        platformAdminUserCount: preserve.userIds.length,
        platformAdminOrganizationCount: preserve.orgIds.length,
      },
      confirmPhrase: FULL_RESET_CONFIRM_PHRASE,
      actions: CATEGORY_ACTIONS.slice(),
    };
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: "lookup_failed",
      message: err && err.message ? String(err.message).slice(0, 120) : "lookup_failed",
    };
  }
}

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   actorUserId: string,
 *   action: string,
 *   sessionSecret: string,
 * }} input
 */
async function previewTestingDataReset(db, input) {
  const env = input.env || process.env;
  const runtime = assertRuntimeTestingGate(env);
  if (!runtime.ok) return runtime;

  const action = String(input.action || "").trim();
  if (!CATEGORY_ACTIONS.includes(action) && action !== "preview") {
    // "preview" of full board uses clear_all counts
  }
  const previewAction = CATEGORY_ACTIONS.includes(action) ? action : "clear_all";

  const idGate = await assertDatabaseTestingIdentity(db, env);
  if (!idGate.ok) return idGate;

  if (!input.sessionSecret || String(input.sessionSecret).length < 16) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "session_secret_required" };
  }

  try {
    const preserve = await repo.listPlatformAdminPreserveSet(db);
    const counts = await repo.countResettableCategories(db, {
      preserveOrgIds: preserve.orgIds,
      preserveUserIds: preserve.userIds,
    });
    const targetOrgs = await repo.listResettableOrganizationIds(db, preserve.orgIds);
    const orphans = await repo.countOrphanTenantIdentities(db, preserve.userIds);

    const wouldDelete = summarizeWouldDelete(previewAction, counts);

    const issuedAt = Date.now();
    const payload = {
      action: previewAction,
      actorUserId: String(input.actorUserId || ""),
      issuedAt,
      exp: issuedAt + PREVIEW_TTL_MS,
      counts,
      targetOrganizationCount: targetOrgs.length,
      preserveUserCount: preserve.userIds.length,
      preserveOrgCount: preserve.orgIds.length,
    };
    const previewToken = signPreviewToken(String(input.sessionSecret), payload);

    return {
      ok: true,
      status: STATUS.OK,
      dryRun: true,
      action: previewAction,
      previewToken,
      expiresAt: new Date(payload.exp).toISOString(),
      identityKey: idGate.identityKey,
      environmentCode: idGate.environmentCode,
      hostFingerprint: idGate.hostFingerprint,
      counts,
      wouldDelete,
      targetOrganizationCount: targetOrgs.length,
      preservedPlatformAdminUsers: preserve.userIds.length,
      preservedPlatformAdminOrganizations: preserve.orgIds.length,
      orphanTenantIdentities: orphans,
      blockers: preserve.userIds.length
        ? []
        : ["no_active_platform_admin_to_preserve"],
      ambiguousNotDeleted: [
        "platform_admin_users_and_roles",
        "organizations_holding_platform_admin_roles",
        "apex_domains_with_null_organization_id",
        "canonical_plans_plan_features_deployments_products",
        "database_identity_and_schema_migrations",
        "orphaned_non_admin_user_identities_reported_only",
      ],
    };
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: "preview_failed",
      message: err && err.message ? String(err.message).slice(0, 120) : "preview_failed",
    };
  }
}

function summarizeWouldDelete(action, counts) {
  if (action === "clear_registrations") {
    return {
      registrations: counts.registrations,
      registration_support_contacts: counts.registration_support_contacts,
    };
  }
  if (action === "clear_invitations") {
    return { invitations: counts.invitations };
  }
  if (action === "clear_organizations") {
    return {
      organizations: counts.organizations,
      churches: counts.churches,
      tenant_role_assignments: counts.tenant_role_assignments,
      media_assets: counts.media_assets,
      tenant_domains: counts.tenant_domains,
      subscriptions: counts.subscriptions,
      tenant_sessions: counts.tenant_sessions,
      audit_events_for_resettable_orgs: counts.audit_events_for_resettable_orgs,
      invitations_for_those_orgs: "included_in_org_wipe",
    };
  }
  return {
    registrations: counts.registrations,
    registration_support_contacts: counts.registration_support_contacts,
    organizations: counts.organizations,
    churches: counts.churches,
    invitations: counts.invitations,
    tenant_role_assignments: counts.tenant_role_assignments,
    media_assets: counts.media_assets,
    tenant_domains: counts.tenant_domains,
    subscriptions: counts.subscriptions,
    tenant_sessions: counts.tenant_sessions,
    audit_events_for_resettable_orgs: counts.audit_events_for_resettable_orgs,
  };
}

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   actorUserId: string,
 *   action: string,
 *   confirmPhrase: string,
 *   confirmChecked: boolean,
 *   previewToken: string,
 *   sessionSecret: string,
 *   deploymentCode: string,
 *   keepSessionId?: string|null,
 *   dryRun?: boolean,
 * }} input
 */
async function executeTestingDataReset(db, input) {
  const env = input.env || process.env;
  const runtime = assertRuntimeTestingGate(env);
  if (!runtime.ok) return runtime;

  if (input.dryRun) {
    return previewTestingDataReset(db, {
      env,
      actorUserId: input.actorUserId,
      action: input.action,
      sessionSecret: input.sessionSecret,
    });
  }

  const action = String(input.action || "").trim();
  if (!CATEGORY_ACTIONS.includes(action)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "action_not_allowlisted" };
  }

  if (!input.confirmChecked) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "confirmation_checkbox_required" };
  }

  if (action === "clear_all") {
    if (String(input.confirmPhrase || "") !== FULL_RESET_CONFIRM_PHRASE) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: "confirm_phrase_mismatch" };
    }
  } else if (String(input.confirmPhrase || "").trim() === "") {
    // Category actions require typing the category key as confirmation.
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "confirm_phrase_required" };
  } else if (String(input.confirmPhrase || "") !== action) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "confirm_phrase_mismatch" };
  }

  const idGate = await assertDatabaseTestingIdentity(db, env);
  if (!idGate.ok) return idGate;

  const preview = verifyPreviewToken(String(input.sessionSecret || ""), input.previewToken);
  if (!preview.ok) {
    return {
      ok: false,
      status: STATUS.PREVIEW_REQUIRED,
      reason: preview.reason || "preview_required",
    };
  }
  if (String(preview.payload.action) !== action) {
    return { ok: false, status: STATUS.PREVIEW_STALE, reason: "preview_action_mismatch" };
  }
  if (String(preview.payload.actorUserId) !== String(input.actorUserId || "")) {
    return { ok: false, status: STATUS.PREVIEW_STALE, reason: "preview_actor_mismatch" };
  }

  if (!db || typeof db.connect !== "function") {
    return { ok: false, status: STATUS.MUTATION_ERROR, reason: "pool_connect_required" };
  }

  const client = await db.connect();
  let locked = false;
  let mediaObjects = [];
  const deleted = {};

  try {
    const lock = await client.query(`SELECT pg_try_advisory_lock($1) AS ok`, [ADVISORY_LOCK_KEY]);
    if (!lock.rows[0] || !lock.rows[0].ok) {
      return { ok: false, status: STATUS.LOCK_BUSY, reason: "concurrent_reset_in_progress" };
    }
    locked = true;

    await client.query("BEGIN");

    // Re-check identity inside the transaction connection.
    const idAgain = await assertDatabaseTestingIdentity(client, env);
    if (!idAgain.ok) {
      await client.query("ROLLBACK");
      return idAgain;
    }

    const preserve = await repo.listPlatformAdminPreserveSet(client);
    if (!preserve.userIds.length) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: STATUS.FORBIDDEN,
        reason: "no_platform_admin_to_preserve",
      };
    }

    const preCounts = await repo.countResettableCategories(client, {
      preserveOrgIds: preserve.orgIds,
      preserveUserIds: preserve.userIds,
    });

    if (action === "clear_registrations" || action === "clear_all") {
      deleted.registrations = await repo.deleteRegistrationApplications(client);
    }

    if (action === "clear_organizations" || action === "clear_all") {
      const orgIds = await repo.listResettableOrganizationIds(client, preserve.orgIds);
      const orgResult = await repo.deleteOrganizationTrees(client, {
        organizationIds: orgIds,
        preserveUserIds: preserve.userIds,
        keepSessionId: input.keepSessionId || null,
      });
      deleted.organizations = {
        organizations: orgResult.organizations,
        churches: orgResult.churches,
        auditEvents: orgResult.auditEvents,
        mediaListed: orgResult.mediaListed,
      };
      mediaObjects = orgResult.mediaObjects || [];
    }

    if (action === "clear_invitations" || action === "clear_all") {
      deleted.invitations = await repo.deleteAllInvitations(client);
    }

    const verify = await repo.verifyPreservedFoundation(client, {
      preserveUserIds: preserve.userIds,
      preserveOrgIds: preserve.orgIds,
    });
    if (!verify.ok) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: STATUS.VERIFY_FAILED,
        reason: "post_delete_verify_failed",
        failures: verify.failures,
      };
    }

    const orphans = await repo.countOrphanTenantIdentities(client, preserve.userIds);
    const postCounts = await repo.countResettableCategories(client, {
      preserveOrgIds: preserve.orgIds,
      preserveUserIds: preserve.userIds,
    });

    // Audit against a preserved platform-admin organization (required NOT NULL org_id).
    const auditOrgId = preserve.orgIds[0] || null;
    if (auditOrgId && input.deploymentCode) {
      await recordAuditEventSafe(client, {
        deploymentCode: input.deploymentCode,
        organizationId: auditOrgId,
        actorUserId: input.actorUserId,
        actionKey: "maintenance.testing_data_reset",
        entityType: "testing_data_reset",
        outcome: "success",
        metadata: {
          action,
          pre: summarizeSafeCounts(preCounts),
          deleted: summarizeDeleted(deleted),
          orphan_tenant_identities: orphans,
        },
      });
    }

    await client.query("COMMIT");

    const fileCleanup = await cleanupMediaFiles(env, mediaObjects);

    return {
      ok: true,
      status: STATUS.OK,
      action,
      deleted: summarizeDeleted(deleted),
      preCounts: summarizeSafeCounts(preCounts),
      postCounts: summarizeSafeCounts(postCounts),
      preservedPlatformAdminUsers: preserve.userIds.length,
      preservedPlatformAdminOrganizations: preserve.orgIds.length,
      orphanTenantIdentities: orphans,
      fileCleanup,
      identityKey: idAgain.identityKey,
      environmentCode: idAgain.environmentCode,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      status: STATUS.MUTATION_ERROR,
      reason: "mutation_failed",
      message: err && err.message ? String(err.message).slice(0, 160) : "mutation_failed",
      code: err && err.code ? String(err.code) : null,
    };
  } finally {
    if (locked) {
      try {
        await client.query(`SELECT pg_advisory_unlock($1)`, [ADVISORY_LOCK_KEY]);
      } catch {
        /* ignore */
      }
    }
    client.release();
  }
}

function summarizeSafeCounts(counts) {
  return {
    registrations: counts.registrations,
    organizations: counts.organizations,
    churches: counts.churches,
    invitations: counts.invitations,
    media_assets: counts.media_assets,
    subscriptions: counts.subscriptions,
    tenant_domains: counts.tenant_domains,
    preserved: counts.preserved,
  };
}

function summarizeDeleted(deleted) {
  const out = {};
  if (deleted.registrations) out.registrations = deleted.registrations;
  if (deleted.organizations) out.organizations = deleted.organizations;
  if (deleted.invitations) out.invitations = deleted.invitations;
  return out;
}

/**
 * Bounded local file cleanup only. Never follows symlinks; stays under media root.
 * @param {NodeJS.ProcessEnv} env
 * @param {Array<{ storageBucket: string, storageKey: string, churchId: string }>} mediaObjects
 */
async function cleanupMediaFiles(env, mediaObjects) {
  if (!mediaObjects || !mediaObjects.length) {
    return { attempted: 0, deleted: 0, failed: 0, skippedRemote: false, warnings: [] };
  }
  const storage = createMediaStorage(env);
  if (storage.kind !== "local") {
    return {
      attempted: mediaObjects.length,
      deleted: 0,
      failed: 0,
      skippedRemote: true,
      warnings: ["remote_media_not_deleted_automatically"],
    };
  }
  let deleted = 0;
  let failed = 0;
  const warnings = [];
  for (const obj of mediaObjects) {
    try {
      // Defense: keys must stay under blessboard/{churchId}/
      const key = String(obj.storageKey || "");
      const churchId = String(obj.churchId || "");
      if (!key.startsWith(`blessboard/${churchId}/`)) {
        failed += 1;
        warnings.push("skipped_key_outside_church_prefix");
        continue;
      }
      await storage.delete({ bucket: obj.storageBucket, storageKey: key });
      deleted += 1;
    } catch (err) {
      failed += 1;
      if (warnings.length < 5) {
        warnings.push(err && err.code ? String(err.code) : "file_delete_failed");
      }
    }
  }
  return {
    attempted: mediaObjects.length,
    deleted,
    failed,
    skippedRemote: false,
    warnings,
  };
}

module.exports = {
  STATUS,
  FULL_RESET_CONFIRM_PHRASE,
  EXPECTED_IDENTITY_KEY,
  EXPECTED_DB_ENV,
  CATEGORY_ACTIONS,
  ALLOWLISTED_ACTIONS: repo.ALLOWLISTED_ACTIONS,
  isTestingDataMaintenanceAllowed,
  assertRuntimeTestingGate,
  assertDatabaseTestingIdentity,
  loadMaintenancePageModel,
  previewTestingDataReset,
  executeTestingDataReset,
  signPreviewToken,
  verifyPreviewToken,
};
