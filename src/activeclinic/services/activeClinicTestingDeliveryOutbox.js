"use strict";

/**
 * Testing-only ActiveClinic delivery outbox for password-reset links.
 * Never enabled for production identity. Public forgot-password stays
 * enumeration-safe; QA retrieves links via a gated diagnostics endpoint.
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
  if (deploymentEnv === "testing" || identityEnv === "testing") {
    return true;
  }
  const code = String(source.PLATFORM_DEPLOYMENT_CODE || "")
    .trim()
    .toLowerCase();
  return code.includes("testing");
}

/**
 * @param {{
 *   templateKey?: string,
 *   recipient?: string|null,
 *   identifierType?: string|null,
 *   identifierNormalized?: string|null,
 *   resetUrl: string,
 *   expiresAt?: Date|string|null,
 *   tokenId?: string|null,
 *   platformIdentityId?: string|null,
 * }} entry
 * @param {NodeJS.ProcessEnv|object} [env]
 */
function recordTestingDelivery(entry, env) {
  if (!isTestingDeliveryEnv(env)) return { recorded: false };
  const resetUrl = String((entry && entry.resetUrl) || "").trim();
  if (!resetUrl) return { recorded: false };
  const row = {
    recordedAt: new Date().toISOString(),
    templateKey: entry.templateKey ? String(entry.templateKey).slice(0, 80) : null,
    recipient: entry.recipient ? String(entry.recipient).slice(0, 320).toLowerCase() : null,
    identifierType: entry.identifierType ? String(entry.identifierType).slice(0, 16) : null,
    identifierNormalized: entry.identifierNormalized
      ? String(entry.identifierNormalized).slice(0, 320)
      : null,
    resetUrl,
    expiresAt: entry.expiresAt ? new Date(entry.expiresAt).toISOString() : null,
    tokenId: entry.tokenId ? String(entry.tokenId) : null,
    platformIdentityId: entry.platformIdentityId
      ? String(entry.platformIdentityId)
      : null,
  };
  entries.unshift(row);
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  return { recorded: true, entry: row };
}

/**
 * @param {{ identifierNormalized?: string, recipient?: string, platformIdentityId?: string }} query
 */
function findLatestTestingDelivery(query) {
  const q = query || {};
  const idNorm = q.identifierNormalized
    ? String(q.identifierNormalized).trim().toLowerCase()
    : "";
  const recipient = q.recipient ? String(q.recipient).trim().toLowerCase() : "";
  const identityId = q.platformIdentityId ? String(q.platformIdentityId).trim() : "";
  return (
    entries.find((e) => {
      if (identityId && e.platformIdentityId === identityId) return true;
      if (idNorm && String(e.identifierNormalized || "").toLowerCase() === idNorm) {
        return true;
      }
      if (recipient && String(e.recipient || "").toLowerCase() === recipient) {
        return true;
      }
      return false;
    }) || null
  );
}

function listTestingDeliveries(limit) {
  const n = Math.min(Math.max(Number(limit) || 20, 1), 100);
  return entries.slice(0, n);
}

function clearTestingDeliveries() {
  entries.length = 0;
}

module.exports = {
  isTestingDeliveryEnv,
  recordTestingDelivery,
  findLatestTestingDelivery,
  listTestingDeliveries,
  clearTestingDeliveries,
};
