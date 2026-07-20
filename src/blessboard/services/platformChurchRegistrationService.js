"use strict";

const repo = require("../repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
  STATUS: ORCH_STATUS,
} = require("./provisionRegisteredBlessBoardChurch");
const { DUPLICATE_PHONE_MESSAGE } = require("./normalizeRegistrationPhone");
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
  "Thank you for your interest in the BlessBoard Network plan. Your registration has been received successfully. Our customer support team will contact you shortly to understand your organization's structure, branch requirements, onboarding needs, and pricing options.";

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
 * @param {Error & { code?: string, schema?: string, table?: string }} err
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
  logRegistrationTrace(
    req,
    {
      event: "church_registration_db_error",
      operation: "registration_db",
      outcome: "fail",
      failureCategory: pgCode === "42P01" ? "undefined_table" : "database_error",
      pgCode,
      schema,
      table,
      targetRelation: repo.TARGET_RELATION,
      undefinedTable: pgCode === "42P01",
    },
    { level: "error", force: true }
  );
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
 * Persist a pending church-registration application (no provisioning).
 * DB failures return a friendly result — they must not throw to the browser.
 * @param {import('pg').Pool | null} pool
 * @param {import('express').Request} req
 * @param {object} validationResult
 */
async function submitPlatformChurchRegistration(pool, req, validationResult) {
  if (validationResult.honeypot) {
    return { ok: true, honeypot: true };
  }
  if (!validationResult.ok || !validationResult.data) {
    return validationResult;
  }
  if (!pool) {
    return {
      ok: false,
      error: GENERIC_SAVE_ERROR,
      code: "pool_unavailable",
    };
  }

  const data = validationResult.data;
  const clientMeta = clientMetaFromRequest(req);

  let risk;
  try {
    risk = await evaluateRegistrationRisk(pool, {
      data,
      sourceIp: clientMeta.source_ip,
      honeypot: false,
      organizationKey: data.organization_key || null,
    });
  } catch (err) {
    logRegistrationDbError(req, err);
    return {
      ok: false,
      error: GENERIC_SAVE_ERROR,
      code: "risk_evaluation_failed",
      pgCode: err && err.code ? String(err.code) : null,
      httpStatus: 503,
    };
  }
  logRiskDecision(req, risk, "enquiry");

  if (risk.decision === RISK_DECISIONS.REJECT) {
    if (risk.reasonCodes.includes(RISK_REASON_CODES.DUPLICATE_PHONE)) {
      return {
        ok: false,
        error: risk.publicMessage || DUPLICATE_PHONE_MESSAGE,
        field: "phone",
        code: "duplicate_registration_phone",
        httpStatus: 400,
        riskDecision: risk.decision,
        riskReasonCodes: risk.reasonCodes,
      };
    }
    return {
      ok: false,
      error: PUBLIC_REJECT_MESSAGE,
      code: "registration_rejected",
      httpStatus: 400,
      riskDecision: risk.decision,
      riskReasonCodes: risk.reasonCodes,
      field: risk.field || null,
    };
  }

  // Never persist administrator_password on the application row.
  const {
    administrator_password: _dropPw,
    organization_key: _dropKey,
    wants_instant_free: _dropW,
    ...persistable
  } = data;

  const networkSupport = isNetworkPlanSelection(persistable.selected_plan);
  const supportFields = networkSupport
    ? {
        support_requested: true,
        follow_up_status: "contact_pending",
        selected_plan: NETWORK_PLAN_CODE,
      }
    : {};

  try {
    const { application, duplicate } = await repo.createApplicationIdempotent(pool, {
      ...persistable,
      ...supportFields,
      ...clientMeta,
      ...riskPersistFields(risk),
    });
    try {
      logReceived(req, application, {
        duplicate,
        mode: networkSupport ? "network_support_contact" : "enquiry",
      });
    } catch {
      /* logging must not block */
    }
    try {
      maybeSendRegistrationAcknowledgementEmail(application);
    } catch {
      /* email must never fail submission */
    }
    if (duplicate && application && String(application.application_status) === "duplicate_review") {
      return {
        ok: false,
        review: true,
        application,
        duplicate,
        networkSupportContact: networkSupport,
        error: DUPLICATE_REVIEW_MESSAGE,
        code: "review_required",
        httpStatus: 200,
        riskDecision: application.risk_decision || risk.decision,
        riskReasonCodes: risk.reasonCodes,
      };
    }
    if (!duplicate && risk.decision === RISK_DECISIONS.REVIEW_REQUIRED) {
      return {
        ok: false,
        review: true,
        application,
        duplicate,
        networkSupportContact: networkSupport,
        error: DUPLICATE_REVIEW_MESSAGE,
        code: "review_required",
        httpStatus: 200,
        riskDecision: risk.decision,
        riskReasonCodes: risk.reasonCodes,
      };
    }
    return {
      ok: true,
      application,
      duplicate,
      networkSupportContact: networkSupport,
      riskDecision: application.risk_decision || risk.decision,
      riskReasonCodes: risk.reasonCodes,
    };
  } catch (err) {
    if (err && (err.code === "duplicate_registration_phone" || err.name === "DuplicateRegistrationPhoneError")) {
      return {
        ok: false,
        error: err.message || DUPLICATE_PHONE_MESSAGE,
        field: "phone",
        code: "duplicate_registration_phone",
        httpStatus: 400,
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
}

/**
 * Insert application then call shared orchestrator for Free instant provisioning.
 * @param {import('pg').Pool | null} pool
 * @param {import('express').Request} req
 * @param {object} validationResult
 * @param {{
 *   dataEnvironment?: string,
 *   deploymentCode?: string,
 *   provisionFn?: typeof provisionRegisteredBlessBoardChurch,
 * }} [opts]
 */
async function submitInstantFreeChurchRegistration(pool, req, validationResult, opts = {}) {
  if (validationResult.honeypot) {
    return { ok: true, honeypot: true };
  }
  if (!validationResult.ok || !validationResult.data) {
    return validationResult;
  }
  if (!validationResult.data.wants_instant_free) {
    return submitPlatformChurchRegistration(pool, req, validationResult);
  }
  if (!pool) {
    return {
      ok: false,
      error: GENERIC_SAVE_ERROR,
      code: "pool_unavailable",
    };
  }

  const data = validationResult.data;
  const password = data.administrator_password;
  const organizationKey = data.organization_key;
  if (!password || !organizationKey) {
    return {
      ok: false,
      error: "Please complete the administrator password and organization key fields.",
      code: "invalid_input",
    };
  }

  const clientMeta = clientMetaFromRequest(req);
  let risk;
  try {
    risk = await evaluateRegistrationRisk(pool, {
      data,
      sourceIp: clientMeta.source_ip,
      honeypot: false,
      organizationKey,
    });
  } catch (err) {
    logRegistrationDbError(req, err);
    return {
      ok: false,
      error: GENERIC_SAVE_ERROR,
      code: "risk_evaluation_failed",
      pgCode: err && err.code ? String(err.code) : null,
      httpStatus: 503,
    };
  }
  logRiskDecision(req, risk, "instant_free");

  if (risk.decision === RISK_DECISIONS.REJECT) {
    if (risk.reasonCodes.includes(RISK_REASON_CODES.DUPLICATE_PHONE)) {
      return {
        ok: false,
        mode: "instant_free",
        error: risk.publicMessage || DUPLICATE_PHONE_MESSAGE,
        field: "phone",
        code: "duplicate_registration_phone",
        httpStatus: 400,
        riskDecision: risk.decision,
        riskReasonCodes: risk.reasonCodes,
      };
    }
    return {
      ok: false,
      mode: "instant_free",
      error: PUBLIC_REJECT_MESSAGE,
      code: "registration_rejected",
      httpStatus: 400,
      riskDecision: risk.decision,
      riskReasonCodes: risk.reasonCodes,
      field: risk.field || null,
    };
  }

  const {
    administrator_password: _pw,
    organization_key: _ok,
    wants_instant_free: _w,
    ...persistable
  } = data;

  let application;
  let duplicate = false;
  try {
    const created = await repo.createApplicationIdempotent(pool, {
      ...persistable,
      ...clientMeta,
      ...riskPersistFields(risk),
    });
    application = created.application;
    duplicate = created.duplicate;
    try {
      logReceived(req, application, { duplicate, mode: "instant_free" });
    } catch {
      /* ignore */
    }
  } catch (err) {
    if (err && (err.code === "duplicate_registration_phone" || err.name === "DuplicateRegistrationPhoneError")) {
      return {
        ok: false,
        error: err.message || DUPLICATE_PHONE_MESSAGE,
        field: "phone",
        code: "duplicate_registration_phone",
        httpStatus: 400,
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

  // Soft idempotent twin: honor the existing row's state over a freshly computed hold.
  if (duplicate && application) {
    if (String(application.application_status) === "duplicate_review") {
      return {
        ok: false,
        mode: "instant_free",
        review: true,
        application,
        duplicate,
        error: DUPLICATE_REVIEW_MESSAGE,
        code: "review_required",
        httpStatus: 200,
      };
    }
  } else if (risk.decision === RISK_DECISIONS.REVIEW_REQUIRED) {
    return {
      ok: false,
      mode: "instant_free",
      review: true,
      application,
      duplicate,
      error: DUPLICATE_REVIEW_MESSAGE,
      code: "review_required",
      httpStatus: 200,
      riskDecision: risk.decision,
      riskReasonCodes: risk.reasonCodes,
    };
  }

  // Soft idempotent twin: if prior row is already held for review, do not provision.
  if (application && String(application.application_status) === "duplicate_review") {
    return {
      ok: false,
      mode: "instant_free",
      review: true,
      application,
      duplicate,
      error: DUPLICATE_REVIEW_MESSAGE,
      code: "review_required",
      httpStatus: 200,
    };
  }

  const provisionFn = opts.provisionFn || provisionRegisteredBlessBoardChurch;
  let provision;
  try {
    provision = await provisionFn(
      pool,
      {
        applicationId: application.id,
        administratorPassword: password,
        requestedOrganizationKey: organizationKey,
        requestId: (req && req.requestId) || null,
        actorContext: {
          type: "public_self_registration",
          source: "register_church",
          dataEnvironment: opts.dataEnvironment || "testing",
          deploymentCode: opts.deploymentCode || "blessboard-org-v5",
        },
      },
      { allowRetry: true }
    );
  } catch (err) {
    logRegistrationDbError(req, err);
    return {
      ok: false,
      mode: "instant_free",
      application,
      error: GENERIC_PROVISION_ERROR,
      code: "provision_exception",
      httpStatus: 503,
    };
  }

  try {
    logProvisionOutcome(req, provision);
  } catch {
    /* ignore */
  }

  if (provision.ok) {
    return {
      ok: true,
      mode: "instant_free",
      application,
      duplicate,
      provision,
      records: provision.records,
      alreadyProvisioned: Boolean(provision.alreadyProvisioned),
      riskDecision: risk.decision,
      riskReasonCodes: risk.reasonCodes,
    };
  }

  return mapProvisionFailure(provision, application);
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
  logRegistrationDbError,
  mapProvisionFailure,
};
