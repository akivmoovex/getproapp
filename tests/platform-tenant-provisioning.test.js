"use strict";

/**
 * Ephemeral PostgreSQL tests for transactional platform tenant provisioning.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { APPROVED_PRODUCT_TABLES } = require("../db/scripts/lib/foundationVerify");
const {
  provisionPlatformTenant,
  STATUS,
  validateAndNormalizeInput,
} = require("../src/platform/services/provisionPlatformTenant");
const repo = require("../src/platform/repositories/platformProvisioningRepository");

const ROOT = path.resolve(__dirname, "..");

const BASE_INPUT = {
  organizationKey: "demo-church",
  displayName: "Demo Church",
  legalName: null,
  dataEnvironment: "testing",
  productKey: "blessboard",
  productTenantKey: "demo-church",
  hostname: "demo.blessboard.test",
  domainType: "canonical",
  deploymentCode: "blessboard-org-v5",
  isPrimary: true,
};

describe("platform tenant provisioning", () => {
  let databaseUrl;
  let pool;
  let skipSuite = false;
  let skipReason = "";

  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
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
         (SELECT COUNT(*)::int FROM platform.organizations) AS organizations,
         (SELECT COUNT(*)::int FROM platform.organization_products) AS enrolments,
         (SELECT COUNT(*)::int FROM platform.domains) AS domains`
    );
    return r.rows[0];
  }

  it("successful provisioning creates organization, enrolment, and domain", async () => {
    requireDb();
    const before = await counts();
    const result = await provisionPlatformTenant(pool, BASE_INPUT);
    assert.equal(result.ok, true);
    assert.equal(result.status, STATUS.PROVISIONED);
    assert.equal(result.created.organization, true);
    assert.equal(result.created.enrolment, true);
    assert.equal(result.created.domain, true);
    assert.equal(result.records.organization.key, "demo-church");
    assert.equal(result.records.domain.hostname, "demo.blessboard.test");
    assert.equal(result.records.domain.deploymentCode, "blessboard-org-v5");
    const after = await counts();
    assert.equal(after.organizations, before.organizations + 1);
    assert.equal(after.enrolments, before.enrolments + 1);
    assert.equal(after.domains, before.domains + 1);
  });

  it("identical rerun returns already_provisioned with no duplicates", async () => {
    requireDb();
    const before = await counts();
    const result = await provisionPlatformTenant(pool, BASE_INPUT);
    assert.equal(result.ok, true);
    assert.equal(result.status, STATUS.ALREADY_PROVISIONED);
    assert.deepEqual(result.created, {
      organization: false,
      enrolment: false,
      domain: false,
    });
    const after = await counts();
    assert.deepEqual(after, before);
  });

  it("invalid hostname returns invalid_input before writes", async () => {
    requireDb();
    const before = await counts();
    const result = await provisionPlatformTenant(pool, {
      ...BASE_INPUT,
      organizationKey: "bad-host-org",
      productTenantKey: "bad-host-org",
      hostname: "https://evil.example",
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.INVALID_INPUT);
    const after = await counts();
    assert.deepEqual(after, before);
  });

  it("invalid environment and domain type return invalid_input", async () => {
    requireDb();
    assert.equal(
      (await provisionPlatformTenant(pool, { ...BASE_INPUT, dataEnvironment: "staging" })).status,
      STATUS.INVALID_INPUT
    );
    assert.equal(
      (await provisionPlatformTenant(pool, { ...BASE_INPUT, domainType: "apex" })).status,
      STATUS.INVALID_INPUT
    );
    assert.equal(validateAndNormalizeInput({ ...BASE_INPUT, domainType: "weird" }).ok, false);
  });

  it("missing product returns product_not_found", async () => {
    requireDb();
    const result = await provisionPlatformTenant(pool, {
      ...BASE_INPUT,
      organizationKey: "missing-product-org",
      productTenantKey: "missing-product-org",
      hostname: "missing-product.blessboard.test",
      productKey: "doesnotexist",
    });
    assert.equal(result.status, STATUS.PRODUCT_NOT_FOUND);
  });

  it("inactive product returns inactive_product", async () => {
    requireDb();
    await pool.query(
      `INSERT INTO platform.products (product_key, display_name, status)
       VALUES ('inactiveprod2', 'Inactive', 'inactive')
       ON CONFLICT (product_key) DO NOTHING`
    );
    const result = await provisionPlatformTenant(pool, {
      ...BASE_INPUT,
      organizationKey: "inactive-product-org",
      productTenantKey: "inactive-product-org",
      hostname: "inactive-product.blessboard.test",
      productKey: "inactiveprod2",
    });
    assert.equal(result.status, STATUS.INACTIVE_PRODUCT);
  });

  it("missing and inactive deployment return typed failures", async () => {
    requireDb();
    const missing = await provisionPlatformTenant(pool, {
      ...BASE_INPUT,
      organizationKey: "missing-deploy-org",
      productTenantKey: "missing-deploy-org",
      hostname: "missing-deploy.blessboard.test",
      deploymentCode: "no-such-deploy",
    });
    assert.equal(missing.status, STATUS.DEPLOYMENT_NOT_FOUND);

    await pool.query(
      `INSERT INTO platform.deployments
         (deployment_code, application_code, release_version, canonical_domain,
          environment_code, status, jobs_enabled, database_access_mode, session_cookie_name)
       VALUES ('inactive-deploy-prov', 'blessboard', 'v9', 'inactive-deploy-prov.test',
               'testing', 'inactive', false, 'read_write', 'inactive_deploy_prov_sid')
       ON CONFLICT (deployment_code) DO NOTHING`
    );
    const inactive = await provisionPlatformTenant(pool, {
      ...BASE_INPUT,
      organizationKey: "inactive-deploy-org",
      productTenantKey: "inactive-deploy-org",
      hostname: "inactive-deploy.blessboard.test",
      deploymentCode: "inactive-deploy-prov",
    });
    assert.equal(inactive.status, STATUS.INACTIVE_DEPLOYMENT);
  });

  it("existing organization with conflicting identity returns organization_conflict", async () => {
    requireDb();
    const result = await provisionPlatformTenant(pool, {
      ...BASE_INPUT,
      displayName: "Different Name",
    });
    assert.equal(result.status, STATUS.ORGANIZATION_CONFLICT);
  });

  it("existing product tenant key owned by another organization returns enrolment_conflict", async () => {
    requireDb();
    const result = await provisionPlatformTenant(pool, {
      ...BASE_INPUT,
      organizationKey: "other-church",
      displayName: "Other Church",
      productTenantKey: "demo-church",
      hostname: "other.blessboard.test",
    });
    assert.equal(result.status, STATUS.ENROLMENT_CONFLICT);
  });

  it("existing hostname owned by another organization returns hostname_conflict", async () => {
    requireDb();
    await provisionPlatformTenant(pool, {
      ...BASE_INPUT,
      organizationKey: "host-owner",
      displayName: "Host Owner",
      productTenantKey: "host-owner",
      hostname: "shared-host.blessboard.test",
    });
    const conflict = await provisionPlatformTenant(pool, {
      ...BASE_INPUT,
      organizationKey: "host-thief",
      displayName: "Host Thief",
      productTenantKey: "host-thief",
      hostname: "shared-host.blessboard.test",
    });
    assert.equal(conflict.status, STATUS.HOSTNAME_CONFLICT);
  });

  it("existing hostname assigned to another product returns hostname_conflict", async () => {
    requireDb();
    const product = await pool.query(`SELECT id FROM platform.products WHERE product_key = 'getpro'`);
    const org = await pool.query(
      `SELECT id FROM platform.organizations WHERE organization_key = 'demo-church'`
    );
    await pool.query(
      `INSERT INTO platform.domains
         (organization_id, product_id, deployment_id, hostname, domain_type, status, is_primary)
       VALUES ($1, $2, 'blessboard-org-v5', 'cross-product.blessboard.test', 'canonical', 'active', true)`,
      [org.rows[0].id, product.rows[0].id]
    );
    const conflict = await provisionPlatformTenant(pool, {
      ...BASE_INPUT,
      organizationKey: "demo-church",
      displayName: "Demo Church",
      productTenantKey: "demo-church",
      hostname: "cross-product.blessboard.test",
      productKey: "blessboard",
    });
    assert.equal(conflict.status, STATUS.HOSTNAME_CONFLICT);
  });

  it("existing hostname assigned to another deployment returns hostname_conflict", async () => {
    requireDb();
    const conflict = await provisionPlatformTenant(pool, {
      ...BASE_INPUT,
      hostname: "demo.blessboard.test",
      deploymentCode: "blessboard-com-v4",
    });
    assert.equal(conflict.status, STATUS.HOSTNAME_CONFLICT);
  });

  it("existing compatible records are reused", async () => {
    requireDb();
    const first = await provisionPlatformTenant(pool, {
      ...BASE_INPUT,
      organizationKey: "reuse-org",
      displayName: "Reuse Org",
      productTenantKey: "reuse-org",
      hostname: "reuse.blessboard.test",
    });
    assert.equal(first.status, STATUS.PROVISIONED);
    const second = await provisionPlatformTenant(pool, {
      ...BASE_INPUT,
      organizationKey: "reuse-org",
      displayName: "Reuse Org",
      productTenantKey: "reuse-org",
      hostname: "reuse.blessboard.test",
    });
    assert.equal(second.status, STATUS.ALREADY_PROVISIONED);
    assert.equal(second.records.organization.id, first.records.organization.id);
  });

  it("failure creating a domain rolls back a newly created organization and enrolment", async () => {
    requireDb();
    const before = await counts();
    const real = await pool.connect();
    const wrappingPool = {
      connect: async () => {
        const wrapper = {
          async query(sql, params) {
            if (/INSERT INTO platform\.domains/i.test(String(sql))) {
              throw new Error("forced domain failure");
            }
            return real.query(sql, params);
          },
          release() {
            real.release();
          },
        };
        return wrapper;
      },
    };
    const result = await provisionPlatformTenant(wrappingPool, {
      ...BASE_INPUT,
      organizationKey: "rollback-domain-org",
      displayName: "Rollback Domain",
      productTenantKey: "rollback-domain-org",
      hostname: "rollback-domain.blessboard.test",
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.TRANSACTION_ERROR);
    const after = await counts();
    assert.deepEqual(after, before);
    const leftover = await pool.query(
      `SELECT 1 FROM platform.organizations WHERE organization_key = 'rollback-domain-org'`
    );
    assert.equal(leftover.rowCount, 0);
  });

  it("failure creating an enrolment rolls back a newly created organization", async () => {
    requireDb();
    const before = await counts();
    const real = await pool.connect();
    const wrappingPool = {
      connect: async () => ({
        async query(sql, params) {
          if (/INSERT INTO platform\.organization_products/i.test(String(sql))) {
            throw new Error("forced enrolment failure");
          }
          return real.query(sql, params);
        },
        release() {
          real.release();
        },
      }),
    };
    const result = await provisionPlatformTenant(wrappingPool, {
      ...BASE_INPUT,
      organizationKey: "rollback-enrol-org",
      displayName: "Rollback Enrol",
      productTenantKey: "rollback-enrol-org",
      hostname: "rollback-enrol.blessboard.test",
    });
    assert.equal(result.status, STATUS.TRANSACTION_ERROR);
    const after = await counts();
    assert.deepEqual(after, before);
  });

  it("unique-constraint race handling does not create duplicates", async () => {
    requireDb();
    const input = {
      ...BASE_INPUT,
      organizationKey: "race-org",
      displayName: "Race Org",
      productTenantKey: "race-org",
      hostname: "race.blessboard.test",
    };
    const [a, b] = await Promise.all([
      provisionPlatformTenant(pool, input),
      provisionPlatformTenant(pool, input),
    ]);
    assert.ok(a.ok && b.ok);
    const statuses = [a.status, b.status].sort();
    assert.ok(statuses.includes(STATUS.PROVISIONED) || statuses.every((s) => s === STATUS.ALREADY_PROVISIONED));
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations WHERE organization_key = 'race-org'`
    );
    assert.equal(r.rows[0].n, 1);
    const d = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.domains WHERE hostname = 'race.blessboard.test'`
    );
    assert.equal(d.rows[0].n, 1);
  });

  it("queries are parameterized and service does not read environment variables", async () => {
    requireDb();
    const repoSrc = fs.readFileSync(
      path.join(ROOT, "src/platform/repositories/platformProvisioningRepository.js"),
      "utf8"
    );
    const serviceSrc = fs.readFileSync(
      path.join(ROOT, "src/platform/services/provisionPlatformTenant.js"),
      "utf8"
    );
    assert.match(repoSrc, /\$1/);
    assert.doesNotMatch(repoSrc, /\$\{/);
    assert.doesNotMatch(serviceSrc, /process\.env\./);
    assert.doesNotMatch(serviceSrc, /DATABASE_URL|GETPRO_DATABASE_URL/);
    assert.equal(typeof repo.findProductByKey, "function");
  });

  it("CLI requires explicit arguments and does not print secrets", () => {
    requireDb();
    const result = spawnSync(process.execPath, [path.join(ROOT, "db/scripts/platform-tenant-provision.js")], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    const out = `${result.stdout || ""}${result.stderr || ""}`;
    assert.match(out, /missing_required_arguments|invalid_input/);
    assert.doesNotMatch(out, /postgresql:\/\//i);
    if (databaseUrl.includes("@")) {
      assert.equal(out.includes(databaseUrl), false);
    }
  });

  it("no public tables; getpro/ngo empty; blessboard catalogue allowed", async () => {
    requireDb();
    const publicTables = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    assert.equal(publicTables.rowCount, 0);
    const blessboard = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'blessboard' AND table_type = 'BASE TABLE'
        ORDER BY table_name`
    );
    assert.deepEqual(
      blessboard.rows.map((r) => r.table_name),
      APPROVED_PRODUCT_TABLES.blessboard.slice()
    );
    for (const schema of ["getpro", "ngo"]) {
      const tables = await pool.query(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
        [schema]
      );
      assert.equal(tables.rowCount, 0);
    }
  });
});
