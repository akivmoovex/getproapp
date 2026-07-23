"use strict";

/**
 * BlessBoard V5 registration phone-verification business rules (Phase2 Prompt 027).
 * Records attempts, loads history, and derives a read-only summary.
 * Does not open DB connections, write audits, mutate applications, or touch support contacts.
 */

const defaultRepository = require("../repositories/platformChurchRegistrationRepository");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const OUTCOMES = Object.freeze([
  "answered",
  "no_answer",
  "unavailable",
  "wrong_number",
  "callback_requested",
  "information_inconsistent",
]);

const CHECK_STATUSES = Object.freeze(["not_checked", "confirmed", "not_confirmed"]);

const VERIFICATION_RESULTS = Object.freeze(["pending", "verified", "failed"]);

const SUMMARY_STATUSES = Object.freeze({
  NOT_CHECKED: "not_checked",
  PENDING: "pending",
  VERIFIED: "verified",
  FAILED: "failed",
});

const FINAL_RESULTS = Object.freeze(new Set(["verified", "failed"]));

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
 * @param {number} max
 * @returns {string|null}
 */
function optionalTrimmed(value, max) {
  const s = trimStr(value);
  if (!s) return null;
  return max != null ? s.slice(0, max) : s;
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
  };
}

/**
 * Business validation for one attempt (beyond repository allowlists).
 * @param {{
 *   outcome: string,
 *   applicantIdentityStatus: string,
 *   applicantAuthorityStatus: string,
 *   verificationResult: string,
 *   verificationReason: string|null,
 * }} fields
 */
function assertAttemptBusinessRules(fields) {
  const {
    outcome,
    applicantIdentityStatus,
    applicantAuthorityStatus,
    verificationResult,
    verificationReason,
  } = fields;

  if (
    (verificationResult === "verified" || verificationResult === "failed") &&
    !verificationReason
  ) {
    const err = new Error("verification_reason_required");
    err.code = "verification_reason_required";
    throw err;
  }

  if (verificationResult === "verified") {
    if (outcome !== "answered") {
      const err = new Error("verified_requires_answered_outcome");
      err.code = "verified_requires_answered_outcome";
      throw err;
    }
    if (applicantIdentityStatus !== "confirmed") {
      const err = new Error("verified_requires_identity_confirmed");
      err.code = "verified_requires_identity_confirmed";
      throw err;
    }
  }

  if (applicantAuthorityStatus === "confirmed" && outcome !== "answered") {
    const err = new Error("authority_confirmed_requires_answered_outcome");
    err.code = "authority_confirmed_requires_answered_outcome";
    throw err;
  }
}

/**
 * Record one append-only phone-verification attempt.
 * @param {object} input
 * @param {{ platformAdminUserId: string }} context
 * @param {{ repository?: object, client?: object, db?: object, now?: Function }} [deps]
 * @returns {Promise<object>} created attempt row
 */
async function recordPhoneVerificationAttempt(input, context, deps) {
  const { repository, client } = resolveDeps(deps);
  const src = input && typeof input === "object" ? input : {};
  const ctx = context && typeof context === "object" ? context : {};

  const applicationId = trimStr(src.applicationId);
  if (!applicationId) {
    const err = new Error("application_id_required");
    err.code = "application_id_required";
    throw err;
  }
  if (!UUID_RE.test(applicationId)) {
    const err = new Error("invalid_application_id");
    err.code = "invalid_application_id";
    throw err;
  }

  const platformAdminUserId = trimStr(ctx.platformAdminUserId);
  if (!platformAdminUserId) {
    const err = new Error("platform_admin_user_id_required");
    err.code = "platform_admin_user_id_required";
    throw err;
  }
  if (!UUID_RE.test(platformAdminUserId)) {
    const err = new Error("invalid_platform_admin_user_id");
    err.code = "invalid_platform_admin_user_id";
    throw err;
  }

  const phoneNumberCalled = trimStr(src.phoneNumberCalled);
  if (!phoneNumberCalled) {
    const err = new Error("phone_number_called_required");
    err.code = "phone_number_called_required";
    throw err;
  }

  const attemptedAt = parseDate(src.attemptedAt);
  if (!attemptedAt) {
    const err = new Error("attempted_at_required");
    err.code = "attempted_at_required";
    throw err;
  }

  const outcome = trimStr(src.outcome).toLowerCase();
  if (!OUTCOMES.includes(outcome)) {
    const err = new Error("invalid_phone_verification_outcome");
    err.code = "invalid_phone_verification_outcome";
    throw err;
  }

  const applicantIdentityStatus = trimStr(
    src.applicantIdentityStatus != null && trimStr(src.applicantIdentityStatus) !== ""
      ? src.applicantIdentityStatus
      : "not_checked"
  ).toLowerCase();
  if (!CHECK_STATUSES.includes(applicantIdentityStatus)) {
    const err = new Error("invalid_applicant_identity_status");
    err.code = "invalid_applicant_identity_status";
    throw err;
  }

  const applicantAuthorityStatus = trimStr(
    src.applicantAuthorityStatus != null && trimStr(src.applicantAuthorityStatus) !== ""
      ? src.applicantAuthorityStatus
      : "not_checked"
  ).toLowerCase();
  if (!CHECK_STATUSES.includes(applicantAuthorityStatus)) {
    const err = new Error("invalid_applicant_authority_status");
    err.code = "invalid_applicant_authority_status";
    throw err;
  }

  const verificationResult = trimStr(
    src.verificationResult != null && trimStr(src.verificationResult) !== ""
      ? src.verificationResult
      : "pending"
  ).toLowerCase();
  if (!VERIFICATION_RESULTS.includes(verificationResult)) {
    const err = new Error("invalid_verification_result");
    err.code = "invalid_verification_result";
    throw err;
  }

  const verificationReason = optionalTrimmed(src.verificationReason, 1000);
  const notes = optionalTrimmed(src.notes, 5000);
  const contactPersonName = optionalTrimmed(src.contactPersonName, 200);
  const contactPersonRole = optionalTrimmed(src.contactPersonRole, 120);
  const followUpAt = parseDate(src.followUpAt);
  const country = src.country != null ? trimStr(src.country) || null : null;

  assertAttemptBusinessRules({
    outcome,
    applicantIdentityStatus,
    applicantAuthorityStatus,
    verificationResult,
    verificationReason,
  });

  if (!client) {
    const err = new Error("db_client_required");
    err.code = "db_client_required";
    throw err;
  }

  return repository.createPhoneVerificationAttempt(client, {
    applicationId,
    phoneNumberCalled,
    country,
    contactPersonName,
    contactPersonRole,
    attemptedAt,
    outcome,
    applicantIdentityStatus,
    applicantAuthorityStatus,
    verificationResult,
    verificationReason,
    notes,
    followUpAt,
    createdByUserId: platformAdminUserId,
  });
}

/**
 * Load phone-verification attempts for an application (newest first).
 * @param {string} applicationId
 * @param {{ repository?: object, client?: object, db?: object, limit?: number }} [deps]
 * @returns {Promise<object[]>}
 */
async function getPhoneVerificationHistory(applicationId, deps) {
  const { repository, client } = resolveDeps(deps);
  const id = trimStr(applicationId);
  if (!id) {
    const err = new Error("application_id_required");
    err.code = "application_id_required";
    throw err;
  }
  if (!UUID_RE.test(id)) {
    const err = new Error("invalid_application_id");
    err.code = "invalid_application_id";
    throw err;
  }
  if (!client) {
    const err = new Error("db_client_required");
    err.code = "db_client_required";
    throw err;
  }

  const opts = {};
  if (deps && deps.limit != null) opts.limit = deps.limit;
  const rows = await repository.listPhoneVerificationAttempts(client, id, opts);
  return Array.isArray(rows) ? rows : [];
}

/**
 * @param {object} attempt
 * @returns {string}
 */
function attemptResult(attempt) {
  return trimStr(
    attempt.verification_result != null
      ? attempt.verification_result
      : attempt.verificationResult
  ).toLowerCase();
}

/**
 * @param {object} attempt
 * @returns {string}
 */
function attemptOutcome(attempt) {
  return trimStr(attempt.outcome).toLowerCase();
}

/**
 * @param {object} attempt
 * @returns {string}
 */
function attemptIdentity(attempt) {
  return trimStr(
    attempt.applicant_identity_status != null
      ? attempt.applicant_identity_status
      : attempt.applicantIdentityStatus
  ).toLowerCase();
}

/**
 * @param {object} attempt
 * @returns {string}
 */
function attemptAuthority(attempt) {
  return trimStr(
    attempt.applicant_authority_status != null
      ? attempt.applicant_authority_status
      : attempt.applicantAuthorityStatus
  ).toLowerCase();
}

/**
 * @param {object} attempt
 * @returns {Date|null}
 */
function attemptAttemptedAt(attempt) {
  return parseDate(
    attempt.attempted_at != null ? attempt.attempted_at : attempt.attemptedAt
  );
}

/**
 * @param {object} attempt
 * @returns {Date|null}
 */
function attemptFollowUpAt(attempt) {
  return parseDate(attempt.follow_up_at != null ? attempt.follow_up_at : attempt.followUpAt);
}

/**
 * Sort newest first with stable secondary keys (does not mutate input array).
 * @param {object[]} attempts
 * @returns {object[]}
 */
function sortAttemptsNewestFirst(attempts) {
  return attempts.slice().sort((a, b) => {
    const atA = attemptAttemptedAt(a);
    const atB = attemptAttemptedAt(b);
    const tA = atA ? atA.getTime() : 0;
    const tB = atB ? atB.getTime() : 0;
    if (tB !== tA) return tB - tA;
    const cA = parseDate(a.created_at != null ? a.created_at : a.createdAt);
    const cB = parseDate(b.created_at != null ? b.created_at : b.createdAt);
    const ctA = cA ? cA.getTime() : 0;
    const ctB = cB ? cB.getTime() : 0;
    if (ctB !== ctA) return ctB - ctA;
    const idA = trimStr(a.id);
    const idB = trimStr(b.id);
    if (idA < idB) return 1;
    if (idA > idB) return -1;
    return 0;
  });
}

/**
 * Derive read-only phone-verification summary from attempt rows.
 * Later pending attempts do not erase a prior verified/failed status.
 * @param {unknown} attempts
 * @param {{ now?: Function|Date|string }} [options]
 */
function derivePhoneVerificationSummary(attempts, options) {
  const list = Array.isArray(attempts) ? attempts.filter((a) => a && typeof a === "object") : [];
  const sorted = sortAttemptsNewestFirst(list);
  const nowRaw = options && options.now != null ? options.now : () => new Date();
  const now =
    typeof nowRaw === "function" ? parseDate(nowRaw()) || new Date() : parseDate(nowRaw) || new Date();

  const latestAttempt = sorted.length > 0 ? sorted[0] : null;
  const lastAttemptedAt = latestAttempt ? attemptAttemptedAt(latestAttempt) : null;

  let verificationStatus = SUMMARY_STATUSES.NOT_CHECKED;
  if (sorted.length > 0) {
    verificationStatus = SUMMARY_STATUSES.PENDING;
    for (const attempt of sorted) {
      const result = attemptResult(attempt);
      if (FINAL_RESULTS.has(result)) {
        verificationStatus = result;
        break;
      }
    }
  }

  let answeredAttempts = 0;
  let failedAttempts = 0;
  let applicantContacted = false;
  /** Newest explicit identity/authority status (ignores later not_checked). */
  let latestIdentityStatus = "not_checked";
  let latestAuthorityStatus = "not_checked";
  /** @type {Date|null} */
  let nextFollowUpAt = null;

  for (const attempt of sorted) {
    const outcome = attemptOutcome(attempt);
    if (outcome === "answered") {
      answeredAttempts += 1;
      applicantContacted = true;
    }
    if (attemptResult(attempt) === "failed") {
      failedAttempts += 1;
    }
    if (latestIdentityStatus === "not_checked") {
      const identity = attemptIdentity(attempt);
      if (identity === "confirmed" || identity === "not_confirmed") {
        latestIdentityStatus = identity;
      }
    }
    if (latestAuthorityStatus === "not_checked") {
      const authority = attemptAuthority(attempt);
      if (authority === "confirmed" || authority === "not_confirmed") {
        latestAuthorityStatus = authority;
      }
    }
    const followUp = attemptFollowUpAt(attempt);
    if (followUp && followUp.getTime() > now.getTime()) {
      if (!nextFollowUpAt || followUp.getTime() < nextFollowUpAt.getTime()) {
        nextFollowUpAt = followUp;
      }
    }
  }

  const identityConfirmed = latestIdentityStatus === "confirmed";
  const authorityConfirmed = latestAuthorityStatus === "confirmed";

  return Object.freeze({
    totalAttempts: sorted.length,
    latestAttempt,
    lastAttemptedAt,
    applicantContacted,
    identityConfirmed,
    authorityConfirmed,
    latestIdentityStatus,
    latestAuthorityStatus,
    verificationStatus,
    followUpRequired: nextFollowUpAt != null,
    nextFollowUpAt,
    failedAttempts,
    answeredAttempts,
  });
}

module.exports = {
  OUTCOMES,
  CHECK_STATUSES,
  VERIFICATION_RESULTS,
  SUMMARY_STATUSES,
  recordPhoneVerificationAttempt,
  getPhoneVerificationHistory,
  derivePhoneVerificationSummary,
};
