"use strict";

/**
 * V10 PC10B — ActiveClinic website workflow baseline + shared platform
 * publication authorization / tenant isolation contract.
 *
 * Evidence markers:
 *   AC_WEBSITE_WORKFLOW_BASELINE
 *   TENANT_ISOLATION_BASELINE (AC half)
 *   RBAC_PERMISSION_MATRIX_BASELINE (platform permission keys + AC grants)
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
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
const submissionService = require("../src/platform/website/submissionService");
const {
  authorizeWebsiteAction,
  assertWebsiteInstanceScope,
} = require("../src/platform/website/authorizeWebsite");
const {
  PERMISSIONS,
  PLATFORM_ADMIN_PERMISSIONS,
  EDITOR_PERMISSIONS,
  hasWebsitePermission,
  canRestoreWebsite,
} = require("../src/platform/website/permissions");
const { PUBLISH_POLICY } = require("../src/platform/website/publishPolicy");
const {
  setClinicWebsiteAvailability,
} = require("../src/activeclinic/services/clinicWebsiteAvailabilityService");

const IDENTITY_KEY = "blessboard-platform-v5";
const AC_PASSWORD = "clinic-admin-pass-12";

describe("V10 PC10B platform publication authorization contract", () => {
  it("RBAC_PERMISSION_MATRIX_BASELINE: publish/restore/submit keys are explicit", () => {
    assert.equal(hasWebsitePermission(EDITOR_PERMISSIONS, PERMISSIONS.PUBLISH), false);
    assert.equal(canRestoreWebsite(EDITOR_PERMISSIONS), false);
    assert.equal(hasWebsitePermission(EDITOR_PERMISSIONS, PERMISSIONS.SUBMIT), true);
    assert.equal(hasWebsitePermission(PLATFORM_ADMIN_PERMISSIONS, PERMISSIONS.PUBLISH), true);
    assert.equal(canRestoreWebsite(PLATFORM_ADMIN_PERMISSIONS), true);
    assert.equal(hasWebsitePermission(PLATFORM_ADMIN_PERMISSIONS, PERMISSIONS.TAKE_OFFLINE), true);
    assert.ok(PLATFORM_ADMIN_PERMISSIONS.includes(PERMISSIONS.RESTORE));
    assert.ok(PLATFORM_ADMIN_PERMISSIONS.includes(PERMISSIONS.APPROVE));
  });
});

describe("V10 PC10B ActiveClinic website workflow baseline", () => {
  let pool;
  let skipReason = null;
  let stamp = 0;
  let phoneSeq = 860000000;
  let clinicA;
  let clinicB;
  let instanceA;
  let instanceB;

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

      clinicA = await seedClinic("A");
      clinicB = await seedClinic("B");
      instanceA = clinicA.instance;
      instanceB = clinicB.instance;
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 300) : "no foundation db";
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb(t) {
    if (skipReason) t.skip(`ActiveClinic PC10B setup failed: ${skipReason}`);
  }

  function nextPhone() {
    phoneSeq += 1;
    return `+2609${String(phoneSeq).slice(-8)}`;
  }

  function clinicPayload(label) {
    stamp += 1;
    return {
      clinicName: `PC10B Clinic ${label} ${stamp}`,
      contactName: "Website Admin",
      contactEmail: `pc10b-${label}-${stamp}@example.invalid`,
      contactPhone: nextPhone(),
      province: "Lusaka",
      city: "Lusaka",
      address: "1 Independence Avenue",
      countryCode: "ZM",
      notes: "pc10b ac workflow",
      password: AC_PASSWORD,
      passwordConfirm: AC_PASSWORD,
      acceptTerms: "on",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    };
  }

  async function seedClinic(label) {
    const result = await submitAndProvisionClinicRegistration(pool, clinicPayload(label));
    assert.equal(result.ok, true, JSON.stringify(result));
    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: result.organizationId,
      productCode: "activeclinic",
    });
    assert.ok(instance && instance.id, "website instance");
    const facility = await pool.query(
      `SELECT id FROM activeclinic.facilities WHERE organization_id = $1 AND is_primary = true LIMIT 1`,
      [result.organizationId]
    );
    return {
      result,
      instance,
      facilityId: facility.rows[0] && facility.rows[0].id,
      organizationId: result.organizationId,
      identityId: result.identityId,
      slug: result.slug,
    };
  }

  describe("RBAC_PERMISSION_MATRIX_BASELINE + AC_WEBSITE_WORKFLOW_BASELINE", () => {
    it("authorized publish with grants; unauthorized without grants", async (t) => {
      requireDb(t);

      const unauthorized = await publicationService.publishWebsiteDraft(pool, {
        organizationId: clinicA.organizationId,
        instanceId: instanceA.id,
        actorIdentityId: clinicA.identityId,
        allowEmpty: true,
        grantedPermissions: EDITOR_PERMISSIONS.slice(),
      });
      assert.equal(unauthorized.ok, false);
      assert.equal(unauthorized.code, "forbidden");

      const authorized = await publicationService.publishWebsiteDraft(pool, {
        organizationId: clinicA.organizationId,
        instanceId: instanceA.id,
        actorIdentityId: clinicA.identityId,
        allowEmpty: true,
        grantedPermissions: PLATFORM_ADMIN_PERMISSIONS.slice(),
      });
      assert.equal(authorized.ok, true, JSON.stringify(authorized));
      assert.ok(authorized.version && authorized.version.id);

      const availability = await setClinicWebsiteAvailability(pool, {
        organizationKey: clinicA.slug,
        public: true,
        overrideReadiness: true,
        reason: "pc10b_baseline",
      });
      assert.equal(availability.ok, true, JSON.stringify(availability));
    });

    it("draft→published creates version; second publish after draft change versions again", async (t) => {
      requireDb(t);
      const before = await versionService.listWebsiteVersions(pool, {
        instanceId: instanceA.id,
        organizationId: clinicA.organizationId,
      });
      const beforeCount = (before.versions || []).length;

      await contentService.saveWebsiteDraft(pool, {
        organizationId: clinicA.organizationId,
        instanceId: instanceA.id,
        contentKey: "home.hero.title",
        value: "PC10B Live Hero",
        actorIdentityId: clinicA.identityId,
      });

      const published = await publicationService.publishWebsiteDraft(pool, {
        organizationId: clinicA.organizationId,
        instanceId: instanceA.id,
        actorIdentityId: clinicA.identityId,
        grantedPermissions: PLATFORM_ADMIN_PERMISSIONS.slice(),
      });
      assert.equal(published.ok, true, JSON.stringify(published));
      assert.equal(published.published, true);
      assert.ok(published.version && published.version.id);

      const after = await versionService.listWebsiteVersions(pool, {
        instanceId: instanceA.id,
        organizationId: clinicA.organizationId,
      });
      assert.ok((after.versions || []).length > beforeCount);
    });

    it("submit workflow packages unpublished changes without publishing live", async (t) => {
      requireDb(t);
      await contentService.saveWebsiteDraft(pool, {
        organizationId: clinicA.organizationId,
        instanceId: instanceA.id,
        contentKey: "home.hero.title",
        value: "PC10B Submitted Hero",
        actorIdentityId: clinicA.identityId,
      });

      const submitted = await submissionService.submitWebsiteChanges(pool, {
        organizationId: clinicA.organizationId,
        instanceId: instanceA.id,
        actorIdentityId: clinicA.identityId,
      });
      assert.equal(submitted.ok, true, JSON.stringify(submitted));
      assert.ok(submitted.submission && submitted.submission.id);
      assert.equal(submitted.submission.status, "submitted");

      const row = await contentService.getWebsiteContentRow(
        pool,
        instanceA.id,
        clinicA.organizationId,
        "home.hero.title"
      );
      assert.ok(row, "draft row exists after submit");
      assert.notEqual(
        JSON.stringify(row.draftValue),
        JSON.stringify(row.publishedValue),
        "submit must not auto-promote draft to published"
      );
    });

    it("unpublish workflow returns provisional lifecycle for authorized actor", async (t) => {
      requireDb(t);
      const denied = await publicationService.unpublishWebsite(pool, {
        organizationId: clinicA.organizationId,
        instanceId: instanceA.id,
        actorIdentityId: clinicA.identityId,
        grantedPermissions: EDITOR_PERMISSIONS.slice(),
      });
      assert.equal(denied.ok, false);
      assert.equal(denied.code, "forbidden");

      const unpublished = await publicationService.unpublishWebsite(pool, {
        organizationId: clinicA.organizationId,
        instanceId: instanceA.id,
        actorIdentityId: clinicA.identityId,
        grantedPermissions: PLATFORM_ADMIN_PERMISSIONS.slice(),
        syncProductAvailability: false,
      });
      assert.equal(unpublished.ok, true, JSON.stringify(unpublished));
    });

    it("restore live creates a new version from historical snapshot", async (t) => {
      requireDb(t);
      // Ensure a published version exists after unpublish path.
      const republish = await publicationService.publishWebsiteDraft(pool, {
        organizationId: clinicA.organizationId,
        instanceId: instanceA.id,
        actorIdentityId: clinicA.identityId,
        allowEmpty: true,
        grantedPermissions: PLATFORM_ADMIN_PERMISSIONS.slice(),
      });
      assert.equal(republish.ok, true, JSON.stringify(republish));

      await contentService.saveWebsiteDraft(pool, {
        organizationId: clinicA.organizationId,
        instanceId: instanceA.id,
        contentKey: "home.hero.title",
        value: "PC10B After Restore Target",
        actorIdentityId: clinicA.identityId,
      });
      const second = await publicationService.publishWebsiteDraft(pool, {
        organizationId: clinicA.organizationId,
        instanceId: instanceA.id,
        actorIdentityId: clinicA.identityId,
        grantedPermissions: PLATFORM_ADMIN_PERMISSIONS.slice(),
      });
      assert.equal(second.ok, true, JSON.stringify(second));

      const listed = await versionService.listWebsiteVersions(pool, {
        instanceId: instanceA.id,
        organizationId: clinicA.organizationId,
      });
      const historical = (listed.versions || []).find(
        (v) => v.id !== (second.version && second.version.id)
      );
      assert.ok(historical, "need prior version");

      const editorDenied = await publicationService.restoreWebsiteVersionLive(pool, {
        organizationId: clinicA.organizationId,
        instanceId: instanceA.id,
        versionId: historical.id,
        actorIdentityId: clinicA.identityId,
        grantedPermissions: EDITOR_PERMISSIONS.slice(),
      });
      assert.equal(editorDenied.ok, false);
      assert.equal(editorDenied.code, "forbidden");

      const restored = await publicationService.restoreWebsiteVersionLive(pool, {
        organizationId: clinicA.organizationId,
        instanceId: instanceA.id,
        versionId: historical.id,
        actorIdentityId: clinicA.identityId,
        grantedPermissions: PLATFORM_ADMIN_PERMISSIONS.slice(),
      });
      assert.equal(restored.ok, true, JSON.stringify(restored));
      assert.ok(restored.version && restored.version.id);
      assert.notEqual(String(restored.version.id), String(historical.id));
    });
  });

  describe("TENANT_ISOLATION_BASELINE (AC clinic/facility)", () => {
    it("platform authz rejects tenant_mismatch and foreign instance ids", async (t) => {
      requireDb(t);

      const scope = assertWebsiteInstanceScope(instanceA, {
        organizationId: clinicB.organizationId,
      });
      assert.equal(scope.ok, false);
      assert.equal(scope.code, "tenant_mismatch");

      const mismatched = await authorizeWebsiteAction(pool, {
        organizationId: clinicB.organizationId,
        instanceId: instanceA.id,
        grantedPermissions: PLATFORM_ADMIN_PERMISSIONS.slice(),
        permission: PERMISSIONS.PUBLISH,
      });
      assert.equal(mismatched.ok, false);
      assert.ok(["tenant_mismatch", "website_instance_not_found"].includes(mismatched.code));

      const crossPublish = await publicationService.publishWebsiteDraft(pool, {
        organizationId: clinicB.organizationId,
        instanceId: instanceA.id,
        actorIdentityId: clinicB.identityId,
        allowEmpty: true,
        grantedPermissions: PLATFORM_ADMIN_PERMISSIONS.slice(),
      });
      assert.equal(crossPublish.ok, false);
      assert.ok(
        ["tenant_mismatch", "forbidden", "website_instance_not_found"].includes(crossPublish.code),
        crossPublish.code
      );

      const crossUnpublish = await publicationService.unpublishWebsite(pool, {
        organizationId: clinicA.organizationId,
        instanceId: instanceB.id,
        actorIdentityId: clinicA.identityId,
        grantedPermissions: PLATFORM_ADMIN_PERMISSIONS.slice(),
        syncProductAvailability: false,
      });
      assert.equal(crossUnpublish.ok, false);
    });

    it("REVIEW_BEFORE_PUBLISH policy blocks direct publish without force", async (t) => {
      requireDb(t);
      // instanceRepository.updateWebsiteInstance does not mutate publish_policy;
      // set the column directly to characterize the publicationService gate.
      await pool.query(
        `UPDATE platform.website_instances
            SET publish_policy = $2, updated_at = now()
          WHERE id = $1 AND organization_id = $3`,
        [
          instanceB.id,
          PUBLISH_POLICY.REVIEW_BEFORE_PUBLISH,
          clinicB.organizationId,
        ]
      );
      const blocked = await publicationService.publishWebsiteDraft(pool, {
        organizationId: clinicB.organizationId,
        instanceId: instanceB.id,
        actorIdentityId: clinicB.identityId,
        allowEmpty: true,
        grantedPermissions: PLATFORM_ADMIN_PERMISSIONS.slice(),
      });
      assert.equal(blocked.ok, false);
      assert.equal(blocked.code, publicationService.RESULT.POLICY_LOCKED);
    });
  });
});
