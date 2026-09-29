"use strict";

/**
 * Opt-in diagnostic platform host-context loader.
 * Parallel to legacy hostname routing — never changes routing, auth, sessions, cookies, or responses.
 *
 * PLATFORM_HOST_CONTEXT_MODE=off|diagnostic (default off).
 * Expected deployment comes from caller-injected identity (PLATFORM_DEPLOYMENT_CODE), not from env reads here.
 */

const {
  getPlatformHostContextMode,
  MODE_OFF,
  MODE_DIAGNOSTIC,
} = require("../config/platformHostContextMode");
const { resolveHostname: resolveEffectiveHostname } = require("../host");
const {
  resolveHostname: resolvePlatformHostname,
  RESULT_TYPES,
} = require("../services/resolveHostname");

/** Same simple skip set used by production morgan access logs — not a full asset classifier. */
const DIAGNOSTIC_LOG_SKIP_EXT = /\.(?:css|js|mjs|map|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot)$/i;

/**
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function shouldSkipDiagnosticLog(req) {
  const p = String((req && req.path) || "");
  if (p === "/healthz") return true;
  if (p.startsWith("/build/")) return true;
  return DIAGNOSTIC_LOG_SKIP_EXT.test(p);
}

/**
 * Strip anything unsafe; keep the structured resolver result only.
 * @param {object | null} resolution
 */
function sanitizeResolutionForRequest(resolution) {
  if (!resolution || typeof resolution !== "object") return null;
  return {
    type: resolution.type || null,
    hostname: resolution.hostname || null,
    domain: resolution.domain || null,
    deployment: resolution.deployment || null,
    product: resolution.product || null,
    organization: resolution.organization || null,
    organizationProduct: resolution.organizationProduct || null,
  };
}

/**
 * Compact diagnostic log for operational lookup failures only.
 * Routine resolutions are logged by the later comparison middleware (platform_host_comparison).
 * @param {import('express').Request} req
 * @param {object} context
 * @param {(line: string) => void} [logFn]
 */
function logPlatformHostContextDiagnostic(req, context, logFn) {
  if (shouldSkipDiagnosticLog(req)) return;
  if (!context || context.resultType !== "lookup_error") return;
  const line = JSON.stringify({
    event: "platform_host_context",
    hostname: context.hostname || null,
    resultType: "lookup_error",
    expectedDeploymentCode: context.expectedDeploymentCode || null,
    deploymentComparisonAvailable: Boolean(context.deploymentComparisonAvailable),
    path: String((req && (req.path || req.url)) || "").split("?")[0] || null,
  });
  const out = typeof logFn === "function" ? logFn : (msg) => console.log(msg);
  out(`[platform-host-context] ${line}`);
}

/**
 * @param {{
 *   getPool?: () => { query: Function } | null | undefined,
 *   resolveHostname?: Function,
 *   getEffectiveHostname?: (req: import('express').Request) => string,
 *   getMode?: () => string,
 *   getDeploymentIdentity?: () => { ok: boolean, status?: string, code: string | null },
 *   log?: (line: string) => void,
 * }} [deps]
 */
function createLoadPlatformHostContext(deps) {
  const options = deps && typeof deps === "object" ? deps : {};
  const getPool = options.getPool;
  const resolveFn = options.resolveHostname || resolvePlatformHostname;
  const getEffectiveHostname = options.getEffectiveHostname || resolveEffectiveHostname;
  const getMode = options.getMode || getPlatformHostContextMode;
  const getDeploymentIdentity = options.getDeploymentIdentity;
  const logFn = options.log;

  return async function loadPlatformHostContext(req, res, next) {
    const mode = getMode();

    if (mode !== MODE_DIAGNOSTIC) {
      req.platformHostContext = { enabled: false, mode: MODE_OFF };
      return next();
    }

    let expectedDeploymentCode = null;
    let deploymentComparisonAvailable = false;
    if (typeof getDeploymentIdentity === "function") {
      try {
        const identity = getDeploymentIdentity();
        if (identity && identity.ok && identity.code) {
          expectedDeploymentCode = String(identity.code).trim();
          deploymentComparisonAvailable = true;
        }
      } catch {
        expectedDeploymentCode = null;
        deploymentComparisonAvailable = false;
      }
    }

    let effectiveHostname = "";
    try {
      effectiveHostname = String(getEffectiveHostname(req) || "");
    } catch {
      effectiveHostname = "";
    }

    try {
      if (typeof getPool !== "function") {
        throw new Error("platform host context requires getPool()");
      }
      const pool = getPool();
      if (!pool || typeof pool.query !== "function") {
        throw new Error("platform host context pool is not query-capable");
      }

      const resolveOptions = expectedDeploymentCode
        ? { expectedDeploymentCode }
        : undefined;
      const resolution = await resolveFn(pool, effectiveHostname, resolveOptions);
      const safe = sanitizeResolutionForRequest(resolution);

      req.platformHostContext = {
        enabled: true,
        mode: MODE_DIAGNOSTIC,
        expectedDeploymentCode,
        deploymentComparisonAvailable,
        hostname: (safe && safe.hostname) || effectiveHostname || null,
        resultType: (safe && safe.type) || RESULT_TYPES.UNKNOWN_DOMAIN,
        resolution: safe,
      };
      logPlatformHostContextDiagnostic(req, req.platformHostContext, logFn);
    } catch {
      req.platformHostContext = {
        enabled: true,
        mode: MODE_DIAGNOSTIC,
        expectedDeploymentCode,
        deploymentComparisonAvailable,
        hostname: effectiveHostname || null,
        resultType: "lookup_error",
        resolution: null,
      };
      logPlatformHostContextDiagnostic(req, req.platformHostContext, logFn);
    }

    return next();
  };
}

module.exports = {
  createLoadPlatformHostContext,
  shouldSkipDiagnosticLog,
  sanitizeResolutionForRequest,
  logPlatformHostContextDiagnostic,
};
