"use strict";

/**
 * Safe classification + structured diagnostics for BlessBoard website publish failures.
 * Public responses never include secrets, SQL, tokens, or patient/member PII payloads.
 */

const { readGitShaShort } = require("../../startup/startupProcessMarker");

const EVENT = "blessboard.website.publish_failed";

/** Public-safe reason/status codes allowed in API/UI. */
const PUBLIC_CODES = Object.freeze({
  LOOKUP_ERROR: "lookup_error",
  AUTHZ_UNAVAILABLE: "authz_unavailable",
  READINESS_UNAVAILABLE: "readiness_unavailable",
  WEBSITE_ENGINE_PUBLISH_FAILED: "website_engine_publish_failed",
  WEBSITE_INSTANCE_NOT_FOUND: "website_instance_not_found",
  FORBIDDEN: "forbidden",
  WEBSITE_PUBLISH_LOCKED: "website_publish_locked",
  WEBSITE_POLICY_LOCKED: "website_policy_locked",
  V8_INCOMPATIBLE_PUBLISH: "v8_incompatible_publish",
  PARTIAL_PAGE_PUBLISH: "partial_page_publish",
  APPLY_FAILED: "apply_failed",
  INVALID_FIELD: "invalid_field",
  INVALID_PAGE: "invalid_page",
  INVALID_SECTION: "invalid_section",
  INVALID_SCOPE: "invalid_scope",
  CONSTRAINT_VIOLATION: "constraint_violation",
  CONFLICT: "conflict",
  NOT_READY: "not_ready",
  NO_CHANGES: "no_changes",
  CONFIRM_PUBLISH: "confirm_publish",
  PUBLISH_FAILED: "publish_failed",
  VALIDATION_FAILED: "validation_failed",
});

const ENGINE_CODE_TO_PUBLIC = Object.freeze({
  website_instance_not_found: PUBLIC_CODES.WEBSITE_INSTANCE_NOT_FOUND,
  forbidden: PUBLIC_CODES.FORBIDDEN,
  tenant_mismatch: PUBLIC_CODES.FORBIDDEN,
  website_publish_locked: PUBLIC_CODES.WEBSITE_PUBLISH_LOCKED,
  website_policy_locked: PUBLIC_CODES.WEBSITE_POLICY_LOCKED,
  v8_incompatible_publish: PUBLIC_CODES.V8_INCOMPATIBLE_PUBLISH,
  website_edit_locked: PUBLIC_CODES.WEBSITE_PUBLISH_LOCKED,
  media_not_found: "media_not_found",
  media_forbidden: "media_forbidden",
});

const APPLY_CODES = new Set([
  "APPLY_FAILED",
  "INVALID_FIELD",
  "INVALID_PAGE",
  "INVALID_SECTION",
  "INVALID_SCOPE",
  "PAGE_MISSING",
]);

const FRIENDLY_MESSAGE = Object.freeze({
  [PUBLIC_CODES.LOOKUP_ERROR]:
    "Website data could not be loaded. Drafts were preserved — try again shortly.",
  [PUBLIC_CODES.AUTHZ_UNAVAILABLE]:
    "Publish permission could not be verified right now. Drafts were preserved — try again shortly.",
  [PUBLIC_CODES.READINESS_UNAVAILABLE]:
    "Website readiness could not be evaluated. Drafts were preserved — try again shortly.",
  [PUBLIC_CODES.WEBSITE_ENGINE_PUBLISH_FAILED]:
    "Publishing to the live website engine failed. Drafts were preserved — try again.",
  [PUBLIC_CODES.WEBSITE_INSTANCE_NOT_FOUND]:
    "This church website is not fully set up for publishing yet. Contact support if this continues.",
  [PUBLIC_CODES.FORBIDDEN]: "You do not have permission to publish these changes.",
  [PUBLIC_CODES.WEBSITE_PUBLISH_LOCKED]:
    "Publishing is locked for this website. Contact an administrator.",
  [PUBLIC_CODES.WEBSITE_POLICY_LOCKED]:
    "These changes require review before they can go live.",
  [PUBLIC_CODES.V8_INCOMPATIBLE_PUBLISH]:
    "Some draft content is not compatible with the live website format. Review drafts and try again.",
  [PUBLIC_CODES.PARTIAL_PAGE_PUBLISH]:
    "Not all website pages could be updated. Drafts were preserved — try again.",
  [PUBLIC_CODES.APPLY_FAILED]:
    "Draft changes could not be applied. Drafts were preserved — review and try again.",
  [PUBLIC_CODES.INVALID_FIELD]:
    "One draft field is not valid for publishing. Edit the draft and try again.",
  [PUBLIC_CODES.INVALID_PAGE]:
    "A draft targets an unknown page. Discard or fix that draft, then try again.",
  [PUBLIC_CODES.INVALID_SECTION]:
    "A draft targets an invalid section. Discard or fix that draft, then try again.",
  [PUBLIC_CODES.INVALID_SCOPE]:
    "Draft scope does not match this church. Drafts were preserved.",
  [PUBLIC_CODES.CONSTRAINT_VIOLATION]:
    "A draft value failed a website content rule. Edit the draft and try again.",
  [PUBLIC_CODES.CONFLICT]:
    "Someone else updated this website while you were publishing. Refresh, review drafts, and try again.",
  [PUBLIC_CODES.NOT_READY]:
    "Website is not ready to publish. Review the issues listed, then try again.",
  [PUBLIC_CODES.NO_CHANGES]: "There are no draft changes to publish.",
  [PUBLIC_CODES.CONFIRM_PUBLISH]: "Confirm publication before continuing.",
  [PUBLIC_CODES.PUBLISH_FAILED]:
    "We could not publish these changes. Drafts were preserved — try again.",
  [PUBLIC_CODES.VALIDATION_FAILED]:
    "Website validation failed. Review the issues and try again.",
  media_not_found: "A selected image is missing. Replace it in the draft and try again.",
  media_forbidden: "A selected image cannot be used on this website.",
});

function safeId(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, 80);
}

function safeCode(value) {
  if (value == null) return null;
  const text = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_")
    .slice(0, 80);
  return text || null;
}

function publicMessageForCode(code) {
  const key = String(code || "").trim();
  if (FRIENDLY_MESSAGE[key]) return FRIENDLY_MESSAGE[key];
  const lower = key.toLowerCase();
  if (FRIENDLY_MESSAGE[lower]) return FRIENDLY_MESSAGE[lower];
  return FRIENDLY_MESSAGE[PUBLIC_CODES.PUBLISH_FAILED];
}

/**
 * Map a thrown error / known publish failure into a public-safe classification.
 * @param {object|null|undefined} err
 * @param {{ stageHint?: string, reasonHint?: string } } [opts]
 */
function classifyPublishFailure(err, opts) {
  const options = opts || {};
  const code = err && err.code != null ? String(err.code) : "";
  const engineCodeRaw =
    (err && err.engineCode != null && String(err.engineCode)) ||
    (code === "WEBSITE_ENGINE_PUBLISH" && err && err.causeCode) ||
    "";
  const engineCode = safeCode(engineCodeRaw);
  const pgCode = err && err.code && /^[0-9A-Z]{5}$/.test(String(err.code)) ? String(err.code) : null;

  if (code === "PARTIAL_PAGE_PUBLISH") {
    return {
      status: "conflict",
      reason: PUBLIC_CODES.PARTIAL_PAGE_PUBLISH,
      publicCode: PUBLIC_CODES.PARTIAL_PAGE_PUBLISH,
      engineCode: null,
      failureStage: "page_update",
      classification: "conflict",
      httpStatusHint: 409,
    };
  }

  if (code === "PUBLISH_FAILED" && err && err.publishResult) {
    const nested = err.publishResult;
    return {
      status: nested.status || "publish_failed",
      reason: nested.reason || PUBLIC_CODES.PUBLISH_FAILED,
      publicCode: nested.reason || nested.status || PUBLIC_CODES.PUBLISH_FAILED,
      engineCode: nested.engineCode || null,
      failureStage: nested.failureStage || "publish_church_website",
      classification: nested.classification || "publish_failed",
      httpStatusHint: nested.httpStatusHint || 500,
      gaps: nested.gaps || null,
      publishResult: nested,
    };
  }

  if (code === "CROSS_ORG" || code === "INVALID_SCOPE" || code === "forbidden") {
    return {
      status: "forbidden",
      reason: PUBLIC_CODES.FORBIDDEN,
      publicCode: PUBLIC_CODES.FORBIDDEN,
      engineCode: null,
      failureStage: options.stageHint || "authorization",
      classification: "authorization",
      httpStatusHint: 403,
    };
  }

  if (APPLY_CODES.has(code)) {
    const publicCode = safeCode(code) || PUBLIC_CODES.APPLY_FAILED;
    return {
      status: "apply_error",
      reason: publicCode,
      publicCode,
      engineCode: null,
      failureStage: "apply_drafts",
      classification: "apply",
      httpStatusHint: 400,
    };
  }

  if (code === "WEBSITE_ENGINE_PUBLISH") {
    const mapped =
      (engineCode && ENGINE_CODE_TO_PUBLIC[engineCode]) ||
      PUBLIC_CODES.WEBSITE_ENGINE_PUBLISH_FAILED;
    return {
      status: "engine_error",
      reason: mapped,
      publicCode: mapped,
      engineCode: engineCode || "website_engine_publish_failed",
      failureStage: "engine_bridge",
      classification: "engine",
      httpStatusHint: mapped === PUBLIC_CODES.FORBIDDEN ? 403 : mapped === PUBLIC_CODES.WEBSITE_INSTANCE_NOT_FOUND ? 404 : 500,
    };
  }

  if (engineCode && ENGINE_CODE_TO_PUBLIC[engineCode]) {
    const mapped = ENGINE_CODE_TO_PUBLIC[engineCode];
    return {
      status: "engine_error",
      reason: mapped,
      publicCode: mapped,
      engineCode,
      failureStage: options.stageHint || "engine_bridge",
      classification: "engine",
      httpStatusHint: 500,
    };
  }

  if (pgCode === "23505") {
    return {
      status: "conflict",
      reason: PUBLIC_CODES.CONFLICT,
      publicCode: PUBLIC_CODES.CONFLICT,
      engineCode: null,
      failureStage: options.stageHint || "database",
      classification: "constraint",
      httpStatusHint: 409,
      databaseCode: pgCode,
    };
  }
  if (pgCode === "23514" || pgCode === "23503" || pgCode === "23502") {
    return {
      status: "constraint_violation",
      reason: PUBLIC_CODES.CONSTRAINT_VIOLATION,
      publicCode: PUBLIC_CODES.CONSTRAINT_VIOLATION,
      engineCode: null,
      failureStage: options.stageHint || "database",
      classification: "constraint",
      httpStatusHint: 400,
      databaseCode: pgCode,
    };
  }

  if (options.reasonHint === "lookup" || options.reasonHint === "authz_check") {
    const isAuthz = options.reasonHint === "authz_check";
    return {
      status: isAuthz ? "authz_unavailable" : "lookup_error",
      reason: isAuthz ? PUBLIC_CODES.AUTHZ_UNAVAILABLE : PUBLIC_CODES.LOOKUP_ERROR,
      publicCode: isAuthz ? PUBLIC_CODES.AUTHZ_UNAVAILABLE : PUBLIC_CODES.LOOKUP_ERROR,
      engineCode: null,
      failureStage: isAuthz ? "authorization" : "tenant_lookup",
      classification: isAuthz ? "authorization" : "lookup",
      httpStatusHint: 503,
    };
  }

  if (options.reasonHint === "readiness") {
    return {
      status: "readiness_unavailable",
      reason: PUBLIC_CODES.READINESS_UNAVAILABLE,
      publicCode: PUBLIC_CODES.READINESS_UNAVAILABLE,
      engineCode: null,
      failureStage: "readiness",
      classification: "readiness",
      httpStatusHint: 503,
    };
  }

  // Unknown — do NOT label as lookup_error.
  return {
    status: "publish_failed",
    reason: PUBLIC_CODES.PUBLISH_FAILED,
    publicCode: PUBLIC_CODES.PUBLISH_FAILED,
    engineCode: engineCode || safeCode(code),
    failureStage: options.stageHint || "unknown",
    classification: "unknown",
    httpStatusHint: 500,
    errorClass: safeCode((err && (err.name || err.code)) || "Error"),
  };
}

/**
 * Structured failed-publish log (no secrets). Safe to call once per failure.
 * @param {object} input
 */
function logFailedPublishDiagnostics(input) {
  const src = input || {};
  const classified = src.classified || classifyPublishFailure(src.err, {
    stageHint: src.failureStage,
    reasonHint: src.reasonHint,
  });
  const includeStack =
    src.includeStack === true &&
    process.env.NODE_ENV !== "production" &&
    src.err &&
    src.err.stack;
  const payload = {
    event: EVENT,
    outcome: "failure",
    product: "BlessBoard",
    timestamp: new Date().toISOString(),
    requestId: safeId(src.requestId),
    correlationId: safeId(src.correlationId || src.requestId),
    deploymentSha: safeId(src.deploymentSha || readGitShaShort()),
    operation: safeId(src.operation) || "publish",
    organizationId: safeId(src.organizationId),
    churchId: safeId(src.churchId),
    branchId: safeId(src.branchId),
    instanceId: safeId(src.instanceId || (src.err && src.err.instanceId)),
    httpStatus: src.httpStatus != null ? Number(src.httpStatus) : classified.httpStatusHint || null,
    publicCode: classified.publicCode,
    engineCode: classified.engineCode || null,
    failureStage: classified.failureStage,
    classification: classified.classification,
    databaseCode: classified.databaseCode || null,
    errorClass: classified.errorClass || safeCode(src.err && (src.err.name || src.err.code)) || null,
  };
  if (includeStack) {
    payload.stack = String(src.err.stack).split("\n").slice(0, 12).join("\n");
  }
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(payload));
  return payload;
}

/**
 * Build a service-layer failure result object.
 */
function buildPublishFailureResult(err, opts) {
  const options = opts || {};
  const classified = classifyPublishFailure(err, options);
  const logged =
    options.skipLog === true
      ? null
      : logFailedPublishDiagnostics({
          err,
          classified,
          operation: options.operation,
          organizationId: options.organizationId,
          churchId: options.churchId,
          branchId: options.branchId,
          instanceId: options.instanceId,
          requestId: options.requestId,
          correlationId: options.correlationId,
          failureStage: classified.failureStage,
          reasonHint: options.reasonHint,
          httpStatus: classified.httpStatusHint,
          includeStack: options.includeStack === true,
        });
  return {
    ok: false,
    status: classified.status,
    reason: classified.reason,
    publicCode: classified.publicCode,
    engineCode: classified.engineCode,
    failureStage: classified.failureStage,
    classification: classified.classification,
    httpStatusHint: classified.httpStatusHint,
    message: publicMessageForCode(classified.publicCode),
    gaps: classified.gaps || options.gaps || null,
    publishResult: classified.publishResult || null,
    diagnosticsEvent: logged ? EVENT : null,
  };
}

module.exports = {
  EVENT,
  PUBLIC_CODES,
  FRIENDLY_MESSAGE,
  ENGINE_CODE_TO_PUBLIC,
  classifyPublishFailure,
  logFailedPublishDiagnostics,
  buildPublishFailureResult,
  publicMessageForCode,
};
