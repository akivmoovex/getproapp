"use strict";

const { normalizeHostFromRequest } = require("./host");

/**
 * Classify PostgreSQL / pool errors without exposing secrets.
 * @param {Error | unknown} err
 * @returns {{ kind: string, message: string }}
 */
function classifyPgError(err) {
  const message = err && err.message ? String(err.message) : String(err || "Database error");
  const lower = message.toLowerCase();
  if (/timeout|timed out|connection terminated/.test(lower)) {
    return { kind: "timeout", message };
  }
  if (/econnrefused|enotfound|socket|connect e/.test(lower)) {
    return { kind: "connection", message };
  }
  if (/too many clients|remaining connection slots|pool/.test(lower)) {
    return { kind: "pool_exhausted", message };
  }
  return { kind: "other", message };
}

function isChurchDbResolutionError(err) {
  const { kind } = classifyPgError(err);
  return kind === "timeout" || kind === "connection" || kind === "pool_exhausted" || kind === "other";
}

/**
 * Safe structured log for church branch resolution failures.
 */
function logChurchDbResolutionFailure(req, parsed, hostSlug, err) {
  const classified = classifyPgError(err);
  const host = normalizeHostFromRequest(req);
  // eslint-disable-next-line no-console
  console.error("[church] branch resolution failed", {
    host,
    slug: hostSlug || null,
    path: req.originalUrl || req.url || "",
    kind: classified.kind,
    message: classified.message,
  });
}

function renderChurchServiceUnavailable(req, res) {
  const { renderChurchFailureState } = require("./churchFailureStates");
  return renderChurchFailureState(req, res, "service_unavailable", {
    requestedHost: normalizeHostFromRequest(req),
    shell: "public",
  });
}

module.exports = {
  classifyPgError,
  isChurchDbResolutionError,
  logChurchDbResolutionFailure,
  renderChurchServiceUnavailable,
};
