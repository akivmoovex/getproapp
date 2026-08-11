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

  const platform = Object.freeze({
    environment: runtimeEnvironment,
    productKey,
    brand: brand || (product && product.brandName) || null,
    canonicalHost: site.hostname,
    siteType,
    sessionCookieName: site.sessionCookieName,
    csrfCookieName: site.csrfCookieName,
    redirectTargetOrigin: site.redirectTargetOrigin || null,
    productSelection,
    deploymentCode: deployment.code || null,
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
      const status = result.code === "PLATFORM_ENVIRONMENT_HOST_MISMATCH" ? 421 : 404;
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
  resolvePlatformRequestContext,
  createLoadPlatformRequestContext,
};
