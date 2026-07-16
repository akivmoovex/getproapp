"use strict";

/**
 * BlessBoard V5 runtime + database identity verification.
 *
 * Covers:
 * 1. Testing deployment + testing database identity starts.
 * 2. Testing deployment + production identity fails.
 * 3. Production deployment + testing identity fails.
 * 4. Missing identity fails.
 * 5. Diagnostics require the correct platform role.
 * 6. Diagnostics never expose URLs, passwords or secrets.
 * 7. Latest expected migration reflects the real latest migration.
 * 8. Debug pg-ping is removed.
 * 9. V4 and V5 identities can be different.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  verifyDatabaseIdentity,
  assertBlessBoardDatabaseIdentityOrExit,
} = require("../src/startup/blessBoardOrgDbGate");
const {
  CHURCH_SCHEMA_MIGRATION_FILES,
  latestChurchSchemaMigration,
  ensureChurchSchema,
} = require("../src/db/pg/ensureChurchSchema");
const {
  getDatabaseIdentity,
  insertDatabaseIdentity,
} = require("../src/db/pg/church/databaseIdentityRepo");
const churchProductionDiagnostics = require("../src/services/church/churchProductionDiagnostics");
const { requireSuperAdmin } = require("../src/auth");
const { requireChurchPgOrSkip } = require("./helpers/churchPgTest");

const PG_DIR = path.join(__dirname, "..", "db", "postgres");

const ENV_KEYS = [
  "NODE_ENV",
  "DEPLOYMENT_ENV",
  "BLESSBOARD_CANONICAL_DOMAIN",
  "CHURCH_HOST_DOMAIN",
  "DATABASE_URL",
  "GETPRO_DATABASE_URL",
  "GETPRO_TEST_DB",
  "TEST_DATABASE_URL",
];

async function withEnv(overrides, fn) {
  const prev = {};
  for (const key of ENV_KEYS) prev[key] = process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

/** Stub pool answering the identity SELECT and the generic diagnostics queries. */
function stubPool(identityRow, { throwCode } = {}) {
  return {
    query: async (sql) => {
      const text = String(sql);
      if (/church_database_identity/.test(text) && /SELECT/i.test(text)) {
        if (throwCode) {
          const err = new Error("boom");
          err.code = throwCode;
          throw err;
        }
        return { rows: identityRow ? [identityRow] : [] };
      }
      if (/current_database\(\)/.test(text) && /server_version/.test(text)) {
        return {
          rows: [
            {
              current_database: "blessboard_v5_test",
              server_version: "15.4",
              server_addr: "10.0.0.5",
              server_port: 5432,
            },
          ],
        };
      }
      if (/current_database\(\)/.test(text)) {
        return { rows: [{ db: "blessboard_v5_test" }] };
      }
      if (/to_regclass/.test(text)) {
        return { rows: [{ latest_present: true }] };
      }
      return { rows: [] };
    },
  };
}

function identityRow(environmentCode, instanceId) {
  return {
    id: 1,
    environment_code: environmentCode,
    deployment_name: `${environmentCode} deployment`,
    database_instance_id: instanceId || crypto.randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ---- 1. Testing deployment + testing identity starts -----------------------
test("verifyDatabaseIdentity: testing deployment + testing identity → ok", async () => {
  const result = await verifyDatabaseIdentity(stubPool(identityRow("testing")), {
    deploymentEnv: "testing",
  });
  assert.equal(result.status, "ok");
  assert.equal(result.identity.environmentCode, "testing");
});

// ---- 2. Testing deployment + production identity fails ----------------------
test("verifyDatabaseIdentity: testing deployment + production identity → fatal mismatch", async () => {
  const result = await verifyDatabaseIdentity(stubPool(identityRow("production")), {
    deploymentEnv: "testing",
  });
  assert.equal(result.status, "fatal");
  assert.equal(result.reason, "mismatch");
});

// ---- 3. Production deployment + testing identity fails ----------------------
test("verifyDatabaseIdentity: production deployment + testing identity → fatal mismatch", async () => {
  const result = await verifyDatabaseIdentity(stubPool(identityRow("testing")), {
    deploymentEnv: "production",
  });
  assert.equal(result.status, "fatal");
  assert.equal(result.reason, "mismatch");
});

// ---- 4. Missing identity fails ---------------------------------------------
test("verifyDatabaseIdentity: missing identity → fatal missing", async () => {
  const result = await verifyDatabaseIdentity(stubPool(null), { deploymentEnv: "testing" });
  assert.equal(result.status, "fatal");
  assert.equal(result.reason, "missing");
});

test("verifyDatabaseIdentity: missing table (42P01) → fatal missing", async () => {
  const result = await verifyDatabaseIdentity(stubPool(null, { throwCode: "42P01" }), {
    deploymentEnv: "production",
  });
  assert.equal(result.status, "fatal");
  assert.equal(result.reason, "missing");
});

test("verifyDatabaseIdentity: read error → fatal read-error (fail closed)", async () => {
  const result = await verifyDatabaseIdentity(stubPool(null, { throwCode: "08006" }), {
    deploymentEnv: "production",
  });
  assert.equal(result.status, "fatal");
  assert.equal(result.reason, "read-error");
});

test("verifyDatabaseIdentity: skips when DEPLOYMENT_ENV is not testing/production", async () => {
  for (const env of ["development", "", "staging"]) {
    const result = await verifyDatabaseIdentity(stubPool(identityRow("production")), {
      deploymentEnv: env,
    });
    assert.equal(result.status, "skip", `env=${env}`);
  }
});

test("verifyDatabaseIdentity: no pool under enforced env → fatal", async () => {
  const result = await verifyDatabaseIdentity(null, { deploymentEnv: "production" });
  assert.equal(result.status, "fatal");
  assert.equal(result.reason, "no-pool");
});

test("assertBlessBoardDatabaseIdentityOrExit: fatal exits(1) and logs sanitized error", async () => {
  const exits = [];
  const errors = [];
  await assertBlessBoardDatabaseIdentityOrExit(stubPool(identityRow("production")), {
    deploymentEnv: "testing",
    exit: (code) => exits.push(code),
    logger: { log: () => {}, error: (m) => errors.push(String(m)) },
  });
  assert.deepEqual(exits, [1]);
  assert.match(errors.join("\n"), /mismatch/i);
});

test("assertBlessBoardDatabaseIdentityOrExit: ok does not exit", async () => {
  const exits = [];
  const result = await assertBlessBoardDatabaseIdentityOrExit(stubPool(identityRow("testing")), {
    deploymentEnv: "testing",
    exit: (code) => exits.push(code),
    logger: { log: () => {}, error: () => {} },
  });
  assert.equal(result.status, "ok");
  assert.deepEqual(exits, []);
});

// ---- 9. V4 and V5 identities can be different ------------------------------
test("V4 and V5 identities are independent and can differ", async () => {
  const v4 = identityRow("production", crypto.randomUUID());
  const v5 = identityRow("testing", crypto.randomUUID());
  assert.notEqual(v4.database_instance_id, v5.database_instance_id);

  const v4Result = await verifyDatabaseIdentity(stubPool(v4), { deploymentEnv: "production" });
  const v5Result = await verifyDatabaseIdentity(stubPool(v5), { deploymentEnv: "testing" });
  assert.equal(v4Result.status, "ok");
  assert.equal(v5Result.status, "ok");
  assert.notEqual(v4Result.identity.databaseInstanceId, v5Result.identity.databaseInstanceId);
});

// ---- 5. Diagnostics require the correct platform role ----------------------
test("diagnostics gate: requireSuperAdmin denies anon, non-super; allows super", async () => {
  function fakeRes() {
    const res = { statusCode: null, sent: null, redirected: null };
    res.status = (c) => {
      res.statusCode = c;
      return res;
    };
    res.type = () => res;
    res.send = (b) => {
      res.sent = b;
      return res;
    };
    res.redirect = (u) => {
      res.redirected = u;
      return res;
    };
    return res;
  }

  // anonymous → redirect to login
  let res = fakeRes();
  let nexted = false;
  await requireSuperAdmin({ session: null }, res, () => (nexted = true));
  assert.equal(res.redirected, "/admin/login");
  assert.equal(nexted, false);

  // non-super (tenant_viewer) → 403
  res = fakeRes();
  nexted = false;
  await requireSuperAdmin(
    { session: { adminUser: { role: "tenant_viewer" } } },
    res,
    () => (nexted = true)
  );
  assert.equal(res.statusCode, 403);
  assert.equal(nexted, false);

  // super_admin → next()
  res = fakeRes();
  nexted = false;
  await requireSuperAdmin(
    { session: { adminUser: { role: "super_admin" } } },
    res,
    () => (nexted = true)
  );
  assert.equal(nexted, true);
});

test("diagnostics route is registered behind requireSuperAdmin", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "src", "routes", "admin", "adminChurchPlatform.js"),
    "utf8"
  );
  assert.match(src, /router\.get\(\s*["']\/church\/diagnostics["']\s*,\s*requireSuperAdmin/);
});

// ---- 6. Diagnostics never expose URLs, passwords or secrets ----------------
test("gatherChurchProductionDiagnostics: never leaks URL, user, or password", async () => {
  await withEnv(
    {
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "production",
      BLESSBOARD_CANONICAL_DOMAIN: "blessboard.com",
      CHURCH_HOST_DOMAIN: "blessboard.com",
      GETPRO_TEST_DB: undefined,
      TEST_DATABASE_URL: undefined,
      DATABASE_URL: "postgresql://v5user:SuperSecretPass@db-abc123.supabase.co:5432/blessboard_secret_db",
    },
    async () => {
      const diagnostics = await churchProductionDiagnostics.gatherChurchProductionDiagnostics({
        pool: stubPool(identityRow("production")),
      });
      const json = JSON.stringify(diagnostics);
      assert.doesNotMatch(json, /SuperSecretPass/);
      assert.doesNotMatch(json, /v5user/);
      assert.doesNotMatch(json, /postgresql:\/\//);
      assert.doesNotMatch(json, /postgres:\/\//);
      assert.doesNotMatch(json, /blessboard_secret_db/);
      // Sanitized fields are present.
      assert.equal(diagnostics.deploymentIdentity.databaseEnvironmentCode, "production");
      assert.match(diagnostics.deploymentIdentity.databaseHostFingerprint, /supabase\.co/);
      assert.match(diagnostics.deploymentIdentity.postgresServerIdentity, /^sha256:/);
      assert.ok(diagnostics.sessionCookieName);
      assert.equal(typeof diagnostics.backgroundJobsEnabled, "boolean");
      assert.match(diagnostics.uploadRootFingerprint, /^[0-9a-f]{12} \(/);
    }
  );
});

// ---- 7. Latest expected migration reflects the real latest migration -------
test("latestChurchSchemaMigration equals the highest-numbered migration on disk", () => {
  const files = fs
    .readdirSync(PG_DIR)
    .filter((n) => /^\d{3}_.*\.sql$/i.test(n) && !n.includes(" 2.sql") && n !== "000_full_schema.sql");
  const maxNum = files.reduce((max, name) => {
    const num = parseInt(name.slice(0, 3), 10);
    return num > max ? num : max;
  }, 0);
  const latest = latestChurchSchemaMigration();
  assert.equal(parseInt(latest.slice(0, 3), 10), maxNum);
  assert.equal(latest, CHURCH_SCHEMA_MIGRATION_FILES[CHURCH_SCHEMA_MIGRATION_FILES.length - 1]);
  assert.equal(latest, "124_church_growth_scheduled_job_safety.sql");
});

test("diagnostics no longer reference the stale migration 090", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "src", "services", "church", "churchProductionDiagnostics.js"),
    "utf8"
  );
  assert.doesNotMatch(src, /migration 090/i);
});

test("migration 121 defines a singleton identity table", () => {
  const sql = fs.readFileSync(path.join(PG_DIR, "121_church_database_identity.sql"), "utf8");
  assert.match(sql, /church_database_identity/);
  assert.match(sql, /CHECK \(id = 1\)/);
  assert.match(sql, /database_instance_id UUID NOT NULL/i);
  assert.match(sql, /environment_code IN \('testing', 'production'\)/);
});

// ---- 8. Debug pg-ping is removed -------------------------------------------
test("GET /api/debug/pg-ping is removed even with GETPRO_PG_HEALTH_ROUTE=1", async () => {
  const express = require("express");
  const request = require("supertest");
  const apiRoutes = require("../src/routes/api");

  const prev = process.env.GETPRO_PG_HEALTH_ROUTE;
  process.env.GETPRO_PG_HEALTH_ROUTE = "1";
  try {
    const app = express();
    app.use("/api", apiRoutes());
    const res = await request(app).get("/api/debug/pg-ping");
    assert.equal(res.status, 404);
  } finally {
    if (prev === undefined) delete process.env.GETPRO_PG_HEALTH_ROUTE;
    else process.env.GETPRO_PG_HEALTH_ROUTE = prev;
  }
});

test("api.js no longer registers a pg-ping route or health-route flag", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "api.js"), "utf8");
  assert.doesNotMatch(src, /\.get\(\s*["'][^"']*pg-ping/);
  assert.doesNotMatch(src, /GETPRO_PG_HEALTH_ROUTE/);
});

// ---- PostgreSQL-backed: repo insert + refuse overwrite ---------------------
test("PG: database identity insert, read, refuse overwrite, verify", async (t) => {
  const pool = await requireChurchPgOrSkip(t);
  if (!pool) return;

  await ensureChurchSchema(pool);
  await pool.query("DELETE FROM public.church_database_identity");

  const instanceId = crypto.randomUUID();
  const inserted = await insertDatabaseIdentity(pool, {
    environmentCode: "testing",
    deploymentName: "V5 test db",
    databaseInstanceId: instanceId,
  });
  assert.equal(inserted.environmentCode, "testing");
  assert.equal(inserted.databaseInstanceId, instanceId);

  const read = await getDatabaseIdentity(pool);
  assert.equal(read.environmentCode, "testing");

  // Singleton: a second insert (different env) must fail — never silently overwrite.
  await assert.rejects(() =>
    insertDatabaseIdentity(pool, {
      environmentCode: "production",
      databaseInstanceId: crypto.randomUUID(),
    })
  );

  // verifyDatabaseIdentity against the real row.
  const okResult = await verifyDatabaseIdentity(pool, { deploymentEnv: "testing" });
  assert.equal(okResult.status, "ok");
  const mismatch = await verifyDatabaseIdentity(pool, { deploymentEnv: "production" });
  assert.equal(mismatch.status, "fatal");
  assert.equal(mismatch.reason, "mismatch");

  // Diagnostics reflect the identity.
  const identity = await churchProductionDiagnostics.gatherDeploymentIdentity(pool);
  assert.equal(identity.databaseEnvironmentCode, "testing");
  assert.equal(identity.databaseInstanceId, instanceId);
  assert.equal(identity.latestExpectedMigration, "124_church_growth_scheduled_job_safety.sql");
  assert.ok(identity.currentDatabase && identity.currentDatabase !== "(unavailable)");

  await pool.query("DELETE FROM public.church_database_identity");
});

test("PG: missing identity row → verify fatal missing", async (t) => {
  const pool = await requireChurchPgOrSkip(t);
  if (!pool) return;
  await ensureChurchSchema(pool);
  await pool.query("DELETE FROM public.church_database_identity");
  const result = await verifyDatabaseIdentity(pool, { deploymentEnv: "testing" });
  assert.equal(result.status, "fatal");
  assert.equal(result.reason, "missing");
});
