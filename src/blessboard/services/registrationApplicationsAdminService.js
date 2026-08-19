"use strict";

/**
 * Platform-admin registration applications list/detail, follow-up, and risk review actions.
 * Approve calls the canonical provision orchestrator; reject does not provision.
 */

const repo = require("../repositories/platformChurchRegistrationRepository");
const {
  recordAuditEventSafe,
  listOrganizationAuditEvents,
} = require("../../platform/services/auditEventService");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");
const {
  NETWORK_PLAN_CODE,
  validateRequestedOrganizationKey,
  isNetworkPlanSelection,
} = require("./platformChurchRegistrationValidation");
const {
  ALLOWED_PUBLIC_PLAN_CODES,
  planDisplayLabel,
} = require("./registrationPlanMapping");
const {
  provisionRegisteredBlessBoardChurch,
  isProvisioningFailureRetryable,
} = require("./provisionRegisteredBlessBoardChurch");
const {
  RISK_DECISIONS,
  RISK_REASON_CODES,
  filterAllowlistedReasonCodes,
  reasonLabelsForAdmin,
} = require("./registrationRiskDecision");
const {
  QUEUES,
  ACTIONS,
  QUEUE_FILTERS,
  presentRegistrationOperatorView,
  presentOpenAction,
  queueFilterSpec,
} = require("./registrationOperatorPresenter");
const {
  buildRegistrationVerificationFacts,
} = require("./registrationVerificationFacts");
const {
  listDuplicateMatches,
} = require("./registrationDuplicateMatchQueryService");
const {
  buildRegistrationReviewRecommendation,
  CODES: RECOMMENDATION_CODES,
  LABELS: RECOMMENDATION_LABELS,
  TONES: RECOMMENDATION_TONES,
} = require("./registrationReviewRecommendation");
const {
  buildRegistrationApprovalChecklist,
  ITEM_DEFS: APPROVAL_CHECKLIST_ITEM_DEFS,
  STATUSES: APPROVAL_CHECKLIST_STATUSES,
} = require("./registrationApprovalChecklist");
const {
  getPhoneVerificationHistory,
  derivePhoneVerificationSummary,
  SUMMARY_STATUSES: PHONE_VERIFICATION_SUMMARY_STATUSES,
} = require("./registrationPhoneVerificationService");
const {
  getVerificationStatus: getRegistrationEmailVerificationStatus,
  SUMMARY_STATUSES: EMAIL_VERIFICATION_SUMMARY_STATUSES,
} = require("./registrationEmailVerificationService");
const {
  getCommunicationHistory,
  recordRejectionNotice,
} = require("./registrationApplicationCommunicationService");
const {
  findOccupyingPhoneMatch,
  findSimilarOrganizationMatch,
} = require("./registrationRiskDecision");
const authRepo = require("../repositories/blessBoardAuthRepository");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  LOOKUP_ERROR: "lookup_error",
  NOT_PROVISIONED: "not_provisioned",
  NOT_ELIGIBLE: "not_eligible",
  ALREADY_PROVISIONED: "already_provisioned",
  PROVISION_FAILED: "provision_failed",
});

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const ALLOWED_LIMITS = Object.freeze([10, 25, 50, 100]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TERMINAL_FOLLOW_UP = Object.freeze(["completed", "unreachable", "not_interested"]);

const EMPTY_VERIFICATION_SUMMARY = Object.freeze({
  passed: 0,
  warning: 0,
  failed: 0,
  notChecked: 0,
  manuallyReviewed: 0,
  supported: 0,
  unsupported: 0,
});

/**
 * Log verification-fact helper failures without exposing internals to clients.
 * @param {string} message
 * @param {unknown} [err]
 * @param {Function} [logFn]
 */
function logVerificationFailure(message, err, logFn) {
  const logger = typeof logFn === "function" ? logFn : console.error;
  try {
    logger("[registration-verification-facts]", message, err && err.message ? err.message : "");
  } catch {
    /* ignore logger failure */
  }
}

/**
 * Safe structured log for registration approval/provision failures.
 * Never logs applicant PII, passwords, or connection strings.
 * @param {object} fields
 * @param {unknown} [err]
 */
function logRegistrationApprovalFailure(fields, err) {
  const pgCode = err && err.code != null ? String(err.code).slice(0, 32) : null;
  const category =
    pgCode === "42703" || pgCode === "42P01"
      ? "schema_mismatch"
      : pgCode
        ? "database_error"
        : "internal_error";
  try {
    // eslint-disable-next-line no-console
    console.error(
      "[platform-admin-registration-approve]",
      JSON.stringify({
        event: "registration_approval_failed",
        applicationId:
          fields && fields.applicationId != null
            ? String(fields.applicationId).slice(0, 36)
            : null,
        failureStage:
          fields && fields.failureStage != null
            ? String(fields.failureStage).slice(0, 64)
            : null,
        failureCategory: category,
        pgCode,
        errorName: err && err.name != null ? String(err.name).slice(0, 80) : null,
        constraint: err && err.constraint != null ? String(err.constraint).slice(0, 120) : null,
        table: err && err.table != null ? String(err.table).slice(0, 120) : null,
        schema: err && err.schema != null ? String(err.schema).slice(0, 64) : null,
        requestId:
          fields && fields.requestId != null ? String(fields.requestId).slice(0, 64) : null,
        safeMessage:
          err && err.message
            ? String(err.message)
                .replace(/postgresql:\/\/[^\s]+/gi, "[redacted]")
                .slice(0, 180)
            : null,
      })
    );
  } catch {
    /* ignore logger failure */
  }
}

function classifyApprovalCaughtError(err) {
  const pgCode = err && err.code != null ? String(err.code) : "";
  if (pgCode === "42703" || pgCode === "42P01") {
    return { status: STATUS.LOOKUP_ERROR, message: "schema_mismatch" };
  }
  return { status: STATUS.LOOKUP_ERROR, message: "lookup_error" };
}

/**
 * Log recommendation helper failures without exposing internals to clients.
 * @param {string} message
 * @param {unknown} [err]
 * @param {Function} [logFn]
 */
function logRecommendationFailure(message, err, logFn) {
  const logger = typeof logFn === "function" ? logFn : console.error;
  try {
    logger(
      "[registration-review-recommendation]",
      message,
      err && err.message ? err.message : ""
    );
  } catch {
    /* ignore logger failure */
  }
}

const SAFE_REVIEW_RECOMMENDATION_FALLBACK = Object.freeze({
  code: RECOMMENDATION_CODES.MANUAL_REVIEW_REQUIRED,
  label: RECOMMENDATION_LABELS[RECOMMENDATION_CODES.MANUAL_REVIEW_REQUIRED] || "Manual review required",
  tone: RECOMMENDATION_TONES[RECOMMENDATION_CODES.MANUAL_REVIEW_REQUIRED] || "warn",
  explanation:
    "Advisory recommendation could not be calculated. Manual review is required. This is an advisory recommendation and does not change the current BlessBoard approval gate.",
  reasons: Object.freeze([
    Object.freeze({
      factKey: "verification",
      status: "not_checked",
      message: "Recommendation calculation failed; defaulted to manual review.",
    }),
  ]),
  blockingFacts: Object.freeze([]),
  warningFacts: Object.freeze([]),
  calculatedAt: null,
  advisory: true,
});

/**
 * Build a safe advisory recommendation object for the detail view model.
 * Never throws; never mutates verification; never accepts client recommendation input.
 *
 * @param {{ facts?: object[], summary?: object, checkedAt?: string|null }|null|undefined} verification
 * @param {{
 *   buildRegistrationReviewRecommendation?: Function,
 *   logRecommendationError?: Function,
 *   now?: Date|string,
 * }} [options]
 */
function loadRegistrationReviewRecommendationForDetail(verification, options = {}) {
  const buildRecommendation =
    typeof options.buildRegistrationReviewRecommendation === "function"
      ? options.buildRegistrationReviewRecommendation
      : buildRegistrationReviewRecommendation;
  const logFn = options.logRecommendationError;

  try {
    const input = { verification };
    if (options.now != null) input.now = options.now;
    const raw = buildRecommendation(input);
    if (!raw || typeof raw !== "object") {
      throw new Error("recommendation_empty");
    }
    return {
      code: String(raw.code || RECOMMENDATION_CODES.MANUAL_REVIEW_REQUIRED),
      label: String(
        raw.label ||
          RECOMMENDATION_LABELS[RECOMMENDATION_CODES.MANUAL_REVIEW_REQUIRED] ||
          "Manual review required"
      ),
      tone: String(raw.tone || "warn"),
      explanation: String(raw.explanation || ""),
      reasons: Array.isArray(raw.reasons) ? raw.reasons : [],
      blockingFacts: Array.isArray(raw.blockingFacts) ? raw.blockingFacts : [],
      warningFacts: Array.isArray(raw.warningFacts) ? raw.warningFacts : [],
      calculatedAt: raw.calculatedAt != null ? String(raw.calculatedAt) : null,
      advisory: true,
    };
  } catch (err) {
    logRecommendationFailure("recommendation build failed; using safe fallback", err, logFn);
    return {
      ...SAFE_REVIEW_RECOMMENDATION_FALLBACK,
      reasons: SAFE_REVIEW_RECOMMENDATION_FALLBACK.reasons.map((r) => ({ ...r })),
      blockingFacts: [],
      warningFacts: [],
      calculatedAt:
        options.now != null ? new Date(options.now).toISOString() : new Date().toISOString(),
      advisory: true,
    };
  }
}

/**
 * Log checklist helper failures without exposing internals to clients.
 * @param {string} message
 * @param {unknown} [err]
 * @param {Function} [logFn]
 */
function logChecklistFailure(message, err, logFn) {
  const logger = typeof logFn === "function" ? logFn : console.error;
  try {
    logger(
      "[registration-approval-checklist]",
      message,
      err && err.message ? err.message : ""
    );
  } catch {
    /* ignore logger failure */
  }
}

/**
 * Log phone-verification history helper failures without exposing internals to clients.
 * @param {string} message
 * @param {unknown} [err]
 * @param {Function} [logFn]
 */
function logPhoneVerificationFailure(message, err, logFn) {
  const logger = typeof logFn === "function" ? logFn : console.error;
  try {
    logger(
      "[registration-phone-verification]",
      message,
      err && err.message ? err.message : ""
    );
  } catch {
    /* ignore logger failure */
  }
}

const SAFE_PHONE_VERIFICATION_SUMMARY = Object.freeze({
  totalAttempts: 0,
  latestAttempt: null,
  lastAttemptedAt: null,
  applicantContacted: false,
  identityConfirmed: false,
  authorityConfirmed: false,
  latestIdentityStatus: "not_checked",
  latestAuthorityStatus: "not_checked",
  verificationStatus: PHONE_VERIFICATION_SUMMARY_STATUSES.NOT_CHECKED,
  followUpRequired: false,
  nextFollowUpAt: null,
  failedAttempts: 0,
  answeredAttempts: 0,
});

/**
 * Conservative phone-verification payload when history load fails.
 * Detail page stays available; raw DB errors are not exposed.
 */
function buildSafePhoneVerificationUnavailable() {
  return {
    attempts: [],
    summary: { ...SAFE_PHONE_VERIFICATION_SUMMARY },
    unavailable: true,
  };
}

/**
 * Log email-verification status helper failures without exposing internals to clients.
 * @param {string} message
 * @param {unknown} [err]
 * @param {Function} [logFn]
 */
function logEmailVerificationFailure(message, err, logFn) {
  const logger = typeof logFn === "function" ? logFn : console.error;
  try {
    logger(
      "[registration-email-verification]",
      message,
      err && err.message ? err.message : ""
    );
  } catch {
    /* ignore logger failure */
  }
}

/**
 * Conservative email-verification payload when status load fails.
 * Detail page stays available; raw DB errors and tokens are not exposed.
 */
function buildSafeEmailVerificationUnavailable() {
  return {
    status: EMAIL_VERIFICATION_SUMMARY_STATUSES.NOT_SENT,
    email: null,
    sentAt: null,
    expiresAt: null,
    verifiedAt: null,
    invalidatedAt: null,
    unavailable: true,
  };
}

const SAFE_COMMUNICATIONS_SUMMARY = Object.freeze({
  total: 0,
  internalNotes: 0,
  informationRequests: 0,
  applicantMessages: 0,
  rejectionNotices: 0,
  sendingUnavailable: 0,
  failed: 0,
  latestCommunicationAt: null,
});

/**
 * Empty communications view-model (history available, nothing recorded).
 * @returns {{ items: object[], summary: object, unavailable: false }}
 */
function buildEmptyCommunicationsForDetail() {
  return {
    items: [],
    summary: { ...SAFE_COMMUNICATIONS_SUMMARY },
    unavailable: false,
  };
}

/**
 * Conservative communications payload when history load fails.
 * Detail page stays available; raw DB/provider errors are not exposed.
 * @returns {{ items: object[], summary: object, unavailable: true }}
 */
function buildSafeCommunicationsUnavailable() {
  return {
    items: [],
    summary: { ...SAFE_COMMUNICATIONS_SUMMARY },
    unavailable: true,
  };
}

/**
 * Log communication-history load failures without exposing internals to clients.
 * @param {string} message
 * @param {unknown} [err]
 * @param {Function} [logFn]
 */
function logCommunicationsFailure(message, err, logFn) {
  const logger = typeof logFn === "function" ? logFn : console.error;
  try {
    logger(
      "[registration-communications]",
      message,
      err && err.message ? err.message : ""
    );
  } catch {
    /* ignore logger failure */
  }
}

/**
 * Present a single communication for the detail view (no admin profile fields).
 * @param {object} item
 * @returns {object}
 */
function mapCommunicationItemForDetail(item) {
  const src = item && typeof item === "object" ? item : {};
  const labels =
    src.labels && typeof src.labels === "object"
      ? {
          communicationType:
            src.labels.communicationType != null
              ? String(src.labels.communicationType)
              : null,
          channel: src.labels.channel != null ? String(src.labels.channel) : null,
          direction: src.labels.direction != null ? String(src.labels.direction) : null,
          deliveryStatus:
            src.labels.deliveryStatus != null ? String(src.labels.deliveryStatus) : null,
          requestCategory:
            src.labels.requestCategory != null ? String(src.labels.requestCategory) : null,
        }
      : {
          communicationType: null,
          channel: null,
          direction: null,
          deliveryStatus: null,
          requestCategory: null,
        };
  return {
    id: src.id != null ? String(src.id) : null,
    applicationId: src.applicationId != null ? String(src.applicationId) : null,
    communicationType:
      src.communicationType != null ? String(src.communicationType) : "",
    channel: src.channel != null ? String(src.channel) : "",
    direction: src.direction != null ? String(src.direction) : "",
    recipient: src.recipient != null ? String(src.recipient) : null,
    subject: src.subject != null ? String(src.subject) : null,
    applicantMessage: src.applicantMessage != null ? String(src.applicantMessage) : null,
    internalNote: src.internalNote != null ? String(src.internalNote) : null,
    requestCategory: src.requestCategory != null ? String(src.requestCategory) : null,
    requestedFields: Array.isArray(src.requestedFields) ? src.requestedFields.slice() : [],
    requestedDocuments: Array.isArray(src.requestedDocuments)
      ? src.requestedDocuments.slice()
      : [],
    responseDueAt: src.responseDueAt || null,
    deliveryStatus: src.deliveryStatus != null ? String(src.deliveryStatus) : "",
    deliveryErrorCode:
      src.deliveryErrorCode != null ? String(src.deliveryErrorCode) : null,
    createdByUserId: src.createdByUserId != null ? String(src.createdByUserId) : null,
    createdAt: src.createdAt || null,
    labels,
  };
}

/**
 * Sort communications newest first (createdAt, then id).
 * @param {object[]} items
 * @returns {object[]}
 */
function sortCommunicationsNewestFirst(items) {
  return items.slice().sort((a, b) => {
    const ta = a && a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b && b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (tb !== ta) return tb - ta;
    const idA = a && a.id != null ? String(a.id) : "";
    const idB = b && b.id != null ? String(b.id) : "";
    if (idA === idB) return 0;
    return idA < idB ? 1 : -1;
  });
}

/**
 * Derive summary counts from presented communication items.
 * @param {object[]} items
 * @returns {object}
 */
function summarizeCommunicationsForDetail(items) {
  const list = Array.isArray(items) ? items : [];
  let internalNotes = 0;
  let informationRequests = 0;
  let applicantMessages = 0;
  let rejectionNotices = 0;
  let sendingUnavailable = 0;
  let failed = 0;

  for (const item of list) {
    const type =
      item && item.communicationType != null
        ? String(item.communicationType)
        : "";
    if (type === "internal_note") internalNotes += 1;
    else if (type === "information_request") informationRequests += 1;
    else if (type === "applicant_message") applicantMessages += 1;
    else if (type === "rejection_notice") rejectionNotices += 1;

    const delivery =
      item && item.deliveryStatus != null ? String(item.deliveryStatus) : "";
    if (delivery === "sending_unavailable") sendingUnavailable += 1;
    else if (delivery === "failed") failed += 1;
  }

  const latest = list.length > 0 ? list[0] : null;
  return {
    total: list.length,
    internalNotes,
    informationRequests,
    applicantMessages,
    rejectionNotices,
    sendingUnavailable,
    failed,
    latestCommunicationAt: latest && latest.createdAt ? latest.createdAt : null,
  };
}

/**
 * Load communication history for the detail view model.
 * Never throws; never mutates the application; never accepts client communications input.
 * Calls getCommunicationHistory at most once. Does not expose administrator email/display names.
 *
 * @param {{ query: Function }} db
 * @param {string} applicationId
 * @param {{
 *   getCommunicationHistory?: Function,
 *   logCommunicationsError?: Function,
 *   communicationRepository?: object,
 *   communicationsLimit?: number,
 * }} [options]
 */
async function loadRegistrationCommunicationsForDetail(db, applicationId, options = {}) {
  const getHistory =
    typeof options.getCommunicationHistory === "function"
      ? options.getCommunicationHistory
      : getCommunicationHistory;
  const logFn = options.logCommunicationsError;

  try {
    const historyDeps = {
      client: db,
    };
    if (options.communicationRepository) {
      historyDeps.repository = options.communicationRepository;
    }
    const historyOpts = {};
    if (options.communicationsLimit != null) {
      historyOpts.limit = options.communicationsLimit;
    }
    const raw = await getHistory(applicationId, historyOpts, historyDeps);
    const list = Array.isArray(raw && raw.communications) ? raw.communications : [];
    const items = sortCommunicationsNewestFirst(list.map(mapCommunicationItemForDetail));
    return {
      items,
      summary: summarizeCommunicationsForDetail(items),
      unavailable: false,
    };
  } catch (err) {
    logCommunicationsFailure(
      "communication history load failed; using safe unavailable fallback",
      err,
      logFn
    );
    return buildSafeCommunicationsUnavailable();
  }
}

/**
 * Map getVerificationStatus result to a safe detail payload (no hashes / plaintext).
 * @param {{ status?: string, token?: object|null }} result
 */
function mapEmailVerificationForDetail(result) {
  const token = result && result.token && typeof result.token === "object" ? result.token : null;
  const status =
    result && result.status != null
      ? String(result.status)
      : EMAIL_VERIFICATION_SUMMARY_STATUSES.NOT_SENT;
  return {
    status,
    email: token && token.email != null ? String(token.email) : null,
    sentAt: token && token.sentAt != null ? token.sentAt : null,
    expiresAt: token && token.expiresAt != null ? token.expiresAt : null,
    verifiedAt: token && token.verifiedAt != null ? token.verifiedAt : null,
    invalidatedAt: token && token.invalidatedAt != null ? token.invalidatedAt : null,
  };
}

/**
 * Load email-verification status for the detail view model.
 * Never throws; never mutates the application; never accepts client emailVerification input.
 * Never exposes token hashes or plaintext tokens.
 *
 * @param {{ query: Function }} db
 * @param {string} applicationId
 * @param {{
 *   getRegistrationEmailVerificationStatus?: Function,
 *   logEmailVerificationError?: Function,
 *   emailVerificationRepository?: object,
 *   now?: Date|string|Function,
 * }} [options]
 */
async function loadRegistrationEmailVerificationForDetail(db, applicationId, options = {}) {
  const getStatus =
    typeof options.getRegistrationEmailVerificationStatus === "function"
      ? options.getRegistrationEmailVerificationStatus
      : getRegistrationEmailVerificationStatus;
  const logFn = options.logEmailVerificationError;

  try {
    const statusDeps = {
      client: db,
    };
    if (options.emailVerificationRepository) {
      statusDeps.repository = options.emailVerificationRepository;
    }
    if (options.now != null) {
      statusDeps.now =
        typeof options.now === "function" ? options.now : () => options.now;
    }
    const raw = await getStatus(applicationId, statusDeps);
    return mapEmailVerificationForDetail(raw && typeof raw === "object" ? raw : {});
  } catch (err) {
    logEmailVerificationFailure(
      "email verification status load failed; using safe unavailable fallback",
      err,
      logFn
    );
    return buildSafeEmailVerificationUnavailable();
  }
}

/**
 * Load phone-verification history + derived summary for the detail view model.
 * Never throws; never mutates the application; never accepts client phoneVerification input.
 *
 * @param {{ query: Function }} db
 * @param {string} applicationId
 * @param {{
 *   getPhoneVerificationHistory?: Function,
 *   derivePhoneVerificationSummary?: Function,
 *   logPhoneVerificationError?: Function,
 *   phoneVerificationRepository?: object,
 *   now?: Date|string|Function,
 * }} [options]
 */
async function loadRegistrationPhoneVerificationForDetail(db, applicationId, options = {}) {
  const getHistory =
    typeof options.getPhoneVerificationHistory === "function"
      ? options.getPhoneVerificationHistory
      : getPhoneVerificationHistory;
  const deriveSummary =
    typeof options.derivePhoneVerificationSummary === "function"
      ? options.derivePhoneVerificationSummary
      : derivePhoneVerificationSummary;
  const logFn = options.logPhoneVerificationError;

  try {
    const historyDeps = {
      client: db,
    };
    if (options.phoneVerificationRepository) {
      historyDeps.repository = options.phoneVerificationRepository;
    }
    const attempts = await getHistory(applicationId, historyDeps);
    const list = Array.isArray(attempts) ? attempts : [];
    const summaryOpts = {};
    if (options.now != null) summaryOpts.now = options.now;
    const summary = deriveSummary(list, summaryOpts);
    return {
      attempts: list,
      summary:
        summary && typeof summary === "object"
          ? summary
          : { ...SAFE_PHONE_VERIFICATION_SUMMARY },
    };
  } catch (err) {
    logPhoneVerificationFailure(
      "phone verification history load failed; using safe unavailable fallback",
      err,
      logFn
    );
    return buildSafePhoneVerificationUnavailable();
  }
}

/**
 * Conservative advisory checklist when derivation fails.
 * All ten items present; none complete; requiredOutstanding = total required.
 * @param {string|null} calculatedAt
 */
function buildSafeApprovalChecklistFallback(calculatedAt) {
  const items = APPROVAL_CHECKLIST_ITEM_DEFS.map((def) => {
    return {
      key: def.key,
      label: def.label,
      status: APPROVAL_CHECKLIST_STATUSES.MANUAL_REVIEW_REQUIRED,
      explanation:
        "Approval checklist could not be calculated. Manual review is required. This advisory checklist does not change the current BlessBoard approval gate.",
      sourceFactKeys: Array.isArray(def.sourceFactKeys) ? [...def.sourceFactKeys] : [],
      supported: true,
      required: Boolean(def.required),
      actionTarget: def.actionTarget == null ? null : String(def.actionTarget),
    };
  });
  const requiredCount = items.filter((i) => i.required).length;
  return {
    items,
    summary: {
      total: items.length,
      complete: 0,
      incomplete: 0,
      warning: 0,
      notAvailable: 0,
      manualReviewRequired: items.length,
      requiredComplete: 0,
      requiredOutstanding: requiredCount,
    },
    calculatedAt,
    advisory: true,
  };
}

/**
 * Build a safe advisory approval checklist for the detail view model.
 * Never throws; never mutates verification/recommendation; never accepts client checklist input.
 *
 * @param {{ facts?: object[], summary?: object, checkedAt?: string|null }|null|undefined} verification
 * @param {object|null|undefined} reviewRecommendation
 * @param {{
 *   buildRegistrationApprovalChecklist?: Function,
 *   logChecklistError?: Function,
 *   now?: Date|string,
 * }} [options]
 */
function loadRegistrationApprovalChecklistForDetail(
  verification,
  reviewRecommendation,
  options = {}
) {
  const buildChecklist =
    typeof options.buildRegistrationApprovalChecklist === "function"
      ? options.buildRegistrationApprovalChecklist
      : buildRegistrationApprovalChecklist;
  const logFn = options.logChecklistError;

  try {
    const input = { verification, reviewRecommendation };
    if (options.now != null) input.now = options.now;
    const raw = buildChecklist(input);
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.items)) {
      throw new Error("checklist_empty");
    }
    return {
      items: raw.items,
      summary: raw.summary && typeof raw.summary === "object" ? raw.summary : {
        total: raw.items.length,
        complete: 0,
        incomplete: 0,
        warning: 0,
        notAvailable: 0,
        manualReviewRequired: 0,
        requiredComplete: 0,
        requiredOutstanding: raw.items.filter((i) => i && i.required).length,
      },
      calculatedAt: raw.calculatedAt != null ? String(raw.calculatedAt) : null,
      advisory: true,
    };
  } catch (err) {
    logChecklistFailure("checklist build failed; using safe fallback", err, logFn);
    const calculatedAt =
      options.now != null ? new Date(options.now).toISOString() : new Date().toISOString();
    return buildSafeApprovalChecklistFallback(calculatedAt);
  }
}

/**
 * Build read-only verification facts for a detail payload.
 * Optional lookup failures degrade to not_checked (service behavior); total build
 * failure returns an empty verification object so the detail page stays usable.
 * Canonical duplicate matches (when available) feed name / strong-identifier /
 * review-evidence facts. Does not run scoring writes or auto approve/reject.
 *
 * @param {{ query: Function }} db
 * @param {object} application
 * @param {object[]} contacts
 * @param {{
 *   buildRegistrationVerificationFacts?: Function,
 *   findOccupyingPhoneMatch?: Function,
 *   findSimilarOrganizationMatch?: Function,
 *   findUserByEmail?: Function,
 *   listDuplicateMatches?: Function,
 *   duplicateMatches?: object,
 *   logVerificationError?: Function,
 *   phoneVerification?: object,
 *   emailVerification?: object,
 * }} [options]
 */
async function loadRegistrationVerificationForDetail(db, application, contacts, options = {}) {
  const buildFacts =
    typeof options.buildRegistrationVerificationFacts === "function"
      ? options.buildRegistrationVerificationFacts
      : buildRegistrationVerificationFacts;
  const logFn = options.logVerificationError;
  const phoneVerification =
    options.phoneVerification && typeof options.phoneVerification === "object"
      ? options.phoneVerification
      : undefined;
  const emailVerification =
    options.emailVerification && typeof options.emailVerification === "object"
      ? options.emailVerification
      : undefined;

  const appId = application && application.id != null ? String(application.id) : "";
  const phoneLookup =
    typeof options.findOccupyingPhoneMatch === "function"
      ? options.findOccupyingPhoneMatch
      : async (phone) => {
          try {
            const hit = await findOccupyingPhoneMatch(db, phone);
            if (hit && appId && String(hit.id) === appId) return null;
            return hit || null;
          } catch (err) {
            logVerificationFailure("phone occupancy lookup failed", err, logFn);
            return undefined;
          }
        };
  const nameLookup =
    typeof options.findSimilarOrganizationMatch === "function"
      ? options.findSimilarOrganizationMatch
      : async (opts) => {
          try {
            return await findSimilarOrganizationMatch(db, {
              churchName: opts && opts.churchName,
              city: opts && opts.city,
              country: opts && opts.country,
              excludeApplicationId: (opts && opts.excludeApplicationId) || appId || null,
              excludeContactEmail: (opts && opts.excludeContactEmail) || null,
            });
          } catch (err) {
            logVerificationFailure("similar organization lookup failed", err, logFn);
            return undefined;
          }
        };
  const emailLookup =
    typeof options.findUserByEmail === "function"
      ? options.findUserByEmail
      : async (email) => {
          try {
            return await authRepo.findUserByEmail(db, email);
          } catch (err) {
            logVerificationFailure("platform user email lookup failed", err, logFn);
            return undefined;
          }
        };

  // Wrap lookups so thrown errors become "no live lookup" (undefined), not page failure.
  const safePhone = async (...args) => {
    try {
      return await phoneLookup(...args);
    } catch (err) {
      logVerificationFailure("phone occupancy lookup failed", err, logFn);
      return undefined;
    }
  };
  const safeName = async (...args) => {
    try {
      return await nameLookup(...args);
    } catch (err) {
      logVerificationFailure("similar organization lookup failed", err, logFn);
      return undefined;
    }
  };
  const safeEmail = async (...args) => {
    try {
      return await emailLookup(...args);
    } catch (err) {
      logVerificationFailure("platform user email lookup failed", err, logFn);
      return undefined;
    }
  };

  let duplicateMatches = options.duplicateMatches;
  if (!duplicateMatches || typeof duplicateMatches !== "object") {
    const listFn =
      typeof options.listDuplicateMatches === "function"
        ? options.listDuplicateMatches
        : listDuplicateMatches;
    try {
      const listed = await listFn(db, appId);
      if (listed && listed.ok) {
        duplicateMatches = {
          available: true,
          unavailable: false,
          matches: Array.isArray(listed.matches) ? listed.matches : [],
        };
      } else if (listed && listed.status === "not_found") {
        duplicateMatches = { available: true, unavailable: false, matches: [] };
      } else if (listed && listed.status === "lookup_error") {
        duplicateMatches = { available: true, unavailable: true, matches: [] };
      } else {
        // Degrade to "no payload" so unit stubs without a match ledger stay honest
        // without inventing an unavailable warning on every detail load.
        duplicateMatches = undefined;
      }
    } catch (err) {
      logVerificationFailure("duplicate match list failed", err, logFn);
      duplicateMatches = undefined;
    }
  }

  try {
    const verification = await buildFacts({
      application,
      contacts: contacts || [],
      phoneVerification,
      emailVerification,
      duplicateMatches,
      findOccupyingPhoneMatch: safePhone,
      findSimilarOrganizationMatch: safeName,
      findUserByEmail: safeEmail,
    });
    return {
      facts: Array.isArray(verification.facts) ? verification.facts : [],
      summary: verification.summary || { ...EMPTY_VERIFICATION_SUMMARY },
      checkedAt: verification.checkedAt || null,
    };
  } catch (err) {
    logVerificationFailure("verification facts build failed; retrying without live lookups", err, logFn);
    try {
      const fallback = await buildFacts({
        application,
        contacts: contacts || [],
        phoneVerification,
        emailVerification,
        duplicateMatches,
      });
      return {
        facts: Array.isArray(fallback.facts) ? fallback.facts : [],
        summary: fallback.summary || { ...EMPTY_VERIFICATION_SUMMARY },
        checkedAt: fallback.checkedAt || null,
      };
    } catch (err2) {
      logVerificationFailure("verification facts fallback failed", err2, logFn);
      return {
        facts: [],
        summary: { ...EMPTY_VERIFICATION_SUMMARY },
        checkedAt: null,
      };
    }
  }
}

/**
 * Derive Prompt 26 workflow status from the three-axis model (no CRM column).
 * @param {object} row
 */
function deriveWorkflowStatus(row) {
  const app = String(row.application_status || "");
  const prov = String(row.provisioning_status || "");
  let follow = String(row.follow_up_status || "");
  if (follow === "call_pending") follow = "contact_pending";
  if (follow === "needs_help" || follow === "self_onboarding") follow = "awaiting_customer";

  if (app === "rejected") return "rejected";
  if (app === "cancelled") return "closed";
  if (prov === "provisioned") return "approved";
  if (app === "closed") return "closed";
  if (TERMINAL_FOLLOW_UP.includes(String(row.follow_up_status || ""))) return "closed";
  if (follow && repo.WORKFLOW_STATUSES.includes(follow)) return follow;
  if (follow === "contacted") return "contacted";
  if (follow === "qualified") return "qualified";
  if (follow === "approved_for_provision") return "approved_for_provision";
  if (follow === "validation_pending" || follow === "validation_in_progress") return follow;
  if (follow === "awaiting_customer") return "awaiting_customer";
  if (follow === "contact_pending") return "contact_pending";
  if (Boolean(row.support_requested) || String(row.selected_plan || "") === NETWORK_PLAN_CODE) {
    return follow || "validation_pending";
  }
  return follow || "new";
}

/**
 * Deterministic support-queue priority (lower rank = higher priority).
 * @param {object} row
 */
function computeSupportPriority(row) {
  const app = String(row.application_status || "");
  const prov = String(row.provisioning_status || "");
  const follow = String(row.follow_up_status || "");
  const nextAt = row.next_follow_up_at ? new Date(row.next_follow_up_at) : null;
  const overdue =
    nextAt &&
    !Number.isNaN(nextAt.getTime()) &&
    nextAt.getTime() < Date.now() &&
    !["rejected", "cancelled", "closed"].includes(app) &&
    !TERMINAL_FOLLOW_UP.includes(follow);

  if (prov === "provisioning_failed") {
    return { rank: 0, key: "critical", label: "Critical" };
  }
  if (app === "duplicate_review" || overdue) {
    return { rank: 1, key: "high", label: "High" };
  }
  if (
    Boolean(row.support_requested) ||
    [
      "new",
      "call_pending",
      "contact_pending",
      "validation_pending",
      "validation_in_progress",
      "needs_help",
      "awaiting_customer",
    ].includes(follow)
  ) {
    return { rank: 2, key: "medium", label: "Medium" };
  }
  return { rank: 3, key: "normal", label: "Normal" };
}

function sanitizeProvisioningErrorDetail(raw) {
  const s = String(raw || "")
    .replace(/postgresql:\/\/\S+/gi, "[redacted]")
    .replace(/password[^\s]*/gi, "[redacted]")
    .replace(/connection\s+string[^\n]*/gi, "[redacted]")
    .replace(/stack\s*trace[^\n]*/gi, "[redacted]")
    .replace(/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\b[\s\S]{0,200}/gi, "[sql redacted]")
    .slice(0, 240);
  return s || null;
}

function needsAttention(row) {
  const app = String(row.application_status || "");
  const prov = String(row.provisioning_status || "");
  const follow = String(row.follow_up_status || "");
  if (Boolean(row.support_requested)) return true;
  if (app === "submitted" || app === "duplicate_review" || app === "review_required" || app === "provisioning") return true;
  if (prov === "provisioning_failed") return true;
  if (
    follow === "new" ||
    follow === "call_pending" ||
    follow === "contact_pending" ||
    follow === "validation_pending" ||
    follow === "validation_in_progress" ||
    follow === "approved_for_provision" ||
    follow === "needs_help" ||
    follow === "awaiting_customer"
  ) {
    return true;
  }
  return false;
}

function mapListRow(row) {
  if (!row) return null;
  const selectedPlan = row.selected_plan != null ? String(row.selected_plan) : null;
  const priority = computeSupportPriority(row);
  const workflowStatus = deriveWorkflowStatus(row);
  const operator = presentRegistrationOperatorView(row);
  const openAction = presentOpenAction(operator, row);
  return {
    id: String(row.id),
    churchName: String(row.church_name || ""),
    contactName: String(row.contact_name || ""),
    contactEmail: String(row.contact_email || ""),
    contactPhone: row.contact_phone != null ? String(row.contact_phone) : "",
    contactPhoneNormalized:
      row.contact_phone_normalized != null ? String(row.contact_phone_normalized) : "",
    country: String(row.country || ""),
    city: String(row.city || ""),
    selectedPlan,
    selectedPlanLabel: planDisplayLabel(row.selected_plan) || null,
    isNetworkPlan: selectedPlan === NETWORK_PLAN_CODE,
    supportRequested: Boolean(row.support_requested),
    createdAt: row.created_at,
    applicationStatus: String(row.application_status || ""),
    provisioningStatus: String(row.provisioning_status || ""),
    workflowStatus,
    displayStatus: operator.displayStatus,
    statusExplanation: operator.explanation,
    recommendedAction: operator.recommendedAction,
    recommendedActionLabel: operator.recommendedActionLabel,
    openActionLabel: openAction.openActionLabel,
    actionHref: openAction.actionHref,
    operatorQueue: operator.queue,
    operatorTone: operator.tone,
    organizationHref: operator.organizationHref,
    priorityRank: priority.rank,
    priorityKey: priority.key,
    priorityLabel: priority.label,
    legacyStatus: row.legacy_status != null ? String(row.legacy_status) : null,
    organizationId: row.organization_id != null ? String(row.organization_id) : null,
    organizationKey: row.organization_key != null ? String(row.organization_key) : null,
    organizationDisplayName:
      row.organization_display_name != null ? String(row.organization_display_name) : null,
    organizationStatus: row.organization_status != null ? String(row.organization_status) : null,
    followUpStatus: row.follow_up_status != null ? String(row.follow_up_status) : null,
    assignedSupportUserId: row.assigned_support_user_id
      ? String(row.assigned_support_user_id)
      : null,
    assignedSupportDisplayName:
      row.support_display_name != null ? String(row.support_display_name) : null,
    assignedSupportEmail: row.support_email != null ? String(row.support_email) : null,
    lastContactedAt: row.last_contacted_at || null,
    nextFollowUpAt: row.next_follow_up_at || null,
    firstContactedAt: row.first_contacted_at || null,
    attention: needsAttention(row),
    riskDecision: row.risk_decision != null ? String(row.risk_decision) : null,
    riskReasonCodes: filterAllowlistedReasonCodes(row.risk_reason_codes || []),
    riskReasonLabels: reasonLabelsForAdmin(row.risk_reason_codes || []),
    riskDecidedAt: row.risk_decided_at || null,
    rejectionReason: row.rejection_reason != null ? String(row.rejection_reason) : null,
    rejectionCategory:
      row.rejection_category != null ? String(row.rejection_category) : null,
    reapplicationAllowed:
      row.reapplication_allowed == null ? null : Boolean(row.reapplication_allowed),
    rejectionNotificationStatus:
      row.rejection_notification_status != null
        ? String(row.rejection_notification_status)
        : null,
  };
}

/**
 * @param {object} input
 */
function normalizeListFilters(input) {
  const raw = input && typeof input === "object" ? input : {};
  let page = Number.parseInt(String(raw.page != null ? raw.page : "1"), 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (page > 10000) page = 10000;

  let limit = Number.parseInt(String(raw.limit != null ? raw.limit : String(DEFAULT_LIMIT)), 10);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) {
    limit = MAX_LIMIT;
  } else if (!ALLOWED_LIMITS.includes(limit)) {
    let best = ALLOWED_LIMITS[0];
    let bestDist = Math.abs(limit - best);
    for (const allowed of ALLOWED_LIMITS) {
      const dist = Math.abs(limit - allowed);
      if (dist < bestDist) {
        best = allowed;
        bestDist = dist;
      }
    }
    limit = best;
  }

  const applicationStatus = String(raw.application_status || raw.applicationStatus || "")
    .trim()
    .toLowerCase();
  const provisioningStatus = String(raw.provisioning_status || raw.provisioningStatus || "")
    .trim()
    .toLowerCase();
  const followUpStatus = String(raw.follow_up_status || raw.followUpStatus || "")
    .trim()
    .toLowerCase();
  let linked = String(raw.linked || "all")
    .trim()
    .toLowerCase();
  if (!repo.LINKED_FILTERS.includes(linked)) linked = "all";

  const selectedPlanRaw = String(raw.selected_plan || raw.selectedPlan || raw.plan || "")
    .trim()
    .toLowerCase();
  const selectedPlan = ALLOWED_PUBLIC_PLAN_CODES.includes(selectedPlanRaw)
    ? selectedPlanRaw
    : null;

  let supportRequested = null;
  const supportRaw = String(raw.support_requested || raw.supportRequested || "")
    .trim()
    .toLowerCase();
  if (supportRaw) {
    if (supportRaw === "true" || supportRaw === "1" || supportRaw === "yes") {
      supportRequested = true;
    } else if (supportRaw === "false" || supportRaw === "0" || supportRaw === "no") {
      supportRequested = false;
    } else {
      return { ok: false, reason: "support_requested" };
    }
  }

  let requiresReview = null;
  const reviewRaw = String(raw.requires_review || raw.requiresReview || "")
    .trim()
    .toLowerCase();
  if (reviewRaw) {
    if (reviewRaw === "true" || reviewRaw === "1" || reviewRaw === "yes") {
      requiresReview = true;
    } else if (reviewRaw === "false" || reviewRaw === "0" || reviewRaw === "no") {
      requiresReview = false;
    } else {
      return { ok: false, reason: "requires_review" };
    }
  }

  let overdueFollowUp = null;
  const overdueRaw = String(
    raw.overdue_follow_up || raw.overdueFollowUp || raw.overdue || ""
  )
    .trim()
    .toLowerCase();
  if (overdueRaw) {
    if (overdueRaw === "true" || overdueRaw === "1" || overdueRaw === "yes") {
      overdueFollowUp = true;
    } else if (overdueRaw === "false" || overdueRaw === "0" || overdueRaw === "no") {
      overdueFollowUp = false;
    } else {
      return { ok: false, reason: "overdue_follow_up" };
    }
  }

  const queue = queueFilterSpec(raw.queue || raw.operator_queue || "");
  if ((raw.queue || raw.operator_queue) && !queue) {
    return { ok: false, reason: "queue" };
  }

  let search = null;
  if (raw.q != null && String(raw.q).trim() !== "") {
    search = String(raw.q).trim().slice(0, 120).toLowerCase();
  }

  let createdFrom = null;
  let createdToExclusive = null;
  const fromRaw = String(raw.from || raw.created_from || "").trim();
  const toRaw = String(raw.to || raw.created_to || "").trim();
  if (fromRaw) {
    if (!DATE_RE.test(fromRaw)) {
      return { ok: false, reason: "from" };
    }
    createdFrom = `${fromRaw}T00:00:00.000Z`;
  }
  if (toRaw) {
    if (!DATE_RE.test(toRaw)) {
      return { ok: false, reason: "to" };
    }
    const d = new Date(`${toRaw}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return { ok: false, reason: "to" };
    d.setUTCDate(d.getUTCDate() + 1);
    createdToExclusive = d.toISOString();
  }

  return {
    ok: true,
    value: {
      page,
      limit,
      offset: (page - 1) * limit,
      applicationStatus: repo.APPLICATION_STATUSES.includes(applicationStatus)
        ? applicationStatus
        : null,
      provisioningStatus: repo.PROVISIONING_STATUSES.includes(provisioningStatus)
        ? provisioningStatus
        : null,
      followUpStatus: (() => {
        const rawFollow = followUpStatus;
        if (!rawFollow) return null;
        if (rawFollow === "contact_pending" || rawFollow === "call_pending") {
          return "contact_pending";
        }
        // Phase 5 visible Needs Information → all three follow-up statuses
        if (rawFollow === "needs_information") {
          return "needs_information";
        }
        return repo.FOLLOW_UP_STATUSES.includes(rawFollow) ? rawFollow : null;
      })(),
      selectedPlan,
      supportRequested,
      requiresReview: requiresReview === true ? true : null,
      overdueFollowUp: overdueFollowUp === true ? true : null,
      queue,
      linked,
      search,
      createdFrom,
      createdToExclusive,
      sort: "created_desc",
    },
  };
}

/**
 * @param {{ query: Function }} db
 * @param {object} input
 */
async function listRegistrationApplicationsAdmin(db, input) {
  const normalized = normalizeListFilters(input);
  if (!normalized.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      message: `invalid_input:${normalized.reason}`,
      applications: [],
      page: 1,
      limit: DEFAULT_LIMIT,
      total: 0,
      totalPages: 0,
      filters: {},
    };
  }
  if (!db || typeof db.query !== "function") {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      message: "database required",
      applications: [],
      page: 1,
      limit: DEFAULT_LIMIT,
      total: 0,
      totalPages: 0,
      filters: {},
    };
  }

  try {
    const filters = normalized.value;
    const [rows, total] = await Promise.all([
      repo.listRegistrationApplications(db, filters),
      repo.countRegistrationApplications(db, filters),
    ]);
    const totalPages = total === 0 ? 0 : Math.ceil(total / filters.limit);
    return {
      ok: true,
      status: STATUS.OK,
      applications: (rows || []).map(mapListRow).filter(Boolean),
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages,
      filters: {
        applicationStatus: filters.applicationStatus || "",
        provisioningStatus: filters.provisioningStatus || "",
        followUpStatus: filters.followUpStatus || "",
        selectedPlan: filters.selectedPlan || "",
        supportRequested:
          filters.supportRequested === true
            ? "true"
            : filters.supportRequested === false
              ? "false"
              : "",
        requiresReview: filters.requiresReview === true ? "true" : "",
        overdueFollowUp: filters.overdueFollowUp === true ? "true" : "",
        queue: filters.queue || "",
        linked: filters.linked,
        q: filters.search || "",
        from: input && (input.from || input.created_from) ? String(input.from || input.created_from) : "",
        to: input && (input.to || input.created_to) ? String(input.to || input.created_to) : "",
      },
      queueFilters: QUEUE_FILTERS,
    };
  } catch {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      message: "lookup_error",
      applications: [],
      page: 1,
      limit: DEFAULT_LIMIT,
      total: 0,
      totalPages: 0,
      filters: {},
    };
  }
}

/**
 * @param {{ query: Function }} db
 * @param {string} applicationId
 * @param {NodeJS.ProcessEnv} [env]
 */
async function getRegistrationApplicationDetail(db, applicationId, env, options = {}) {
  const id = String(applicationId || "").trim();
  if (!UUID_RE.test(id)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input" };
  }
  if (!db || typeof db.query !== "function") {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "database required" };
  }

  try {
    const row = await repo.getRegistrationApplicationById(db, id);
    if (!row) {
      return { ok: false, status: STATUS.NOT_FOUND, message: "not_found" };
    }

    const listMapped = mapListRow(row);
    const organizationId = row.organization_id ? String(row.organization_id) : null;
    let planKey = null;
    let subscriptionStatus = null;
    let subscriptionStartsAt = null;
    let subscriptionEndsAt = null;
    let publication = { draftPages: 0, publishedPages: 0 };
    let contacts = [];
    let auditEvents = [];
    let platformAdmins = [];

    const applicationSupportContact =
      Boolean(row.support_requested) || String(row.selected_plan || "") === NETWORK_PLAN_CODE;
    const supportOpsAvailable = Boolean(organizationId) || applicationSupportContact;

    platformAdmins = (
      (await repo.listActivePlatformAdministrators(db)) || []
    ).map((u) => ({
      id: String(u.id),
      displayName: String(u.display_name || ""),
      email: String(u.email_normalized || ""),
    }));

    if (organizationId) {
      const [subSummary, pub, contactRows] = await Promise.all([
        repo.getOrganizationCurrentSubscriptionSummary(db, organizationId),
        repo.getOrganizationPublicationSummary(db, organizationId),
        repo.listOrganizationSupportContacts(db, organizationId, { limit: 50 }),
      ]);
      if (subSummary) {
        planKey = subSummary.planKey;
        subscriptionStatus = subSummary.subscriptionStatus;
        subscriptionStartsAt = subSummary.startsAt;
        subscriptionEndsAt = subSummary.endsAt;
      }
      publication = pub;
      contacts = (contactRows || []).map((c) => ({
        id: String(c.id),
        contactMethod: String(c.contact_method),
        outcome: String(c.outcome),
        note: String(c.note || ""),
        contactedAt: c.contacted_at,
        nextFollowUpAt: c.next_follow_up_at,
        createdAt: c.created_at,
        createdByDisplayName: c.created_by_display_name != null ? String(c.created_by_display_name) : "",
        createdByEmail: c.created_by_email != null ? String(c.created_by_email) : "",
      }));

      const audit = await listOrganizationAuditEvents(db, {
        organizationId,
        actionCategory: "registration",
        limit: 20,
      });
      if (audit.ok) {
        auditEvents = (audit.events || []).map((e) => ({
          actionKey: e.actionKey,
          outcome: e.outcome,
          createdAt: e.createdAt,
          entityType: e.entityType,
          metadata: e.metadataJson || {},
        }));
      }
    } else if (supportOpsAvailable) {
      const contactRows = await repo.listApplicationSupportContacts(db, id, { limit: 50 });
      contacts = (contactRows || []).map((c) => ({
        id: String(c.id),
        contactMethod: String(c.contact_method),
        outcome: String(c.outcome),
        note: String(c.note || ""),
        contactedAt: c.contacted_at,
        nextFollowUpAt: c.next_follow_up_at,
        createdAt: c.created_at,
        createdByDisplayName: c.created_by_display_name != null ? String(c.created_by_display_name) : "",
        createdByEmail: c.created_by_email != null ? String(c.created_by_email) : "",
      }));
    }

    const reviewEvents = Array.isArray(row.review_events) ? row.review_events : [];
    const reviewAudit = reviewEvents
      .filter((e) => e && typeof e === "object")
      .map((e) => ({
        actionKey: `registration.${String(e.action || "event")}`,
        outcome: "success",
        createdAt: e.at || null,
        entityType: "registration_application",
        metadata: {
          reason_codes: e.reason_codes || undefined,
          note_len: e.note_len != null ? e.note_len : undefined,
          from_status: e.from_status || undefined,
          to_status: e.to_status || undefined,
          status: e.status || undefined,
        },
      }));
    // Application review_events are the durable trail for unprovisioned ops; merge when org audits exist.
    auditEvents = [...reviewAudit, ...auditEvents]
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      })
      .slice(0, 40);

    const errorCode = row.provisioning_error_code
      ? String(row.provisioning_error_code).slice(0, 120)
      : null;
    const errorSummary = sanitizeProvisioningErrorDetail(row.provisioning_error_detail);
    const provisioningFailed = String(row.provisioning_status) === "provisioning_failed";
    const retryAllowed =
      provisioningFailed &&
      !isNetworkPlanSelection(row.selected_plan) &&
      isProvisioningFailureRetryable(errorCode);

    const application = {
      ...listMapped,
      roleInChurch: row.role_in_church != null ? String(row.role_in_church) : null,
      branchName: row.branch_name != null ? String(row.branch_name) : null,
      branchCount: row.branch_count != null ? String(row.branch_count) : null,
      message: row.registration_message != null ? String(row.registration_message) : null,
      consentTerms: Boolean(row.consent_terms),
      reviewNotes: row.review_notes != null ? String(row.review_notes) : "",
      provisioningStartedAt: row.provisioning_started_at,
      provisionedAt: row.provisioned_at,
      provisioningFailedAt: row.provisioning_failed_at,
      provisioningErrorCode: errorCode,
      provisioningErrorSummary: errorSummary,
      provisioningFailureCategory: errorCode || (provisioningFailed ? "provisioning_failed" : null),
      retryAllowed,
      retryAllowedNote: provisioningFailed
        ? retryAllowed
          ? "Retry uses the same idempotent provisioning orchestrator. Permanent validation conflicts require correction or rejection."
          : "This failure is not retryable from this screen. Correct the underlying conflict or reject the application."
        : null,
      onboardingStatus: row.onboarding_status != null ? String(row.onboarding_status) : null,
      supportRequested: Boolean(row.support_requested),
      firstContactedAt: listMapped.firstContactedAt,
      nextFollowUpAt: listMapped.nextFollowUpAt,
      lastContactedAt: listMapped.lastContactedAt,
      onboardingCompletedAt: row.onboarding_completed_at,
      lastActivityAt: row.last_activity_at,
      organizationCreatedAt: row.organization_created_at,
      assignedSupportUserId: listMapped.assignedSupportUserId,
      planKey,
      planKeyLabel: planKey ? planDisplayLabel(planKey) : null,
      subscriptionStatus,
      subscriptionStartsAt,
      subscriptionEndsAt,
      publication,
      followUpAvailable: supportOpsAvailable,
      supportAssignmentAvailable: supportOpsAvailable,
      contactHistoryAvailable: supportOpsAvailable,
      linkOrganizationAvailable:
        !organizationId &&
        String(row.provisioning_status || "") !== "provisioned" &&
        !["rejected", "cancelled"].includes(String(row.application_status || "")),
      riskReviewActionsAvailable:
        !organizationId &&
        String(row.provisioning_status || "") !== "provisioned" &&
        String(row.provisioning_status || "") !== "provisioning_failed" &&
        ["submitted", "duplicate_review", "review_required", "provisioning"].includes(String(row.application_status || "")) &&
        !isNetworkPlanSelection(row.selected_plan),
      networkApproveAvailable:
        !organizationId &&
        isNetworkPlanSelection(row.selected_plan) &&
        String(row.provisioning_status || "") !== "provisioned" &&
        ["approved_for_provision", "qualified"].includes(
          String(row.follow_up_status || "")
        ) &&
        !["rejected", "cancelled"].includes(String(row.application_status || "")),
      markValidationCompleteAvailable:
        !organizationId &&
        isNetworkPlanSelection(row.selected_plan) &&
        String(row.provisioning_status || "") !== "provisioned" &&
        !["approved_for_provision", "qualified"].includes(
          String(row.follow_up_status || "")
        ) &&
        !["rejected", "cancelled", "closed"].includes(String(row.application_status || "")),
      retryProvisionAvailable: retryAllowed,
      rejectActionsAvailable:
        !organizationId &&
        String(row.provisioning_status || "") !== "provisioned" &&
        ["submitted", "duplicate_review", "review_required", "provisioning"].includes(String(row.application_status || "")),
      reviewEvents,
      operatorView: presentRegistrationOperatorView({
        ...row,
        selectedPlan: row.selected_plan,
        applicationStatus: row.application_status,
        provisioningStatus: row.provisioning_status,
        followUpStatus: row.follow_up_status,
        organizationKey: row.organization_key,
        supportRequested: row.support_requested,
        subscriptionStatus,
      }),
    };

    const detailOptions = options && typeof options === "object" ? options : {};
    const phoneVerification = await loadRegistrationPhoneVerificationForDetail(
      db,
      id,
      detailOptions
    );
    const emailVerification = await loadRegistrationEmailVerificationForDetail(
      db,
      id,
      detailOptions
    );
    const communications = await loadRegistrationCommunicationsForDetail(
      db,
      id,
      detailOptions
    );
    const verification = await loadRegistrationVerificationForDetail(
      db,
      application,
      contacts,
      { ...detailOptions, phoneVerification, emailVerification }
    );
    const reviewRecommendation = loadRegistrationReviewRecommendationForDetail(
      verification,
      detailOptions
    );
    const approvalChecklist = loadRegistrationApprovalChecklistForDetail(
      verification,
      reviewRecommendation,
      detailOptions
    );

    return {
      ok: true,
      status: STATUS.OK,
      application,
      verification,
      reviewRecommendation,
      approvalChecklist,
      phoneVerification,
      emailVerification,
      communications,
      contacts,
      auditEvents,
      platformAdmins,
      followUpStatuses: repo.FOLLOW_UP_STATUSES,
      contactMethods: repo.CONTACT_METHODS,
      contactOutcomes: repo.CONTACT_OUTCOMES,
      deploymentCode: (() => {
        const d = getPlatformDeploymentCode(env || process.env);
        return d && d.ok ? d.code : "blessboard-org-v5";
      })(),
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "lookup_error" };
  }
}

async function withOwnedClient(db, fn) {
  let client = null;
  let owned = false;
  try {
    if (db && typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    return await fn(client);
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   applicationId: string,
 *   followUpStatus: string,
 *   actorUserId: string,
 *   deploymentCode?: string,
 * }} input
 */
async function updateRegistrationFollowUpStatus(db, input) {
  const applicationId = String((input && input.applicationId) || "").trim();
  const followUpStatus = String((input && input.followUpStatus) || "")
    .trim()
    .toLowerCase();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!UUID_RE.test(applicationId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input" };
  }
  if (!repo.FOLLOW_UP_STATUSES.includes(followUpStatus)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_follow_up_status" };
  }

  try {
    return await withOwnedClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const app = await repo.lockApplicationById(client, applicationId);
        if (!app) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, message: "not_found" };
        }

        const provisioned =
          Boolean(app.organization_id) && String(app.provisioning_status) === "provisioned";
        const applicationSupportContact =
          Boolean(app.support_requested) || String(app.selected_plan || "") === NETWORK_PLAN_CODE;

        if (!provisioned && applicationSupportContact) {
          const fromStatus = app.follow_up_status != null ? String(app.follow_up_status) : null;
          await repo.updateApplicationSupportFollowUp(client, applicationId, {
            followUpStatus,
            supportRequested: true,
            reviewEvent: {
              at: new Date().toISOString(),
              action: "follow_up_status_updated",
              actor_user_id: actorUserId,
              from_status: fromStatus || undefined,
              to_status: followUpStatus,
            },
          });
          await client.query("COMMIT");
          return { ok: true, status: STATUS.OK, followUpStatus, fromStatus, scope: "application" };
        }

        if (!provisioned) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.NOT_PROVISIONED,
            message: "follow_up_requires_provisioned_organization",
          };
        }
        const organizationId = String(app.organization_id);
        let onboarding = await repo.ensureOrganizationOnboardingRow(client, {
          organizationId,
          applicationId,
        });
        const fromStatus = onboarding ? String(onboarding.follow_up_status || "") : null;
        onboarding = await repo.updateOrganizationOnboarding(client, organizationId, {
          followUpStatus,
          lastActivityAt: new Date().toISOString(),
        });
        await recordAuditEventSafe(client, {
          deploymentCode: input.deploymentCode || "blessboard-org-v5",
          organizationId,
          actorUserId,
          outcome: "success",
          actionKey: "registration.follow_up_status_updated",
          entityType: "organization_onboarding",
          entityId: organizationId,
          metadata: {
            category: "registration",
            from_status: fromStatus || undefined,
            to_status: followUpStatus,
            actor_type: "platform_admin",
            source: "admin_registration_applications",
          },
        });
        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, followUpStatus, fromStatus, scope: "organization" };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "lookup_error" };
  }
}

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   applicationId: string,
 *   supportUserId: string|null,
 *   actorUserId: string,
 *   deploymentCode?: string,
 * }} input
 */
async function assignRegistrationSupport(db, input) {
  const applicationId = String((input && input.applicationId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const rawSupport =
    input && input.supportUserId != null && String(input.supportUserId).trim() !== ""
      ? String(input.supportUserId).trim()
      : null;
  if (!UUID_RE.test(applicationId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input" };
  }
  if (rawSupport && !UUID_RE.test(rawSupport)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_support_user" };
  }

  try {
    return await withOwnedClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const app = await repo.lockApplicationById(client, applicationId);
        if (!app) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, message: "not_found" };
        }

        const provisioned =
          Boolean(app.organization_id) && String(app.provisioning_status) === "provisioned";
        const applicationSupportContact =
          Boolean(app.support_requested) || String(app.selected_plan || "") === NETWORK_PLAN_CODE;

        if (rawSupport) {
          const admins = await repo.listActivePlatformAdministrators(client);
          const allowed = admins.some((u) => String(u.id) === rawSupport);
          if (!allowed) {
            await client.query("ROLLBACK");
            return { ok: false, status: STATUS.FORBIDDEN, message: "not_platform_admin" };
          }
        }

        if (!provisioned && applicationSupportContact) {
          await repo.updateApplicationSupportFollowUp(client, applicationId, {
            assignedSupportUserId: rawSupport,
            clearAssignedSupport: !rawSupport,
            supportRequested: true,
            reviewEvent: {
              at: new Date().toISOString(),
              action: "support_assigned",
              actor_user_id: actorUserId,
              status: rawSupport ? "assigned" : "unassigned",
            },
          });
          await client.query("COMMIT");
          return { ok: true, status: STATUS.OK, supportUserId: rawSupport, scope: "application" };
        }

        if (!provisioned) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.NOT_PROVISIONED,
            message: "assignment_requires_provisioned_organization",
          };
        }
        const organizationId = String(app.organization_id);
        await repo.ensureOrganizationOnboardingRow(client, {
          organizationId,
          applicationId,
        });

        await repo.updateOrganizationOnboarding(client, organizationId, {
          assignedSupportUserId: rawSupport,
          clearAssignedSupport: !rawSupport,
          lastActivityAt: new Date().toISOString(),
        });

        await recordAuditEventSafe(client, {
          deploymentCode: input.deploymentCode || "blessboard-org-v5",
          organizationId,
          actorUserId,
          outcome: "success",
          actionKey: "registration.support_assigned",
          entityType: "organization_onboarding",
          entityId: organizationId,
          metadata: {
            category: "registration",
            status: rawSupport ? "assigned" : "unassigned",
            actor_type: "platform_admin",
            source: "admin_registration_applications",
          },
        });
        await repo.updateApplicationSupportFollowUp(client, applicationId, {
          reviewEvent: {
            at: new Date().toISOString(),
            action: "support_assigned",
            actor_user_id: actorUserId,
            status: rawSupport ? "assigned" : "unassigned",
          },
        });
        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, supportUserId: rawSupport, scope: "organization" };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "lookup_error" };
  }
}

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   applicationId: string,
 *   actorUserId: string,
 *   contactMethod: string,
 *   outcome: string,
 *   note: string,
 *   followUpStatus?: string|null,
 *   nextFollowUpAt?: string|null,
 *   deploymentCode?: string,
 * }} input
 */
async function addRegistrationSupportContact(db, input) {
  const applicationId = String((input && input.applicationId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const contactMethod = String((input && input.contactMethod) || "")
    .trim()
    .toLowerCase();
  const outcome = String((input && input.outcome) || "")
    .trim()
    .toLowerCase();
  const note = String((input && input.note) || "").trim();
  if (!UUID_RE.test(applicationId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input" };
  }
  if (!repo.CONTACT_METHODS.includes(contactMethod)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_contact_method" };
  }
  if (!repo.CONTACT_OUTCOMES.includes(outcome)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_outcome" };
  }
  if (note.length < 1 || note.length > 2000) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_note" };
  }

  let nextFollowUpAt = null;
  if (input.nextFollowUpAt != null && String(input.nextFollowUpAt).trim() !== "") {
    const raw = String(input.nextFollowUpAt).trim();
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_next_follow_up" };
    }
    nextFollowUpAt = d.toISOString();
  }

  let followUpStatus = null;
  if (input.followUpStatus != null && String(input.followUpStatus).trim() !== "") {
    followUpStatus = String(input.followUpStatus).trim().toLowerCase();
    if (!repo.FOLLOW_UP_STATUSES.includes(followUpStatus)) {
      return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_follow_up_status" };
    }
  }

  try {
    return await withOwnedClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const app = await repo.lockApplicationById(client, applicationId);
        if (!app) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, message: "not_found" };
        }

        const provisioned =
          Boolean(app.organization_id) && String(app.provisioning_status) === "provisioned";
        const applicationSupportContact =
          Boolean(app.support_requested) || String(app.selected_plan || "") === NETWORK_PLAN_CODE;
        const nowIso = new Date().toISOString();

        if (!provisioned && applicationSupportContact) {
          const contact = await repo.createOrganizationSupportContact(client, {
            organizationId: null,
            registrationApplicationId: applicationId,
            createdByUserId: actorUserId,
            contactMethod,
            outcome,
            note,
            contactedAt: null,
            nextFollowUpAt,
          });
          const appPatch = {
            supportRequested: true,
            lastContactedAt: nowIso,
            reviewEvent: {
              at: nowIso,
              action: "support_contact_added",
              actor_user_id: actorUserId,
              status: outcome,
              reason_codes: [contactMethod],
              note_len: note.length,
            },
          };
          if (followUpStatus) appPatch.followUpStatus = followUpStatus;
          if (!app.first_contacted_at) appPatch.firstContactedAt = nowIso;
          if (Object.prototype.hasOwnProperty.call(input || {}, "nextFollowUpAt")) {
            appPatch.nextFollowUpAt = nextFollowUpAt;
          }
          await repo.updateApplicationSupportFollowUp(client, applicationId, appPatch);
          await client.query("COMMIT");
          return {
            ok: true,
            status: STATUS.OK,
            contactId: String(contact.id),
            scope: "application",
          };
        }

        if (!app.organization_id) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.NOT_PROVISIONED,
            message: "contact_requires_linked_organization",
          };
        }
        const organizationId = String(app.organization_id);
        const onboarding = await repo.ensureOrganizationOnboardingRow(client, {
          organizationId,
          applicationId,
        });
        const contact = await repo.createOrganizationSupportContact(client, {
          organizationId,
          registrationApplicationId: applicationId,
          createdByUserId: actorUserId,
          contactMethod,
          outcome,
          note,
          contactedAt: null,
          nextFollowUpAt,
        });

        const firstContactedAt =
          onboarding && onboarding.first_contacted_at ? null : nowIso;
        await repo.updateOrganizationOnboarding(client, organizationId, {
          followUpStatus: followUpStatus || undefined,
          firstContactedAt,
          lastContactedAt: nowIso,
          nextFollowUpAt,
          lastActivityAt: nowIso,
        });

        await recordAuditEventSafe(client, {
          deploymentCode: input.deploymentCode || "blessboard-org-v5",
          organizationId,
          actorUserId,
          outcome: "success",
          actionKey: "registration.support_contact_added",
          entityType: "organization_support_contact",
          entityId: contact.id,
          metadata: {
            category: "registration",
            reason_code: contactMethod,
            status: outcome,
            actor_type: "platform_admin",
            source: "admin_registration_applications",
            // note intentionally omitted
          },
        });
        await repo.updateApplicationSupportFollowUp(client, applicationId, {
          reviewEvent: {
            at: nowIso,
            action: "support_contact_added",
            actor_user_id: actorUserId,
            status: outcome,
            reason_codes: [contactMethod],
            note_len: note.length,
          },
        });
        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, contactId: String(contact.id), scope: "organization" };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "lookup_error" };
  }
}

/**
 * Allowlisted rejection categories (Phase2 Prompt 068 / Stitch Rejection Workspace).
 */
const REJECTION_CATEGORIES = Object.freeze([
  "duplicate_registration",
  "applicant_not_authorized",
  "contact_not_verified",
  "invalid_or_incomplete_information",
  "church_identity_not_confirmed",
  "fraudulent_or_prohibited_use",
  "unsupported_organization_type",
  "applicant_withdrew",
  "other",
]);

const REJECTION_CATEGORY_LABELS = Object.freeze({
  duplicate_registration: "Duplicate registration",
  applicant_not_authorized: "Applicant not authorized",
  contact_not_verified: "Contact not verified",
  invalid_or_incomplete_information: "Invalid or incomplete information",
  church_identity_not_confirmed: "Church identity not confirmed",
  fraudulent_or_prohibited_use: "Fraudulent or prohibited use",
  unsupported_organization_type: "Unsupported organization type",
  applicant_withdrew: "Applicant withdrew",
  other: "Other",
});

const REJECTION_NOTIFICATION_STATUSES = Object.freeze([
  "recorded",
  "sending_unavailable",
  "queued",
  "sent",
  "failed",
]);

/**
 * Map communication delivery status onto application rejection_notification_status.
 * @param {string|null|undefined} deliveryStatus
 * @returns {string|null}
 */
function mapRejectionNotificationStatus(deliveryStatus) {
  const status = String(deliveryStatus || "")
    .trim()
    .toLowerCase();
  if (REJECTION_NOTIFICATION_STATUSES.includes(status)) return status;
  return null;
}

/**
 * Reject an unprovisioned registration application (no tenant created).
 * Preserves rejection_reason compatibility via `reason` and/or `internalDecisionNote`.
 * Optional Prompt 068 fields: category, applicant explanation, reapplication, notify.
 *
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   applicationId: string,
 *   actorUserId?: string,
 *   platformAdminUserId?: string,
 *   reason?: string,
 *   internalDecisionNote?: string,
 *   rejectionCategory?: string|null,
 *   applicantExplanation?: string|null,
 *   reapplicationAllowed?: boolean|null,
 *   notifyApplicant?: boolean,
 *   deploymentCode?: string,
 * }} input
 * @param {{
 *   recordRejectionNotice?: Function,
 *   emailAdapter?: object,
 *   communicationRepository?: object,
 * }} [options]
 */
async function rejectRegistrationApplication(db, input, options = {}) {
  const applicationId = String((input && input.applicationId) || "").trim();
  const platformAdminUserId = String(
    (input && (input.platformAdminUserId || input.actorUserId)) || ""
  ).trim();
  const internalDecisionNote = String(
    (input && (input.internalDecisionNote != null ? input.internalDecisionNote : "")) ||
      ""
  )
    .trim()
    .slice(0, 500);
  const legacyReason = String((input && (input.reason != null ? input.reason : "")) || "")
    .trim()
    .slice(0, 500);
  const rejectionReason = (internalDecisionNote || legacyReason).slice(0, 500);
  const applicantExplanation = String(
    (input && (input.applicantExplanation != null ? input.applicantExplanation : "")) ||
      ""
  )
    .trim()
    .slice(0, 8000);
  const notifyApplicant = Boolean(input && input.notifyApplicant === true);

  if (!UUID_RE.test(applicationId) || !UUID_RE.test(platformAdminUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input" };
  }
  if (!rejectionReason || rejectionReason.length < 3) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "rejection_reason_required" };
  }

  let rejectionCategory = null;
  if (
    input &&
    Object.prototype.hasOwnProperty.call(input, "rejectionCategory") &&
    input.rejectionCategory != null &&
    String(input.rejectionCategory).trim() !== ""
  ) {
    rejectionCategory = String(input.rejectionCategory).trim().toLowerCase();
    if (!REJECTION_CATEGORIES.includes(rejectionCategory)) {
      return {
        ok: false,
        status: STATUS.INVALID_INPUT,
        message: "invalid_rejection_category",
      };
    }
  }

  const setReapplication = Boolean(
    input && Object.prototype.hasOwnProperty.call(input, "reapplicationAllowed")
  );
  const reapplicationAllowed = setReapplication
    ? input.reapplicationAllowed == null
      ? null
      : Boolean(input.reapplicationAllowed)
    : undefined;

  const recordNoticeFn =
    typeof options.recordRejectionNotice === "function"
      ? options.recordRejectionNotice
      : recordRejectionNotice;

  try {
    return await withOwnedClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const app = await repo.lockApplicationById(client, applicationId);
        if (!app) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, message: "not_found" };
        }
        if (app.organization_id || String(app.provisioning_status) === "provisioned") {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.NOT_ELIGIBLE,
            message: "already_provisioned",
          };
        }
        const appStatus = String(app.application_status || "");
        if (appStatus === "rejected") {
          await client.query("COMMIT");
          return { ok: true, status: STATUS.OK, alreadyRejected: true };
        }
        if (!["submitted", "duplicate_review", "review_required", "provisioning"].includes(appStatus)) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_ELIGIBLE, message: "not_eligible" };
        }

        const priorCodes = filterAllowlistedReasonCodes(app.risk_reason_codes || []);
        const reasonCodes = filterAllowlistedReasonCodes([
          ...priorCodes,
          RISK_REASON_CODES.ADMIN_REJECTED,
        ]);
        const nowIso = new Date().toISOString();

        let notificationStatus = null;
        let noticeResult = null;

        if (applicantExplanation) {
          const noticeDeps = {
            client,
          };
          if (options.emailAdapter) {
            noticeDeps.emailAdapter = options.emailAdapter;
          }
          if (options.communicationRepository) {
            noticeDeps.repository = options.communicationRepository;
          }
          noticeResult = await recordNoticeFn(
            {
              applicationId,
              recipient: app.contact_email != null ? String(app.contact_email) : null,
              subject: "Your BlessBoard registration application",
              applicantMessage: applicantExplanation,
              internalNote: rejectionReason,
              channel: "email",
              notifyApplicant,
            },
            { platformAdminUserId },
            noticeDeps
          );
          notificationStatus = mapRejectionNotificationStatus(
            noticeResult && noticeResult.delivery && noticeResult.delivery.status
          );
        }

        const reviewEvent = {
          at: nowIso,
          action: "reject",
          actor_user_id: platformAdminUserId,
          reason_codes: reasonCodes,
          note_len: rejectionReason.length,
          applicant_explanation_len: applicantExplanation
            ? applicantExplanation.length
            : 0,
          rejection_category: rejectionCategory || undefined,
          reapplication_allowed: setReapplication ? reapplicationAllowed : undefined,
          notify_applicant: notifyApplicant,
          notification_status: notificationStatus || undefined,
        };

        await repo.updateApplicationRiskReviewState(client, applicationId, {
          applicationStatus: "rejected",
          riskDecision: RISK_DECISIONS.REJECT,
          riskReasonCodes: reasonCodes,
          riskDecidedAt: nowIso,
          rejectionReason,
          reviewEvent,
        });

        if (rejectionCategory != null || setReapplication || notificationStatus != null) {
          const metaPatch = {};
          if (rejectionCategory != null) {
            metaPatch.rejectionCategory = rejectionCategory;
          }
          if (setReapplication) {
            metaPatch.reapplicationAllowed = reapplicationAllowed;
          }
          if (notificationStatus != null) {
            metaPatch.rejectionNotificationStatus = notificationStatus;
          }
          await repo.updateRegistrationRejectionMetadata(client, applicationId, metaPatch);
        }

        await client.query("COMMIT");
        return {
          ok: true,
          status: STATUS.OK,
          alreadyRejected: false,
          rejectionCategory,
          reapplicationAllowed: setReapplication ? reapplicationAllowed : null,
          rejectionNotificationStatus: notificationStatus,
          rejectionNotice:
            noticeResult && noticeResult.communication
              ? noticeResult.communication
              : null,
          delivery:
            noticeResult && noticeResult.delivery ? noticeResult.delivery : null,
        };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "lookup_error" };
  }
}

/**
 * Controlled reopen: rejected → submitted. Preserves rejection_reason, rejection
 * metadata, communications, and prior review_events. Appends a reopen review event.
 * Does not send email or clear rejection history.
 *
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   applicationId: string,
 *   actorUserId?: string,
 *   platformAdminUserId?: string,
 *   reason: string,
 * }} input
 */
async function reopenRegistrationApplication(db, input) {
  const applicationId = String((input && input.applicationId) || "").trim();
  const platformAdminUserId = String(
    (input && (input.platformAdminUserId || input.actorUserId)) || ""
  ).trim();
  const reason = String((input && (input.reason != null ? input.reason : "")) || "")
    .trim()
    .slice(0, 500);

  if (!UUID_RE.test(applicationId) || !UUID_RE.test(platformAdminUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input" };
  }
  if (!reason || reason.length < 3) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "reopen_reason_required" };
  }

  try {
    return await withOwnedClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const app = await repo.lockApplicationById(client, applicationId);
        if (!app) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, message: "not_found" };
        }
        if (app.organization_id || String(app.provisioning_status) === "provisioned") {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.NOT_ELIGIBLE,
            message: "already_provisioned",
          };
        }
        const appStatus = String(app.application_status || "");
        if (appStatus !== "rejected") {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_ELIGIBLE, message: "not_eligible" };
        }

        const nowIso = new Date().toISOString();
        const reviewEvent = {
          at: nowIso,
          action: "reopen",
          actor_user_id: platformAdminUserId,
          reason,
          note_len: reason.length,
          from_status: "rejected",
          to_status: "submitted",
        };

        // Status only + append event. Do not clear rejection_reason or metadata.
        await repo.updateApplicationRiskReviewState(client, applicationId, {
          applicationStatus: "submitted",
          reviewEvent,
        });

        await client.query("COMMIT");
        return {
          ok: true,
          status: STATUS.OK,
          applicationStatus: "submitted",
          fromStatus: "rejected",
        };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "lookup_error" };
  }
}

/**
 * Approve a held Foundation/Growth (or validated Network) application and provision
 * via the canonical orchestrator using an administrator invitation (no password entry).
 * Idempotent when already provisioned.
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   applicationId: string,
 *   actorUserId: string,
 *   organizationKey?: string|null,
 *   deploymentCode?: string,
 *   dataEnvironment?: string,
 *   provisionFn?: Function,
 * }} input
 */
async function approveAndProvisionRegistrationApplication(db, input) {
  const applicationId = String((input && input.applicationId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const requestId =
    input && input.requestId != null ? String(input.requestId).slice(0, 64) : null;
  if (!UUID_RE.test(applicationId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input" };
  }

  let organizationKey = null;
  if (input && input.organizationKey != null && String(input.organizationKey).trim() !== "") {
    const keyResult = validateRequestedOrganizationKey(input.organizationKey);
    if (!keyResult.ok) {
      return {
        ok: false,
        status: STATUS.INVALID_INPUT,
        message: keyResult.field || "invalid_organization_key",
      };
    }
    organizationKey = keyResult.value;
  }

  const deploymentCode = (input && input.deploymentCode) || "blessboard-org-v5";
  const dataEnvironment = (input && input.dataEnvironment) || "testing";
  const provisionFn = (input && input.provisionFn) || provisionRegisteredBlessBoardChurch;

  let appSnapshot = null;
  let failureStage = "prepare_approval";
  try {
    const prepared = await withOwnedClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        failureStage = "lock_application";
        const app = await repo.lockApplicationById(client, applicationId);
        if (!app) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, message: "not_found" };
        }
        if (
          String(app.provisioning_status) === "provisioned" &&
          app.organization_id
        ) {
          const {
            inspectOrganizationProvisioningCompleteness,
          } = require("../../platform/registration/provisioningRecovery");
          const completeness = await inspectOrganizationProvisioningCompleteness(client, {
            productCode: "blessboard",
            organizationId: app.organization_id,
            application: app,
          });
          if (completeness.complete) {
            await client.query("COMMIT");
            return {
              ok: true,
              status: STATUS.ALREADY_PROVISIONED,
              alreadyProvisioned: true,
              organizationId: String(app.organization_id),
              organizationKey: app.organization_key != null ? String(app.organization_key) : null,
            };
          }
        }
        if (!String(app.contact_email || "").trim()) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.INVALID_INPUT,
            message: "administrator_email_required",
          };
        }
        if (isNetworkPlanSelection(app.selected_plan)) {
          const follow = String(app.follow_up_status || "");
          if (follow !== "approved_for_provision" && follow !== "qualified") {
            await client.query("ROLLBACK");
            return {
              ok: false,
              status: STATUS.NOT_ELIGIBLE,
              message: "network_validation_required",
            };
          }
          const netAppStatus = String(app.application_status || "");
          if (netAppStatus === "rejected" || netAppStatus === "cancelled") {
            await client.query("ROLLBACK");
            return { ok: false, status: STATUS.NOT_ELIGIBLE, message: "not_eligible" };
          }
        } else {
          const appStatus = String(app.application_status || "");
          const incompleteRetry =
            String(app.provisioning_status) === "provisioning_failed" ||
            (app.organization_id && String(app.provisioning_status) !== "provisioned");
          if (appStatus === "rejected" || appStatus === "cancelled") {
            await client.query("ROLLBACK");
            return { ok: false, status: STATUS.NOT_ELIGIBLE, message: "not_eligible" };
          }
          if (appStatus === "closed" && !incompleteRetry) {
            await client.query("ROLLBACK");
            return { ok: false, status: STATUS.NOT_ELIGIBLE, message: "not_eligible" };
          }
          if (
            !["submitted", "duplicate_review", "review_required", "provisioning", "provision_failed", "active"].includes(appStatus) &&
            !incompleteRetry
          ) {
            await client.query("ROLLBACK");
            return { ok: false, status: STATUS.NOT_ELIGIBLE, message: "not_eligible" };
          }
        }
        const provStatus = String(app.provisioning_status || "");
        if (provStatus === "provisioning_failed") {
          if (
            isNetworkPlanSelection(app.selected_plan) ||
            !isProvisioningFailureRetryable(app.provisioning_error_code)
          ) {
            await client.query("ROLLBACK");
            return { ok: false, status: STATUS.NOT_ELIGIBLE, message: "retry_not_allowed" };
          }
        }

        const nowIso = new Date().toISOString();
        const isNetwork = isNetworkPlanSelection(app.selected_plan);
        failureStage = "record_approval_review_event";
        await repo.updateApplicationRiskReviewState(client, applicationId, {
          applicationStatus: "submitted",
          clearRejectionReason: true,
          reviewEvent: {
            at: nowIso,
            action: isNetwork
              ? "approve_network_organization"
              : provStatus === "provisioning_failed"
                ? "retry_provision"
                : "approve_provision",
            actor_user_id: actorUserId,
            reason_codes: filterAllowlistedReasonCodes(app.risk_reason_codes || []),
          },
        });
        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, application: app, networkShell: isNetwork };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });

    if (!prepared.ok) return prepared;
    if (prepared.alreadyProvisioned) {
      return {
        ok: true,
        status: STATUS.OK,
        alreadyProvisioned: true,
        organizationId: prepared.organizationId,
        organizationKey: prepared.organizationKey || null,
      };
    }
    appSnapshot = prepared.application;

    failureStage = "provision_organization";
    const provision = await provisionFn(
      db,
      {
        applicationId,
        requestedOrganizationKey: organizationKey || undefined,
        actorContext: {
          type: "platform_admin",
          source: "admin_registration_applications",
          actorUserId,
          dataEnvironment,
          deploymentCode,
        },
      },
      {
        allowRetry: true,
        networkOrganizationShell: Boolean(prepared.networkShell),
        administratorViaInvitation: true,
      }
    );

    if (provision.ok) {
      const organizationId =
        (provision.records && provision.records.organizationId) ||
        null;
      const orgKey =
        (provision.records && provision.records.organizationKey) || null;
      if (organizationId) {
        failureStage = "record_audit_event";
        await recordAuditEventSafe(db, {
          deploymentCode,
          organizationId,
          actorUserId,
          outcome: "success",
          actionKey: prepared.networkShell
            ? "registration.network_organization_created"
            : "registration.application_approved",
          entityType: "registration_application",
          entityId: applicationId,
          metadata: {
            category: "registration",
            actor_type: "platform_admin",
            source: "admin_registration_applications",
            network_shell: Boolean(prepared.networkShell),
            network_activation_required: Boolean(prepared.networkShell),
            reason_codes: filterAllowlistedReasonCodes(
              (appSnapshot && appSnapshot.risk_reason_codes) || []
            ),
            status: provision.alreadyProvisioned ? "already_provisioned" : "provisioned",
          },
        });
      }
      return {
        ok: true,
        status: STATUS.OK,
        alreadyProvisioned: Boolean(provision.alreadyProvisioned),
        networkOrganizationCreated: Boolean(prepared.networkShell),
        records: provision.records || null,
        organizationId,
        organizationKey: orgKey,
        invitation:
          provision.records && provision.records.invitationId
            ? {
                id: provision.records.invitationId,
                rawToken: provision.records.invitationRawToken || null,
                delivery: "pending_email",
                existingActiveUser: Boolean(provision.records.administratorWasActive),
                churchId: provision.records.churchId || null,
                churchName:
                  (appSnapshot && appSnapshot.church_name) ||
                  (provision.records && provision.records.organizationKey) ||
                  "Your church",
                recipientEmail:
                  (appSnapshot && appSnapshot.contact_email) || null,
                administratorName:
                  (appSnapshot && appSnapshot.contact_name) || null,
              }
            : null,
      };
    }

    if (provision.status === "duplicate_email_review") {
      return {
        ok: false,
        status: STATUS.NOT_ELIGIBLE,
        message: "duplicate_email_review",
        provisionStatus: provision.status,
      };
    }
    if (provision.status === "identity_conflict") {
      return {
        ok: false,
        status: STATUS.NOT_ELIGIBLE,
        message: "identity_conflict",
        provisionStatus: provision.status,
      };
    }
    if (String(provision.message || "").includes("administratorEmail")) {
      return {
        ok: false,
        status: STATUS.INVALID_INPUT,
        message: "administrator_email_required",
      };
    }
    return {
      ok: false,
      status: STATUS.PROVISION_FAILED,
      message: provision.status || "provision_failed",
      provisionStatus: provision.status || null,
    };
  } catch (err) {
    logRegistrationApprovalFailure(
      { applicationId, failureStage, requestId },
      err
    );
    const classified = classifyApprovalCaughtError(err);
    return {
      ok: false,
      status: classified.status,
      message: classified.message,
      failureStage,
    };
  }
}

/**
 * Soft-link an unprovisioned application to an existing organization.
 * Does not provision a tenant and does not activate a paid Network subscription.
 */
async function linkRegistrationApplicationToOrganization(db, input) {
  const applicationId = String((input && input.applicationId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const organizationKey = String((input && input.organizationKey) || "")
    .trim()
    .toLowerCase();
  if (!UUID_RE.test(applicationId) || !UUID_RE.test(actorUserId) || !organizationKey) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input" };
  }

  try {
    return await withOwnedClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const app = await repo.lockApplicationById(client, applicationId);
        if (!app) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, message: "not_found" };
        }
        if (app.organization_id || String(app.provisioning_status) === "provisioned") {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_ELIGIBLE, message: "already_linked" };
        }
        if (["rejected", "cancelled"].includes(String(app.application_status || ""))) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_ELIGIBLE, message: "not_eligible" };
        }

        const organizationId = await repo.findOrganizationIdByKey(client, organizationKey);
        if (!organizationId) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, message: "organization_not_found" };
        }

        const linked = await repo.linkApplicationToOrganization(
          client,
          applicationId,
          organizationId
        );
        if (!linked) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_ELIGIBLE, message: "link_failed" };
        }

        await repo.ensureOrganizationOnboardingRow(client, {
          organizationId,
          applicationId,
        });

        const nowIso = new Date().toISOString();
        await repo.updateApplicationRiskReviewState(client, applicationId, {
          reviewEvent: {
            at: nowIso,
            action: "linked_organization",
            actor_user_id: actorUserId,
            status: organizationKey,
          },
        });

        await recordAuditEventSafe(client, {
          deploymentCode: input.deploymentCode || "blessboard-org-v5",
          organizationId,
          actorUserId,
          outcome: "success",
          actionKey: "registration.application_linked",
          entityType: "registration_application",
          entityId: applicationId,
          metadata: {
            category: "registration",
            actor_type: "platform_admin",
            source: "admin_registration_applications",
            status: organizationKey,
          },
        });

        await client.query("COMMIT");
        return {
          ok: true,
          status: STATUS.OK,
          organizationId,
          organizationKey,
        };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "lookup_error" };
  }
}

/**
 * Mark Network validation complete (status-only). Does not provision or activate Network.
 * @param {{ query: Function }} db
 * @param {{ applicationId: string, actorUserId: string, deploymentCode?: string }} input
 */
async function markNetworkValidationComplete(db, input) {
  return updateRegistrationFollowUpStatus(db, {
    applicationId: input && input.applicationId,
    actorUserId: input && input.actorUserId,
    followUpStatus: "approved_for_provision",
    deploymentCode: input && input.deploymentCode,
  });
}

module.exports = {
  STATUS,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  ALLOWED_LIMITS,
  normalizeListFilters,
  listRegistrationApplicationsAdmin,
  getRegistrationApplicationDetail,
  loadRegistrationVerificationForDetail,
  loadRegistrationReviewRecommendationForDetail,
  loadRegistrationApprovalChecklistForDetail,
  loadRegistrationPhoneVerificationForDetail,
  loadRegistrationEmailVerificationForDetail,
  loadRegistrationCommunicationsForDetail,
  updateRegistrationFollowUpStatus,
  markNetworkValidationComplete,
  assignRegistrationSupport,
  addRegistrationSupportContact,
  rejectRegistrationApplication,
  reopenRegistrationApplication,
  REJECTION_CATEGORIES,
  REJECTION_CATEGORY_LABELS,
  approveAndProvisionRegistrationApplication,
  linkRegistrationApplicationToOrganization,
  sanitizeProvisioningErrorDetail,
  needsAttention,
  deriveWorkflowStatus,
  computeSupportPriority,
  QUEUES,
  ACTIONS,
  QUEUE_FILTERS,
  presentRegistrationOperatorView,
};
