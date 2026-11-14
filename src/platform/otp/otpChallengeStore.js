"use strict";

/**
 * In-memory challenge store. Holds hashes and audit facts only.
 * Persistence is specified in the D14A migration design and is not executed.
 */

function createMemoryOtpStore() {
  const challenges = new Map();
  const buckets = new Map();
  const audits = [];

  return {
    insert(record) {
      const stored = {
        id: record.id,
        productCode: record.productCode,
        organizationId: record.organizationId,
        accountId: record.accountId,
        sessionId: record.sessionId,
        attemptId: record.attemptId,
        purpose: record.purpose,
        action: record.action,
        channel: record.channel,
        identifierHash: record.identifierHash,
        codeHash: record.codeHash,
        contextHash: record.contextHash,
        status: "pending",
        attemptCount: 0,
        maxAttempts: record.maxAttempts,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        lastSentAt: record.createdAt,
        verifiedAt: null,
      };
      if (Object.prototype.hasOwnProperty.call(stored, "code")) {
        throw new Error("otp_plaintext_rejected");
      }
      challenges.set(stored.id, stored);
      return { ...stored };
    },
    findPending(binding) {
      return latest(challenges, binding, { status: "pending" });
    },
    findByAttempt(binding) {
      return latest(challenges, binding, { ignoreOrganization: false });
    },
    update(id, patch) {
      const row = challenges.get(id);
      if (!row) return null;
      if (patch.code != null || patch.otp != null) {
        throw new Error("otp_plaintext_rejected");
      }
      Object.assign(row, patch);
      return { ...row };
    },
    consumeRate(key, now, windowMs) {
      const current = buckets.get(key);
      if (!current || now - current.started >= windowMs) {
        buckets.set(key, { started: now, count: 1 });
        return 1;
      }
      current.count += 1;
      return current.count;
    },
    appendAudit(event) {
      const safe = { ...event };
      delete safe.code;
      delete safe.otp;
      delete safe.codeHash;
      delete safe.otp_code;
      audits.push(safe);
      return safe;
    },
    audits() {
      return audits.map((event) => ({ ...event }));
    },
  };
}

function latest(challenges, binding, options) {
  const opts = options || {};
  let found = null;
  for (const row of challenges.values()) {
    if (opts.status && row.status !== opts.status) continue;
    if (!sameBinding(row, binding)) continue;
    if (!found || row.createdAt > found.createdAt) found = row;
  }
  return found ? { ...found } : null;
}

function sameBinding(row, binding) {
  if (row.productCode !== binding.productCode) return false;
  if (binding.organizationId != null && row.organizationId !== binding.organizationId) return false;
  if (row.accountId !== binding.accountId) return false;
  if (row.purpose !== binding.purpose) return false;
  if (binding.channel != null && row.channel !== binding.channel) return false;
  if (binding.attemptId != null && row.attemptId !== binding.attemptId) return false;
  if (binding.sessionId != null && row.sessionId !== binding.sessionId) return false;
  return true;
}

module.exports = {
  createMemoryOtpStore,
};
