"use strict";

/**
 * QA-safe verification delivery outbox (testing only).
 * Never records codes when DEPLOYMENT_ENV/DATABASE_IDENTITY_ENV is production.
 * Production logs must never include OTP/codes — this module refuses to store them there.
 */

const MAX_ENTRIES = 200;

/** @type {Array<object>} */
const entries = [];

function isTestingDeliveryEnv(env) {
  const source = env && typeof env === "object" ? env : process.env;
  const deploymentEnv = String(source.DEPLOYMENT_ENV || "")
    .trim()
    .toLowerCase();
  const identityEnv = String(source.DATABASE_IDENTITY_ENV || "")
    .trim()
    .toLowerCase();
  if (deploymentEnv === "production" || identityEnv === "production") {
    return false;
  }
  if (deploymentEnv === "testing" || identityEnv === "testing" || deploymentEnv === "test") {
    return true;
  }
  if (String(source.NODE_ENV || "").trim().toLowerCase() === "test") {
    return true;
  }
  const code = String(source.PLATFORM_DEPLOYMENT_CODE || "")
    .trim()
    .toLowerCase();
  return code.includes("testing") || code.includes("v8");
}

/**
 * @param {object} entry
 * @param {NodeJS.ProcessEnv|object} [env]
 */
function recordVerificationDelivery(entry, env) {
  if (!isTestingDeliveryEnv(env)) {
    return { recorded: false, reason: "non_testing_environment" };
  }
  const code = String((entry && entry.code) || "").trim();
  const challengeId = entry && entry.challengeId ? String(entry.challengeId) : "";
  if (!code || !challengeId) {
    return { recorded: false, reason: "missing_fields" };
  }
  const row = {
    recordedAt: new Date().toISOString(),
    challengeId,
    channel: entry.channel ? String(entry.channel).slice(0, 16) : null,
    productKey: entry.productKey ? String(entry.productKey).slice(0, 32) : null,
    subjectKind: entry.subjectKind ? String(entry.subjectKind).slice(0, 32) : null,
    subjectId: entry.subjectId ? String(entry.subjectId) : null,
    identifierNormalized: entry.identifierNormalized
      ? String(entry.identifierNormalized).slice(0, 320)
      : null,
    // Intentionally only available via explicit testing peek — never logged by callers.
    code,
    expiresAt: entry.expiresAt ? new Date(entry.expiresAt).toISOString() : null,
  };
  entries.unshift(row);
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  return { recorded: true, entry: { ...row, code: undefined }, hasCode: true };
}

function peekVerificationCode(challengeId) {
  const id = String(challengeId || "");
  const row = entries.find((e) => e.challengeId === id);
  return row ? row.code : null;
}

function findLatestVerificationDelivery(query) {
  const q = query || {};
  const challengeId = q.challengeId ? String(q.challengeId) : "";
  const subjectId = q.subjectId ? String(q.subjectId) : "";
  const identifier = q.identifierNormalized
    ? String(q.identifierNormalized).trim().toLowerCase()
    : "";
  return (
    entries.find((e) => {
      if (challengeId && e.challengeId === challengeId) return true;
      if (subjectId && e.subjectId === subjectId) return true;
      if (
        identifier &&
        String(e.identifierNormalized || "").toLowerCase() === identifier
      ) {
        return true;
      }
      return false;
    }) || null
  );
}

function clearVerificationDeliveries() {
  entries.length = 0;
}

module.exports = {
  isTestingDeliveryEnv,
  recordVerificationDelivery,
  peekVerificationCode,
  findLatestVerificationDelivery,
  clearVerificationDeliveries,
};
