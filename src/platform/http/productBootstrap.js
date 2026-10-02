"use strict";

/**
 * Central product bootstrap / route-pack resolver.
 * One codebase serves different products based on the resolved deployment profile.
 */

const {
  resolveDeploymentConfiguration,
  hasAuthoritativeDeploymentProfile,
} = require("../config/deploymentProfiles");
const {
  getProduct,
  resolveProductOrError,
  BUSINESS_PRODUCT_CODES,
} = require("../config/productRegistry");

/** Distinctive operational path prefixes per product (server-side isolation checks). */
const PRODUCT_ROUTE_MARKERS = Object.freeze({
  blessboard: Object.freeze([
    "/register-church",
    "/hq",
    "/member",
    "/branch-admin",
  ]),
  activeclinic: Object.freeze([
    "/patients",
    "/pharmacy",
    "/radiology",
    "/__ac",
    "/reception",
    "/clinical",
  ]),
  getpro: Object.freeze(["/leads", "/field-agent", "/companies", "/__getpro"]),
  ngo: Object.freeze(["/programs", "/beneficiaries", "/donors", "/__ngo"]),
  platform: Object.freeze(["/platform-admin", "/__moovex"]),
});

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function resolveDeploymentProduct(env) {
  const source = env || process.env;
  if (!hasAuthoritativeDeploymentProfile(source)) {
    return {
      ok: true,
      productCode: null,
      product: null,
      deployment: resolveDeploymentConfiguration(source),
      legacyUnprofiled: true,
    };
  }
  const deployment = resolveDeploymentConfiguration(source);
  const productCode = deployment.productCode;
  if (!productCode) {
    return {
      ok: false,
      code: "missing_deployment_product",
      message: "Authoritative deployment profile is missing productCode.",
      deployment,
    };
  }
  const resolved = resolveProductOrError(productCode);
  if (!resolved.ok) {
    return { ...resolved, deployment };
  }
  return {
    ok: true,
    productCode,
    product: resolved.product,
    deployment,
    legacyUnprofiled: false,
  };
}

/**
 * Whether a route pack may be registered for the given deployment product.
 * Shared platform routes are always allowed; foreign product packs are not.
 * @param {string|null} deploymentProductCode
 * @param {string} routePackProductCode
 */
function isRoutePackAllowed(deploymentProductCode, routePackProductCode) {
  const pack = String(routePackProductCode || "")
    .trim()
    .toLowerCase();
  if (!pack) return false;
  if (pack === "platform") return true;
  const deployment = String(deploymentProductCode || "")
    .trim()
    .toLowerCase();
  if (!deployment) return false;
  return deployment === pack;
}

/**
 * @param {string} productCode
 * @returns {readonly string[]}
 */
function getProductRouteMarkers(productCode) {
  const key = String(productCode || "")
    .trim()
    .toLowerCase();
  return PRODUCT_ROUTE_MARKERS[key] || Object.freeze([]);
}

/**
 * Foreign product markers that must not appear on a deployment.
 * @param {string} productCode
 */
function getForeignProductRouteMarkers(productCode) {
  const own = String(productCode || "")
    .trim()
    .toLowerCase();
  const foreign = [];
  for (const code of BUSINESS_PRODUCT_CODES) {
    if (code === own) continue;
    foreign.push(...getProductRouteMarkers(code));
  }
  return Object.freeze(foreign);
}

/**
 * Resolve which product loader to invoke for foundation startup.
 * @param {NodeJS.ProcessEnv} [env]
 */
function resolveProductBootstrapTarget(env) {
  const resolved = resolveDeploymentProduct(env);
  if (!resolved.ok) return resolved;
  if (resolved.legacyUnprofiled) {
    return {
      ok: true,
      target: "legacy-unprofiled",
      productCode: null,
      deployment: resolved.deployment,
    };
  }
  const { productCode, deployment, product } = resolved;
  if (deployment.runtimeMode === "legacy-redirect") {
    return {
      ok: true,
      target: "legacy-redirect",
      productCode,
      product,
      deployment,
    };
  }
  if (deployment.productSelection === "hostname") {
    return {
      ok: true,
      target: "moovex-platform-runtime",
      productCode: productCode || "platform",
      product,
      deployment,
    };
  }
  if (productCode === "platform" && deployment.siteType === "corporate") {
    return {
      ok: true,
      target: "moovex-corporate",
      productCode,
      product,
      deployment,
    };
  }
  switch (productCode) {
    case "blessboard":
      return { ok: true, target: "blessboard", productCode, product, deployment };
    case "activeclinic":
      return { ok: true, target: "activeclinic", productCode, product, deployment };
    case "getpro":
      return { ok: true, target: "getpro", productCode, product, deployment };
    case "ngo":
      return { ok: true, target: "ngo", productCode, product, deployment };
    default:
      return {
        ok: false,
        code: "UNKNOWN_PLATFORM_PRODUCT",
        message: `Unknown platform product ${JSON.stringify(productCode)}.`,
        productCode,
        deployment,
      };
  }
}

module.exports = {
  PRODUCT_ROUTE_MARKERS,
  resolveDeploymentProduct,
  resolveProductBootstrapTarget,
  isRoutePackAllowed,
  getProductRouteMarkers,
  getForeignProductRouteMarkers,
  getProduct,
};
