"use strict";

/**
 * Focused CLI safety tests for hardened V5 demo provisioning tools.
 * Uses ephemeral foundation DBs only — does not touch hosted data.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { spawnSync } = require("child_process");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const {
  provisionPlatformTenant,
  STATUS: PLATFORM_STATUS,
} = require("../src/platform/services/provisionPlatformTenant");
const {
  parseWriteMode,
  rejectGetproDatabaseUrlFallback,
  redactSecretsDeep,
  buildProvisionReport,
} = require("../db/scripts/lib/provisionCliSafety");

const ROOT = path.resolve(__dirname, "..");
const IDENTITY_KEY = "blessboard-platform-v5";
const WRONG_IDENTITY = "wrong-platform-identity";

const PLATFORM_ARGS = [
  "--organization-key",
  "safety-org",
  "--display-name",
  "Safety Org",
  "--environment",
  "testing",
  "--product",
  "blessboard",
  "--tenant-key",
  "safety-org",
  "--hostname",
  "safety.blessboard.test",
  "--domain-type",
  "canonical",
  "--deployment",
  "blessboard-org-v5",
];

function runPlatformCli(args, envExtra = {}) {
  return spawnSync(process.execPath, [path.join(ROOT, "db/scripts/platform-tenant-provision.js"), ...args], {
    env: { ...process.env, ...envExtra },
    encoding: "utf8",
  });
}

function parseJsonStdout(result) {
  const text = String(result.stdout || "").trim();
  assert.ok(text, `expected JSON stdout; stderr=${result.stderr}`);
  return JSON.parse(text);
}

describe("provision CLI safety helpers", () => {
  it("dry-run is default; --confirm enables writes; --dry-run wins over --confirm", () => {
    assert.equal(parseWriteMode([]).dryRun, true);
    assert.equal(parseWriteMode(["--confirm"]).dryRun, false);
    assert.equal(parseWriteMode(["--confirm"]).confirm, true);
    assert.equal(parseWriteMode(["--dry-run", "--confirm"]).dryRun, true);
    assert.equal(parseWriteMode(["--dry-run", "--confirm"]).confirm, false);
  });

  it("rejects GETPRO_DATABASE_URL fallback", () => {
    const prev = process.env.GETPRO_DATABASE_URL;
    process.env.GETPRO_DATABASE_URL = "postgresql://example.invalid/db";
    try {
      const r = rejectGetproDatabaseUrlFallback();
      assert.equal(r.ok, false);
      assert.equal(r.message, "GETPRO_DATABASE_URL_forbidden");
    } finally {
      if (prev === undefined) delete process.env.GETPRO_DATABASE_URL;
      else process.env.GETPRO_DATABASE_URL = prev;
    }
  });

  it("redacts secrets from reports", () => {
    const redacted = redactSecretsDeep({
      password: "secret-value",
      note: "postgresql://user:pass@host/db",
      ok: true,
    });
    assert.equal(redacted.password, "[redacted]");
    assert.equal(redacted.note, "[redacted_url]");
    const report = buildProvisionReport({
      tool: "test",
      dryRun: true,
      ok: true,
      status: "dry_run_would_provision",
      planned: { organization: true },
      keys: { organization_key: "x" },
      identityKey: IDENTITY_KEY,
      databaseName: "blessboard_ft_test",
      hostFingerprint: "localhost",
    });
    assert.equal(report.machine.mode, "dry_run");
    assert.match(report.human, /planned_writes/);
    assert.doesNotMatch(report.human, /postgres(ql)?:\/\//i);
  });
});

describe("platform tenant provision CLI safety", () => {
  let databaseUrl;
  let pool;
  let skipSuite = false;
  let skipReason = "";

  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  async function orgCount() {
    const r = await pool.query(`SELECT COUNT(*)::int AS n FROM platform.organizations`);
    return r.rows[0].n;
  }

  it("dry-run default does not write", async () => {
    requireDb();
    const before = await orgCount();
    const result = runPlatformCli(PLATFORM_ARGS, {
      DATABASE_URL: databaseUrl,
      DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
      GETPRO_DATABASE_URL: "",
    });
    assert.equal(result.status, 0, result.stderr);
    const payload = parseJsonStdout(result);
    assert.equal(payload.mode, "dry_run");
    assert.equal(payload.ok, true);
    assert.equal(payload.status, PLATFORM_STATUS.DRY_RUN_WOULD_PROVISION);
    assert.equal(payload.planned.organization, true);
    assert.equal(await orgCount(), before);
    assert.match(result.stderr, /planned_writes/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /postgres(ql)?:\/\//i);
  });

  it("missing confirmation stays dry-run (no write)", async () => {
    requireDb();
    const before = await orgCount();
    const result = runPlatformCli([...PLATFORM_ARGS, "--dry-run"], {
      DATABASE_URL: databaseUrl,
      DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(parseJsonStdout(result).mode, "dry_run");
    assert.equal(await orgCount(), before);
  });

  it("wrong database identity is rejected", async () => {
    requireDb();
    const before = await orgCount();
    const result = runPlatformCli([...PLATFORM_ARGS, "--confirm"], {
      DATABASE_URL: databaseUrl,
      DATABASE_IDENTITY_EXPECTED: WRONG_IDENTITY,
    });
    assert.notEqual(result.status, 0);
    const payload = parseJsonStdout(result);
    assert.equal(payload.ok, false);
    assert.match(String(payload.message || payload.error || ""), /identity|DATABASE_IDENTITY/i);
    assert.equal(await orgCount(), before);
  });

  it("wrong deployment is rejected", async () => {
    requireDb();
    const before = await orgCount();
    const args = PLATFORM_ARGS.map((v) => (v === "blessboard-org-v5" ? "missing-deployment-code" : v));
    const result = runPlatformCli([...args, "--confirm"], {
      DATABASE_URL: databaseUrl,
      DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
    });
    assert.notEqual(result.status, 0);
    const payload = parseJsonStdout(result);
    assert.equal(payload.ok, false);
    assert.match(String(payload.message || ""), /deployment/i);
    assert.equal(await orgCount(), before);
  });

  it("GETPRO_DATABASE_URL set is rejected", async () => {
    requireDb();
    const result = runPlatformCli([...PLATFORM_ARGS, "--confirm"], {
      DATABASE_URL: databaseUrl,
      DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
      GETPRO_DATABASE_URL: "postgresql://example.invalid/getpro",
    });
    assert.notEqual(result.status, 0);
    const payload = parseJsonStdout(result);
    assert.equal(payload.ok, false);
    assert.equal(payload.message, "GETPRO_DATABASE_URL_forbidden");
  });

  it("confirm writes once; idempotent rerun; dry-run shows no-op", async () => {
    requireDb();
    const write1 = runPlatformCli([...PLATFORM_ARGS, "--confirm"], {
      DATABASE_URL: databaseUrl,
      DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
    });
    assert.equal(write1.status, 0, write1.stderr);
    const p1 = parseJsonStdout(write1);
    assert.equal(p1.mode, "write");
    assert.equal(p1.status, PLATFORM_STATUS.PROVISIONED);

    const write2 = runPlatformCli([...PLATFORM_ARGS, "--confirm"], {
      DATABASE_URL: databaseUrl,
      DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
    });
    assert.equal(write2.status, 0, write2.stderr);
    const p2 = parseJsonStdout(write2);
    assert.equal(p2.status, PLATFORM_STATUS.ALREADY_PROVISIONED);

    const dry = runPlatformCli(PLATFORM_ARGS, {
      DATABASE_URL: databaseUrl,
      DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
    });
    assert.equal(dry.status, 0, dry.stderr);
    const pd = parseJsonStdout(dry);
    assert.equal(pd.status, PLATFORM_STATUS.DRY_RUN_ALREADY_PROVISIONED);
    assert.equal(pd.planned.organization, false);
  });

  it("duplicate domain fails closed", async () => {
    requireDb();
    const result = runPlatformCli(
      [
        "--organization-key",
        "other-org",
        "--display-name",
        "Other Org",
        "--environment",
        "testing",
        "--product",
        "blessboard",
        "--tenant-key",
        "other-org",
        "--hostname",
        "safety.blessboard.test",
        "--domain-type",
        "canonical",
        "--deployment",
        "blessboard-org-v5",
        "--confirm",
      ],
      {
        DATABASE_URL: databaseUrl,
        DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
      }
    );
    assert.notEqual(result.status, 0);
    const payload = parseJsonStdout(result);
    assert.equal(payload.ok, false);
    assert.equal(payload.status, PLATFORM_STATUS.HOSTNAME_CONFLICT);
  });

  it("service dry-run + partial failure rollback still hold", async () => {
    requireDb();
    const before = await orgCount();
    const dry = await provisionPlatformTenant(pool, {
      organizationKey: "rollback-org",
      displayName: "Rollback Org",
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: "rollback-org",
      hostname: "rollback.blessboard.test",
      domainType: "canonical",
      deploymentCode: "blessboard-org-v5",
      isPrimary: true,
      dryRun: true,
    });
    assert.equal(dry.ok, true);
    assert.equal(dry.dryRun, true);
    assert.equal(await orgCount(), before);

    const bad = await provisionPlatformTenant(pool, {
      organizationKey: "safety-org",
      displayName: "Mismatched Display",
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: "safety-org",
      hostname: "safety-mismatch.blessboard.test",
      domainType: "canonical",
      deploymentCode: "blessboard-org-v5",
      isPrimary: true,
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.status, PLATFORM_STATUS.ORGANIZATION_CONFLICT);
    assert.equal(await orgCount(), before);
  });

  it("secret redaction: CLI output omits connection string", async () => {
    requireDb();
    const result = runPlatformCli(PLATFORM_ARGS, {
      DATABASE_URL: databaseUrl,
      DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
    });
    const combined = `${result.stdout || ""}${result.stderr || ""}`;
    assert.doesNotMatch(combined, /postgres(ql)?:\/\//i);
    if (databaseUrl.includes("@")) {
      assert.equal(combined.includes(databaseUrl), false);
    }
    assert.doesNotMatch(combined, /password=/i);
  });
});
