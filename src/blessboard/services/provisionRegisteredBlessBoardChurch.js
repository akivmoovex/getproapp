"use strict";

/**
 * Shared Foundation registration provisioning orchestrator.
 * Does not wire HTTP routes. Caller supplies pool + applicationId + password.
 */

const bcrypt = require("bcryptjs");
const appRepo = require("../repositories/platformChurchRegistrationRepository");
const authRepo = require("../repositories/blessBoardAuthRepository");
const publicContentRepo = require("../repositories/publicContentRepository");
const entitlementRepo = require("../../platform/repositories/entitlementRepository");
const {
  withProvisioningTransaction,
  resolveManageTransactionOption,
  openProvisioningSession,
} = require("../../platform/db/provisioningTransaction");
const { provisionPlatformTenant } = require("../../platform/services/provisionPlatformTenant");
const churchProvision = require("./provisionBlessBoardChurch");
const userCreate = require("./createBlessBoardUser");
const roleAssign = require("./assignBlessBoardRole");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const { normalizeOrganizationKey } = require("./organizationKey");
const { PUBLIC_PAGE_KEYS, PAGE_KEY_TITLES } = require("./publicContentConstants");
const { BCRYPT_ROUNDS, normalizeEmail } = userCreate;
const STATUS = Object.freeze({
  OK: "ok",
  ALREADY_PROVISIONED: "already_provisioned",
  INVALID_INPUT: "invalid_input",
  APPLICATION_NOT_FOUND: "application_not_found",
  APPLICATION_NOT_ELIGIBLE: "application_not_eligible",
  APPLICATION_ALREADY_PROVISIONED: "application_already_provisioned",
  PROVISIONING_IN_PROGRESS: "provisioning_in_progress",
  RETRY_NOT_ALLOWED: "retry_not_allowed",
  DUPLICATE_EMAIL_REVIEW: "duplicate_email_review",
  SLUG_UNAVAILABLE: "slug_unavailable",
  INVALID_PLAN: "invalid_plan",
  PLAN_CONFIGURATION_ERROR: "plan_configuration_error",
  DATABASE_CONFLICT: "database_conflict",
  DATABASE_UNAVAILABLE: "database_unavailable",
  PROVISIONING_FAILED: "provisioning_failed",
  INTERNAL_ERROR: "internal_error",
});

const ERROR_META = Object.freeze({
  [STATUS.INVALID_INPUT]: {
    retryable: false,
    severity: "warn",
    publicMessage: "The request could not be processed.",
  },
  [STATUS.APPLICATION_NOT_FOUND]: {
    retryable: false,
    severity: "warn",
    publicMessage: "The registration request was not found.",
  },
  [STATUS.APPLICATION_NOT_ELIGIBLE]: {
    retryable: false,
    severity: "warn",
    publicMessage: "This registration cannot be provisioned.",
  },
  [STATUS.APPLICATION_ALREADY_PROVISIONED]: {
    retryable: false,
    severity: "info",
    publicMessage: "This registration is already provisioned.",
  },
  [STATUS.PROVISIONING_IN_PROGRESS]: {
    retryable: true,
    severity: "info",
    publicMessage: "Provisioning is already in progress. Please wait.",
  },
  [STATUS.RETRY_NOT_ALLOWED]: {
    retryable: false,
    severity: "warn",
    publicMessage: "Provisioning previously failed. Retry is not enabled.",
  },
  [STATUS.DUPLICATE_EMAIL_REVIEW]: {
    retryable: false,
    severity: "info",
    publicMessage: "This registration needs review before it can continue.",
  },
  [STATUS.SLUG_UNAVAILABLE]: {
    retryable: true,
    severity: "info",
    publicMessage: "That church web address is not available. Please choose another.",
  },
  [STATUS.INVALID_PLAN]: {
    retryable: false,
    severity: "error",
    publicMessage: "The Free plan is not available.",
  },
  [STATUS.PLAN_CONFIGURATION_ERROR]: {
    retryable: false,
    severity: "error",
    publicMessage: "The Free plan is misconfigured.",
  },
  [STATUS.DATABASE_CONFLICT]: {
    retryable: true,
    severity: "warn",
    publicMessage: "A conflicting record prevented provisioning.",
  },
  [STATUS.DATABASE_UNAVAILABLE]: {
    retryable: true,
    severity: "error",
    publicMessage: "The service is temporarily unavailable.",
  },
  [STATUS.PROVISIONING_FAILED]: {
    retryable: true,
    severity: "error",
    publicMessage: "Provisioning failed. Please try again later.",
  },
  [STATUS.INTERNAL_ERROR]: {
    retryable: false,
    severity: "error",
    publicMessage: "An unexpected error occurred.",
  },
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PRODUCT_KEY = "blessboard";
const PLAN_KEY = "free";
const DEFAULT_DEPLOYMENT = "blessboard-org-v5";
const HQ_BRANCH_KEY = "hq";

class OrchestratorError extends Error {
  /**
   * @param {string} status
   * @param {string} [message]
   * @param {object} [extra]
   */
  constructor(status, message, extra) {
    super(message || status);
    this.name = "OrchestratorError";
    this.status = status;
    this.extra = extra || {};
  }
}

function fail(status, message, extra) {
  return {
    ok: false,
    status,
    message: message || status,
    errorMeta: ERROR_META[status] || ERROR_META[STATUS.INTERNAL_ERROR],
    alreadyProvisioned: false,
    records: null,
    ...(extra || {}),
  };
}

function success(status, records, extra) {
  return {
    ok: true,
    status,
    message: status,
    alreadyProvisioned: Boolean(extra && extra.alreadyProvisioned),
    records,
    ...(extra || {}),
  };
}

function mapPlanLabelToCanonical(selectedPlan) {
  const raw = String(selectedPlan || "")
    .trim()
    .toLowerCase();
  if (!raw || raw === "foundation" || raw === "free" || raw === "basic") {
    return PLAN_KEY;
  }
  return raw;
}

/**
 * @param {{ query: Function }} client
 */
async function validateFreePlanCatalogue(client) {
  const plan = await entitlementRepo.findPlanByKey(client, PLAN_KEY);
  if (!plan || plan.productKey !== PRODUCT_KEY || plan.status !== "active") {
    throw new OrchestratorError(STATUS.INVALID_PLAN, "invalid_plan");
  }
  const features = await entitlementRepo.listPlanFeatures(client, plan.id);
  const byKey = new Map(features.map((f) => [f.featureKey, f]));
  const maxBranches = byKey.get("max_branches");
  const maxUsers = byKey.get("max_users") || byKey.get("max_staff_accounts");
  const customDomain = byKey.get("custom_domain");
  const customEmail = byKey.get("custom_email");
  if (!maxBranches || maxBranches.featureKind !== "limit" || Number(maxBranches.limitValue) !== 1) {
    throw new OrchestratorError(STATUS.PLAN_CONFIGURATION_ERROR, "max_branches");
  }
  if (
    maxUsers &&
    maxUsers.featureKind === "limit" &&
    maxUsers.limitValue != null &&
    Number(maxUsers.limitValue) > 0 &&
    Number(maxUsers.limitValue) < 10
  ) {
    // Soft check: Foundation expects at least 10 seats when limited.
    throw new OrchestratorError(STATUS.PLAN_CONFIGURATION_ERROR, "max_users");
  }
  if (customDomain && customDomain.featureKind === "boolean" && customDomain.booleanValue === true) {
    throw new OrchestratorError(STATUS.PLAN_CONFIGURATION_ERROR, "custom_domain");
  }
  if (customEmail && customEmail.featureKind === "boolean" && customEmail.booleanValue === true) {
    throw new OrchestratorError(STATUS.PLAN_CONFIGURATION_ERROR, "custom_email");
  }
  return plan;
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationKey
 */
async function assertOrganizationKeyAvailable(client, organizationKey) {
  const r = await client.query(
    `SELECT id FROM platform.organizations WHERE organization_key = $1 LIMIT 1`,
    [organizationKey]
  );
  if (r.rows[0]) {
    throw new OrchestratorError(STATUS.SLUG_UNAVAILABLE, "slug_unavailable");
  }
}

/**
 * @param {{ query: Function }} client
 * @param {string} churchId
 */
async function ensureMinimalDraftPages(client, churchId) {
  for (const pageKey of PUBLIC_PAGE_KEYS) {
    await publicContentRepo.ensureDraftPage(client, {
      churchId,
      branchId: null,
      pageKey,
      title: PAGE_KEY_TITLES[pageKey] || pageKey,
    });
  }
}

/**
 * @param {{ query: Function }} client
 * @param {{ organizationId: string, applicationId: string }} fields
 */
async function ensureOrganizationOnboarding(client, fields) {
  await client.query(
    `INSERT INTO blessboard.organization_onboarding (
       organization_id, registration_application_id, onboarding_status, follow_up_status,
       preview_acknowledged, onboarding_dismissed, support_requested
     ) VALUES ($1, $2, 'not_started', 'new', false, false, false)
     ON CONFLICT (organization_id) DO NOTHING`,
    [fields.organizationId, fields.applicationId]
  );
}

function sanitizeErrorDetail(raw) {
  const s = String(raw || "")
    .replace(/postgresql:\/\/\S+/gi, "[redacted]")
    .replace(/password[^\s]*/gi, "[redacted]")
    .slice(0, 500);
  return s || "provisioning_failed";
}

/**
 * Persist failure / duplicate-review after outer rollback (or early commit path).
 * @param {{ connect?: Function, query?: Function }} db
 * @param {string} applicationId
 * @param {object} patch
 */
async function persistApplicationOutcome(db, applicationId, patch) {
  const resolved = resolveManageTransactionOption(db, { manageTransaction: true });
  if (!resolved.ok) {
    throw new Error(resolved.message);
  }
  const session = await openProvisioningSession(resolved);
  try {
    const locked = await appRepo.lockApplicationById(session.client, applicationId);
    if (!locked) return null;
    // Do not overwrite a successful provision if a late failure writer races.
    if (
      locked.provisioning_status === "provisioned" &&
      locked.organization_id &&
      patch.provisioningStatus === "provisioning_failed"
    ) {
      await session.commitIfManaged();
      return locked;
    }
    const updated = await appRepo.updateApplicationProvisioningState(session.client, applicationId, patch);
    await session.commitIfManaged();
    return updated;
  } catch (err) {
    await session.safeRollbackOnError();
    throw err;
  } finally {
    session.releaseIfOwned();
  }
}

/**
 * @param {{ query: Function }} client
 * @param {object} opts
 */
async function writeSuccessAudits(client, opts) {
  const base = {
    deploymentCode: opts.deploymentCode,
    organizationId: opts.organizationId,
    churchId: opts.churchId || null,
    branchId: opts.branchId || null,
    actorUserId: opts.actorUserId || null,
    outcome: "success",
    metadata: {
      category: "registration",
      entity_key: opts.organizationKey,
      product_key: PRODUCT_KEY,
      plan_key: PLAN_KEY,
      request_id: opts.requestId ? String(opts.requestId).slice(0, 120) : undefined,
      actor_type: opts.actorType ? String(opts.actorType).slice(0, 64) : "system",
      source: opts.source ? String(opts.source).slice(0, 64) : "orchestrator",
      status: "ok",
    },
  };
  await recordAuditEventSafe(client, {
    ...base,
    actionKey: "registration.provisioning_completed",
    entityType: "organization",
    entityId: opts.organizationId,
  });
}

/**
 * Load linked tenant summary for already-provisioned applications.
 * @param {{ query: Function }} client
 * @param {object} application
 */
async function loadProvisionedRecords(client, application) {
  const orgId = application.organization_id;
  const org = await client.query(
    `SELECT id, organization_key, display_name, status
       FROM platform.organizations WHERE id = $1`,
    [orgId]
  );
  const church = await client.query(
    `SELECT id, church_key, display_name, status
       FROM blessboard.churches WHERE organization_id = $1`,
    [orgId]
  );
  const branch = church.rows[0]
    ? await client.query(
        `SELECT id, branch_key, display_name, branch_type, status
           FROM blessboard.branches
          WHERE church_id = $1 AND branch_type = 'hq'
          LIMIT 1`,
        [church.rows[0].id]
      )
    : { rows: [] };
  const user = await client.query(
    `SELECT id, email_normalized, display_name, status
       FROM blessboard.users
      WHERE email_normalized = $1
      LIMIT 1`,
    [normalizeEmail(application.contact_email)]
  );
  return {
    applicationId: application.id,
    organizationId: org.rows[0] ? org.rows[0].id : orgId,
    organizationKey: org.rows[0] ? org.rows[0].organization_key : null,
    churchId: church.rows[0] ? church.rows[0].id : null,
    branchId: branch.rows[0] ? branch.rows[0].id : null,
    administratorUserId: user.rows[0] ? user.rows[0].id : null,
    applicationStatus: application.application_status,
    provisioningStatus: application.provisioning_status,
  };
}

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {object} input
 * @param {{ allowRetry?: boolean, manageTransaction?: boolean }} [options]
 */
async function provisionRegisteredBlessBoardChurch(db, input, options = {}) {
  const applicationId = String((input && input.applicationId) || "").trim();
  const administratorPassword =
    input && input.administratorPassword != null ? String(input.administratorPassword) : "";
  const requestedOrganizationKey =
    input && input.requestedOrganizationKey != null
      ? String(input.requestedOrganizationKey).trim()
      : "";
  const requestId = input && input.requestId != null ? String(input.requestId).trim() : "";
  const actorContext =
    input && input.actorContext && typeof input.actorContext === "object" ? input.actorContext : {};
  const allowRetry = Boolean(options && options.allowRetry);
  const dataEnvironment = String(actorContext.dataEnvironment || "testing")
    .trim()
    .toLowerCase();
  const deploymentCode = String(actorContext.deploymentCode || DEFAULT_DEPLOYMENT)
    .trim()
    .toLowerCase();

  if (!UUID_RE.test(applicationId)) {
    return fail(STATUS.INVALID_INPUT, "invalid_input:applicationId");
  }
  if (!administratorPassword || administratorPassword.length < 10 || administratorPassword.length > 200) {
    return fail(STATUS.INVALID_INPUT, "invalid_input:administratorPassword");
  }
  if (!db || (typeof db.connect !== "function" && typeof db.query !== "function")) {
    return fail(STATUS.DATABASE_UNAVAILABLE, "database_unavailable");
  }

  // Password boundary: validate + hash before any transaction.
  let passwordHash;
  try {
    passwordHash = await bcrypt.hash(administratorPassword, BCRYPT_ROUNDS);
  } catch {
    return fail(STATUS.INTERNAL_ERROR, "password_hash_failed");
  }

  let failureCode = STATUS.PROVISIONING_FAILED;
  let failureDetail = "provisioning_failed";
  let duplicateReview = false;
  let outcomeRecords = null;

  try {
    outcomeRecords = await withProvisioningTransaction(db, async (client) => {
      const application = await appRepo.lockApplicationById(client, applicationId);
      if (!application) {
        throw new OrchestratorError(STATUS.APPLICATION_NOT_FOUND, "application_not_found");
      }

      if (
        application.provisioning_status === "provisioned" &&
        application.organization_id
      ) {
        const records = await loadProvisionedRecords(client, application);
        return { alreadyProvisioned: true, records };
      }

      if (application.provisioning_status === "provisioning") {
        throw new OrchestratorError(STATUS.PROVISIONING_IN_PROGRESS, "provisioning_in_progress");
      }

      if (application.application_status === "duplicate_review") {
        throw new OrchestratorError(STATUS.DUPLICATE_EMAIL_REVIEW, "duplicate_email_review");
      }

      if (
        application.application_status === "rejected" ||
        application.application_status === "cancelled"
      ) {
        throw new OrchestratorError(STATUS.APPLICATION_NOT_ELIGIBLE, "application_not_eligible");
      }

      if (
        application.application_status === "closed" &&
        application.provisioning_status !== "provisioned"
      ) {
        throw new OrchestratorError(STATUS.APPLICATION_NOT_ELIGIBLE, "application_not_eligible");
      }

      if (application.provisioning_status === "provisioning_failed" && !allowRetry) {
        throw new OrchestratorError(STATUS.RETRY_NOT_ALLOWED, "retry_not_allowed");
      }

      if (
        application.application_status !== "submitted" &&
        !(application.provisioning_status === "provisioning_failed" && allowRetry)
      ) {
        // Allow submitted + failed-with-retry; block other surprises.
        if (application.provisioning_status !== "not_started") {
          throw new OrchestratorError(STATUS.APPLICATION_NOT_ELIGIBLE, "application_not_eligible");
        }
      }

      const planLabel = mapPlanLabelToCanonical(application.selected_plan);
      if (planLabel !== PLAN_KEY) {
        throw new OrchestratorError(STATUS.INVALID_PLAN, "invalid_plan");
      }
      await validateFreePlanCatalogue(client);

      const keySource = requestedOrganizationKey || application.church_name;
      const keyNorm = normalizeOrganizationKey(keySource);
      if (!keyNorm.ok) {
        throw new OrchestratorError(
          keyNorm.reason === "reserved_key" ? STATUS.SLUG_UNAVAILABLE : STATUS.INVALID_INPUT,
          keyNorm.reason === "reserved_key" ? "slug_unavailable" : "invalid_input:organizationKey"
        );
      }
      const organizationKey = keyNorm.key;
      await assertOrganizationKeyAvailable(client, organizationKey);

      const emailNormalized = normalizeEmail(application.contact_email);
      const existingUser = await authRepo.findUserByEmail(client, emailNormalized);
      if (existingUser) {
        duplicateReview = true;
        throw new OrchestratorError(STATUS.DUPLICATE_EMAIL_REVIEW, "duplicate_email_review");
      }

      await appRepo.updateApplicationProvisioningState(client, applicationId, {
        applicationStatus: "submitted",
        provisioningStatus: "provisioning",
        provisioningStartedAt: new Date().toISOString(),
        clearFailureMetadata: true,
      });

      const displayName = String(application.church_name || "").trim();
      const adminDisplayName = String(application.contact_name || displayName).trim() || displayName;

      const tenant = await provisionPlatformTenant(
        client,
        {
          organizationKey,
          displayName,
          legalName: null,
          dataEnvironment,
          productKey: PRODUCT_KEY,
          productTenantKey: organizationKey,
          deploymentCode,
          skipDomain: true,
        },
        { manageTransaction: false }
      );
      if (!tenant.ok) {
        throw new OrchestratorError(
          tenant.status === "organization_conflict" ? STATUS.SLUG_UNAVAILABLE : STATUS.DATABASE_CONFLICT,
          tenant.message || tenant.status
        );
      }

      const countryRaw = String(application.country || "")
        .trim()
        .toUpperCase();
      const countryCode = /^[A-Z]{2}$/.test(countryRaw) ? countryRaw : null;

      const church = await churchProvision.provisionBlessBoardChurch(
        client,
        {
          organizationKey,
          churchKey: organizationKey,
          displayName,
          legalName: null,
          dataEnvironment,
          hqBranchKey: HQ_BRANCH_KEY,
          hqBranchDisplayName: String(application.branch_name || "Headquarters").trim() || "Headquarters",
          timezone: null,
          countryCode,
        },
        { manageTransaction: false }
      );
      if (!church.ok) {
        throw new OrchestratorError(
          church.status === "limit_exceeded"
            ? STATUS.PLAN_CONFIGURATION_ERROR
            : STATUS.DATABASE_CONFLICT,
          church.message || church.status
        );
      }

      const user = await userCreate.createBlessBoardUser(
        client,
        {
          email: application.contact_email,
          displayName: adminDisplayName,
          passwordHash,
        },
        { manageTransaction: false }
      );
      if (!user.ok) {
        throw new OrchestratorError(
          user.status === "identity_conflict" ? STATUS.DUPLICATE_EMAIL_REVIEW : STATUS.DATABASE_CONFLICT,
          user.message || user.status
        );
      }

      const hqRole = await roleAssign.assignBlessBoardRole(
        client,
        {
          email: application.contact_email,
          organizationKey,
          roleKey: "church_hq_admin",
          churchKey: organizationKey,
        },
        { manageTransaction: false }
      );
      if (!hqRole.ok) {
        throw new OrchestratorError(STATUS.DATABASE_CONFLICT, hqRole.message || hqRole.status);
      }

      const branchRole = await roleAssign.assignBlessBoardRole(
        client,
        {
          email: application.contact_email,
          organizationKey,
          roleKey: "branch_admin",
          churchKey: organizationKey,
          branchKey: HQ_BRANCH_KEY,
        },
        { manageTransaction: false }
      );
      if (!branchRole.ok) {
        throw new OrchestratorError(STATUS.DATABASE_CONFLICT, branchRole.message || branchRole.status);
      }

      const churchId = church.records.church.id;
      const branchId = church.records.hqBranch.id;
      const organizationId = tenant.records.organization.id;

      await ensureMinimalDraftPages(client, churchId);
      await ensureOrganizationOnboarding(client, {
        organizationId,
        applicationId,
      });

      const closed = await appRepo.updateApplicationProvisioningState(client, applicationId, {
        applicationStatus: "closed",
        provisioningStatus: "provisioned",
        organizationId,
        provisionedAt: new Date().toISOString(),
        clearFailureMetadata: true,
        // Compatibility: keep dormant list/count helpers coherent until legacy status is dropped.
        legacyStatus: "closed",
      });

      await writeSuccessAudits(client, {
        deploymentCode,
        organizationId,
        organizationKey,
        churchId,
        branchId,
        actorUserId: user.user.id,
        requestId,
        actorType: actorContext.type || "system",
        source: actorContext.source || "orchestrator",
      });

      return {
        alreadyProvisioned: false,
        records: {
          applicationId,
          organizationId,
          organizationKey,
          churchId,
          branchId,
          administratorUserId: user.user.id,
          applicationStatus: closed.application_status,
          provisioningStatus: closed.provisioning_status,
        },
      };
    });

    return success(
      outcomeRecords.alreadyProvisioned ? STATUS.ALREADY_PROVISIONED : STATUS.OK,
      outcomeRecords.records,
      { alreadyProvisioned: outcomeRecords.alreadyProvisioned }
    );
  } catch (err) {
    if (err && err.status === STATUS.DUPLICATE_EMAIL_REVIEW && duplicateReview) {
      // Duplicate review was committed inside the outer TX before throw — TX rolls back!
      // Must persist duplicate_review AFTER rollback.
      try {
        await persistApplicationOutcome(db, applicationId, {
          applicationStatus: "duplicate_review",
          provisioningStatus: "not_started",
          clearFailureMetadata: true,
        });
      } catch {
        /* secondary persistence must not mask */
      }
      return fail(STATUS.DUPLICATE_EMAIL_REVIEW, "duplicate_email_review");
    }

    if (err && err.name === "OrchestratorError") {
      failureCode = err.status;
      failureDetail = sanitizeErrorDetail(err.message);

      if (
        err.status === STATUS.APPLICATION_NOT_FOUND ||
        err.status === STATUS.APPLICATION_NOT_ELIGIBLE ||
        err.status === STATUS.PROVISIONING_IN_PROGRESS ||
        err.status === STATUS.RETRY_NOT_ALLOWED ||
        err.status === STATUS.SLUG_UNAVAILABLE ||
        err.status === STATUS.INVALID_PLAN ||
        err.status === STATUS.PLAN_CONFIGURATION_ERROR ||
        err.status === STATUS.INVALID_INPUT
      ) {
        // No tenant writes expected; do not mark provisioning_failed for eligibility/slug/plan.
        return fail(err.status, err.message);
      }

      try {
        await persistApplicationOutcome(db, applicationId, {
          applicationStatus: "submitted",
          provisioningStatus: "provisioning_failed",
          provisioningFailedAt: new Date().toISOString(),
          provisioningErrorCode: String(failureCode).slice(0, 120),
          provisioningErrorDetail: failureDetail.slice(0, 2000),
        });
      } catch (persistErr) {
        // eslint-disable-next-line no-console
        console.error(
          "[provision-registered-blessboard-church]",
          JSON.stringify({
            event: "failure_state_persist_failed",
            applicationId,
            rootStatus: failureCode,
            persistError: persistErr && persistErr.message ? String(persistErr.message).slice(0, 120) : "error",
          })
        );
      }
      return fail(failureCode === STATUS.DUPLICATE_EMAIL_REVIEW ? failureCode : STATUS.PROVISIONING_FAILED, failureDetail, {
        rootStatus: failureCode,
      });
    }

    failureDetail = sanitizeErrorDetail(err && err.message);
    try {
      await persistApplicationOutcome(db, applicationId, {
        applicationStatus: "submitted",
        provisioningStatus: "provisioning_failed",
        provisioningFailedAt: new Date().toISOString(),
        provisioningErrorCode: STATUS.INTERNAL_ERROR,
        provisioningErrorDetail: failureDetail.slice(0, 2000),
      });
    } catch (persistErr) {
      // eslint-disable-next-line no-console
      console.error(
        "[provision-registered-blessboard-church]",
        JSON.stringify({
          event: "failure_state_persist_failed",
          applicationId,
          rootStatus: STATUS.INTERNAL_ERROR,
          persistError: persistErr && persistErr.message ? String(persistErr.message).slice(0, 120) : "error",
        })
      );
    }
    return fail(STATUS.PROVISIONING_FAILED, failureDetail);
  }
}

module.exports = {
  STATUS,
  ERROR_META,
  provisionRegisteredBlessBoardChurch,
  mapPlanLabelToCanonical,
  validateFreePlanCatalogue,
};
