const { runBootstrap, logBootstrapMarker } = require("./src/startup/bootstrap");
const boot = runBootstrap();
logBootstrapMarker(boot);

// Refuse unknown PLATFORM_DEPLOYMENT_CODE before domain diagnostics so a Hostinger typo
// cannot log BlessBoard production defaults and then abort (misleading 503 evidence).
const {
  assertAuthoritativeProfileRuntimePairingOrExit,
} = require("./src/platform/config/v5EnvValidation");
const {
  assertDeploymentProfileOrExit,
  resolveDeploymentConfiguration,
  hasAuthoritativeDeploymentProfile,
  RUNTIME_V5_FOUNDATION,
} = require("./src/platform/config/deploymentProfiles");
assertDeploymentProfileOrExit();
assertAuthoritativeProfileRuntimePairingOrExit();

const {
  isPgConfigured,
  logPgStartupDiagnostics,
  logDatabaseEnvMissingDiagnostics,
  getDatabaseUrlEnvName,
} = require("./src/db/pg");

const {
  assertBlessBoardOrgDbIsolationOrExit,
} = require("./src/startup/blessBoardOrgDbGate");
assertBlessBoardOrgDbIsolationOrExit(boot);

const { logBlessBoardRuntimeIsolationDiagnostics } = require("./src/startup/blessBoardRuntimeDiagnostics");
logBlessBoardRuntimeIsolationDiagnostics();

if (!isPgConfigured()) {
  // Inconsistent env across restarts (missing vars on some boots) is usually a deployment/supervisor issue:
  // wrong cwd, forked workers without panel env, or .env not loaded because the process was started outside the app root.
  logDatabaseEnvMissingDiagnostics({
    label: "server.js (HTTP)",
    envPath: boot.envPath,
    dotenvKeyCount: boot.dotenvKeyCount,
    dotenvErrorMessage: boot.dotenvErrorMessage,
    startupEntry: boot.startupEntry,
    beforeDbSnapshot: boot.beforeDb,
    envFileExists: boot.envFileExists,
    dotenvSkipped: boot.skipDotenv,
    dbProvenanceLogLine: boot.dbProvenance.logLine,
    liteSpeedLsnode: boot.liteSpeedLsnode,
    workerLabel: boot.workerLabel,
  });
  // eslint-disable-next-line no-console
  console.error(
    "[getpro] FATAL: MISCONFIGURED WORKER — DATABASE_URL and GETPRO_DATABASE_URL are both missing. PostgreSQL is mandatory; this process exits. Fix: set DATABASE_URL (or GETPRO_DATABASE_URL) in Hostinger → Environment variables for **every** Node worker and/or the Hostinger-recommended `.env.production` (see bootstrap log `productionEnvFile`; missing keys only; injected env wins). Healthy workers log \"Healthy worker: DB URL available after bootstrap\"."
  );
  const exitDelayMs = Math.min(
    Math.max(Number(process.env.GETPRO_DB_MISSING_EXIT_DELAY_MS ?? 1500), 0),
    60000
  );
  if (exitDelayMs > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `[getpro] Pausing ${exitDelayMs}ms before exit (GETPRO_DB_MISSING_EXIT_DELAY_MS) to reduce rapid restart storms; set to 0 for immediate exit.`
    );
    // Synchronous wait so we never bootstrap HTTP/PostgreSQL without a URL (async setTimeout would fall through).
    try {
      const buf = new SharedArrayBuffer(4);
      const arr = new Int32Array(buf);
      Atomics.wait(arr, 0, 0, exitDelayMs);
    } catch {
      const end = Date.now() + exitDelayMs;
      while (Date.now() < end) {}
    }
  }
  process.exit(1);
}

const { verifyProductionPgOnlyRuntime } = require("./src/db");
verifyProductionPgOnlyRuntime();
logPgStartupDiagnostics({
  envPath: boot.envPath,
  dotenvKeyCount: boot.dotenvKeyCount,
  startupEntry: boot.startupEntry,
  dbProvenanceLogLine: boot.dbProvenance.logLine,
});

const { isV5FoundationMode } = require("./src/platform/config/v5FoundationMode");

const { assertProductionRequiredEnvOrExit } = require("./src/startup/productionEnvGate");
assertProductionRequiredEnvOrExit(boot);

// One-line diagnostics (no secrets). Official BlessBoard profiles do not use ADMIN_PASSWORD.
const adminPasswordDiag = hasAuthoritativeDeploymentProfile()
  ? "n/a (deployment profile)"
  : process.env.ADMIN_PASSWORD
    ? "set"
    : "MISSING";
// eslint-disable-next-line no-console
console.log(
  `[getpro] cwd=${process.cwd()} | startup entry=${boot.startupEntry} | dotenvKeysMerged=${boot.dotenvKeyCount} (${boot.envPath}) | databaseUrl=${getDatabaseUrlEnvName()} | ADMIN_PASSWORD=${adminPasswordDiag} | NODE_ENV=${process.env.NODE_ENV || "(unset)"} | PORT=${process.env.PORT || "(default 3000)"} | HOST=${process.env.HOST || "(default 0.0.0.0)"}`
);

const deployment = resolveDeploymentConfiguration();
const runtimeMode = deployment.runtimeMode;

if (runtimeMode === RUNTIME_V5_FOUNDATION || runtimeMode === "legacy-redirect" || (!runtimeMode && isV5FoundationMode())) {
  // Profiled multi-product foundation (BlessBoard, ActiveClinic, GetPro, Netraz, Moovex, redirects).
  void require("./src/platform/http/v5FoundationServer")
    .startV5FoundationServer({ boot })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[blessboard] V5 foundation startup error:", err && err.message ? err.message : err);
      process.exit(1);
    });
} else if (!runtimeMode) {
  // Unprofiled GetPro / transitional: full legacy application.
  require("./server.legacy");
} else {
  // eslint-disable-next-line no-console
  console.error(
    `[blessboard] FATAL: unsupported deployment runtimeMode=${JSON.stringify(runtimeMode)}.`
  );
  process.exit(1);
}
