"use strict";

/**
 * Church display-name uniqueness within country (normalized name + ISO-2).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const {
  normalizeChurchDisplayNameForUniqueness,
  resolveCountryCodeForUniqueness,
  DUPLICATE_CHURCH_NAME_MESSAGE,
} = require("../src/blessboard/services/normalizeChurchIdentity");
const {
  assertChurchNameAvailable,
  listChurchNameDuplicateGroups,
} = require("../src/blessboard/services/assertChurchNameAvailable");
const { slugifyBranchKey, normalizeBranchKey } = require("../src/blessboard/services/branchKey");

const IDENTITY_KEY = "blessboard-platform-v5";
const DEPLOYMENT = "blessboard-org-staging";

describe("blessboard church name uniqueness + branch key slugify", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let orgZm;
  let churchZm;

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      const tenant = await provisionPlatformTenant(pool, {
        organizationKey: "name-uniq-zm",
        displayName: "Name Uniq ZM Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "name-uniq-zm",
        hostname: "name-uniq-zm.blessboard.org",
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(tenant.ok, true, tenant.message);
      orgZm = tenant.records.organization;

      const church = await provisionBlessBoardChurch(pool, {
        organizationKey: "name-uniq-zm",
        churchKey: "name-uniq-zm",
        displayName: "Grace Church",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
        countryCode: "ZM",
      });
      assert.equal(church.ok, true, church.message);
      churchZm = church.records.church;
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("normalizes display names for uniqueness", () => {
    assert.equal(normalizeChurchDisplayNameForUniqueness("Grace Church"), "grace church");
    assert.equal(normalizeChurchDisplayNameForUniqueness(" GRACE CHURCH "), "grace church");
    assert.equal(normalizeChurchDisplayNameForUniqueness("Grace   Church"), "grace church");
    assert.equal(normalizeChurchDisplayNameForUniqueness("Grace Church."), "grace church");
    assert.equal(normalizeChurchDisplayNameForUniqueness("St. Peter's"), "st peters");
    assert.equal(resolveCountryCodeForUniqueness("Zambia"), "ZM");
    assert.equal(resolveCountryCodeForUniqueness("zm"), "ZM");
  });

  it("slugifies branch keys from display names", () => {
    assert.equal(slugifyBranchKey("Lusaka Central"), "lusaka-central");
    assert.equal(slugifyBranchKey("Demo Church – Ndola"), "demo-church-ndola");
    assert.equal(slugifyBranchKey("St. Peter’s Branch"), "st-peters-branch");
    assert.equal(slugifyBranchKey("Kafue Main Branch"), "kafue-main-branch");
    assert.equal(normalizeBranchKey("sermons").ok, false);
    assert.equal(normalizeBranchKey("giving").ok, false);
    assert.equal(normalizeBranchKey("edit").ok, false);
  });

  it("rejects same normalized name in the same country", async () => {
    requireDb();
    const check = await assertChurchNameAvailable(pool, {
      churchName: "grace  church.",
      countryCode: "ZM",
    });
    assert.equal(check.ok, false);
    assert.equal(check.message, DUPLICATE_CHURCH_NAME_MESSAGE);

    const tenant = await provisionPlatformTenant(pool, {
      organizationKey: "name-uniq-zm-2",
      displayName: "Name Uniq ZM Org 2",
      legalName: null,
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: "name-uniq-zm-2",
      hostname: "name-uniq-zm-2.blessboard.org",
      domainType: "canonical",
      deploymentCode: DEPLOYMENT,
      isPrimary: true,
    });
    assert.equal(tenant.ok, true, tenant.message);

    const dup = await provisionBlessBoardChurch(pool, {
      organizationKey: "name-uniq-zm-2",
      churchKey: "name-uniq-zm-2",
      displayName: "GRACE CHURCH",
      legalName: null,
      dataEnvironment: "testing",
      hqBranchKey: "hq",
      hqBranchDisplayName: "HQ",
      countryCode: "ZM",
    });
    assert.equal(dup.ok, false);
    assert.equal(dup.status, "duplicate_church_name");
    assert.match(dup.message, /already registered/i);
  });

  it("allows the same name in a different country", async () => {
    requireDb();
    const tenant = await provisionPlatformTenant(pool, {
      organizationKey: "name-uniq-ke",
      displayName: "Name Uniq KE Org",
      legalName: null,
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: "name-uniq-ke",
      hostname: "name-uniq-ke.blessboard.org",
      domainType: "canonical",
      deploymentCode: DEPLOYMENT,
      isPrimary: true,
    });
    assert.equal(tenant.ok, true, tenant.message);

    const ok = await provisionBlessBoardChurch(pool, {
      organizationKey: "name-uniq-ke",
      churchKey: "name-uniq-ke",
      displayName: "Grace Church",
      legalName: null,
      dataEnvironment: "testing",
      hqBranchKey: "hq",
      hqBranchDisplayName: "HQ",
      countryCode: "KE",
    });
    assert.equal(ok.ok, true, ok.message);
  });

  it("allows a meaningfully different name in the same country", async () => {
    requireDb();
    const tenant = await provisionPlatformTenant(pool, {
      organizationKey: "name-uniq-zm-3",
      displayName: "Name Uniq ZM Org 3",
      legalName: null,
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: "name-uniq-zm-3",
      hostname: "name-uniq-zm-3.blessboard.org",
      domainType: "canonical",
      deploymentCode: DEPLOYMENT,
      isPrimary: true,
    });
    assert.equal(tenant.ok, true, tenant.message);

    const ok = await provisionBlessBoardChurch(pool, {
      organizationKey: "name-uniq-zm-3",
      churchKey: "name-uniq-zm-3",
      displayName: "Grace Fellowship Lusaka",
      legalName: null,
      dataEnvironment: "testing",
      hqBranchKey: "hq",
      hqBranchDisplayName: "HQ",
      countryCode: "ZM",
    });
    assert.equal(ok.ok, true, ok.message);
  });

  it("idempotent re-provision of the same organization is not a duplicate", async () => {
    requireDb();
    const again = await provisionBlessBoardChurch(pool, {
      organizationKey: "name-uniq-zm",
      churchKey: "name-uniq-zm",
      displayName: "Grace Church",
      legalName: null,
      dataEnvironment: "testing",
      hqBranchKey: "hq",
      hqBranchDisplayName: "HQ",
      countryCode: "ZM",
    });
    assert.equal(again.ok, true, again.message);
    assert.equal(String(again.records.church.id), String(churchZm.id));
  });

  it("duplicate audit is read-only and reports groups without mutating", async () => {
    requireDb();
    const before = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.churches WHERE organization_id = $1`,
      [orgZm.id]
    );
    const groups = await listChurchNameDuplicateGroups(pool);
    assert.ok(Array.isArray(groups));
    const after = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.churches WHERE organization_id = $1`,
      [orgZm.id]
    );
    assert.equal(after.rows[0].n, before.rows[0].n);
  });

  it("migration 056 applied country_code and name_uniqueness_key columns", async () => {
    requireDb();
    const cols = await pool.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'blessboard'
          AND table_name = 'churches'
          AND column_name IN ('country_code', 'name_uniqueness_key')
        ORDER BY column_name`
    );
    assert.deepEqual(
      cols.rows.map((r) => r.column_name),
      ["country_code", "name_uniqueness_key"]
    );
    const row = await pool.query(
      `SELECT country_code, name_uniqueness_key FROM blessboard.churches WHERE id = $1`,
      [churchZm.id]
    );
    assert.equal(row.rows[0].country_code, "ZM");
    assert.equal(row.rows[0].name_uniqueness_key, "grace church");
  });
});
