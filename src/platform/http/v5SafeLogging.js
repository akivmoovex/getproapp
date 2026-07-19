"use strict";

/**
 * Safe V5 request identity + terminal error handling.
 * Never log cookies, Authorization, bodies, DATABASE_URL, tokens, or full stacks in production.
 */

const crypto = require("crypto");

const GENERIC_SERVER_ERROR = "Something went wrong. Please try again.";

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function assignV5RequestId(req, res, next) {
  const incoming = req.headers && req.headers["x-request-id"];
  const raw = Array.isArray(incoming) ? incoming[0] : incoming;
  const candidate = String(raw || "")
    .trim()
    .slice(0, 64);
  const requestId =
    candidate && /^[A-Za-z0-9._-]+$/.test(candidate)
      ? candidate
      : crypto.randomBytes(12).toString("hex");
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  return next();
}

/**
 * Compact safe error log fields (no headers/cookies/body/stack by default).
 * @param {Error & { code?: string, status?: number, statusCode?: number }} err
 * @param {import('express').Request} req
 * @param {{ includeMessage?: boolean }} [opts]
 */
function buildSafeErrorLog(err, req, opts) {
  const includeMessage = Boolean(opts && opts.includeMessage);
  const status =
    (err && (err.statusCode || err.status) && Number(err.statusCode || err.status)) || 500;
  const code =
    err && err.code != null && String(err.code).trim()
      ? String(err.code).trim().slice(0, 64)
      : "internal_error";
  const payload = {
    event: "blessboard_v5_error",
    requestId: (req && req.requestId) || null,
    method: (req && req.method) || null,
    path: String((req && (req.path || req.url)) || "").split("?")[0] || null,
    status: Number.isFinite(status) && status >= 400 ? status : 500,
    code,
  };
  if (includeMessage && err && err.message) {
    payload.message = String(err.message).slice(0, 160);
  }
  return payload;
}

/**
 * Terminal Express error middleware for V5 foundation.
 * @param {{ env?: NodeJS.ProcessEnv, log?: (line: string) => void }} [deps]
 */
function createV5ErrorHandler(deps) {
  const options = deps && typeof deps === "object" ? deps : {};
  const env = options.env || process.env;
  const isProduction = String(env.NODE_ENV || "") === "production";
  const logFn =
    typeof options.log === "function"
      ? options.log
      : (line) => {
          // eslint-disable-next-line no-console
          console.error(line);
        };

  // eslint-disable-next-line no-unused-vars
  return function v5ErrorHandler(err, req, res, next) {
    if (res.headersSent) {
      return next(err);
    }
    const payload = buildSafeErrorLog(err, req, { includeMessage: !isProduction });
    try {
      logFn(`[blessboard-v5] ${JSON.stringify(payload)}`);
    } catch {
      /* ignore */
    }
    const status = payload.status >= 400 && payload.status < 600 ? payload.status : 500;
    if (req.accepts && req.accepts("json") && !req.accepts("html")) {
      return res.status(status).json({ ok: false, reason: "server_error", requestId: req.requestId || null });
    }
    return res.status(status).type("text").send(GENERIC_SERVER_ERROR);
  };
}

/**
 * Safe pool / DB error message for operators (no connection string, no SQL params).
 * @param {Error & { code?: string }} err
 */
function formatSafePoolErrorMessage(err) {
  const code = err && err.code != null ? String(err.code).trim().slice(0, 32) : "";
  if (code) return `code=${code}`;
  return "pool_error";
}

module.exports = {
  GENERIC_SERVER_ERROR,
  assignV5RequestId,
  buildSafeErrorLog,
  createV5ErrorHandler,
  formatSafePoolErrorMessage,
};
