"use strict";

/**
 * Shared V7 website-engine contract: schema registry, draft isolation,
 * publish, restore-as-new-draft, unpublish, and tenant scope.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../src/platform/config/deploymentProfiles");
const {
  registerActiveClinicWebsiteTemplate,
  ACTIVECLINIC_TEMPLATE_ID,
  ACTIVECLINIC_TEMPLATE_VERSION,
} = require("../src/activeclinic/website/activeClinicWebsiteTemplate");
const engine = require("../src/platform/website-engine");
const {
  productSchemaRegistry,
  permissionHooks,
  publicationService,
  contentService,
  versionService,
  resolver,
} = require("../src/platform/website-engine");
const { provisionWebsiteInstance } = require("../src/platform/website/provisionService");

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

describe("v7 website engine contract", () => {
  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : "no_foundation_db";
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  it("gates shared editor CSS on BlessBoard website/content admin shells", () => {
    const hq = fs.readFileSync(
      path.join(__dirname, "../views/blessboard/v5/partials/hq-shell-start.ejs"),
      "utf8"
    );
    const branch = fs.readFileSync(
      path.join(__dirname, "../views/blessboard/v5/partials/branch-admin-shell-start.ejs"),
      "utf8"
    );
    for (const src of [hq, branch]) {
      assert.match(src, /loadWebsiteEngineCss/);
      assert.match(src, /website-inline-edit\.css/);
      assert.match(src, /activeNav === 'website' \|\| activeNav === 'content'/);
    }
  });

  it("registers product page types without mixing product identity", () => {
    const ac = productSchemaRegistry.getProductWebsiteSchema("activeclinic");
    const bb = productSchemaRegistry.getProductWebsiteSchema("blessboard");
    assert.ok(ac);
    assert.ok(bb);
    assert.equal(ac.ownershipModel, productSchemaRegistry.OWNERSHIP_MODEL.SINGLE_TENANT_SITE);
    assert.equal(bb.ownershipModel, productSchemaRegistry.OWNERSHIP_MODEL.CHURCH_HQ_AND_BRANCHES);
    assert.deepEqual(
      ac.pages.map((p) => p.key),
      ["home", "about", "services", "doctors", "pricing", "contact", "location", "book"]
    );
    assert.deepEqual(
      bb.pages.map((p) => p.key),
      ["home", "about", "leadership", "ministries", "events", "sermons", "giving", "contact"]
    );
    assert.ok(!String(ac.settingsPath).includes("blessboard"));
    assert.ok(!String(bb.settingsPath).includes("clinic"));
  });

  it("maps product roles onto shared permission hooks", () => {
    const hq = permissionHooks.grantsForProductRole("blessboard", "church_hq_admin");
    const editor = permissionHooks.grantsForProductRole("blessboard", "website_editor");
    const clinicAdmin = permissionHooks.grantsForProductRole(
      "activeclinic",
      "activeclinic_organization_admin"
    );
    assert.equal(permissionHooks.canPublishWebsite(hq), true);
    assert.equal(permissionHooks.canPublishWebsite(editor), false);
    assert.equal(permissionHooks.canEditWebsite(editor), true);
    assert.equal(permissionHooks.canPublishWebsite(clinicAdmin), true);
    assert.equal(permissionHooks.assertWebsiteAction(editor, "publish").ok, false);
    assert.equal(permissionHooks.assertWebsiteAction(hq, "unpublish").ok, true);
  });

  it("exports a single public engine API", () => {
    assert.equal(typeof engine.publicationService.publishWebsiteDraft, "function");
    assert.equal(typeof engine.publicationService.unpublishWebsite, "function");
    assert.equal(typeof engine.versionService.restoreWebsiteVersionToDraft, "function");
    assert.equal(typeof engine.blessboardBridge.publishFromLegacy, "function");
  });

  it("saves drafts without mutating published content, then publishes a version", async () => {
    if (!requireDb()) return;
    const org = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `weng_${Date.now()}`,
      displayName: "Engine Clinic",
      productKey: "activeclinic",
      productTenantKey: `weng-${Date.now()}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(org.ok, true, JSON.stringify(org));
    registerActiveClinicWebsiteTemplate();
    const provisioned = await provisionWebsiteInstance(pool, {
      organizationId: org.records.organization.id,
      templateId: ACTIVECLINIC_TEMPLATE_ID,
      templateVersion: ACTIVECLINIC_TEMPLATE_VERSION,
      slug: `weng-${Date.now()}`,
      status: "coming_soon",
    });
    assert.equal(provisioned.ok, true, JSON.stringify(provisioned));
    const organizationId = org.records.organization.id;
    const instanceId = provisioned.instance.id;

    const saved = await contentService.saveWebsiteDraft(pool, {
      organizationId,
      instanceId,
      contentKey: "home.hero.title",
      value: "Draft title only",
    });
    assert.equal(saved.ok, true, JSON.stringify(saved));
    const liveBefore = await resolver.resolveWebsiteContent(pool, {
      organizationId,
      instance: provisioned.instance,
      mode: resolver.MODE.LIVE,
    });
    const draftBefore = await resolver.resolveWebsiteContent(pool, {
      organizationId,
      instance: provisioned.instance,
      mode: resolver.MODE.DRAFT,
    });
    const liveTitle =
      liveBefore && liveBefore.values && liveBefore.values["home.hero.title"];
    const draftTitle =
      draftBefore && draftBefore.values && draftBefore.values["home.hero.title"];
    assert.notEqual(draftTitle, liveTitle);
    assert.equal(draftTitle, "Draft title only");

    const published = await publicationService.publishWebsiteDraft(pool, {
      organizationId,
      instanceId,
      expectedProductCode: "activeclinic",
      allowEmpty: true,
    });
    assert.equal(published.ok, true, JSON.stringify(published));
    const liveAfter = await resolver.resolveWebsiteContent(pool, {
      organizationId,
      instance: provisioned.instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(liveAfter.values["home.hero.title"], "Draft title only");

    const listed = await versionService.listWebsiteVersions(pool, {
      instanceId,
      organizationId,
    });
    assert.ok((listed.versions || []).length >= 1);
    const first = listed.versions[0];

    await contentService.saveWebsiteDraft(pool, {
      organizationId,
      instanceId,
      contentKey: "home.hero.title",
      value: "Changed after publish",
    });
    const restored = await publicationService.restoreWebsiteVersionToDraft(pool, {
      organizationId,
      instanceId,
      versionId: first.id,
    });
    assert.equal(restored.ok, true, JSON.stringify(restored));
    assert.equal(restored.publishedUnchanged, true);
    const liveRestored = await resolver.resolveWebsiteContent(pool, {
      organizationId,
      instance: provisioned.instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(liveRestored.values["home.hero.title"], "Draft title only");

    const otherOrg = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `wengb_${Date.now()}`,
      displayName: "Other Clinic",
      productKey: "activeclinic",
      productTenantKey: `wengb-${Date.now()}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    const crossed = await publicationService.publishWebsiteDraft(pool, {
      organizationId: otherOrg.records.organization.id,
      instanceId,
      expectedProductCode: "activeclinic",
    });
    assert.equal(crossed.ok, false);

    const unpublished = await publicationService.unpublishWebsite(pool, {
      organizationId,
      instanceId,
      expectedProductCode: "activeclinic",
      grantedPermissions: ["website.publish"],
      syncProductAvailability: false,
    });
    assert.equal(unpublished.ok, true, JSON.stringify(unpublished));
    const stillLive = await resolver.resolveWebsiteContent(pool, {
      organizationId,
      instance: provisioned.instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(stillLive.values["home.hero.title"], "Draft title only");
  });
});
