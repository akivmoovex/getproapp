"use strict";

/**
 * Testing-only password-recovery delivery outbox (shared BB + AC).
 * Never enabled for production identity. Public forgot-password stays
 * enumeration-safe; QA retrieves links via gated diagnostics endpoints.
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
 *   productKey?: string|null,
 *   recipient?: string|null,
 *   identifierType?: string|null,
 *   identifierNormalized?: string|null,
 *   resetUrl: string,
 *   expiresAt?: Date|string|null,
 *   tokenId?: string|null,
 *   platformIdentityId?: string|null,
 *   userId?: string|null,
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
    productKey: entry.productKey ? String(entry.productKey).slice(0, 40) : null,
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
    userId: entry.userId ? String(entry.userId) : null,
  };
  entries.unshift(row);
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  return { recorded: true, entry: row };
}

/**
 * @param {{
 *   identifierNormalized?: string,
 *   recipient?: string,
 *   platformIdentityId?: string,
 *   userId?: string,
 *   productKey?: string,
 * }} query
 */
function findLatestTestingDelivery(query) {
  const q = query || {};
  const idNorm = q.identifierNormalized
    ? String(q.identifierNormalized).trim().toLowerCase()
    : "";
  const recipient = q.recipient ? String(q.recipient).trim().toLowerCase() : "";
  const identityId = q.platformIdentityId ? String(q.platformIdentityId).trim() : "";
  const userId = q.userId ? String(q.userId).trim() : "";
  const productKey = q.productKey ? String(q.productKey).trim().toLowerCase() : "";
  return (
    entries.find((e) => {
      if (productKey && String(e.productKey || "").toLowerCase() !== productKey) {
        return false;
      }
      if (identityId && e.platformIdentityId === identityId) return true;
      if (userId && e.userId === userId) return true;
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
