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
const { logRegistrationTrace } = require("./registrationTraceLog");
const {
  normalizeOrganizationKey,
  resolveBaseOrganizationKey,
  withOrganizationKeySuffix,
} = require("./organizationKey");
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
  growthTrialEndsAtIso,
} = require("../../platform/time/addGrowthTrialDurationUtc");

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
  IDENTITY_CONFLICT: "identity_conflict",
  DUPLICATE_CHURCH_NAME: "duplicate_church_name",
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
  [STATUS.DUPLICATE_CHURCH_NAME]: {
    retryable: false,
    severity: "warn",
    publicMessage: DUPLICATE_CHURCH_NAME_MESSAGE,
  },
  [STATUS.IDENTITY_CONFLICT]: {
    retryable: false,
    severity: "warn",
    publicMessage:
      "The administrator email is already linked to an account that cannot safely own this church.",
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
const PLAN_KEY_FREE = "free";
const PLAN_KEY_GROWTH = "growth";
/** Plans the registration orchestrator may assign. Network is enquiry-only. */
const PROVISIONABLE_PLAN_KEYS = Object.freeze([PLAN_KEY_FREE, PLAN_KEY_GROWTH]);
/** @deprecated Use PLAN_KEY_FREE — retained for callers that imported PLAN_KEY historically via mapPlanLabel. */
const PLAN_KEY = PLAN_KEY_FREE;
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
 * Allocate a unique organization_key inside the provisioning transaction.
 * Prefer an exact operator-supplied key when available; otherwise slugify the
 * church name and resolve collisions with -2, -3, … suffixes.
 *
 * @param {{ query: Function }} client
 * @param {{ preferredKey?: string|null, churchName?: string|null, exactPreferred?: boolean }} input
 * @returns {Promise<string>}
 */
async function allocateUniqueOrganizationKey(client, input) {
  const preferred = String((input && input.preferredKey) || "").trim();
  const churchName = String((input && input.churchName) || "").trim();
  const exactPreferred = Boolean(input && input.exactPreferred && preferred);

  if (exactPreferred) {
    const keyNorm = normalizeOrganizationKey(preferred);
    if (!keyNorm.ok) {
      throw new OrchestratorError(
        keyNorm.reason === "reserved_key" ? STATUS.SLUG_UNAVAILABLE : STATUS.INVALID_INPUT,
        keyNorm.reason === "reserved_key" ? "slug_unavailable" : "invalid_input:organizationKey"
      );
    }
    await assertOrganizationKeyAvailable(client, keyNorm.key);
    return keyNorm.key;
  }

  const base = resolveBaseOrganizationKey(preferred || churchName);
  if (!base.ok) {
    throw new OrchestratorError(
      base.reason === "reserved_key" ? STATUS.SLUG_UNAVAILABLE : STATUS.INVALID_INPUT,
      base.reason === "reserved_key" ? "slug_unavailable" : "invalid_input:organizationKey"
    );
  }

  for (let n = 1; n <= 200; n += 1) {
    const candidateRaw = withOrganizationKeySuffix(base.key, n);
    const candidate = normalizeOrganizationKey(candidateRaw);
    if (!candidate.ok) continue;
    const r = await client.query(
      `SELECT id FROM platform.organizations WHERE organization_key = $1 LIMIT 1`,
      [candidate.key]
    );
    if (!r.rows[0]) return candidate.key;
  }
  throw new OrchestratorError(STATUS.SLUG_UNAVAILABLE, "slug_unavailable");
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
  if (
    email === existing.primaryEmail &&
    phone === existing.primaryPhone &&
    existing.publicName
  ) {
    return;
  }
  await settingsRepo.upsertChurchSettings(client, fields.churchId, {
    publicName: existing.publicName || fields.publicName,
    denomination: existing.denomination,
    primaryEmail: email,
    primaryPhone: phone,
    defaultTimezone: existing.defaultTimezone,
    defaultCountryCode: existing.defaultCountryCode,
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
      postgresCode: null,
      constraint: null,
      table: null,
      schema: null,
    };
  }
  const pgCode =
    err.code != null && /^[0-9A-Z]{5}$/.test(String(err.code)) ? String(err.code) : null;
  return {
    errorName: err.name != null ? String(err.name).slice(0, 80) : null,
    postgresCode: pgCode,
    constraint: err.constraint != null ? String(err.constraint).slice(0, 120) : null,
    table: err.table != null ? String(err.table).slice(0, 120) : null,
    schema: err.schema != null ? String(err.schema).slice(0, 64) : null,
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
      plan_key: opts.planKey || PLAN_KEY_FREE,
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
        const records = await loadProvisionedRecords(client, application);
        return { alreadyProvisioned: true, records };
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
        application.provisioning_status !== "provisioned"
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
      const organizationKey = await allocateUniqueOrganizationKey(client, {
        preferredKey: preferredKey || null,
        churchName: application.church_name,
        // Operator-supplied keys must be exact; auto church-name keys collide with -2/-3.
        exactPreferred: Boolean(preferredKey),
      });

      provisioningStage = "resolve_administrator_identity";
      const emailNormalized = normalizeEmail(application.contact_email);
      if (!emailNormalized) {
        throw new OrchestratorError(STATUS.INVALID_INPUT, "invalid_input:administratorEmail");
      }
      const existingUser = await authRepo.findUserByEmail(client, emailNormalized);
      if (existingUser && !administratorViaInvitation) {
        duplicateReview = true;
        throw new OrchestratorError(STATUS.DUPLICATE_EMAIL_REVIEW, "duplicate_email_review");
      }
      if (existingUser && administratorViaInvitation) {
        const identity = classifyExistingAdministratorIdentity(existingUser);
        if (!identity.ok) {
          throw new OrchestratorError(STATUS.IDENTITY_CONFLICT, "identity_conflict");
        }
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
        throw new OrchestratorError(
          tenant.status === "organization_conflict" ? STATUS.SLUG_UNAVAILABLE : STATUS.DATABASE_CONFLICT,
          tenant.message || tenant.status
        );
      }
      provisioningStage = "organization_created";
      provisioningStage = "organization_key_created";

      const hqNamePrepared = prepareBranchDisplayName(
        application.branch_name || "Headquarters",
        { field: "branch_name", required: true, emptyMessage: "Please enter a branch name." }
      );
      const hqBranchDisplayName = hqNamePrepared.ok
        ? hqNamePrepared.display
        : "Headquarters";

      provisioningStage = "provision_church_branch";
      const church = await churchProvision.provisionBlessBoardChurch(
        client,
        {
          organizationKey,
          churchKey: organizationKey,
          displayName,
          legalName: null,
          dataEnvironment,
          hqBranchKey: HQ_BRANCH_KEY,
          hqBranchDisplayName,
          timezone: null,
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
            emailNormalized,
            emailDisplay: String(application.contact_email || emailNormalized).slice(0, 254),
            passwordHash: null,
            status: "invited",
            displayName: adminDisplayName.slice(0, 200),
          });
        } else {
          administratorLinkedExisting = true;
          administratorWasActive = String(adminUser.status) === "active";
          // Never reset or overwrite an existing password hash.
        }
        if (!adminUser || !adminUser.id) {
          throw new OrchestratorError(STATUS.DATABASE_CONFLICT, "administrator_prepare_failed");
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
      } else {
        provisioningStage = "create_administrator_user";
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
        administratorUserId = String(user.user.id);

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
      });
      provisioningStage = "default_pages_seeded";

      provisioningStage = "ensure_organization_onboarding";
      await ensureOrganizationOnboarding(client, {
        organizationId,
        applicationId,
      });

      provisioningStage = "website_published";
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
        return fail(err.status, err.message);
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
      return fail(
        failureCode === STATUS.DUPLICATE_EMAIL_REVIEW || failureCode === STATUS.IDENTITY_CONFLICT
          ? failureCode
          : STATUS.PROVISIONING_FAILED,
        failureDetail,
        {
          rootStatus: failureCode,
          provisioningStage,
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
