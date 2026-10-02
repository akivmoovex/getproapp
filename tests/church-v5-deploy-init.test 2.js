"use strict";

/**
 * Focused tests for BlessBoard.org V5 Hostinger deploy-init.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const {
  INIT_FLAG_ENV,
  TARGET_DEPLOYMENT_ENV,
  TARGET_DEPLOYMENT_NAME,
  isInitializeFlagEnabled,
  redactSecrets,
  runV5DeployInit,
} = require("../src/services/church/churchV5DeployInitService");
const { requireChurchPgOrSkip } = require("./helpers/churchPgTest");

function stubPool(identityRow) {
  let inserted = identityRow;
  return {
    query: async (sql, params) => {
      const text = String(sql);
      if (/church_database_identity/.test(text) && /SELECT/i.test(text)) {
        return { rows: inserted ? [inserted] : [] };
      }
      if (/INSERT INTO public\.church_database_identity/i.test(text)) {
        inserted = {
          id: 1,
          environment_code: params[0],
          deployment_name: params[1],
          database_instance_id: params[2],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        return { rows: [inserted] };
      }
      // ensureChurchSchema / other DDL — ignore for unit stubs when skipSchema
      return { rows: [] };
    },
  };
}

function identityDbRow(environmentCode, deploymentName) {
  return {
    id: 1,
    environment_code: environmentCode,
    deployment_name: deploymentName || `${environmentCode} deployment`,
    database_instance_id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

test("explicit flag required helper", () => {
  assert.equal(isInitializeFlagEnabled({}), false);
  assert.equal(isInitializeFlagEnabled({ [INIT_FLAG_ENV]: "0" }), false);
  assert.equal(isInitializeFlagEnabled({ [INIT_FLAG_ENV]: "1" }), true);
  assert.equal(isInitializeFlagEnabled({ [INIT_FLAG_ENV]: "true" }), true);
});

test("redactSecrets never echoes connection strings or passwords", () => {
  const out = redactSecrets(
    "fail postgresql://user:SuperSecret@db.example:5432/app password=alsoSecret"
  );
  assert.ok(!out.includes("postgresql://"));
  assert.ok(!out.includes("SuperSecret"));
  assert.ok(!out.includes("alsoSecret"));
  assert.ok(out.includes("[redacted]"));
});

test("missing flag fails safely", async () => {
  await assert.rejects(
    () =>
      runV5DeployInit(stubPool(null), {
        skipSchema: true,
        env: {
          DEPLOYMENT_ENV: "testing",
          DATABASE_URL: "postgresql://u:p@localhost:5432/testdb",
        },
      }),
    (e) => e && e.code === "INIT_FLAG_REQUIRED"
  );
});

test("production deployment rejected", async () => {
  await assert.rejects(
    () =>
      runV5DeployInit(stubPool(null), {
        skipSchema: true,
        env: {
          DEPLOYMENT_ENV: "production",
          [INIT_FLAG_ENV]: "1",
          DATABASE_URL: "postgresql://u:p@localhost:5432/testdb",
        },
      }),
    (e) => e && e.code === "PRODUCTION_REFUSED"
  );
});

test("testing deployment succeeds when identity missing", async () => {
  const result = await runV5DeployInit(stubPool(null), {
    skipSchema: true,
    env: {
      DEPLOYMENT_ENV: "testing",
      [INIT_FLAG_ENV]: "1",
      DATABASE_URL: "postgresql://u:p@localhost:5432/testdb",
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.result, "created");
  assert.equal(result.environmentCode, TARGET_DEPLOYMENT_ENV);
  assert.equal(result.deploymentName, TARGET_DEPLOYMENT_NAME);
  assert.ok(result.logLines.some((l) => /Initialized database identity/.test(l)));
  assert.ok(!result.logLines.join("\n").includes("postgresql://"));
  assert.ok(!result.logLines.join("\n").includes(":p@"));
});

test("different identity rejected", async () => {
  await assert.rejects(
    () =>
      runV5DeployInit(stubPool(identityDbRow("production", "V4 prod")), {
        skipSchema: true,
        env: {
          DEPLOYMENT_ENV: "testing",
          [INIT_FLAG_ENV]: "1",
          DATABASE_URL: "postgresql://u:p@localhost:5432/testdb",
        },
      }),
    (e) => e && e.code === "IDENTITY_MISMATCH"
  );
});

test("repeat is idempotent", async () => {
  const existing = identityDbRow("testing", TARGET_DEPLOYMENT_NAME);
  const first = await runV5DeployInit(stubPool(existing), {
    skipSchema: true,
    env: {
      DEPLOYMENT_ENV: "testing",
      [INIT_FLAG_ENV]: "1",
      DATABASE_URL: "postgresql://u:p@localhost:5432/testdb",
    },
  });
  assert.equal(first.result, "already-initialized");
  assert.equal(first.environmentCode, "testing");

  const second = await runV5DeployInit(stubPool(existing), {
    skipSchema: true,
    env: {
      DEPLOYMENT_ENV: "testing",
      [INIT_FLAG_ENV]: "1",
      DATABASE_URL: "postgresql://u:p@localhost:5432/testdb",
    },
  });
  assert.equal(second.result, "already-initialized");
  assert.ok(second.logLines.some((l) => /Already initialized/.test(l)));
});

test("PG: deploy-init creates testing identity and is idempotent", async (t) => {
  const pool = await requireChurchPgOrSkip(t);
  if (!pool) return;

  const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
  await ensureChurchSchema(pool);
  await pool.query("DELETE FROM public.church_database_identity");

  const env = {
    DEPLOYMENT_ENV: "testing",
    [INIT_FLAG_ENV]: "1",
    DATABASE_URL: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || "postgresql://test",
  };

  const created = await runV5DeployInit(pool, { env, skipSchema: true });
  assert.equal(created.result, "created");
  assert.equal(created.environmentCode, "testing");
  assert.equal(created.deploymentName, TARGET_DEPLOYMENT_NAME);

  const again = await runV5DeployInit(pool, { env, skipSchema: true });
  assert.equal(again.result, "already-initialized");

  await pool.query("DELETE FROM public.church_database_identity");
  await pool.query(
    `INSERT INTO public.church_database_identity
       (id, environment_code, deployment_name, database_instance_id)
     VALUES (1, 'production', 'other', $1::uuid)`,
    [crypto.randomUUID()]
  );
  await assert.rejects(
    () => runV5DeployInit(pool, { env, skipSchema: true }),
    (e) => e && e.code === "IDENTITY_MISMATCH"
  );
  await pool.query("DELETE FROM public.church_database_identity");
});
