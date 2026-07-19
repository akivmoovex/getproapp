"use strict";

const repo = require("../repositories/platformChurchRegistrationRepository");

const GENERIC_SAVE_ERROR = "We could not save your request right now. Please try again shortly.";

function clientMetaFromRequest(req) {
  const ip = String((req && (req.ip || (req.connection && req.connection.remoteAddress))) || "").slice(
    0,
    64
  );
  const userAgent = String((req && req.get && req.get("user-agent")) || "").slice(0, 500);
  return { source_ip: ip || null, user_agent: userAgent || null };
}

function logReceived(application, { duplicate = false } = {}) {
  if (!application || !application.id) return;
  // eslint-disable-next-line no-console
  console.log(
    "[blessboard-church-registration]",
    JSON.stringify({
      op: "platform_church_registration_received",
      applicationId: application.id,
      status: application.status,
      selectedPlan: application.selected_plan || null,
      duplicate: Boolean(duplicate),
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

  try {
    const existing = await repo.findRecentPendingDuplicate(pool, {
      contact_email: data.contact_email,
      church_name: data.church_name,
      windowMinutes: 15,
    });
    if (existing) {
      try {
        logReceived(existing, { duplicate: true });
      } catch {
        /* logging must not block */
      }
      return { ok: true, application: existing, duplicate: true };
    }

    const application = await repo.createApplication(pool, {
      ...data,
      ...clientMetaFromRequest(req),
    });
    try {
      logReceived(application);
    } catch {
      /* logging must not block */
    }
    return { ok: true, application };
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

module.exports = {
  GENERIC_SAVE_ERROR,
  submitPlatformChurchRegistration,
  logRegistrationDbError,
};
