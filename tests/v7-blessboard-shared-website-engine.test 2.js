"use strict";

/**
 * BlessBoard uses the shared V7 website engine for draft/publish/version
 * while keeping church/branch public_pages as the product content store.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const {
  publishChurchWebsite,
  unpublishChurchWebsite,
  acknowledgeWebsitePreview,
} = require("../src/blessboard/services/churchWebsitePublishService");
const { SNAPSHOT_KEY } = require("../src/platform/website-engine/productSchemaRegistry");
const contentService = require("../src/platform/website/contentService");
const instanceRepo = require("../src/platform/website/instanceRepository");
const { ADAPTER_MODE } = require("../src/platform/website/productWebsiteDefaults");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";

let pool;
let skipReason = null;

function requireDb() {
  if (skipReason) {
    // eslint-disable-next-line no-console
    console.log("skip:", skipReason);
    return false;
  }
  return true;
}

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

async function provisionChurch() {
  const key = uniq("bbeng");
  const row = await appRepo.createApplication(pool, {
    church_name: `Engine ${key}`,
    country: "Zambia",
    city: "Lusaka",
    contact_name: "Site Admin",
    contact_email: `${key}@example.org`,
    contact_phone: `+26097${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
    selected_plan: "foundation",
    consent_terms: true,
    branch_name: "Main Campus",
  });
  const result = await provisionRegisteredBlessBoardChurch(pool, {
    applicationId: row.id,
    administratorPassword: PASSWORD,
    requestId: `req-${key}`,
    actorContext: {
      type: "test",
      source: "unit",
      dataEnvironment: "testing",
      deploymentCode: "blessboard-org-staging",
    },
  });
  assert.equal(result.ok, true, result.message || result.status);
  return result.records;
}

describe("v7 BlessBoard shared website engine", () => {
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
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : "no_foundation_db";
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  it("registers churches onto the shared website engine", async () => {
    if (!requireDb()) return;
    const rec = await provisionChurch();
    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: rec.organizationId,
      productCode: "blessboard",
      scopeRef: null,
    });
    assert.ok(instance, "website instance missing");
    assert.equal(instance.adapterMode, ADAPTER_MODE.SHARED_ENGINE);
    assert.equal(instance.status, "coming_soon");
    assert.equal(instance.publishPolicy, "TENANT_PUBLISH");
    const row = await contentService.getWebsiteContentRow(
      pool,
      instance.id,
      rec.organizationId,
      SNAPSHOT_KEY
    );
    assert.ok(row, "cms.snapshot missing");
    assert.ok(row.draftValue, "draft snapshot missing");
    const fields = await pool.query(
      `SELECT count(*)::int AS n
         FROM platform.website_content
        WHERE instance_id = $1 AND content_key <> $2`,
      [instance.id, SNAPSHOT_KEY]
    );
    assert.ok(fields.rows[0].n > 0, "engine field keys missing");
    const settings = await pool.query(
      `SELECT website_status FROM blessboard.church_settings WHERE church_id = $1`,
      [rec.churchId]
    );
    assert.equal(settings.rows[0].website_status, "draft");
  });

  it("HQ publish writes an engine version and unpublish preserves snapshot", async () => {
    if (!requireDb()) return;
    const rec = await provisionChurch();
    await acknowledgeWebsitePreview(pool, {
      organizationId: rec.organizationId,
      actorUserId: rec.administratorUserId,
    });
    const pagesBefore = await pool.query(
      `SELECT count(*)::int AS n FROM blessboard.public_pages WHERE church_id = $1`,
      [rec.churchId]
    );
    const published = await publishChurchWebsite(pool, {
      churchId: rec.churchId,
      actorUserId: rec.administratorUserId,
      deferServiceTimes: true,
      confirmPublish: true,
    });
    assert.equal(published.ok, true, JSON.stringify(published));
    const pagesAfter = await pool.query(
      `SELECT count(*)::int AS n FROM blessboard.public_pages WHERE church_id = $1`,
      [rec.churchId]
    );
    assert.equal(pagesAfter.rows[0].n, pagesBefore.rows[0].n);

    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: rec.organizationId,
      productCode: "blessboard",
      scopeRef: null,
    });
    const versions = await pool.query(
      `SELECT count(*)::int AS n FROM platform.website_versions WHERE instance_id = $1`,
      [instance.id]
    );
    assert.ok(versions.rows[0].n >= 1, "shared engine version missing");

    const unpublished = await unpublishChurchWebsite(pool, {
      churchId: rec.churchId,
      actorUserId: rec.administratorUserId,
    });
    assert.equal(unpublished.ok, true, JSON.stringify(unpublished));
    const row = await contentService.getWebsiteContentRow(
      pool,
      instance.id,
      rec.organizationId,
      SNAPSHOT_KEY
    );
    assert.ok(row && row.publishedValue);
  });
});
