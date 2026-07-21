"use strict";

/**
 * Minimal safe structured logs for V5 apex login / session / platform-admin gates.
 * Never logs emails, passwords, hashes, tokens, cookies, CSRF, bodies, or SQL params.
 */

/**
 * @param {import('express').Request} req
 * @returns {string}
 */
function safeHost(req) {
  const raw = String((req && req.headers && req.headers.host) || "")
    .trim()
    .toLowerCase()
    .split(":")[0];
  if (!raw) return "";
  if (raw.length > 80) return raw.slice(0, 80);
  return raw;
}

/**
 * @param {import('express').Request} req
 * @returns {string}
 */
function normalizedRoute(req) {
  const pathOnly = String((req && (req.path || req.url)) || "")
    .split("?")[0]
    .trim();
  if (!pathOnly) return "/";
  return pathOnly.length > 120 ? pathOnly.slice(0, 120) : pathOnly;
}

/**
 * @param {unknown} roles
 * @returns {string[] | undefined}
 */
function safeRoleKeys(roles) {
  if (!Array.isArray(roles) || !roles.length) return undefined;
  const keys = [];
  for (const r of roles) {
    const key =
      typeof r === "string"
        ? r
        : String((r && (r.roleKey || r.role_key)) || "").trim();
    if (!key || key.length > 64) continue;
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)) continue;
    if (!keys.includes(key)) keys.push(key);
    if (keys.length >= 12) break;
  }
  return keys.length ? keys : undefined;
}

/**
 * @param {{ log?: (line: string) => void }} [deps]
 */
function createV5AuthLogger(deps) {
  const options = deps && typeof deps === "object" ? deps : {};
  const logFn =
    typeof options.log === "function"
      ? options.log
      : (line) => {
          // eslint-disable-next-line no-console
          console.log(line);
        };

  /**
   * @param {import('express').Request} req
   * @param {string} event
   * @param {Record<string, unknown>} [fields]
   */
  function logAuthEvent(req, event, fields) {
    const name = String(event || "")
      .trim()
      .slice(0, 64);
    if (!name) return;
    const payload = {
      event: name,
      requestId: (req && req.requestId) || null,
      method: (req && req.method) || null,
      route: normalizedRoute(req),
      host: safeHost(req),
      workerPid: process.pid,
    };
    if (fields && typeof fields === "object") {
      if (fields.outcome != null) payload.outcome = String(fields.outcome).slice(0, 64);
      if (fields.failureCategory != null) {
        payload.failureCategory = String(fields.failureCategory).slice(0, 64);
      }
      if (fields.redirectTo != null) {
        payload.redirectTo = String(fields.redirectTo).slice(0, 120);
      }
      if (typeof fields.cookieHeaderPresent === "boolean") {
        payload.cookieHeaderPresent = fields.cookieHeaderPresent;
      }
      if (typeof fields.sessionFound === "boolean") {
        payload.sessionFound = fields.sessionFound;
      }
      if (typeof fields.setCookieIssued === "boolean") {
        payload.setCookieIssued = fields.setCookieIssued;
      }
      if (fields.operation != null) {
        payload.operation = String(fields.operation).slice(0, 80);
      }
      if (fields.pgCode != null) {
        payload.pgCode = String(fields.pgCode).slice(0, 16);
      }
      if (fields.schema != null) {
        payload.schema = String(fields.schema).slice(0, 64);
      }
      if (fields.relation != null) {
        payload.relation = String(fields.relation).slice(0, 64);
      }
      if (fields.column != null) {
        payload.column = String(fields.column).slice(0, 64);
      }
      if (fields.durationMs != null && Number.isFinite(Number(fields.durationMs))) {
        payload.durationMs = Math.max(0, Math.min(Math.round(Number(fields.durationMs)), 600000));
      }
      const roles = safeRoleKeys(fields.roleKeys);
      if (roles) payload.roleKeys = roles;
    }
    try {
      logFn(`[blessboard-v5-auth] ${JSON.stringify(payload)}`);
    } catch {
      /* logging must never throw */
    }
  }

  return { logAuthEvent };
}

module.exports = {
  createV5AuthLogger,
  safeHost,
  normalizedRoute,
  safeRoleKeys,
};
