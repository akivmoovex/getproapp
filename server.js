const path = require("path");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const session = require("express-session");
const BetterSqlite3 = require("better-sqlite3");
const SqliteSessionStore = require("better-sqlite3-session-store")(session);
const fs = require("fs");

// Load .env from the app root (next to server.js), not process.cwd() — Hostinger often uses another cwd.
const envPath = path.join(__dirname, ".env");
const dotenvResult = require("dotenv").config({ path: envPath, quiet: true });
const dotenvKeyCount = Object.keys(dotenvResult.parsed || {}).length;

// One-line diagnostics (no secrets). Hosting env vars exist before Node runs; .env only adds keys if the file exists.
// eslint-disable-next-line no-console
console.log(
  `[getpro] cwd=${process.cwd()} | .env file keys=${dotenvKeyCount} (${envPath}) | ADMIN_PASSWORD=${process.env.ADMIN_PASSWORD ? "set" : "MISSING"} | NODE_ENV=${process.env.NODE_ENV || "(unset)"} | PORT=${process.env.PORT || "(default 3000)"}`
);

const { ensureAdminUser } = require("./src/auth");
const { getSubdomain, resolveHostname } = require("./src/host");

let db;
try {
  ({ db } = require("./src/db"));
} catch (err) {
  // eslint-disable-next-line no-console
  console.error("[getpro] Failed to open app SQLite (check SQLITE_PATH / disk permissions):", err.message);
  // eslint-disable-next-line no-console
  console.error(err.stack);
  process.exit(1);
}

const { attachTenantByHost, RESERVED_PLATFORM_SUBDOMAINS } = require("./src/tenants");
const publicModule = require("./src/routes/public")({ db });
const adminRoutes = require("./src/routes/admin");
const apiRoutes = require("./src/routes/api");

const app = express();

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
const host = process.env.HOST || "0.0.0.0";

app.disable("x-powered-by");
// Behind Hostinger / nginx the real browser host is often in X-Forwarded-Host; trust proxy must be on.
if (process.env.TRUST_PROXY === "0" || process.env.TRUST_PROXY === "false") {
  app.set("trust proxy", false);
} else if (process.env.TRUST_PROXY) {
  const n = Number(process.env.TRUST_PROXY);
  app.set("trust proxy", Number.isFinite(n) && n >= 0 ? n : 1);
} else {
  app.set("trust proxy", 1);
}
app.use(helmet());
app.use(morgan("dev"));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(express.static(path.join(__dirname, "public")));

const sessionSecret = process.env.SESSION_SECRET || "dev_secret_change_me";
const sessionDir = process.env.SESSION_DIR || path.join(__dirname, "data");
const sessionDbPath = process.env.SESSION_DB_PATH || path.join(sessionDir, "sessions.db");

let sessionDb;
try {
  fs.mkdirSync(sessionDir, { recursive: true });
  sessionDb = new BetterSqlite3(sessionDbPath);
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(
    "[getpro] Failed to create session store SQLite (set SESSION_DIR to a writable folder, e.g. /tmp/getpro):",
    err.message
  );
  // eslint-disable-next-line no-console
  console.error(err.stack);
  process.exit(1);
}

app.use(
  session({
    name: "getpro_sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: new SqliteSessionStore({
      client: sessionDb,
      expired: {
        clear: true,
        // Cleanup expired sessions every ~15 minutes
        intervalMs: 15 * 60 * 1000,
      },
    }),
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
    },
  })
);

// Determine whether this request is coming from a company subdomain
app.use((req, res, next) => {
  req.subdomain = getSubdomain(req);
  next();
});

// Legacy host zam.{BASE} → zm.{BASE} (Zambia uses ISO alpha-2 subdomain)
app.use((req, res, next) => {
  const base = (process.env.BASE_DOMAIN || "").trim().toLowerCase();
  if (!base) return next();
  const host = (req.get("host") || "").split(":")[0].toLowerCase();
  if (host === `zam.${base}`) {
    const proto =
      (req.headers["x-forwarded-proto"] && String(req.headers["x-forwarded-proto"]).split(",")[0].trim()) ||
      req.protocol ||
      "https";
    return res.redirect(301, `${proto}://zm.${base}${req.originalUrl}`);
  }
  next();
});

// API and admin before tenant catch-alls so /api and /admin are not handled by public router
app.use("/api", apiRoutes({ db }));
app.use("/admin", adminRoutes({ db }));

// Healthcheck (with DEBUG_HOST=1, see also /api/debug/host)
app.get("/healthz", (req, res) => {
  if (process.env.DEBUG_HOST === "1") {
    return res.json({
      ok: true,
      resolvedHost: resolveHostname(req),
      xForwardedHost: req.headers["x-forwarded-host"] || null,
      hostHeader: req.headers.host || null,
      baseDomain: (process.env.BASE_DOMAIN || "").trim() || null,
    });
  }
  return res.json({ ok: true });
});

// Company subdomains: only GET / serves a page; other paths 404
app.use((req, res, next) => {
  const sub = req.subdomain;
  if (sub && !RESERVED_PLATFORM_SUBDOMAINS.has(sub)) {
    if (req.path !== "/" || req.method !== "GET") {
      return res.status(404).type("text").send("Not found");
    }
  }
  next();
});

// Company one-pagers (e.g. demo.getproapp.org/) — not zm/il platform hosts
app.get("/", (req, res, next) => {
  if (req.subdomain && !RESERVED_PLATFORM_SUBDOMAINS.has(req.subdomain)) {
    return publicModule.renderCompanyHome(req, res);
  }
  next();
});

// Legacy path URLs → tenant subdomains (Israel: il.*, Zambia: zm.*)
function redirectPathToTenantHost(req, res, pathPrefix, hostLabel) {
  const scheme = process.env.PUBLIC_SCHEME || "https";
  const base = (process.env.BASE_DOMAIN || "").trim();
  const u = req.originalUrl;
  const q = u.indexOf("?");
  const pathPart = q === -1 ? u : u.slice(0, q);
  const queryPart = q === -1 ? "" : u.slice(q);
  let rest = pathPart.slice(pathPrefix.length) || "/";
  if (!rest.startsWith("/")) rest = `/${rest}`;
  if (!base) {
    return res.redirect(301, rest + queryPart);
  }
  res.redirect(301, `${scheme}://${hostLabel}.${base}${rest}${queryPart}`);
}

app.use("/il", (req, res) => redirectPathToTenantHost(req, res, "/il", "il"));
app.use("/zm", (req, res) => redirectPathToTenantHost(req, res, "/zm", "zm"));
app.use("/bw", (req, res) => redirectPathToTenantHost(req, res, "/bw", "bw"));
app.use("/zw", (req, res) => redirectPathToTenantHost(req, res, "/zw", "zw"));
app.use("/za", (req, res) => redirectPathToTenantHost(req, res, "/za", "za"));
app.use("/na", (req, res) => redirectPathToTenantHost(req, res, "/na", "na"));

// Host-based tenants: apex + www → Zambia UI + region picker; zm.* / il.* → regional sites
app.use(attachTenantByHost);
app.use("/", publicModule.router);

if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  // eslint-disable-next-line no-console
  console.warn("[getpro] WARNING: SESSION_SECRET not set in production — using default (set a random secret in hosting env).");
}

ensureAdminUser({ db })
  .then(() => {
    app.listen(port, host, () => {
      // eslint-disable-next-line no-console
      console.log(`GetPro listening on ${host}:${port}`);
      const base = (process.env.BASE_DOMAIN || "").trim().toLowerCase();
      if (base) {
        // eslint-disable-next-line no-console
        console.log(
          `[getpro] Subdomain routing: zm.${base} → Zambia (tenant zm), il.${base} → Israel (tenant il). Requires reverse proxy to forward Host unchanged.`
        );
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          "[getpro] BASE_DOMAIN is unset — set BASE_DOMAIN=getproapp.org (no scheme) in production so zm.* / il.* resolve to tenants."
        );
      }
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Failed to initialize admin user:", err.message);
    if (/ADMIN_PASSWORD/i.test(String(err.message))) {
      // eslint-disable-next-line no-console
      console.error(
        "→ On Hostinger (and most hosts), .env is not deployed. Add ADMIN_PASSWORD in hPanel → Advanced → Environment variables, then redeploy."
      );
    }
    process.exit(1);
  });

