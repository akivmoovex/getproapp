"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  gateEnvironment,
  assertBackupStatus,
  APPLICATION_SCHEMAS,
} = require("../db/scripts/production-fresh-bootstrap");

const productionEnv = {
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "production",
  DATABASE_URL: "postgres://redacted",
  PRODUCTION_RESET_CONFIRMED: "YES",
  PROCEED_PRODUCTION_RESET: "YES",
};

test("production bootstrap refuses without both explicit confirmations", () => {
  assert.deepEqual(gateEnvironment({ ...productionEnv, PRODUCTION_RESET_CONFIRMED: undefined }), [
    "missing_production_reset_confirmation",
  ]);
  assert.deepEqual(gateEnvironment({ ...productionEnv, PROCEED_PRODUCTION_RESET: undefined }), [
    "missing_destructive_confirmation",
  ]);
});

test("production bootstrap refuses non-production environments", () => {
  for (const value of ["testing", "staging", "development", "local", "ephemeral"]) {
    const failures = gateEnvironment({
      ...productionEnv,
      NODE_ENV: value,
      DEPLOYMENT_ENV: value,
    });
    assert.ok(failures.includes("node_env_not_production"));
    assert.ok(failures.includes("deployment_env_not_production"));
  }
});

test("production bootstrap requires a current successful backup record", () => {
  for (const status of [null, {}, { status: "stale", health: "warning" }, {
    status: "recorded",
    health: "ok",
    lastSuccessfulBackupAt: null,
    lastSuccessfulBackupEvidence: null,
  }]) {
    assert.throws(() => assertBackupStatus(status), /backup_verification/);
  }
  assert.doesNotThrow(() => assertBackupStatus({
    status: "recorded",
    health: "ok",
    lastSuccessfulBackupAt: "2026-10-03T16:00:00Z",
    lastSuccessfulBackupEvidence: "provider-snapshot-id",
  }));
});

test("reset scope is application-owned schemas only", () => {
  assert.deepEqual(APPLICATION_SCHEMAS, ["platform", "blessboard", "activeclinic", "getpro", "ngo"]);
});

test("existing canonical bootstrap remains explicitly ephemeral-only", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "db/scripts/canonical-fresh-bootstrap.js"),
    "utf8"
  );
  assert.match(source, /ephemeral local only/i);
  assert.match(source, /Does not reset shared testing or production databases/i);
});
