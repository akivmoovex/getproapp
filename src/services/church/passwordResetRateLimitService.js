"use strict";

const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const passwordResetRateLimitsRepo = require("../../db/pg/church/passwordResetRateLimitsRepo");
const {
  PASSWORD_RESET_RATE_LIMIT,
  IP_BUCKET_PREFIX,
} = require("../../church/passwordResetRateLimit");
const {
  normalizeLoginIdentifier,
  maskLoginIdentifier,
  truncateMeta,
  requestLoginMeta,
} = require("../../church/loginProtection");

function maskIpPreview(value) {
  const raw = truncateMeta(value, 64);
  if (!raw) return null;
  const octets = raw.split(".");
  if (octets.length === 4) {
    return `${octets[0]}.${octets[1]}.*.*`;
  }
  if (raw.includes(":")) {
    const parts = raw.split(":");
    return parts.length > 2 ? `${parts[0]}:${parts[1]}:…` : raw.slice(0, 24);
  }
  return raw.slice(0, 24);
}

function normalizeResetIdentifier(identifier) {
  return normalizeLoginIdentifier(identifier);
}

function ipBucketKey(ipAddress) {
  const ip = truncateMeta(ipAddress, 64);
  if (!ip) return null;
  return `${IP_BUCKET_PREFIX}${ip}`;
}

function buildContext(req, { requestType, organizationId, branchId, identifier }) {
  const meta = requestLoginMeta(req);
  const identifierNormalized = normalizeResetIdentifier(identifier);
  const ipBucket = ipBucketKey(meta.ip_address);
  return {
    requestType,
    organizationId: organizationId ?? null,
    branchId: branchId ?? null,
    identifier,
    identifierNormalized,
    ipAddress: meta.ip_address,
    userAgent: meta.user_agent,
    ipBucket,
  };
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {object} ctx from buildContext
 */
async function checkPasswordResetRateLimit(pool, ctx) {
  const nowMs = Date.now();
  const { maxPerIdentifierPerHour, maxPerIpPerHour } = PASSWORD_RESET_RATE_LIMIT;

  if (ctx.identifierNormalized) {
    const idRow = await passwordResetRateLimitsRepo.findRecentIdentifierAttempts(
      pool,
      ctx.organizationId,
      ctx.branchId,
      ctx.requestType,
      ctx.identifierNormalized
    );
    if (passwordResetRateLimitsRepo.isCurrentlyBlocked(idRow, nowMs)) {
      return { allowed: false, limitedBy: "identifier_blocked" };
    }
    const idCount = passwordResetRateLimitsRepo.effectiveAttemptCount(idRow, nowMs);
    if (idCount >= maxPerIdentifierPerHour) {
      return { allowed: false, limitedBy: "identifier" };
    }
  }

  if (ctx.ipBucket) {
    const ipRow = await passwordResetRateLimitsRepo.findRecentIpAttempts(
      pool,
      ctx.organizationId,
      ctx.branchId,
      ctx.requestType,
      ctx.ipAddress
    );
    if (passwordResetRateLimitsRepo.isCurrentlyBlocked(ipRow, nowMs)) {
      return { allowed: false, limitedBy: "ip_blocked" };
    }
    const ipCount = passwordResetRateLimitsRepo.effectiveAttemptCount(ipRow, nowMs);
    if (ipCount >= maxPerIpPerHour) {
      return { allowed: false, limitedBy: "ip" };
    }
  }

  return { allowed: true };
}

async function shouldAllowPasswordResetRequest(pool, req, entry) {
  const ctx = buildContext(req, entry);
  const check = await checkPasswordResetRateLimit(pool, ctx);
  return check.allowed;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {object} req
 * @param {object} entry
 */
async function recordPasswordResetSubmission(pool, req, entry) {
  const ctx = buildContext(req, entry);
  const base = {
    organizationId: ctx.organizationId,
    branchId: ctx.branchId,
    requestType: ctx.requestType,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  };

  if (ctx.identifierNormalized) {
    await passwordResetRateLimitsRepo.upsertRateLimitAttempt(pool, {
      ...base,
      identifierNormalized: ctx.identifierNormalized,
    });
  }
  if (ctx.ipBucket) {
    await passwordResetRateLimitsRepo.upsertRateLimitAttempt(pool, {
      ...base,
      identifierNormalized: ctx.ipBucket,
    });
  }
}

async function recordRateLimitBlock(pool, ctx, limitedBy) {
  if (
    (limitedBy === "identifier" || limitedBy === "identifier_blocked") &&
    ctx.identifierNormalized
  ) {
    await passwordResetRateLimitsRepo.markRateLimited(
      pool,
      ctx.organizationId,
      ctx.branchId,
      ctx.requestType,
      ctx.identifierNormalized
    );
  }
  if ((limitedBy === "ip" || limitedBy === "ip_blocked") && ctx.ipBucket) {
    await passwordResetRateLimitsRepo.markRateLimited(
      pool,
      ctx.organizationId,
      ctx.branchId,
      ctx.requestType,
      ctx.ipBucket
    );
  }
}

async function recordRateLimitAudit(pool, ctx) {
  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: ctx.organizationId,
    branch_id: ctx.branchId,
    actor_type: "public",
    actor_id: null,
    action: "password_reset_request_rate_limited",
    entity_type: "password_reset_rate_limit",
    entity_id: null,
    metadata_json: {
      request_type: ctx.requestType,
      organization_id: ctx.organizationId,
      branch_id: ctx.branchId,
      identifier_masked: maskLoginIdentifier(ctx.identifierNormalized),
      ip_preview: maskIpPreview(ctx.ipAddress),
      action_source: "password_reset_rate_limit",
    },
  });
}

/**
 * Returns { allowed: boolean }. When not allowed, block + audit are recorded.
 */
async function gatePasswordResetRequest(pool, req, entry) {
  const ctx = buildContext(req, entry);
  const check = await checkPasswordResetRateLimit(pool, ctx);
  if (check.allowed) {
    return { allowed: true, ctx };
  }
  await recordRateLimitBlock(pool, ctx, check.limitedBy);
  await recordRateLimitAudit(pool, ctx);
  return { allowed: false, ctx, limitedBy: check.limitedBy };
}

module.exports = {
  normalizeResetIdentifier,
  checkPasswordResetRateLimit,
  shouldAllowPasswordResetRequest,
  recordPasswordResetSubmission,
  gatePasswordResetRequest,
  buildContext,
};
