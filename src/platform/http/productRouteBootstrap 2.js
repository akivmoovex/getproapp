"use strict";

/**
 * Product-aware route registration boundary for the shared foundation runtime.
 * BlessBoard and ActiveClinic routers remain owned by their foundation servers;
 * GetPro / Netraz (ngo) mount foundation surfaces; Moovex is corporate-only.
 */

const { getDeploymentProfile, hasAuthoritativeDeploymentProfile } = require("../config/deploymentProfiles");
const { getProduct, resolveProductOrError } = require("../config/productRegistry");
const { isRoutePackAllowed } = require("./productBootstrap");

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null}
 */
function resolveRuntimeProductCode(env) {
  const source = env || process.env;
  if (!hasAuthoritativeDeploymentProfile(source)) return null;
  const profile = getDeploymentProfile(source);
  return profile && profile.productCode ? String(profile.productCode) : null;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ ok: true, productCode: string|null, product: object|null } | { ok: false, code: string, message: string }}
 */
function resolveRuntimeProductOrError(env) {
  const productCode = resolveRuntimeProductCode(env);
  if (!productCode) {
    return { ok: true, productCode: null, product: null };
  }
  const resolved = resolveProductOrError(productCode);
  if (!resolved.ok) return resolved;
  return { ok: true, productCode, product: resolved.product };
}

/**
 * Shared platform routes (health, diagnostics markers). Callers may already mount /healthz.
 * @param {import('express').Application} app
 * @param {{ env?: NodeJS.ProcessEnv }} [ctx]
 */
function registerPlatformRoutes(app, ctx) {
  void app;
  void ctx;
  return { registered: "platform", routes: [] };
}

/**
 * BlessBoard product route pack marker. Actual routers remain in v5FoundationServer
 * until a gradual extraction is safe.
 * @param {import('express').Application} app
 * @param {{ env?: NodeJS.ProcessEnv }} [ctx]
 */
function registerBlessBoardRoutes(app, ctx) {
  const env = (ctx && ctx.env) || process.env;
  const productCode = resolveRuntimeProductCode(env);
  if (!isRoutePackAllowed(productCode, "blessboard")) {
    throw new Error(
      `registerBlessBoardRoutes refused for deployment product ${JSON.stringify(productCode)}`
    );
  }
  void app;
  return { registered: "blessboard", routes: "delegated-to-v5FoundationServer" };
}

/**
 * ActiveClinic product routes — full pack lives in activeClinicFoundationServer.
 * This registrar remains a documented boundary; do not mount on foreign products.
 * @param {import('express').Application} app
 * @param {{ env?: NodeJS.ProcessEnv }} [ctx]
 */
function registerActiveClinicRoutes(app, ctx) {
  const env = (ctx && ctx.env) || process.env;
  const productCode = resolveRuntimeProductCode(env);
  if (!isRoutePackAllowed(productCode, "activeclinic")) {
    throw new Error(
      `registerActiveClinicRoutes refused for deployment product ${JSON.stringify(productCode)}`
    );
  }
  void app;
  return { registered: "activeclinic", routes: "delegated-to-activeClinicFoundationServer" };
}

/**
 * @param {import('express').Application} app
 * @param {{ env?: NodeJS.ProcessEnv }} [ctx]
 */
function registerGetProRoutes(app, ctx) {
  const env = (ctx && ctx.env) || process.env;
  const productCode = resolveRuntimeProductCode(env);
  if (!isRoutePackAllowed(productCode, "getpro")) {
    throw new Error(
      `registerGetProRoutes refused for deployment product ${JSON.stringify(productCode)}`
    );
  }
  void app;
  return { registered: "getpro", routes: "delegated-to-getproFoundationServer" };
}

/**
 * Netraz (product key ngo) route pack boundary.
 * @param {import('express').Application} app
 * @param {{ env?: NodeJS.ProcessEnv }} [ctx]
 */
function registerNgoRoutes(app, ctx) {
  const env = (ctx && ctx.env) || process.env;
  const productCode = resolveRuntimeProductCode(env);
  if (!isRoutePackAllowed(productCode, "ngo")) {
    throw new Error(
      `registerNgoRoutes refused for deployment product ${JSON.stringify(productCode)}`
    );
  }
  const product = getProduct("ngo");
  void app;
  return {
    registered: "ngo",
    brand: product && product.brandName,
    routes: "delegated-to-ngoFoundationServer",
  };
}

/**
 * Register only the route pack matching the deployment product.
 * @param {import('express').Application} app
 * @param {{ env?: NodeJS.ProcessEnv }} [ctx]
 */
function registerRoutesForDeploymentProduct(app, ctx) {
  const env = (ctx && ctx.env) || process.env;
  registerPlatformRoutes(app, { env });
  const productCode = resolveRuntimeProductCode(env);
  if (!productCode) {
    return { registered: null, reason: "unprofiled" };
  }
  switch (productCode) {
    case "blessboard":
      return registerBlessBoardRoutes(app, { env });
    case "activeclinic":
      return registerActiveClinicRoutes(app, { env });
    case "getpro":
      return registerGetProRoutes(app, { env });
    case "ngo":
      return registerNgoRoutes(app, { env });
    case "platform":
      return registerPlatformRoutes(app, { env });
    default:
      throw new Error(`UNKNOWN_PLATFORM_PRODUCT: ${productCode}`);
  }
}

module.exports = {
  resolveRuntimeProductCode,
  resolveRuntimeProductOrError,
  registerPlatformRoutes,
  registerBlessBoardRoutes,
  registerActiveClinicRoutes,
  registerGetProRoutes,
  registerNgoRoutes,
  registerRoutesForDeploymentProduct,
};
