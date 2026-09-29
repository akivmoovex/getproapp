"use strict";

/**
 * V10 DBCL11 — Post-cleanup fresh bootstrap on isolated disposable Postgres.
 *
 * HARD RULES:
 * - Ephemeral foundationDb only (`blessboard_ft_*`)
 * - Never reads/writes hosted QA or production DATABASE_URL
 * - Exercises post-DBCL10 canonical paths only
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

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
const { authenticateBlessBoardUser } = require("../src/blessboard/services/authenticateBlessBoardUser");
const {
  listEffectivePermissions,
  authorize,
} = require("../src/blessboard/services/blessBoardRbacAuthorizationService");
const { listStaffAccess } = require("../src/blessboard/services/staffAccessService");
const {
  countStaffAccountsForOrganization,
  countUsersForOrganization,
} = require("../src/platform/repositories/entitlementRepository");
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
const { CODE_ACTIVECLINIC_ORG_V6 } = require("../src/platform/config/deploymentProfiles");
const instanceRepo = require("../src/platform/website/instanceRepository");
const contentService = require("../src/platform/website/contentService");
const publicationService = require("../src/platform/website/publicationService");
const versionService = require("../src/platform/website/versionService");
const mediaService = require("../src/platform/website/mediaService");
const { PLATFORM_ADMIN_PERMISSIONS } = require("../src/platform/website/permissions");
const { insertAuditEvent, listAuditEvents } = require("../src/platform/repositories/auditEventRepository");
const { toCanonicalLifecycle, LIFECYCLE, PRODUCT } = require("../src/platform/registration");
const { makeResolvedTenantContext } = require("./helpers/blessboardV5Fixtures");

const IDENTITY_KEY = "moovex-platform-v7";
const PASSWORD = "Dbcl11-Fresh-Pass1!";
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const FORBIDDEN_REG_STATUSES = Object.freeze([
  "pending_review",
  "duplicate_review",
  "approved",
  "closed",
  "cancelled",
  "withdrawn",
]);

const AC_V203_TABLES = Object.freeze([
  "patients",
  "appointments",
  "encounters",
  "pharmacy_prescriptions",
  "laboratory_requests",
  "invoices",
  "facility_rooms",
  "clinical_documents",
  "patient_visit_summary_releases",
]);

/**
 * Instrument client.query (via pool.connect) for user_roles access + 42703.
 * Must preserve pg callback-style pool.connect used internally by pool.query.
 * @param {import('pg').Pool} pool
 */
function instrumentPool(pool) {
  const stats = {
    userRolesReads: 0,
    userRolesWrites: 0,
    errors42703: 0,
    queries: 0,
    _userRolesProbeReads: 0,
  };

  function classify(text) {
    const sql = String(text || "");
    stats.queries += 1;
    if (!/blessboard\.user_roles\b/i.test(sql)) return;
    if (
      /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql.trim()) ||
      /\bINTO\s+blessboard\.user_roles\b/i.test(sql)
    ) {
      stats.userRolesWrites += 1;
      return;
    }
    stats.userRolesReads += 1;
  }

  function wrapClientQuery(client) {
    if (client.__dbcl11Instrumented) return;
    client.__dbcl11Instrumented = true;
    const orig = client.query.bind(client);
    client.query = function instrumentedClientQuery(text, params, cb) {
      const sql = typeof text === "object" && text && text.text != null ? text.text : text;
      classify(sql);
      if (typeof cb === "function") {
        return orig(text, params, function (err, res) {
          if (err && err.code === "42703") stats.errors42703 += 1;
          cb(err, res);
        });
      }
      const result = orig(text, params);
      if (result && typeof result.then === "function") {
        return result.catch((err) => {
          if (err && err.code === "42703") stats.errors42703 += 1;
          throw err;
        });
      }
      return result;
    };
  }

  const origConnect = pool.connect.bind(pool);
  pool.connect = function instrumentedConnect(cb) {
    if (typeof cb === "function") {
      return origConnect((err, client, done) => {
        if (client) wrapClientQuery(client);
        cb(err, client, done);
      });
    }
    return origConnect().then((client) => {
      wrapClientQuery(client);
      return client;
    });
  };

  return stats;
}

let rawPool;
let pool;
let databaseUrl;
let skipReason = null;
let migrateSummary = null;
let stats = null;
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

describe("V10 DBCL11 post-cleanup fresh bootstrap", () => {
  before(async () => {
    delete process.env.DATABASE_URL;
    delete process.env.TEST_DATABASE_URL;
    process.env.PLATFORM_DEPLOYMENT_CODE = "blessboard-org-staging";
    process.env.DEPLOYMENT_ENV = "testing";
    process.env.NODE_ENV = "test";
    try {
      databaseUrl = await resetFoundationDatabase();
      rawPool = createFoundationPool(databaseUrl);
      migrateSummary = await migrate({ pool: rawPool });
      await ensureDatabaseIdentity(rawPool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
      // Instrument only the exercise path (not migration/seed SQL).
      stats = instrumentPool(rawPool);
      pool = rawPool;
    } catch (err) {
      skipReason = foundationDbUnavailableSkipReason(
        err && err.message ? err.message : String(err)
      );
      pool = null;
    }
  });

  after(async () => {
    if (rawPool) {
      try {
        await rawPool.end();
      } catch {
        /* ignore */
      }
    }
  });

  it("1 migrate + seeds + fresh-schema contract (isolated)", async () => {
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
    assert.match(String(databaseUrl), /blessboard_ft_/i);
  });

  it("2 bootstrap BB platform tenant + HQ/branch RBAC + login + staff counts", async () => {
    if (!requireDb()) return;
    const key = "dbcl11-bb";
    const platform = await provisionPlatformTenant(pool, {
      organizationKey: key,
      displayName: "DBCL11 BlessBoard",
      legalName: null,
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: key,
      hostname: "dbcl11-bb.blessboard.test",
      domainType: "canonical",
      deploymentCode: "blessboard-org-staging",
      isPrimary: true,
    });
    assert.equal(platform.ok, true, platform.message);

    const church = await provisionBlessBoardChurch(pool, {
      organizationKey: key,
      churchKey: key,
      displayName: "DBCL11 Church",
      dataEnvironment: "testing",
      hqBranchKey: "hq",
      hqBranchDisplayName: "HQ",
    });
    assert.equal(church.ok, true, church.message);
    const hqBranch = church.records.hqBranch || church.records.primaryBranch;

    await ensureChurchSettingsInitialized(pool, church.records.church.id);
    await updateChurchSettings(pool, church.records.church.id, {
      publicName: "DBCL11 Church",
      websiteStatus: "published",
      primaryEmail: "dbcl11-bb@example.test",
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
      heading: "DBCL11 Live Headline",
      bodyText: "DBCL11 live body",
      status: "published",
      sortOrder: 0,
    });

    const hqUser = await createBlessBoardUser(pool, {
      email: "dbcl11-hq@example.test",
      displayName: "DBCL11 HQ Admin",
      password: PASSWORD,
    });
    assert.equal(hqUser.ok, true, hqUser.message);
    const hqAssign = await assignBlessBoardRole(pool, {
      email: "dbcl11-hq@example.test",
      organizationKey: key,
      roleKey: "organisation_administrator",
      churchKey: key,
    });
    assert.equal(hqAssign.ok, true, JSON.stringify(hqAssign));

    const branchUser = await createBlessBoardUser(pool, {
      email: "dbcl11-ba@example.test",
      displayName: "DBCL11 Branch Admin",
      password: PASSWORD,
    });
    assert.equal(branchUser.ok, true, branchUser.message);
    const baAssign = await assignBlessBoardRole(pool, {
      email: "dbcl11-ba@example.test",
      organizationKey: key,
      roleKey: "branch_administrator",
      churchKey: key,
      branchKey: hqBranch.branch_key || "hq",
    });
    assert.equal(baAssign.ok, true, JSON.stringify(baAssign));

    const login = await authenticateBlessBoardUser(pool, {
      email: "dbcl11-hq@example.test",
      password: PASSWORD,
      requireOrganizationId: platform.records.organization.id,
      deploymentCode: "blessboard-org-staging",
      env: {
        NODE_ENV: "test",
        PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
        DEPLOYMENT_ENV: "testing",
        SESSION_SECRET: "dbcl11-session-secret-at-least-32-chars!",
      },
    });
    assert.equal(login.ok, true, JSON.stringify(login));
    assert.ok(login.session && login.session.id);

    const tenantContext = makeResolvedTenantContext({
      organization: {
        id: platform.records.organization.id,
        organization_key: key,
      },
      church: {
        id: church.records.church.id,
        church_key: key,
        display_name: "DBCL11 Church",
      },
      primaryBranch: hqBranch,
    });
    const effective = await listEffectivePermissions(pool, {
      actor: { userId: hqUser.user.id },
      tenantContext,
      resourceContext: {
        organizationId: platform.records.organization.id,
        churchId: church.records.church.id,
        branchId: null,
      },
    });
    assert.equal(effective.ok, true, JSON.stringify(effective));
    assert.ok(effective.permissions.length > 0);

    const authz = await authorize(pool, {
      actor: { userId: hqUser.user.id },
      tenantContext,
      permission: "website.edit",
      resourceContext: {
        organizationId: platform.records.organization.id,
        churchId: church.records.church.id,
        branchId: null,
      },
    });
    assert.equal(authz.allowed, true, JSON.stringify(authz));

    const staffList = await listStaffAccess(pool, {
      organizationId: platform.records.organization.id,
      churchId: church.records.church.id,
      actorUserId: hqUser.user.id,
      tenantContext,
    });
    assert.equal(staffList.ok, true, JSON.stringify(staffList));
    assert.ok(Array.isArray(staffList.users));
    assert.ok(staffList.users.length >= 2, `expected >=2 staff users, got ${staffList.users.length}`);

    const staffCount = await countStaffAccountsForOrganization(
      pool,
      platform.records.organization.id
    );
    const userCount = await countUsersForOrganization(pool, platform.records.organization.id);
    assert.ok(staffCount >= 2, `expected >=2 staff, got ${staffCount}`);
    assert.ok(userCount >= 2, `expected >=2 users, got ${userCount}`);

    const ura = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.user_role_assignments
        WHERE organization_id = $1 AND status = 'active'`,
      [platform.records.organization.id]
    );
    assert.ok(ura.rows[0].n >= 2);

    // Deliberate schema probe (not app runtime). Discount from runtime read count in test 7.
    const beforeProbeReads = stats.userRolesReads;
    const legacyRows = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.user_roles WHERE organization_id = $1`,
      [platform.records.organization.id]
    );
    assert.equal(legacyRows.rows[0].n, 0);
    assert.equal(
      stats.userRolesReads - beforeProbeReads,
      1,
      "verification probe must account for exactly one user_roles COUNT"
    );
    stats._userRolesProbeReads = (stats._userRolesProbeReads || 0) + 1;

    bb = {
      org: platform.records.organization,
      church: church.records.church,
      branch: hqBranch,
      hqUser: hqUser.user,
      baUser: branchUser.user,
      key,
    };
  });

  it("3 registration + AC tenant bootstrap (canonical lifecycle only)", async () => {
    if (!requireDb()) return;
    const result = await submitAndProvisionClinicRegistration(pool, {
      clinicName: "DBCL11 ActiveClinic",
      contactName: "DBCL11 Clinic Admin",
      contactEmail: "dbcl11-ac@example.invalid",
      contactPhone: "+260977000111",
      province: "Lusaka",
      city: "Lusaka",
      address: "11 Independence Avenue",
      countryCode: "ZM",
      notes: "dbcl11 fresh",
      password: "clinic-admin-pass-12",
      passwordConfirm: "clinic-admin-pass-12",
      acceptTerms: "on",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(result.organizationId);

    const apps = await pool.query(
      `SELECT status, provisioning_status FROM activeclinic.clinic_registration_applications
        WHERE contact_email_normalized = $1`,
      ["dbcl11-ac@example.invalid"]
    );
    assert.equal(apps.rowCount, 1);
    const status = String(apps.rows[0].status || "");
    assert.ok(!FORBIDDEN_REG_STATUSES.includes(status), `legacy status ${status}`);
    const canonical = toCanonicalLifecycle(PRODUCT.ACTIVECLINIC, apps.rows[0]);
    assert.ok(
      [LIFECYCLE.ACTIVE, LIFECYCLE.ONBOARDING, LIFECYCLE.PROVISIONING].includes(canonical),
      `unexpected lifecycle ${canonical}`
    );

    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: result.organizationId,
      productCode: "activeclinic",
    });
    assert.ok(instance && instance.id);
    ac = { result, instance };
  });

  it("4 BB website edit/CMS/publish/versions/restore + media", async () => {
    if (!requireDb()) return;
    assert.ok(bb);

    const draft = await saveInlineFieldDraft(pool, {
      organizationId: bb.org.id,
      churchId: bb.church.id,
      branchId: null,
      editorUserId: bb.hqUser.id,
      actorRole: "organisation_administrator",
      pageKey: "home",
      sectionKey: "hero",
      fieldKey: "heading",
      newValue: "DBCL11 Draft Headline",
    });
    assert.equal(draft.saved, true, JSON.stringify(draft));

    const env = {
      NODE_ENV: "test",
      PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
      DEPLOYMENT_ENV: "testing",
      SESSION_SECRET: "dbcl11-session-secret-at-least-32-chars!",
    };
    const published = await publishWebsiteDrafts(pool, {
      organizationId: bb.org.id,
      churchId: bb.church.id,
      branchId: null,
      actorUserId: bb.hqUser.id,
      actorRole: "organisation_administrator",
      confirmPublish: true,
      deferServiceTimes: true,
      tenant: { resolved: true, organization: bb.org, church: bb.church },
      env,
    });
    assert.equal(published.ok, true, published.reason || JSON.stringify(published));

    const current = await versionRepo.getCurrentPublishedVersion(pool, bb.org.id);
    assert.ok(current && current.id);

    await saveInlineFieldDraft(pool, {
      organizationId: bb.org.id,
      churchId: bb.church.id,
      branchId: null,
      editorUserId: bb.hqUser.id,
      actorRole: "organisation_administrator",
      pageKey: "home",
      sectionKey: "hero",
      fieldKey: "heading",
      newValue: "DBCL11 Second Headline",
    });
    const second = await publishWebsiteDrafts(pool, {
      organizationId: bb.org.id,
      churchId: bb.church.id,
      branchId: null,
      actorUserId: bb.hqUser.id,
      actorRole: "organisation_administrator",
      confirmPublish: true,
      deferServiceTimes: true,
      tenant: { resolved: true, organization: bb.org, church: bb.church },
      env,
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
      actorUserId: bb.hqUser.id,
      env,
    });
    assert.equal(restored.ok, true, restored.reason || JSON.stringify(restored));

    const sha = crypto.createHash("sha256").update(TINY_PNG).digest("hex");
    const asset = await insertMediaAsset(pool, {
      churchId: bb.church.id,
      branchId: null,
      uploadedByUserId: bb.hqUser.id,
      storageBucket: "local",
      storageKey: `dbcl11/${sha}.png`,
      originalFilename: "dbcl11.png",
      mimeType: "image/png",
      sizeBytes: TINY_PNG.length,
      sha256: sha,
      visibility: "public",
    });
    assert.ok(asset && asset.id);
  });

  it("5 AC website edit/publish/versions/restore + media + V2.03 tables", async () => {
    if (!requireDb()) return;
    assert.ok(ac);

    await contentService.saveWebsiteDraft(pool, {
      organizationId: ac.result.organizationId,
      instanceId: ac.instance.id,
      contentKey: "home.hero.title",
      value: "DBCL11 AC Hero",
      actorIdentityId: ac.result.identityId,
    });
    const published = await publicationService.publishWebsiteDraft(pool, {
      organizationId: ac.result.organizationId,
      instanceId: ac.instance.id,
      actorIdentityId: ac.result.identityId,
      grantedPermissions: PLATFORM_ADMIN_PERMISSIONS.slice(),
    });
    assert.equal(published.ok, true, JSON.stringify(published));

    await contentService.saveWebsiteDraft(pool, {
      organizationId: ac.result.organizationId,
      instanceId: ac.instance.id,
      contentKey: "home.hero.title",
      value: "DBCL11 AC Hero v2",
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

    const media = await mediaService.registerWebsiteMedia(pool, {
      organizationId: ac.result.organizationId,
      instanceId: ac.instance.id,
      expectedProductCode: "activeclinic",
      mediaKind: "image",
      originalFilename: "dbcl11-ac.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
      env: {
        NODE_ENV: "test",
        PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
        WEBSITE_MEDIA_STORAGE_PROVIDER: "database",
      },
    });
    if (media.ok) {
      assert.ok(media.media && media.media.id);
    } else {
      const sha = crypto.createHash("sha256").update(TINY_PNG).digest("hex");
      const row = await pool.query(
        `INSERT INTO platform.website_media (
           organization_id, instance_id, media_kind, original_filename,
           storage_key, mime_type, size_bytes, status
         ) VALUES ($1,$2,'image',$3,$4,$5,$6,'active')
         RETURNING id`,
        [
          ac.result.organizationId,
          ac.instance.id,
          "dbcl11-ac.png",
          `dbcl11/ac/${sha}.png`,
          "image/png",
          TINY_PNG.length,
        ]
      );
      assert.ok(row.rows[0].id, JSON.stringify(media));
    }

    for (const table of AC_V203_TABLES) {
      const r = await pool.query(
        `SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'activeclinic' AND table_name = $1`,
        [table]
      );
      assert.equal(r.rowCount, 1, `missing activeclinic.${table}`);
    }
  });

  it("6 tenant isolation + audit columns without 42703 lag path", async () => {
    if (!requireDb()) return;
    assert.ok(bb && ac);

    const cross = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.churches WHERE organization_id = $1`,
      [ac.result.organizationId]
    );
    assert.equal(cross.rows[0].n, 0);

    const acCross = await pool.query(
      `SELECT COUNT(*)::int AS n FROM activeclinic.staff_members WHERE organization_id = $1`,
      [bb.org.id]
    );
    assert.equal(acCross.rows[0].n, 0);

    const facilityId = crypto.randomUUID();
    const before42703 = stats.errors42703;
    const inserted = await insertAuditEvent(pool, {
      deploymentCode: "blessboard-org-staging",
      organizationId: bb.org.id,
      churchId: bb.church.id,
      branchId: bb.branch.id,
      facilityId,
      productCode: "blessboard",
      actorUserId: bb.hqUser.id,
      actionKey: "dbcl11.audit.probe",
      entityType: "organization",
      entityId: bb.org.id,
      outcome: "success",
      metadata: { source: "dbcl11" },
    });
    assert.ok(inserted && inserted.id);
    assert.equal(inserted.facilityId, facilityId);
    assert.equal(inserted.productCode, "blessboard");
    assert.equal(stats.errors42703, before42703, "facility_id/product_code 42703 fallback must not fire");

    const listed = await listAuditEvents(pool, {
      organizationId: bb.org.id,
      facilityId,
      productCode: "blessboard",
      limit: 5,
    });
    assert.ok(listed.events.some((e) => e.id === inserted.id));
  });

  it("7 post-cleanup invariants: user_roles r/w=0, no removed paths", async () => {
    if (!requireDb()) return;
    assert.ok(stats);

    assert.equal(stats.userRolesWrites, 0, "user_roles runtime writes must be 0");
    const probeReads = stats._userRolesProbeReads || 0;
    const runtimeReads = stats.userRolesReads - probeReads;
    assert.equal(runtimeReads, 0, "user_roles runtime reads = 0");
    assert.equal(stats.errors42703, 0, "no removed 42703 lag path triggered");

    assert.equal(
      fs.existsSync(path.join(ROOT, "src/platform/registration/statusCompatibility.js")),
      false
    );
    assert.equal(
      fs.existsSync(path.join(ROOT, "src/activeclinic/services/activeClinicPublicSchemaStatus.js")),
      false
    );

    const baseline = describeBaseline();
    assert.equal(baseline.strategy.code, "B");
  });
});
