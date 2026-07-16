"use strict";

/**
 * BlessBoard.org V5 database isolation — no silent GETPRO_DATABASE_URL fallback.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("child_process");
const path = require("path");

const {
  getDatabaseUrl,
  summarizeDatabaseUrlEnv,
  redactDatabaseHostFingerprint,
} = require("../src/db/pg/pool");
const {
  isBlessBoardOrgTestingDeployment,
  validateExpectedDatabaseEnv,
} = require("../src/church/blessBoardEnv");
const {
  assertBlessBoardOrgDbIsolationOrExit,
  logBlessBoardOrgDbIsolationDiagnostics,
} = require("../src/startup/blessBoardOrgDbGate");

const ENV_KEYS = [
  "NODE_ENV",
  "DEPLOYMENT_ENV",
  "BLESSBOARD_CANONICAL_DOMAIN",
  "CHURCH_HOST_DOMAIN",
  "DATABASE_URL",
  "GETPRO_DATABASE_URL",
  "EXPECTED_DATABASE_ENV",
  "GETPRO_TEST_DB",
  "TEST_DATABASE_URL",
];

function withEnv(overrides, fn) {
  const prev = {};
  for (const key of ENV_KEYS) {
    prev[key] = process.env[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

function v5TestingEnv(extra = {}) {
  return {
    NODE_ENV: "production",
    DEPLOYMENT_ENV: "testing",
    BLESSBOARD_CANONICAL_DOMAIN: "blessboard.org",
    CHURCH_HOST_DOMAIN: "blessboard.org",
    GETPRO_TEST_DB: undefined,
    TEST_DATABASE_URL: undefined,
    ...extra,
  };
}

test("isBlessBoardOrgTestingDeployment: requires testing + blessboard.org", () => {
  withEnv(
    {
      DEPLOYMENT_ENV: "testing",
      BLESSBOARD_CANONICAL_DOMAIN: "blessboard.org",
    },
    () => {
      assert.equal(isBlessBoardOrgTestingDeployment(), true);
    }
  );
  withEnv(
    {
      DEPLOYMENT_ENV: "production",
      BLESSBOARD_CANONICAL_DOMAIN: "blessboard.org",
    },
    () => {
      assert.equal(isBlessBoardOrgTestingDeployment(), false);
    }
  );
  withEnv(
    {
      DEPLOYMENT_ENV: "testing",
      BLESSBOARD_CANONICAL_DOMAIN: "blessboard.com",
    },
    () => {
      assert.equal(isBlessBoardOrgTestingDeployment(), false);
    }
  );
});

test("V5: getDatabaseUrl uses explicit DATABASE_URL", () => {
  withEnv(
    v5TestingEnv({
      DATABASE_URL: "postgres://v5user:secret@db-testing.example.com:5432/blessboard_v5",
      GETPRO_DATABASE_URL: "postgres://prod:leak@prod.example.com:5432/production",
    }),
    () => {
      assert.equal(getDatabaseUrl(), "postgres://v5user:secret@db-testing.example.com:5432/blessboard_v5");
      const s = summarizeDatabaseUrlEnv();
      assert.equal(s.effectiveSource, "DATABASE_URL");
      assert.equal(s.getproFallbackDisabled, true);
    }
  );
});

test("V5: getDatabaseUrl does not fall back to GETPRO_DATABASE_URL", () => {
  withEnv(
    v5TestingEnv({
      DATABASE_URL: undefined,
      GETPRO_DATABASE_URL: "postgres://prod:leak@prod.example.com:5432/production",
    }),
    () => {
      assert.equal(getDatabaseUrl(), "");
      const s = summarizeDatabaseUrlEnv();
      assert.equal(s.hasDatabaseUrl, false);
      assert.equal(s.hasGetproDatabaseUrl, true);
      assert.equal(s.effectiveSource, "(none)");
      assert.equal(s.getproFallbackDisabled, true);
    }
  );
});

test("V4: GETPRO_DATABASE_URL fallback remains when not org testing", () => {
  withEnv(
    {
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "production",
      BLESSBOARD_CANONICAL_DOMAIN: "blessboard.com",
      DATABASE_URL: undefined,
      GETPRO_DATABASE_URL: "postgres://v4only/db",
      GETPRO_TEST_DB: undefined,
      TEST_DATABASE_URL: undefined,
    },
    () => {
      assert.equal(isBlessBoardOrgTestingDeployment(), false);
      assert.equal(getDatabaseUrl(), "postgres://v4only/db");
      assert.equal(summarizeDatabaseUrlEnv().effectiveSource, "GETPRO_DATABASE_URL");
      assert.equal(summarizeDatabaseUrlEnv().getproFallbackDisabled, false);
    }
  );
});

test("redactDatabaseHostFingerprint never includes credentials", () => {
  const fp = redactDatabaseHostFingerprint(
    "postgres://v5user:SuperSecretPass@db-abc123.supabase.co:5432/blessboard_v5"
  );
  assert.match(fp, /supabase\.co/);
  assert.doesNotMatch(fp, /SuperSecretPass|v5user|blessboard_v5|5432/);
  assert.doesNotMatch(fp, /postgres:\/\//);
});

test("EXPECTED_DATABASE_ENV matches DEPLOYMENT_ENV when set", () => {
  withEnv(
    v5TestingEnv({
      EXPECTED_DATABASE_ENV: "testing",
      DATABASE_URL: "postgres://u:p@h/db",
    }),
    () => {
      assert.deepEqual(validateExpectedDatabaseEnv(), { ok: true });
    }
  );
  withEnv(
    v5TestingEnv({
      EXPECTED_DATABASE_ENV: "production",
      DATABASE_URL: "postgres://u:p@h/db",
    }),
    () => {
      const r = validateExpectedDatabaseEnv();
      assert.equal(r.ok, false);
      assert.equal(r.expected, "production");
      assert.equal(r.actual, "testing");
    }
  );
});

test("assertBlessBoardOrgDbIsolationOrExit is no-op for V4", () => {
  withEnv(
    {
      DEPLOYMENT_ENV: "production",
      BLESSBOARD_CANONICAL_DOMAIN: "blessboard.com",
      DATABASE_URL: undefined,
      GETPRO_DATABASE_URL: "postgres://ok/db",
    },
    () => {
      assert.doesNotThrow(() => assertBlessBoardOrgDbIsolationOrExit());
    }
  );
});

test("V5 gate exits when DATABASE_URL missing (child process)", () => {
  const script = `
    process.env.DEPLOYMENT_ENV = "testing";
    process.env.BLESSBOARD_CANONICAL_DOMAIN = "blessboard.org";
    delete process.env.DATABASE_URL;
    process.env.GETPRO_DATABASE_URL = "postgres://should-not-use:secret@prod.example.com/db";
    const { assertBlessBoardOrgDbIsolationOrExit } = require(${JSON.stringify(
      path.join(__dirname, "../src/startup/blessBoardOrgDbGate")
    )});
    assertBlessBoardOrgDbIsolationOrExit();
    process.exit(0);
  `;
  const result = spawnSync(process.execPath, ["-e", script], {
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "production" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /explicit DATABASE_URL/);
  assert.match(result.stderr, /GETPRO_DATABASE_URL fallback is disabled/);
  assert.doesNotMatch(result.stderr, /should-not-use|secret@prod/);
  assert.doesNotMatch(result.stdout, /should-not-use|secret@prod/);
});

test("V5 gate succeeds with explicit DATABASE_URL and does not log secrets", () => {
  const script = `
    process.env.DEPLOYMENT_ENV = "testing";
    process.env.BLESSBOARD_CANONICAL_DOMAIN = "blessboard.org";
    process.env.EXPECTED_DATABASE_ENV = "testing";
    process.env.DATABASE_URL = "postgres://v5user:SuperSecret@db-xyz.supabase.co:5432/v5_test";
    process.env.GETPRO_DATABASE_URL = "postgres://ignored:AlsoSecret@prod.example.com/db";
    const { assertBlessBoardOrgDbIsolationOrExit } = require(${JSON.stringify(
      path.join(__dirname, "../src/startup/blessBoardOrgDbGate")
    )});
    assertBlessBoardOrgDbIsolationOrExit();
    process.exit(0);
  `;
  const result = spawnSync(process.execPath, ["-e", script], {
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "production" },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const combined = `${result.stdout}\n${result.stderr}`;
  assert.match(combined, /database configuration present: yes/);
  assert.match(combined, /deployment environment: testing/);
  assert.match(combined, /canonical domain: blessboard\.org/);
  assert.match(combined, /database host fingerprint:/);
  assert.doesNotMatch(combined, /SuperSecret|AlsoSecret|v5user|ignored/);
  assert.doesNotMatch(combined, /postgres:\/\/v5user/);
});

test("logBlessBoardOrgDbIsolationDiagnostics is silent outside V5 testing", () => {
  withEnv(
    {
      DEPLOYMENT_ENV: "production",
      BLESSBOARD_CANONICAL_DOMAIN: "blessboard.com",
    },
    () => {
      assert.doesNotThrow(() => logBlessBoardOrgDbIsolationDiagnostics());
    }
  );
});
