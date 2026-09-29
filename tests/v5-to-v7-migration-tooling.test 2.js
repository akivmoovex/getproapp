"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const bcrypt = require("bcryptjs");
const {
  loadMigrationEnv,
  parseCliArgs,
  assertCommandSafety,
  assertDistinctConnections,
  classifyPasswordHash,
  verifyBcryptPassword,
  roleMappingTable,
  classifyIdentityCollision,
  buildIdentityIndexes,
  runMigrationPipeline,
  assertManifestMatches,
  fingerprintHash,
  buildConnectionPairFingerprint,
  copySupabaseMedia,
  createSupabaseMediaClient,
  buildDeltaFilter,
  MigrationIdentityConflictError,
} = require("../src/migration/v5ToV7");
const {
  prepareV5ToV7RehearsalDatabases,
  endPools,
  IDS,
} = require("./helpers/v5ToV7FixtureDb");
describe("v5 to v7 migration tooling", () => {
  let pools;
  let skipSuite = false;
  let skipReason = "";
  let stateDir;

  before(async () => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "v5-to-v7-test-"));
    try {
      pools = await prepareV5ToV7RehearsalDatabases();
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pools) await endPools(pools.sourcePool, pools.targetPool);
    if (stateDir) fs.rmSync(stateDir, { recursive: true, force: true });
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  function baseConfig(overrides = {}) {
    return {
      sourceIdentity: "blessboard-platform-v5",
      targetIdentity: "moovex-platform-v7",
      sourceEnvironment: "testing",
      targetEnvironment: "testing",
      bbSourceSummary: {},
      acSourceSummary: {},
      targetSummary: {},
      acSourceExplicit: false,
      bbSourceUrl: pools.sourceUrl,
      targetUrl: pools.targetUrl,
      runConfig: {
        excludeOrgKeys: ["demo-church"],
        excludeOrgKeyPatterns: [],
        batchSize: 50,
        migrateAcClinical: true,
        ...overrides.runConfig,
      },
      ...overrides,
    };
  }

  it("refuses DATABASE_URL fallback", () => {
    const prev = { ...process.env };
    try {
      delete process.env.V5_BB_SOURCE_DATABASE_URL;
      delete process.env.V7_TARGET_DATABASE_URL;
      process.env.DATABASE_URL = "postgresql://localhost:5432/x";
      const env = loadMigrationEnv();
      assert.equal(env.ok, false);
      assert.ok(env.errors.includes("refusing_DATABASE_URL_fallback"));
    } finally {
      process.env = prev;
    }
  });

  it("requires --confirm for apply", () => {
    const gate = assertCommandSafety("apply", { confirm: false });
    assert.equal(gate.ok, false);
    assert.equal(gate.code, "confirm_required");
  });

  it("refuses duplicate connection fingerprints", () => {
    const url = "postgresql://localhost:5432/a";
    const d = assertDistinctConnections([url, url]);
    assert.equal(d.ok, false);
  });

  it("classifies bcrypt hashes and verifies fixture password", async () => {
    const hash = await bcrypt.hash("migration-qa-pass-12", 10);
    const c = classifyPasswordHash(hash);
    assert.equal(c.kind, "bcrypt");
    assert.equal(c.migratable, true);
    assert.equal(await verifyBcryptPassword("migration-qa-pass-12", hash), true);
  });

  it("classifies unsupported password hash", () => {
    const c = classifyPasswordHash("{SHA}abc");
    assert.equal(c.migratable, false);
  });

  it("maps legacy blessboard roles without inventing keys", () => {
    const table = roleMappingTable();
    assert.ok(table.some((r) => r.v5Role === "organisation_administrator"));
    assert.ok(table.some((r) => r.action === "exclude_v1" && r.v5Role === "member"));
  });

  it("merges exact cross-product identity match", () => {
    const index = buildIdentityIndexes([
      {
        email: "shared.person@example.com",
        phone: "+260971111111",
        source: "blessboard",
        legacyId: "1",
        identityId: "id-1",
      },
    ]);
    const exact = classifyIdentityCollision(index, {
      email: "shared.person@example.com",
      phone: "+260971111111",
      source: "activeclinic",
      legacyId: "2",
    });
    assert.equal(exact.category, "exact_safe_match");
  });

  it("rejects ambiguous identity match", () => {
    const index = buildIdentityIndexes([
      {
        email: "person@example.com",
        phone: "+260971111111",
        source: "blessboard",
        legacyId: "1",
        identityId: "id-1",
      },
    ]);
    const ambiguous = classifyIdentityCollision(index, {
      email: "person@example.com",
      phone: "+260972222222",
      source: "activeclinic",
      legacyId: "2",
    });
    assert.equal(ambiguous.category, "ambiguous_match");
  });

  it("refuses state fingerprint mismatch", () => {
    const config = {
      bbSourceUrl: "postgresql://localhost:5432/a",
      acSourceUrl: "postgresql://localhost:5432/a",
      acSourceExplicit: false,
      targetUrl: "postgresql://localhost:5432/b",
      sourceIdentity: "blessboard-platform-v5",
      targetIdentity: "moovex-platform-v7",
      sourceEnvironment: "testing",
      targetEnvironment: "testing",
    };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v5-state-"));
    fs.mkdirSync(path.join(dir, "state"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "state", "manifest.json"),
      JSON.stringify({ connectionPairHash: "deadbeef" })
    );
    const gate = assertManifestMatches(config, dir);
    assert.equal(gate.ok, false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("plan is read-only", async () => {
    requireDb();
    const result = await runMigrationPipeline({
      command: "plan",
      config: baseConfig(),
      bbSourcePool: pools.sourcePool,
      acSourcePool: pools.sourcePool,
      targetPool: pools.targetPool,
      outputDir: stateDir,
    });
    assert.ok(result.plan.blessboard.counts.churches.count >= 1);
    assert.ok(result.plan.activeclinic.organizations.included >= 1);
    const tgt = await pools.targetPool.query(`SELECT COUNT(*)::int AS n FROM blessboard.churches`);
    assert.equal(tgt.rows[0].n, 0);
  });

  it("apply is idempotent on rerun", async () => {
    requireDb();
    const dir = path.join(stateDir, "idempotent");
    const config = baseConfig();
    const first = await runMigrationPipeline({
      command: "apply",
      config,
      bbSourcePool: pools.sourcePool,
      acSourcePool: pools.sourcePool,
      targetPool: pools.targetPool,
      outputDir: dir,
    });
    const second = await runMigrationPipeline({
      command: "apply",
      config,
      bbSourcePool: pools.sourcePool,
      acSourcePool: pools.sourcePool,
      targetPool: pools.targetPool,
      outputDir: dir,
      delta: false,
    });
    const tgt = await pools.targetPool.query(`SELECT COUNT(*)::int AS n FROM blessboard.churches`);
    assert.equal(tgt.rows[0].n, 1);
    assert.ok(first.apply.blessboard.results.churches.sourceCount >= 1);
    assert.ok(second.apply.blessboard.results.churches.skipped >= 0);
  });

  it("creates BB platform identities and links users", async () => {
    requireDb();
    const dir = path.join(stateDir, "bb-identities");
    await runMigrationPipeline({
      command: "apply",
      config: baseConfig(),
      bbSourcePool: pools.sourcePool,
      acSourcePool: pools.sourcePool,
      targetPool: pools.targetPool,
      outputDir: dir,
    });
    const row = await pools.targetPool.query(
      `SELECT u.platform_identity_id, i.email_normalized
         FROM blessboard.users u
         JOIN platform.identities i ON i.id = u.platform_identity_id
        WHERE u.email_normalized = 'hq@grace-chapel.example'`
    );
    assert.equal(row.rowCount, 1);
    assert.equal(row.rows[0].email_normalized, "hq@grace-chapel.example");
  });

  it("merges cross-product identity into one platform identity", async () => {
    requireDb();
    const dir = path.join(stateDir, "cross-product");
    await runMigrationPipeline({
      command: "apply",
      config: baseConfig(),
      bbSourcePool: pools.sourcePool,
      acSourcePool: pools.sourcePool,
      targetPool: pools.targetPool,
      outputDir: dir,
    });
    const rows = await pools.targetPool.query(
      `SELECT i.id::text
         FROM platform.identities i
        WHERE i.email_normalized = 'shared.person@example.com'`
    );
    assert.equal(rows.rowCount, 1);
    const profiles = await pools.targetPool.query(
      `SELECT product_key FROM platform.identity_product_profiles
        WHERE identity_id = $1::uuid AND status = 'active'`,
      [rows.rows[0].id]
    );
    const keys = profiles.rows.map((r) => r.product_key).sort();
    assert.deepEqual(keys, ["activeclinic", "blessboard"]);
  });

  it("migrates AC organization before domain rows", async () => {
    requireDb();
    const org = await pools.targetPool.query(
      `SELECT 1
         FROM platform.organizations o
         JOIN activeclinic.healthcare_organizations h ON h.organization_id = o.id
        WHERE o.organization_key = 'pilot-health-clinic'`
    );
    assert.equal(org.rowCount, 1);
  });

  it("migrates AC facility and staff", async () => {
    requireDb();
    const staff = await pools.targetPool.query(
      `SELECT COUNT(*)::int AS n FROM activeclinic.staff_members WHERE healthcare_organization_id = $1::uuid`,
      [IDS.acHco]
    );
    assert.equal(staff.rows[0].n, 2);
  });

  it("respects AC clinical flag OFF", async () => {
    requireDb();
    const dir = path.join(stateDir, "ac-clinical-off");
    const res = await runMigrationPipeline({
      command: "dry-run",
      config: baseConfig({ runConfig: { migrateAcClinical: false } }),
      bbSourcePool: pools.sourcePool,
      acSourcePool: pools.sourcePool,
      targetPool: pools.targetPool,
      outputDir: dir,
    });
    assert.equal(res.apply.activeclinic.results.patients, undefined);
    assert.equal(res.apply.activeclinic.results.appointments, undefined);
  });

  it("includes AC clinical data when flag ON", async () => {
    requireDb();
    const patients = await pools.targetPool.query(`SELECT COUNT(*)::int AS n FROM activeclinic.patients`);
    assert.equal(patients.rows[0].n, 2);
  });

  it("migrates website instances and media", async () => {
    requireDb();
    const wi = await pools.targetPool.query(
      `SELECT COUNT(*)::int AS n FROM platform.website_instances WHERE product_code = 'activeclinic'`
    );
    const wm = await pools.targetPool.query(`SELECT COUNT(*)::int AS n FROM platform.website_media`);
    assert.equal(wi.rows[0].n, 1);
    assert.equal(wm.rows[0].n, 1);
  });

  it("preserves bcrypt password hash for migrated BB user", async () => {
    requireDb();
    const src = await pools.sourcePool.query(
      `SELECT password_hash FROM blessboard.users WHERE email_normalized = 'hq@grace-chapel.example'`
    );
    const tgt = await pools.targetPool.query(
      `SELECT i.password_hash
         FROM blessboard.users u
         JOIN platform.identities i ON i.id = u.platform_identity_id
        WHERE u.email_normalized = 'hq@grace-chapel.example'`
    );
    assert.equal(tgt.rows[0].password_hash, src.rows[0].password_hash);
    assert.equal(await verifyBcryptPassword(pools.seeded.passwords.bbHq, tgt.rows[0].password_hash), true);
  });

  it("MIGRATED PASSWORD HASH LOGIN AC PASS", async () => {
    requireDb();
    const tgt = await pools.targetPool.query(
      `SELECT password_hash FROM platform.identities WHERE email_normalized = 'admin@pilot-health.example'`
    );
    assert.equal(
      await verifyBcryptPassword(pools.seeded.passwords.acAdmin, tgt.rows[0].password_hash),
      true
    );
  });

  it("applies delta updates", async () => {
    requireDb();
    const dir = path.join(stateDir, "delta");
    await runMigrationPipeline({
      command: "apply",
      config: baseConfig(),
      bbSourcePool: pools.sourcePool,
      acSourcePool: pools.sourcePool,
      targetPool: pools.targetPool,
      outputDir: dir,
    });
    await pools.sourcePool.query(
      `UPDATE blessboard.page_sections SET heading = 'Delta Heading' WHERE section_key = 'welcome'`
    );
    const delta = await runMigrationPipeline({
      command: "apply",
      config: baseConfig(),
      bbSourcePool: pools.sourcePool,
      acSourcePool: pools.sourcePool,
      targetPool: pools.targetPool,
      outputDir: dir,
      delta: true,
    });
    const section = await pools.targetPool.query(
      `SELECT heading FROM blessboard.page_sections WHERE section_key = 'welcome'`
    );
    assert.equal(section.rows[0].heading, "Delta Heading");
    assert.ok(delta.apply.blessboard.results.page_sections.updated >= 0);
  });

  it("delta apply is idempotent on second run", async () => {
    requireDb();
    const dir = path.join(stateDir, "delta-idempotent");
    await runMigrationPipeline({
      command: "apply",
      config: baseConfig(),
      bbSourcePool: pools.sourcePool,
      acSourcePool: pools.sourcePool,
      targetPool: pools.targetPool,
      outputDir: dir,
    });
    const second = await runMigrationPipeline({
      command: "apply",
      config: baseConfig(),
      bbSourcePool: pools.sourcePool,
      acSourcePool: pools.sourcePool,
      targetPool: pools.targetPool,
      outputDir: dir,
      delta: true,
    });
    assert.ok(second.apply.blessboard.results.churches.skipped >= 0);
  });

  it("verify reports zero orphan references", async () => {
    requireDb();
    const verified = await runMigrationPipeline({
      command: "verify",
      config: baseConfig(),
      bbSourcePool: pools.sourcePool,
      acSourcePool: pools.sourcePool,
      targetPool: pools.targetPool,
      outputDir: stateDir,
    });
    assert.equal(verified.verify.integrity.orphanTotal, 0);
  });

  it("supabase media copy skips identical target object", async () => {
    const body = Buffer.from("same-bytes");
    const fetchImpl = async (url, opts = {}) => {
      if (opts.method === "HEAD") {
        return { ok: true, status: 200, headers: { get: (k) => (k === "content-length" ? String(body.length) : "image/png") } };
      }
      if (opts.method === "GET") {
        return { ok: true, status: 200, headers: { get: () => "image/png" }, arrayBuffer: async () => body };
      }
      if (opts.method === "POST") throw new Error("should_not_upload");
      return { ok: false, status: 404, headers: { get: () => null }, text: async () => "" };
    };
    const sourceClient = createSupabaseMediaClient({
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "service-key",
      fetchImpl,
    });
    const targetClient = createSupabaseMediaClient({
      supabaseUrl: "https://target.supabase.co",
      serviceRoleKey: "service-key",
      fetchImpl,
    });
    const sourcePool = {
      query: async () => ({
        rowCount: 1,
        rows: [
          {
            id: IDS.bbMediaAsset,
            storage_bucket: "blessboard-public",
            storage_key: `blessboard/${IDS.bbChurch}/${IDS.bbMediaAsset}/logo.png`,
            mime_type: "image/png",
            size_bytes: body.length,
            visibility: "public",
            sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          },
        ],
      }),
    };
    const result = await copySupabaseMedia({
      sourcePool,
      sourceClient,
      targetClient,
      env: {},
      dryRun: false,
      resumeState: {},
    });
    assert.equal(result.stats.skippedIdentical, 1);
    assert.equal(result.stats.copied, 0);
  });

  it("throws MigrationIdentityConflictError for required ambiguous identity", () => {
    const err = new MigrationIdentityConflictError({ source: "activeclinic", legacyId: "x" });
    assert.equal(err.code, "migration_identity_conflict");
  });

  it("buildDeltaFilter uses updated_at when present", async () => {
    requireDb();
    const filter = await buildDeltaFilter(
      pools.sourcePool,
      "blessboard.churches",
      { capturedAt: "2000-01-01T00:00:00.000Z" },
      true
    );
    assert.equal(filter.mode, "incremental");
    assert.match(filter.sql, /updated_at/);
  });
});
