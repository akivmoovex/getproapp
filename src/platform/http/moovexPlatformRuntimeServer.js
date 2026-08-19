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

const QA_PRODUCT_LINKS = Object.freeze([
  { label: "BlessBoard", href: "https://blessboard.pronline.org" },
  { label: "ActiveClinic", href: "https://activeclinic.pronline.org" },
  { label: "GetPro", href: "https://getproapp.pronline.org" },
  { label: "Netraz", href: "https://netraz.pronline.org" },
]);

function renderPlatformQaLauncher(res, platform) {
  const brand = (platform && platform.brand) || "Moovex Platform QA";
  const links = QA_PRODUCT_LINKS.map(
    (item) =>
      `<li><a href="${item.href}">${item.label}</a> — <code>${item.href}</code></li>`
  ).join("\n");
  return res.status(200).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${brand}</title></head>
<body data-site-type="platform" data-brand="moovex-platform-qa" data-environment="testing">
<main>
  <h1>${brand}</h1>
  <p>Testing platform hub on <code>pronline.org</code>. Product apps open on their own hostnames.</p>
  <ul>
${links}
  </ul>
  <p><a href="/healthz">Platform health check</a></p>
</main>
</body></html>`);
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   getPool?: () => { query: Function },
 *   productApps?: Record<string, import('express').Application>,
 *   boot?: object,
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
    const boot = opts.boot || null;
    const schema = boot && boot.schemaCompatibility ? boot.schemaCompatibility : null;
    const {
      readGitShaShort,
    } = require("../../startup/startupProcessMarker");
    const {
      schemaCompatibilityHealthz,
    } = require("../schema/v7RuntimeSchemaCompatibility");
    const schemaHealth = schemaCompatibilityHealthz(schema);
    res.status(schemaHealth.status).json({
      ok: schemaHealth.status === 200,
      mode: "moovex-platform-runtime",
      deploymentCode: deployment.code,
      environment: deployment.environment,
      productSelection: "hostname",
      expectedIdentityKey: deployment.expectedIdentityKey || null,
      expectedDatabaseEnvironment: deployment.expectedDatabaseEnvironment,
      gitSha: (boot && boot.gitSha) || readGitShaShort(),
      schemaCompatible: schemaHealth.schemaCompatible,
      schemaCompatibility: schemaHealth.schemaCompatibility,
    });
  });

  // Testing-only non-secret runtime fingerprint (never returns DATABASE_URL / secrets).
  app.get("/__platform/runtime", (req, res) => {
    const {
      isPlatformRuntimeDiagnosticsEndpointAllowed,
      buildPlatformRuntimeSnapshot,
    } = require("../../startup/platformRuntimeSnapshot");
    if (!isPlatformRuntimeDiagnosticsEndpointAllowed(env)) {
      return res.status(404).json({ ok: false, code: "not_found" });
    }
    return res.status(200).json(
      buildPlatformRuntimeSnapshot(env, {
        boot: opts.boot || null,
      })
    );
  });

  app.use(
    createLoadPlatformRequestContext({
      env,
      allowTestHostOverride: String(env.NODE_ENV || "").toLowerCase() !== "production",
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
      if (String(env.BLESSBOARD_ORG_REDIRECT_ENABLED || "").trim() !== "1") {
        return res.status(503).json({
          ok: false,
          code: "legacy_redirect_not_activated",
          message: "blessboard.org redirect is prepared but not activated.",
        });
      }
      return res.redirect(301, buildRedirectLocation(platform.redirectTargetOrigin, req));
    }

    // Compatibility alias hosts (e.g. getpro.pronline.org → getproapp.pronline.org).
    if (platform.siteType === "product" && platform.redirectTargetOrigin) {
      return res.redirect(301, buildRedirectLocation(platform.redirectTargetOrigin, req));
    }

    if (platform.siteType === "platform") {
      if (platform.redirectTargetOrigin && platform.canonicalHost === "www.pronline.org") {
        return res.redirect(301, buildRedirectLocation(platform.redirectTargetOrigin, req));
      }
      const pathName = String(req.path || "/");
      if (pathName === "/" || pathName === "") {
        return renderPlatformQaLauncher(res, platform);
      }
      // Do not expose product operational routes on the QA hub host.
      return res.status(404).json({
        ok: false,
        code: "platform_qa_hub_only",
        message: "pronline.org is the testing QA launcher only. Use product hostnames for app routes.",
        links: QA_PRODUCT_LINKS,
      });
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
  const {
    logPlatformRuntimeDiagnostics,
  } = require("../../startup/platformRuntimeDiagnostics");
  logPlatformRuntimeDiagnostics(env);

  const pool = getPgPool();
  const {
    assertPlatformDatabaseIdentityOrExit,
  } = require("../../startup/blessBoardOrgDbGate");
  await assertPlatformDatabaseIdentityOrExit(pool);
  const {
    assertV7RuntimeSchemaCompatibilityOrExit,
  } = require("../schema/v7RuntimeSchemaCompatibility");
  const schemaCompatibility = await assertV7RuntimeSchemaCompatibilityOrExit(pool, { env });
  const {
    readGitShaShort,
  } = require("../../startup/startupProcessMarker");
  const boot = {
    ...((opts && opts.boot) || {}),
    gitSha: readGitShaShort(),
    schemaCompatibility,
  };

  const productApps = buildDefaultProductApps({ env, getPool: () => pool });
  const app = createMoovexPlatformRuntimeApp({
    env,
    getPool: () => pool,
    productApps,
    boot,
  });
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
  renderPlatformQaLauncher,
  QA_PRODUCT_LINKS,
};
