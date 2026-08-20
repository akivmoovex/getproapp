"use strict";

/**
 * BUG FIXES 04 — auto-registration (review as exception) and
 * TENANT_PUBLISH draft/live website versions + restore.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const {
  submitAndProvisionClinicRegistration,
} = require("../src/activeclinic/services/submitClinicRegistrationService");
const {
  createClinicRegistrationApplication,
} = require("../src/activeclinic/services/activeClinicPublicOnboardingService");
const {
  approveAndProvisionClinicRegistration,
  rejectClinicRegistration,
} = require("../src/activeclinic/services/approveClinicRegistrationService");
const {
  verifyPlatformIdentityPassword,
} = require("../src/platform/services/platformIdentityCredentialService");
const {
  createPlatformIdentity,
} = require("../src/platform/services/platformIdentityService");
const {
  listEligibleActiveClinicOrganizations,
} = require("../src/activeclinic/services/activeClinicLoginEligibility");
const { ORGANIZATION_ADMIN } = require("../src/activeclinic/services/activeClinicAuthorizationService");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { CODE_ACTIVECLINIC_ORG_V6 } = require("../src/platform/config/deploymentProfiles");
const {
  registerActiveClinicWebsiteTemplate,
  ACTIVECLINIC_TEMPLATE_ID,
  ACTIVECLINIC_TEMPLATE_VERSION,
} = require("../src/activeclinic/website/activeClinicWebsiteTemplate");
const { provisionWebsiteInstance } = require("../src/platform/website/provisionService");
const contentService = require("../src/platform/website/contentService");
const resolver = require("../src/platform/website/resolver");
const versionService = require("../src/platform/website/versionService");
const publicationService = require("../src/platform/website/publicationService");
const { listWebsiteAudit } = require("../src/platform/website/auditService");
const { LIFECYCLE_STATUS } = require("../src/platform/website/lifecycleStatus");
const { PUBLISH_POLICY } = require("../src/platform/website/publishPolicy");
const { productWebsiteDefaults } = require("../src/platform/website/productWebsiteDefaults");
const {
  PERMISSIONS,
  EDITOR_PERMISSIONS,
  hasWebsitePermission,
} = require("../src/platform/website/permissions");
const { authorizeWebsiteInstance } = require("../src/platform/website/authorizeWebsite");
const { listPlatformAdminWebsites } = require("../src/platform/website/platformAdminWebsitesService");
const { takeWebsiteOffline } = require("../src/platform/website/lifecycleService");
const {
  isInstantFreeProvisioningEnabled,
} = require("../src/blessboard/config/instantFreeProvisioningEnabled");

let pool;
let skipReason = null;
let stamp = 0;
let phoneSeq = 960000000;

function requireDb() {
  if (skipReason) {
    // eslint-disable-next-line no-console
    console.log("skip:", skipReason);
    return false;
  }
  return true;
}

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function clinicPayload(overrides) {
  stamp += 1;
  return {
    clinicName: `BF04 Clinic ${stamp}`,
    contactName: "Test Administrator",
    contactEmail: `bf04-${stamp}@example.invalid`,
    contactPhone: nextPhone(),
    province: "Lusaka Province",
    city: "Lusaka",
    address: "1 Independence Avenue",
    countryCode: "ZM",
    notes: "BUG FIXES 04",
    password: "clinic-admin-pass-12",
    passwordConfirm: "clinic-admin-pass-12",
    acceptTerms: "on",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    dataEnvironment: "testing",
    env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    ...overrides,
  };
}

async function seedWebsiteClinic(suffix, policy) {
  stamp += 1;
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `bf04_${suffix}_${stamp}`,
    displayName: `BF04 ${suffix} ${stamp}`,
    productKey: "activeclinic",
    productTenantKey: `bf04-${suffix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  registerActiveClinicWebsiteTemplate();
  const provisioned = await provisionWebsiteInstance(pool, {
    organizationId: org.records.organization.id,
    templateId: ACTIVECLINIC_TEMPLATE_ID,
    templateVersion: ACTIVECLINIC_TEMPLATE_VERSION,
    slug: `bf04-${suffix}-${stamp}`,
    status: "coming_soon",
    publishPolicy: policy,
    lifecycleStatus: LIFECYCLE_STATUS.PROVISIONAL,
  });
  assert.equal(provisioned.ok, true, JSON.stringify(provisioned));
  return {
    organizationId: org.records.organization.id,
    organizationKey: org.records.organization.key,
    instance: provisioned.instance,
  };
}

describe("BUG FIXES 04 registration and website versions", () => {
  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 240) : "no foundation db";
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("1 ActiveClinic normal registration auto-provisions an organisation", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    const result = await submitAndProvisionClinicRegistration(pool, payload);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.reviewRequired, false);
    assert.ok(result.organizationId);
    assert.equal(result.application.status, "active");
    const org = await pool.query(`SELECT status FROM platform.organizations WHERE id = $1`, [
      result.organizationId,
    ]);
    assert.equal(org.rows[0].status, "active");
  });

  it("2 BlessBoard normal Foundation registration remains instant (no routine PA gate)", () => {
    assert.equal(isInstantFreeProvisioningEnabled({}), true);
    assert.equal(isInstantFreeProvisioningEnabled({ BLESSBOARD_INSTANT_FREE_PROVISIONING_ENABLED: "1" }), true);
  });

  it("3 administrator identity can authenticate immediately", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    const result = await submitAndProvisionClinicRegistration(pool, payload);
    assert.equal(result.ok, true, JSON.stringify(result));
    const verified = await verifyPlatformIdentityPassword(pool, {
      identityId: result.identityId,
      password: payload.password,
      recordFailure: false,
    });
    assert.equal(verified.ok, true, JSON.stringify(verified));
    const eligible = await listEligibleActiveClinicOrganizations(pool, {
      platformIdentityId: result.identityId,
    });
    assert.equal(eligible.ok, true, JSON.stringify(eligible));
    assert.ok((eligible.organizations || []).length >= 1);
  });

  it("4 ActiveClinic facility membership exists after auto-provision", async () => {
    if (!requireDb()) return;
    const result = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    assert.equal(result.ok, true, JSON.stringify(result));
    const facilities = await pool.query(
      `SELECT count(*)::int AS n FROM activeclinic.facilities WHERE organization_id = $1 AND is_primary = true`,
      [result.organizationId]
    );
    assert.equal(facilities.rows[0].n, 1);
    const assignment = await pool.query(
      `SELECT count(*)::int AS n
         FROM activeclinic.staff_facility_assignments
        WHERE organization_id = $1 AND staff_member_id = $2`,
      [result.organizationId, result.staffMemberId]
    );
    assert.equal(assignment.rows[0].n, 1);
  });

  it("5 organisation-admin role is assigned", async () => {
    if (!requireDb()) return;
    const result = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    assert.equal(result.ok, true, JSON.stringify(result));
    const role = await pool.query(
      `SELECT r.role_key
         FROM activeclinic.staff_role_assignments a
         JOIN blessboard.roles r ON r.id = a.role_id
        WHERE a.organization_id = $1 AND a.staff_member_id = $2`,
      [result.organizationId, result.staffMemberId]
    );
    assert.ok(role.rows.some((row) => row.role_key === ORGANIZATION_ADMIN));
  });

  it("6 duplicate registration remains blocked", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    const first = await submitAndProvisionClinicRegistration(pool, payload);
    assert.equal(first.ok, true, JSON.stringify(first));
    const second = await submitAndProvisionClinicRegistration(pool, payload);
    assert.equal(second.ok, false);
    assert.equal(second.code, "duplicate_application");
  });

  it("7 invalid registration remains blocked", async () => {
    if (!requireDb()) return;
    const invalid = await submitAndProvisionClinicRegistration(
      pool,
      clinicPayload({ clinicName: "A", password: "short", passwordConfirm: "short" })
    );
    assert.equal(invalid.ok, false);
    assert.ok(invalid.errors && (invalid.errors.clinicName || invalid.errors.password));
  });

  it("8 exceptional existing-identity registration enters review_required", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    const identity = await createPlatformIdentity(pool, {
      status: "active",
      primaryEmail: payload.contactEmail,
      emailNormalized: payload.contactEmail,
      emailVerifiedAt: new Date().toISOString(),
      primaryPhone: payload.contactPhone,
      phoneNormalized: payload.contactPhone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    assert.equal(identity.ok, true, JSON.stringify(identity));
    const held = await submitAndProvisionClinicRegistration(pool, payload);
    assert.equal(held.ok, true, JSON.stringify(held));
    assert.equal(held.reviewRequired, true);
    assert.equal(held.application.status, "review_required");
    assert.equal(held.organizationId || null, null);
  });

  it("9 Platform Admin can still approve or reject review_required", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    const created = await createClinicRegistrationApplication(pool, payload);
    assert.equal(created.ok, true, JSON.stringify(created));
    assert.equal(created.application.status, "submitted");
    const { markReviewRequired } = require("../src/activeclinic/services/submitClinicRegistrationService");
    await markReviewRequired(pool, created.application.id, "manual_hold", null);
    const rejected = await rejectClinicRegistration(pool, {
      applicationId: created.application.id,
      rejectionReason: "QA reject of exceptional hold",
    });
    assert.equal(rejected.ok, true, JSON.stringify(rejected));

    const payload2 = clinicPayload();
    const held = await createClinicRegistrationApplication(pool, payload2);
    await markReviewRequired(pool, held.application.id, "manual_hold", null);
    const approved = await approveAndProvisionClinicRegistration(pool, {
      applicationId: held.application.id,
      dataEnvironment: "testing",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(approved.ok, true, JSON.stringify(approved));
    assert.ok(approved.organizationId);
  });

  it("10 cross-tenant website restore is blocked", async () => {
    if (!requireDb()) return;
    const a = await seedWebsiteClinic("isoA", PUBLISH_POLICY.TENANT_PUBLISH);
    const b = await seedWebsiteClinic("isoB", PUBLISH_POLICY.TENANT_PUBLISH);
    await publicationService.saveDraftAndMaybePublish(pool, {
      organizationId: a.organizationId,
      instanceId: a.instance.id,
      contentKey: "home.hero.title",
      value: "Clinic A",
    });
    const published = await publicationService.publishWebsiteDraft(pool, {
      organizationId: a.organizationId,
      instanceId: a.instance.id,
    });
    assert.equal(published.ok, true, JSON.stringify(published));
    const crossed = await publicationService.restoreWebsiteVersionLive(pool, {
      organizationId: b.organizationId,
      instanceId: b.instance.id,
      versionId: published.version.id,
    });
    assert.equal(crossed.ok, false);
  });

  it("11 new website begins as draft under TENANT_PUBLISH", async () => {
    if (!requireDb()) return;
    assert.equal(productWebsiteDefaults("activeclinic").publishPolicy, PUBLISH_POLICY.TENANT_PUBLISH);
    const ctx = await seedWebsiteClinic("draft", PUBLISH_POLICY.TENANT_PUBLISH);
    assert.equal(ctx.instance.publishPolicy, PUBLISH_POLICY.TENANT_PUBLISH);
    const saved = await publicationService.saveDraftAndMaybePublish(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: "home.hero.title",
      value: "Draft Only",
    });
    assert.equal(saved.ok, true);
    assert.equal(saved.published, false);
    const versions = await versionService.listWebsiteVersions(pool, {
      instanceId: ctx.instance.id,
      organizationId: ctx.organizationId,
    });
    assert.equal((versions.versions || []).length, 0);
  });

  it("12–15 publish creates immutable versions; live resolver ignores later drafts", async () => {
    if (!requireDb()) return;
    const ctx = await seedWebsiteClinic("pub", PUBLISH_POLICY.TENANT_PUBLISH);
    await publicationService.saveDraftAndMaybePublish(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: "home.hero.title",
      value: "Version One Title",
    });
    const v1 = await publicationService.publishWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      actorIdentityId: null,
    });
    assert.equal(v1.ok, true, JSON.stringify(v1));
    assert.equal(v1.published, true);
    assert.equal(v1.version.versionNumber, 1);
    assert.equal(v1.version.status, "published");

    await publicationService.saveDraftAndMaybePublish(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: "home.hero.title",
      value: "Draft After Publish",
    });
    const live = await resolver.resolveWebsiteContent(pool, {
      organizationId: ctx.organizationId,
      instance: ctx.instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(live.values["home.hero.title"], "Version One Title");
    const draft = await resolver.resolveWebsiteContent(pool, {
      organizationId: ctx.organizationId,
      instance: ctx.instance,
      mode: resolver.MODE.DRAFT,
    });
    assert.equal(draft.values["home.hero.title"], "Draft After Publish");

    const v2 = await publicationService.publishWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    assert.equal(v2.ok, true, JSON.stringify(v2));
    assert.equal(v2.version.versionNumber, 2);
    const listed = await versionService.listWebsiteVersions(pool, {
      instanceId: ctx.instance.id,
      organizationId: ctx.organizationId,
    });
    const historic = listed.versions.find((row) => row.versionNumber === 1);
    assert.equal(historic.status, "superseded");
    assert.equal(historic.snapshot.values["home.hero.title"], "Version One Title");
    const live2 = await resolver.resolveWebsiteContent(pool, {
      organizationId: ctx.organizationId,
      instance: ctx.instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(live2.values["home.hero.title"], "Draft After Publish");
  });

  it("16 historic versions can be previewed without mutating live", async () => {
    if (!requireDb()) return;
    const ctx = await seedWebsiteClinic("hist", PUBLISH_POLICY.TENANT_PUBLISH);
    await publicationService.saveDraftAndMaybePublish(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: "home.hero.title",
      value: "Historic A",
    });
    const v1 = await publicationService.publishWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    await publicationService.saveDraftAndMaybePublish(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: "home.hero.title",
      value: "Historic B",
    });
    await publicationService.publishWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    const preview = await versionService.getWebsiteVersion(pool, {
      versionId: v1.version.id,
      organizationId: ctx.organizationId,
    });
    assert.equal(preview.ok, true);
    assert.equal(preview.version.snapshot.values["home.hero.title"], "Historic A");
    const live = await resolver.resolveWebsiteContent(pool, {
      organizationId: ctx.organizationId,
      instance: ctx.instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(live.values["home.hero.title"], "Historic B");
  });

  it("17–18 restore creates a new version and updates live without rewriting history", async () => {
    if (!requireDb()) return;
    const ctx = await seedWebsiteClinic("rst", PUBLISH_POLICY.TENANT_PUBLISH);
    await publicationService.saveDraftAndMaybePublish(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: "home.hero.title",
      value: "Original Live",
    });
    const v1 = await publicationService.publishWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    await publicationService.saveDraftAndMaybePublish(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: "home.hero.title",
      value: "Second Live",
    });
    await publicationService.publishWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    const restored = await publicationService.restoreWebsiteVersionLive(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      versionId: v1.version.id,
    });
    assert.equal(restored.ok, true, JSON.stringify(restored));
    assert.equal(restored.version.versionNumber, 3);
    const historic = await versionService.getWebsiteVersion(pool, {
      versionId: v1.version.id,
      organizationId: ctx.organizationId,
    });
    assert.equal(historic.version.snapshot.values["home.hero.title"], "Original Live");
    assert.equal(historic.version.versionNumber, 1);
    const live = await resolver.resolveWebsiteContent(pool, {
      organizationId: ctx.organizationId,
      instance: ctx.instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(live.values["home.hero.title"], "Original Live");
  });

  it("19 editor role cannot publish", () => {
    assert.equal(hasWebsitePermission(EDITOR_PERMISSIONS, PERMISSIONS.PUBLISH), false);
    assert.equal(hasWebsitePermission(EDITOR_PERMISSIONS, PERMISSIONS.RESTORE), false);
    assert.equal(hasWebsitePermission(["website.publish", "website.view"], PERMISSIONS.PUBLISH), true);
  });

  it("20 Platform Admin can inspect tenant websites", async () => {
    if (!requireDb()) return;
    const ctx = await seedWebsiteClinic("pa", PUBLISH_POLICY.TENANT_PUBLISH);
    const listed = await listPlatformAdminWebsites(pool, {
      tab: "overview",
      q: ctx.organizationKey,
    });
    assert.ok(
      listed.websites.some(
        (row) => String(row.organizationKey) === String(ctx.organizationKey)
      ),
      JSON.stringify((listed.websites || []).map((row) => row.organizationKey))
    );
  });

  it("21–23 PA unpublish and restore leave audit; unauthorized org cannot publish", async () => {
    if (!requireDb()) return;
    const ctx = await seedWebsiteClinic("aud", PUBLISH_POLICY.TENANT_PUBLISH);
    await publicationService.saveDraftAndMaybePublish(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      contentKey: "home.hero.title",
      value: "Audited",
    });
    const published = await publicationService.publishWebsiteDraft(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
    });
    assert.equal(published.ok, true);
    const forbidden = await authorizeWebsiteInstance(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      grantedPermissions: EDITOR_PERMISSIONS,
      permission: PERMISSIONS.PUBLISH,
    });
    assert.equal(forbidden.ok, false);
    assert.equal(forbidden.code, "forbidden");
    const offline = await takeWebsiteOffline(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      reason: "PA unpublish for QA",
    });
    assert.equal(offline.ok, true, JSON.stringify(offline));
    const restored = await publicationService.restoreWebsiteVersionLive(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      versionId: published.version.id,
    });
    assert.equal(restored.ok, true, JSON.stringify(restored));
    const audit = await listWebsiteAudit(pool, {
      organizationId: ctx.organizationId,
      instanceId: ctx.instance.id,
      limit: 50,
    });
    const actions = (audit.events || []).map((row) => row.actionKey);
    assert.ok(actions.includes("website.publish"));
    assert.ok(actions.includes("website.rollback") || actions.includes("website.lifecycle.offline"));
  });
});
