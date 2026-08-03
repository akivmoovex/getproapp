"use strict";

/**
 * Product-aware route registration boundary for the shared V5 foundation runtime.
 * BlessBoard routers remain mounted from v5FoundationServer today; ActiveClinic
 * mounts a minimal stub until business routes exist.
 */

const { getDeploymentProfile, hasAuthoritativeDeploymentProfile } = require("../config/deploymentProfiles");
const { getProduct, resolveProductOrError } = require("../config/productRegistry");

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
  // Platform-admin and shared middleware stay owned by the foundation server for now.
  return { registered: "platform", routes: [] };
}

/**
 * BlessBoard product route pack marker. Actual routers remain in v5FoundationServer
 * until a gradual extraction is safe.
 * @param {import('express').Application} app
 * @param {object} [ctx]
 */
function registerBlessBoardRoutes(app, ctx) {
  void app;
  void ctx;
  return { registered: "blessboard", routes: "delegated-to-v5FoundationServer" };
}

/**
 * ActiveClinic product routes — infrastructure stub only (no clinical modules).
 * @param {import('express').Application} app
 * @param {{ env?: NodeJS.ProcessEnv }} [ctx]
 */
function registerActiveClinicRoutes(app, ctx) {
  const env = (ctx && ctx.env) || process.env;
  const product = getProduct("activeclinic");
  app.get("/", (req, res) => {
    res.status(200).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${product.displayName}</title></head>
<body data-ac-page="foundation-stub">
<main>
  <h1>${product.displayName}</h1>
  <p>Foundation runtime is active. Clinical modules are not implemented yet.</p>
  <p><a href="/healthz">Health check</a></p>
</main>
</body></html>`);
  });
  void env;
  return { registered: "activeclinic", routes: ["GET /"] };
}

module.exports = {
  resolveRuntimeProductCode,
  resolveRuntimeProductOrError,
  registerPlatformRoutes,
  registerBlessBoardRoutes,
  registerActiveClinicRoutes,
};
