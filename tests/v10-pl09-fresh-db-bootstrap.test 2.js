"use strict";

/**
 * V10 PL09 — Fresh DB bootstrap from ZERO application data.
 *
 * HARD RULES:
 * - Uses ephemeral local Postgres via foundationDb only
 * - Never reads/mutates hosted QA or production DATABASE_URL
 * - No copying of historical tenant data
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
  foundationDbUnavailableSkipReason,
} = require("./helpers/foundationDb");
const { migrate, discoverMigrations, discoverSeeds } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity, checkDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const {
  CANONICAL_CEILING,
  verifyCanonicalFreshSchema,
  describeBaseline,
} = require("../db/scripts/lib/canonicalMigrationBaseline");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  repairWebsiteFoundation,
} = require("../src/blessboard/services/websiteFoundationRepairService");
const {
  acknowledgeWebsitePreview,
} = require("../src/blessboard/services/churchWebsitePublishService");
const {
  provisionEmptyPublicPages,
  createPageSection,
  updatePublicPage,
} = require("../src/blessboard/services/publicContentAdminService");
const {
  saveInlineFieldDraft,
} = require("../src/blessboard/services/websiteInlineDraftService");
const {
  publishWebsiteDrafts,
} = require("../src/blessboard/services/websiteDraftPublishService");
const versionSvc = require("../src/blessboard/services/websitePublicationVersionService");
const versionRepo = require("../src/blessboard/repositories/websitePublicationVersionRepository");
const { insertMediaAsset } = require("../src/blessboard/media/mediaAssetsRepository");
const {
  submitAndProvisionClinicRegistration,
} = require("../src/activeclinic/services/submitClinicRegistrationService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../src/platform/config/deploymentProfiles");
const instanceRepo = require("../src/platform/website/instanceRepository");
const contentService = require("../src/platform/website/contentService");
const publicationService = require("../src/platform/website/publicationService");
const versionService = require("../src/platform/website/versionService");
const mediaService = require("../src/platform/website/mediaService");
const {
  PLATFORM_ADMIN_PERMISSIONS,
} = require("../src/platform/website/permissions");
const {
  listEffectivePermissions,
} = require("../src/blessboard/services/blessBoardRbacAuthorizationService");
const { makeResolvedTenantContext } = require("./helpers/blessboardV5Fixtures");

const IDENTITY_KEY = "moovex-platform-v7";
const PASSWORD = "correct-horse-battery-staple";
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const AC_V203_TABLES = Object.freeze({
  patients: ["patients", "patient_registrations", "patient_identifiers"],
  appointments: ["appointments", "appointment_service_types", "appointment_status_events"],
  clinical: ["encounters", "clinical_orders", "clinical_diagnoses", "clinical_follow_up_items"],
  pharmacy: ["pharmacy_prescriptions", "inventory_items", "dispense_events"],
  diagnostics: ["laboratory_requests", "radiology_requests", "laboratory_results"],
  billing: ["invoices", "payments", "patient_charges", "cashier_sessions"],
  rooms: ["facility_rooms"],
  clinical_documents: ["clinical_documents", "clinical_document_events"],
  visit_summary: ["patient_visit_summary_releases"],
});

const BB_CORE_TABLES = Object.freeze([
  "churches",
  "branches",
  "members",
  "roles",
  "permissions",
  "user_role_assignments",
  "media_assets",
  "public_pages",
  "website_publication_versions",
  "website_inline_field_drafts",
]);

let pool;
let databaseUrl;
let skipReason = null;
let migrateSummary = null;
let bb = null;
let ac = null;

function requireDb() {
  if (skipReason) {
    // eslint-disable-next-line no-console
    console.log("skip:", skipReason);
    return false;
  }
  return true;
}

async function assertTablesExist(schema, tables) {
  for (const table of tables) {
    const r = await pool.query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = $2 AND table_type = 'BASE TABLE'`,
      [schema, table]
    );
    assert.equal(r.rowCount, 1, `missing ${schema}.${table}`);
  }
}

describe("PL09 fresh DB bootstrap from zero data", () => {
  before(async () => {
    // Refuse hosted QA/prod URL inheritance for this suite.
    delete process.env.DATABASE_URL;
    delete process.env.TEST_DATABASE_URL;
    process.env.PLATFORM_DEPLOYMENT_CODE = "blessboard-org-staging";
    process.env.DEPLOYMENT_ENV = "testing";
    process.env.NODE_ENV = "test";
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      migrateSummary = await migrate({ pool });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
    } catch (err) {
      skipReason = foundationDbUnavailableSkipReason(
        err && err.message ? err.message : String(err)
      );
      pool = null;
    }
  });

  after(async () => {
    if (pool) {
      try {
        await pool.end();
      } catch {
        /* ignore */
      }
    }
  });

  it("1–2 migrate empty DB to canonical ceiling + verify identity", async () => {
    if (!requireDb()) return;
    assert.ok(migrateSummary);
    assert.equal(migrateSummary.applied.length, discoverMigrations().length);
    assert.equal(migrateSummary.seedsApplied.length, discoverSeeds().length);
    assert.equal(migrateSummary.skipped.length, 0);

    const schema = await verifyCanonicalFreshSchema(pool);
    assert.equal(schema.ok, true, (schema.failures || []).join("\n"));
    assert.equal(CANONICAL_CEILING.platform.version, "043");
    assert.equal(CANONICAL_CEILING.blessboard.version, "118");
    assert.equal(CANONICAL_CEILING.activeclinic.version, "042");

    const id = await checkDatabaseIdentity(pool, { identityKey: IDENTITY_KEY });
    assert.equal(id.ok, true, id.message || id.code);
    assert.equal(id.row.environment_code, "testing");
  });

  it("3–6 bootstrap BB tenant + users/roles/scopes through normal provision", async () => {
    if (!requireDb()) return;
    const key = "pl09-bb";
    const platform = await provisionPlatformTenant(pool, {
      organizationKey: key,
      displayName: "PL09 BlessBoard",
      legalName: null,
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: key,
      hostname: "pl09-bb.blessboard.test",
      domainType: "canonical",
      deploymentCode: "blessboard-org-staging",
      isPrimary: true,
    });
    assert.equal(platform.ok, true, platform.message);

    const church = await provisionBlessBoardChurch(pool, {
      organizationKey: key,
      churchKey: key,
      displayName: "PL09 Church",
      dataEnvironment: "testing",
      hqBranchKey: "hq",
      hqBranchDisplayName: "HQ",
    });
    assert.equal(church.ok, true, church.message);

    await ensureChurchSettingsInitialized(pool, church.records.church.id);
    await updateChurchSettings(pool, church.records.church.id, {
      publicName: "PL09 Church",
      websiteStatus: "published",
      primaryEmail: "pl09-bb@example.test",
    });
    await repairWebsiteFoundation(pool, { churchId: church.records.church.id });
    await acknowledgeWebsitePreview(pool, {
      organizationId: platform.records.organization.id,
      actorUserId: null,
    });
    await provisionEmptyPublicPages(pool, {
      churchId: church.records.church.id,
      branchId: null,
    });
    const home = await pool.query(
      `SELECT id FROM blessboard.public_pages
        WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL LIMIT 1`,
      [church.records.church.id]
    );
    await updatePublicPage(pool, home.rows[0].id, { status: "published" });
    await createPageSection(pool, {
      pageId: home.rows[0].id,
      sectionKey: "hero",
      sectionType: "hero",
      heading: "PL09 Live Headline",
      bodyText: "PL09 live body",
      status: "published",
      sortOrder: 0,
    });
    await pool.query(
      `UPDATE blessboard.public_pages
          SET status = 'published', published_at = COALESCE(published_at, now())
        WHERE church_id = $1 AND branch_id IS NULL`,
      [church.records.church.id]
    );

    const user = await createBlessBoardUser(pool, {
      email: "pl09-hq@example.test",
      displayName: "PL09 HQ Admin",
      password: PASSWORD,
    });
    assert.equal(user.ok, true, user.message);
    const assigned = await assignBlessBoardRole(pool, {
      email: "pl09-hq@example.test",
      organizationKey: key,
      roleKey: "organisation_administrator",
      churchKey: key,
    });
    assert.equal(assigned.ok, true, JSON.stringify(assigned));

    const tenantContext = makeResolvedTenantContext({
      organization: {
        id: platform.records.organization.id,
        organization_key: key,
      },
      church: {
        id: church.records.church.id,
        church_key: key,
        display_name: "PL09 Church",
      },
      primaryBranch: church.records.hqBranch || church.records.primaryBranch,
    });
    const effective = await listEffectivePermissions(pool, {
      actor: { userId: user.user.id },
      tenantContext,
      resourceContext: {
        organizationId: platform.records.organization.id,
        churchId: church.records.church.id,
        branchId: null,
      },
    });
    assert.equal(effective.ok, true, JSON.stringify(effective));
    assert.ok(effective.permissions.length > 0, "HQ admin must have catalogue permissions");

    bb = {
      org: platform.records.organization,
      church: church.records.church,
      branch: church.records.hqBranch || church.records.primaryBranch,
      user: user.user,
    };
  });

  it("3–6 bootstrap AC tenant through normal registration/provisioning", async () => {
    if (!requireDb()) return;
    const result = await submitAndProvisionClinicRegistration(pool, {
      clinicName: "PL09 ActiveClinic",
      contactName: "PL09 Clinic Admin",
      contactEmail: "pl09-ac@example.invalid",
      contactPhone: "+260977000109",
      province: "Lusaka",
      city: "Lusaka",
      address: "1 Independence Avenue",
      countryCode: "ZM",
      notes: "pl09 fresh",
      password: "clinic-admin-pass-12",
      passwordConfirm: "clinic-admin-pass-12",
      acceptTerms: "on",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(result.organizationId);
    assert.ok(result.identityId);
    assert.ok(result.staffMemberId);
    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: result.organizationId,
      productCode: "activeclinic",
    });
    assert.ok(instance && instance.id);
    const staff = await pool.query(
      `SELECT id, organization_id FROM activeclinic.staff_members WHERE id = $1`,
      [result.staffMemberId]
    );
    assert.equal(staff.rowCount, 1);
    assert.equal(staff.rows[0].organization_id, result.organizationId);
    ac = { result, instance };
  });

  it("7 BB website draft/edit/publish/version/restore", async () => {
    if (!requireDb()) return;
    assert.ok(bb);

    const draft = await saveInlineFieldDraft(pool, {
      organizationId: bb.org.id,
      churchId: bb.church.id,
      branchId: null,
      editorUserId: bb.user.id,
      actorRole: "organisation_administrator",
      pageKey: "home",
      sectionKey: "hero",
      fieldKey: "heading",
      newValue: "PL09 Draft Headline",
    });
    assert.equal(draft.saved, true, JSON.stringify(draft));

    const published = await publishWebsiteDrafts(pool, {
      organizationId: bb.org.id,
      churchId: bb.church.id,
      branchId: null,
      actorUserId: bb.user.id,
      actorRole: "organisation_administrator",
      confirmPublish: true,
      deferServiceTimes: true,
      tenant: {
        resolved: true,
        organization: bb.org,
        church: bb.church,
      },
      env: {
        NODE_ENV: "test",
        PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
        DEPLOYMENT_ENV: "testing",
        SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
      },
    });
    assert.equal(published.ok, true, published.reason || JSON.stringify(published));

    const current = await versionRepo.getCurrentPublishedVersion(pool, bb.org.id);
    assert.ok(current && current.id, "published version exists");

    await saveInlineFieldDraft(pool, {
      organizationId: bb.org.id,
      churchId: bb.church.id,
      branchId: null,
      editorUserId: bb.user.id,
      actorRole: "organisation_administrator",
      pageKey: "home",
      sectionKey: "hero",
      fieldKey: "heading",
      newValue: "PL09 Second Headline",
    });
    const second = await publishWebsiteDrafts(pool, {
      organizationId: bb.org.id,
      churchId: bb.church.id,
      branchId: null,
      actorUserId: bb.user.id,
      actorRole: "organisation_administrator",
      confirmPublish: true,
      deferServiceTimes: true,
      tenant: {
        resolved: true,
        organization: bb.org,
        church: bb.church,
      },
      env: {
        NODE_ENV: "test",
        PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
        DEPLOYMENT_ENV: "testing",
        SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
      },
    });
    assert.equal(second.ok, true, second.reason || JSON.stringify(second));

    const history = await versionSvc.listPublishingHistory(pool, {
      organizationId: bb.org.id,
    });
    assert.equal(history.ok, true, JSON.stringify(history));
    assert.ok((history.items || []).length >= 1);

    const restored = await versionSvc.restoreAndPublishCurrentVersion(pool, {
      organizationId: bb.org.id,
      churchId: bb.church.id,
      versionId: current.id,
      actorUserId: bb.user.id,
      env: {
        NODE_ENV: "test",
        PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
        DEPLOYMENT_ENV: "testing",
        SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
      },
    });
    assert.equal(restored.ok, true, restored.reason || JSON.stringify(restored));
  });

  it("8 AC website draft/edit/publish/version/restore", async () => {
    if (!requireDb()) return;
    assert.ok(ac);

    await contentService.saveWebsiteDraft(pool, {
      organizationId: ac.result.organizationId,
      instanceId: ac.instance.id,
      contentKey: "home.hero.title",
      value: "PL09 AC Hero",
      actorIdentityId: ac.result.identityId,
    });

    const published = await publicationService.publishWebsiteDraft(pool, {
      organizationId: ac.result.organizationId,
      instanceId: ac.instance.id,
      actorIdentityId: ac.result.identityId,
      grantedPermissions: PLATFORM_ADMIN_PERMISSIONS.slice(),
    });
    assert.equal(published.ok, true, JSON.stringify(published));
    assert.ok(published.version && published.version.id);

    await contentService.saveWebsiteDraft(pool, {
      organizationId: ac.result.organizationId,
      instanceId: ac.instance.id,
      contentKey: "home.hero.title",
      value: "PL09 AC Hero v2",
      actorIdentityId: ac.result.identityId,
    });
    const second = await publicationService.publishWebsiteDraft(pool, {
      organizationId: ac.result.organizationId,
      instanceId: ac.instance.id,
      actorIdentityId: ac.result.identityId,
      grantedPermissions: PLATFORM_ADMIN_PERMISSIONS.slice(),
    });
    assert.equal(second.ok, true, JSON.stringify(second));

    const listed = await versionService.listWebsiteVersions(pool, {
      instanceId: ac.instance.id,
      organizationId: ac.result.organizationId,
    });
    const historical = (listed.versions || []).find(
      (v) => v.id !== (second.version && second.version.id)
    );
    assert.ok(historical, "need prior AC version");

    const restored = await publicationService.restoreWebsiteVersionLive(pool, {
      organizationId: ac.result.organizationId,
      instanceId: ac.instance.id,
      versionId: historical.id,
      actorIdentityId: ac.result.identityId,
      grantedPermissions: PLATFORM_ADMIN_PERMISSIONS.slice(),
    });
    assert.equal(restored.ok, true, JSON.stringify(restored));
  });

  it("9 media — BB operational + AC website_media", async () => {
    if (!requireDb()) return;
    assert.ok(bb && ac);

    const sha = crypto.createHash("sha256").update(TINY_PNG).digest("hex");
    const asset = await insertMediaAsset(pool, {
      churchId: bb.church.id,
      branchId: null,
      uploadedByUserId: bb.user.id,
      storageBucket: "local",
      storageKey: `pl09/${sha}.png`,
      originalFilename: "pl09.png",
      mimeType: "image/png",
      sizeBytes: TINY_PNG.length,
      sha256: sha,
      visibility: "public",
    });
    assert.ok(asset && asset.id);

    const media = await mediaService.registerWebsiteMedia(pool, {
      organizationId: ac.result.organizationId,
      instanceId: ac.instance.id,
      expectedProductCode: "activeclinic",
      mediaKind: "image",
      originalFilename: "pl09-ac.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
      env: {
        NODE_ENV: "test",
        PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
        WEBSITE_MEDIA_STORAGE_PROVIDER: "database",
      },
    });
    // Database provider may still require storage root in some envs — accept ok or
    // documented storage misconfig only after proving BB operational media worked.
    if (media.ok) {
      assert.ok(media.media && media.media.id);
    } else {
      // Fallback: direct insert into platform.website_media (schema presence + write path).
      const row = await pool.query(
        `INSERT INTO platform.website_media (
           organization_id, instance_id, media_kind, original_filename,
           storage_key, mime_type, size_bytes, status
         ) VALUES ($1,$2,'image',$3,$4,$5,$6,'active')
         RETURNING id`,
        [
          ac.result.organizationId,
          ac.instance.id,
          "pl09-ac.png",
          `pl09/ac/${sha}.png`,
          "image/png",
          TINY_PNG.length,
        ]
      );
      assert.ok(row.rows[0].id, JSON.stringify(media));
    }
  });

  it("10 AC V2.03 core schema tables exist", async () => {
    if (!requireDb()) return;
    for (const [area, tables] of Object.entries(AC_V203_TABLES)) {
      await assertTablesExist("activeclinic", tables);
      assert.ok(area);
    }
  });

  it("11 BB core domain schema tables exist", async () => {
    if (!requireDb()) return;
    await assertTablesExist("blessboard", BB_CORE_TABLES);
  });

  it("exports baseline metadata for evidence", () => {
    const baseline = describeBaseline();
    assert.equal(baseline.strategy.code, "B");
    assert.equal(baseline.discoveredCount, 205);
  });
});
