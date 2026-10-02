"use strict";

/**
 * Immutable request-level platform context.
 * Runtime/deployment → environment; hostname allowlist → product.
 */

const {
  resolveDeploymentConfiguration,
  hasAuthoritativeDeploymentProfile,
  getDeploymentProfile,
} = require("../config/deploymentProfiles");
const { resolveRequestCanonicalSite } = require("./resolveRequestHostname");
const { getProduct } = require("../config/productRegistry");

class UnknownPlatformHostError extends Error {
  constructor(message, details) {
    super(message || "UNKNOWN_PLATFORM_HOST");
    this.name = "UnknownPlatformHostError";
    this.code = "UNKNOWN_PLATFORM_HOST";
    this.details = details || null;
  }
}

class PlatformEnvironmentHostMismatchError extends Error {
  constructor(message, details) {
    super(message || "PLATFORM_ENVIRONMENT_HOST_MISMATCH");
    this.name = "PlatformEnvironmentHostMismatchError";
    this.code = "PLATFORM_ENVIRONMENT_HOST_MISMATCH";
    this.details = details || null;
  }
}

/**
 * @param {string} runtimeEnvironment
 * @param {{ environment: string, hostname: string }} site
 */
function assertHostnameMatchesEnvironment(runtimeEnvironment, site) {
  const runtime = String(runtimeEnvironment || "")
    .trim()
    .toLowerCase();
  const hostEnv = String(site.environment || "")
    .trim()
    .toLowerCase();
  if (!runtime || !hostEnv) {
    return {
      ok: false,
      code: "PLATFORM_ENVIRONMENT_HOST_MISMATCH",
      message: "Runtime environment or host environment is missing.",
    };
  }
  if (runtime !== hostEnv) {
    return {
      ok: false,
      code: "PLATFORM_ENVIRONMENT_HOST_MISMATCH",
      message:
        `Hostname ${JSON.stringify(site.hostname)} belongs to environment=${hostEnv} ` +
        `but runtime environment is ${runtime}.`,
      runtimeEnvironment: runtime,
      hostEnvironment: hostEnv,
      hostname: site.hostname,
    };
  }
  return { ok: true };
}

/**
 * Hostname-selected platform runtimes only accept hosts listed on the profile
 * apexDomains (prevents V7 pronline hosts on V8 neuniversity workers and vice versa).
 * @param {object|null} profile
 * @param {{ hostname: string, platformLine?: string|null }} site
 */
function assertHostnameAllowedForDeployment(profile, site) {
  if (!profile || profile.productSelection !== "hostname") {
    return { ok: true };
  }
  const apex = Array.isArray(profile.apexDomains) ? profile.apexDomains : [];
  const host = String(site.hostname || "")
    .trim()
    .toLowerCase();
  const allowed = new Set(apex.map((h) => String(h).trim().toLowerCase()).filter(Boolean));
  if (!allowed.has(host)) {
    return {
      ok: false,
      code: "PLATFORM_HOST_NOT_IN_DEPLOYMENT",
      message:
        `Hostname ${JSON.stringify(host)} is not allowed for deployment ` +
        `${JSON.stringify(profile.deploymentCode)}.`,
      hostname: host,
      deploymentCode: profile.deploymentCode,
    };
  }
  const profileLine = String(profile.platformLine || "v7")
    .trim()
    .toLowerCase();
  const hostLine = String(site.platformLine || "v7")
    .trim()
    .toLowerCase();
  if (profileLine && hostLine && profileLine !== hostLine) {
    return {
      ok: false,
      code: "PLATFORM_LINE_HOST_MISMATCH",
      message:
        `Hostname ${JSON.stringify(host)} belongs to platformLine=${hostLine} ` +
        `but deployment ${profile.deploymentCode} is platformLine=${profileLine}.`,
      hostname: host,
      deploymentCode: profile.deploymentCode,
      platformLine: profileLine,
      hostPlatformLine: hostLine,
    };
  }
  return { ok: true };
}

/**
 * Build immutable platform context from runtime + hostname.
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   req?: import('express').Request,
 *   hostname?: string,
 *   allowTestHostOverride?: boolean,
 * }} [input]
 */
function resolvePlatformRequestContext(input) {
  const opts = input || {};
  const env = opts.env || process.env;
  const deployment = resolveDeploymentConfiguration(env);
  const runtimeEnvironment =
    deployment.environment ||
    String(env.DEPLOYMENT_ENV || "")
      .trim()
      .toLowerCase() ||
    null;

  const profile = hasAuthoritativeDeploymentProfile(env)
    ? getDeploymentProfile(env)
    : null;
  const productSelection =
    (profile && profile.productSelection) ||
    (deployment.productSelection) ||
    "profile";

  let site = null;
  let hostname = opts.hostname || null;
  let hostSource = "explicit";

  if (opts.req) {
    const resolved = resolveRequestCanonicalSite(opts.req, {
      env,
      allowTestHostOverride: opts.allowTestHostOverride,
    });
    if (!resolved.ok) {
      return {
        ok: false,
        code: resolved.code,
        message: resolved.message,
        runtimeEnvironment,
        productSelection,
        deployment,
      };
    }
    site = resolved.site;
    hostname = resolved.hostname;
    hostSource = resolved.source;
  } else if (hostname) {
    const { resolveCanonicalHost } = require("../config/canonicalHostRegistry");
    const resolved = resolveCanonicalHost(hostname);
    if (!resolved.ok) {
      return {
        ok: false,
        code: resolved.code,
        message: resolved.message,
        runtimeEnvironment,
        productSelection,
        deployment,
      };
    }
    site = resolved.site;
  }

  if (!site) {
    return {
      ok: false,
      code: "missing_host",
      message: "Hostname is required to resolve platform context.",
      runtimeEnvironment,
      productSelection,
      deployment,
    };
  }

  const match = assertHostnameMatchesEnvironment(runtimeEnvironment, {
    environment: site.environment,
    hostname: site.hostname,
  });
  if (!match.ok) {
    return {
      ok: false,
      code: match.code,
      message: match.message,
      runtimeEnvironment,
      hostEnvironment: site.environment,
      hostname: site.hostname,
      productSelection,
      deployment,
    };
  }

  const apexMatch = assertHostnameAllowedForDeployment(profile, site);
  if (!apexMatch.ok) {
    return {
      ok: false,
      code: apexMatch.code,
      message: apexMatch.message,
      runtimeEnvironment,
      hostname: site.hostname,
      productSelection,
      deployment,
      platformLine: profile && profile.platformLine ? profile.platformLine : null,
    };
  }

  let productKey = null;
  let brand = site.brand;
  let siteType = site.siteType;

  if (productSelection === "hostname") {
    productKey = site.productKey;
  } else if (deployment.productCode && deployment.productCode !== "platform") {
    // Transitional product-specific profile: hostname must agree when known.
    productKey = deployment.productCode;
    if (site.productKey && site.productKey !== productKey && siteType === "product") {
      return {
        ok: false,
        code: "PLATFORM_PROFILE_HOST_PRODUCT_MISMATCH",
        message:
          `Deployment product ${JSON.stringify(productKey)} does not match ` +
          `hostname product ${JSON.stringify(site.productKey)}.`,
        runtimeEnvironment,
        hostname: site.hostname,
        productSelection,
        deployment,
      };
    }
  } else {
    productKey = site.productKey;
  }

  const product = productKey ? getProduct(productKey) : null;
  if (productKey && !product) {
    return {
      ok: false,
      code: "UNKNOWN_PLATFORM_PRODUCT",
      message: `Unknown product ${JSON.stringify(productKey)}.`,
      runtimeEnvironment,
      hostname: site.hostname,
      deployment,
    };
  }

  // Unified hostname runtimes (moovex-platform-*) must use the deployment-profile
  // cookie names for both Set-Cookie and session load. Host-registry names
  // (e.g. blessboard_pronline_sid) are for product-specific deployments only.
  // Live failure: login wrote moovex_platform_testing_sid (profile) while GET /admin
  // looked for blessboard_pronline_sid (host registry) → no_session_cookie.
  const useDeploymentCookies =
    productSelection === "hostname" &&
    profile &&
    profile.sessionCookieName &&
    profile.csrfCookieName;

  const platform = Object.freeze({
    environment: runtimeEnvironment,
    productKey,
    brand: brand || (product && product.brandName) || null,
    canonicalHost: site.hostname,
    siteType,
    sessionCookieName: useDeploymentCookies
      ? profile.sessionCookieName
      : site.sessionCookieName,
    csrfCookieName: useDeploymentCookies
      ? profile.csrfCookieName
      : site.csrfCookieName,
    redirectTargetOrigin: site.redirectTargetOrigin || null,
    productSelection,
    deploymentCode: deployment.code || null,
    platformLine:
      (profile && profile.platformLine) || site.platformLine || "v7",
    hostSource,
  });

  return {
    ok: true,
    platform,
    site,
    runtimeEnvironment,
    productSelection,
    deployment,
  };
}

/**
 * Express middleware: attach frozen req.platform or fail closed.
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   allowTestHostOverride?: boolean,
 *   onUnknown?: (req, res, result) => void,
 * }} [opts]
 */
function createLoadPlatformRequestContext(opts) {
  const options = opts || {};
  return function loadPlatformRequestContext(req, res, next) {
    const result = resolvePlatformRequestContext({
      env: options.env || process.env,
      req,
      allowTestHostOverride: options.allowTestHostOverride,
    });
    if (!result.ok) {
      if (typeof options.onUnknown === "function") {
        return options.onUnknown(req, res, result);
      }
      const status =
        result.code === "PLATFORM_ENVIRONMENT_HOST_MISMATCH" ||
        result.code === "PLATFORM_HOST_NOT_IN_DEPLOYMENT" ||
        result.code === "PLATFORM_LINE_HOST_MISMATCH"
          ? 421
          : 404;
      return res.status(status).json({
        ok: false,
        code: result.code,
        message: "Platform host could not be resolved safely.",
      });
    }
    Object.defineProperty(req, "platform", {
      value: result.platform,
      writable: false,
      configurable: false,
      enumerable: true,
    });
    return next();
  };
}

module.exports = {
  UnknownPlatformHostError,
  PlatformEnvironmentHostMismatchError,
  assertHostnameMatchesEnvironment,
  assertHostnameAllowedForDeployment,
  resolvePlatformRequestContext,
  createLoadPlatformRequestContext,
};
