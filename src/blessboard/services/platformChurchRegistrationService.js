"use strict";

const repo = require("../repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
  STATUS: ORCH_STATUS,
} = require("./provisionRegisteredBlessBoardChurch");
const { DUPLICATE_PHONE_MESSAGE } = require("./normalizeRegistrationPhone");
const {
  DUPLICATE_CHURCH_NAME_MESSAGE,
  resolveCountryCodeForUniqueness,
} = require("./normalizeChurchIdentity");
const { assertChurchNameAvailable } = require("./assertChurchNameAvailable");
const {
  isNetworkPlanSelection,
  NETWORK_PLAN_CODE,
} = require("./platformChurchRegistrationValidation");
const {
  RISK_DECISIONS,
  RISK_REASON_CODES,
  PUBLIC_REVIEW_MESSAGE,
  PUBLIC_REJECT_MESSAGE,
  evaluateRegistrationRisk,
} = require("./registrationRiskDecision");
const { logRegistrationTrace } = require("./registrationTraceLog");
const {
  mapPublicPlanToDbPlanKey,
  normalizePublicPlanCode,
} = require("./registrationPlanMapping");

const GENERIC_SAVE_ERROR = "We could not save your request right now. Please try again shortly.";
const GENERIC_PROVISION_ERROR =
  "We could not finish creating your church workspace right now. Please try again shortly.";
const DUPLICATE_REVIEW_MESSAGE = PUBLIC_REVIEW_MESSAGE;
const IN_PROGRESS_MESSAGE =
  "Your registration is already being completed. Please wait a moment, then sign in if your workspace is ready.";
const PLAN_OPS_MESSAGE =
  "Church registration is temporarily unavailable. Please try again later or contact BlessBoard support.";

/**
 * Exact customer success copy for Network support-contact registration (POST-redirect-GET).
 * Do not include application IDs or internal notes.
 */
const NETWORK_SUPPORT_SUCCESS_MESSAGE =
  "Thank you for your interest in the BlessBoard Network plan. Your registration has been received successfully. Our customer support team will contact you shortly to validate your organization's requirements and guide you through the next steps.";

/**
 * Registration acknowledgement email is not wired in V5 yet (no BlessBoard registration
 * mail abstraction). Submission must succeed regardless; operators contact from the admin queue.
 */
function maybeSendRegistrationAcknowledgementEmail(/* _application */) {
  // Gap: no functioning registration email abstraction exists. Do not throw.
  return { sent: false, reason: "registration_email_not_configured" };
}

function clientMetaFromRequest(req) {
  const ip = String((req && (req.ip || (req.connection && req.connection.remoteAddress))) || "").slice(
    0,
    64
  );
  const userAgent = String((req && req.get && req.get("user-agent")) || "").slice(0, 500);
  return { source_ip: ip || null, user_agent: userAgent || null };
}

function logReceived(req, application, { duplicate = false, mode = "enquiry" } = {}) {
  if (!application || !application.id) return;
  const publicPlanCode = normalizePublicPlanCode(application.selected_plan) || null;
  logRegistrationTrace(req, {
    event: "church_registration_application",
    operation: "registration_application_persisted",
    outcome: "ok",
    applicationId: application.id,
    applicationStatus: application.application_status || application.status || null,
    provisioningStatus: application.provisioning_status || null,
    publicPlanCode,
    canonicalPlanKey: mapPublicPlanToDbPlanKey(application.selected_plan) || null,
    riskDecision: application.risk_decision || null,
    riskReasonCodes: application.risk_reason_codes || [],
    duplicate: Boolean(duplicate),
    mode,
  });
}

/**
 * Safe operator log for DB failures — no form body, passwords, or DATABASE_URL.
 * @param {import('express').Request | null} req
 * @param {Error & { code?: string, schema?: string, table?: string, missingColumns?: string[] }} err
 */
function logRegistrationDbError(req, err) {
  const pgCode = err && err.code != null ? String(err.code).slice(0, 32) : null;
  const schema =
    err && err.schema != null
      ? String(err.schema).slice(0, 64)
      : repo.TARGET_SCHEMA;
  const table =
    err && err.table != null
      ? String(err.table).slice(0, 128)
      : repo.TARGET_TABLE;
  const isSchemaMismatch =
    pgCode === "schema_mismatch" ||
    (err && err.name === "PublicRegistrationSchemaMismatchError") ||
    pgCode === "42703";
  const missingColumns = Array.isArray(err && err.missingColumns)
    ? err.missingColumns.map((c) => String(c).slice(0, 64)).slice(0, 40)
    : null;
  logRegistrationTrace(
    req,
    {
      event: isSchemaMismatch
        ? "church_registration_schema_mismatch"
        : "church_registration_db_error",
      operation: "registration_db",
      outcome: "fail",
      failureCategory:
        pgCode === "42P01"
          ? "undefined_table"
          : isSchemaMismatch
            ? "schema_mismatch"
            : "database_error",
      pgCode,
      schema,
      table,
      targetRelation: repo.TARGET_RELATION,
      undefinedTable: pgCode === "42P01",
      ...(missingColumns ? { missingColumns } : {}),
    },
    { level: "error", force: true }
  );
}

function mapRegistrationPersistError(req, err) {
  if (err && (err.code === "duplicate_registration_phone" || err.name === "DuplicateRegistrationPhoneError")) {
    return {
      ok: false,
      error: err.message || DUPLICATE_PHONE_MESSAGE,
      field: "phone",
      code: "duplicate_registration_phone",
      httpStatus: 400,
    };
  }
  if (
    err &&
    (err.code === "schema_mismatch" || err.name === "PublicRegistrationSchemaMismatchError")
  ) {
    logRegistrationDbError(req, err);
    return {
      ok: false,
      error: GENERIC_SAVE_ERROR,
      code: "schema_mismatch",
      httpStatus: 503,
    };
  }
  logRegistrationDbError(req, err);
  return {
    ok: false,
    error: GENERIC_SAVE_ERROR,
    code: err && err.code ? String(err.code) : "db_error",
    pgCode: err && err.code ? String(err.code) : null,
  };
}

function logProvisionOutcome(req, result) {
  const records = (result && result.records) || {};
  const ok = Boolean(result && result.ok);
  const status = (result && result.status) || null;
  const endsAt = records.subscriptionEndsAt || null;
  const rolledBack =
    !ok &&
    (status === ORCH_STATUS.PROVISIONING_FAILED ||
      status === ORCH_STATUS.INTERNAL_ERROR ||
      status === ORCH_STATUS.DATABASE_CONFLICT);
  logRegistrationTrace(req, {
    event: "church_registration_provision",
    operation: "provision_registered_church",
    outcome: ok ? "ok" : "fail",
    failureCategory: ok ? null : status || "provisioning_failed",
    status,
    ok,
    alreadyProvisioned: Boolean(result && result.alreadyProvisioned),
    applicationId: records.applicationId || null,
    organizationKey: records.organizationKey || null,
    canonicalPlanKey: records.planKey || null,
    publicPlanCode:
      records.planKey === "free"
        ? "foundation"
        : records.planKey === "growth"
          ? "growth"
          : null,
    subscriptionStatus: records.subscriptionStatus || null,
    subscriptionStartsAt: records.subscriptionStartsAt || null,
    subscriptionEndsAt: endsAt,
    hasTrialEndsAt: Boolean(endsAt),
    transactionRolledBack: ok ? false : rolledBack,
  });
}

function logRiskDecision(req, risk, mode) {
  try {
    logRegistrationTrace(req, {
      event: "church_registration_risk",
      operation: "registration_risk_decision",
      mode,
      decision: risk && risk.decision,
      reasonCodes: (risk && risk.reasonCodes) || [],
      outcome: "ok",
    });
  } catch {
    /* logging must not block */
  }
}

/**
 * @param {object} risk
 * @returns {{ application_status: string, risk_decision: string, risk_reason_codes: string[], risk_decided_at: string }}
 */
function riskPersistFields(risk) {
  const reviewRequired = risk.decision === RISK_DECISIONS.REVIEW_REQUIRED;
  return {
    application_status: reviewRequired ? "duplicate_review" : "submitted",
    risk_decision: risk.decision,
    risk_reason_codes: risk.reasonCodes || [],
    risk_decided_at: risk.decidedAt || new Date().toISOString(),
  };
}

/**
 * Block new applications when a live church already owns the normalized name+country.
 * Country must resolve to ISO-2 for a definitive check; unresolved free-text is deferred to provisioning.
 * Idempotent retries that reuse an existing organization_key are allowed.
 * @param {import('pg').Pool} pool
 * @param {{ church_name?: string, country?: string, organization_key?: string }} data
 */
async function rejectIfChurchNameTaken(pool, data) {
  const countryCode = resolveCountryCodeForUniqueness(data && data.country);
  if (!countryCode) {
    return null;
  }
  try {
    let excludeOrganizationId = null;
    const orgKey =
      data && data.organization_key != null
        ? String(data.organization_key).trim().toLowerCase()
        : "";
    if (orgKey) {
      const org = await pool.query(
        `SELECT id FROM platform.organizations WHERE organization_key = $1 LIMIT 1`,
        [orgKey]
      );
      if (org.rows[0]) {
        excludeOrganizationId = String(org.rows[0].id);
      }
    }
    const check = await assertChurchNameAvailable(pool, {
      churchName: data && data.church_name,
      countryCode,
      excludeOrganizationId,
    });
    if (check.ok) {
      return null;
    }
    return {
      ok: false,
      error: check.message || DUPLICATE_CHURCH_NAME_MESSAGE,
      field: "church_name",
      code: "duplicate_church_name",
      httpStatus: 400,
    };
  } catch {
    // Fail open on transient lookup errors — provisioning still enforces.
    return null;
  }
}

const {
  PRODUCT,
  RESULT: ENGINE_RESULT,
  REVIEW_REASON,
  submitProductRegistration,
} = require("../../platform/registration");

function riskFields(result, application) {
  return {
    riskDecision:
      (result && result.riskDecision) ||
      (application && (application.risk_decision || application.riskDecision)) ||
      null,
    riskReasonCodes:
      (result && result.riskReasonCodes) ||
      (application && (application.risk_reason_codes || application.riskReasonCodes)) ||
      [],
  };
}

function mapEngineResultToChurchHttp(result, validationResult) {
  const data = (validationResult && validationResult.data) || {};
  const networkSupport = isNetworkPlanSelection(data.selected_plan);
  const application = (result && result.application) || null;
  const code = result && result.code;
  const risk = riskFields(result, application);

  if (code === ENGINE_RESULT.INVALID) {
    return {
      ok: false,
      error: result.error || GENERIC_SAVE_ERROR,
      field: result.field || null,
      code: result.persistCode || result.code,
      pgCode: result.pgCode || null,
      httpStatus: result.httpStatus || (result.field ? 400 : 503),
      application,
      engine: result.engine,
      ...risk,
    };
  }
  if (code === ENGINE_RESULT.DUPLICATE) {
    return {
      ok: false,
      review: true,
      application,
      duplicate: true,
      error: DUPLICATE_REVIEW_MESSAGE,
      code: "review_required",
      httpStatus: 200,
      engine: result.engine,
      ...risk,
    };
  }
  if (code === ENGINE_RESULT.REVIEW_REQUIRED) {
    const enquiryHold =
      result.reason === REVIEW_REASON.SELF_REGISTRATION_PROVISIONING_DISABLED ||
      result.reason === REVIEW_REASON.NETWORK_PLAN_MANUAL_REVIEW ||
      result.reason === REVIEW_REASON.MANUAL_PLATFORM_HOLD ||
      networkSupport;
    return {
      ok: Boolean(enquiryHold),
      review: !enquiryHold,
      application,
      networkSupportContact: networkSupport,
      error: enquiryHold ? undefined : DUPLICATE_REVIEW_MESSAGE,
      code: "review_required",
      httpStatus: 200,
      reason: result.reason,
      engine: result.engine,
      ...risk,
    };
  }
  if (code === ENGINE_RESULT.PROVISION_FAILED) {
    const raw = result.provision || {};
    const inner = raw.provisioned || raw;
    return {
      ...mapProvisionFailure(
        { ...inner, status: inner.status || raw.code || result.reason },
        application
      ),
      ...risk,
    };
  }
  if (code === ENGINE_RESULT.ACTIVE) {
    const provisionWrapper = result.provision || {};
    const provision = provisionWrapper.provisioned || provisionWrapper;
    const records = provision.records || provisionWrapper.records || {};
    return {
      ok: true,
      mode: "instant_free",
      application,
      provision,
      records,
      alreadyProvisioned: Boolean(result.alreadyProvisioned || provision.alreadyProvisioned),
      engine: result.engine,
      canonicalLifecycle: result.canonicalLifecycle,
      ...risk,
    };
  }
  return {
    ok: false,
    error: GENERIC_SAVE_ERROR,
    code: (result && result.code) || "unknown",
    application,
    ...risk,
  };
}

/**
 * Shared church registration entry. Lifecycle lives in the platform engine.
 */
async function submitChurchRegistration(pool, req, validationResult, opts = {}) {
  if (validationResult && validationResult.honeypot) {
    return { ok: true, honeypot: true };
  }
  if (!validationResult || !validationResult.ok || !validationResult.data) {
    return validationResult;
  }
  if (!pool) {
    return {
      ok: false,
      error: GENERIC_SAVE_ERROR,
      code: "pool_unavailable",
    };
  }

  let engineResult;
  try {
    engineResult = await submitProductRegistration(pool, {
      productCode: PRODUCT.BLESSBOARD,
      payload: {
        ...validationResult.data,
        data: validationResult.data,
        req,
        provisionFn: opts.provisionFn,
      },
      env: opts.env || {},
      deploymentCode: opts.deploymentCode || "blessboard-org-staging",
      dataEnvironment: opts.dataEnvironment || "testing",
    });
  } catch (err) {
    return mapRegistrationPersistError(req, err);
  }

  try {
    if (engineResult && engineResult.application) {
      logReceived(req, engineResult.application, {
        duplicate: Boolean(engineResult.duplicate),
        mode: engineResult.code === ENGINE_RESULT.ACTIVE ? "instant_free" : "shared_engine",
      });
    }
  } catch {
    /* logging must not block */
  }
  try {
    maybeSendRegistrationAcknowledgementEmail(engineResult && engineResult.application);
  } catch {
    /* email must never fail submission */
  }
  try {
    if (engineResult && engineResult.provision) {
      logProvisionOutcome(req, engineResult.provision.provisioned || engineResult.provision);
    }
  } catch {
    /* ignore */
  }

  return mapEngineResultToChurchHttp(engineResult, validationResult);
}

async function submitPlatformChurchRegistration(pool, req, validationResult) {
  return submitChurchRegistration(pool, req, validationResult, {});
}

async function submitInstantFreeChurchRegistration(pool, req, validationResult, opts = {}) {
  return submitChurchRegistration(pool, req, validationResult, opts);
}

/**
 * @param {object} provision
 * @param {object} application
 */
function mapProvisionFailure(provision, application) {
  const status = provision && provision.status;
  if (status === ORCH_STATUS.SLUG_UNAVAILABLE) {
    return {
      ok: false,
      mode: "instant_free",
      application,
      code: status,
      field: "organization_key",
      error: "That organization key is not available. Please choose another.",
      httpStatus: 400,
    };
  }
  if (status === ORCH_STATUS.DUPLICATE_EMAIL_REVIEW) {
    return {
      ok: false,
      mode: "instant_free",
      application,
      code: status,
      review: true,
      error: DUPLICATE_REVIEW_MESSAGE,
      httpStatus: 200,
    };
  }
  if (status === ORCH_STATUS.PROVISIONING_IN_PROGRESS) {
    return {
      ok: false,
      mode: "instant_free",
      application,
      code: status,
      inProgress: true,
      error: IN_PROGRESS_MESSAGE,
      httpStatus: 200,
    };
  }
  if (status === ORCH_STATUS.INVALID_PLAN || status === ORCH_STATUS.PLAN_CONFIGURATION_ERROR) {
    return {
      ok: false,
      mode: "instant_free",
      application,
      code: status,
      error: PLAN_OPS_MESSAGE,
      httpStatus: 503,
    };
  }
  if (status === ORCH_STATUS.DATABASE_UNAVAILABLE) {
    return {
      ok: false,
      mode: "instant_free",
      application,
      code: status,
      error: "The service is temporarily unavailable. Please try again shortly.",
      httpStatus: 503,
    };
  }
  return {
    ok: false,
    mode: "instant_free",
    application,
    code: status || "provisioning_failed",
    error: GENERIC_PROVISION_ERROR,
    httpStatus: 503,
  };
}

module.exports = {
  GENERIC_SAVE_ERROR,
  GENERIC_PROVISION_ERROR,
  DUPLICATE_REVIEW_MESSAGE,
  IN_PROGRESS_MESSAGE,
  PLAN_OPS_MESSAGE,
  NETWORK_SUPPORT_SUCCESS_MESSAGE,
  PUBLIC_REJECT_MESSAGE,
  submitPlatformChurchRegistration,
  submitInstantFreeChurchRegistration,
  submitChurchRegistration,
  logRegistrationDbError,
  mapProvisionFailure,
  mapRegistrationPersistError,
};
