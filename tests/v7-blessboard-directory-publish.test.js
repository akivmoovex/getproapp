"use strict";

/**
 * BlessBoard: published public site must appear in apex directory.
 *
 * Regression for primary-branch HQ publish leaving church_settings.website_status
 * as draft while engine versions + /c/:key are live.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const {
  baseV5TestEnv,
  V5_IDENTITY_KEY,
  V5_DEPLOYMENT_CODE,
} = require("./helpers/blessboardV5Fixtures");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  publishChurchWebsite,
} = require("../src/blessboard/services/churchWebsitePublishService");
const {
  seedTenantOwnedWebsiteTemplateContent,
} = require("../src/blessboard/services/seedTenantWebsiteTemplateContent");
const directoryRepo = require("../src/blessboard/repositories/publicChurchDirectoryRepository");
const {
  sqlPublicDirectoryProductionDemoNameExclusion,
} = require("../src/church/orgDataEnvironment");
const {
  BLESSBOARD_TEMPLATE_ID,
  BLESSBOARD_TEMPLATE_VERSION,
} = require("../src/blessboard/website/blessboardChurchTemplate");

const APEX = "blessboard.org";

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

describe("BlessBoard directory publish eligibility", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let prevDeploymentEnv;

  before(async () => {
    prevDeploymentEnv = process.env.DEPLOYMENT_ENV;
    process.env.DEPLOYMENT_ENV = "testing";
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: V5_IDENTITY_KEY,
        environmentCode: "testing",
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (prevDeploymentEnv === undefined) delete process.env.DEPLOYMENT_ENV;
    else process.env.DEPLOYMENT_ENV = prevDeploymentEnv;
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  async function provisionChurch({ key, displayName, dataEnvironment = "testing" }) {
    const orgKey = uniq(key);
    const prov = await provisionPlatformTenant(pool, {
      organizationKey: orgKey,
      displayName,
      legalName: null,
      dataEnvironment,
      productKey: "blessboard",
      productTenantKey: orgKey,
      hostname: `${orgKey}.example.test`,
      domainType: "canonical",
      deploymentCode: V5_DEPLOYMENT_CODE,
      isPrimary: true,
    });
    assert.equal(prov.ok, true, JSON.stringify(prov));
    const ch = await provisionBlessBoardChurch(pool, {
      organizationKey: orgKey,
      churchKey: orgKey,
      displayName,
      dataEnvironment,
      hqBranchKey: "hq",
      hqBranchDisplayName: `${displayName} HQ`,
    });
    assert.equal(ch.ok, true, JSON.stringify(ch));
    await ensureChurchSettingsInitialized(pool, ch.records.church.id);
    await updateChurchSettings(pool, ch.records.church.id, {
      publicName: displayName,
      websiteStatus: "draft",
      primaryEmail: `${orgKey}@example.test`,
    });
    await seedTenantOwnedWebsiteTemplateContent(pool, {
      churchId: ch.records.church.id,
      publicName: displayName,
      primaryEmail: `${orgKey}@example.test`,
      city: "Lusaka",
    });
    const branch = await pool.query(
      `SELECT id, is_primary, branch_key
         FROM blessboard.branches
        WHERE church_id = $1 AND status = 'active'
        ORDER BY is_primary DESC, created_at ASC
        LIMIT 1`,
      [ch.records.church.id]
    );
    return {
      orgKey,
      organizationId: ch.records.organization.id,
      churchId: ch.records.church.id,
      branchId: branch.rows[0].id,
      displayName,
    };
  }

  async function insertPublishedEngineVersion({ organizationId, orgKey, lifecycleStatus = "provisional" }) {
    let instanceId = null;
    const existing = await pool.query(
      `SELECT id FROM platform.website_instances
        WHERE organization_id = $1 AND product_code = 'blessboard'
        ORDER BY created_at ASC
        LIMIT 1`,
      [organizationId]
    );
    if (existing.rows[0]) {
      instanceId = existing.rows[0].id;
      await pool.query(
        `UPDATE platform.website_instances
            SET status = 'coming_soon',
                lifecycle_status = $2,
                updated_at = now()
          WHERE id = $1`,
        [instanceId, lifecycleStatus]
      );
    } else {
      const instance = await pool.query(
        `INSERT INTO platform.website_instances
           (organization_id, product_code, template_id, template_version, slug, status,
            lifecycle_status, publish_policy, adapter_mode, scope_kind)
         VALUES ($1, 'blessboard', $2, $3, $4, 'coming_soon', $5, 'TENANT_PUBLISH',
                 'shared_engine', 'church_wide')
         RETURNING id`,
        [
          organizationId,
          BLESSBOARD_TEMPLATE_ID,
          BLESSBOARD_TEMPLATE_VERSION,
          orgKey,
          lifecycleStatus,
        ]
      );
      instanceId = instance.rows[0].id;
    }
    await pool.query(
      `UPDATE platform.website_versions
          SET status = 'superseded'
        WHERE instance_id = $1 AND status = 'published'`,
      [instanceId]
    );
    const maxVer = await pool.query(
      `SELECT COALESCE(MAX(version_number), 0)::int AS n
         FROM platform.website_versions WHERE instance_id = $1`,
      [instanceId]
    );
    await pool.query(
      `INSERT INTO platform.website_versions
         (organization_id, instance_id, version_number, status, published_at, snapshot_json, source_policy)
       VALUES ($1, $2, $3, 'published', now(), '{}'::jsonb, 'TENANT_PUBLISH')`,
      [organizationId, instanceId, Number(maxVer.rows[0].n) + 1]
    );
    return instanceId;
  }

  it("primary-branch publish marks church published and lists in directory", async () => {
    requireDb();
    const church = await provisionChurch({
      key: "dir-pub-primary",
      displayName: "Directory Publish Primary Church",
    });

    const before = await directoryRepo.searchPublicOrganizations(pool, {
      q: church.displayName,
      env: { DEPLOYMENT_ENV: "testing" },
    });
    assert.equal(before.total, 0);

    const published = await publishChurchWebsite(pool, {
      churchId: church.churchId,
      organizationId: church.organizationId,
      branchId: church.branchId,
      confirmPublish: true,
      deferServiceTimes: true,
      mobilePreviewConfirmed: true,
      relaxPreviewRequirement: true,
      forcePublishVersion: true,
      env: { DEPLOYMENT_ENV: "testing", NODE_ENV: "test" },
    });
    assert.equal(published.ok, true, JSON.stringify(published));

    const settings = await pool.query(
      `SELECT website_status FROM blessboard.church_settings WHERE church_id = $1`,
      [church.churchId]
    );
    assert.equal(settings.rows[0].website_status, "published");

    const after = await directoryRepo.searchPublicOrganizations(pool, {
      q: church.displayName,
      env: { DEPLOYMENT_ENV: "testing" },
    });
    assert.ok(after.total >= 1);
    assert.ok(after.items.some((item) => item.slug === church.orgKey));

    const app = createV5FoundationApp({
      env: baseV5TestEnv({
        BLESSBOARD_TENANT_ROUTING_MODE: "off",
        DEPLOYMENT_ENV: "testing",
      }),
      getPool: () => pool,
    });
    const res = await request(app)
      .get(`/directory?q=${encodeURIComponent(church.displayName)}`)
      .set("Host", APEX);
    assert.equal(res.status, 200);
    assert.match(res.text, /Directory Publish Primary Church/);
  });

  it("engine-published draft settings still directory-eligible on testing", async () => {
    requireDb();
    const church = await provisionChurch({
      key: "dir-engine-draft",
      displayName: "Engine Draft Listed Church",
    });

    // Simulate historical drift: published engine version, website_status still draft.
    await updateChurchSettings(pool, church.churchId, {
      publicName: church.displayName,
      websiteStatus: "draft",
      primaryEmail: `${church.orgKey}@example.test`,
    });
    await insertPublishedEngineVersion({
      organizationId: church.organizationId,
      orgKey: church.orgKey,
    });

    const listed = await directoryRepo.searchPublicOrganizations(pool, {
      q: church.displayName,
      env: { DEPLOYMENT_ENV: "testing", NODE_ENV: "production" },
    });
    assert.ok(listed.items.some((item) => item.slug === church.orgKey));
  });

  it("suspended churches stay hidden even with published engine versions", async () => {
    requireDb();
    const church = await provisionChurch({
      key: "dir-suspended",
      displayName: "Suspended Hidden Church",
    });
    await updateChurchSettings(pool, church.churchId, {
      publicName: church.displayName,
      websiteStatus: "suspended",
      primaryEmail: `${church.orgKey}@example.test`,
    });
    await insertPublishedEngineVersion({
      organizationId: church.organizationId,
      orgKey: church.orgKey,
      lifecycleStatus: "suspended",
    });

    const listed = await directoryRepo.searchPublicOrganizations(pool, {
      q: church.displayName,
      env: { DEPLOYMENT_ENV: "testing" },
    });
    assert.equal(listed.items.some((item) => item.slug === church.orgKey), false);
  });

  it("production demo-name exclusion remains production-only", () => {
    assert.equal(
      sqlPublicDirectoryProductionDemoNameExclusion({ DEPLOYMENT_ENV: "testing" }),
      "TRUE"
    );
    assert.match(
      sqlPublicDirectoryProductionDemoNameExclusion({ DEPLOYMENT_ENV: "production" }),
      /NOT \(/i
    );
  });
});
