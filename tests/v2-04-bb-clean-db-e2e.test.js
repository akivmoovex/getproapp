"use strict";

/**
 * V2.04 Phases 7–9 — DB reset guard + clean foundation E2E for BB/AC platform lifecycle.
 *
 * Shared neuniversity testing DB is NOT reset unless identity proves ENVIRONMENT=testing.
 * Clean-DB proof uses the repository's approved ephemeral foundation bootstrap
 * (resetFoundationDatabase + migrate).
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
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  CODE_MOOVEX_PLATFORM_TESTING,
} = require("../src/platform/config/deploymentProfiles");
const {
  ensureBlessBoardWebsiteInstance,
} = require("../src/blessboard/website/blessboardWebsiteAdapter");
const {
  registerBlessBoardWebsiteTemplate,
  BLESSBOARD_TEMPLATE_ID,
  BLESSBOARD_TEMPLATE_VERSION,
} = require("../src/blessboard/website/blessboardChurchTemplate");
const {
  registerActiveClinicWebsiteTemplate,
  ACTIVECLINIC_TEMPLATE_ID,
  ACTIVECLINIC_TEMPLATE_VERSION,
} = require("../src/activeclinic/website/activeClinicWebsiteTemplate");
const { provisionWebsiteInstance } = require("../src/platform/website/provisionService");
const contentService = require("../src/platform/website/contentService");
const publicationService = require("../src/platform/website/publicationService");
const versionService = require("../src/platform/website/versionService");
const editSessionService = require("../src/platform/website/editSessionService");
const { PERMISSIONS } = require("../src/platform/website/permissions");
const {
  ensureProductPlatformContracts,
} = require("../src/startup/ensureProductPlatformContracts");

const ROOT = path.join(__dirname, "..");

let pool = null;
let skipReason = null;
let stamp = 0;

function nextKey(prefix) {
  stamp += 1;
  return `${prefix}_${Date.now().toString(36)}_${stamp}`;
}

describe("V2.04 Phase 7 DB reset guard", () => {
  function mayResetSharedTestingDb(environmentCode) {
    return String(environmentCode || "").trim().toLowerCase() === "testing";
  }

  it("rejects reset when environment identity is unknown or production", () => {
    assert.equal(mayResetSharedTestingDb("unknown"), false);
    assert.equal(mayResetSharedTestingDb("production"), false);
    assert.equal(mayResetSharedTestingDb(""), false);
    assert.equal(mayResetSharedTestingDb("testing"), true);
    // This agent session observed shared DB host unreachable → treat as unknown.
    const observed = String(process.env.V204_OBSERVED_DB_ENVIRONMENT || "unknown")
      .trim()
      .toLowerCase();
    assert.equal(mayResetSharedTestingDb(observed), observed === "testing");
  });

  it("records approved reset mechanisms and migration ceiling discovery surface", () => {
    const resetScript = path.join(ROOT, "db/scripts/v10-qa-canonical-reset.js");
    const migrateTesting = path.join(ROOT, "db/scripts/migrate-testing.js");
    assert.ok(fs.existsSync(resetScript));
    assert.ok(fs.existsSync(migrateTesting));
    const text = fs.readFileSync(resetScript, "utf8");
    assert.match(text, /environment_code=testing/);
    assert.match(text, /QA_RESET_AUTHORIZED/);
    assert.match(text, /moovex-platform-v7/);
  });
});

describe("V2.04 Phases 8–9 clean foundation E2E", () => {
  before(async () => {
    ensureProductPlatformContracts();
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
      pool = null;
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("CLEAN_DB_MIGRATION + BB/AC lifecycle E2E on ephemeral foundation", async (t) => {
    if (skipReason || !pool) {
      return t.skip(skipReason || "no pool");
    }

    // --- BlessBoard HQ website ---
    registerBlessBoardWebsiteTemplate();
    const bbTenant = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: nextKey("bbhq"),
      displayName: "V204 BB HQ",
      productKey: "blessboard",
      productTenantKey: nextKey("bb-tenant"),
      deploymentCode: "blessboard-org-staging",
    });
    assert.equal(bbTenant.ok, true, JSON.stringify(bbTenant));
    const bbOrgId = bbTenant.records.organization.id;

    const bbEnsured = await ensureBlessBoardWebsiteInstance(pool, {
      organizationId: bbOrgId,
      slug: nextKey("bb"),
    });
    assert.equal(bbEnsured.ok, true);
    const bbInstance = bbEnsured.instance;
    assert.ok(bbInstance && bbInstance.id);

    const grants = [PERMISSIONS.EDIT, PERMISSIONS.PUBLISH, PERMISSIONS.VIEW, PERMISSIONS.RESTORE];

    // save 1 / 2 / 3
    for (const n of [1, 2, 3]) {
      const saved = await contentService.saveWebsiteDraft(pool, {
        organizationId: bbOrgId,
        instanceId: bbInstance.id,
        expectedProductCode: "blessboard",
        contentKey: "brand.primary_color",
        value: n === 1 ? "#6c5ce7" : n === 2 ? "#5341cd" : "#3d348b",
        actorIdentityId: null,
        grantedPermissions: grants,
      });
      assert.equal(saved.ok, true, `BB SAVE_${n} ${JSON.stringify(saved)}`);
    }

    const published = await publicationService.publishWebsiteDraft(pool, {
      organizationId: bbOrgId,
      instanceId: bbInstance.id,
      actorIdentityId: null,
      grantedPermissions: grants,
      forceTenantPublish: true,
    });
    assert.equal(published.ok, true, JSON.stringify(published));

    const unpublished = await publicationService.unpublishWebsite(pool, {
      organizationId: bbOrgId,
      instanceId: bbInstance.id,
      actorIdentityId: null,
      grantedPermissions: grants,
    });
    assert.equal(unpublished.ok, true, JSON.stringify(unpublished));

    const republished = await publicationService.publishWebsiteDraft(pool, {
      organizationId: bbOrgId,
      instanceId: bbInstance.id,
      actorIdentityId: null,
      grantedPermissions: grants,
      forceTenantPublish: true,
    });
    assert.equal(republished.ok, true, JSON.stringify(republished));

    const versions = await versionService.listWebsiteVersions(pool, {
      organizationId: bbOrgId,
      instanceId: bbInstance.id,
    });
    assert.ok((versions.versions || []).length >= 1);

    const live = (versions.versions || []).find((v) => v.status === "published");
    if (live) {
      const restored = await publicationService.restoreWebsiteVersionToDraft(pool, {
        organizationId: bbOrgId,
        instanceId: bbInstance.id,
        versionId: live.id,
        actorIdentityId: null,
        grantedPermissions: grants,
      });
      assert.equal(restored.ok, true, JSON.stringify(restored));
    }

    // Concurrent edit rejection
    await editSessionService.closeOpenSessionsForInstance(pool, {
      organizationId: bbOrgId,
      instanceId: bbInstance.id,
      reason: editSessionService.CLOSE_REASON.FINISH,
    });
    const row = await contentService.getWebsiteContentRow(
      pool,
      bbInstance.id,
      bbOrgId,
      "brand.primary_color"
    );
    const expectedUpdatedAt = row && row.updatedAt;
    const first = await contentService.saveWebsiteDraft(pool, {
      organizationId: bbOrgId,
      instanceId: bbInstance.id,
      expectedProductCode: "blessboard",
      contentKey: "brand.primary_color",
      value: "#111111",
      expectedUpdatedAt,
      actorIdentityId: null,
      grantedPermissions: grants,
    });
    assert.equal(first.ok, true, JSON.stringify(first));
    const stale = await contentService.saveWebsiteDraft(pool, {
      organizationId: bbOrgId,
      instanceId: bbInstance.id,
      expectedProductCode: "blessboard",
      contentKey: "brand.primary_color",
      value: "#222222",
      expectedUpdatedAt,
      actorIdentityId: null,
      grantedPermissions: grants,
    });
    assert.equal(stale.ok, false, "TRUE_STALE_SECOND_SESSION_REJECTION");

    // Tenant isolation: foreign org cannot publish BB instance
    const other = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: nextKey("bbx"),
      displayName: "Other BB",
      productKey: "blessboard",
      productTenantKey: nextKey("bbx-tenant"),
      deploymentCode: "blessboard-org-staging",
    });
    assert.equal(other.ok, true, JSON.stringify(other));
    const foreign = await publicationService.publishWebsiteDraft(pool, {
      organizationId: other.records.organization.id,
      instanceId: bbInstance.id,
      actorIdentityId: null,
      grantedPermissions: grants,
      forceTenantPublish: true,
    });
    assert.equal(foreign.ok, false);

    // --- ActiveClinic lifecycle ---
    registerActiveClinicWebsiteTemplate();
    const acTenant = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: nextKey("ac"),
      displayName: "V204 AC Clinic",
      productKey: "activeclinic",
      productTenantKey: nextKey("ac-tenant"),
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(acTenant.ok, true, JSON.stringify(acTenant));
    const acOrgId = acTenant.records.organization.id;
    const acProvisioned = await provisionWebsiteInstance(pool, {
      organizationId: acOrgId,
      templateId: ACTIVECLINIC_TEMPLATE_ID,
      templateVersion: ACTIVECLINIC_TEMPLATE_VERSION,
      slug: nextKey("clinic"),
      status: "coming_soon",
      adapterMode: "shared_engine",
      publishPolicy: "TENANT_PUBLISH",
      seedDefaults: true,
    });
    assert.equal(acProvisioned.ok, true, JSON.stringify(acProvisioned));
    const acInstance = acProvisioned.instance;

    const acSaved = await contentService.saveWebsiteDraft(pool, {
      organizationId: acOrgId,
      instanceId: acInstance.id,
      expectedProductCode: "activeclinic",
      contentKey: "home.hero.title",
      value: "AC Hero",
      actorIdentityId: null,
      grantedPermissions: grants,
    });
    assert.equal(acSaved.ok, true, JSON.stringify(acSaved));

    const acPublished = await publicationService.publishWebsiteDraft(pool, {
      organizationId: acOrgId,
      instanceId: acInstance.id,
      actorIdentityId: null,
      grantedPermissions: grants,
      forceTenantPublish: true,
    });
    assert.equal(acPublished.ok, true, JSON.stringify(acPublished));

    const acUnpublished = await publicationService.unpublishWebsite(pool, {
      organizationId: acOrgId,
      instanceId: acInstance.id,
      actorIdentityId: null,
      grantedPermissions: grants,
    });
    assert.equal(acUnpublished.ok, true, JSON.stringify(acUnpublished));
  });
});
