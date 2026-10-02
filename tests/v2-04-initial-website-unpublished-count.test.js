"use strict";

/**
 * Initial website unpublished-change count must be 0 after provision.
 * Seeded content is the baseline — not user-authored pending changes.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
  foundationDbUnavailableSkipReason,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  CODE_ORG_STAGING,
} = require("../src/platform/config/deploymentProfiles");
const {
  registerActiveClinicWebsiteTemplate,
  ACTIVECLINIC_TEMPLATE_ID,
  ACTIVECLINIC_TEMPLATE_VERSION,
} = require("../src/activeclinic/website/activeClinicWebsiteTemplate");
const {
  registerBlessBoardWebsiteTemplate,
  BLESSBOARD_TEMPLATE_ID,
  BLESSBOARD_TEMPLATE_VERSION,
} = require("../src/blessboard/website/blessboardChurchTemplate");
const {
  provisionWebsiteInstance,
  starterEntries,
  shouldAlignPublishedBaseline,
} = require("../src/platform/website/provisionService");
const {
  provisionActiveClinicWebsite,
} = require("../src/activeclinic/website/provisionActiveClinicWebsite");
const {
  seedUnpublishedEngineContent,
} = require("../src/blessboard/website/blessboardEngineContentService");
const contentService = require("../src/platform/website/contentService");
const publicationService = require("../src/platform/website/publicationService");
const changeManager = require("../src/platform/website/websiteChangeManagerService");
const versionService = require("../src/platform/website/versionService");
const { PERMISSIONS } = require("../src/platform/website/permissions");
const { PUBLISH_POLICY } = require("../src/platform/website/publishPolicy");
const {
  repairProvisionalPublishedBaseline,
} = require("../src/platform/website/repairProvisionalPublishedBaseline");
const { getWebsiteTemplate } = require("../src/platform/website/templateRegistry");
const {
  buildActiveClinicWebsiteTemplateContent,
} = require("../src/activeclinic/website/activeClinicWebsiteTemplateContent");

let pool = null;
let skipReason = null;
let stamp = 0;

const VIEW_EDIT = [PERMISSIONS.VIEW, PERMISSIONS.EDIT];
const VIEW_EDIT_PUBLISH = [PERMISSIONS.VIEW, PERMISSIONS.EDIT, PERMISSIONS.PUBLISH];

function requireDb(t) {
  if (!pool || skipReason) {
    t.skip(skipReason || "no db");
    return false;
  }
  return true;
}

async function pendingCount(ctx) {
  const summary = await changeManager.getPendingChangeSummary(pool, {
    organizationId: ctx.organizationId,
    instanceId: ctx.instance.id,
    grantedPermissions: VIEW_EDIT,
  });
  assert.equal(summary.ok, true, JSON.stringify(summary));
  return summary.pendingChangeCount;
}

describe("Initial website unpublished change count", () => {
  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = foundationDbUnavailableSkipReason(err && err.message ? err.message : err);
      pool = null;
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("unit: shouldAlignPublishedBaseline defaults true; opt-out explicit", () => {
    assert.equal(shouldAlignPublishedBaseline({}), true);
    assert.equal(shouldAlignPublishedBaseline({ status: "coming_soon" }), true);
    assert.equal(shouldAlignPublishedBaseline({ status: "published" }), true);
    assert.equal(shouldAlignPublishedBaseline({ publishStarter: false }), false);
    assert.equal(shouldAlignPublishedBaseline({ alignPublishedBaseline: false }), false);
  });

  it("A+F: new AC website with seeded images/sections -> 0 unpublished", async (t) => {
    if (!requireDb(t)) return;
    stamp += 1;
    registerActiveClinicWebsiteTemplate();
    const org = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `init_ac_${stamp}`,
      displayName: `Init AC ${stamp}`,
      productKey: "activeclinic",
      productTenantKey: `init-ac-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(org.ok, true, JSON.stringify(org));
    const organizationId = org.records.organization.id;
    const provisioned = await provisionActiveClinicWebsite(pool, {
      organizationId,
      slug: `init-ac-${stamp}`,
      publicName: "Sunrise Clinic",
      status: "coming_soon",
      phone: "+260971234567",
      email: "admin@sunrise.example",
      address: "1 Independence Ave",
    });
    assert.equal(provisioned.ok, true, JSON.stringify(provisioned));
    assert.equal(provisioned.instance.status, "coming_soon");

    const count = await pendingCount({
      organizationId,
      instance: provisioned.instance,
    });
    assert.equal(count, 0, "seeded AC template must not count as unpublished edits");

    const rows = await contentService.listWebsiteContent(
      pool,
      provisioned.instance,
      organizationId
    );
    const cmsPages = rows.find((r) => r.contentKey === "cms.pages");
    assert.ok(cmsPages, "cms.pages seeded");
    assert.ok(cmsPages.draftValue != null, "sections/pages present in draft");
    assert.deepEqual(cmsPages.draftValue, cmsPages.publishedValue);

    const heroImage = rows.find((r) => r.contentKey === "home.hero.image");
    if (heroImage && heroImage.draftValue != null) {
      assert.deepEqual(heroImage.draftValue, heroImage.publishedValue);
    }
  });

  it("B: new BB website engine seed -> 0 unpublished", async (t) => {
    if (!requireDb(t)) return;
    stamp += 1;
    registerBlessBoardWebsiteTemplate();
    const org = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `init_bb_${stamp}`,
      displayName: `Init BB ${stamp}`,
      productKey: "blessboard",
      productTenantKey: `init-bb-${stamp}`,
      deploymentCode: CODE_ORG_STAGING,
    });
    assert.equal(org.ok, true, JSON.stringify(org));
    const organizationId = org.records.organization.id;
    const provisioned = await provisionWebsiteInstance(pool, {
      organizationId,
      templateId: BLESSBOARD_TEMPLATE_ID,
      templateVersion: BLESSBOARD_TEMPLATE_VERSION,
      slug: `init-bb-${stamp}`,
      status: "coming_soon",
      scopeKind: "church_wide",
      publishPolicy: PUBLISH_POLICY.TENANT_PUBLISH,
      seedDefaults: false,
    });
    assert.equal(provisioned.ok, true, JSON.stringify(provisioned));

    // Engine seed used at registration (no church pages required for CMS snapshot path).
    const seeded = await seedUnpublishedEngineContent(pool, {
      organizationId,
      churchId: null,
      slug: `init-bb-${stamp}`,
    });
    // May ok:true even without churchId — CMS snapshot path still runs when instance resolves.
    assert.equal(seeded.ok, true);

    const count = await pendingCount({
      organizationId,
      instance: provisioned.instance,
    });
    assert.equal(count, 0, "BB provisional seed must align baseline");
  });

  it("C+D+E: edit -> positive; revert; publish -> 0", async (t) => {
    if (!requireDb(t)) return;
    stamp += 1;
    registerActiveClinicWebsiteTemplate();
    const org = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `init_edit_${stamp}`,
      displayName: `Init Edit ${stamp}`,
      productKey: "activeclinic",
      productTenantKey: `init-edit-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    const organizationId = org.records.organization.id;
    const provisioned = await provisionWebsiteInstance(pool, {
      organizationId,
      templateId: ACTIVECLINIC_TEMPLATE_ID,
      templateVersion: ACTIVECLINIC_TEMPLATE_VERSION,
      slug: `init-edit-${stamp}`,
      status: "coming_soon",
      publishPolicy: PUBLISH_POLICY.TENANT_PUBLISH,
      contentOverrides: buildActiveClinicWebsiteTemplateContent({
        publicName: "Edit Clinic",
        phone: "+260971110000",
        email: "e@example.com",
        address: "2 Main St",
      }),
    });
    assert.equal(provisioned.ok, true);
    const ctx = { organizationId, instance: provisioned.instance };
    assert.equal(await pendingCount(ctx), 0);

    const saved = await contentService.saveWebsiteDraft(pool, {
      organizationId,
      instanceId: provisioned.instance.id,
      contentKey: "home.hero.title",
      value: "User edited title",
      grantedPermissions: VIEW_EDIT,
    });
    assert.equal(saved.ok, true, JSON.stringify(saved));
    assert.equal(await pendingCount(ctx), 1);

    const reverted = await changeManager.revertFieldToPublished(pool, {
      organizationId,
      instanceId: provisioned.instance.id,
      contentKey: "home.hero.title",
      grantedPermissions: VIEW_EDIT,
    });
    assert.equal(reverted.ok, true, JSON.stringify(reverted));
    assert.equal(reverted.pendingChangeCount, 0);

    await contentService.saveWebsiteDraft(pool, {
      organizationId,
      instanceId: provisioned.instance.id,
      contentKey: "home.hero.title",
      value: "Publish me",
      grantedPermissions: VIEW_EDIT,
    });
    assert.ok((await pendingCount(ctx)) > 0);

    const published = await publicationService.publishWebsiteDraft(pool, {
      organizationId,
      instanceId: provisioned.instance.id,
      grantedPermissions: VIEW_EDIT_PUBLISH,
      actorIdentityId: null,
    });
    assert.equal(published.ok, true, JSON.stringify(published));
    assert.equal(await pendingCount(ctx), 0);
  });

  it("G+H: metadata-only version rows do not inflate; content diffs count", async (t) => {
    if (!requireDb(t)) return;
    stamp += 1;
    registerActiveClinicWebsiteTemplate();
    const org = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `init_meta_${stamp}`,
      displayName: `Init Meta ${stamp}`,
      productKey: "activeclinic",
      productTenantKey: `init-meta-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    const organizationId = org.records.organization.id;
    const provisioned = await provisionWebsiteInstance(pool, {
      organizationId,
      templateId: ACTIVECLINIC_TEMPLATE_ID,
      templateVersion: ACTIVECLINIC_TEMPLATE_VERSION,
      slug: `init-meta-${stamp}`,
      status: "coming_soon",
      publishPolicy: PUBLISH_POLICY.TENANT_PUBLISH,
      contentOverrides: { "home.hero.title": "Meta Clinic" },
    });
    const instance = provisioned.instance;
    assert.equal(await pendingCount({ organizationId, instance }), 0);

    // Version metadata with changeCount noise must not affect live draft-vs-published count.
    await versionService.createWebsiteVersion(pool, {
      instance,
      snapshot: { values: { "home.hero.title": "Meta Clinic" }, visibility: {} },
      submitterIdentityId: null,
      editorIdentityId: null,
      auditActionKey: "website.provision",
      changeCount: 99,
      changedKeys: ["home.hero.title", "fabricated.key"],
    });
    assert.equal(
      await pendingCount({ organizationId, instance }),
      0,
      "version metadata must not create false unpublished count"
    );

    await contentService.saveWebsiteDraft(pool, {
      organizationId,
      instanceId: instance.id,
      contentKey: "home.hero.title",
      value: "Actual content change",
      grantedPermissions: VIEW_EDIT,
    });
    assert.equal(await pendingCount({ organizationId, instance }), 1);
  });

  it("repair path: dry-run then confirm aligns false-dirty provisional seed", async (t) => {
    if (!requireDb(t)) return;
    stamp += 1;
    registerActiveClinicWebsiteTemplate();
    const org = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `init_repair_${stamp}`,
      displayName: `Init Repair ${stamp}`,
      productKey: "activeclinic",
      productTenantKey: `init-repair-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    const organizationId = org.records.organization.id;
    // Reproduce legacy false-dirty seed (opt out of baseline align).
    const provisioned = await provisionWebsiteInstance(pool, {
      organizationId,
      templateId: ACTIVECLINIC_TEMPLATE_ID,
      templateVersion: ACTIVECLINIC_TEMPLATE_VERSION,
      slug: `init-repair-${stamp}`,
      status: "coming_soon",
      publishPolicy: PUBLISH_POLICY.TENANT_PUBLISH,
      alignPublishedBaseline: false,
      publishStarter: false,
      contentOverrides: buildActiveClinicWebsiteTemplateContent({
        publicName: "Repair Clinic",
        phone: "+260971110001",
        email: "r@example.com",
        address: "3 Main St",
      }),
    });
    assert.equal(provisioned.ok, true);
    const instance = provisioned.instance;
    const dirty = await pendingCount({ organizationId, instance });
    assert.ok(dirty > 0, `expected legacy dirty count, got ${dirty}`);

    const dry = await repairProvisionalPublishedBaseline(pool, {
      organizationId,
      instanceId: instance.id,
      dryRun: true,
    });
    assert.equal(dry.ok, true);
    assert.equal(dry.dryRun, true);
    assert.ok(dry.candidateRows > 0);

    const applied = await repairProvisionalPublishedBaseline(pool, {
      organizationId,
      instanceId: instance.id,
      confirm: true,
    });
    assert.equal(applied.ok, true, JSON.stringify(applied));
    assert.ok(applied.repaired > 0);
    assert.equal(applied.pendingChangeCount, 0);
    assert.equal(await pendingCount({ organizationId, instance }), 0);
    assert.equal(instance.status, "coming_soon");
  });

  it("characterization: publishStarter=false still yields 63-style dirty seed", async (t) => {
    if (!requireDb(t)) return;
    stamp += 1;
    registerActiveClinicWebsiteTemplate();
    const template = getWebsiteTemplate(ACTIVECLINIC_TEMPLATE_ID, ACTIVECLINIC_TEMPLATE_VERSION);
    const overrides = buildActiveClinicWebsiteTemplateContent({
      publicName: "Dirty Clinic",
      phone: "+260971110002",
      email: "d@example.com",
      address: "4 Main St",
    });
    const entries = starterEntries(template, overrides, false);
    const org = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `init_char_${stamp}`,
      displayName: `Init Char ${stamp}`,
      productKey: "activeclinic",
      productTenantKey: `init-char-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    const organizationId = org.records.organization.id;
    const provisioned = await provisionWebsiteInstance(pool, {
      organizationId,
      templateId: ACTIVECLINIC_TEMPLATE_ID,
      templateVersion: ACTIVECLINIC_TEMPLATE_VERSION,
      slug: `init-char-${stamp}`,
      status: "coming_soon",
      seedDefaults: false,
      publishPolicy: PUBLISH_POLICY.TENANT_PUBLISH,
    });
    await contentService.seedWebsiteContent(pool, provisioned.instance, entries, null);
    const count = await pendingCount({
      organizationId,
      instance: provisioned.instance,
    });
    assert.equal(count, 63);
  });
});
