"use strict";

/**
 * DEPLOYMENT_ENV mode, demo catalogue visibility, domain generation, seed/cleanup gates.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("child_process");
const path = require("path");

const {
  getDeploymentEnv,
  getDeploymentEnvMode,
  isTestingDeployment,
  isProductionDeployment,
} = require("../src/church/blessBoardEnv");
const {
  isPublicDirectoryEnvironment,
  sqlPublicDirectoryEnvironmentFilter,
  isBillableEnvironment,
} = require("../src/church/orgDataEnvironment");
const {
  DEMO_TENANT_CATALOGUE,
  demoTenantPublicHost,
  demoTenantPublicUrl,
  listDemoTenants,
} = require("../src/church/demoTenantCatalogue");
const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const publicChurchDirectoryRepo = require("../src/db/pg/church/publicChurchDirectoryRepo");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const {
  seedAllCatalogueDemoOrganizationsIfMissing,
  seedChurchDemoOrganizationsForDeploymentIfAllowed,
} = require("../src/seeds/seedChurchDemoOrganization");

const ENV_KEYS = [
  "DEPLOYMENT_ENV",
  "NODE_ENV",
  "CHURCH_HOST_DOMAIN",
  "BLESSBOARD_CANONICAL_DOMAIN",
  "BLESSBOARD_APEX_DOMAINS",
  "BLESSBOARD_PUBLIC_URL",
  "DATABASE_URL",
  "GETPRO_DATABASE_URL",
];

function withEnv(overrides, fn) {
  const prev = {};
  for (const key of ENV_KEYS) prev[key] = process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const restore = () => {
    for (const key of ENV_KEYS) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  };
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.finally(restore);
    }
    restore();
    return result;
  } catch (err) {
    restore();
    throw err;
  }
}

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function cleanupOrgs(pool, orgIds) {
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_branch_website_content WHERE organization_id = $1`, [orgId]).catch(
      () => {}
    );
    await pool.query(`DELETE FROM public.church_sermons WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_resources WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_announcements WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_events WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_ministries WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("DEPLOYMENT_ENV mode: testing / production / case / whitespace", () => {
  withEnv({ DEPLOYMENT_ENV: "testing", NODE_ENV: "production" }, () => {
    assert.equal(getDeploymentEnvMode(), "testing");
    assert.equal(isTestingDeployment(), true);
    assert.equal(isProductionDeployment(), false);
    assert.equal(getDeploymentEnv(), "testing");
  });
  withEnv({ DEPLOYMENT_ENV: "production" }, () => {
    assert.equal(getDeploymentEnvMode(), "production");
    assert.equal(isProductionDeployment(), true);
    assert.equal(isTestingDeployment(), false);
  });
  withEnv({ DEPLOYMENT_ENV: "  TESTING  " }, () => {
    assert.equal(getDeploymentEnvMode(), "testing");
    assert.equal(isTestingDeployment(), true);
  });
  withEnv({ DEPLOYMENT_ENV: "Production" }, () => {
    assert.equal(getDeploymentEnvMode(), "production");
  });
});

test("DEPLOYMENT_ENV missing or invalid uses safe production fallback; NODE_ENV does not override", () => {
  withEnv({ DEPLOYMENT_ENV: undefined, NODE_ENV: "development" }, () => {
    assert.equal(getDeploymentEnvMode(), "production");
    assert.equal(isProductionDeployment(), true);
    assert.equal(isTestingDeployment(), false);
  });
  withEnv({ DEPLOYMENT_ENV: "staging", NODE_ENV: "development" }, () => {
    assert.equal(getDeploymentEnvMode(), "production");
    assert.equal(isTestingDeployment(), false);
  });
  withEnv({ DEPLOYMENT_ENV: "testing", NODE_ENV: "production" }, () => {
    assert.equal(isTestingDeployment(), true);
    assert.equal(getDeploymentEnvMode(), "testing");
  });
  withEnv({ DEPLOYMENT_ENV: "production", NODE_ENV: "development" }, () => {
    assert.equal(isProductionDeployment(), true);
    assert.equal(isTestingDeployment(), false);
  });
});

test("demo catalogue and domain generation (no hard-coded cross-TLD)", () => {
  assert.equal(listDemoTenants().length, 2);
  assert.equal(DEMO_TENANT_CATALOGUE[0].slug, "demo");
  assert.equal(DEMO_TENANT_CATALOGUE[1].slug, "demo2");

  withEnv(
    {
      CHURCH_HOST_DOMAIN: "blessboard.org",
      BLESSBOARD_CANONICAL_DOMAIN: "blessboard.org",
      BLESSBOARD_APEX_DOMAINS: "blessboard.org,www.blessboard.org",
    },
    () => {
      assert.equal(demoTenantPublicHost("demo"), "demo.blessboard.org");
      assert.equal(demoTenantPublicHost("demo2"), "demo2.blessboard.org");
      assert.equal(demoTenantPublicUrl("demo", "/"), "https://demo.blessboard.org/");
      assert.doesNotMatch(demoTenantPublicHost("demo"), /\.blessboard\.com$/);
    }
  );

  withEnv(
    {
      CHURCH_HOST_DOMAIN: "blessboard.com",
      BLESSBOARD_CANONICAL_DOMAIN: "blessboard.com",
      BLESSBOARD_APEX_DOMAINS: undefined,
    },
    () => {
      assert.equal(demoTenantPublicHost("demo"), "demo.blessboard.com");
      assert.equal(demoTenantPublicHost("demo2"), "demo2.blessboard.com");
      assert.doesNotMatch(demoTenantPublicHost("demo2"), /\.blessboard\.org$/);
    }
  );
});

test("public directory environment helpers respect DEPLOYMENT_ENV", () => {
  withEnv({ DEPLOYMENT_ENV: "production" }, () => {
    assert.equal(isPublicDirectoryEnvironment("production"), true);
    assert.equal(isPublicDirectoryEnvironment("demo"), false);
    assert.equal(isPublicDirectoryEnvironment("test"), false);
    assert.match(sqlPublicDirectoryEnvironmentFilter("o"), /production.*pilot/);
    assert.doesNotMatch(sqlPublicDirectoryEnvironmentFilter("o"), /'demo'/);
  });
  withEnv({ DEPLOYMENT_ENV: "testing" }, () => {
    assert.equal(isPublicDirectoryEnvironment("demo"), true);
    assert.equal(isPublicDirectoryEnvironment("test"), false);
    assert.match(sqlPublicDirectoryEnvironmentFilter("o"), /'demo'/);
  });
  assert.equal(isBillableEnvironment("demo"), false);
  assert.equal(isBillableEnvironment("test"), false);
});

test(
  "directory/selector visibility: testing shows demos; production hides; real church always visible",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("depvis");
    const orgIds = [];

    try {
      const real = await organizationsRepo.createOrganization(pool, {
        platform_tenant_id: TENANT_ZM,
        slug: `real_${suffix}`.slice(0, 40),
        name: `Real Church ${suffix}`,
        data_environment: "production",
      });
      orgIds.push(real.id);
      await branchesRepo.createBranch(pool, {
        organization_id: real.id,
        slug: `rb_${suffix}`.slice(0, 30),
        host_slug: `rb_${suffix}`.slice(0, 30),
        name: "Real Branch",
        status: "active",
      });

      const demo = await organizationsRepo.createOrganization(pool, {
        platform_tenant_id: TENANT_ZM,
        slug: `demo_vis_${suffix}`.slice(0, 40),
        name: `BlessBoard Demo Vis ${suffix}`,
        data_environment: "demo",
      });
      orgIds.push(demo.id);
      await branchesRepo.createBranch(pool, {
        organization_id: demo.id,
        slug: `db_${suffix}`.slice(0, 30),
        host_slug: `db_${suffix}`.slice(0, 30),
        name: "Demo Branch",
        status: "active",
      });

      const demo2 = await organizationsRepo.createOrganization(pool, {
        platform_tenant_id: TENANT_ZM,
        slug: `demo2_vis_${suffix}`.slice(0, 40),
        name: `BlessBoard Demo2 Vis ${suffix}`,
        data_environment: "demo",
      });
      orgIds.push(demo2.id);
      await branchesRepo.createBranch(pool, {
        organization_id: demo2.id,
        slug: `d2_${suffix}`.slice(0, 30),
        host_slug: `d2_${suffix}`.slice(0, 30),
        name: "Demo2 Branch",
        status: "active",
      });

      await withEnv({ DEPLOYMENT_ENV: "testing" }, async () => {
        const listed = await publicChurchDirectoryRepo.searchPublicOrganizations(pool, {
          q: suffix,
          limit: 50,
        });
        const slugs = listed.items.map((i) => i.slug);
        assert.ok(slugs.includes(real.slug));
        assert.ok(slugs.includes(demo.slug));
        assert.ok(slugs.includes(demo2.slug));

        const foundDemo = await publicChurchDirectoryRepo.findActivePublicOrganizationBySlug(
          pool,
          demo.slug
        );
        assert.ok(foundDemo);
        assert.equal(foundDemo.slug, demo.slug);
      });

      await withEnv({ DEPLOYMENT_ENV: "production" }, async () => {
        const listed = await publicChurchDirectoryRepo.searchPublicOrganizations(pool, {
          q: suffix,
          limit: 50,
        });
        const slugs = listed.items.map((i) => i.slug);
        assert.ok(slugs.includes(real.slug));
        assert.ok(!slugs.includes(demo.slug));
        assert.ok(!slugs.includes(demo2.slug));

        const foundDemo = await publicChurchDirectoryRepo.findActivePublicOrganizationBySlug(
          pool,
          demo.slug
        );
        assert.equal(foundDemo, null);
      });

      // Direct ID manipulation cannot bypass org scoping: wrong org branch open stays null
      await withEnv({ DEPLOYMENT_ENV: "testing" }, async () => {
        const cross = await publicChurchDirectoryRepo.findActivePublicBranchForOrganization(
          pool,
          real.slug,
          `db_${suffix}`.slice(0, 30)
        );
        assert.equal(cross, null);
      });
    } finally {
      await cleanupOrgs(pool, orgIds);
    }
  }
);

test(
  "production deployment does not auto-seed demos; explicit seed is idempotent under testing",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    await withEnv({ DEPLOYMENT_ENV: "production" }, async () => {
      const skipped = await seedChurchDemoOrganizationsForDeploymentIfAllowed(pool);
      assert.equal(skipped.skipped, true);
    });

    // Do not mutate shared demo/demo2 rows in the shared test DB in a destructive way —
    // only verify idempotent second call when testing if rows already exist or seed creates them.
    await withEnv(
      {
        DEPLOYMENT_ENV: "testing",
        CHURCH_HOST_DOMAIN: "blessboard.org",
        BLESSBOARD_CANONICAL_DOMAIN: "blessboard.org",
      },
      async () => {
        const first = await seedAllCatalogueDemoOrganizationsIfMissing(pool);
        assert.equal(first.length, 2);
        const second = await seedAllCatalogueDemoOrganizationsIfMissing(pool);
        assert.equal(second.length, 2);
        assert.equal(first[0].organization.id, second[0].organization.id);
        assert.equal(first[1].organization.id, second[1].organization.id);
        assert.equal(first[0].organization.slug, "demo");
        assert.equal(first[1].organization.slug, "demo2");
        assert.equal(first[0].organization.data_environment, "demo");
        assert.equal(first[1].organization.data_environment, "demo");
      }
    );
  }
);

test("cleanup-kafue-sample refuses production and GETPRO_DATABASE_URL-only", () => {
  const script = path.join(__dirname, "..", "scripts", "cleanup-kafue-sample-seed.js");

  const prod = spawnSync(process.execPath, [script, "--report"], {
    env: {
      ...process.env,
      DEPLOYMENT_ENV: "production",
      DATABASE_URL: "postgres://example.invalid/db",
      GETPRO_DATABASE_URL: undefined,
      NODE_ENV: "test",
      GETPRO_TEST_DB: undefined,
      TEST_DATABASE_URL: undefined,
    },
    encoding: "utf8",
  });
  assert.notEqual(prod.status, 0);
  assert.match(prod.stderr || "", /Refusing|need testing/i);

  const noDb = spawnSync(process.execPath, [script, "--report"], {
    env: {
      ...process.env,
      DEPLOYMENT_ENV: "testing",
      DATABASE_URL: undefined,
      GETPRO_DATABASE_URL: "postgres://should-not-use.invalid/db",
      NODE_ENV: "test",
      GETPRO_TEST_DB: undefined,
      TEST_DATABASE_URL: undefined,
      BLESSBOARD_CANONICAL_DOMAIN: "blessboard.org",
    },
    encoding: "utf8",
  });
  assert.notEqual(noDb.status, 0);
  assert.match(noDb.stderr || "", /DATABASE_URL is required|GETPRO_DATABASE_URL fallback/i);
});

test("seed-demos script refuses production without override", () => {
  const script = path.join(__dirname, "..", "scripts", "seed-blessboard-demo-tenants.js");
  const prod = spawnSync(process.execPath, [script], {
    env: {
      ...process.env,
      DEPLOYMENT_ENV: "production",
      DATABASE_URL: "postgres://example.invalid/db",
      ALLOW_DEMO_SEED_OUTSIDE_TESTING: undefined,
      NODE_ENV: "test",
      GETPRO_TEST_DB: undefined,
    },
    encoding: "utf8",
  });
  assert.notEqual(prod.status, 0);
  assert.match(prod.stderr || "", /Refusing|need testing/i);
});
