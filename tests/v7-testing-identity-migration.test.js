"use strict";

/**
 * Guard verification for V7 testing identity migration.
 * Live suite requires DATABASE_URL (use: npm run db:identity:check:testing pattern /
 * scripts/local/run-with-blessboard-env.sh testing node --test …).
 */

const assert = require("node:assert/strict");
const { describe, it, after } = require("node:test");
const { Pool } = require("pg");

const {
  verifyPlatformDatabaseIdentity,
} = require("../src/startup/blessBoardOrgDbGate");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
  CODE_MOOVEX_PLATFORM_PRODUCTION,
} = require("../src/platform/config/canonicalDeploymentProfiles");
const { buildFoundationPoolConfig } = require("../db/scripts/lib/foundationPool");
const { readIdentityRow } = require("../db/scripts/lib/databaseIdentity");

const hasTestingUrl =
  process.env.DATABASE_URL != null && String(process.env.DATABASE_URL).trim() !== "";

function withEnv(overrides, fn) {
  const keys = Object.keys(overrides);
  const prev = {};
  for (const k of keys) {
    prev[k] = process.env[k];
    if (overrides[k] === undefined) delete process.env[k];
    else process.env[k] = overrides[k];
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const k of keys) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
    });
}

function mockPoolWithIdentity(row) {
  return {
    async query(text) {
      const sql = String(text);
      if (/information_schema\.tables/i.test(sql)) {
        return { rows: [{ "?column?": 1 }], rowCount: 1 };
      }
      if (/information_schema\.columns/i.test(sql)) {
        return {
          rows: [
            { column_name: "database_instance_id" },
            { column_name: "environment_code" },
            { column_name: "database_name" },
            { column_name: "host_fingerprint" },
            { column_name: "identity_key" },
            { column_name: "created_at" },
            { column_name: "updated_at" },
          ],
          rowCount: 7,
        };
      }
      if (/FROM platform\.database_identity/i.test(sql)) {
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      throw new Error(`unexpected query in mock: ${sql.slice(0, 120)}`);
    },
  };
}

describe("V7 identity gate unit matrix", () => {
  it("PASS: moovex-platform-v7 / testing", async () => {
    await withEnv(
      {
        NODE_ENV: "production",
        DEPLOYMENT_ENV: "testing",
        PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
        DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
        DATABASE_IDENTITY_ENV: "testing",
        DATABASE_URL: "postgres://u:p@127.0.0.1:5432/db",
      },
      async () => {
        const result = await verifyPlatformDatabaseIdentity(
          mockPoolWithIdentity({
            identity_key: "moovex-platform-v7",
            environment_code: "testing",
          })
        );
        assert.equal(result.status, "ok");
      }
    );
  });

  it("REJECT: moovex-platform-v7 / production expectation vs testing row", async () => {
    await withEnv(
      {
        NODE_ENV: "production",
        DEPLOYMENT_ENV: "production",
        PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_PRODUCTION,
        DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
        DATABASE_IDENTITY_ENV: "production",
        DATABASE_URL: "postgres://u:p@127.0.0.1:5432/db",
      },
      async () => {
        const result = await verifyPlatformDatabaseIdentity(
          mockPoolWithIdentity({
            identity_key: "moovex-platform-v7",
            environment_code: "testing",
          })
        );
        assert.equal(result.status, "fatal");
        assert.match(result.sanitizedMessage, /DATABASE_IDENTITY_MISMATCH|environment_code=testing/i);
      }
    );
  });

  it("REJECT: blessboard-platform-v5 / testing after V7 expectation", async () => {
    await withEnv(
      {
        NODE_ENV: "production",
        DEPLOYMENT_ENV: "testing",
        PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
        DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
        DATABASE_IDENTITY_ENV: "testing",
        DATABASE_URL: "postgres://u:p@127.0.0.1:5432/db",
      },
      async () => {
        const result = await verifyPlatformDatabaseIdentity(
          mockPoolWithIdentity({
            identity_key: "blessboard-platform-v5",
            environment_code: "testing",
          })
        );
        assert.equal(result.status, "fatal");
        assert.match(result.sanitizedMessage, /identity_key|DATABASE_IDENTITY_MISMATCH/i);
      }
    );
  });

  it("REJECT: wrong-platform / testing", async () => {
    await withEnv(
      {
        NODE_ENV: "production",
        DEPLOYMENT_ENV: "testing",
        PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
        DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
        DATABASE_IDENTITY_ENV: "testing",
        DATABASE_URL: "postgres://u:p@127.0.0.1:5432/db",
      },
      async () => {
        const result = await verifyPlatformDatabaseIdentity(
          mockPoolWithIdentity({
            identity_key: "wrong-platform",
            environment_code: "testing",
          })
        );
        assert.equal(result.status, "fatal");
      }
    );
  });
});

describe(
  "V7 live testing DB identity readback",
  { skip: !hasTestingUrl },
  () => {
    /** @type {import('pg').Pool|null} */
    let pool = null;

    after(async () => {
      if (pool) await pool.end();
    });

    it("row is moovex-platform-v7 / testing", async () => {
      pool = new Pool(buildFoundationPoolConfig(process.env.DATABASE_URL, { max: 1 }));
      const row = await readIdentityRow(pool);
      assert.equal(row.identity_key, "moovex-platform-v7");
      assert.equal(row.environment_code, "testing");
    });

    it("verifyPlatformDatabaseIdentity PASS for V7 testing profile", async () => {
      await withEnv(
        {
          NODE_ENV: "production",
          DEPLOYMENT_ENV: "testing",
          PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
          DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
          DATABASE_IDENTITY_ENV: "testing",
        },
        async () => {
          if (!pool) pool = new Pool(buildFoundationPoolConfig(process.env.DATABASE_URL, { max: 1 }));
          const result = await verifyPlatformDatabaseIdentity(pool);
          assert.equal(result.status, "ok", result.sanitizedMessage);
        }
      );
    });

    it("live REJECT: production profile against testing DB", async () => {
      await withEnv(
        {
          NODE_ENV: "production",
          DEPLOYMENT_ENV: "production",
          PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_PRODUCTION,
          DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
          DATABASE_IDENTITY_ENV: "production",
        },
        async () => {
          if (!pool) pool = new Pool(buildFoundationPoolConfig(process.env.DATABASE_URL, { max: 1 }));
          const result = await verifyPlatformDatabaseIdentity(pool);
          assert.equal(result.status, "fatal");
        }
      );
    });

    it("live REJECT: blessboard-platform-v5 expected key", async () => {
      if (!pool) pool = new Pool(buildFoundationPoolConfig(process.env.DATABASE_URL, { max: 1 }));
      const result = await verifyPlatformDatabaseIdentity(pool, {
        expectedIdentityKey: "blessboard-platform-v5",
        expectedEnvironment: "testing",
      });
      assert.equal(result.status, "fatal");
    });
  }
);
