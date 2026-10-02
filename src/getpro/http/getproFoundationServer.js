"use strict";

/**
 * GetPro foundation surface for profiled / hostname-resolved deployments.
 * Minimal under-construction page (Netraz-style). Does not mount legacy CRM routes.
 */

const path = require("path");
const express = require("express");
const {
  resolveDeploymentConfiguration,
  resolveListenHost,
  resolveTrustProxy,
} = require("../../platform/config/deploymentProfiles");
const {
  resolveRuntimeProductCode,
} = require("../../platform/http/productRouteBootstrap");
const { getProduct } = require("../../platform/config/productRegistry");
const { assignV5RequestId } = require("../../platform/http/v5SafeLogging");

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   allowPlatformRuntimeChild?: boolean,
 * }} [options]
 */
function createGetProFoundationApp(options) {
  const env = (options && options.env) || process.env;
  if (!(options && options.allowPlatformRuntimeChild)) {
    const productCode = resolveRuntimeProductCode(env);
    if (productCode !== "getpro") {
      throw new Error(
        `createGetProFoundationApp requires productCode=getpro (got ${JSON.stringify(productCode)})`
      );
    }
  }
  const product = getProduct("getpro");
  const deployment = resolveDeploymentConfiguration(env);
  const brand = product.brandName || "GetPro";
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", resolveTrustProxy(env));
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../../../views"));
  app.use(assignV5RequestId);

  app.get("/healthz", (req, res) => {
    res.status(200).json({
      ok: true,
      mode: "v5-foundation",
      product: "getpro",
      brand,
      environment: deployment.environment || null,
      deploymentCode: deployment.code || null,
      canonicalDomain: deployment.canonicalDomain || null,
      status: "under_construction",
    });
  });

  app.get("/__getpro/status", (req, res) => {
    res.status(200).json({
      ok: true,
      product: "getpro",
      brand: "GetPro",
      foundation: true,
      status: "under_construction",
      message:
        "GetPro product foundation is active. Provider, leads, CRM, and marketplace modules are not mounted yet.",
    });
  });

  app.get("/", (req, res) => {
    res.status(200).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${brand}</title></head>
<body data-product="getpro" data-brand="getpro" data-page="foundation" data-status="under-construction">
<main>
  <h1>${brand}</h1>
  <p>Service marketplace and operations platform for pronline.org.</p>
  <p>Provider management, leads, CRM, field operations, and service marketplace modules will load here later.</p>
  <p><strong>Under construction / Product foundation</strong></p>
  <p><a href="https://pronline.org">Back to pronline.org</a> · <a href="/healthz">Health check</a></p>
</main>
</body></html>`);
  });

  // Reject foreign product markers and unfinished GetPro operational routes.
  const foreignPrefixes = [
    "/hq",
    "/register-church",
    "/patients",
    "/pharmacy",
    "/__ac",
    "/__ngo",
    "/programs",
    "/leads",
    "/crm",
    "/field",
    "/providers",
    "/marketplace",
  ];
  app.use((req, res, next) => {
    const pathName = String(req.path || "");
    for (const prefix of foreignPrefixes) {
      if (pathName === prefix || pathName.startsWith(`${prefix}/`)) {
        return res
          .status(404)
          .json({ ok: false, code: "product_route_isolated", product: "getpro" });
      }
    }
    return next();
  });

  app.use((req, res) => {
    res.status(404).json({
      ok: false,
      code: "getpro_foundation_only",
      product: "getpro",
      message: "GetPro foundation only — operational modules are not mounted.",
    });
  });

  return app;
}

/**
 * @param {{ boot?: object, env?: NodeJS.ProcessEnv }} [opts]
 */
async function startGetProFoundationServer(opts) {
  const env = (opts && opts.env) || process.env;
  const app = createGetProFoundationApp({ env });
  const port = env.PORT ? Number(env.PORT) : 3000;
  const host = resolveListenHost(env);
  await new Promise((resolve, reject) => {
    try {
      const server = app.listen(port, host, () => {
        // eslint-disable-next-line no-console
        console.log(`[getpro] foundation listening on ${host}:${port}`);
        resolve(server);
      });
      server.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  createGetProFoundationApp,
  startGetProFoundationServer,
};
