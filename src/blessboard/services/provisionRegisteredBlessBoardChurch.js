"use strict";

/**
 * Shared Foundation registration provisioning orchestrator.
 * Does not wire HTTP routes. Caller supplies pool + applicationId.
 *
 * Modes:
 * - Self-service / password: administratorPassword required; user activated immediately.
 * - Platform-admin invitation: options.administratorViaInvitation — no password; creates
 *   an invited identity + one church_hq_admin invitation (password set on /invite/accept).
 */

const bcrypt = require("bcryptjs");
const appRepo = require("../repositories/platformChurchRegistrationRepository");
const authRepo = require("../repositories/blessBoardAuthRepository");
const inviteRepo = require("../repositories/userInvitationRepository");
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
const { ACTION: LIFECYCLE_ACTION, recordLifecycleAudit } = require("../../platform/registration/lifecycleAudit");
const { logRegistrationTrace } = require("./registrationTraceLog");
const {
  allocateUniqueOrganizationKey,
  assertOrganizationKeyAvailable,
} = require("../../platform/organization/allocateUniqueOrganizationKey");
const {
  PRODUCT_CODE,
  buildPublicOrganizationWebsitePath,
} = require("../../platform/website/publicWebsiteUrl");
const settingsRepo = require("../repositories/blessBoardSettingsRepository");
const { generateInviteToken, INVITE_TTL_MS } = require("./inviteBlessBoardStaff");
const { BCRYPT_ROUNDS, normalizeEmail } = userCreate;
const { prepareBranchDisplayName } = require("./normalizeBranchDisplayName");
const {
  resolveCountryCodeForUniqueness,
  normalizeChurchDisplayNameForUniqueness,
  DUPLICATE_CHURCH_NAME_MESSAGE,
} = require("./normalizeChurchIdentity");
const { assertChurchNameAvailable } = require("./assertChurchNameAvailable");
const {
  ACTION: ADMIN_IDENTITY_ACTION,
  resolveBlessBoardRegistrationAdministrator,
  extractPgDiagnostics,
} = require("./resolveBlessBoardRegistrationAdministrator");
const {
  growthTrialEndsAtIso,
} = require("../../platform/time/addGrowthTrialDurationUtc");
const {
  inspectOrganizationProvisioningCompleteness,
} = require("../../platform/registration/provisioningRecovery");
const { mapBlessBoardInternalStage } = require("../../platform/registration/provisioningStages");

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
  EXISTING_ACCOUNT: "existing_account",
  IDENTITY_CONFLICT: "identity_conflict",
  DUPLICATE_CHURCH_NAME: "duplicate_church_name",
  SLUG_UNAVAILABLE: "slug_unavailable",
  INVALID_PLAN: "invalid_plan",
  PLAN_CONFIGURATION_ERROR: "plan_configuration_error",
  DATABASE_CONFLICT: "database_conflict",
  DATABASE_UNAVAILABLE: "database_unavailable",
  DEPLOYMENT_NOT_FOUND: "deployment_not_found",
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
  [STATUS.EXISTING_ACCOUNT]: {
    retryable: false,
    severity: "info",
    publicMessage:
      "An account with this email already exists. Sign in to continue to your church workspace.",
  },
  [STATUS.DUPLICATE_CHURCH_NAME]: {
    retryable: false,
    severity: "warn",
    publicMessage: DUPLICATE_CHURCH_NAME_MESSAGE,
  },
  [STATUS.IDENTITY_CONFLICT]: {
    retryable: false,
    severity: "warn",
    publicMessage:
      "The administrator email and phone belong to different existing accounts. Use matching contact details, or contact BlessBoard support.",
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
  [STATUS.DEPLOYMENT_NOT_FOUND]: {
    retryable: true,
    severity: "error",
    publicMessage: "We could not finish creating your church workspace right now. Please try again shortly.",
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
const PLAN_KEY_FREE = "free";
const PLAN_KEY_GROWTH = "growth";
/** Plans the registration orchestrator may assign. Network is enquiry-only. */
const PROVISIONABLE_PLAN_KEYS = Object.freeze([PLAN_KEY_FREE, PLAN_KEY_GROWTH]);
/** @deprecated Use PLAN_KEY_FREE — retained for callers that imported PLAN_KEY historically via mapPlanLabel. */
const PLAN_KEY = PLAN_KEY_FREE;
const DEFAULT_DEPLOYMENT = "blessboard-org-staging";
const HQ_BRANCH_KEY = "hq";
const { resolveBaseBranchKey } = require("./branchKey");

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
    if (extra && extra.diagnostics && typeof extra.diagnostics === "object") {
      this.diagnostics = extra.diagnostics;
    }
    if (extra && extra.cause && typeof extra.cause === "object") {
      this.cause = extra.cause;
      const pg = extractPgDiagnostics(extra.cause);
      this.diagnostics = { ...(this.diagnostics || {}), ...pg };
    }
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
    return PLAN_KEY_FREE;
  }
  if (raw === "growth") {
    return PLAN_KEY_GROWTH;
  }
  return raw;
}

function isProvisionablePlanKey(planKey) {
  return PROVISIONABLE_PLAN_KEYS.includes(String(planKey || ""));
}

/**
 * @param {{ query: Function }} client
 * @param {string} planKey
 */
async function validatePlanCatalogueForProvision(client, planKey) {
  if (planKey === PLAN_KEY_FREE) {
    return validateFreePlanCatalogue(client);
  }
  if (planKey === PLAN_KEY_GROWTH) {
    return validateGrowthPlanCatalogue(client);
  }
  throw new OrchestratorError(STATUS.INVALID_PLAN, "invalid_plan");
}

/**
 * @param {{ query: Function }} client
 */
async function validateFreePlanCatalogue(client) {
  const plan = await entitlementRepo.findPlanByKey(client, PLAN_KEY_FREE);
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
 * Growth catalogue must exist and be active. Feature limits stay data-driven
 * (entitlementService); do not hardcode Growth feature rules here.
 * @param {{ query: Function }} client
 */
async function validateGrowthPlanCatalogue(client) {
  const plan = await entitlementRepo.findPlanByKey(client, PLAN_KEY_GROWTH);
  if (!plan || plan.productKey !== PRODUCT_KEY || plan.status !== "active") {
    throw new OrchestratorError(STATUS.INVALID_PLAN, "invalid_plan");
  }
  return plan;
}

/**
 * Build subscription fields for platform tenant provision.
 * Foundation: active free, open-ended (no trial ends_at).
 * Growth: trialing growth, ends_at = starts_at + exactly 30 days (UTC).
 * Fallback to free on expiry is product policy for a later command — not stored in notes.
 *
 * @param {string} planKey
 * @param {Date} provisionedAt
 */
function buildSubscriptionAssignment(planKey, provisionedAt) {
  const startsAt = provisionedAt.toISOString();
  if (planKey === PLAN_KEY_GROWTH) {
    return {
      subscriptionPlanKey: PLAN_KEY_GROWTH,
      subscriptionStatus: "trialing",
      subscriptionStartsAt: startsAt,
      subscriptionEndsAt: growthTrialEndsAtIso(provisionedAt),
      subscriptionNotes: null,
      subscriptionTrialSource: "direct_growth_registration",
    };
  }
  return {
    subscriptionPlanKey: PLAN_KEY_FREE,
    subscriptionStatus: "active",
    subscriptionStartsAt: startsAt,
    subscriptionEndsAt: null,
    subscriptionNotes: null,
    subscriptionTrialSource: null,
  };
}

/**
 * @param {{ query: Function }} client
 * @param {string} churchId
 */
async function ensureMinimalDraftPages(client, churchId) {
  const {
    ensureMinimalDraftPages: ensurePages,
  } = require("./websiteFoundationRepairService");
  await ensurePages(client, churchId);
}

/**
 * Idempotent church_settings draft shell; seed contact from registration when present.
 * @param {{ query: Function }} client
 * @param {{
 *   churchId: string,
 *   publicName: string,
 *   primaryEmail?: string|null,
 *   primaryPhone?: string|null,
 * }} fields
 */
async function ensureDraftChurchSettings(client, fields) {
  await settingsRepo.ensureChurchSettingsRow(client, {
    churchId: fields.churchId,
    publicName: fields.publicName,
  });
  const existing = await settingsRepo.findChurchSettings(client, fields.churchId);
  if (!existing) return;
  const email =
    (existing.primaryEmail && String(existing.primaryEmail).trim()) ||
    (fields.primaryEmail ? String(fields.primaryEmail).trim() : "") ||
    null;
  const phone =
    (existing.primaryPhone && String(existing.primaryPhone).trim()) ||
    (fields.primaryPhone ? String(fields.primaryPhone).trim() : "") ||
    null;
  const timezone =
    (existing.defaultTimezone && String(existing.defaultTimezone).trim()) ||
    (fields.defaultTimezone ? String(fields.defaultTimezone).trim() : "") ||
    "Africa/Lusaka";
  const country =
    (existing.defaultCountryCode && String(existing.defaultCountryCode).trim()) ||
    (fields.defaultCountryCode ? String(fields.defaultCountryCode).trim() : "") ||
    null;
  if (
    email === existing.primaryEmail &&
    phone === existing.primaryPhone &&
    existing.publicName &&
    timezone === existing.defaultTimezone &&
    country === existing.defaultCountryCode
  ) {
    return;
  }
  await settingsRepo.upsertChurchSettings(client, fields.churchId, {
    publicName: existing.publicName || fields.publicName,
    denomination: existing.denomination,
    primaryEmail: email,
    primaryPhone: phone,
    defaultTimezone: timezone,
    defaultCountryCode: country,
    websiteStatus: existing.websiteStatus || "draft",
  });
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
 * Safe diagnostic fields from a caught error (never passwords / connection strings / PII).
 * @param {unknown} err
 */
function extractProvisionErrorDiagnostics(err) {
  if (!err || typeof err !== "object") {
    return {
      errorName: null,
      underlyingErrorClass: null,
      postgresCode: null,
      constraint: null,
      table: null,
      schema: null,
      identityResolution: null,
      emailMatched: null,
      phoneMatched: null,
    };
  }
  const fromSelf = extractPgDiagnostics(err);
  const fromCause = err.cause ? extractPgDiagnostics(err.cause) : {};
  const nested =
    err.diagnostics && typeof err.diagnostics === "object" ? err.diagnostics : {};
  const extraDiag =
    err.extra && err.extra.diagnostics && typeof err.extra.diagnostics === "object"
      ? err.extra.diagnostics
      : {};
  const merged = { ...fromCause, ...fromSelf, ...extraDiag, ...nested };
  const pgCode =
    merged.postgresCode ||
    (err.code != null && /^[0-9A-Z]{5}$/.test(String(err.code)) ? String(err.code) : null);
  return {
    errorName: err.name != null ? String(err.name).slice(0, 80) : null,
    underlyingErrorClass:
      merged.underlyingErrorClass != null
        ? String(merged.underlyingErrorClass).slice(0, 80)
        : err.cause && err.cause.name
          ? String(err.cause.name).slice(0, 80)
          : null,
    postgresCode: pgCode,
    constraint: merged.constraint != null ? String(merged.constraint).slice(0, 120) : null,
    table: merged.table != null ? String(merged.table).slice(0, 120) : null,
    schema: merged.schema != null ? String(merged.schema).slice(0, 64) : null,
    identityResolution:
      merged.identityResolution != null ? String(merged.identityResolution).slice(0, 80) : null,
    emailMatched:
      typeof merged.emailMatched === "boolean" ? merged.emailMatched : null,
    phoneMatched:
      typeof merged.phoneMatched === "boolean" ? merged.phoneMatched : null,
  };
}

/**
 * Whether an existing identity may safely administer another organization.
 * Suspended/inactive accounts are conflicts; active and invited may be reused.
 * @param {object|null|undefined} user
 */
function classifyExistingAdministratorIdentity(user) {
  if (!user || !user.id) {
    return { ok: true, reuse: false };
  }
  const status = String(user.status || "").trim().toLowerCase();
  if (status === "active" || status === "invited") {
    return { ok: true, reuse: true, status };
  }
  return {
    ok: false,
    reuse: false,
    status,
    reason: "identity_conflict",
  };
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
      product_code: PRODUCT_KEY,
      plan_key: opts.planKey || PLAN_KEY_FREE,
      request_id: opts.requestId ? String(opts.requestId).slice(0, 120) : undefined,
      actor_type: opts.actorType ? String(opts.actorType).slice(0, 64) : "system",
      source: opts.source ? String(opts.source).slice(0, 64) : "orchestrator",
      status: "ok",
      application_id: opts.applicationId || undefined,
    },
  };
  await recordAuditEventSafe(client, {
    ...base,
    actionKey: LIFECYCLE_ACTION.APPROVED,
    entityType: "registration_application",
    entityId: opts.applicationId || opts.organizationId,
  });
  await recordAuditEventSafe(client, {
    ...base,
    actionKey: LIFECYCLE_ACTION.ADMIN_ROLE_ASSIGNED,
    entityType: "user_role_assignment",
    entityId: opts.administratorUserId || opts.invitationId || opts.organizationId,
    metadata: { ...base.metadata, entity_key: "church_hq_admin" },
  });
  await recordAuditEventSafe(client, {
    ...base,
    actionKey: LIFECYCLE_ACTION.WEBSITE_INITIALIZED,
    entityType: "website_instance",
    entityId: opts.organizationId,
  });
  await recordAuditEventSafe(client, {
    ...base,
    actionKey: LIFECYCLE_ACTION.PROVISIONING_COMPLETED,
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
 * @param {{
 *   allowRetry?: boolean,
 *   manageTransaction?: boolean,
 *   networkOrganizationShell?: boolean,
 *   administratorViaInvitation?: boolean,
 * }} [options]
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
  const networkOrganizationShell = Boolean(options && options.networkOrganizationShell);
  const administratorViaInvitation = Boolean(options && options.administratorViaInvitation);
  const dataEnvironment = String(actorContext.dataEnvironment || "testing")
    .trim()
    .toLowerCase();
  const deploymentCode = String(actorContext.deploymentCode || DEFAULT_DEPLOYMENT)
    .trim()
    .toLowerCase();
  const invitingActorUserId =
    actorContext.actorUserId != null ? String(actorContext.actorUserId).trim() : "";

  if (!UUID_RE.test(applicationId)) {
    return fail(STATUS.INVALID_INPUT, "invalid_input:applicationId");
  }
  if (administratorViaInvitation) {
    if (!UUID_RE.test(invitingActorUserId)) {
      return fail(STATUS.INVALID_INPUT, "invalid_input:actorUserId");
    }
  } else if (
    !administratorPassword ||
    administratorPassword.length < 10 ||
    administratorPassword.length > 200
  ) {
    return fail(STATUS.INVALID_INPUT, "invalid_input:administratorPassword");
  }
  if (!db || (typeof db.connect !== "function" && typeof db.query !== "function")) {
    return fail(STATUS.DATABASE_UNAVAILABLE, "database_unavailable");
  }

  // Password boundary (self-service only): validate + hash before any transaction.
  // Invitation mode never hashes or stores a platform-entered password.
  let passwordHash = null;
  if (!administratorViaInvitation) {
    try {
      passwordHash = await bcrypt.hash(administratorPassword, BCRYPT_ROUNDS);
    } catch {
      return fail(STATUS.INTERNAL_ERROR, "password_hash_failed");
    }
  }

  let failureCode = STATUS.PROVISIONING_FAILED;
  let failureDetail = "provisioning_failed";
  let duplicateReview = false;
  let outcomeRecords = null;
  let planKey = null;
  let provisioningStage = "start";

  try {
    outcomeRecords = await withProvisioningTransaction(db, async (client) => {
      provisioningStage = "lock_application";
      const application = await appRepo.lockApplicationById(client, applicationId);
      if (!application) {
        throw new OrchestratorError(STATUS.APPLICATION_NOT_FOUND, "application_not_found");
      }

      if (
        application.provisioning_status === "provisioned" &&
        application.organization_id
      ) {
        provisioningStage = "already_provisioned";
        const completeness = await inspectOrganizationProvisioningCompleteness(client, {
          productCode: "blessboard",
          organizationId: application.organization_id,
          application,
        });
        if (completeness.complete) {
          const records = await loadProvisionedRecords(client, application);
          return { alreadyProvisioned: true, records };
        }
      }

      if (application.provisioning_status === "provisioning") {
        throw new OrchestratorError(STATUS.PROVISIONING_IN_PROGRESS, "provisioning_in_progress");
      }

      // Admin invitation approval may proceed from duplicate_review after explicit approve.
      // Self-service password provisioning still holds duplicate_review for operator review.
      if (
        (application.application_status === "duplicate_review" ||
          application.application_status === "review_required") &&
        !administratorViaInvitation
      ) {
        throw new OrchestratorError(STATUS.DUPLICATE_EMAIL_REVIEW, "duplicate_email_review");
      }

      if (
        application.application_status === "rejected" ||
        application.application_status === "cancelled"
      ) {
        throw new OrchestratorError(STATUS.APPLICATION_NOT_ELIGIBLE, "application_not_eligible");
      }

      if (
        (application.application_status === "closed" || application.application_status === "active") &&
        application.provisioning_status !== "provisioned" &&
        !(allowRetry && (application.organization_id || application.provisioning_status === "provisioning_failed"))
      ) {
        throw new OrchestratorError(STATUS.APPLICATION_NOT_ELIGIBLE, "application_not_eligible");
      }

      if (application.provisioning_status === "provisioning_failed" && !allowRetry) {
        throw new OrchestratorError(STATUS.RETRY_NOT_ALLOWED, "retry_not_allowed");
      }

      const eligibleStatuses = administratorViaInvitation
        ? ["submitted", "duplicate_review", "review_required", "provisioning"]
        : ["submitted", "provisioning"];
      if (
        !eligibleStatuses.includes(String(application.application_status || "")) &&
        !(application.provisioning_status === "provisioning_failed" && allowRetry)
      ) {
        // Allow submitted (+ duplicate_review for admin invitation) + failed-with-retry.
        if (application.provisioning_status !== "not_started") {
          throw new OrchestratorError(STATUS.APPLICATION_NOT_ELIGIBLE, "application_not_eligible");
        }
        if (!eligibleStatuses.includes(String(application.application_status || ""))) {
          throw new OrchestratorError(STATUS.APPLICATION_NOT_ELIGIBLE, "application_not_eligible");
        }
      }

      provisioningStage = "validate_plan";
      planKey = mapPlanLabelToCanonical(application.selected_plan);
      if (networkOrganizationShell && String(application.selected_plan || "").toLowerCase() === "network") {
        // Network org creation uses a Foundation shell subscription; paid Network
        // activation remains a separate organization-admin action.
        planKey = PLAN_KEY_FREE;
      }
      if (!isProvisionablePlanKey(planKey)) {
        throw new OrchestratorError(STATUS.INVALID_PLAN, "invalid_plan");
      }
      await validatePlanCatalogueForProvision(client, planKey);

      provisioningStage = "resolve_organization_key";
      const preferredKey = requestedOrganizationKey
        ? String(requestedOrganizationKey).trim()
        : "";
      let organizationKey = null;
      if (application.organization_id) {
        const existingOrg = await client.query(
          `SELECT organization_key FROM platform.organizations WHERE id = $1 LIMIT 1`,
          [application.organization_id]
        );
        if (existingOrg.rows[0] && existingOrg.rows[0].organization_key) {
          organizationKey = existingOrg.rows[0].organization_key;
        }
      }
      if (!organizationKey) {
        try {
          organizationKey = await allocateUniqueOrganizationKey(client, {
            preferredKey: preferredKey || null,
            churchName: application.church_name,
            exactPreferred:
              Boolean(preferredKey) &&
              String((actorContext && actorContext.type) || "") !== "public_self_registration",
          });
        } catch (keyErr) {
          if (keyErr && keyErr.code === "slug_unavailable") {
            throw new OrchestratorError(STATUS.SLUG_UNAVAILABLE, "slug_unavailable");
          }
          throw keyErr;
        }
      }

      provisioningStage = "resolve_administrator_identity";
      const emailNormalized = normalizeEmail(application.contact_email);
      if (!emailNormalized && !administratorViaInvitation) {
        throw new OrchestratorError(STATUS.INVALID_INPUT, "invalid_input:administratorEmail");
      }
      if (!emailNormalized && administratorViaInvitation) {
        // Invitation may be phone-first; email still preferred for role assignment helpers.
        if (!application.contact_phone_normalized) {
          throw new OrchestratorError(STATUS.INVALID_INPUT, "invalid_input:administratorContact");
        }
      }
      const resumeExistingOrg = Boolean(application.organization_id);
      let reuseExistingUserForNewOrg = false;
      let existingUser = null;
      let identityResolutionDiagnostics = {
        identityResolution: null,
        emailMatched: false,
        phoneMatched: false,
      };

      const resolvedAdmin = await resolveBlessBoardRegistrationAdministrator(client, {
        email: emailNormalized || application.contact_email,
        phoneNormalized: application.contact_phone_normalized || null,
        churchName: application.church_name,
        country: application.country,
        organizationKey,
        applicationOrganizationId: application.organization_id,
        administratorPassword: administratorViaInvitation ? null : administratorPassword,
        administratorViaInvitation,
      });
      identityResolutionDiagnostics = {
        ...(resolvedAdmin.diagnostics || {}),
        emailMatched: Boolean(resolvedAdmin.emailMatched),
        phoneMatched: Boolean(resolvedAdmin.phoneMatched),
      };
      existingUser = resolvedAdmin.user || null;

      if (resolvedAdmin.action === ADMIN_IDENTITY_ACTION.REJECT_SUSPENDED) {
        duplicateReview = true;
        throw new OrchestratorError(STATUS.DUPLICATE_EMAIL_REVIEW, "duplicate_email_review", {
          diagnostics: identityResolutionDiagnostics,
        });
      }
      if (resolvedAdmin.action === ADMIN_IDENTITY_ACTION.REJECT_IDENTITY_CONFLICT) {
        throw new OrchestratorError(STATUS.IDENTITY_CONFLICT, "identity_conflict", {
          diagnostics: identityResolutionDiagnostics,
        });
      }
      if (resolvedAdmin.action === ADMIN_IDENTITY_ACTION.REJECT_EXISTING_ACCOUNT) {
        throw new OrchestratorError(STATUS.EXISTING_ACCOUNT, "existing_account", {
          diagnostics: identityResolutionDiagnostics,
        });
      }
      if (resolvedAdmin.action === ADMIN_IDENTITY_ACTION.ALREADY_PROVISIONED) {
        const orgId =
          resolvedAdmin.organizationId ||
          application.organization_id ||
          null;
        if (orgId) {
          if (!application.organization_id || String(application.organization_id) !== String(orgId)) {
            await appRepo.updateApplicationProvisioningState(client, applicationId, {
              organizationId: orgId,
            });
            application.organization_id = orgId;
          }
          // Inspect against the existing tenant, not this application's not_started status.
          const completeness = await inspectOrganizationProvisioningCompleteness(client, {
            productCode: "blessboard",
            organizationId: orgId,
            application: {
              ...application,
              organization_id: orgId,
              provisioning_status: "provisioned",
            },
          });
          const stages = completeness.stages || {};
          const tenantReady =
            completeness.complete ||
            Boolean(
              stages.organization &&
                stages.administrator &&
                stages.role_assignment &&
                stages.facility_hq
            );
          if (tenantReady) {
            if (application.provisioning_status !== "provisioned") {
              await appRepo.updateApplicationProvisioningState(client, applicationId, {
                applicationStatus: "active",
                provisioningStatus: "provisioned",
                organizationId: orgId,
                provisionedAt: new Date().toISOString(),
                clearFailureMetadata: true,
                legacyStatus: "closed",
              });
              application.provisioning_status = "provisioned";
              application.application_status = "active";
              application.organization_id = orgId;
            }
            const records = await loadProvisionedRecords(client, application);
            if (resolvedAdmin.userId && !records.administratorUserId) {
              records.administratorUserId = resolvedAdmin.userId;
            }
            return { alreadyProvisioned: true, records };
          }
          // Incomplete same-church tenant: resume and attach roles to the existing identity.
          reuseExistingUserForNewOrg = true;
        } else {
          throw new OrchestratorError(STATUS.EXISTING_ACCOUNT, "existing_account", {
            diagnostics: identityResolutionDiagnostics,
          });
        }
      }
      if (resolvedAdmin.action === ADMIN_IDENTITY_ACTION.REUSE) {
        reuseExistingUserForNewOrg = true;
      }

      const provisionedAt =
        input.provisionedAt != null ? new Date(input.provisionedAt) : new Date();
      if (Number.isNaN(provisionedAt.getTime())) {
        throw new OrchestratorError(STATUS.INVALID_INPUT, "invalid_input:provisionedAt");
      }
      const subscriptionAssignment = buildSubscriptionAssignment(planKey, provisionedAt);

      provisioningStage = "mark_provisioning";
      await appRepo.updateApplicationProvisioningState(client, applicationId, {
        applicationStatus: "submitted",
        provisioningStatus: "provisioning",
        provisioningStartedAt: provisionedAt.toISOString(),
        clearFailureMetadata: true,
      });

      const displayName = String(application.church_name || "").trim();
      const adminDisplayName = String(application.contact_name || displayName).trim() || displayName;
      const nameUniquenessKey = normalizeChurchDisplayNameForUniqueness(displayName);
      const countryCode =
        resolveCountryCodeForUniqueness(application.country) ||
        resolveCountryCodeForUniqueness(application.country_code) ||
        null;

      provisioningStage = "assert_church_name_available";
      if (nameUniquenessKey && countryCode) {
        const nameGate = await assertChurchNameAvailable(client, {
          churchName: displayName,
          countryCode,
          linkedApplicationId: applicationId,
          excludeOrganizationId:
            application.organization_id != null ? String(application.organization_id) : null,
        });
        if (!nameGate.ok) {
          throw new OrchestratorError(
            STATUS.DUPLICATE_CHURCH_NAME,
            nameGate.message || DUPLICATE_CHURCH_NAME_MESSAGE
          );
        }
      }

      provisioningStage = "provision_platform_tenant";
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
          ...subscriptionAssignment,
        },
        { manageTransaction: false }
      );
      if (!tenant.ok) {
        const tenantStatus = String(tenant.status || "");
        throw new OrchestratorError(
          tenantStatus === "organization_conflict"
            ? STATUS.SLUG_UNAVAILABLE
            : tenantStatus === "deployment_not_found"
              ? STATUS.DEPLOYMENT_NOT_FOUND
              : tenantStatus === "inactive_deployment"
                ? STATUS.DEPLOYMENT_NOT_FOUND
                : STATUS.DATABASE_CONFLICT,
          tenant.message || tenant.status
        );
      }
      provisioningStage = "organization_created";
      {
        const createdOrgId = tenant.records && tenant.records.organization && tenant.records.organization.id;
        if (createdOrgId) {
          const lifecycleBase = {
            deploymentCode,
            organizationId: createdOrgId,
            applicationId,
            entityId: applicationId,
            productCode: PRODUCT_KEY,
            actorType: actorContext.type || "system",
            source: actorContext.source || "orchestrator",
            actorUserId: administratorViaInvitation ? invitingActorUserId : null,
            entityKey: organizationKey,
          };
          if (resumeExistingOrg) {
            await recordLifecycleAudit(client, {
              ...lifecycleBase,
              actionKey: LIFECYCLE_ACTION.PROVISIONING_RETRY,
              retry: true,
              provisioningStatus: "provisioning",
            });
          } else {
            await recordLifecycleAudit(client, {
              ...lifecycleBase,
              actionKey: LIFECYCLE_ACTION.ORGANIZATION_CREATED,
              entityType: "organization",
              entityId: createdOrgId,
            });
            await recordLifecycleAudit(client, {
              ...lifecycleBase,
              actionKey: LIFECYCLE_ACTION.PROVISIONING_STARTED,
              provisioningStatus: "provisioning",
            });
          }
        }
      }
      provisioningStage = "organization_key_created";

      const hqNamePrepared = prepareBranchDisplayName(application.branch_name, {
        field: "branch_name",
        required: true,
        emptyMessage: "Please enter a branch name.",
      });
      if (!hqNamePrepared.ok) {
        throw new OrchestratorError(
          STATUS.INVALID_INPUT,
          hqNamePrepared.message || "Please enter a branch name."
        );
      }
      const hqBranchDisplayName = hqNamePrepared.display;
      const branchKeyResult = resolveBaseBranchKey(hqBranchDisplayName);
      if (!branchKeyResult.ok) {
        throw new OrchestratorError(
          STATUS.INVALID_INPUT,
          branchKeyResult.reason === "reserved_key"
            ? "That branch URL is reserved. Please choose a different branch name."
            : "Please enter a branch name we can use for your website URL."
        );
      }
      const registrationBranchKey = branchKeyResult.key;

      provisioningStage = "provision_church_branch";
      const church = await churchProvision.provisionBlessBoardChurch(
        client,
        {
          organizationKey,
          churchKey: organizationKey,
          displayName,
          legalName: null,
          dataEnvironment,
          hqBranchKey: registrationBranchKey,
          hqBranchDisplayName,
          timezone: "Africa/Lusaka",
          countryCode,
          nameUniquenessKey,
        },
        { manageTransaction: false }
      );
      if (!church.ok) {
        throw new OrchestratorError(
          church.status === "duplicate_church_name"
            ? STATUS.DUPLICATE_CHURCH_NAME
            : church.status === "limit_exceeded"
              ? STATUS.PLAN_CONFIGURATION_ERROR
              : STATUS.DATABASE_CONFLICT,
          church.message || church.status
        );
      }
      provisioningStage = "church_created";
      provisioningStage = "hq_branch_created";

      let administratorUserId = null;
      let invitationId = null;
      /** @type {string|null} raw invite token — returned once to caller; never logged */
      let invitationRawToken = null;
      let administratorLinkedExisting = false;
      let administratorWasActive = false;

      if (administratorViaInvitation) {
        provisioningStage = "prepare_administrator_invitation";
        let adminUser = existingUser;
        if (!adminUser) {
          adminUser = await authRepo.insertUser(client, {
            emailNormalized: emailNormalized || null,
            emailDisplay: String(application.contact_email || emailNormalized || "").slice(0, 254) || null,
            passwordHash: null,
            status: "invited",
            displayName: adminDisplayName.slice(0, 200),
            phoneNormalized: application.contact_phone_normalized || null,
            phoneDisplay: application.contact_phone || null,
          });
        } else {
          administratorLinkedExisting = true;
          administratorWasActive = String(adminUser.status) === "active";
          // Never reset or overwrite an existing password hash.
        }
        if (!adminUser || !adminUser.id) {
          throw new OrchestratorError(STATUS.DATABASE_CONFLICT, "administrator_prepare_failed", {
            diagnostics: identityResolutionDiagnostics,
          });
        }
        administratorUserId = String(adminUser.id);

        const orgId = tenant.records.organization.id;
        const churchIdForInvite = church.records.church.id;

        // Existing active identities get org-scoped roles immediately (safe multi-org reuse).
        // Invited / new identities receive roles on invitation accept.
        if (String(adminUser.status) === "active") {
          provisioningStage = "assign_administrator_roles";
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
            throw new OrchestratorError(STATUS.DATABASE_CONFLICT, hqRole.message || hqRole.status, {
              diagnostics: {
                ...identityResolutionDiagnostics,
                roleStatus: hqRole.status,
              },
            });
          }

          const branchRole = await roleAssign.assignBlessBoardRole(
            client,
            {
              email: application.contact_email,
              organizationKey,
              roleKey: "branch_admin",
              churchKey: organizationKey,
              branchKey: registrationBranchKey,
            },
            { manageTransaction: false }
          );
          if (!branchRole.ok) {
            throw new OrchestratorError(
              STATUS.DATABASE_CONFLICT,
              branchRole.message || branchRole.status,
              {
                diagnostics: {
                  ...identityResolutionDiagnostics,
                  roleStatus: branchRole.status,
                },
              }
            );
          }
        }

        provisioningStage = "create_administrator_invitation";
        const pending = await inviteRepo.findPendingByScope(client, {
          organizationId: orgId,
          churchId: churchIdForInvite,
          emailNormalized,
          roleKey: "church_hq_admin",
          branchId: null,
        });
        if (pending) {
          await inviteRepo.markRevoked(client, pending.id, invitingActorUserId);
        }

        const { rawToken, tokenHash } = generateInviteToken();
        const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
        const invitation = await inviteRepo.insertInvitation(client, {
          organizationId: orgId,
          churchId: churchIdForInvite,
          branchId: null,
          emailNormalized,
          emailDisplay: String(application.contact_email || emailNormalized).slice(0, 254),
          displayName: adminDisplayName.slice(0, 200),
          roleKey: "church_hq_admin",
          tokenHash,
          expiresAt,
          invitedByUserId: invitingActorUserId,
        });
        invitationId = invitation.id;
        invitationRawToken = rawToken;

        await recordAuditEventSafe(client, {
          deploymentCode,
          organizationId: orgId,
          churchId: churchIdForInvite,
          actorUserId: invitingActorUserId,
          outcome: "success",
          actionKey: "invitation.created",
          entityType: "user_invitation",
          entityId: invitationId,
          metadata: {
            category: "registration",
            status: pending ? "resent" : "created",
            actor_type: "platform_admin",
            source: actorContext.source || "admin_registration_applications",
            entity_key: "church_hq_admin",
            reason_code: administratorLinkedExisting ? "existing_user_linked" : "invited_user_created",
          },
        });
      } else if (existingUser && (resumeExistingOrg || reuseExistingUserForNewOrg)) {
        provisioningStage = "create_administrator_user";
        administratorUserId = String(existingUser.id);
        administratorLinkedExisting = true;
        administratorWasActive = String(existingUser.status) === "active";
        provisioningStage = "assign_administrator_roles";
        const hqRole = await roleAssign.assignBlessBoardRole(
          client,
          {
            email: application.contact_email || existingUser.email_normalized,
            organizationKey,
            roleKey: "church_hq_admin",
            churchKey: organizationKey,
          },
          { manageTransaction: false }
        );
        if (!hqRole.ok) {
          throw new OrchestratorError(STATUS.DATABASE_CONFLICT, hqRole.message || hqRole.status, {
            diagnostics: {
              ...identityResolutionDiagnostics,
              roleStatus: hqRole.status,
            },
          });
        }

        const branchRole = await roleAssign.assignBlessBoardRole(
          client,
          {
            email: application.contact_email || existingUser.email_normalized,
            organizationKey,
            roleKey: "branch_admin",
            churchKey: organizationKey,
            branchKey: registrationBranchKey,
          },
          { manageTransaction: false }
        );
        if (!branchRole.ok) {
          throw new OrchestratorError(
            STATUS.DATABASE_CONFLICT,
            branchRole.message || branchRole.status,
            {
              diagnostics: {
                ...identityResolutionDiagnostics,
                roleStatus: branchRole.status,
              },
            }
          );
        }
      } else {
        provisioningStage = "create_administrator_user";
        const user = await userCreate.createBlessBoardUser(
          client,
          {
            email: application.contact_email,
            displayName: adminDisplayName,
            passwordHash,
            passwordForVerify: administratorPassword,
            phoneNormalized: application.contact_phone_normalized || null,
            phoneDisplay: application.contact_phone || null,
          },
          { manageTransaction: false }
        );
        if (!user.ok) {
          const createDiag = {
            ...identityResolutionDiagnostics,
            ...(user.diagnostics || {}),
          };
          // Recoverable: identity appeared between resolve and insert — reuse when safe.
          if (
            user.status === "identity_conflict" ||
            user.status === "transaction_error"
          ) {
            const recovered = await resolveBlessBoardRegistrationAdministrator(client, {
              email: emailNormalized,
              phoneNormalized: application.contact_phone_normalized || null,
              churchName: application.church_name,
              country: application.country,
              organizationKey,
              applicationOrganizationId: application.organization_id,
              administratorPassword,
              administratorViaInvitation: false,
            });
            if (
              recovered.ok &&
              recovered.action === ADMIN_IDENTITY_ACTION.REUSE &&
              recovered.userId
            ) {
              administratorUserId = String(recovered.userId);
              administratorLinkedExisting = true;
              administratorWasActive =
                recovered.user && String(recovered.user.status) === "active";
              identityResolutionDiagnostics = {
                ...createDiag,
                ...(recovered.diagnostics || {}),
                identityResolution: "reuse_after_create_conflict",
              };
            } else if (
              recovered.ok &&
              recovered.action === ADMIN_IDENTITY_ACTION.ALREADY_PROVISIONED &&
              recovered.organizationId
            ) {
              application.organization_id = recovered.organizationId;
              const records = await loadProvisionedRecords(client, {
                ...application,
                organization_id: recovered.organizationId,
                provisioning_status: "provisioned",
              });
              return { alreadyProvisioned: true, records };
            } else {
              throw new OrchestratorError(
                recovered.action === ADMIN_IDENTITY_ACTION.REJECT_IDENTITY_CONFLICT
                  ? STATUS.IDENTITY_CONFLICT
                  : user.status === "identity_conflict"
                    ? STATUS.EXISTING_ACCOUNT
                    : STATUS.DATABASE_CONFLICT,
                recovered.reason || user.message || user.status,
                {
                  diagnostics: {
                    ...createDiag,
                    ...(recovered.diagnostics || {}),
                  },
                }
              );
            }
          } else {
            throw new OrchestratorError(
              STATUS.DATABASE_CONFLICT,
              user.message || user.status,
              { diagnostics: createDiag }
            );
          }
        } else {
          administratorUserId = String(user.user.id);
          if (user.status === "already_exists") {
            administratorLinkedExisting = true;
            administratorWasActive = true;
          }
        }

        provisioningStage = "assign_administrator_roles";
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
          throw new OrchestratorError(STATUS.DATABASE_CONFLICT, hqRole.message || hqRole.status, {
            diagnostics: {
              ...identityResolutionDiagnostics,
              roleStatus: hqRole.status,
            },
          });
        }

        const branchRole = await roleAssign.assignBlessBoardRole(
          client,
          {
            email: application.contact_email,
            organizationKey,
            roleKey: "branch_admin",
            churchKey: organizationKey,
            branchKey: registrationBranchKey,
          },
          { manageTransaction: false }
        );
        if (!branchRole.ok) {
          throw new OrchestratorError(
            STATUS.DATABASE_CONFLICT,
            branchRole.message || branchRole.status,
            {
              diagnostics: {
                ...identityResolutionDiagnostics,
                roleStatus: branchRole.status,
              },
            }
          );
        }
      }

      const churchId = church.records.church.id;
      const branchId = church.records.hqBranch.id;
      const organizationId = tenant.records.organization.id;

      provisioningStage = "website_created";
      await ensureMinimalDraftPages(client, churchId);
      await ensureDraftChurchSettings(client, {
        churchId,
        publicName: displayName,
        primaryEmail: application.contact_email,
        primaryPhone: application.contact_phone,
        defaultTimezone: "Africa/Lusaka",
        defaultCountryCode: countryCode,
      });
      provisioningStage = "default_pages_seeded";

      provisioningStage = "ensure_organization_onboarding";
      await ensureOrganizationOnboarding(client, {
        organizationId,
        applicationId,
      });

      provisioningStage = "website_initialized";
      const {
        publishInitialFoundationWebsite,
      } = require("./churchWebsitePublishService");
      const initialPublish = await publishInitialFoundationWebsite(client, {
        churchId,
        organizationId,
        organizationKey,
        publicName: displayName,
        primaryEmail: application.contact_email || null,
        primaryPhone: application.contact_phone || null,
        city: application.city || null,
        address: application.city || null,
        actorUserId: administratorViaInvitation ? invitingActorUserId : administratorUserId,
        env: actorContext.env || process.env,
        source: "registration_provision",
        publish: false,
      });
      if (!initialPublish || !initialPublish.ok) {
        throw new OrchestratorError(
          STATUS.DATABASE_CONFLICT,
          (initialPublish && initialPublish.reason) || "initial_website_publish_failed"
        );
      }
      provisioningStage = "public_route_verified";
      const expectedPublicPath = buildPublicOrganizationWebsitePath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey,
      });
      if (!initialPublish.publicPath || initialPublish.publicPath !== expectedPublicPath) {
        throw new OrchestratorError(STATUS.DATABASE_CONFLICT, "public_route_unverified");
      }

      provisioningStage = "close_application";
      const closed = await appRepo.updateApplicationProvisioningState(client, applicationId, {
        applicationStatus: "active",
        provisioningStatus: "provisioned",
        organizationId,
        provisionedAt: provisionedAt.toISOString(),
        clearFailureMetadata: true,
        // Legacy status column CHECK: pending | contacted | closed.
        legacyStatus: "closed",
      });

      provisioningStage = "write_success_audits";
      await writeSuccessAudits(client, {
        deploymentCode,
        organizationId,
        organizationKey,
        churchId,
        branchId,
        actorUserId: administratorViaInvitation ? invitingActorUserId : administratorUserId,
        requestId,
        actorType: actorContext.type || "system",
        source: actorContext.source || "orchestrator",
        planKey,
        applicationId,
        administratorUserId,
        invitationId,
      });

      provisioningStage = "committed";
      return {
        alreadyProvisioned: false,
        records: {
          applicationId,
          organizationId,
          organizationKey,
          churchId,
          branchId,
          administratorUserId,
          administratorViaInvitation,
          administratorLinkedExisting,
          administratorWasActive,
          invitationId,
          // Copy-once: caller may surface once; never persist or log.
          invitationRawToken,
          applicationStatus: closed.application_status,
          provisioningStatus: closed.provisioning_status,
          planKey,
          subscriptionStatus: subscriptionAssignment.subscriptionStatus,
          subscriptionStartsAt: subscriptionAssignment.subscriptionStartsAt,
          subscriptionEndsAt: subscriptionAssignment.subscriptionEndsAt,
        },
      };
    });

    logRegistrationTrace(null, {
      event: "church_registration_transaction",
      operation: "provision_transaction",
      requestId: requestId || null,
      applicationId,
      organizationKey: outcomeRecords.records && outcomeRecords.records.organizationKey,
      outcome: "committed",
      transactionRolledBack: false,
      alreadyProvisioned: Boolean(outcomeRecords.alreadyProvisioned),
      canonicalPlanKey:
        (outcomeRecords.records && outcomeRecords.records.planKey) || planKey || null,
      subscriptionStatus:
        (outcomeRecords.records && outcomeRecords.records.subscriptionStatus) || null,
      subscriptionStartsAt:
        (outcomeRecords.records && outcomeRecords.records.subscriptionStartsAt) || null,
      subscriptionEndsAt:
        (outcomeRecords.records && outcomeRecords.records.subscriptionEndsAt) || null,
      hasTrialEndsAt: Boolean(
        outcomeRecords.records && outcomeRecords.records.subscriptionEndsAt
      ),
      administratorViaInvitation: Boolean(
        outcomeRecords.records && outcomeRecords.records.administratorViaInvitation
      ),
      invitationCreated: Boolean(outcomeRecords.records && outcomeRecords.records.invitationId),
      // Never log invitationRawToken or passwords.
    });

    return success(
      outcomeRecords.alreadyProvisioned ? STATUS.ALREADY_PROVISIONED : STATUS.OK,
      outcomeRecords.records,
      { alreadyProvisioned: outcomeRecords.alreadyProvisioned }
    );
  } catch (err) {
    const diagnostics = extractProvisionErrorDiagnostics(err);

    if (err && err.status === STATUS.DUPLICATE_EMAIL_REVIEW && duplicateReview) {
      // Duplicate review was committed inside the outer TX before throw — TX rolls back!
      // Must persist duplicate_review AFTER rollback.
      logRegistrationTrace(
        null,
        {
          event: "church_registration_transaction",
          operation: "provision_transaction",
          requestId: requestId || null,
          applicationId,
          outcome: "rollback",
          failureCategory: STATUS.DUPLICATE_EMAIL_REVIEW,
          provisioningStage,
          transactionRolledBack: true,
          canonicalPlanKey: planKey || null,
          ...diagnostics,
        },
        { force: true }
      );
      try {
        await persistApplicationOutcome(db, applicationId, {
          applicationStatus: "review_required",
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
        err.status === STATUS.INVALID_INPUT ||
        err.status === STATUS.DUPLICATE_EMAIL_REVIEW ||
        err.status === STATUS.EXISTING_ACCOUNT ||
        err.status === STATUS.DUPLICATE_CHURCH_NAME ||
        err.status === STATUS.IDENTITY_CONFLICT
      ) {
        // No tenant writes expected (or admin identity conflict before tenant writes);
        // do not mark provisioning_failed for eligibility/slug/plan/identity holds.
        logRegistrationTrace(
          null,
          {
            event: "church_registration_transaction",
            operation: "provision_transaction",
            requestId: requestId || null,
            applicationId,
            outcome: "fail",
            failureCategory: err.status,
            provisioningStage,
            transactionRolledBack: true,
            canonicalPlanKey: planKey || null,
            ...diagnostics,
          },
          { force: true }
        );
        return fail(err.status, err.message, {
          provisioningStage,
          failedStage: provisioningStage,
          rootStatus: err.status,
        });
      }

      logRegistrationTrace(
        null,
        {
          event: "church_registration_transaction",
          operation: "provision_transaction",
          requestId: requestId || null,
          applicationId,
          outcome: "rollback",
          failureCategory: failureCode,
          provisioningStage,
          transactionRolledBack: true,
          canonicalPlanKey: planKey || null,
          ...diagnostics,
        },
        { force: true, level: "error" }
      );

      try {
        await persistApplicationOutcome(db, applicationId, {
          applicationStatus: "submitted",
          provisioningStatus: "provisioning_failed",
          provisioningFailedAt: new Date().toISOString(),
          provisioningErrorCode: String(failureCode).slice(0, 120),
          provisioningErrorDetail: failureDetail.slice(0, 2000),
          lastProvisionStage: mapBlessBoardInternalStage(provisioningStage),
        });
        try {
          const failedApp = await appRepo.findApplicationById(db, applicationId);
          if (failedApp && failedApp.organization_id) {
            await recordLifecycleAudit(db, {
              deploymentCode,
              organizationId: failedApp.organization_id,
              actionKey: LIFECYCLE_ACTION.PROVISIONING_FAILED,
              outcome: "failure",
              applicationId,
              entityId: applicationId,
              productCode: PRODUCT_KEY,
              actorType: (actorContext && actorContext.type) || "system",
              source: (actorContext && actorContext.source) || "orchestrator",
              actorUserId: administratorViaInvitation ? invitingActorUserId : null,
              failedStage: mapBlessBoardInternalStage(provisioningStage),
              reasonCode: String(failureCode).slice(0, 120),
              provisioningStatus: "provisioning_failed",
            });
          }
          await appRepo.updateApplicationRiskReviewState(db, applicationId, {
            reviewEvent: {
              at: new Date().toISOString(),
              action: "provisioning_failed",
              reason_codes: [String(failureCode).slice(0, 40)],
            },
          });
        } catch {
          /* best-effort failure trail */
        }
      } catch (persistErr) {
        logRegistrationTrace(
          null,
          {
            event: "failure_state_persist_failed",
            operation: "persist_provisioning_failure",
            requestId: requestId || null,
            applicationId,
            outcome: "fail",
            failureCategory: "persist_failed",
            rootStatus: failureCode,
            provisioningStage,
            persistError:
              persistErr && persistErr.message ? String(persistErr.message).slice(0, 120) : "error",
          },
          { force: true, level: "error" }
        );
      }
      return fail(
        failureCode === STATUS.DUPLICATE_EMAIL_REVIEW ||
          failureCode === STATUS.EXISTING_ACCOUNT ||
          failureCode === STATUS.IDENTITY_CONFLICT ||
          failureCode === STATUS.DEPLOYMENT_NOT_FOUND
          ? failureCode
          : STATUS.PROVISIONING_FAILED,
        failureDetail,
        {
          rootStatus: failureCode,
          provisioningStage,
          failedStage: provisioningStage,
        }
      );
    }

    failureDetail = sanitizeErrorDetail(err && err.message);
    const pgCode = diagnostics.postgresCode;
    const schemaMismatch = pgCode === "42703" || pgCode === "42P01";
    failureCode = schemaMismatch ? STATUS.DATABASE_CONFLICT : STATUS.INTERNAL_ERROR;
    logRegistrationTrace(
      null,
      {
        event: "church_registration_transaction",
        operation: "provision_transaction",
        requestId: requestId || null,
        applicationId,
        outcome: "rollback",
        failureCategory: failureCode,
        provisioningStage,
        transactionRolledBack: true,
        canonicalPlanKey: planKey || null,
        ...diagnostics,
      },
      { force: true, level: "error" }
    );
    try {
      await persistApplicationOutcome(db, applicationId, {
        applicationStatus: "submitted",
        provisioningStatus: "provisioning_failed",
        provisioningFailedAt: new Date().toISOString(),
        provisioningErrorCode: String(failureCode).slice(0, 120),
        provisioningErrorDetail: failureDetail.slice(0, 2000),
        lastProvisionStage: mapBlessBoardInternalStage(provisioningStage),
      });
    } catch (persistErr) {
      logRegistrationTrace(
        null,
        {
          event: "failure_state_persist_failed",
          operation: "persist_provisioning_failure",
          requestId: requestId || null,
          applicationId,
          outcome: "fail",
          failureCategory: "persist_failed",
          rootStatus: failureCode,
          provisioningStage,
          persistError:
            persistErr && persistErr.message ? String(persistErr.message).slice(0, 120) : "error",
        },
        { force: true, level: "error" }
      );
    }
    return fail(STATUS.PROVISIONING_FAILED, failureDetail, {
      rootStatus: failureCode,
      provisioningStage,
    });
  }
}

/**
 * Whether a stored provisioning_error_code may be retried from admin support ops.
 * Permanent validation conflicts (invalid plan, not eligible, etc.) are not retryable.
 * @param {string|null|undefined} errorCode
 */
function isProvisioningFailureRetryable(errorCode) {
  const code = String(errorCode || "").trim().toLowerCase();
  if (!code) {
    // Unknown stored failure — allow one idempotent retry (orchestrator re-evaluates).
    return true;
  }
  const meta = ERROR_META[code];
  if (meta) return Boolean(meta.retryable);
  // Generic stored failure category from orchestrator.
  if (code === "provisioning_failed") return true;
  return false;
}

module.exports = {
  STATUS,
  ERROR_META,
  PLAN_KEY_FREE,
  PLAN_KEY_GROWTH,
  PLAN_KEY,
  PROVISIONABLE_PLAN_KEYS,
  provisionRegisteredBlessBoardChurch,
  mapPlanLabelToCanonical,
  isProvisionablePlanKey,
  isProvisioningFailureRetryable,
  validateFreePlanCatalogue,
  validateGrowthPlanCatalogue,
  validatePlanCatalogueForProvision,
  buildSubscriptionAssignment,
  classifyExistingAdministratorIdentity,
  extractProvisionErrorDiagnostics,
  allocateUniqueOrganizationKey,
  assertOrganizationKeyAvailable,
};
