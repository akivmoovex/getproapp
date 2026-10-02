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

    // Invariant 4/5: unpublish takes the site offline without deleting history.
    const historyAfterUnpublish = await versionService.listWebsiteVersions(pool, {
      instanceId,
      organizationId,
    });
    assert.ok((historyAfterUnpublish.versions || []).length >= 1);
    const stillPresent = (historyAfterUnpublish.versions || []).find((v) => v.id === first.id);
    assert.ok(stillPresent, "published version must survive unpublish");
    assert.deepEqual(stillPresent.snapshotJson, first.snapshotJson);
  });

  it("routes lifecycle actions through the engine orchestrator", () => {
    const orchestrator = engine.lifecycleOrchestrator;
    assert.equal(typeof engine.publishProductWebsite, "function");
    assert.equal(typeof engine.unpublishProductWebsite, "function");

    // Both products must resolve a registered publish handler.
    for (const productCode of ["blessboard", "activeclinic"]) {
      const lifecycle = orchestrator.resolveProductLifecycle(productCode);
      assert.equal(typeof lifecycle.publish, "function", productCode);
      assert.equal(typeof lifecycle.unpublish, "function", productCode);
    }

    // Lower-level primitives are still exported, but not as the lifecycle entry.
    assert.notEqual(engine.publishProductWebsite, engine.publicationService.publishWebsiteDraft);
  });

  it("refuses lifecycle actions without shared publish permission", async () => {
    const orchestrator = engine.lifecycleOrchestrator;
    let handlerCalls = 0;
    orchestrator.registerProductLifecycle("contract_probe", {
      publish: async () => {
        handlerCalls += 1;
        return { ok: true };
      },
    });

    const denied = await orchestrator.publishWebsite(null, {
      productCode: "contract_probe",
      grantedPermissions: ["website.edit"],
      request: {},
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.stage, orchestrator.STAGE.PERMISSION);
    assert.equal(denied.reason, "forbidden");
    assert.equal(handlerCalls, 0, "product handler must not run when permission fails");

    const allowed = await orchestrator.publishWebsite(null, {
      productCode: "contract_probe",
      grantedPermissions: ["website.publish"],
      request: {},
    });
    assert.equal(allowed.ok, true);
    assert.equal(allowed.engineOrchestrated, true);
    assert.equal(handlerCalls, 1);

    const missing = await orchestrator.unpublishWebsite(null, {
      productCode: "contract_probe",
      grantedPermissions: ["website.publish"],
      request: {},
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.stage, orchestrator.STAGE.PRODUCT);
  });

  it("blocks classic BlessBoard CMS writes from mutating published rows", async () => {
    const contentAdmin = require("../src/blessboard/services/publicContentAdminService");

    const publishedSection = {
      id: "11111111-1111-4111-8111-111111111111",
      status: "published",
      heading: "Live heading",
      bodyText: "Live body",
      mediaUrl: null,
      sortOrder: 10,
      sectionType: "hero",
    };

    // Pure guard: content change on a live row is a published mutation.
    assert.equal(
      contentAdmin.mutatesPublishedContent(
        publishedSection,
        { heading: "Edited heading" },
        contentAdmin.SECTION_PUBLIC_FIELDS
      ),
      true
    );
    // Status-only transitions are publication, not editing.
    assert.equal(
      contentAdmin.mutatesPublishedContent(
        publishedSection,
        { heading: "Live heading" },
        contentAdmin.SECTION_PUBLIC_FIELDS
      ),
      false
    );
    // Draft rows stay freely editable.
    assert.equal(
      contentAdmin.mutatesPublishedContent(
        { ...publishedSection, status: "draft" },
        { heading: "Edited heading" },
        contentAdmin.SECTION_PUBLIC_FIELDS
      ),
      false
    );

    let writes = 0;
    const fakeDb = {
      query: async (sql) => {
        const text = String(sql);
        if (/^\s*SELECT/i.test(text)) {
          return { rows: [{ ...publishedSection, section_key: "hero", page_id: "p" }] };
        }
        writes += 1;
        return { rows: [] };
      },
    };
    // findSectionById maps DB rows; stub it so the guard is what we exercise.
    const repo = require("../src/blessboard/repositories/publicContentRepository");
    const originalFind = repo.findSectionById;
    repo.findSectionById = async () => publishedSection;
    try {
      // An editor-form write (enforcePublishConfirm) is refused outright.
      const blocked = await contentAdmin.updatePageSection(fakeDb, publishedSection.id, {
        heading: "Edited heading",
        enforcePublishConfirm: true,
      });
      assert.equal(blocked.ok, false);
      assert.equal(blocked.status, contentAdmin.STATUS.PUBLISHED_LOCKED);
      assert.equal(blocked.reason, "published_requires_draft");
      assert.equal(writes, 0, "no write may reach a published row");

      // Provisioning / publish projection writes stay allowed.
      const seeded = await contentAdmin.updatePageSection(fakeDb, publishedSection.id, {
        heading: "Edited heading",
        enforcePublishConfirm: true,
        allowPublishedWrite: true,
      });
      assert.notEqual(seeded.status, contentAdmin.STATUS.PUBLISHED_LOCKED);
      assert.equal(contentAdmin.isEditorFormWrite({ enforcePublishConfirm: true }), true);
      assert.equal(
        contentAdmin.isEditorFormWrite({ enforcePublishConfirm: true, allowPublishedWrite: true }),
        false
      );
      assert.equal(contentAdmin.isEditorFormWrite({}), false);
    } finally {
      repo.findSectionById = originalFind;
    }
  });

  it("keeps the classic section and entity forms on a draft-first path", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/blessboard/http/contentAdminRoutes.js"),
      "utf8"
    );
    assert.match(src, /routePublishedSectionEditToDraft/);
    assert.match(src, /routePublishedEntityEditToDraft/);
    assert.match(src, /saveInlineFieldDraft/);
    assert.match(src, /saveStructuredDraft/);
    assert.match(src, /published_requires_draft/);
    // Phase 3: media and ordering edits are draft-routed, not refused.
    assert.match(src, /media_alt_text/);
    assert.match(src, /draftKind: "page_section"/);
    assert.match(src, /op: "reorder"/);
    assert.match(src, /intendedSectionOrder/);
    assert.match(src, /intendedEntityOrder/);
    assert.doesNotMatch(
      src,
      /Image, layout and ordering changes must be made/,
      "media and ordering edits must no longer be refused outright"
    );
  });

  it("blocks classic entity form writes to published items", async () => {
    const contentAdmin = require("../src/blessboard/services/publicContentAdminService");
    const repo = require("../src/blessboard/repositories/publicContentRepository");

    const publishedLeader = {
      id: "22222222-2222-4222-8222-222222222222",
      status: "published",
      displayName: "Pastor Live",
      roleTitle: "Senior Pastor",
      biography: null,
      imageUrl: null,
      sortOrder: 1,
    };

    let writes = 0;
    const fakeDb = {
      query: async (sql) => {
        if (/^\s*SELECT/i.test(String(sql))) return { rows: [] };
        writes += 1;
        return { rows: [] };
      },
    };
    const originalFind = repo.findLeaderById;
    repo.findLeaderById = async () => publishedLeader;
    try {
      const blocked = await contentAdmin.updateLeader(fakeDb, publishedLeader.id, {
        displayName: "Pastor Edited",
        roleTitle: "Senior Pastor",
        enforcePublishConfirm: true,
      });
      assert.equal(blocked.ok, false);
      assert.equal(blocked.status, contentAdmin.STATUS.PUBLISHED_LOCKED);
      assert.equal(blocked.reason, "published_requires_draft");
      assert.equal(writes, 0, "no write may reach a published entity");

      // Status-only republish is still a publication, not an edit.
      const statusOnly = await contentAdmin.updateLeader(fakeDb, publishedLeader.id, {
        displayName: "Pastor Live",
        roleTitle: "Senior Pastor",
        status: "published",
        confirmPublish: "1",
        enforcePublishConfirm: true,
      });
      assert.notEqual(statusOnly.status, contentAdmin.STATUS.PUBLISHED_LOCKED);
    } finally {
      repo.findLeaderById = originalFind;
    }
  });

  it("exposes an explicit, non-destructive BlessBoard backfill entry point", () => {
    const backfill = require("../src/platform/website-engine/blessboardBackfillService");
    assert.equal(typeof backfill.backfillBlessBoardWebsiteVersions, "function");
    assert.equal(typeof backfill.backfillOneSite, "function");
    assert.equal(backfill.MIGRATION_ORIGIN, "website_engine_backfill_v7_phase2");

    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../package.json"), "utf8")
    );
    assert.equal(
      pkg.scripts["blessboard:website-engine:backfill"],
      "node db/scripts/blessboard-website-engine-backfill.js"
    );

    const script = fs.readFileSync(
      path.join(__dirname, "../db/scripts/blessboard-website-engine-backfill.js"),
      "utf8"
    );
    assert.match(script, /ALLOW_PRODUCTION_BACKFILL/);

    // Neither the command nor its service may write the public projection or
    // flip publication state.
    const service = fs.readFileSync(
      path.join(__dirname, "../src/platform/website-engine/blessboardBackfillService.js"),
      "utf8"
    );
    for (const src of [script, service]) {
      assert.doesNotMatch(src, /(INSERT INTO|UPDATE|DELETE FROM)\s+blessboard\./i);
      assert.doesNotMatch(src, /website_status\s*=\s*'/i);
    }
  });
});
