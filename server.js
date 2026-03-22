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
const { seedBuiltinUsers } = require("./src/seedBuiltinUsers");
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

const {
  createAttachTenantByHost,
  buildRegionChoicesFromDb,
} = require("./src/tenants");
const { STAGES } = require("./src/tenantStages");
const { eventTimeParts } = require("./src/eventTime");
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

app.use((req, res, next) => {
  res.locals.stylesVersion = process.env.GETPRO_STYLES_V || "20260326f";
  res.locals.encodeURIComponent = encodeURIComponent;
  res.locals.eventTimeParts = eventTimeParts;
  next();
});

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

// Subdomain is a platform tenant (row in `tenants`) vs a company marketing subdomain
app.use((req, res, next) => {
  req.isPlatformTenant = false;
  const sub = req.subdomain;
  if (sub) {
    const row = db.prepare("SELECT 1 FROM tenants WHERE slug = ?").get(sub);
    req.isPlatformTenant = !!row;
  }
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
  if (sub && !req.isPlatformTenant) {
    if (req.path !== "/" || req.method !== "GET") {
      return res.status(404).type("text").send("Not found");
    }
  }
  next();
});

// Legacy company hosts (e.g. demo-lusaka-spark.getproapp.org/) → regional path mini-site (demo.getproapp.org/demo-lusaka-spark)
app.get("/", (req, res, next) => {
  if (req.subdomain && !req.isPlatformTenant) {
    const company = db
      .prepare("SELECT tenant_id, subdomain FROM companies WHERE subdomain = ?")
      .get(req.subdomain);
    if (!company) {
      return res.status(404).type("text").send("Not found");
    }
    const t = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(company.tenant_id);
    if (!t || !t.slug) {
      return res.status(404).type("text").send("Not found");
    }
    const base = (process.env.BASE_DOMAIN || "").trim();
    const scheme = process.env.PUBLIC_SCHEME || "https";
    if (base) {
      return res.redirect(301, `${scheme}://${t.slug}.${base}/${company.subdomain}`);
    }
    return publicModule.renderCompanyHome(req, res).catch(next);
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

app.use("/global", (req, res) => redirectPathToTenantHost(req, res, "/global", "global"));
app.use("/demo", (req, res) => redirectPathToTenantHost(req, res, "/demo", "demo"));
app.use("/il", (req, res) => redirectPathToTenantHost(req, res, "/il", "il"));
app.use("/zm", (req, res) => redirectPathToTenantHost(req, res, "/zm", "zm"));
app.use("/bw", (req, res) => redirectPathToTenantHost(req, res, "/bw", "bw"));
app.use("/zw", (req, res) => redirectPathToTenantHost(req, res, "/zw", "zw"));
app.use("/za", (req, res) => redirectPathToTenantHost(req, res, "/za", "za"));
app.use("/na", (req, res) => redirectPathToTenantHost(req, res, "/na", "na"));

// Host-based tenants: apex + regional subdomains
app.use(createAttachTenantByHost(db));

app.use((req, res, next) => {
  const base = (process.env.BASE_DOMAIN || "").trim().toLowerCase();
  const scheme = process.env.PUBLIC_SCHEME || "https";
  req.regionChoices = buildRegionChoicesFromDb(db, base, scheme);
  res.locals.regionChoices = req.regionChoices;
  req.regionZmUrl = base ? `${scheme}://zm.${base}` : "";
  req.regionIlUrl = base ? `${scheme}://il.${base}` : "";
  res.locals.regionZmUrl = req.regionZmUrl;
  res.locals.regionIlUrl = req.regionIlUrl;
  next();
});

function tenantHomeHrefFromPrefix(prefix) {
  if (prefix === "" || prefix == null) return "/";
  const ps = String(prefix);
  if (ps.startsWith("http")) return `${ps.replace(/\/$/, "")}/`;
  return `${ps}/`;
}

/** Public entry to admin login (same form as `/admin/login`, with Cancel). */
app.get("/getpro-admin", (req, res) => {
  const scheme = process.env.PUBLIC_SCHEME || "https";
  const base = (process.env.BASE_DOMAIN || "").trim().toLowerCase();
  if (req.subdomain && !req.isPlatformTenant) {
    if (base) return res.redirect(302, `${scheme}://zm.${base}/getpro-admin`);
    return res.redirect(302, "/getpro-admin");
  }
  if (!req.tenant) {
    return res.status(500).type("text").send("Tenant not resolved");
  }
  const prefix = req.tenantUrlPrefix !== undefined && req.tenantUrlPrefix !== null ? req.tenantUrlPrefix : "";
  return res.render("getpro_admin", {
    error: null,
    tenant: req.tenant,
    tenantUrlPrefix: prefix,
    tenantHomeHref: tenantHomeHrefFromPrefix(prefix),
  });
});

// Only `Enabled` tenants are served publicly (subdomain + apex content)
app.use((req, res, next) => {
  if (!req.tenant || !req.tenant.slug) return next();
  const row = db.prepare("SELECT stage FROM tenants WHERE id = ?").get(req.tenant.id);
  if (!row || row.stage !== STAGES.ENABLED) {
    return res.status(503).type("text").send("This region is not available.");
  }
  next();
});

app.use("/", publicModule.router);

if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  // eslint-disable-next-line no-console
  console.warn("[getpro] WARNING: SESSION_SECRET not set in production — using default (set a random secret in hosting env).");
}

ensureAdminUser({ db })
  .then(() => {
    seedBuiltinUsers(db);
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

