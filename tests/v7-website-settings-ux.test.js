"use strict";

/**
 * Website settings UX for ActiveClinic and BlessBoard.
 * Unpublished sites must not present View live as if the site were public.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

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
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
} = require("../src/platform/config/deploymentProfiles");
const instanceRepo = require("../src/platform/website/instanceRepository");
const contentService = require("../src/platform/website/contentService");
const publicationService = require("../src/platform/website/publicationService");
const lifecycleService = require("../src/platform/website/lifecycleService");
const { LIFECYCLE_STATUS } = require("../src/platform/website/lifecycleStatus");
const {
  setClinicWebsiteAvailability,
} = require("../src/activeclinic/services/clinicWebsiteAvailabilityService");
const { registerActiveClinicWebsiteTemplate } = require("../src/activeclinic/website/activeClinicWebsiteTemplate");
const {
  PRESENTATION_STATE,
  presentWebsiteSettingsUx,
  presentBlessBoardHqWebsiteSettingsUx,
} = require("../src/platform/website/websiteManagementPresentation");
const { PERMISSIONS } = require("../src/platform/website/permissions");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  STAFF_ROLE,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  createPlatformIdentity,
} = require("../src/platform/services/platformIdentityService");
const {
  setPlatformIdentityPassword,
} = require("../src/platform/services/platformIdentityCredentialService");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { repairWebsiteFoundation } = require("../src/blessboard/services/websiteFoundationRepairService");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "website-settings-ux-12";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let skipReason = null;
let stamp = 0;
let phoneSeq = 890000000;

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

function clinicPayload() {
  stamp += 1;
  return {
    clinicName: `WSUX Clinic ${stamp}`,
    contactName: "Website Admin",
    contactEmail: `wsux-${stamp}@example.invalid`,
    contactPhone: nextPhone(),
    province: "Lusaka Province",
    city: "Lusaka",
    address: "1 Independence Avenue",
    countryCode: "ZM",
    notes: "website settings ux",
    password: PASSWORD,
    passwordConfirm: PASSWORD,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  };
}

function makeAcApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: MINIMAL_AC,
    log: () => {},
  });
}

async function acCookie(identityId, organizationId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId,
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

async function publishClinicLive(result) {
  registerActiveClinicWebsiteTemplate();
  const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
    organizationId: result.organizationId,
    productCode: "activeclinic",
  });
  assert.ok(instance);
  const published = await publicationService.publishWebsiteDraft(pool, {
    organizationId: result.organizationId,
    instanceId: instance.id,
    actorIdentityId: result.identityId,
    allowEmpty: true,
  });
  assert.equal(published.ok, true, JSON.stringify(published));
  const availability = await setClinicWebsiteAvailability(pool, {
    organizationKey: result.slug,
    public: true,
    overrideReadiness: true,
    reason: "website_settings_ux_test",
  });
  assert.equal(availability.ok, true, JSON.stringify(availability));
  return instance;
}

describe("presentWebsiteSettingsUx", () => {
  it("unpublished site never offers View live", () => {
    const ux = presentWebsiteSettingsUx({
      exists: true,
      availabilityPublished: false,
      publicPath: "/clinics/demo",
      previewPath: "/clinics/demo/website/preview",
      editPath: "/clinics/demo?website_edit=1",
      publishPath: "/clinics/demo/website/publish",
      historyPath: "/clinics/demo/website/versions",
      canView: true,
      canEdit: true,
      canPublish: true,
    });
    assert.equal(ux.state, PRESENTATION_STATE.UNPUBLISHED);
    assert.equal(ux.statusLabel, "Website not published yet");
    assert.equal(ux.actions.viewLive, null);
    assert.equal(ux.actions.preview, "/clinics/demo/website/preview");
    assert.equal(ux.actions.editWebsite, "/clinics/demo?website_edit=1");
    assert.equal(ux.actions.publishPath, "/clinics/demo/website/publish");
    assert.equal(ux.actions.history, "/clinics/demo/website/versions");
  });

  it("published site offers View live and shows version", () => {
    const ux = presentWebsiteSettingsUx({
      exists: true,
      availabilityPublished: true,
      publishedVersionNumber: 3,
      lastPublishedAt: "2026-08-01T12:00:00.000Z",
      lastEditor: "admin@example.org",
      publicPath: "/clinics/demo",
      previewPath: "/clinics/demo/website/preview",
      canView: true,
      canEdit: true,
      canPublish: true,
    });
    assert.equal(ux.state, PRESENTATION_STATE.PUBLISHED);
    assert.match(ux.statusLabel, /Published \(version 3\)/);
    assert.equal(ux.actions.viewLive, "/clinics/demo");
    assert.equal(ux.lastEditor, "admin@example.org");
    assert.match(ux.lastPublishedLabel, /2026-08-01/);
  });

  it("draft changes on a live site keep View live", () => {
    const ux = presentWebsiteSettingsUx({
      exists: true,
      availabilityPublished: true,
      unpublishedChanges: true,
      unpublishedCount: 2,
      publishedVersionNumber: 1,
      publicPath: "/clinics/demo",
      canView: true,
      canPublish: true,
      publishPath: "/clinics/demo/website/publish",
    });
    assert.equal(ux.state, PRESENTATION_STATE.UNPUBLISHED_CHANGES);
    assert.match(ux.statusLabel, /unpublished changes/);
    assert.equal(ux.actions.viewLive, "/clinics/demo");
    assert.match(ux.statusHint, /2 unpublished changes/);
  });

  it("coming soon uses unpublished copy, not View live", () => {
    const ux = presentBlessBoardHqWebsiteSettingsUx({
      overview: {
        ok: true,
        publicPath: "/c/demo",
        previewPath: "/hq/content/preview/home",
        editPath: "/hq/content",
        publishReviewPath: "/hq/website/publish/review",
      },
      readiness: { websiteStatus: "draft" },
      flags: { canViewWebsite: true, canEditWebsite: true, canPublishWebsite: true },
    });
    assert.equal(ux.state, PRESENTATION_STATE.COMING_SOON);
    assert.equal(ux.statusLabel, "Website not published yet");
    assert.equal(ux.actions.viewLive, null);
    assert.ok(ux.actions.preview);
    assert.ok(ux.actions.editWebsite);
    assert.ok(ux.actions.publishPath);
  });

  it("suspended site hides View live, edit, and publish", () => {
    const ux = presentWebsiteSettingsUx({
      exists: true,
      availabilityPublished: true,
      productWebsiteStatus: "suspended",
      publicPath: "/clinics/demo",
      previewPath: "/clinics/demo/website/preview",
      editPath: "/clinics/demo?website_edit=1",
      publishPath: "/clinics/demo/website/publish",
      canView: true,
      canEdit: true,
      canPublish: true,
    });
    assert.equal(ux.state, PRESENTATION_STATE.SUSPENDED);
    assert.equal(ux.statusLabel, "Website suspended");
    assert.equal(ux.actions.viewLive, null);
    assert.equal(ux.actions.editWebsite, null);
    assert.equal(ux.actions.publishPath, null);
    assert.equal(ux.actions.contactPlatformAdmin, true);
  });

  it("missing instance is setup incomplete without live actions", () => {
    const ux = presentWebsiteSettingsUx({
      exists: false,
      publicPath: "/clinics/demo",
      previewPath: "/clinics/demo/website/preview",
      editPath: "/clinics/demo?website_edit=1",
      publishPath: "/clinics/demo/website/publish",
      canView: true,
      canEdit: true,
      canPublish: true,
    });
    assert.equal(ux.state, PRESENTATION_STATE.MISSING);
    assert.equal(ux.statusLabel, "Website setup incomplete");
    assert.equal(ux.actions.viewLive, null);
    assert.equal(ux.actions.preview, null);
    assert.equal(ux.actions.editWebsite, null);
    assert.equal(ux.actions.publishPath, null);
    assert.equal(ux.actions.contactPlatformAdmin, true);
  });

  it("failed provisioning with retry shows Retry instead of Contact Platform Admin", () => {
    const ux = presentBlessBoardHqWebsiteSettingsUx({
      overview: { publicPath: "/c/demo", previewPath: "/hq/content/preview/home" },
      readiness: { websiteStatus: "draft" },
      flags: { canViewWebsite: true, canEditWebsite: true, canPublishWebsite: true },
      needsFoundationRepair: true,
    });
    assert.equal(ux.state, PRESENTATION_STATE.SETUP_INCOMPLETE);
    assert.equal(ux.statusLabel, "Website setup incomplete");
    assert.equal(ux.actions.retry, "#website-setup-retry");
    assert.equal(ux.actions.contactPlatformAdmin, false);
    assert.equal(ux.actions.viewLive, null);
  });

  it("insufficient permission hides edit and publish", () => {
    const ux = presentWebsiteSettingsUx({
      exists: true,
      availabilityPublished: false,
      publicPath: "/clinics/demo",
      previewPath: "/clinics/demo/website/preview",
      editPath: "/clinics/demo?website_edit=1",
      publishPath: "/clinics/demo/website/publish",
      historyPath: "/clinics/demo/website/versions",
      canView: true,
      canEdit: false,
      canPublish: false,
    });
    assert.equal(ux.actions.viewLive, null);
    assert.ok(ux.actions.preview);
    assert.equal(ux.actions.editWebsite, null);
    assert.equal(ux.actions.publishPath, null);
    assert.ok(ux.actions.history);
    assert.equal(PERMISSIONS.VIEW, "website.view");
  });
});

describe("website settings HTTP", () => {
  let databaseUrl = null;

  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

describe("ActiveClinic website settings HTTP", () => {

  it("new unpublished site shows unpublished copy without View live", async () => {
    if (!requireDb()) return;
    const result = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    assert.equal(result.ok, true, JSON.stringify(result));
    const cookie = await acCookie(result.identityId, result.organizationId);
    const page = await request(makeAcApp()).get("/app/settings/website").set("Cookie", cookie);
    assert.equal(page.status, 200);
    assert.match(page.text, /Website not published yet/);
    assert.match(page.text, /data-ac-website-state="unpublished"/);
    assert.doesNotMatch(page.text, /data-ac-website-action="view-live"/);
    assert.match(page.text, /data-ac-website-action="preview"/);
    assert.match(page.text, /data-ac-website-action="edit"/);
    assert.match(page.text, /data-ac-website-action="publish"/);
    assert.match(page.text, /data-ac-website-action="history"/);
    assert.match(page.text, /data-ac-website-last-editor="1"/);
    assert.match(page.text, /data-ac-website-last-published="1"/);
    assert.match(page.text, /Not published yet/);
  });

  it("published site shows View live and published version", async () => {
    if (!requireDb()) return;
    const result = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    await publishClinicLive(result);
    const cookie = await acCookie(result.identityId, result.organizationId);
    const page = await request(makeAcApp()).get("/app/settings/website").set("Cookie", cookie);
    assert.equal(page.status, 200);
    assert.match(page.text, /data-ac-website-state="published"/);
    assert.match(page.text, /data-ac-website-action="view-live"/);
    assert.match(page.text, /Published \(version /);
    assert.doesNotMatch(page.text, /Website not published yet/);
  });

  it("draft changes on a published site are visible", async () => {
    if (!requireDb()) return;
    const result = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    const instance = await publishClinicLive(result);
    registerActiveClinicWebsiteTemplate();
    const saved = await contentService.saveWebsiteDraft(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      contentKey: "home.hero.title",
      value: "Draft title for unpublished changes",
      actorIdentityId: result.identityId,
    });
    assert.equal(saved.ok, true, JSON.stringify(saved));
    const cookie = await acCookie(result.identityId, result.organizationId);
    const page = await request(makeAcApp()).get("/app/settings/website").set("Cookie", cookie);
    assert.equal(page.status, 200);
    assert.match(page.text, /data-ac-website-state="unpublished_changes"/);
    assert.match(page.text, /unpublished change/);
    assert.match(page.text, /data-ac-website-unpublished="1"/);
    assert.match(page.text, /data-ac-website-action="view-live"/);
  });

  it("suspended site hides View live and publish", async () => {
    if (!requireDb()) return;
    const result = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    const instance = await publishClinicLive(result);
    const suspended = await lifecycleService.suspendWebsite(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      reason: "website_settings_ux_test",
      notePublic: "Website suspended.",
    });
    assert.equal(suspended.ok, true, JSON.stringify(suspended));
    const cookie = await acCookie(result.identityId, result.organizationId);
    const page = await request(makeAcApp()).get("/app/settings/website").set("Cookie", cookie);
    assert.equal(page.status, 200);
    assert.match(page.text, /data-ac-website-state="suspended"/);
    assert.match(page.text, /Website suspended/);
    assert.doesNotMatch(page.text, /data-ac-website-action="view-live"/);
    assert.doesNotMatch(page.text, /data-ac-website-action="publish"/);
    assert.match(page.text, /data-ac-website-action="contact-platform-admin"/);
  });

  it("missing instance shows Website setup incomplete", async () => {
    if (!requireDb()) return;
    const result = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: result.organizationId,
      productCode: "activeclinic",
    });
    await pool.query(`UPDATE platform.website_instances SET status = 'archived' WHERE id = $1`, [
      instance.id,
    ]);
    const cookie = await acCookie(result.identityId, result.organizationId);
    const page = await request(makeAcApp()).get("/app/settings/website").set("Cookie", cookie);
    assert.equal(page.status, 200);
    assert.match(page.text, /Website setup incomplete/);
    assert.match(page.text, /data-ac-website-state="(missing|setup_incomplete)"/);
    assert.doesNotMatch(page.text, /data-ac-website-action="view-live"/);
    assert.doesNotMatch(page.text, /data-ac-website-action="publish"/);
    assert.match(page.text, /data-ac-website-action="contact-platform-admin"/);
  });

  it("ordinary staff cannot open website settings", async () => {
    if (!requireDb()) return;
    const result = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    const staffPhone = nextPhone();
    const staffIdentity = await createPlatformIdentity(pool, {
      primaryPhone: staffPhone,
      phoneNormalized: staffPhone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    await setPlatformIdentityPassword(pool, {
      identityId: staffIdentity.identity.id,
      password: PASSWORD,
    });
    const facility = await pool.query(
      `SELECT id FROM activeclinic.facilities WHERE organization_id = $1 AND is_primary = true LIMIT 1`,
      [result.organizationId]
    );
    const hcoId =
      (result.healthcareOrganization && result.healthcareOrganization.id) ||
      (
        await pool.query(
          `SELECT id FROM activeclinic.healthcare_organizations WHERE organization_id = $1 LIMIT 1`,
          [result.organizationId]
        )
      ).rows[0].id;
    const staff = await createStaffMember(pool, {
      organizationId: result.organizationId,
      healthcareOrganizationId: hcoId,
      firstName: "Ord",
      lastName: "Staff",
      employmentType: "permanent",
      phone: nextPhone(),
      status: "active",
      platformIdentityId: staffIdentity.identity.id,
      jobTitle: "Clerk",
    });
    assert.equal(staff.ok, true, JSON.stringify(staff));
    await assignStaffToFacility(pool, {
      organizationId: result.organizationId,
      staffMemberId: staff.staffMember.id,
      facilityId: facility.rows[0].id,
      isPrimary: true,
    });
    await assignStaffRole(pool, {
      organizationId: result.organizationId,
      staffMemberId: staff.staffMember.id,
      roleKey: STAFF_ROLE,
      scopeType: "facility",
      facilityId: facility.rows[0].id,
    });
    const cookie = await acCookie(staffIdentity.identity.id, result.organizationId);
    const page = await request(makeAcApp()).get("/app/settings/website").set("Cookie", cookie);
    assert.equal(page.status, 403);
    assert.doesNotMatch(page.text, /data-ac-website-action="edit"/);
    assert.doesNotMatch(page.text, /data-ac-website-action="publish"/);
  });
});

describe("BlessBoard HQ website settings HTTP", () => {
  let host;
  let orgId;
  let churchId;
  let hqUserId;
  let branchUserId;
  let hqBranchId;

  before(async () => {
    try {
      if (!requireDb()) return;
      stamp += 1;
      const key = `wsuxbb${stamp}`;
      host = `${key}.blessboard.org`;
      const org = await provisionPlatformTenant(pool, {
        organizationKey: key,
        displayName: `WSUX Church ${stamp}`,
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: key,
        hostname: host,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(org.ok, true, org.message);
      orgId = org.records.organization.id;
      const churchProv = await provisionBlessBoardChurch(pool, {
        organizationKey: key,
        churchKey: key,
        displayName: `WSUX Church ${stamp}`,
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
        timezone: "Africa/Lusaka",
        countryCode: "ZM",
      });
      assert.equal(churchProv.ok, true, churchProv.message);
      churchId = churchProv.records.church.id;
      hqBranchId = churchProv.records.hqBranch.id;
      await pool.query(
        `INSERT INTO blessboard.church_settings (church_id, public_name, primary_email, website_status)
         VALUES ($1, $2, $3, 'draft')
         ON CONFLICT (church_id) DO UPDATE
           SET public_name = EXCLUDED.public_name,
               website_status = 'draft'`,
        [churchId, `WSUX Church ${stamp}`, `${key}@example.org`]
      );
      const repaired = await repairWebsiteFoundation(pool, {
        churchId,
        publicName: `WSUX Church ${stamp}`,
      });
      assert.equal(repaired.ok, true, JSON.stringify(repaired));
      const hqUser = await createBlessBoardUser(pool, {
        email: `${key}-hq@example.org`,
        password: PASSWORD,
        displayName: "HQ Admin",
      });
      assert.equal(hqUser.ok, true, hqUser.message);
      hqUserId = hqUser.user.id;
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: `${key}-hq@example.org`,
            organizationKey: key,
            roleKey: "church_hq_admin",
            churchKey: key,
          })
        ).ok,
        true
      );
      const branchUser = await createBlessBoardUser(pool, {
        email: `${key}-ba@example.org`,
        password: PASSWORD,
        displayName: "Branch Admin",
      });
      assert.equal(branchUser.ok, true, branchUser.message);
      branchUserId = branchUser.user.id;
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: `${key}-ba@example.org`,
            organizationKey: key,
            roleKey: "branch_admin",
            churchKey: key,
            branchKey: "hq",
          })
        ).ok,
        true
      );
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  function bbApp() {
    return createV5FoundationApp({
      getPool: () => pool,
      env: {
        NODE_ENV: "test",
        PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
        SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
        SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
        BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
        BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
        DEPLOYMENT_ENV: "testing",
      },
    });
  }

  async function hqCookie(userId) {
    const created = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId,
      organizationId: orgId,
      churchId,
      branchId: hqBranchId,
    });
    assert.equal(created.ok, true, created.code);
    return `${DEFAULT_V5_COOKIE}=${created.rawToken}`;
  }

  it("new unpublished church website does not present View live", async () => {
    if (!requireDb()) return;
    const page = await request(bbApp())
      .get("/hq/website")
      .set("Host", host)
      .set("Cookie", await hqCookie(hqUserId));
    assert.equal(page.status, 200, page.text && page.text.slice(0, 240));
    assert.match(page.text, /data-bb-website-settings-ux="1"/);
    assert.match(page.text, /Website not published yet/);
    assert.doesNotMatch(page.text, /data-bb-website-action="view-live"/);
    assert.match(page.text, /data-bb-website-action="preview"/);
    assert.match(page.text, /data-bb-website-action="edit"/);
    assert.match(page.text, /data-bb-website-action="publish"/);
    assert.match(page.text, /data-bb-website-action="history"/);
  });

  it("published church website may show View live", async () => {
    if (!requireDb()) return;
    await pool.query(
      `UPDATE blessboard.church_settings SET website_status = 'published' WHERE church_id = $1`,
      [churchId]
    );
    const page = await request(bbApp())
      .get("/hq/website")
      .set("Host", host)
      .set("Cookie", await hqCookie(hqUserId));
    assert.equal(page.status, 200);
    assert.match(page.text, /data-bb-website-action="view-live"/);
    assert.match(page.text, /Published/);
  });

  it("draft changes on a published church website are visible", async () => {
    if (!requireDb()) return;
    await pool.query(
      `UPDATE blessboard.church_settings SET website_status = 'published' WHERE church_id = $1`,
      [churchId]
    );
    await pool.query(
      `UPDATE blessboard.public_pages SET status = 'draft' WHERE church_id = $1 AND page_key = 'home'`,
      [churchId]
    );
    const page = await request(bbApp())
      .get("/hq/website")
      .set("Host", host)
      .set("Cookie", await hqCookie(hqUserId));
    assert.equal(page.status, 200);
    assert.match(page.text, /data-bb-website-unpublished="1"/);
    assert.match(page.text, /data-bb-website-action="view-live"/);
  });

  it("suspended church website hides View live", async () => {
    if (!requireDb()) return;
    await pool.query(
      `UPDATE blessboard.church_settings SET website_status = 'suspended' WHERE church_id = $1`,
      [churchId]
    );
    const page = await request(bbApp())
      .get("/hq/website")
      .set("Host", host)
      .set("Cookie", await hqCookie(hqUserId));
    assert.equal(page.status, 200);
    assert.match(page.text, /Website suspended/);
    assert.doesNotMatch(page.text, /data-bb-website-action="view-live"/);
    assert.match(page.text, /data-bb-website-action="contact-platform-admin"/);
  });

  it("missing public pages show Website setup incomplete with Retry", async () => {
    if (!requireDb()) return;
    await pool.query(
      `UPDATE blessboard.church_settings SET website_status = 'draft' WHERE church_id = $1`,
      [churchId]
    );
    await pool.query(`DELETE FROM blessboard.page_sections WHERE page_id IN (
      SELECT id FROM blessboard.public_pages WHERE church_id = $1
    )`, [churchId]);
    await pool.query(`DELETE FROM blessboard.public_pages WHERE church_id = $1`, [churchId]);
    const page = await request(bbApp())
      .get("/hq/website")
      .set("Host", host)
      .set("Cookie", await hqCookie(hqUserId));
    assert.equal(page.status, 200, page.text && page.text.slice(0, 240));
    assert.match(page.text, /Website setup incomplete/);
    assert.doesNotMatch(page.text, /data-bb-website-action="view-live"/);
    assert.match(page.text, /data-bb-website-action="retry"|id="website-setup-retry"/);
  });

  it("branch admin cannot open HQ website settings", async () => {
    if (!requireDb()) return;
    const page = await request(bbApp())
      .get("/hq/website")
      .set("Host", host)
      .set("Cookie", await hqCookie(branchUserId));
    assert.ok(page.status === 403 || page.status === 303, `status=${page.status}`);
    assert.doesNotMatch(page.text || "", /data-bb-website-settings-ux="1"/);
  });
});
});
