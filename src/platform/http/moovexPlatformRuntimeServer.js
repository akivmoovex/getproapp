"use strict";

/**
 * Unified Moovex platform runtime (hostname → product).
 * Supports Topology A (one process, many approved domains) and Topology B
 * (multiple Hostinger apps sharing the same PLATFORM_DEPLOYMENT_CODE / DB).
 */

const express = require("express");
const { getPgPool } = require("../../db/pg");
const {
  resolveDeploymentConfiguration,
  resolveListenHost,
  resolveTrustProxy,
} = require("../config/deploymentProfiles");
const {
  createLoadPlatformRequestContext,
} = require("./platformRequestContext");
const { assignV5RequestId } = require("./v5SafeLogging");
const {
  buildRedirectLocation,
} = require("./legacyDomainRedirectServer");

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   getPool?: () => { query: Function },
 *   productApps?: Record<string, import('express').Application>,
 * }} [options]
 */
function createMoovexPlatformRuntimeApp(options) {
  const opts = options || {};
  const env = opts.env || process.env;
  const deployment = resolveDeploymentConfiguration(env);
  if (deployment.productSelection !== "hostname") {
    throw new Error(
      `createMoovexPlatformRuntimeApp requires productSelection=hostname (got ${JSON.stringify(deployment.productSelection)})`
    );
  }

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", resolveTrustProxy(env));
  app.use(assignV5RequestId);

  app.get("/healthz", (req, res) => {
    res.status(200).json({
      ok: true,
      mode: "moovex-platform-runtime",
      deploymentCode: deployment.code,
      environment: deployment.environment,
      productSelection: "hostname",
      expectedIdentityKey: deployment.expectedIdentityKey || null,
      expectedDatabaseEnvironment: deployment.expectedDatabaseEnvironment,
    });
  });

  app.use(
    createLoadPlatformRequestContext({
      env,
      allowTestHostOverride: String(env.NODE_ENV || "") !== "production",
    })
  );

  const productApps = opts.productApps || {};

  app.use((req, res, next) => {
    const platform = req.platform;
    if (!platform) {
      return res.status(404).json({ ok: false, code: "UNKNOWN_PLATFORM_HOST" });
    }

    if (platform.siteType === "legacy-redirect") {
      if (!platform.redirectTargetOrigin) {
        return res.status(503).json({ ok: false, code: "redirect_not_configured" });
      }
      // Prepared only — require explicit enable flag (Hostinger must not activate yet).
      if (String(env.BLESSBOARD_ORG_REDIRECT_ENABLED || "").trim() !== "1") {
        return res.status(503).json({
          ok: false,
          code: "legacy_redirect_not_activated",
          message: "blessboard.org redirect is prepared but not activated.",
        });
      }
      return res.redirect(301, buildRedirectLocation(platform.redirectTargetOrigin, req));
    }

    if (platform.siteType === "corporate") {
      const corporate = productApps.corporate;
      if (corporate) return corporate(req, res, next);
      return res.status(200).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Moovex</title></head>
<body data-site-type="corporate"><main><h1>Moovex</h1>
<p>Corporate portfolio foundation.</p></main></body></html>`);
    }

    const productKey = platform.productKey;
    if (!productKey) {
      return res.status(404).json({ ok: false, code: "UNKNOWN_PLATFORM_PRODUCT" });
    }

    const productApp = productApps[productKey];
    if (!productApp) {
      return res.status(503).json({
        ok: false,
        code: "product_runtime_unavailable",
        product: productKey,
      });
    }
    return productApp(req, res, next);
  });

  return app;
}

/**
 * Build product child apps with platform-runtime child flags.
 * @param {{ env?: NodeJS.ProcessEnv, getPool?: Function }} [opts]
 */
function buildDefaultProductApps(opts) {
  const env = (opts && opts.env) || process.env;
  const getPool = (opts && opts.getPool) || getPgPool;
  const {
    createV5FoundationApp,
  } = require("./v5FoundationServer");
  const {
    createActiveClinicFoundationApp,
  } = require("../../activeclinic/http/activeClinicFoundationServer");
  const {
    createGetProFoundationApp,
  } = require("../../getpro/http/getproFoundationServer");
  const {
    createNgoFoundationApp,
  } = require("../../ngo/http/ngoFoundationServer");
  const {
    createMoovexCorporateApp,
  } = require("./moovexCorporateServer");

  return {
    blessboard: createV5FoundationApp({
      env,
      getPool,
      allowPlatformRuntimeChild: true,
    }),
    activeclinic: createActiveClinicFoundationApp({
      env,
      getPool,
      allowPlatformRuntimeChild: true,
    }),
    getpro: createGetProFoundationApp({
      env,
      allowPlatformRuntimeChild: true,
    }),
    ngo: createNgoFoundationApp({
      env,
      allowPlatformRuntimeChild: true,
    }),
    corporate: createMoovexCorporateApp({
      env,
      allowPlatformRuntimeChild: true,
    }),
  };
}

/**
 * @param {{ boot?: object, env?: NodeJS.ProcessEnv }} [opts]
 */
async function startMoovexPlatformRuntimeServer(opts) {
  const env = (opts && opts.env) || process.env;
  const pool = getPgPool();
  const {
    assertPlatformDatabaseIdentityOrExit,
  } = require("../../startup/blessBoardOrgDbGate");
  await assertPlatformDatabaseIdentityOrExit(pool);

  const productApps = buildDefaultProductApps({ env, getPool: () => pool });
  const app = createMoovexPlatformRuntimeApp({ env, getPool: () => pool, productApps });
  const port = env.PORT ? Number(env.PORT) : 3000;
  const host = resolveListenHost(env);

  await new Promise((resolve, reject) => {
    try {
      const server = app.listen(port, host, () => {
        // eslint-disable-next-line no-console
        console.log(
          `[moovex] platform runtime listening on ${host}:${port} ` +
            `(deployment=${resolveDeploymentConfiguration(env).code}, productSelection=hostname)`
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
  createMoovexPlatformRuntimeApp,
  buildDefaultProductApps,
  startMoovexPlatformRuntimeServer,
};
