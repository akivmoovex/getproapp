"use strict";

const repo = require("../repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
  STATUS: ORCH_STATUS,
} = require("./provisionRegisteredBlessBoardChurch");

const GENERIC_SAVE_ERROR = "We could not save your request right now. Please try again shortly.";
const GENERIC_PROVISION_ERROR =
  "We could not finish creating your church workspace right now. Please try again shortly.";
const DUPLICATE_REVIEW_MESSAGE =
  "Thank you. Your registration needs a short review before we can continue. BlessBoard will assist you — no further action is required right now.";
const IN_PROGRESS_MESSAGE =
  "Your registration is already being completed. Please wait a moment, then sign in if your workspace is ready.";
const PLAN_OPS_MESSAGE =
  "Church registration is temporarily unavailable. Please try again later or contact BlessBoard support.";

function clientMetaFromRequest(req) {
  const ip = String((req && (req.ip || (req.connection && req.connection.remoteAddress))) || "").slice(
    0,
    64
  );
  const userAgent = String((req && req.get && req.get("user-agent")) || "").slice(0, 500);
  return { source_ip: ip || null, user_agent: userAgent || null };
}

function logReceived(application, { duplicate = false, mode = "enquiry" } = {}) {
  if (!application || !application.id) return;
  // eslint-disable-next-line no-console
  console.log(
    "[blessboard-church-registration]",
    JSON.stringify({
      op: "platform_church_registration_received",
      applicationId: application.id,
      status: application.status,
      applicationStatus: application.application_status || null,
      provisioningStatus: application.provisioning_status || null,
      selectedPlan: application.selected_plan || null,
      duplicate: Boolean(duplicate),
      mode,
    })
  );
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
  // eslint-disable-next-line no-console
  console.error(
    "[blessboard-church-registration]",
    JSON.stringify({
      event: "platform_church_registration_db_error",
      requestId: (req && req.requestId) || null,
      pgCode,
      schema,
      table,
      targetRelation: repo.TARGET_RELATION,
      // 42P01 must remain visible to operators (not swallowed).
      undefinedTable: pgCode === "42P01",
    })
  );
}

function logProvisionOutcome(req, result) {
  // eslint-disable-next-line no-console
  console.log(
    "[blessboard-church-registration]",
    JSON.stringify({
      event: "platform_church_registration_provision",
      requestId: (req && req.requestId) || null,
      ok: Boolean(result && result.ok),
      status: (result && result.status) || null,
      alreadyProvisioned: Boolean(result && result.alreadyProvisioned),
      applicationId: (result && result.records && result.records.applicationId) || null,
      organizationKey: (result && result.records && result.records.organizationKey) || null,
    })
  );
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
  // Never persist administrator_password on the application row.
  const { administrator_password: _dropPw, organization_key: _dropKey, wants_instant_free: _dropW, ...persistable } =
    data;

  try {
    const { application, duplicate } = await repo.createApplicationIdempotent(pool, {
      ...persistable,
      ...clientMetaFromRequest(req),
    });
    try {
      logReceived(application, { duplicate, mode: "enquiry" });
    } catch {
      /* logging must not block */
    }
    return { ok: true, application, duplicate };
  } catch (err) {
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

  const { administrator_password: _pw, organization_key: _ok, wants_instant_free: _w, ...persistable } =
    data;

  let application;
  let duplicate = false;
  try {
    const created = await repo.createApplicationIdempotent(pool, {
      ...persistable,
      ...clientMetaFromRequest(req),
    });
    application = created.application;
    duplicate = created.duplicate;
    try {
      logReceived(application, { duplicate, mode: "instant_free" });
    } catch {
      /* ignore */
    }
  } catch (err) {
    logRegistrationDbError(req, err);
    return {
      ok: false,
      error: GENERIC_SAVE_ERROR,
      code: err && err.code ? String(err.code) : "db_error",
      pgCode: err && err.code ? String(err.code) : null,
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
  submitPlatformChurchRegistration,
  submitInstantFreeChurchRegistration,
  logRegistrationDbError,
  mapProvisionFailure,
};
