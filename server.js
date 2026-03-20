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
const { getSubdomain } = require("./src/host");

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

const publicRoutes = require("./src/routes/public");
const adminRoutes = require("./src/routes/admin");
const apiRoutes = require("./src/routes/api");

const app = express();

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
const host = process.env.HOST || "0.0.0.0";

app.disable("x-powered-by");
if (process.env.NODE_ENV === "production") {
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

// Public routes (marketing site + directory + per-company one-page websites)
app.use("/", publicRoutes({ db }));
// API routes (lead capture)
app.use("/api", apiRoutes({ db }));
// Admin
app.use("/admin", adminRoutes({ db }));

// Healthcheck
app.get("/healthz", (_req, res) => res.json({ ok: true }));

if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  // eslint-disable-next-line no-console
  console.warn("[getpro] WARNING: SESSION_SECRET not set in production — using default (set a random secret in hosting env).");
}

ensureAdminUser({ db })
  .then(() => {
    app.listen(port, host, () => {
      // eslint-disable-next-line no-console
      console.log(`GetPro listening on ${host}:${port}`);
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

