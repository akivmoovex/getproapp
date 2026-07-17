"use strict";

/**
 * Minimal Express app for BlessBoard V5 foundation + apex authentication.
 * No legacy public tables, connect-pg-simple, tenant portals, or authoritative routing.
 */

const path = require("path");
const express = require("express");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const { getPgPool } = require("../../db/pg");
const { resolveHostname } = require("../host");
const { createLoadPlatformHostContext } = require("./loadPlatformHostContext");
const {
  createLoadBlessBoardCatalogueContext,
} = require("../../blessboard/http/loadBlessBoardCatalogueContext");
const { createLoadV5Session } = require("./loadV5Session");
const { getPlatformHostContextMode } = require("../config/platformHostContextMode");
const {
  getPlatformDeploymentCode,
  warnOnceIfDiagnosticDeploymentUnavailable,
} = require("../config/platformDeploymentCode");
const { logV5FoundationModeActive } = require("../config/v5FoundationMode");
const {
  CSRF_FIELD,
  issueCsrfToken,
  validateCsrf,
  setCsrfCookie,
} = require("./v5Csrf");
const {
  setV5SessionCookie,
  clearV5SessionCookie,
  readV5SessionCookie,
} = require("../session/v5SessionCookie");
const { revokeV5Session } = require("../session/revokeV5Session");
const { authenticateBlessBoardUser } = require("../../blessboard/services/authenticateBlessBoardUser");
const {
  listActiveRolesForUser,
} = require("../../blessboard/repositories/blessBoardAuthRepository");
const { sha256Hex } = require("../session/sessionToken");

const UNAVAILABLE_STATUS = 503;
const UNAVAILABLE_MESSAGE =
  "BlessBoard V5 foundation mode: this surface is not available yet. Tenant portals and legacy routes have not been migrated.";

const APEX_HOSTS = new Set(["blessboard.org", "www.blessboard.org"]);

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
    a { color: var(--violet); }
  </style>
</head>
<body>
  <main>
    <h1>BlessBoard</h1>
    <p>V5 foundation mode is running against the platform database.</p>
    <p class="note">Apex sign-in is available. Tenant portals remain unavailable. Platform hostname diagnostics remain non-authoritative.</p>
    <p><a href="/login">Sign in</a></p>
  </main>
</body>
</html>`;

/**
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
 * @param {string} p
 */
function isUnavailableAppPath(p) {
  const pathOnly = String(p || "").split("?")[0] || "/";
  if (pathOnly === "/getpro-admin") return true;
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
 * @param {import('express').Request} req
 */
function parseCookies(req) {
  if (req.cookies && typeof req.cookies === "object") return;
  req.cookies = {};
  const header = req.headers && req.headers.cookie ? String(req.headers.cookie) : "";
  if (!header) return;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    try {
      req.cookies[key] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      req.cookies[key] = part.slice(idx + 1).trim();
    }
  }
}

/**
 * @param {import('express').Request} req
 * @param {{ apexHosts?: Set<string> }} [opts]
 */
function isApexHost(req, opts) {
  const hosts = (opts && opts.apexHosts) || APEX_HOSTS;
  const host = String(resolveHostname(req) || "")
    .trim()
    .toLowerCase()
    .split(":")[0];
  if (hosts.has(host)) return true;
  // Local/test apex aliases
  if (host === "localhost" || host === "127.0.0.1") return true;
  return false;
}

/**
 * @param {import('express').Request} req
 */
function clientIp(req) {
  const xf = req.headers && req.headers["x-forwarded-for"];
  if (xf) return String(xf).split(",")[0].trim();
  return String((req.socket && req.socket.remoteAddress) || req.ip || "");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {{ error?: string, csrfToken: string }} opts
 */
function renderLoginPage(opts) {
  const error = opts.error
    ? `<p class="err" role="alert">${escapeHtml(opts.error)}</p>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in · BlessBoard</title>
  <style>
    :root { --violet: #6C5CE7; --ink: #1a1625; --muted: #5c5668; --bg: #f7f5fb; --err: #b42318; }
    body { margin: 0; font-family: "Hanken Grotesk", system-ui, sans-serif; background: var(--bg); color: var(--ink); }
    main { max-width: 24rem; margin: 0 auto; padding: 3rem 1.25rem; }
    h1 { font-size: 1.75rem; color: var(--violet); margin: 0 0 1rem; }
    label { display: block; font-size: 0.9rem; margin: 0.75rem 0 0.25rem; }
    input { width: 100%; box-sizing: border-box; padding: 0.65rem 0.75rem; border: 1px solid #d0cad8; border-radius: 8px; font: inherit; }
    button { margin-top: 1.25rem; width: 100%; padding: 0.7rem 1rem; border: 0; border-radius: 8px; background: var(--violet); color: #fff; font: inherit; cursor: pointer; }
    .err { color: var(--err); }
    .muted { color: var(--muted); font-size: 0.9rem; }
  </style>
</head>
<body>
  <main>
    <h1>Sign in</h1>
    <p class="muted">BlessBoard V5 apex authentication</p>
    ${error}
    <form method="post" action="/login" autocomplete="on">
      <input type="hidden" name="${CSRF_FIELD}" value="${escapeHtml(opts.csrfToken)}" />
      <label for="email">Email</label>
      <input id="email" name="email" type="email" required autocomplete="username" />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" required autocomplete="current-password" />
      <button type="submit">Sign in</button>
    </form>
  </main>
</body>
</html>`;
}

/**
 * @param {object} account
 */
function renderAccountPage(account) {
  const roles = (account.roles || []).map((r) => escapeHtml(r)).join(", ") || "(none)";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Account · BlessBoard</title>
  <style>
    :root { --violet: #6C5CE7; --ink: #1a1625; --muted: #5c5668; --bg: #f7f5fb; }
    body { margin: 0; font-family: "Hanken Grotesk", system-ui, sans-serif; background: var(--bg); color: var(--ink); }
    main { max-width: 28rem; margin: 0 auto; padding: 3rem 1.25rem; }
    h1 { color: var(--violet); }
    dl { line-height: 1.6; }
    dt { font-weight: 600; margin-top: 0.75rem; }
    dd { margin: 0; color: var(--muted); }
    button { margin-top: 1.5rem; padding: 0.6rem 1rem; border: 0; border-radius: 8px; background: var(--violet); color: #fff; font: inherit; cursor: pointer; }
  </style>
</head>
<body>
  <main>
    <h1>Account</h1>
    <dl>
      <dt>Display name</dt><dd>${escapeHtml(account.displayName)}</dd>
      <dt>User ID</dt><dd>${escapeHtml(account.userId)}</dd>
      <dt>Deployment</dt><dd>${escapeHtml(account.deploymentCode)}</dd>
      <dt>Roles</dt><dd>${roles}</dd>
      <dt>Organization ID</dt><dd>${escapeHtml(account.organizationId || "(none)")}</dd>
    </dl>
    <form method="post" action="/logout">
      <input type="hidden" name="${CSRF_FIELD}" value="${escapeHtml(account.csrfToken)}" />
      <button type="submit">Sign out</button>
    </form>
  </main>
</body>
</html>`;
}

/**
 * @param {{
 *   getPool?: () => { query: Function },
 *   enableDiagnosticHostContext?: boolean,
 *   apexHosts?: Set<string>,
 *   env?: NodeJS.ProcessEnv,
 * }} [options]
 */
function createV5FoundationApp(options) {
  const opts = options || {};
  const getPool = typeof opts.getPool === "function" ? opts.getPool : getPgPool;
  const env = opts.env || process.env;
  const enableDiagnostic =
    opts.enableDiagnosticHostContext !== undefined
      ? Boolean(opts.enableDiagnosticHostContext)
      : getPlatformHostContextMode(env) === "diagnostic";

  const app = express();
  const isProduction = String(env.NODE_ENV || "") === "production";

  app.disable("x-powered-by");
  if (env.TRUST_PROXY === "0" || env.TRUST_PROXY === "false") {
    app.set("trust proxy", false);
  } else if (env.TRUST_PROXY) {
    const n = Number(env.TRUST_PROXY);
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

  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    parseCookies(req);
    next();
  });

  const publicDir = path.join(__dirname, "..", "..", "..", "public");
  app.use(
    express.static(publicDir, {
      maxAge: isProduction ? "1d" : 0,
      immutable: false,
    })
  );

  if (enableDiagnostic) {
    const platformHostContextMode = getPlatformHostContextMode(env);
    const platformDeploymentIdentity = getPlatformDeploymentCode(env);
    warnOnceIfDiagnosticDeploymentUnavailable(platformHostContextMode, platformDeploymentIdentity);
    app.use(
      createLoadPlatformHostContext({
        getPool,
        getMode: () => getPlatformHostContextMode(env),
        getDeploymentIdentity: () => getPlatformDeploymentCode(env),
      })
    );
    app.use(createLoadBlessBoardCatalogueContext({ getPool }));
  }

  app.use(
    createLoadV5Session({
      getPool,
      getDeploymentCode: () => getPlatformDeploymentCode(env),
    })
  );

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const email = String((req.body && req.body.email) || "")
        .trim()
        .toLowerCase();
      const ip = clientIp(req);
      return sha256Hex(`${email}|${ip}`);
    },
    handler: (req, res) => {
      const csrfToken = issueCsrfToken(env);
      setCsrfCookie(res, csrfToken, { secure: isProduction });
      return res
        .status(429)
        .type("html")
        .send(
          renderLoginPage({
            csrfToken,
            error: "Too many sign-in attempts. Please wait a few minutes and try again.",
          })
        );
    },
  });

  app.get("/healthz", (req, res) => {
    if (env.DEBUG_HOST === "1") {
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

  app.get("/login", (req, res) => {
    if (!isApexHost(req, opts)) {
      return sendUnavailable(req, res);
    }
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction });
    return res.status(200).type("html").send(renderLoginPage({ csrfToken }));
  });

  app.post("/login", loginLimiter, async (req, res) => {
    if (!isApexHost(req, opts)) {
      return sendUnavailable(req, res);
    }
    const csrfToken = issueCsrfToken(env);
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      setCsrfCookie(res, csrfToken, { secure: isProduction });
      return res
        .status(403)
        .type("html")
        .send(renderLoginPage({ csrfToken, error: "Invalid or missing CSRF token. Please try again." }));
    }

    const deployment = getPlatformDeploymentCode(env);
    if (!deployment.ok || !deployment.code) {
      setCsrfCookie(res, csrfToken, { secure: isProduction });
      return res
        .status(503)
        .type("html")
        .send(renderLoginPage({ csrfToken, error: "Sign-in is temporarily unavailable." }));
    }

    try {
      const result = await authenticateBlessBoardUser(getPool(), {
        email: req.body && req.body.email,
        password: req.body && req.body.password,
        deploymentCode: deployment.code,
        ip: clientIp(req),
        userAgent: req.get("user-agent") || null,
      });

      if (!result.ok) {
        setCsrfCookie(res, csrfToken, { secure: isProduction });
        const message =
          result.status === "no_active_role"
            ? "Sign-in is not available for this account."
            : "Invalid email or password.";
        return res.status(401).type("html").send(renderLoginPage({ csrfToken, error: message }));
      }

      setV5SessionCookie(res, result.rawToken, { secure: isProduction, env });
      setCsrfCookie(res, csrfToken, { secure: isProduction });
      return res.redirect(303, "/account");
    } catch {
      setCsrfCookie(res, csrfToken, { secure: isProduction });
      return res
        .status(503)
        .type("html")
        .send(renderLoginPage({ csrfToken, error: "Sign-in is temporarily unavailable." }));
    }
  });

  app.post("/logout", async (req, res) => {
    if (!isApexHost(req, opts)) {
      return sendUnavailable(req, res);
    }
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return res.status(403).type("text").send("Invalid or missing CSRF token.");
    }
    const deployment = getPlatformDeploymentCode(env);
    const rawToken = readV5SessionCookie(req, env);
    try {
      if (deployment.ok && deployment.code && rawToken) {
        await revokeV5Session(getPool(), {
          rawToken,
          deploymentCode: deployment.code,
        });
      }
    } catch {
      /* fail-open clear cookie */
    }
    clearV5SessionCookie(res, { secure: isProduction, env });
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction });
    return res.redirect(303, "/login");
  });

  app.get("/account", async (req, res) => {
    if (!isApexHost(req, opts)) {
      return sendUnavailable(req, res);
    }
    if (!req.v5Session || !req.v5Session.authenticated || !req.v5Session.session) {
      return res.redirect(303, "/login");
    }
    const session = req.v5Session.session;
    let roleKeys = [];
    try {
      const roles = await listActiveRolesForUser(getPool(), session.userId);
      roleKeys = roles.map((r) => r.role_key);
    } catch {
      roleKeys = [];
    }
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction });
    return res.status(200).type("html").send(
      renderAccountPage({
        displayName: session.user.displayName,
        userId: session.userId,
        deploymentCode: session.deploymentCode,
        organizationId: session.organizationId,
        roles: roleKeys,
        csrfToken,
      })
    );
  });

  app.use((req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "POST") {
      if (isUnavailableAppPath(req.path)) {
        return sendUnavailable(req, res);
      }
    }
    return next();
  });

  app.use((req, res) => {
    if (/\.(?:css|js|mjs|map|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot)$/i.test(req.path)) {
      return res.status(404).type("text").send("Not found");
    }
    return sendUnavailable(req, res);
  });

  return app;
}

/**
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
  console.log(
    "[blessboard] V5 foundation mode: scheduled jobs remain disabled in this process (no job workers started)"
  );

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
  APEX_HOSTS,
  isUnavailableAppPath,
  isApexHost,
  createV5FoundationApp,
  verifyFoundationPool,
  startV5FoundationServer,
};
