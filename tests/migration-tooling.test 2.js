"use strict";

/**
 * V4→V5 migration tooling — local fixture DB tests only.
 * Covers identity safety, same-DB refusal, idempotency, conflicts,
 * batch rollback, checkpoint resume, and reconciliation.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  loadMigrationEnv,
  connectionFingerprint,
  parseCliArgs,
  assertCommandSafety,
  assertDistinctConnections,
  createReadOnlySourcePool,
  createTargetPool,
  createPgExtractor,
  createTargetLoader,
  runMigrationPipeline,
  createIdMap,
  createCheckpointStore,
  transformRow,
} = require("../src/migration/v4ToV5");
const {
  prepareMigrationFixtureDatabases,
  endPools,
} = require("./helpers/migrationFixtureDb");

describe("v4 to v5 migration tooling", () => {
  let sourceUrl;
  let targetUrl;
  let sourcePool;
  let targetPool;
  let identityKey;
  let skipSuite = false;
  let skipReason = "";
  let outputDir;

  before(async () => {
    try {
      const prepared = await prepareMigrationFixtureDatabases("blessboard-platform-v5");
      sourceUrl = prepared.sourceUrl;
      targetUrl = prepared.targetUrl;
      sourcePool = prepared.sourcePool;
      targetPool = prepared.targetPool;
      identityKey = prepared.identityKey;
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "v4v5-mig-"));
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    await endPools(sourcePool, targetPool);
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("refuses DATABASE_URL fallback and requires explicit env names", () => {
    const prev = {
      V4: process.env.V4_SOURCE_DATABASE_URL,
      V5: process.env.V5_TARGET_DATABASE_URL,
      ID: process.env.DATABASE_IDENTITY_EXPECTED,
      DB: process.env.DATABASE_URL,
    };
    try {
      delete process.env.V4_SOURCE_DATABASE_URL;
      delete process.env.V5_TARGET_DATABASE_URL;
      delete process.env.DATABASE_IDENTITY_EXPECTED;
      process.env.DATABASE_URL = "postgresql://localhost:5432/somewhere";
      const env = loadMigrationEnv();
      assert.equal(env.ok, false);
      assert.ok(env.errors.includes("missing_V4_SOURCE_DATABASE_URL"));
      assert.ok(env.errors.includes("refusing_DATABASE_URL_fallback"));
    } finally {
      process.env.V4_SOURCE_DATABASE_URL = prev.V4;
      process.env.V5_TARGET_DATABASE_URL = prev.V5;
      process.env.DATABASE_IDENTITY_EXPECTED = prev.ID;
      process.env.DATABASE_URL = prev.DB;
    }
  });

  it("refuses same source and target fingerprint", () => {
    requireDb();
    const same = loadMigrationEnv({
      V4_SOURCE_DATABASE_URL: targetUrl,
      V5_TARGET_DATABASE_URL: targetUrl,
      DATABASE_IDENTITY_EXPECTED: identityKey,
      allowHosted: true,
    });
    assert.equal(same.ok, false);
    assert.ok(same.errors.includes("same_source_and_target_fingerprint"));

    const distinct = assertDistinctConnections(sourceUrl, targetUrl);
    assert.equal(distinct.ok, true);
    assert.notEqual(connectionFingerprint(sourceUrl), connectionFingerprint(targetUrl));
  });

  it("requires --confirm for apply and defaults dry-run semantics", () => {
    assert.equal(assertCommandSafety("apply", { confirm: false }).ok, false);
    assert.equal(assertCommandSafety("apply", { confirm: true }).ok, true);
    assert.equal(assertCommandSafety("dry-run", { confirm: false }).ok, true);
    assert.equal(parseCliArgs(["apply"]).confirm, false);
    assert.equal(parseCliArgs(["apply", "--confirm"]).confirm, true);
  });

  it("refuses GETPRO_DATABASE_URL even when V4/V5 URLs are set", () => {
    const prev = process.env.GETPRO_DATABASE_URL;
    process.env.GETPRO_DATABASE_URL = "postgresql://localhost:5432/getpro_trap";
    try {
      const env = loadMigrationEnv({
        V4_SOURCE_DATABASE_URL: "postgresql://localhost:5432/v4_a",
        V5_TARGET_DATABASE_URL: "postgresql://localhost:5432/v5_b",
        DATABASE_IDENTITY_EXPECTED: "blessboard-platform-v5",
        allowHosted: true,
      });
      assert.equal(env.ok, false);
      assert.ok(env.errors.includes("GETPRO_DATABASE_URL_forbidden"));
    } finally {
      if (prev === undefined) delete process.env.GETPRO_DATABASE_URL;
      else process.env.GETPRO_DATABASE_URL = prev;
    }
  });

  it("verifies target identity before writes and opens source read-only", async () => {
    requireDb();
    const env = loadMigrationEnv({
      V4_SOURCE_DATABASE_URL: sourceUrl,
      V5_TARGET_DATABASE_URL: targetUrl,
      DATABASE_IDENTITY_EXPECTED: identityKey,
      allowHosted: true,
    });
    assert.equal(env.ok, true);

    const roPool = createReadOnlySourcePool(sourceUrl);
    const tgt = createTargetPool(targetUrl);
    try {
      const client = await roPool.connect();
      try {
        await client.query("BEGIN");
        await assert.rejects(
          () => client.query("CREATE TEMP TABLE __probe(id int)"),
          /read-only|readonly/i
        );
        await client.query("ROLLBACK").catch(() => {});
      } finally {
        client.release();
      }

      const bad = await runMigrationPipeline({
        mode: "verify",
        config: {
          ...env.config,
          identityKey: "wrong-identity-key",
        },
        extractor: createPgExtractor(sourcePool),
        targetPool: tgt,
        outputDir: path.join(outputDir, "bad-identity"),
        checkpointPath: path.join(outputDir, "bad-identity", "cp.json"),
        idMapPath: path.join(outputDir, "bad-identity", "ids.json"),
      });
      assert.equal(bad.ok, false);
      assert.match(String(bad.code), /identity/);
    } finally {
      await roPool.end();
      await tgt.end();
    }
  });

  it("produces plan + dry-run reports without writing target rows", async () => {
    requireDb();
    const env = loadMigrationEnv({
      V4_SOURCE_DATABASE_URL: sourceUrl,
      V5_TARGET_DATABASE_URL: targetUrl,
      DATABASE_IDENTITY_EXPECTED: identityKey,
      allowHosted: true,
      batchSize: 20,
    });
    const before = await targetPool.query(`SELECT COUNT(*)::int AS n FROM platform.organizations`);
    const dir = path.join(outputDir, "dry-run");
    const planResult = await runMigrationPipeline({
      mode: "plan",
      config: env.config,
      extractor: createPgExtractor(sourcePool, { batchSize: 20 }),
      targetPool,
      outputDir: dir,
      checkpointPath: path.join(dir, "cp.json"),
      idMapPath: path.join(dir, "ids.json"),
    });
    assert.equal(planResult.ok, true);
    assert.ok(fs.existsSync(planResult.files.plan));
    assert.ok(fs.existsSync(planResult.files.skipped));
    const planJson = JSON.parse(fs.readFileSync(planResult.files.plan, "utf8"));
    assert.ok(planJson.unsupportedSourceEntities.some((u) => u.key === "sermons"));
    assert.equal(planJson.safety.orphanParentsQuarantined, true);

    const dry = await runMigrationPipeline({
      mode: "dry-run",
      config: env.config,
      extractor: createPgExtractor(sourcePool, { batchSize: 20 }),
      targetPool,
      outputDir: dir,
      checkpointPath: path.join(dir, "cp.json"),
      idMapPath: path.join(dir, "ids.json"),
    });
    assert.equal(dry.ok, true);
    assert.ok(dry.totals.wouldWrite >= 1);
    assert.ok(fs.existsSync(dry.files.dryRun));
    assert.ok(fs.existsSync(dry.files.reconciliation));
    const after = await targetPool.query(`SELECT COUNT(*)::int AS n FROM platform.organizations`);
    assert.equal(after.rows[0].n, before.rows[0].n);
  });

  it("applies idempotently and resumes from checkpoints", async () => {
    requireDb();
    await endPools(sourcePool, targetPool);
    const prepared = await prepareMigrationFixtureDatabases("blessboard-platform-v5");
    sourceUrl = prepared.sourceUrl;
    targetUrl = prepared.targetUrl;
    sourcePool = prepared.sourcePool;
    targetPool = prepared.targetPool;
    identityKey = prepared.identityKey;

    const env = loadMigrationEnv({
      V4_SOURCE_DATABASE_URL: sourceUrl,
      V5_TARGET_DATABASE_URL: targetUrl,
      DATABASE_IDENTITY_EXPECTED: identityKey,
      allowHosted: true,
      batchSize: 50,
    });
    const dir = path.join(outputDir, "apply");
    const first = await runMigrationPipeline({
      mode: "apply",
      config: env.config,
      extractor: createPgExtractor(sourcePool, { batchSize: 50 }),
      targetPool,
      outputDir: dir,
      checkpointPath: path.join(dir, "cp.json"),
      idMapPath: path.join(dir, "ids.json"),
    });
    assert.equal(first.ok, true, first.message || first.code);
    assert.ok(first.totals.written >= 1);
    assert.ok(fs.existsSync(first.files.applySummary));

    const orgs = await targetPool.query(
      `SELECT organization_key FROM platform.organizations WHERE organization_key = 'grace-chapel'`
    );
    assert.equal(orgs.rows.length, 1);

    const churches = await targetPool.query(`SELECT COUNT(*)::int AS n FROM blessboard.churches`);
    assert.ok(churches.rows[0].n >= 1);

    const second = await runMigrationPipeline({
      mode: "apply",
      config: env.config,
      extractor: createPgExtractor(sourcePool, { batchSize: 50 }),
      targetPool,
      outputDir: dir,
      checkpointPath: path.join(dir, "cp.json"),
      idMapPath: path.join(dir, "ids.json"),
    });
    assert.equal(second.ok, true);
    assert.equal(second.totals.written, 0);
    assert.ok(fs.existsSync(second.files.applySummary));
    assert.ok(second.totals.skipped >= 1);

    const cp = createCheckpointStore(path.join(dir, "cp.json"));
    assert.equal(cp.get("products_enrolments_domains").status, "done");

    const resumed = await runMigrationPipeline({
      mode: "apply",
      config: env.config,
      extractor: createPgExtractor(sourcePool, { batchSize: 50 }),
      targetPool,
      outputDir: dir,
      checkpointPath: path.join(dir, "cp.json"),
      idMapPath: path.join(dir, "ids.json"),
      resume: true,
    });
    assert.equal(resumed.ok, true);
    assert.ok(resumed.groups.some((g) => g.status === "resumed_skip"));
  });

  it("detects organization_key conflicts", async () => {
    requireDb();
    const idMap = createIdMap();
    const transformed = transformRow(
      "organization",
      {
        id: 999,
        slug: "grace-chapel",
        name: "Clash",
        status: "active",
        plan_code: "free",
        data_environment: "pilot",
      },
      {
        batchId: "conflict-test",
        runConfig: {
          dataEnvironmentDefault: "pilot",
          canonicalDomainSuffix: "blessboard.org",
          deploymentCode: "blessboard-org-staging",
        },
        idMap,
      }
    );
    assert.equal(transformed.ok, true);
    const loader = createTargetLoader({ dryRun: false, targetPool, batchSize: 10 });
    const batch = await loader.loadBatch("organization", [
      { sourceId: 999, transformed },
    ]);
    assert.equal(batch.ok, true);
    assert.equal(batch.results[0].status, "conflict");
    assert.equal(batch.results[0].code, "organization_key_taken");
  });

  it("rolls back a failed apply batch transaction", async () => {
    requireDb();
    const env = loadMigrationEnv({
      V4_SOURCE_DATABASE_URL: sourceUrl,
      V5_TARGET_DATABASE_URL: targetUrl,
      DATABASE_IDENTITY_EXPECTED: identityKey,
      allowHosted: true,
      batchSize: 50,
    });

    // Fresh org that is not yet on target
    await sourcePool.query(
      `INSERT INTO public.church_organizations
         (platform_tenant_id, slug, name, status, plan_code, data_environment)
       SELECT id, 'rollback-org', 'Rollback Org', 'active', 'free', 'pilot'
         FROM public.tenants LIMIT 1`
    );

    const before = await targetPool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = 'rollback-org'`
    );
    assert.equal(before.rows[0].n, 0);

    const dir = path.join(outputDir, "rollback");
    // forceFailAfter=0 fails before any write in first non-empty batch of first entity —
    // use organization entity via pipeline with forceFailAfter after first successful transform path.
    // Direct loader test for clear semantics:
    const idMap = createIdMap();
    const orgRow = (
      await sourcePool.query(
        `SELECT id, slug, name, status, plan_code, data_environment FROM public.church_organizations WHERE slug = 'rollback-org'`
      )
    ).rows[0];
    const transformed = transformRow("organization", orgRow, {
      batchId: "rb",
      runConfig: env.config.runConfig,
      idMap,
    });
    const loader = createTargetLoader({ dryRun: false, targetPool, batchSize: 10 });
    const batch = await loader.loadBatch(
      "organization",
      [{ sourceId: orgRow.id, transformed }],
      { forceFailAfter: 0 }
    );
    assert.equal(batch.ok, false);
    assert.equal(batch.rolledBack, true);

    const after = await targetPool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = 'rollback-org'`
    );
    assert.equal(after.rows[0].n, 0);
  });

  it("writes reconciliation report on verify", async () => {
    requireDb();
    const env = loadMigrationEnv({
      V4_SOURCE_DATABASE_URL: sourceUrl,
      V5_TARGET_DATABASE_URL: targetUrl,
      DATABASE_IDENTITY_EXPECTED: identityKey,
      allowHosted: true,
    });
    const dir = path.join(outputDir, "verify");
    const result = await runMigrationPipeline({
      mode: "verify",
      config: env.config,
      extractor: createPgExtractor(sourcePool),
      targetPool,
      outputDir: dir,
      checkpointPath: path.join(dir, "cp.json"),
      idMapPath: path.join(outputDir, "apply", "ids.json"),
    });
    assert.equal(result.ok, true);
    assert.ok(result.reconciliation.targetCounts.organizations >= 1);
    assert.ok(fs.existsSync(result.files.reconciliation));
  });

  it("never creates public.tenants or public.session on target", async () => {
    requireDb();
    const r = await targetPool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ('tenants', 'session')`
    );
    assert.equal(r.rows.length, 0);
  });
});
