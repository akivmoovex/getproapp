"use strict";

/**
 * BlessBoard church provisioning service + CLI tests (ephemeral Postgres).
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
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  provisionBlessBoardChurch,
  STATUS,
  validateAndNormalizeInput,
} = require("../src/blessboard/services/provisionBlessBoardChurch");

const ROOT = path.resolve(__dirname, "..");
const IDENTITY_KEY = "blessboard-platform-v5";

const BASE_PLATFORM = {
  organizationKey: "demo-church",
  displayName: "Demo Church",
  legalName: null,
  dataEnvironment: "testing",
  productKey: "blessboard",
  productTenantKey: "demo-church",
  hostname: "demo.blessboard.test",
  domainType: "canonical",
  deploymentCode: "blessboard-org-staging",
  isPrimary: true,
};

const BASE_CHURCH = {
  organizationKey: "demo-church",
  churchKey: "demo-church",
  displayName: "Demo Church",
  legalName: null,
  dataEnvironment: "testing",
  hqBranchKey: "hq",
  hqBranchDisplayName: "Headquarters",
  timezone: "Africa/Lusaka",
  countryCode: "ZM",
};

function runCli(args, envExtra) {
  return spawnSync(
    process.execPath,
    [path.join(ROOT, "db/scripts/blessboard-church-provision.js"), ...args],
    {
      env: { ...process.env, ...envExtra },
      encoding: "utf8",
    }
  );
}

describe("blessboard church provisioning", () => {
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
      const platform = await provisionPlatformTenant(pool, BASE_PLATFORM);
      assert.equal(platform.ok, true, platform.message);
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

  async function counts() {
    const r = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM blessboard.churches) AS churches,
         (SELECT COUNT(*)::int FROM blessboard.branches) AS branches`
    );
    return r.rows[0];
  }

  it("valid provision creates one church and one HQ branch", async () => {
    requireDb();
    const before = await counts();
    const result = await provisionBlessBoardChurch(pool, BASE_CHURCH);
    assert.equal(result.ok, true);
    assert.equal(result.status, STATUS.PROVISIONED);
    assert.equal(result.created.church, true);
    assert.equal(result.created.hqBranch, true);
    assert.equal(result.records.church.key, "demo-church");
    assert.equal(result.records.hqBranch.key, "hq");
    assert.equal(result.records.hqBranch.branchType, "hq");
    assert.equal(result.records.hqBranch.isPrimary, true);
    const after = await counts();
    assert.equal(after.churches, before.churches + 1);
    assert.equal(after.branches, before.branches + 1);
  });

  it("exact rerun returns already_provisioned with no duplicates", async () => {
    requireDb();
    const before = await counts();
    const result = await provisionBlessBoardChurch(pool, BASE_CHURCH);
    assert.equal(result.ok, true);
    assert.equal(result.status, STATUS.ALREADY_PROVISIONED);
    assert.deepEqual(result.created, { church: false, hqBranch: false });
    const after = await counts();
    assert.deepEqual(after, before);
  });

  it("missing organization returns organization_not_found", async () => {
    requireDb();
    const result = await provisionBlessBoardChurch(pool, {
      ...BASE_CHURCH,
      organizationKey: "missing-org",
      churchKey: "missing-org",
    });
    assert.equal(result.status, STATUS.ORGANIZATION_NOT_FOUND);
  });

  it("inactive organization is rejected", async () => {
    requireDb();
    await provisionPlatformTenant(pool, {
      ...BASE_PLATFORM,
      organizationKey: "inactive-org",
      productTenantKey: "inactive-org",
      hostname: "inactive.blessboard.test",
    });
    await pool.query(
      `UPDATE platform.organizations SET status = 'inactive' WHERE organization_key = 'inactive-org'`
    );
    const result = await provisionBlessBoardChurch(pool, {
      ...BASE_CHURCH,
      organizationKey: "inactive-org",
      churchKey: "inactive-org",
    });
    assert.equal(result.status, STATUS.INACTIVE_ORGANIZATION);
  });

  it("missing BlessBoard enrolment is rejected", async () => {
    requireDb();
    await pool.query(
      `INSERT INTO platform.organizations
         (organization_key, display_name, status, data_environment)
       VALUES ('no-enrol', 'No Enrol', 'active', 'testing')`
    );
    const result = await provisionBlessBoardChurch(pool, {
      ...BASE_CHURCH,
      organizationKey: "no-enrol",
      churchKey: "no-enrol",
    });
    assert.equal(result.status, STATUS.MISSING_BLESSBOARD_ENROLMENT);
  });

  it("inactive BlessBoard enrolment is rejected", async () => {
    requireDb();
    await provisionPlatformTenant(pool, {
      ...BASE_PLATFORM,
      organizationKey: "inactive-enrol",
      productTenantKey: "inactive-enrol",
      hostname: "inactive-enrol.blessboard.test",
    });
    await pool.query(
      `UPDATE platform.organization_products op
          SET status = 'inactive'
         FROM platform.organizations o
        WHERE o.id = op.organization_id AND o.organization_key = 'inactive-enrol'`
    );
    const result = await provisionBlessBoardChurch(pool, {
      ...BASE_CHURCH,
      organizationKey: "inactive-enrol",
      churchKey: "inactive-enrol",
    });
    assert.equal(result.status, STATUS.INACTIVE_BLESSBOARD_ENROLMENT);
  });

  it("environment mismatch is rejected", async () => {
    requireDb();
    const result = await provisionBlessBoardChurch(pool, {
      ...BASE_CHURCH,
      dataEnvironment: "production",
    });
    assert.equal(result.status, STATUS.ENVIRONMENT_MISMATCH);
  });

  it("church ownership conflict is rejected", async () => {
    requireDb();
    await provisionPlatformTenant(pool, {
      ...BASE_PLATFORM,
      organizationKey: "other-org",
      productTenantKey: "other-org",
      hostname: "other.blessboard.test",
    });
    const result = await provisionBlessBoardChurch(pool, {
      ...BASE_CHURCH,
      organizationKey: "other-org",
      churchKey: "demo-church",
      displayName: "Other",
    });
    assert.equal(result.status, STATUS.CHURCH_CONFLICT);
  });

  it("HQ branch conflict is rejected", async () => {
    requireDb();
    const result = await provisionBlessBoardChurch(pool, {
      ...BASE_CHURCH,
      hqBranchKey: "hq",
      hqBranchDisplayName: "Different HQ Name",
    });
    assert.equal(result.status, STATUS.BRANCH_CONFLICT);
  });

  it("failure rolls back both church and branch creation", async () => {
    requireDb();
    await provisionPlatformTenant(pool, {
      ...BASE_PLATFORM,
      organizationKey: "rollback-org",
      productTenantKey: "rollback-org",
      hostname: "rollback.blessboard.test",
    });
    const before = await counts();
    const repo = require("../src/blessboard/repositories/blessBoardCatalogueRepository");
    const originalInsertHq = repo.insertHqBranch;
    repo.insertHqBranch = async () => {
      throw Object.assign(new Error("forced_branch_failure"), { code: "XX000" });
    };
    let result;
    try {
      result = await provisionBlessBoardChurch(pool, {
        ...BASE_CHURCH,
        organizationKey: "rollback-org",
        churchKey: "rollback-church",
        displayName: "Rollback",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
      });
    } finally {
      repo.insertHqBranch = originalInsertHq;
    }
    assert.equal(result.status, STATUS.TRANSACTION_ERROR);
    assert.deepEqual(await counts(), before);

    const recovered = await provisionBlessBoardChurch(pool, {
      ...BASE_CHURCH,
      organizationKey: "rollback-org",
      churchKey: "rollback-church",
      displayName: "Rollback",
      hqBranchKey: "hq",
      hqBranchDisplayName: "Headquarters",
    });
    assert.equal(recovered.status, STATUS.PROVISIONED);
  });

  it("invalid input is rejected before writes", async () => {
    requireDb();
    assert.equal(validateAndNormalizeInput({ ...BASE_CHURCH, churchKey: "Bad Key" }).ok, false);
    const before = await counts();
    const result = await provisionBlessBoardChurch(pool, { ...BASE_CHURCH, churchKey: "" });
    assert.equal(result.status, STATUS.INVALID_INPUT);
    assert.deepEqual(await counts(), before);
  });

  it("CLI requires explicit arguments and checks identity", async () => {
    requireDb();
    const missing = runCli([], {
      DATABASE_URL: databaseUrl,
      DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
    });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /missing_required_arguments/);

    const noIdentity = runCli(
      [
        "--organization-key",
        "demo-church",
        "--church-key",
        "demo-church",
        "--display-name",
        "Demo Church",
        "--environment",
        "testing",
        "--hq-branch-key",
        "hq",
        "--hq-branch-name",
        "Headquarters",
      ],
      { DATABASE_URL: databaseUrl, DATABASE_IDENTITY_EXPECTED: "" }
    );
    assert.notEqual(noIdentity.status, 0);
    assert.match(noIdentity.stderr, /DATABASE_IDENTITY_EXPECTED/);

    const ok = runCli(
      [
        "--organization-key",
        "demo-church",
        "--church-key",
        "demo-church",
        "--display-name",
        "Demo Church",
        "--environment",
        "testing",
        "--hq-branch-key",
        "hq",
        "--hq-branch-name",
        "Headquarters",
        "--timezone",
        "Africa/Lusaka",
        "--country-code",
        "ZM",
        "--deployment",
        "blessboard-org-staging",
        "--confirm",
      ],
      { DATABASE_URL: databaseUrl, DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY }
    );
    assert.equal(ok.status, 0, ok.stderr || ok.stdout);
    const payload = JSON.parse(ok.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, "write");
    assert.equal(payload.status, STATUS.ALREADY_PROVISIONED);
    assert.doesNotMatch(ok.stdout, /postgres(ql)?:\/\//i);
    assert.doesNotMatch(ok.stdout, /password=/i);
    assert.ok(payload.host_fingerprint);
  });
});
