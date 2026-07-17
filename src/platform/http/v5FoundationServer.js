"use strict";

/**
 * Minimal Express app for BlessBoard V5 foundation startup.
 * No legacy public tables, sessions, ensure*Schema, seeds, or tenant routing.
 */

const path = require("path");
const express = require("express");
const morgan = require("morgan");

const { getPgPool } = require("../../db/pg");
const { resolveHostname } = require("../host");
const { createLoadPlatformHostContext } = require("./loadPlatformHostContext");
const { getPlatformHostContextMode } = require("../config/platformHostContextMode");
const {
  getPlatformDeploymentCode,
  warnOnceIfDiagnosticDeploymentUnavailable,
} = require("../config/platformDeploymentCode");
const { logV5FoundationModeActive } = require("../config/v5FoundationMode");

const UNAVAILABLE_STATUS = 503;
const UNAVAILABLE_MESSAGE =
  "BlessBoard V5 foundation mode: this surface is not available yet. Authentication, tenant portals, and legacy routes have not been migrated.";

const FOUNDATION_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BlessBoard</title>
  <style>
    :root { color-scheme: light; --violet: #6C5CE7; --ink: #1a1625; --muted: #5c5668; --bg: #f7f5fb; }
    body { margin: 0; font-family: "Hanken Grotesk", system-ui, sans-serif; background: var(--bg); color: var(--ink); }
    main { max-width: 40rem; margin: 0 auto; padding: 4rem 1.5rem; }
    h1 { font-size: 2rem; letter-spacing: -0.02em; margin: 0 0 0.75rem; color: var(--violet); }
    p { margin: 0 0 0.75rem; line-height: 1.55; color: var(--muted); }
    .note { font-size: 0.9rem; }
  </style>
</head>
<body>
  <main>
    <h1>BlessBoard</h1>
    <p>V5 foundation mode is running against the platform database.</p>
    <p class="note">Product portals, login, and tenant routing are not available in this phase. Platform hostname diagnostics may be enabled separately and remain non-authoritative.</p>
  </main>
</body>
</html>`;

/**
 * Controlled response for surfaces not yet migrated.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function sendUnavailable(req, res) {
  const wantsHtml = String(req.get("accept") || "").includes("text/html");
  if (wantsHtml) {
    return res.status(UNAVAILABLE_STATUS).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Unavailable</title></head>
<body><p>${UNAVAILABLE_MESSAGE}</p></body></html>`);
  }
  return res.status(UNAVAILABLE_STATUS).type("text").send(UNAVAILABLE_MESSAGE);
}

/**
 * Paths that must never reach legacy handlers in foundation mode.
 * @param {string} p
 */
function isUnavailableAppPath(p) {
  const pathOnly = String(p || "").split("?")[0] || "/";
  if (pathOnly === "/login" || pathOnly === "/getpro-admin") return true;
  if (pathOnly.startsWith("/admin")) return true;
  if (pathOnly.startsWith("/member")) return true;
  if (pathOnly.startsWith("/hq-admin") || pathOnly.startsWith("/hq")) return true;
  if (pathOnly.startsWith("/branch-admin") || pathOnly.startsWith("/branch")) return true;
  if (pathOnly.startsWith("/client") || pathOnly.startsWith("/company") || pathOnly.startsWith("/provider")) {
    return true;
  }
  if (pathOnly.startsWith("/field-agent") || pathOnly.startsWith("/api")) return true;
  if (
    pathOnly.startsWith("/global") ||
    pathOnly.startsWith("/demo") ||
    pathOnly.startsWith("/il") ||
    pathOnly.startsWith("/zm") ||
    pathOnly.startsWith("/bw") ||
    pathOnly.startsWith("/zw") ||
    pathOnly.startsWith("/za") ||
    pathOnly.startsWith("/na")
  ) {
    return true;
  }
  if (pathOnly.startsWith("/church")) return true;
  return false;
}

/**
 * @param {{
 *   getPool?: () => { query: Function },
 *   enableDiagnosticHostContext?: boolean,
 * }} [options]
 */
function createV5FoundationApp(options) {
  const opts = options || {};
  const getPool = typeof opts.getPool === "function" ? opts.getPool : getPgPool;
  const enableDiagnostic =
    opts.enableDiagnosticHostContext !== undefined
      ? Boolean(opts.enableDiagnosticHostContext)
      : getPlatformHostContextMode() === "diagnostic";

  const app = express();
  const isProduction = process.env.NODE_ENV === "production";

  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY === "0" || process.env.TRUST_PROXY === "false") {
    app.set("trust proxy", false);
  } else if (process.env.TRUST_PROXY) {
    const n = Number(process.env.TRUST_PROXY);
    app.set("trust proxy", Number.isFinite(n) && n >= 0 ? n : 1);
  } else {
    app.set("trust proxy", 1);
  }

  if (isProduction) {
    app.use(
      morgan(":method :url :status :res[content-length] - :response-time ms", {
        skip: (req) => req.path === "/healthz",
      })
    );
  } else {
    app.use(morgan("dev"));
  }

  const publicDir = path.join(__dirname, "..", "..", "..", "public");
  app.use(
    express.static(publicDir, {
      maxAge: isProduction ? "1d" : 0,
      immutable: false,
    })
  );

  if (enableDiagnostic) {
    const platformHostContextMode = getPlatformHostContextMode();
    const platformDeploymentIdentity = getPlatformDeploymentCode();
    warnOnceIfDiagnosticDeploymentUnavailable(platformHostContextMode, platformDeploymentIdentity);
    app.use(
      createLoadPlatformHostContext({
        getPool,
        getMode: getPlatformHostContextMode,
        getDeploymentIdentity: getPlatformDeploymentCode,
      })
    );
  }

  app.get("/healthz", (req, res) => {
    if (process.env.DEBUG_HOST === "1") {
      return res.json({
        ok: true,
        mode: "v5-foundation",
        resolvedHost: resolveHostname(req),
        xForwardedHost: req.headers["x-forwarded-host"] || null,
        hostHeader: req.headers.host || null,
      });
    }
    return res.json({ ok: true, mode: "v5-foundation" });
  });

  app.get("/", (req, res) => {
    res.status(200).type("html").send(FOUNDATION_HTML);
  });

  app.use((req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD") {
      if (isUnavailableAppPath(req.path)) {
        return sendUnavailable(req, res);
      }
    } else if (isUnavailableAppPath(req.path)) {
      return sendUnavailable(req, res);
    }
    return next();
  });

  // Anything else that looks like an app route: controlled unavailable (not process crash).
  app.use((req, res) => {
    if (/\.(?:css|js|mjs|map|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot)$/i.test(req.path)) {
      return res.status(404).type("text").send("Not found");
    }
    return sendUnavailable(req, res);
  });

  return app;
}

/**
 * Verify pool connectivity without touching legacy public tables.
 * @param {{ query: Function }} pool
 */
async function verifyFoundationPool(pool) {
  await pool.query("SELECT 1 AS ok");
  const platform = await pool.query(
    `SELECT 1 AS ok
       FROM information_schema.schemata
      WHERE schema_name = 'platform'
      LIMIT 1`
  );
  if (!platform.rows.length) {
    // eslint-disable-next-line no-console
    console.warn(
      "[blessboard] V5 foundation mode: platform schema not found — continue serving health/apex; run db:migrate against DATABASE_URL"
    );
  }
}

/**
 * @param {{ boot?: object }} [opts]
 */
async function startV5FoundationServer(opts) {
  void opts;
  logV5FoundationModeActive();

  // eslint-disable-next-line no-console
  console.log("[blessboard] V5 foundation mode: scheduled jobs remain disabled in this process (no job workers started)");

  const pool = getPgPool();
  await verifyFoundationPool(pool);

  const app = createV5FoundationApp({ getPool: () => pool });
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  const host = process.env.HOST || "0.0.0.0";

  await new Promise((resolve, reject) => {
    try {
      const server = app.listen(port, host, () => {
        // eslint-disable-next-line no-console
        console.log(`[blessboard] V5 foundation listening on ${host}:${port}`);
        resolve(server);
      });
      server.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  UNAVAILABLE_STATUS,
  UNAVAILABLE_MESSAGE,
  isUnavailableAppPath,
  createV5FoundationApp,
  verifyFoundationPool,
  startV5FoundationServer,
};
