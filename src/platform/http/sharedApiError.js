"use strict";

/**
 * Shared safe API error helpers for BlessBoard + ActiveClinic.
 *
 * Goals:
 * - Consistent field-level + form-level error payloads
 * - Safe HTTP status mapping
 * - Correlation / request IDs for support (never secrets or stacks)
 * - V7-compatible shapes: keep `ok`, `code`/`reason`, and optional additive fields
 */

const crypto = require("crypto");
const { buildSafeErrorLog } = require("./v5SafeLogging");

const HTTP_BY_CODE = Object.freeze({
  ok: 200,
  validation_failed: 400,
  invalid_input: 400,
  invalid_email: 400,
  invalid_phone: 400,
  invalid_url: 400,
  invalid_uuid: 400,
  invalid_text: 400,
  text_too_long: 400,
  text_too_short: 400,
  unsafe_content: 400,
  unsafe_media_type: 400,
  media_too_large: 400,
  required: 400,
  weak_password: 400,
  confirmation_mismatch: 400,
  csrf: 403,
  csrf_invalid: 403,
  forbidden: 403,
  access_denied: 403,
  unauthenticated: 401,
  unauthorized: 401,
  not_found: 404,
  website_instance_not_found: 404,
  media_not_found: 404,
  conflict: 409,
  rate_limit: 429,
  rate_limit_exceeded: 429,
  service_unavailable: 503,
  pool_unavailable: 503,
  server_error: 500,
  internal_error: 500,
  lookup_error: 503,
});

const SENSITIVE_MESSAGE_RE =
  /(password|secret|token|authorization|cookie|database_url|connection string|stack|pg_|ECONN|postgres:\/\/|\/\/.+@)/i;

/**
 * @param {import('express').Request|null|undefined} req
 * @returns {string|null}
 */
function resolveCorrelationId(req) {
  if (!req) return null;
  const fromReq = req.requestId || req.v5RequestId || req.correlationId || null;
  if (fromReq) return String(fromReq).slice(0, 64);
  const header = req.headers && (req.headers["x-request-id"] || req.headers["x-correlation-id"]);
  const raw = Array.isArray(header) ? header[0] : header;
  const candidate = String(raw || "")
    .trim()
    .slice(0, 64);
  if (candidate && /^[A-Za-z0-9._-]+$/.test(candidate)) return candidate;
  return null;
}

/**
 * Ensure the request has a correlation/request id (idempotent).
 * @param {import('express').Request} req
 * @param {import('express').Response} [res]
 */
function ensureCorrelationId(req, res) {
  let id = resolveCorrelationId(req);
  if (!id) {
    id = crypto.randomBytes(12).toString("hex");
  }
  req.requestId = id;
  req.correlationId = id;
  if (res && typeof res.setHeader === "function" && !res.headersSent) {
    res.setHeader("X-Request-Id", id);
    res.setHeader("X-Correlation-Id", id);
  }
  return id;
}

/**
 * @param {unknown} code
 * @param {number} [fallback]
 */
function statusForCode(code, fallback) {
  const key = String(code || "")
    .trim()
    .toLowerCase();
  if (HTTP_BY_CODE[key]) return HTTP_BY_CODE[key];
  const n = Number(fallback);
  if (Number.isFinite(n) && n >= 400 && n < 600) return n;
  return 400;
}

/**
 * Strip DB / credential / stack details from public messages.
 * @param {unknown} value
 * @param {string} [fallback]
 */
function sanitizePublicErrorMessage(value, fallback) {
  const fb = String(fallback || "Something went wrong. Please try again.").trim();
  const text = String(value == null ? "" : value).trim();
  if (!text) return fb;
  if (SENSITIVE_MESSAGE_RE.test(text)) return fb;
  if (/^\s*at\s+\S+/m.test(text) || text.includes("\n    at ")) return fb;
  if (/^[0-9A-Z_]{3,}$/.test(text) && /_ERROR$|_FAILURE$|^E[A-Z]+/.test(text)) return fb;
  return text.slice(0, 240);
}

/**
 * Build a V7-compatible API error body.
 * Additive fields (`fieldErrors`, `formError`, `correlationId`) do not remove
 * legacy `ok` / `code` / `reason` / `requestId`.
 *
 * @param {{
 *   code?: string,
 *   reason?: string,
 *   message?: string,
 *   fieldErrors?: Record<string, string>,
 *   formError?: string|null,
 *   requestId?: string|null,
 *   correlationId?: string|null,
 *   details?: object|null,
 * }} input
 */
function buildSafeApiErrorBody(input) {
  const src = input && typeof input === "object" ? input : {};
  const code = String(src.code || src.reason || "invalid_input")
    .trim()
    .slice(0, 64) || "invalid_input";
  const requestId =
    src.requestId != null
      ? String(src.requestId).slice(0, 64)
      : src.correlationId != null
        ? String(src.correlationId).slice(0, 64)
        : null;
  const body = {
    ok: false,
    code,
    reason: String(src.reason || code).slice(0, 64),
    requestId,
    correlationId: requestId,
  };
  if (src.message) {
    body.message = sanitizePublicErrorMessage(src.message, "Please check your input and try again.");
  }
  if (src.formError) {
    body.formError = sanitizePublicErrorMessage(src.formError, "Please correct the highlighted fields.");
  }
  if (src.fieldErrors && typeof src.fieldErrors === "object" && !Array.isArray(src.fieldErrors)) {
    const fieldErrors = {};
    for (const [k, v] of Object.entries(src.fieldErrors)) {
      if (!k) continue;
      fieldErrors[String(k).slice(0, 64)] = sanitizePublicErrorMessage(v, "Invalid value.");
    }
    if (Object.keys(fieldErrors).length) body.fieldErrors = fieldErrors;
  }
  return body;
}

/**
 * Send a safe JSON API error. Preserves V7 callers that only read `ok`/`code`.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{
 *   status?: number,
 *   code?: string,
 *   reason?: string,
 *   message?: string,
 *   fieldErrors?: Record<string, string>,
 *   formError?: string|null,
 * }} input
 */
function sendSafeApiError(req, res, input) {
  const src = input && typeof input === "object" ? input : {};
  const correlationId = ensureCorrelationId(req, res);
  const code = src.code || src.reason || "invalid_input";
  const status = statusForCode(code, src.status || 400);
  const body = buildSafeApiErrorBody({
    ...src,
    code,
    requestId: correlationId,
    correlationId,
  });
  return res.status(status).json(body);
}

/**
 * Map a validation result from sharedFieldValidators.validateFields.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{ ok: boolean, code?: string, fieldErrors?: object, formError?: string|null }} validation
 */
function sendValidationApiError(req, res, validation) {
  return sendSafeApiError(req, res, {
    status: 400,
    code: "validation_failed",
    reason: (validation && validation.code) || "invalid_input",
    fieldErrors: (validation && validation.fieldErrors) || {},
    formError: (validation && validation.formError) || "Please correct the highlighted fields.",
    message: (validation && validation.formError) || "Please correct the highlighted fields.",
  });
}

/**
 * Map authz failures consistently.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{ code?: string, status?: number }} [input]
 */
function sendAuthorizationApiError(req, res, input) {
  const src = input || {};
  const code = src.code || "forbidden";
  return sendSafeApiError(req, res, {
    status: statusForCode(code, src.status || 403),
    code,
    reason: code,
    message: code === "unauthenticated" ? "Sign in to continue." : "You do not have access.",
  });
}

/**
 * Terminal-safe backend failure (no DB/stack leak).
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {Error & { code?: string, status?: number, statusCode?: number }} err
 * @param {{ log?: (line: string) => void, isProduction?: boolean }} [opts]
 */
function sendBackendFailureApiError(req, res, err, opts) {
  const options = opts || {};
  const isProduction = options.isProduction === true || String(process.env.NODE_ENV || "") === "production";
  const logFn =
    typeof options.log === "function"
      ? options.log
      : (line) => {
          // eslint-disable-next-line no-console
          console.error(line);
        };
  try {
    logFn(JSON.stringify(buildSafeErrorLog(err, req, { includeMessage: !isProduction })));
  } catch {
    /* ignore */
  }
  const status =
    (err && (err.statusCode || err.status) && Number(err.statusCode || err.status)) || 500;
  const safeStatus = status >= 400 && status < 600 ? status : 500;
  const code =
    safeStatus === 503
      ? "service_unavailable"
      : safeStatus === 404
        ? "not_found"
        : "server_error";
  return sendSafeApiError(req, res, {
    status: safeStatus,
    code,
    reason: code,
    message: "Something went wrong. Please try again.",
  });
}

/**
 * Express async route wrapper — rejects become safe API/HTML errors via next(err).
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => unknown} handler
 */
function wrapAsyncRoute(handler) {
  return function sharedAsyncRoute(req, res, next) {
    Promise.resolve()
      .then(() => handler(req, res, next))
      .catch((err) => next(err));
  };
}

/**
 * Normalize unknown thrown values into Error with safe status/code.
 * @param {unknown} err
 */
function normalizeAsyncFailure(err) {
  if (err && typeof err === "object" && err instanceof Error) {
    if (!err.status && !err.statusCode) {
      err.status = 500;
    }
    if (!err.code) err.code = "server_error";
    return err;
  }
  const wrapped = new Error("server_error");
  wrapped.status = 500;
  wrapped.code = "server_error";
  return wrapped;
}

module.exports = {
  HTTP_BY_CODE,
  resolveCorrelationId,
  ensureCorrelationId,
  statusForCode,
  sanitizePublicErrorMessage,
  buildSafeApiErrorBody,
  sendSafeApiError,
  sendValidationApiError,
  sendAuthorizationApiError,
  sendBackendFailureApiError,
  wrapAsyncRoute,
  normalizeAsyncFailure,
};
