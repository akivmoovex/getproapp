const path = require("path");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const session = require("express-session");

// Load .env from the app root (next to server.js), not process.cwd() — Hostinger often uses another cwd.
const envPath = path.join(__dirname, ".env");
const dotenvResult = require("dotenv").config({ path: envPath, quiet: true });
const dotenvKeyCount = Object.keys(dotenvResult.parsed || {}).length;

const { getPgPool, isPgConfigured, logPgStartupDiagnostics, getDatabaseUrlEnvName } = require("./src/db/pg");
if (!isPgConfigured()) {
  // eslint-disable-next-line no-console
  console.error(
    "[getpro] FATAL: DATABASE_URL or GETPRO_DATABASE_URL must be set. This server requires PostgreSQL."
  );
  process.exit(1);
}

const { db, verifyProductionPgOnlyRuntime } = require("./src/db");
verifyProductionPgOnlyRuntime();
logPgStartupDiagnostics();

// One-line diagnostics (no secrets). Hosting env vars exist before Node runs; .env only adds keys if the file exists.
// eslint-disable-next-line no-console
console.log(
  `[getpro] cwd=${process.cwd()} | .env file keys=${dotenvKeyCount} (${envPath}) | databaseUrl=${getDatabaseUrlEnvName()} | ADMIN_PASSWORD=${process.env.ADMIN_PASSWORD ? "set" : "MISSING"} | NODE_ENV=${process.env.NODE_ENV || "(unset)"} | PORT=${process.env.PORT || "(default 3000)"} | HOST=${process.env.HOST || "(default 0.0.0.0)"}`
);

const { ensureAdminUser } = require("./src/auth");
const { seedBuiltinUsers } = require("./src/seeds/seedBuiltinUsers");
const { seedManagerUsers } = require("./src/seeds/seedManagerUsers");
const { seedFieldAgentUser } = require("./src/seeds/seedFieldAgentUser");
const { ensureFieldAgentSchema } = require("./src/db/pg/ensureFieldAgentSchema");
const { ensureTenantPhoneRulesSchema } = require("./src/db/pg/ensureTenantPhoneRulesSchema");
const { ensureContentLocaleSchema } = require("./src/db/pg/ensureContentLocaleSchema");
const { tenantHomeHrefFromPrefix } = require("./src/lib/tenantHomeHref");
const { getSubdomain, resolveHostname } = require("./src/platform/host");

const {
  createAttachTenantByHost,
  buildRegionChoicesFromDbAsync,
  getCachedTenantStageByIdAsync,
  getCachedTenantSlugExistsAsync,
} = require("./src/tenants");
const { STAGES } = require("./src/tenants/tenantStages");
const { eventTimeParts } = require("./src/lib/eventTime");
const branding = require("./src/platform/branding");
const { createAssetUrl } = require("./src/platform/assetUrls");
const publicModule = require("./src/routes/public")();
const fieldAgentRoutes = require("./src/routes/fieldAgent");
const adminRoutes = require("./src/routes/admin");
const companyPortalRoutes = require("./src/routes/companyPortal");
const clientPortalRoutes = require("./src/routes/clientPortal");
const apiRoutes = require("./src/routes/api");
const { runProductionStartupChecks } = require("./src/startup/productionStartupChecks");
const companiesRepo = require("./src/db/pg/companiesRepo");
const tenantsRepo = require("./src/db/pg/tenantsRepo");

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

const isProduction = process.env.NODE_ENV === "production";
/** Omit query strings from access logs (tokens, PII in URLs). */
morgan.token("pathNoQuery", (req) => {
  const u = req.originalUrl || req.url || "";
  const q = u.indexOf("?");
  return q === -1 ? u : u.slice(0, q);
});
const PROD_LOG_SKIP_EXT = /\.(?:css|js|mjs|map|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot)$/i;
function skipProductionRequestLog(req) {
  if (req.path === "/healthz") return true;
  if (req.path.startsWith("/build/")) return true;
  return PROD_LOG_SKIP_EXT.test(req.path);
}
if (isProduction) {
  app.use(
    morgan(":method :pathNoQuery :status :res[content-length] - :response-time ms", {
      skip: skipProductionRequestLog,
    })
  );
} else {
  app.use(morgan("dev"));
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use((req, res, next) => {
  const stylesVersion = process.env.GETPRO_STYLES_V || "20260331-home-search-fix-final";
  res.locals.stylesVersion = stylesVersion;
  res.locals.asset = createAssetUrl(stylesVersion);
  res.locals.encodeURIComponent = encodeURIComponent;
  res.locals.eventTimeParts = eventTimeParts;
  res.locals.showUiGuard = process.env.NODE_ENV !== "production";
  res.locals.brandProductName = branding.PRODUCT_NAME;
  res.locals.brandProductNameGetPro = branding.PRODUCT_NAME_GETPRO;
  res.locals.brandPublicTagline = branding.PUBLIC_TAGLINE;
  // EJS `include('partials/brand_resolve')` does not hoist `var` into the parent template; views that use `_bn` without defining it need locals.
  res.locals._bn = typeof res.locals.brandProductName !== "undefined" ? res.locals.brandProductName : "Pro-online";
  res.locals._bnGetPro =
    typeof res.locals.brandProductNameGetPro !== "undefined" ? res.locals.brandProductNameGetPro : "GetPro";
  next();
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const publicDir = path.join(__dirname, "public");
const viteBuildDir = path.join(publicDir, "build");
// Split cache: Vite emits content-hashed files under /build/* (safe for immutable + long max-age).
// Legacy /public/* files use ?v= cache-busting; avoid immutable so browsers may revalidate.
app.use(
  "/build",
  express.static(viteBuildDir, {
    maxAge: isProduction ? "30d" : 0,
    immutable: isProduction,
  })
);
app.use(
  express.static(publicDir, {
    maxAge: isProduction ? "1d" : 0,
    immutable: false,
  })
);

if (process.env.NODE_ENV === "production") {
  const raw = process.env.SESSION_SECRET;
  if (raw == null || String(raw).trim() === "") {
    // eslint-disable-next-line no-console
    console.error(
      "[getpro] FATAL: SESSION_SECRET must be set to a non-empty string in production (hosting env / panel). Use a long random value; do not commit it."
    );
    process.exit(1);
  }
  runProductionStartupChecks();
}
const sessionSecret = process.env.SESSION_SECRET || "dev_secret_change_me";

/** Session persistence: PostgreSQL only (same pool as app data). */
const connectPgSimple = require("connect-pg-simple");
const PgSession = connectPgSimple(session);
const sessionPool = getPgPool();
const sessionStore = new PgSession({
  pool: sessionPool,
  tableName: "session",
  createTableIfMissing: true,
});
// eslint-disable-next-line no-console
console.log("[getpro] Session store: PostgreSQL (public.session via connect-pg-simple)");

app.use(
  session({
    name: "getpro_sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
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
app.use(async (req, res, next) => {
  try {
    req.isPlatformTenant = false;
    const sub = req.subdomain;
    if (sub) {
      const pool = getPgPool();
      req.isPlatformTenant = await getCachedTenantSlugExistsAsync(pool, sub);
    }
    next();
  } catch (e) {
    next(e);
  }
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

// Tenant + region context before /api and /admin so staff routes can compute tenant-aware links (e.g. Cancel → regional home).
app.use(createAttachTenantByHost());

app.use(async (req, res, next) => {
  try {
    const base = (process.env.BASE_DOMAIN || "").trim().toLowerCase();
    const scheme = process.env.PUBLIC_SCHEME || "https";
    const pool = getPgPool();
    req.regionChoices = await buildRegionChoicesFromDbAsync(pool, base, scheme);
    res.locals.regionChoices = req.regionChoices;
    req.regionZmUrl = base ? `${scheme}://zm.${base}` : "";
    req.regionIlUrl = base ? `${scheme}://il.${base}` : "";
    res.locals.regionZmUrl = req.regionZmUrl;
    res.locals.regionIlUrl = req.regionIlUrl;
    next();
  } catch (e) {
    next(e);
  }
});

// API and admin before tenant catch-alls so /api and /admin are not handled by public router
app.use("/api", apiRoutes());
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
app.get("/", async (req, res, next) => {
  if (req.subdomain && !req.isPlatformTenant) {
    try {
      const pool = getPgPool();
      const company = await companiesRepo.getTenantIdAndSubdomainBySubdomain(pool, req.subdomain);
      if (!company) {
        return res.status(404).type("text").send("Not found");
      }
      const t = await tenantsRepo.getById(pool, company.tenant_id);
      if (!t || !t.slug) {
        return res.status(404).type("text").send("Not found");
      }
      const base = (process.env.BASE_DOMAIN || "").trim();
      const scheme = process.env.PUBLIC_SCHEME || "https";
      if (base) {
        return res.redirect(301, `${scheme}://${t.slug}.${base}/${company.subdomain}`);
      }
      return publicModule.renderCompanyHome(req, res).catch(next);
    } catch (e) {
      return next(e);
    }
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

/**
 * Sign-in hub + field agent portal run *before* the "region enabled" gate so staff can authenticate
 * when a tenant is staged/disabled (Cancel / Back links must not land on a 503 home).
 */
app.get("/login", (req, res) => {
  if (!req.tenant || !req.tenant.id) {
    return res.status(404).type("text").send("Region not found.");
  }
  const prefix = req.tenantUrlPrefix != null ? String(req.tenantUrlPrefix) : "";
  return res.render("portal_login_hub", {
    tenant: req.tenant,
    tenantUrlPrefix: prefix,
    tenantHomeHref: tenantHomeHrefFromPrefix(prefix),
  });
});

app.use(fieldAgentRoutes());

// Only `Enabled` tenants are served publicly (subdomain + apex content)
app.use(async (req, res, next) => {
  try {
    if (!req.tenant || !req.tenant.slug) return next();
    const pool = getPgPool();
    const row = await getCachedTenantStageByIdAsync(pool, req.tenant.id);
    if (!row || row.stage !== STAGES.ENABLED) {
      return res.status(503).type("text").send("This region is not available.");
    }
    next();
  } catch (e) {
    next(e);
  }
});

/** Role-separated portals: client (foundation), provider + legacy company path, same router. */
app.use("/client", clientPortalRoutes());
app.use("/company", companyPortalRoutes());
app.use("/provider", companyPortalRoutes());

app.use("/", publicModule.router);

const pgPoolForBoot = getPgPool();

ensureAdminUser({ pool: pgPoolForBoot })
  .then(async () => {
    await ensureFieldAgentSchema(pgPoolForBoot);
    await ensureTenantPhoneRulesSchema(pgPoolForBoot);
    await ensureContentLocaleSchema(pgPoolForBoot);
    await seedBuiltinUsers(pgPoolForBoot);
    await seedManagerUsers(pgPoolForBoot);
    await seedFieldAgentUser(pgPoolForBoot);
    app.listen(port, host, () => {
      // eslint-disable-next-line no-console
      console.log(`GetPro listening on ${host}:${port}`);
      const base = (process.env.BASE_DOMAIN || "").trim().toLowerCase();
      if (base) {
        // eslint-disable-next-line no-console
        console.log(
          `[getpro] Subdomain routing: zm.${base} → Zambia (tenant zm), il.${base} → Israel (tenant il). Requires reverse proxy to forward Host unchanged.`
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

