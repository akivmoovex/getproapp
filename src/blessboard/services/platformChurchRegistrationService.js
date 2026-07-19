"use strict";

const repo = require("../repositories/platformChurchRegistrationRepository");

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
 * Persist a pending church-registration application (no provisioning).
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
      error: "We could not save your request right now. Please try again shortly.",
    };
  }

  const data = validationResult.data;
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
}

module.exports = {
  submitPlatformChurchRegistration,
};
