"use strict";

/**
 * V7 website RBAC for ActiveClinic and BlessBoard.
 * UI flags must match backend permission checks. Ordinary staff cannot mutate.
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
const { CSRF_FIELD, CSRF_COOKIE, issueCsrfToken } = require("../src/platform/http/v5Csrf");
const instanceRepo = require("../src/platform/website/instanceRepository");
const contentService = require("../src/platform/website/contentService");
const publicationService = require("../src/platform/website/publicationService");
const versionService = require("../src/platform/website/versionService");
const {
  PERMISSIONS,
  PLATFORM_ADMIN_PERMISSIONS,
  EDITOR_PERMISSIONS,
  hasWebsitePermission,
  canRestoreWebsite,
  canViewWebsiteAdmin,
} = require("../src/platform/website/permissions");
const {
  setClinicWebsiteAvailability,
} = require("../src/activeclinic/services/clinicWebsiteAvailabilityService");
const { createPlatformIdentity } = require("../src/platform/services/platformIdentityService");
const {
  setPlatformIdentityPassword,
} = require("../src/platform/services/platformIdentityCredentialService");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  WEBSITE_EDITOR,
  RECEPTIONIST,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const rbacRepo = require("../src/blessboard/repositories/blessBoardRbacRepository");
const {
  authorize,
} = require("../src/blessboard/services/blessBoardRbacAuthorizationService");
const { PLATFORM_ADMIN_PERMISSIONS: LEGACY_PA } = require("../src/blessboard/rbac/legacyCompatibilityPermissions");

const IDENTITY_KEY = "blessboard-platform-v5";
const AC_PASSWORD = "clinic-admin-pass-12";
const BB_PASSWORD = "correct-horse-battery-staple";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});
const HOST_A = "rbac-a.blessboard.org";
const HOST_B = "rbac-b.blessboard.org";

function cookieHeader(...parts) {
  return parts.filter(Boolean).join("; ");
}

describe("v7 website RBAC — contract", () => {
  it("publish, restore, and suspend are explicit permission keys", () => {
    assert.equal(hasWebsitePermission(EDITOR_PERMISSIONS, PERMISSIONS.PUBLISH), false);
    assert.equal(canRestoreWebsite(EDITOR_PERMISSIONS), false);
    assert.equal(hasWebsitePermission(EDITOR_PERMISSIONS, PERMISSIONS.SUSPEND), false);
    assert.equal(hasWebsitePermission(PLATFORM_ADMIN_PERMISSIONS, PERMISSIONS.PUBLISH), true);
    assert.equal(canRestoreWebsite(PLATFORM_ADMIN_PERMISSIONS), true);
    assert.equal(hasWebsitePermission(PLATFORM_ADMIN_PERMISSIONS, PERMISSIONS.SUSPEND), true);
    assert.equal(hasWebsitePermission(PLATFORM_ADMIN_PERMISSIONS, PERMISSIONS.TAKE_OFFLINE), true);
    assert.equal(canViewWebsiteAdmin(["website.view"]), true);
    assert.equal(canViewWebsiteAdmin(["website.edit"]), true);
    assert.ok(LEGACY_PA.includes("website.suspend"));
    assert.ok(LEGACY_PA.includes("website.restore"));
    assert.ok(LEGACY_PA.includes("website.take_offline"));
  });
});

describe("v7 website RBAC — ActiveClinic", () => {
  let pool;
  let skipReason = null;
  let stamp = 0;
  let phoneSeq = 780000000;

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
      skipReason = err && err.message ? String(err.message).slice(0, 240) : "no foundation db";
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipReason) assert.fail(`ActiveClinic RBAC setup failed: ${skipReason}`);
    return true;
  }

  function nextPhone() {
    phoneSeq += 1;
    return `+2609${String(phoneSeq).slice(-8)}`;
  }

  function clinicPayload() {
    stamp += 1;
    return {
      clinicName: `RBAC Clinic ${stamp}`,
      contactName: "Website Admin",
      contactEmail: `rbac-${stamp}@example.invalid`,
      contactPhone: nextPhone(),
      province: "Lusaka Province",
      city: "Lusaka",
      address: "1 Independence Avenue",
      countryCode: "ZM",
      notes: "website rbac",
      password: AC_PASSWORD,
      passwordConfirm: AC_PASSWORD,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      dataEnvironment: "testing",
      env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
    };
  }

  async function sessionCookie(identityId, orgId, facilityId) {
    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: identityId,
      organizationId: orgId,
      contextJson: facilityId ? { selectedFacilityId: facilityId } : {},
    });
    assert.equal(session.ok, true, JSON.stringify(session));
    return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
  }

  function makeApp() {
    return createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
  }

  function extractCsrf(res) {
    const html = String(res.text || "");
    const meta = html.match(/name="csrf-token"\s+content="([^"]+)"/);
    if (meta) return meta[1];
    const field = html.match(new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"`));
    return field ? field[1] : issueCsrfToken(MINIMAL_AC);
  }

  async function seedStaff(orgId, hcoId, facilityId, roleKey, scopeType) {
    const phone = nextPhone();
    const identity = await createPlatformIdentity(pool, {
      primaryEmail: `rbac.${phone.slice(-8)}@example.test`,
      primaryPhone: phone,
      phoneNormalized: phone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    assert.equal(identity.ok, true, JSON.stringify(identity));
    await setPlatformIdentityPassword(pool, {
      identityId: identity.identity.id,
      password: AC_PASSWORD,
    });
    const staff = await createStaffMember(pool, {
      organizationId: orgId,
      healthcareOrganizationId: hcoId,
      firstName: "Rbac",
      lastName: roleKey.slice(-8),
      employmentType: "permanent",
      status: "active",
      phone,
      platformIdentityId: identity.identity.id,
    });
    assert.equal(staff.ok, true, JSON.stringify(staff));
    if (facilityId) {
      await assignStaffToFacility(pool, {
        organizationId: orgId,
        staffMemberId: staff.staffMember.id,
        facilityId,
        isPrimary: true,
      });
    }
    const role = await assignStaffRole(pool, {
      organizationId: orgId,
      staffMemberId: staff.staffMember.id,
      roleKey,
      scopeType,
      facilityId: scopeType === "facility" ? facilityId : null,
      assignmentOrigin: "system",
    });
    assert.equal(role.ok, true, JSON.stringify(role));
    return { identityId: identity.identity.id, staffMemberId: staff.staffMember.id };
  }

  async function seedClinic() {
    const result = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    assert.equal(result.ok, true, JSON.stringify(result));
    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: result.organizationId,
      productCode: "activeclinic",
    });
    const published = await publicationService.publishWebsiteDraft(pool, {
      organizationId: result.organizationId,
      instanceId: instance.id,
      allowEmpty: true,
    });
    assert.equal(published.ok, true, JSON.stringify(published));
    const availability = await setClinicWebsiteAvailability(pool, {
      organizationKey: result.slug,
      public: true,
      overrideReadiness: true,
      reason: "rbac_test",
    });
    assert.equal(availability.ok, true, JSON.stringify(availability));
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
    const editor = await seedStaff(
      result.organizationId,
      hcoId,
      facility.rows[0].id,
      WEBSITE_EDITOR,
      "facility"
    );
    const receptionist = await seedStaff(
      result.organizationId,
      hcoId,
      facility.rows[0].id,
      RECEPTIONIST,
      "facility"
    );
    return { result, instance, facilityId: facility.rows[0].id, editor, receptionist };
  }

  it("org admin can edit, preview, publish; editor can edit but not publish or restore", async () => {
    requireDb();
    const { result, instance, facilityId, editor, receptionist } = await seedClinic();
    const app = makeApp();
    const adminCookie = await sessionCookie(result.identityId, result.organizationId);
    const editorCookie = await sessionCookie(editor.identityId, result.organizationId, facilityId);
    const recCookie = await sessionCookie(
      receptionist.identityId,
      result.organizationId,
      facilityId
    );

    const adminSettings = await request(app).get("/app/settings/website").set("Cookie", adminCookie);
    assert.equal(adminSettings.status, 200);
    assert.match(adminSettings.text, /data-ac-website-action="edit"/);
    assert.match(adminSettings.text, /data-ac-website-action="preview"/);
    assert.match(adminSettings.text, /data-ac-website-action="publish"/);
    assert.match(adminSettings.text, /data-ac-website-action="history"/);

    const editorSettings = await request(app)
      .get("/app/settings/website")
      .set("Cookie", editorCookie);
    assert.equal(editorSettings.status, 200);
    assert.match(editorSettings.text, /data-ac-website-action="edit"/);
    assert.match(editorSettings.text, /data-ac-website-action="preview"/);
    assert.doesNotMatch(editorSettings.text, /data-ac-website-action="publish"/);

    const recSettings = await request(app).get("/app/settings/website").set("Cookie", recCookie);
    assert.equal(recSettings.status, 403);

    const editorEdit = await request(app)
      .get(`/clinics/${result.slug}?website_edit=1&website_mode=draft`)
      .set("Cookie", editorCookie);
    assert.equal(editorEdit.status, 200);
    const csrf = extractCsrf(editorEdit);
    const editorCookies = cookieHeader(editorCookie, ...(editorEdit.headers["set-cookie"] || []));
    const draftSave = await request(app)
      .post(`/clinics/${result.slug}/website/drafts`)
      .set("Cookie", editorCookies)
      .send({ [CSRF_FIELD]: csrf, contentKey: "home.hero.title", value: "Editor Draft Title" });
    assert.equal(draftSave.status, 200, draftSave.text);
    assert.equal(JSON.parse(draftSave.text).published, false);

    const recWrite = await request(app)
      .post(`/clinics/${result.slug}/website/drafts`)
      .set("Cookie", recCookie)
      .send({ [CSRF_FIELD]: csrf, contentKey: "home.hero.title", value: "Receptionist Hijack" });
    assert.equal(recWrite.status, 403);

    const editorPublish = await request(app)
      .post(`/clinics/${result.slug}/website/publish`)
      .set("Cookie", editorCookies)
      .send({ [CSRF_FIELD]: csrf, makePublic: "1" });
    assert.equal(editorPublish.status, 403);

    const editorPreview = await request(app)
      .get(`/clinics/${result.slug}/website/preview`)
      .set("Cookie", editorCookie);
    assert.equal(editorPreview.status, 303);

    const recPreview = await request(app)
      .get(`/clinics/${result.slug}/website/preview`)
      .set("Cookie", recCookie);
    assert.equal(recPreview.status, 403);

    const adminEdit = await request(app)
      .get(`/clinics/${result.slug}?website_edit=1&website_mode=draft`)
      .set("Cookie", adminCookie);
    const adminCsrf = extractCsrf(adminEdit);
    const adminCookies = cookieHeader(adminCookie, ...(adminEdit.headers["set-cookie"] || []));
    const adminPublish = await request(app)
      .post(`/clinics/${result.slug}/website/publish`)
      .set("Cookie", adminCookies)
      .send({ [CSRF_FIELD]: adminCsrf, makePublic: "1" });
    assert.ok([200, 303].includes(adminPublish.status), String(adminPublish.status));

    const listed = await versionService.listWebsiteVersions(pool, {
      instanceId: instance.id,
      organizationId: result.organizationId,
    });
    const versions = listed.versions || [];
    const previous = versions.find((v) => v.status !== "published") || versions[0];
    assert.ok(previous, "published history exists");

    const editorRestore = await request(app)
      .post(`/clinics/${result.slug}/website/versions/${previous.id}/restore`)
      .set("Cookie", editorCookies)
      .send({ [CSRF_FIELD]: csrf });
    assert.equal(editorRestore.status, 403);

    const editorHistory = await request(app)
      .get(`/clinics/${result.slug}/website/history`)
      .set("Cookie", editorCookie);
    assert.equal(editorHistory.status, 200);
    assert.doesNotMatch(editorHistory.text, />Restore</);

    const other = await submitAndProvisionClinicRegistration(pool, clinicPayload());
    const otherCookie = await sessionCookie(other.identityId, other.organizationId);
    const crossed = await request(app)
      .post(`/clinics/${result.slug}/website/drafts`)
      .set("Cookie", otherCookie)
      .send({ [CSRF_FIELD]: csrf, contentKey: "home.hero.title", value: "Cross Tenant" });
    assert.equal(crossed.status, 403);
  });
});

describe("v7 website RBAC — BlessBoard", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let churchA;
  let users = {};

  function baseEnv(overrides) {
    return {
      NODE_ENV: "test",
      PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
      SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
      SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
      BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
      BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
      ...overrides,
    };
  }

  function skipIfNeeded() {
    if (!skipSuite) return false;
    assert.fail(`BlessBoard RBAC setup failed: ${skipReason}`);
    return true;
  }

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

      orgA = await provisionPlatformTenant(pool, {
        organizationKey: "rbac-a",
        displayName: "RBAC A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "rbac-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);
      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "rbac-a",
        churchKey: "rbac-a",
        displayName: "RBAC Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;

      const orgB = await provisionPlatformTenant(pool, {
        organizationKey: "rbac-b",
        displayName: "RBAC B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "rbac-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(orgB.ok, true, orgB.message);
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "rbac-b",
        churchKey: "rbac-b",
        displayName: "RBAC Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);

      async function makeUser(email, displayName, role, organizationId) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: BB_PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        if (role) {
          assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        }
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-staging",
          userId: created.user.id,
          organizationId,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      users.hqA = await makeUser(
        "rbac-hq-a@example.test",
        "HQ A",
        {
          email: "rbac-hq-a@example.test",
          organizationKey: "rbac-a",
          roleKey: "church_hq_admin",
          churchKey: "rbac-a",
        },
        orgA.records.organization.id
      );
      users.hqB = await makeUser(
        "rbac-hq-b@example.test",
        "HQ B",
        {
          email: "rbac-hq-b@example.test",
          organizationKey: "rbac-b",
          roleKey: "church_hq_admin",
          churchKey: "rbac-b",
        },
        orgB.records.organization.id
      );
      users.editor = await makeUser(
        "rbac-editor-a@example.test",
        "Editor A",
        null,
        orgA.records.organization.id
      );
      users.staff = await makeUser(
        "rbac-staff-a@example.test",
        "Staff A",
        null,
        orgA.records.organization.id
      );

      async function assignCatalogue(userId, roleKey) {
        const role = await rbacRepo.findRoleByKey(pool, roleKey);
        assert.ok(role, roleKey);
        await rbacRepo.insertAssignment(pool, {
          userId,
          organizationId: orgA.records.organization.id,
          churchId: churchA.id,
          roleId: role.id,
          scopeType: "church",
          scopeId: churchA.id,
          assignedByUserId: users.hqA.user.id,
          assignmentOrigin: "system",
          assignmentReason: "website rbac test",
        });
      }

      await assignCatalogue(users.editor.user.id, "website_editor");
      await assignCatalogue(users.staff.user.id, "finance_officer");

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("catalogue: HQ admin publishes; editor edits; staff cannot mutate", async () => {
    skipIfNeeded();
    const tenant = {
      resolved: true,
      organization: orgA.records.organization,
      church: churchA,
    };
    const ctx = {
      organizationId: orgA.records.organization.id,
      churchId: churchA.id,
    };
    const hqEdit = await authorize(pool, {
      actor: { userId: users.hqA.user.id },
      permission: "website.edit",
      tenantContext: tenant,
      resourceContext: ctx,
    });
    assert.equal(hqEdit.allowed, true, hqEdit.reasonCode);
    const hqPublish = await authorize(pool, {
      actor: { userId: users.hqA.user.id },
      permission: "website.publish",
      tenantContext: tenant,
      resourceContext: ctx,
    });
    assert.equal(hqPublish.allowed, true, hqPublish.reasonCode);
    const hqRollback = await authorize(pool, {
      actor: { userId: users.hqA.user.id },
      permission: "website.rollback",
      tenantContext: tenant,
      resourceContext: ctx,
    });
    assert.equal(hqRollback.allowed, true, hqRollback.reasonCode);

    const editorEdit = await authorize(pool, {
      actor: { userId: users.editor.user.id },
      permission: "website.edit",
      tenantContext: tenant,
      resourceContext: ctx,
    });
    assert.equal(editorEdit.allowed, true, editorEdit.reasonCode);
    const editorPublish = await authorize(pool, {
      actor: { userId: users.editor.user.id },
      permission: "website.publish",
      tenantContext: tenant,
      resourceContext: ctx,
    });
    assert.equal(editorPublish.allowed, false);
    const editorRollback = await authorize(pool, {
      actor: { userId: users.editor.user.id },
      permission: "website.rollback",
      tenantContext: tenant,
      resourceContext: ctx,
    });
    assert.equal(editorRollback.allowed, false);

    const staffEdit = await authorize(pool, {
      actor: { userId: users.staff.user.id },
      permission: "website.edit",
      tenantContext: tenant,
      resourceContext: ctx,
    });
    assert.equal(staffEdit.allowed, false);
  });

  it("HTTP: editor can draft, cannot publish/restore; staff cannot write; cross-tenant blocked", async () => {
    skipIfNeeded();
    const csrf = issueCsrfToken(baseEnv());
    const editorCookies = cookieHeader(
      `${DEFAULT_V5_COOKIE}=${users.editor.rawToken}`,
      `${CSRF_COOKIE}=${csrf}`
    );
    const staffCookies = cookieHeader(
      `${DEFAULT_V5_COOKIE}=${users.staff.rawToken}`,
      `${CSRF_COOKIE}=${csrf}`
    );

    const hqOverview = await request(app)
      .get("/hq/website")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`);
    assert.equal(hqOverview.status, 200, hqOverview.text && hqOverview.text.slice(0, 200));
    assert.match(hqOverview.text, /Edit Website|Edit website/);

    const editorOverview = await request(app)
      .get("/hq/website")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${users.editor.rawToken}`);
    assert.equal(editorOverview.status, 200);
    assert.match(editorOverview.text, /Edit Website|Edit website/);
    assert.doesNotMatch(editorOverview.text, />Publish Changes</);

    const editorSave = await request(app)
      .post("/hq/content/api/inline-field")
      .set("Host", HOST_A)
      .set("Cookie", editorCookies)
      .set("X-CSRF-Token", csrf)
      .send({
        [CSRF_FIELD]: csrf,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "Editor Draft Heading",
      });
    assert.equal(editorSave.status, 200, editorSave.text);
    assert.equal(editorSave.body.published, false);

    const staffSave = await request(app)
      .post("/hq/content/api/inline-field")
      .set("Host", HOST_A)
      .set("Cookie", staffCookies)
      .set("X-CSRF-Token", csrf)
      .set("Accept", "application/json")
      .send({
        [CSRF_FIELD]: csrf,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "Staff Hijack",
      });
    assert.equal(staffSave.status, 403);

    const editorReview = await request(app)
      .get("/hq/website/publish/review")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${users.editor.rawToken}`);
    assert.equal(editorReview.status, 403);

    const editorPublish = await request(app)
      .post("/hq/website/publish")
      .set("Host", HOST_A)
      .set("Cookie", editorCookies)
      .set("X-CSRF-Token", csrf)
      .send({ [CSRF_FIELD]: csrf, confirm_publish: "1" });
    assert.equal(editorPublish.status, 403);

    const editorHistory = await request(app)
      .get("/hq/website/version-history")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${users.editor.rawToken}`);
    assert.equal(editorHistory.status, 403);

    const crossed = await request(app)
      .post("/hq/content/api/inline-field")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.hqB.rawToken}`, `${CSRF_COOKIE}=${csrf}`))
      .set("X-CSRF-Token", csrf)
      .set("Accept", "application/json")
      .send({
        [CSRF_FIELD]: csrf,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "Cross Tenant Hijack",
      });
    assert.equal(crossed.status, 403);

    const hqPreview = await request(app)
      .get("/hq/content/preview/home")
      .set("Host", HOST_A)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`);
    assert.ok([200, 404].includes(hqPreview.status), String(hqPreview.status));
  });
});
