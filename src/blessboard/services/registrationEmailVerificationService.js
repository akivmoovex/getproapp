"use strict";

/**
 * BlessBoard V5 registration email-verification token service (Phase2 Prompt 034).
 * Creates/consumes hash-only tokens and derives status. Does not send email, open
 * routes, change applicant email, write audits, or touch verification facts.
 */

const defaultRepository = require("../repositories/platformChurchRegistrationRepository");
const {
  generateSessionToken,
  hashSessionToken,
} = require("../../platform/session/sessionToken");
const { normalizeEmail } = require("./createBlessBoardUser");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** User-grade email format (audit-approved for verification tokens). */
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
/** Audit: min interval between token creates per application (60s). */
const RESEND_COOLDOWN_MS = 60 * 1000;

const TOKEN_STATUSES = Object.freeze(["sent", "verified", "expired", "replaced"]);

const SUMMARY_STATUSES = Object.freeze({
  NOT_SENT: "not_sent",
  SENT: "sent",
  VERIFIED: "verified",
  EXPIRED: "expired",
  REPLACED: "replaced",
});

const SAFE_CONSUME_FAILURE = Object.freeze({
  ok: false,
  code: "invalid_token",
  message: "This verification link is invalid or has expired.",
});

/**
 * @param {unknown} value
 * @returns {string}
 */
function trimStr(value) {
  if (value == null) return "";
  return String(value).trim();
}

/**
 * @param {unknown} value
 * @returns {Date|null}
 */
function parseDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {object} [deps]
 */
function resolveDeps(deps) {
  const d = deps && typeof deps === "object" ? deps : {};
  return {
    repository: d.repository || defaultRepository,
    client: d.client != null ? d.client : d.db != null ? d.db : null,
    now: typeof d.now === "function" ? d.now : () => new Date(),
    generateToken:
      typeof d.generateToken === "function" ? d.generateToken : generateSessionToken,
    hashToken: typeof d.hashToken === "function" ? d.hashToken : hashSessionToken,
  };
}

/**
 * @param {object} row
 * @returns {object}
 */
function publicTokenRecord(row) {
  if (!row || typeof row !== "object") return null;
  return {
    id: row.id,
    applicationId: row.application_id != null ? row.application_id : row.applicationId,
    email: row.email,
    emailNormalized:
      row.email_normalized != null ? row.email_normalized : row.emailNormalized,
    status: row.status,
    sentAt: row.sent_at != null ? row.sent_at : row.sentAt,
    expiresAt: row.expires_at != null ? row.expires_at : row.expiresAt,
    verifiedAt: row.verified_at != null ? row.verified_at : row.verifiedAt,
    invalidatedAt:
      row.invalidated_at != null ? row.invalidated_at : row.invalidatedAt,
    invalidationReason:
      row.invalidation_reason != null
        ? row.invalidation_reason
        : row.invalidationReason,
    createdByUserId:
      row.created_by_user_id != null
        ? row.created_by_user_id
        : row.createdByUserId,
    createdAt: row.created_at != null ? row.created_at : row.createdAt,
  };
}

/**
 * Validate and normalize email using user-grade rules (audit).
 * @param {unknown} raw
 * @returns {{ ok: true, email: string, emailNormalized: string }|{ ok: false, code: string }}
 */
function normalizeVerificationEmail(raw) {
  const email = trimStr(raw);
  if (!email) return { ok: false, code: "email_required" };
  const emailNormalized = normalizeEmail(email);
  if (
    !emailNormalized ||
    !EMAIL_RE.test(emailNormalized) ||
    emailNormalized.length > 254
  ) {
    return { ok: false, code: "invalid_email" };
  }
  return { ok: true, email: email.slice(0, 254), emailNormalized };
}

/**
 * @param {{ query: Function, connect?: Function }} clientOrPool
 * @param {(client: { query: Function }) => Promise<*>} fn
 */
async function withTransaction(clientOrPool, fn) {
  if (!clientOrPool || typeof clientOrPool.query !== "function") {
    throw Object.assign(new Error("database_required"), { code: "database_required" });
  }
  const ownsClient = typeof clientOrPool.connect === "function";
  const client = ownsClient ? await clientOrPool.connect() : clientOrPool;
  try {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore rollback failure */
      }
      throw err;
    }
  } finally {
    if (ownsClient && client && typeof client.release === "function") {
      client.release();
    }
  }
}

/**
 * Create a verification token (hash stored; plaintext returned once).
 * Invalidates prior active tokens and enforces resend cooldown.
 *
 * @param {{
 *   applicationId: string,
 *   email: string,
 *   createdByUserId?: string|null,
 * }} input
 * @param {{
 *   repository?: object,
 *   client?: { query: Function, connect?: Function },
 *   db?: { query: Function, connect?: Function },
 *   now?: Function,
 *   generateToken?: Function,
 *   hashToken?: Function,
 * }} [deps]
 */
async function createVerificationToken(input, deps) {
  const src = input && typeof input === "object" ? input : {};
  const resolved = resolveDeps(deps);
  const repo = resolved.repository;
  const now = parseDate(resolved.now()) || new Date();

  const applicationId = trimStr(src.applicationId);
  if (!applicationId || !UUID_RE.test(applicationId)) {
    const err = new Error("invalid_application_id");
    err.code = "invalid_application_id";
    throw err;
  }

  const emailNorm = normalizeVerificationEmail(src.email);
  if (!emailNorm.ok) {
    const err = new Error(emailNorm.code);
    err.code = emailNorm.code;
    throw err;
  }

  let createdByUserId =
    src.createdByUserId != null ? trimStr(src.createdByUserId) : "";
  if (createdByUserId === "") createdByUserId = null;
  if (createdByUserId && !UUID_RE.test(createdByUserId)) {
    const err = new Error("invalid_created_by_user_id");
    err.code = "invalid_created_by_user_id";
    throw err;
  }

  if (!resolved.client) {
    const err = new Error("database_required");
    err.code = "database_required";
    throw err;
  }

  const generated = resolved.generateToken();
  const rawToken = generated && generated.rawToken != null ? String(generated.rawToken) : "";
  const tokenHash =
    generated && generated.tokenHash
      ? String(generated.tokenHash).toLowerCase()
      : resolved.hashToken(rawToken);
  if (!rawToken || !tokenHash || tokenHash.length !== 64) {
    const err = new Error("token_generation_failed");
    err.code = "token_generation_failed";
    throw err;
  }

  const sentAt = now;
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS);

  const row = await withTransaction(resolved.client, async (client) => {
    const latest = await repo.findLatestRegistrationEmailVerificationToken(
      client,
      applicationId,
      { forUpdate: true }
    );
    if (latest && String(latest.status) === "sent") {
      const latestSentAt = parseDate(latest.sent_at != null ? latest.sent_at : latest.sentAt);
      if (latestSentAt) {
        const elapsed = now.getTime() - latestSentAt.getTime();
        if (elapsed >= 0 && elapsed < RESEND_COOLDOWN_MS) {
          const err = new Error("resend_cooldown");
          err.code = "resend_cooldown";
          err.retryAfterMs = RESEND_COOLDOWN_MS - elapsed;
          throw err;
        }
      }
    }

    await repo.invalidateActiveRegistrationEmailVerificationTokens(client, applicationId, {
      reason: "superseded",
      invalidatedAt: now,
    });

    return repo.createRegistrationEmailVerificationToken(client, {
      applicationId,
      email: emailNorm.email,
      emailNormalized: emailNorm.emailNormalized,
      tokenHash,
      status: "sent",
      sentAt,
      expiresAt,
      createdByUserId,
    });
  });

  // Plaintext returned once; never attach to stored record.
  return {
    ok: true,
    rawToken,
    token: publicTokenRecord(row),
    expiresAt,
    sentAt,
  };
}

/**
 * Consume a raw verification token exactly once.
 * Returns a generic failure for all invalid cases (no application enumeration).
 *
 * @param {string} rawToken
 * @param {{
 *   repository?: object,
 *   client?: { query: Function, connect?: Function },
 *   db?: { query: Function, connect?: Function },
 *   now?: Function,
 *   hashToken?: Function,
 * }} [deps]
 */
async function consumeVerificationToken(rawToken, deps) {
  const resolved = resolveDeps(deps);
  const repo = resolved.repository;
  const now = parseDate(resolved.now()) || new Date();
  const submitted = trimStr(rawToken);

  if (!submitted || submitted.length < 16 || submitted.length > 256) {
    return { ...SAFE_CONSUME_FAILURE };
  }

  if (!resolved.client) {
    return { ...SAFE_CONSUME_FAILURE };
  }

  const tokenHash = String(resolved.hashToken(submitted)).toLowerCase();
  if (!tokenHash || tokenHash.length !== 64) {
    return { ...SAFE_CONSUME_FAILURE };
  }

  try {
    return await withTransaction(resolved.client, async (client) => {
      const row = await repo.findRegistrationEmailVerificationTokenByHash(
        client,
        tokenHash,
        { forUpdate: true }
      );
      if (!row) {
        return { ...SAFE_CONSUME_FAILURE };
      }

      const status = String(row.status || "").toLowerCase();
      if (status === "verified" || status === "replaced" || status === "expired") {
        return { ...SAFE_CONSUME_FAILURE };
      }
      if (status !== "sent") {
        return { ...SAFE_CONSUME_FAILURE };
      }

      const expiresAt = parseDate(row.expires_at != null ? row.expires_at : row.expiresAt);
      if (!expiresAt || expiresAt.getTime() <= now.getTime()) {
        return { ...SAFE_CONSUME_FAILURE };
      }

      const verified = await repo.markRegistrationEmailVerificationTokenVerified(
        client,
        row.id,
        { verifiedAt: now }
      );
      if (!verified) {
        return { ...SAFE_CONSUME_FAILURE };
      }

      return {
        ok: true,
        code: "verified",
        token: publicTokenRecord(verified),
      };
    });
  } catch {
    return { ...SAFE_CONSUME_FAILURE };
  }
}

/**
 * Derive application email-verification status from the latest token row.
 *
 * @param {string} applicationId
 * @param {{
 *   repository?: object,
 *   client?: { query: Function },
 *   db?: { query: Function },
 *   now?: Function,
 * }} [deps]
 */
async function getVerificationStatus(applicationId, deps) {
  const resolved = resolveDeps(deps);
  const repo = resolved.repository;
  const now = parseDate(resolved.now()) || new Date();
  const id = trimStr(applicationId);

  if (!id || !UUID_RE.test(id)) {
    return {
      status: SUMMARY_STATUSES.NOT_SENT,
      token: null,
    };
  }

  if (!resolved.client) {
    return {
      status: SUMMARY_STATUSES.NOT_SENT,
      token: null,
    };
  }

  const latest = await repo.findLatestRegistrationEmailVerificationToken(
    resolved.client,
    id
  );
  if (!latest) {
    return {
      status: SUMMARY_STATUSES.NOT_SENT,
      token: null,
    };
  }

  const record = publicTokenRecord(latest);
  const status = String(latest.status || "").toLowerCase();

  if (status === "verified") {
    return { status: SUMMARY_STATUSES.VERIFIED, token: record };
  }
  if (status === "replaced") {
    return { status: SUMMARY_STATUSES.REPLACED, token: record };
  }
  if (status === "expired") {
    return { status: SUMMARY_STATUSES.EXPIRED, token: record };
  }
  if (status === "sent") {
    const expiresAt = parseDate(latest.expires_at != null ? latest.expires_at : latest.expiresAt);
    if (!expiresAt || expiresAt.getTime() <= now.getTime()) {
      return { status: SUMMARY_STATUSES.EXPIRED, token: record };
    }
    return { status: SUMMARY_STATUSES.SENT, token: record };
  }

  return { status: SUMMARY_STATUSES.NOT_SENT, token: record };
}

module.exports = {
  TOKEN_TTL_MS,
  RESEND_COOLDOWN_MS,
  TOKEN_STATUSES,
  SUMMARY_STATUSES,
  normalizeVerificationEmail,
  createVerificationToken,
  consumeVerificationToken,
  getVerificationStatus,
};
