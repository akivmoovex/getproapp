"use strict";

/**
 * Netraz (NGO product) foundation surface.
 * Product key remains `ngo`; brand is Netraz. No speculative NGO features here.
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
function createNgoFoundationApp(options) {
  const env = (options && options.env) || process.env;
  if (!(options && options.allowPlatformRuntimeChild)) {
    const productCode = resolveRuntimeProductCode(env);
    if (productCode !== "ngo") {
      throw new Error(
        `createNgoFoundationApp requires productCode=ngo (got ${JSON.stringify(productCode)})`
      );
    }
  }
  const product = getProduct("ngo");
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
      product: "ngo",
      brand: product.brandName,
      environment: deployment.environment || null,
      deploymentCode: deployment.code || null,
      canonicalDomain: deployment.canonicalDomain || null,
    });
  });

  app.get("/__ngo/status", (req, res) => {
    res.status(200).json({
      ok: true,
      product: "ngo",
      brand: "Netraz",
      foundation: true,
      permissionNamespace: "ngo",
      message: "Netraz foundation is active. Program/beneficiary modules are not implemented yet.",
    });
  });

  app.get("/", (req, res) => {
    const brand = product.brandName || "Netraz";
    res.status(200).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${brand}</title></head>
<body data-product="ngo" data-brand="netraz" data-page="foundation">
<main>
  <h1>${brand}</h1>
  <p>NGO product foundation for ${deployment.canonicalDomain || "this deployment"}.</p>
  <p>Operational modules (programs, beneficiaries, grants) will load here later.</p>
  <p><a href="/healthz">Health check</a></p>
</main>
</body></html>`);
  });

  const foreignPrefixes = [
    "/hq",
    "/register-church",
    "/patients",
    "/pharmacy",
    "/__ac",
    "/leads",
    "/__getpro",
  ];
  app.use((req, res, next) => {
    const pathName = String(req.path || "");
    for (const prefix of foreignPrefixes) {
      if (pathName === prefix || pathName.startsWith(`${prefix}/`)) {
        return res
          .status(404)
          .json({ ok: false, code: "product_route_isolated", product: "ngo" });
      }
    }
    return next();
  });

  return app;
}

/**
 * @param {{ boot?: object, env?: NodeJS.ProcessEnv }} [opts]
 */
async function startNgoFoundationServer(opts) {
  const env = (opts && opts.env) || process.env;
  const app = createNgoFoundationApp({ env });
  const port = env.PORT ? Number(env.PORT) : 3000;
  const host = resolveListenHost(env);
  await new Promise((resolve, reject) => {
    try {
      const server = app.listen(port, host, () => {
        // eslint-disable-next-line no-console
        console.log(`[ngo/netraz] foundation listening on ${host}:${port}`);
        resolve(server);
      });
      server.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  createNgoFoundationApp,
  startNgoFoundationServer,
};
