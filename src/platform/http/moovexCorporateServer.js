"use strict";

/**
 * Moovex corporate parent site foundation (site_type = corporate, not a tenant product).
 */

const express = require("express");
const {
  resolveDeploymentConfiguration,
  resolveListenHost,
  resolveTrustProxy,
} = require("../config/deploymentProfiles");
const { assignV5RequestId } = require("./v5SafeLogging");

/**
 * @param {{ env?: NodeJS.ProcessEnv }} [options]
 */
function createMoovexCorporateApp(options) {
  const env = (options && options.env) || process.env;
  const deployment = resolveDeploymentConfiguration(env);
  if (!(options && options.allowPlatformRuntimeChild)) {
    if (deployment.siteType !== "corporate") {
      throw new Error(
        `createMoovexCorporateApp requires siteType=corporate (got ${JSON.stringify(deployment.siteType)})`
      );
    }
  }
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", resolveTrustProxy(env));
  app.use(assignV5RequestId);

  app.get("/healthz", (req, res) => {
    res.status(200).json({
      ok: true,
      mode: "v5-foundation",
      siteType: "corporate",
      brand: "Moovex",
      deploymentCode: deployment.code || null,
      portfolio: ["blessboard", "activeclinic", "getpro", "ngo"],
    });
  });

  app.get("/__moovex/status", (req, res) => {
    res.status(200).json({
      ok: true,
      siteType: "corporate",
      brand: "Moovex",
      message: "Corporate portfolio surface — not a tenant product runtime.",
    });
  });

  app.get("/", (req, res) => {
    res.status(200).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Moovex</title></head>
<body data-site="moovex" data-site-type="corporate">
<main>
  <h1>Moovex</h1>
  <p>Parent company portfolio site foundation.</p>
  <ul>
    <li>BlessBoard</li>
    <li>ActiveClinic</li>
    <li>GetPro</li>
    <li>Netraz</li>
  </ul>
  <p><a href="/healthz">Health check</a></p>
</main>
</body></html>`);
  });

  return app;
}

/**
 * @param {{ boot?: object, env?: NodeJS.ProcessEnv }} [opts]
 */
async function startMoovexCorporateServer(opts) {
  const env = (opts && opts.env) || process.env;
  const app = createMoovexCorporateApp({ env });
  const port = env.PORT ? Number(env.PORT) : 3000;
  const host = resolveListenHost(env);
  await new Promise((resolve, reject) => {
    try {
      const server = app.listen(port, host, () => {
        // eslint-disable-next-line no-console
        console.log(`[moovex] corporate foundation listening on ${host}:${port}`);
        resolve(server);
      });
      server.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  createMoovexCorporateApp,
  startMoovexCorporateServer,
};
