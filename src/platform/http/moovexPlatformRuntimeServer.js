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

  const { mountHostingerMediaStatic } = require("./mountHostingerMediaStatic");
  mountHostingerMediaStatic(app, env);

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
  app.get("/__platform/runtime", async (req, res) => {
    const {
      isPlatformRuntimeDiagnosticsEndpointAllowed,
      buildPlatformRuntimeSnapshot,
    } = require("../../startup/platformRuntimeSnapshot");
    if (!isPlatformRuntimeDiagnosticsEndpointAllowed(env)) {
      return res.status(404).json({ ok: false, code: "not_found" });
    }
    let mediaPersistence = null;
    try {
      const {
        buildHostingerMediaPersistenceSnapshot,
      } = require("../media/hostingerMediaPersistenceProbe");
      mediaPersistence = await buildHostingerMediaPersistenceSnapshot(env);
    } catch {
      mediaPersistence = { ok: false, code: "media_persistence_probe_failed" };
    }
    return res.status(200).json(
      buildPlatformRuntimeSnapshot(env, {
        boot: opts.boot || null,
        mediaPersistence,
      })
    );
  });

  // Testing-only reversible media migrator (writes on this Hostinger worker's media root).
  // Sample: body.ids (max 4). Bulk: body.bulk=true (testing website media only, keep-payload required).
  app.post(
    "/__platform/qa/migrate-website-media",
    express.json({ limit: "64kb" }),
    async (req, res) => {
      const {
        isPlatformRuntimeDiagnosticsEndpointAllowed,
      } = require("../../startup/platformRuntimeSnapshot");
      if (!isPlatformRuntimeDiagnosticsEndpointAllowed(env)) {
        return res.status(404).json({ ok: false, code: "not_found" });
      }
      if (String(env.DEPLOYMENT_ENV || "").trim().toLowerCase() !== "testing") {
        return res.status(403).json({ ok: false, code: "refused_non_testing_environment" });
      }
      if (String(deployment.code || "").trim().toLowerCase() !== "moovex-platform-testing") {
        return res.status(403).json({ ok: false, code: "refused_non_testing_deployment" });
      }
      const body = req.body || {};
      if (body.confirm !== "migrate-website-media-to-hostinger") {
        return res.status(400).json({ ok: false, code: "confirm_required" });
      }
      const clearPayload = body.clearPayload === true;
      if (body.keepPayload !== true && !clearPayload) {
        return res.status(400).json({ ok: false, code: "keep_payload_required" });
      }
      const bulk = body.bulk === true;
      const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id || "").trim()) : [];
      if (!bulk) {
        if (!ids.length || ids.length > 4) {
          return res.status(400).json({ ok: false, code: "ids_required_max_4" });
        }
        if (ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
          return res.status(400).json({ ok: false, code: "invalid_media_id" });
        }
      } else if (ids.length) {
        return res.status(400).json({ ok: false, code: "bulk_must_not_pass_ids" });
      }
      try {
        const { migrateWebsiteMediaToHostinger } = require("../../../scripts/migrate-website-media-to-hostinger");
        const pool = (opts.getPool || getPgPool)();
        const result = await migrateWebsiteMediaToHostinger(pool, {
          dryRun: false,
          execute: true,
          env,
          mediaIds: bulk ? [] : ids,
          keepPayload: !clearPayload,
          allowBulk: bulk,
          reconcileExisting: bulk || body.forceRewrite === true,
          forceRewrite: body.forceRewrite === true,
          limit: bulk ? 5000 : undefined,
        });
        return res.status(result.ok ? 200 : 500).json(result);
      } catch (err) {
        return res.status(500).json({
          ok: false,
          code: (err && err.code) || "migrate_failed",
          message: err && err.message ? String(err.message).slice(0, 160) : "unknown",
        });
      }
    }
  );

  // Testing-only: copy platform marketing images from release public/ into MEDIA_STORAGE_ROOT.
  app.post(
    "/__platform/qa/sync-platform-marketing-media",
    express.json({ limit: "16kb" }),
    async (req, res) => {
      const {
        isPlatformRuntimeDiagnosticsEndpointAllowed,
      } = require("../../startup/platformRuntimeSnapshot");
      if (!isPlatformRuntimeDiagnosticsEndpointAllowed(env)) {
        return res.status(404).json({ ok: false, code: "not_found" });
      }
      if (String(env.DEPLOYMENT_ENV || "").trim().toLowerCase() !== "testing") {
        return res.status(403).json({ ok: false, code: "refused_non_testing_environment" });
      }
      if (String(deployment.code || "").trim().toLowerCase() !== "moovex-platform-testing") {
        return res.status(403).json({ ok: false, code: "refused_non_testing_deployment" });
      }
      const body = req.body || {};
      if (body.confirm !== "sync-platform-marketing-media-to-hostinger") {
        return res.status(400).json({ ok: false, code: "confirm_required" });
      }
      try {
        const fs = require("fs");
        const fsp = require("fs/promises");
        const path = require("path");
        const {
          resolveHostingerMediaConfig,
          assertStorageKeyWritable,
        } = require("../media/hostingerMediaConfig");
        const {
          listMarketingPublicPaths,
          storageKeyForPublicPath,
          localPublicFilePath,
        } = require("../media/platformMarketingAssets");
        const cfg = resolveHostingerMediaConfig(env);
        if (!cfg.enabled || !cfg.storageRoot) {
          return res.status(500).json({ ok: false, code: "media_storage_root_unset" });
        }
        const repoRoot = path.resolve(__dirname, "../../..");
        let copied = 0;
        let skipped = 0;
        let missing = 0;
        const dryRun = body.dryRun === true;
        for (const publicPath of listMarketingPublicPaths()) {
          const key = storageKeyForPublicPath(publicPath, env);
          const relLocal = localPublicFilePath(publicPath);
          if (!key || !relLocal) {
            missing += 1;
            continue;
          }
          assertStorageKeyWritable(cfg.environment, key);
          const srcAbs = path.join(repoRoot, relLocal);
          const destAbs = path.join(cfg.storageRoot, ...key.split("/"));
          if (!fs.existsSync(srcAbs)) {
            missing += 1;
            continue;
          }
          if (fs.existsSync(destAbs) && body.force !== true) {
            skipped += 1;
            continue;
          }
          if (!dryRun) {
            await fsp.mkdir(path.dirname(destAbs), { recursive: true });
            await fsp.copyFile(srcAbs, destAbs);
          }
          copied += 1;
        }
        return res.status(200).json({
          ok: true,
          dryRun,
          storageRoot: cfg.storageRoot,
          copied,
          skipped,
          missing,
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          code: (err && err.code) || "sync_failed",
          message: err && err.message ? String(err.message).slice(0, 160) : "unknown",
        });
      }
    }
  );

  // Testing-only: rematerialize missing Hostinger objects for hostinger rows with no disk file.
  // Prefer payload_bytes; otherwise clone bytes from another existing file in the same organization.
  app.post(
    "/__platform/qa/repair-missing-hostinger-media",
    express.json({ limit: "16kb" }),
    async (req, res) => {
      const {
        isPlatformRuntimeDiagnosticsEndpointAllowed,
      } = require("../../startup/platformRuntimeSnapshot");
      if (!isPlatformRuntimeDiagnosticsEndpointAllowed(env)) {
        return res.status(404).json({ ok: false, code: "not_found" });
      }
      if (String(env.DEPLOYMENT_ENV || "").trim().toLowerCase() !== "testing") {
        return res.status(403).json({ ok: false, code: "refused_non_testing_environment" });
      }
      if (String(deployment.code || "").trim().toLowerCase() !== "moovex-platform-testing") {
        return res.status(403).json({ ok: false, code: "refused_non_testing_deployment" });
      }
      const body = req.body || {};
      if (body.confirm !== "repair-missing-hostinger-media") {
        return res.status(400).json({ ok: false, code: "confirm_required" });
      }
      try {
        const fsp = require("fs/promises");
        const path = require("path");
        const {
          resolveHostingerMediaConfig,
        } = require("../media/hostingerMediaConfig");
        const cfg = resolveHostingerMediaConfig(env);
        if (!cfg.enabled || !cfg.storageRoot) {
          return res.status(500).json({ ok: false, code: "media_storage_root_unset" });
        }
        const pool = (opts.getPool || getPgPool)();
        const rows = await pool.query(
          `SELECT m.id, m.organization_id, m.storage_key, m.mime_type, m.payload_bytes
             FROM platform.website_media m
             JOIN platform.website_instances i ON i.id = m.instance_id
            WHERE m.media_kind = 'image'
              AND m.status = 'active'
              AND m.storage_provider = 'hostinger'
              AND m.storage_key IS NOT NULL
              AND i.product_code IN ('blessboard', 'activeclinic')
            ORDER BY m.created_at ASC
            LIMIT 5000`
        );
        let repaired = 0;
        let skipped = 0;
        let failed = 0;
        const errors = [];
        const donorsByOrg = new Map();
        for (const row of rows.rows) {
          const abs = path.join(cfg.storageRoot, ...String(row.storage_key).split("/"));
          try {
            await fsp.access(abs);
            if (!donorsByOrg.has(row.organization_id)) {
              donorsByOrg.set(row.organization_id, abs);
            }
            skipped += 1;
          } catch (_err) {
            // missing — repair below
          }
        }
        for (const row of rows.rows) {
          const abs = path.join(cfg.storageRoot, ...String(row.storage_key).split("/"));
          try {
            await fsp.access(abs);
            continue;
          } catch (_err) {
            /* missing */
          }
          try {
            let buf = null;
            if (row.payload_bytes) {
              buf = Buffer.isBuffer(row.payload_bytes)
                ? row.payload_bytes
                : Buffer.from(row.payload_bytes);
            } else {
              const donor = donorsByOrg.get(row.organization_id);
              if (!donor) {
                failed += 1;
                errors.push({ mediaId: row.id, code: "no_donor" });
                continue;
              }
              buf = await fsp.readFile(donor);
            }
            await fsp.mkdir(path.dirname(abs), { recursive: true });
            await fsp.writeFile(abs, buf, { flag: "wx" });
            repaired += 1;
            if (!donorsByOrg.has(row.organization_id)) donorsByOrg.set(row.organization_id, abs);
          } catch (err) {
            if (err && err.code === "EEXIST") {
              skipped += 1;
              continue;
            }
            failed += 1;
            errors.push({
              mediaId: row.id,
              code: (err && err.code) || "repair_failed",
              message: err && err.message ? String(err.message).slice(0, 120) : "unknown",
            });
          }
        }
        return res.status(failed ? 500 : 200).json({
          ok: failed === 0,
          repaired,
          skipped,
          failed,
          scanned: rows.rows.length,
          errors: errors.slice(0, 20),
          storageRoot: cfg.storageRoot,
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          code: (err && err.code) || "repair_failed",
          message: err && err.message ? String(err.message).slice(0, 160) : "unknown",
        });
      }
    }
  );

  // Testing-only: rematerialize missing Hostinger objects for hostinger rows with no disk file.
  // Prefer payload_bytes; otherwise clone bytes from another existing file in the same organization.
  // (endpoint registered above)

  // Testing-only: report on-disk sizes for a storage key across durable roots.
  app.get("/__platform/qa/media-file-stat", async (req, res) => {
    const {
      isPlatformRuntimeDiagnosticsEndpointAllowed,
    } = require("../../startup/platformRuntimeSnapshot");
    if (!isPlatformRuntimeDiagnosticsEndpointAllowed(env)) {
      return res.status(404).json({ ok: false, code: "not_found" });
    }
    if (String(env.DEPLOYMENT_ENV || "").trim().toLowerCase() !== "testing") {
      return res.status(403).json({ ok: false, code: "refused_non_testing_environment" });
    }
    const key = String(req.query.key || "").replace(/^\/+/, "");
    if (!key || key.includes("..") || key.startsWith("production/") || key === "production") {
      return res.status(400).json({ ok: false, code: "invalid_key" });
    }
    try {
      const fsp = require("fs/promises");
      const path = require("path");
      const crypto = require("crypto");
      const {
        resolveHostingerMediaConfig,
      } = require("../media/hostingerMediaConfig");
      const cfg = resolveHostingerMediaConfig(env);
      // Canonical root only — do not probe/write domains/…/moovex-media.
      const roots = cfg.storageRoot ? [cfg.storageRoot] : [];
      const files = [];
      for (const root of roots) {
        const abs = path.resolve(root, ...key.split("/"));
        const rootAbs = path.resolve(root);
        if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) {
          files.push({ root, ok: false, code: "path_traversal" });
          continue;
        }
        try {
          const st = await fsp.stat(abs);
          const buf = await fsp.readFile(abs);
          files.push({
            root,
            exists: true,
            size: st.size,
            md5: crypto.createHash("md5").update(buf).digest("hex"),
          });
        } catch (err) {
          files.push({
            root,
            exists: false,
            code: err && err.code ? String(err.code) : "missing",
          });
        }
      }
      return res.status(200).json({
        ok: true,
        key,
        storageRoot: cfg.storageRoot,
        mediaStorageRootSource: cfg.mediaStorageRootSource,
        mirroringDisabled: true,
        files,
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        code: (err && err.code) || "stat_failed",
        message: err && err.message ? String(err.message).slice(0, 160) : "unknown",
      });
    }
  });

  // Testing-only: obtain ActiveClinic password-reset URL from QA delivery outbox / token metadata.
  app.get("/__platform/qa/activeclinic-password-reset-delivery", async (req, res) => {
    const {
      isPlatformRuntimeDiagnosticsEndpointAllowed,
    } = require("../../startup/platformRuntimeSnapshot");
    if (!isPlatformRuntimeDiagnosticsEndpointAllowed(env)) {
      return res.status(404).json({ ok: false, code: "not_found" });
    }
    if (String(env.DEPLOYMENT_ENV || "").trim().toLowerCase() !== "testing") {
      return res.status(403).json({ ok: false, code: "refused_non_testing_environment" });
    }
    if (String(deployment.code || "").trim().toLowerCase() !== "moovex-platform-testing") {
      return res.status(403).json({ ok: false, code: "refused_non_testing_deployment" });
    }
    const identifier = String(req.query.identifier || "").trim();
    if (!identifier) {
      return res.status(400).json({ ok: false, code: "identifier_required" });
    }
    try {
      const {
        lookupTestingPasswordResetDelivery,
      } = require("../../activeclinic/services/activeClinicPasswordRecoveryService");
      const pool = (opts.getPool || getPgPool)();
      const result = await lookupTestingPasswordResetDelivery(pool, {
        identifier,
        env,
        deploymentCode: deployment.code,
        country: req.query.country || null,
      });
      if (!result.ok) {
        return res.status(result.code === "delivery_not_found" ? 404 : 400).json(result);
      }
      return res.status(200).json({
        ok: true,
        channel: result.channel,
        resetUrl: result.resetUrl,
        expiresAt: result.expiresAt,
        host: (() => {
          try {
            return new URL(result.resetUrl).hostname;
          } catch {
            return null;
          }
        })(),
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        code: (err && err.code) || "lookup_failed",
        message: err && err.message ? String(err.message).slice(0, 160) : "unknown",
      });
    }
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
