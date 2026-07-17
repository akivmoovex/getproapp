"use strict";

/**
 * Isolated hostname resolution tests against ephemeral foundation PostgreSQL.
 * Fixtures are created in-test; production seeds are not extended with demo orgs.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { normalizeHostname } = require("../src/platform/hostname");
const { findDomainContextByHostname, LOOKUP_SQL } = require("../src/platform/repositories/domainRepository");
const {
  resolveHostname,
  RESULT_TYPES,
} = require("../src/platform/services/resolveHostname");

describe("platform hostname resolution", () => {
  let databaseUrl;
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let productId;
  let deploymentCode;
  let orgId;
  let orgProductId;

  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });

      const product = await pool.query(
        `SELECT id FROM platform.products WHERE product_key = 'blessboard'`
      );
      productId = product.rows[0].id;
      deploymentCode = "blessboard-com-v4";

      const org = await pool.query(
        `INSERT INTO platform.organizations
           (organization_key, display_name, status, data_environment)
         VALUES ('resolution-tenant', 'Resolution Tenant', 'active', 'testing')
         RETURNING id`
      );
      orgId = org.rows[0].id;

      const enrolment = await pool.query(
        `INSERT INTO platform.organization_products
           (organization_id, product_id, status, product_tenant_key, activated_at)
         VALUES ($1, $2, 'active', 'resolution-tenant', now())
         RETURNING id`,
        [orgId, productId]
      );
      orgProductId = enrolment.rows[0].id;

      await pool.query(
        `INSERT INTO platform.domains
           (organization_id, product_id, deployment_id, hostname, domain_type, status, is_primary)
         VALUES
           ($1, $2, $3, 'tenant.example.test', 'canonical', 'active', true),
           ($1, $2, $3, 'custom.example.test', 'custom', 'active', false),
           ($1, $2, $3, 'alias.example.test', 'alias', 'active', false),
           (NULL, $2, $3, 'apex.example.test', 'apex', 'active', true)`,
        [orgId, productId, deploymentCode]
      );
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) {
      assert.fail(`Local PostgreSQL unavailable for resolution tests: ${skipReason}`);
    }
  }

  async function insertDomain(opts) {
    const r = await pool.query(
      `INSERT INTO platform.domains
         (organization_id, product_id, deployment_id, hostname, domain_type, status, is_primary)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        opts.organizationId === undefined ? orgId : opts.organizationId,
        opts.productId || productId,
        opts.deploymentId === undefined ? deploymentCode : opts.deploymentId,
        opts.hostname,
        opts.domainType || "canonical",
        opts.status || "active",
        opts.isPrimary === true,
      ]
    );
    return r.rows[0].id;
  }

  it("canonical tenant domain resolves correctly", async () => {
    requireDb();
    const result = await resolveHostname(pool, "tenant.example.test");
    assert.equal(result.type, RESULT_TYPES.RESOLVED_TENANT);
    assert.equal(result.hostname, "tenant.example.test");
    assert.equal(result.domain.type, "canonical");
    assert.equal(result.domain.isPrimary, true);
    assert.equal(result.deployment.code, deploymentCode);
    assert.equal(result.deployment.jobsEnabled, true);
    assert.equal(result.product.key, "blessboard");
    assert.equal(result.organization.key, "resolution-tenant");
    assert.equal(result.organizationProduct.productTenantKey, "resolution-tenant");
    assert.equal(result.organization.id, orgId);
    assert.equal(result.organizationProduct.id, orgProductId);
  });

  it("custom tenant domain resolves correctly", async () => {
    requireDb();
    const result = await resolveHostname(pool, "custom.example.test");
    assert.equal(result.type, RESULT_TYPES.RESOLVED_TENANT);
    assert.equal(result.domain.type, "custom");
    assert.equal(result.organization.key, "resolution-tenant");
    assert.equal(result.organizationProduct.productTenantKey, "resolution-tenant");
  });

  it("alias tenant domain resolves as tenant context without redirect behavior", async () => {
    requireDb();
    const result = await resolveHostname(pool, "alias.example.test");
    assert.equal(result.type, RESULT_TYPES.RESOLVED_TENANT);
    assert.equal(result.domain.type, "alias");
    assert.ok(!("redirectTo" in result));
    assert.ok(!("redirect" in result));
    assert.equal(result.organization.key, "resolution-tenant");
  });

  it("apex product domain resolves with null organization", async () => {
    requireDb();
    const result = await resolveHostname(pool, "apex.example.test");
    assert.equal(result.type, RESULT_TYPES.RESOLVED_APEX);
    assert.equal(result.organization, null);
    assert.equal(result.organizationProduct, null);
    assert.equal(result.product.key, "blessboard");
    assert.equal(result.domain.type, "apex");
  });

  it("hostname lookup is case-insensitive", async () => {
    requireDb();
    const result = await resolveHostname(pool, "Tenant.Example.TEST");
    assert.equal(result.type, RESULT_TYPES.RESOLVED_TENANT);
    assert.equal(result.hostname, "tenant.example.test");
  });

  it("trailing dot is normalized", async () => {
    requireDb();
    const result = await resolveHostname(pool, "tenant.example.test.");
    assert.equal(result.type, RESULT_TYPES.RESOLVED_TENANT);
    assert.equal(result.hostname, "tenant.example.test");
  });

  it("leading and trailing whitespace is normalized", async () => {
    requireDb();
    const result = await resolveHostname(pool, "  tenant.example.test  ");
    assert.equal(result.type, RESULT_TYPES.RESOLVED_TENANT);
    assert.equal(result.hostname, "tenant.example.test");
  });

  it("protocol is rejected", async () => {
    requireDb();
    assert.equal((await resolveHostname(pool, "https://tenant.example.test")).type, RESULT_TYPES.INVALID_HOSTNAME);
    assert.equal(normalizeHostname("https://tenant.example.test").ok, false);
  });

  it("path is rejected", async () => {
    requireDb();
    assert.equal((await resolveHostname(pool, "tenant.example.test/path")).type, RESULT_TYPES.INVALID_HOSTNAME);
  });

  it("port is rejected", async () => {
    requireDb();
    assert.equal((await resolveHostname(pool, "tenant.example.test:443")).type, RESULT_TYPES.INVALID_HOSTNAME);
  });

  it("query string is rejected", async () => {
    requireDb();
    assert.equal((await resolveHostname(pool, "tenant.example.test?x=1")).type, RESULT_TYPES.INVALID_HOSTNAME);
  });

  it("fragment is rejected", async () => {
    requireDb();
    assert.equal((await resolveHostname(pool, "tenant.example.test#section")).type, RESULT_TYPES.INVALID_HOSTNAME);
  });

  it("embedded whitespace is rejected", async () => {
    requireDb();
    assert.equal((await resolveHostname(pool, "tenant.example .test")).type, RESULT_TYPES.INVALID_HOSTNAME);
  });

  it("unknown domain returns unknown_domain", async () => {
    requireDb();
    const result = await resolveHostname(pool, "missing.example.test");
    assert.equal(result.type, RESULT_TYPES.UNKNOWN_DOMAIN);
    assert.equal(result.hostname, "missing.example.test");
  });

  it("inactive domain returns inactive_domain", async () => {
    requireDb();
    await insertDomain({ hostname: "inactive-domain.example.test", status: "inactive" });
    const result = await resolveHostname(pool, "inactive-domain.example.test");
    assert.equal(result.type, RESULT_TYPES.INACTIVE_DOMAIN);
  });

  it("inactive deployment returns inactive_deployment", async () => {
    requireDb();
    await pool.query(
      `INSERT INTO platform.deployments
         (deployment_code, application_code, release_version, canonical_domain,
          environment_code, status, jobs_enabled, database_access_mode, session_cookie_name)
       VALUES ('inactive-deploy-test', 'blessboard', 'v9', 'inactive-deploy.example.test',
               'testing', 'inactive', false, 'read_write', 'inactive_deploy_sid')`
    );
    await insertDomain({
      hostname: "with-inactive-deploy.example.test",
      deploymentId: "inactive-deploy-test",
    });
    const result = await resolveHostname(pool, "with-inactive-deploy.example.test");
    assert.equal(result.type, RESULT_TYPES.INACTIVE_DEPLOYMENT);
  });

  it("inactive product returns inactive_product", async () => {
    requireDb();
    const inactiveProduct = await pool.query(
      `INSERT INTO platform.products (product_key, display_name, status)
       VALUES ('inactiveprod', 'Inactive Product', 'inactive')
       RETURNING id`
    );
    await insertDomain({
      hostname: "inactive-product.example.test",
      productId: inactiveProduct.rows[0].id,
      organizationId: null,
      domainType: "apex",
      deploymentId: null,
    });
    const result = await resolveHostname(pool, "inactive-product.example.test");
    assert.equal(result.type, RESULT_TYPES.INACTIVE_PRODUCT);
  });

  it("inactive organization returns inactive_organization", async () => {
    requireDb();
    const inactiveOrg = await pool.query(
      `INSERT INTO platform.organizations
         (organization_key, display_name, status, data_environment)
       VALUES ('inactive-org', 'Inactive Org', 'inactive', 'testing')
       RETURNING id`
    );
    await pool.query(
      `INSERT INTO platform.organization_products
         (organization_id, product_id, status, product_tenant_key)
       VALUES ($1, $2, 'active', 'inactive-org')`,
      [inactiveOrg.rows[0].id, productId]
    );
    await insertDomain({
      hostname: "inactive-org.example.test",
      organizationId: inactiveOrg.rows[0].id,
    });
    const result = await resolveHostname(pool, "inactive-org.example.test");
    assert.equal(result.type, RESULT_TYPES.INACTIVE_ORGANIZATION);
  });

  it("inactive organization-product enrolment returns inactive_enrolment", async () => {
    requireDb();
    const org = await pool.query(
      `INSERT INTO platform.organizations
         (organization_key, display_name, status, data_environment)
       VALUES ('inactive-enrol-org', 'Inactive Enrol Org', 'active', 'testing')
       RETURNING id`
    );
    await pool.query(
      `INSERT INTO platform.organization_products
         (organization_id, product_id, status, product_tenant_key)
       VALUES ($1, $2, 'inactive', 'inactive-enrol-org')`,
      [org.rows[0].id, productId]
    );
    await insertDomain({
      hostname: "inactive-enrol.example.test",
      organizationId: org.rows[0].id,
    });
    const result = await resolveHostname(pool, "inactive-enrol.example.test");
    assert.equal(result.type, RESULT_TYPES.INACTIVE_ENROLMENT);
  });

  it("missing organization-product enrolment returns missing_enrolment", async () => {
    requireDb();
    const org = await pool.query(
      `INSERT INTO platform.organizations
         (organization_key, display_name, status, data_environment)
       VALUES ('no-enrol-org', 'No Enrol Org', 'active', 'testing')
       RETURNING id`
    );
    await insertDomain({
      hostname: "no-enrol.example.test",
      organizationId: org.rows[0].id,
    });
    const result = await resolveHostname(pool, "no-enrol.example.test");
    assert.equal(result.type, RESULT_TYPES.MISSING_ENROLMENT);
  });

  it("non-apex domain without organization does not resolve", async () => {
    requireDb();
    await insertDomain({
      hostname: "orphan-canonical.example.test",
      organizationId: null,
      domainType: "canonical",
    });
    const result = await resolveHostname(pool, "orphan-canonical.example.test");
    assert.notEqual(result.type, RESULT_TYPES.RESOLVED_TENANT);
    assert.notEqual(result.type, RESULT_TYPES.RESOLVED_APEX);
    assert.equal(result.type, RESULT_TYPES.MISSING_ORGANIZATION);
  });

  it("apex domain does not require an organization-product enrolment", async () => {
    requireDb();
    const result = await resolveHostname(pool, "apex.example.test");
    assert.equal(result.type, RESULT_TYPES.RESOLVED_APEX);
    assert.equal(result.organizationProduct, null);
  });

  it("repository query is parameterized", async () => {
    requireDb();
    assert.match(LOOKUP_SQL, /\$1/);
    assert.doesNotMatch(LOOKUP_SQL, /'\s*\|\||\$\{/);
    const row = await findDomainContextByHostname(pool, "tenant.example.test");
    assert.ok(row);
    assert.equal(row.domain_hostname, "tenant.example.test");
  });

  it("resolver performs no writes", async () => {
    requireDb();
    const before = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM platform.domains) AS domains,
         (SELECT COUNT(*)::int FROM platform.organizations) AS orgs,
         (SELECT COUNT(*)::int FROM platform.organization_products) AS enrolments`
    );
    await resolveHostname(pool, "tenant.example.test");
    await resolveHostname(pool, "missing.example.test");
    await resolveHostname(pool, "https://bad.example");
    const after = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM platform.domains) AS domains,
         (SELECT COUNT(*)::int FROM platform.organizations) AS orgs,
         (SELECT COUNT(*)::int FROM platform.organization_products) AS enrolments`
    );
    assert.deepEqual(after.rows[0], before.rows[0]);
  });

  it("no public application tables; getpro/ngo empty; blessboard catalogue allowed", async () => {
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
      ["branches", "churches", "user_roles", "users"]
    );

    for (const schema of ["getpro", "ngo"]) {
      const tables = await pool.query(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
        [schema]
      );
      assert.equal(tables.rowCount, 0, `${schema} must stay empty`);
    }

    // Resolver source must not reference legacy public tables.
    const repoSrc = fs.readFileSync(
      path.join(__dirname, "../src/platform/repositories/domainRepository.js"),
      "utf8"
    );
    const serviceSrc = fs.readFileSync(
      path.join(__dirname, "../src/platform/services/resolveHostname.js"),
      "utf8"
    );
    assert.doesNotMatch(repoSrc, /\bpublic\./);
    assert.doesNotMatch(serviceSrc, /\bpublic\./);
    assert.doesNotMatch(repoSrc, /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i);
  });
});
