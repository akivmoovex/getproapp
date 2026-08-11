"use strict";

/**
 * Path-preserving permanent redirect helper for legacy domains (e.g. blessboard.org → blessboard.com).
 * Not activated on Hostinger production by default — only when a legacy-redirect deployment profile is used.
 */

const express = require("express");
const {
  resolveDeploymentConfiguration,
  resolveListenHost,
} = require("../config/deploymentProfiles");

/**
 * Build a destination URL preserving path + query.
 * @param {string} targetOrigin e.g. https://blessboard.com
 * @param {import('express').Request} req
 */
function buildRedirectLocation(targetOrigin, req) {
  const origin = String(targetOrigin || "").replace(/\/$/, "");
  const path = req.originalUrl || req.url || "/";
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * @param {{
 *   targetOrigin: string,
 *   enabled?: boolean,
 * }} options
 */
function createLegacyDomainRedirectMiddleware(options) {
  const targetOrigin = String((options && options.targetOrigin) || "").replace(/\/$/, "");
  const enabled = options && options.enabled !== false;
  return function legacyDomainRedirectMiddleware(req, res, next) {
    if (!enabled || !targetOrigin) return next();
    const location = buildRedirectLocation(targetOrigin, req);
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.redirect(301, location);
  };
}

/**
 * Minimal Express app that only redirects (no product routes).
 * @param {{ env?: NodeJS.ProcessEnv }} [options]
 */
function createLegacyDomainRedirectApp(options) {
  const env = (options && options.env) || process.env;
  const deployment = resolveDeploymentConfiguration(env);
  const targetOrigin =
    deployment.redirectTargetOrigin ||
    (deployment.profile && deployment.profile.redirectTargetOrigin) ||
    "";
  if (!targetOrigin) {
    throw new Error(
      "legacy-redirect deployment requires redirectTargetOrigin on the profile."
    );
  }
  const enabled =
    !deployment.profile || deployment.profile.redirectEnabledByDefault !== false;

  const app = express();
  app.disable("x-powered-by");
  app.get("/healthz", (req, res) => {
    res.status(200).json({
      ok: true,
      mode: "legacy-redirect",
      product: deployment.productCode || null,
      deploymentCode: deployment.code || null,
      redirectTargetOrigin: targetOrigin,
      redirectEnabled: enabled,
    });
  });
  app.use(createLegacyDomainRedirectMiddleware({ targetOrigin, enabled }));
  return app;
}

/**
 * @param {{ boot?: object, env?: NodeJS.ProcessEnv }} [opts]
 */
async function startLegacyDomainRedirectServer(opts) {
  const env = (opts && opts.env) || process.env;
  const app = createLegacyDomainRedirectApp({ env });
  const port = env.PORT ? Number(env.PORT) : 3000;
  const host = resolveListenHost(env);
  await new Promise((resolve, reject) => {
    try {
      const server = app.listen(port, host, () => {
        // eslint-disable-next-line no-console
        console.log(
          `[platform] legacy-redirect listening on ${host}:${port} → ` +
            `${resolveDeploymentConfiguration(env).redirectTargetOrigin}`
        );
        resolve(server);
      });
      server.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  buildRedirectLocation,
  createLegacyDomainRedirectMiddleware,
  createLegacyDomainRedirectApp,
  startLegacyDomainRedirectServer,
};
