"use strict";

/**
 * GetPro foundation surface for profiled deployments.
 * Full CRM remains available via unprofiled server.legacy.js until gradual extraction.
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
      brand: product.brandName,
      environment: deployment.environment || null,
      deploymentCode: deployment.code || null,
      canonicalDomain: deployment.canonicalDomain || null,
    });
  });

  app.get("/__getpro/status", (req, res) => {
    res.status(200).json({
      ok: true,
      product: "getpro",
      foundation: true,
      message: "GetPro profiled foundation is active. Legacy CRM mounts when PLATFORM_DEPLOYMENT_CODE is unset.",
    });
  });

  app.get("/", (req, res) => {
    res.status(200).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${product.brandName}</title></head>
<body data-product="getpro" data-page="foundation">
<main>
  <h1>${product.brandName}</h1>
  <p>Profiled foundation runtime is active for ${deployment.canonicalDomain || "this deployment"}.</p>
  <p>Full CRM continues via the unprofiled legacy runtime until product extraction completes.</p>
  <p><a href="/healthz">Health check</a></p>
</main>
</body></html>`);
  });

  // Reject foreign product markers with 404 (route isolation).
  const foreignPrefixes = [
    "/hq",
    "/register-church",
    "/patients",
    "/pharmacy",
    "/__ac",
    "/__ngo",
    "/programs",
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
