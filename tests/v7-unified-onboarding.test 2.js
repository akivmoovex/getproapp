"use strict";

/**
 * Unified post-registration onboarding for ActiveClinic and BlessBoard.
 * Shared engine + product step adapters. Isolated local foundation DB only.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  createPlatformIdentity,
} = require("../src/platform/services/platformIdentityService");
const {
  setPlatformIdentityPassword,
} = require("../src/platform/services/platformIdentityCredentialService");
const {
  createHealthcareOrganization,
} = require("../src/activeclinic/services/healthcareOrganizationService");
const { createFacility } = require("../src/activeclinic/services/facilityService");
const { createStaffMember } = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  ORGANIZATION_ADMIN,
  RECEPTIONIST,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const { ensureDefaultDepartments } = require("../src/activeclinic/services/activeClinicDepartmentService");
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
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const {
  PRODUCT,
  STATUS,
  STEP_KIND,
  evaluateOrganizationOnboarding,
  skipOnboardingStep,
  completeOrganizationOnboarding,
  applyOnboardingRedirect,
  getProgress,
} = require("../src/platform/onboarding");
const {
  resolveOnboardingStatus,
  REQUIRED_CHECKLIST_KEYS,
} = require("../src/blessboard/services/organizationOnboardingSummaryService");

const PASSWORD = "OnboardPass12!";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});
const AC_ADMIN_PERMS = Object.freeze([
  "activeclinic.access",
  "activeclinic.organization.manage",
  "activeclinic.facility.create",
  "activeclinic.facility.update",
  "activeclinic.departments.manage",
  "activeclinic.staff.invite",
  "activeclinic.staff.assign_access",
  "website.edit",
]);

let pool;
let skipReason = null;
let stamp = 0;
let phoneSeq = 910000000;

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

function acAdminActor() {
  return { permissions: AC_ADMIN_PERMS };
}

function step(evaluation, key) {
  return (evaluation.steps || []).find((s) => s.key === key) || null;
}

describe("v7 unified organization onboarding", () => {
  before(async () => {
    try {
      process.env.PLATFORM_DEPLOYMENT_CODE = "blessboard-org-staging";
      process.env.DEPLOYMENT_ENV = "testing";
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: "blessboard-platform-v5",
        environmentCode: "testing",
      });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("redirect helper never returns completed users to onboarding", () => {
    const evaluation = {
      status: STATUS.COMPLETED,
      onboardingRequired: false,
      dashboardPath: "/app",
      onboardingPath: "/app/onboarding",
    };
    assert.equal(
      applyOnboardingRedirect({ evaluation, requestedPath: "/app/onboarding" }),
      "/app"
    );
    assert.equal(applyOnboardingRedirect({ evaluation, requestedPath: "/app" }), "/app");
    const required = {
      status: STATUS.IN_PROGRESS,
      onboardingRequired: true,
      dashboardPath: "/hq",
      onboardingPath: "/hq/onboarding",
    };
    assert.equal(applyOnboardingRedirect({ evaluation: required, requestedPath: "/hq" }), "/hq/onboarding");
    assert.equal(
      applyOnboardingRedirect({ evaluation: required, requestedPath: "/hq/settings" }),
      "/hq/settings"
    );
  });

  it("BlessBoard logo no longer blocks derived completion", () => {
    const resolved = resolveOnboardingStatus("in_progress", [
      { key: "organization_details", completed: true },
      { key: "first_branch", completed: true },
      { key: "contact_details", completed: true },
      { key: "logo", completed: false },
      { key: "service_times", completed: false },
      { key: "preview", completed: true },
      { key: "publish", completed: true },
    ]);
    assert.equal(resolved.status, "completed");
    assert.equal(resolved.allRequiredComplete, true);
    assert.deepEqual([...REQUIRED_CHECKLIST_KEYS], [
      "organization_details",
      "first_branch",
      "contact_details",
    ]);
  });

  async function seedActiveClinic(opts) {
    stamp += 1;
    const key = `obac${stamp}`;
    const org = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: key,
      displayName: `Onboard Clinic ${stamp}`,
      productKey: "activeclinic",
      productTenantKey: key,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(org.ok, true, JSON.stringify(org));
    const orgId = org.records.organization.id;
    const hco = await createHealthcareOrganization(pool, {
      organizationId: orgId,
      legalName: "Onboard Clinic Ltd",
      publicName: "Onboard Clinic",
      organizationType: "private_healthcare",
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
    });
    assert.equal(hco.ok, true, JSON.stringify(hco));
    const createdFac = await createFacility(pool, {
      organizationId: orgId,
      healthcareOrganizationId: hco.healthcareOrganization.id,
      facilityKey: `${key}-hq`,
      displayName: "HQ Facility",
      facilityType: "clinic",
      status: "active",
      isPrimary: true,
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
      phone: nextPhone(),
      city: "Lusaka",
    });
    assert.equal(createdFac.ok, true, JSON.stringify(createdFac));
    if (opts && opts.withDepartments) {
      await ensureDefaultDepartments(pool, {
        organizationId: orgId,
        healthcareOrganizationId: hco.healthcareOrganization.id,
        facilityId: createdFac.facility.id,
      });
    }
    const phone = nextPhone();
    const identity = await createPlatformIdentity(pool, {
      primaryPhone: phone,
      phoneNormalized: phone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    assert.equal(identity.ok, true);
    await setPlatformIdentityPassword(pool, {
      identityId: identity.identity.id,
      password: PASSWORD,
    });
    const staff = await createStaffMember(pool, {
      organizationId: orgId,
      healthcareOrganizationId: hco.healthcareOrganization.id,
      firstName: "Clinic",
      lastName: opts && opts.roleKey === RECEPTIONIST ? "Desk" : "Admin",
      employmentType: "permanent",
      phone,
      status: "active",
      platformIdentityId: identity.identity.id,
      jobTitle: "Staff",
    });
    assert.equal(staff.ok, true, JSON.stringify(staff));
    await assignStaffToFacility(pool, {
      organizationId: orgId,
      staffMemberId: staff.staffMember.id,
      facilityId: createdFac.facility.id,
      isPrimary: true,
    });
    const roleKey = (opts && opts.roleKey) || ORGANIZATION_ADMIN;
    const orgWide = roleKey === ORGANIZATION_ADMIN;
    const assigned = await assignStaffRole(pool, {
      organizationId: orgId,
      staffMemberId: staff.staffMember.id,
      roleKey,
      scopeType: orgWide ? "organisation" : "facility",
      facilityId: orgWide ? null : createdFac.facility.id,
    });
    assert.equal(assigned.ok, true, JSON.stringify(assigned));
    return {
      orgId,
      identityId: identity.identity.id,
      facility: createdFac.facility,
      hcoId: hco.healthcareOrganization.id,
    };
  }

  async function seedBlessBoardChurch() {
    stamp += 1;
    const key = `obbb${stamp}`;
    const host = `${key}.blessboard.org`;
    const org = await provisionPlatformTenant(pool, {
      organizationKey: key,
      displayName: `Onboard Church ${stamp}`,
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
    const churchProv = await provisionBlessBoardChurch(pool, {
      organizationKey: key,
      churchKey: key,
      displayName: `Onboard Church ${stamp}`,
      legalName: null,
      dataEnvironment: "testing",
      hqBranchKey: "hq",
      hqBranchDisplayName: "HQ",
      timezone: "Africa/Lusaka",
      countryCode: "ZM",
    });
    assert.equal(churchProv.ok, true, churchProv.message);
    const user = await createBlessBoardUser(pool, {
      email: `${key}@example.org`,
      password: PASSWORD,
      displayName: "HQ Admin",
    });
    assert.equal(user.ok, true, user.message);
    const assigned = await assignBlessBoardRole(pool, {
      email: `${key}@example.org`,
      organizationKey: key,
      roleKey: "church_hq_admin",
      churchKey: key,
    });
    assert.equal(assigned.ok, true, JSON.stringify(assigned));
    await pool.query(
      `INSERT INTO blessboard.organization_onboarding (
         organization_id, onboarding_status, follow_up_status,
         preview_acknowledged, onboarding_dismissed, support_requested
       ) VALUES ($1, 'not_started', 'new', false, false, false)
       ON CONFLICT (organization_id) DO NOTHING`,
      [org.records.organization.id]
    );
    return {
      orgId: org.records.organization.id,
      orgKey: key,
      host,
      churchId: churchProv.records.church.id,
      branchId: churchProv.records.hqBranch.id,
      user,
    };
  }

  it("ActiveClinic incomplete required setup is onboarding_required and resumable", async () => {
    if (!requireDb()) return;
    const clinic = await seedActiveClinic({ withDepartments: false });
    const evaluation = await evaluateOrganizationOnboarding(pool, {
      productCode: PRODUCT.ACTIVECLINIC,
      organizationId: clinic.orgId,
      actor: acAdminActor(),
      persist: true,
    });
    assert.equal(evaluation.ok, true);
    assert.equal(evaluation.status, STATUS.IN_PROGRESS);
    assert.equal(evaluation.onboardingRequired, true);
    assert.equal(step(evaluation, "departments").complete, false);
    assert.equal(step(evaluation, "departments").kind, STEP_KIND.REQUIRED);
    assert.equal(evaluation.currentStepKey, "departments");
    assert.equal(evaluation.resumeStep.destinationUrl, "/app/settings/clinic-setup/departments");

    const skipped = await skipOnboardingStep(pool, {
      productCode: PRODUCT.ACTIVECLINIC,
      organizationId: clinic.orgId,
      actor: acAdminActor(),
      stepKey: "additional_staff",
    });
    assert.equal(skipped.ok, true);
    assert.equal(step(skipped.evaluation, "additional_staff").skipped, true);
    assert.equal(skipped.evaluation.onboardingRequired, true);

    const blocked = await completeOrganizationOnboarding(pool, {
      productCode: PRODUCT.ACTIVECLINIC,
      organizationId: clinic.orgId,
      actor: acAdminActor(),
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, "required_incomplete");
  });

  it("ActiveClinic completing required steps persists completed and does not re-enter", async () => {
    if (!requireDb()) return;
    const clinic = await seedActiveClinic({ withDepartments: false });
    await evaluateOrganizationOnboarding(pool, {
      productCode: PRODUCT.ACTIVECLINIC,
      organizationId: clinic.orgId,
      actor: acAdminActor(),
      persist: true,
    });
    await ensureDefaultDepartments(pool, {
      organizationId: clinic.orgId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facility.id,
    });
    const evaluation = await evaluateOrganizationOnboarding(pool, {
      productCode: PRODUCT.ACTIVECLINIC,
      organizationId: clinic.orgId,
      actor: acAdminActor(),
      persist: true,
    });
    assert.equal(evaluation.status, STATUS.COMPLETED);
    assert.equal(evaluation.onboardingRequired, false);
    assert.ok(evaluation.completedAt);
    const stored = await getProgress(pool, clinic.orgId, PRODUCT.ACTIVECLINIC);
    assert.equal(stored.status, STATUS.COMPLETED);
    assert.ok(stored.completedAt);
    assert.equal(
      applyOnboardingRedirect({ evaluation, requestedPath: "/app/onboarding" }),
      "/app"
    );

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: clinic.identityId,
      organizationId: clinic.orgId,
    });
    const cookie = `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
    const home = await request(app).get("/app").set("Cookie", cookie);
    assert.equal(home.status, 200);
    const onboard = await request(app).get("/app/onboarding").set("Cookie", cookie);
    assert.equal(onboard.status, 200);
    assert.match(onboard.text, /data-ac-onboarding="1"/);
    assert.match(onboard.text, /data-ac-mf-family="MF05"/);
    assert.match(onboard.text, /data-ac-onboarding-step="departments"/);
    assert.match(onboard.text, /Review departments|Configure departments/);
  });

  it("ActiveClinic first login / dashboard redirects admin into onboarding while required is incomplete", async () => {
    if (!requireDb()) return;
    const clinic = await seedActiveClinic({ withDepartments: false });
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: clinic.identityId,
      organizationId: clinic.orgId,
    });
    const cookie = `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
    const home = await request(app).get("/app").set("Cookie", cookie);
    assert.equal(home.status, 303);
    assert.equal(home.headers.location, "/app/onboarding");
    const page = await request(app).get("/app/onboarding").set("Cookie", cookie);
    assert.equal(page.status, 200);
    assert.match(page.text, /data-ac-onboarding="1"/);
    assert.match(page.text, /data-ac-onboarding-step="departments"/);
  });

  it("ActiveClinic operational roles are not forced into onboarding", async () => {
    if (!requireDb()) return;
    const clinic = await seedActiveClinic({
      withDepartments: false,
      roleKey: RECEPTIONIST,
    });
    const evaluation = await evaluateOrganizationOnboarding(pool, {
      productCode: PRODUCT.ACTIVECLINIC,
      organizationId: clinic.orgId,
      actor: { permissions: ["activeclinic.access", "activeclinic.facility.view"] },
      persist: true,
    });
    assert.equal(evaluation.onboardingRequired, false);
    assert.equal(evaluation.canManage, false);

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: clinic.identityId,
      organizationId: clinic.orgId,
    });
    const cookie = `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
    const home = await request(app).get("/app").set("Cookie", cookie);
    assert.equal(home.status, 200);
  });

  async function clearChurchContact(churchId) {
    await pool.query(
      `UPDATE blessboard.church_settings
          SET primary_email = NULL, primary_phone = NULL
        WHERE church_id = $1`,
      [churchId]
    );
    await pool.query(
      `UPDATE blessboard.branch_settings bs
          SET email = NULL, phone = NULL, address_line_1 = NULL
         FROM blessboard.branches b
        WHERE bs.branch_id = b.id AND b.church_id = $1`,
      [churchId]
    );
  }

  async function setChurchContactEmail(churchId, email, publicName) {
    await pool.query(
      `INSERT INTO blessboard.church_settings (church_id, public_name, primary_email)
       VALUES ($1, $2, $3)
       ON CONFLICT (church_id) DO UPDATE SET primary_email = EXCLUDED.primary_email`,
      [churchId, publicName || "Onboard Church", email]
    );
  }

  it("BlessBoard required steps complete even when logo is missing; skip recommended does not block", async () => {
    if (!requireDb()) return;
    const church = await seedBlessBoardChurch();
    await clearChurchContact(church.churchId);
    const hqActor = { roles: ["church_hq_admin"], userId: church.user.user.id };
    const needed = await evaluateOrganizationOnboarding(pool, {
      productCode: PRODUCT.BLESSBOARD,
      organizationId: church.orgId,
      actor: hqActor,
      persist: true,
      deploymentCode: "blessboard-org-staging",
    });
    assert.equal(needed.ok, true);
    assert.equal(step(needed, "organization_details").kind, STEP_KIND.REQUIRED);
    assert.equal(step(needed, "logo").kind, STEP_KIND.RECOMMENDED);
    assert.equal(step(needed, "logo").skippable, true);
    assert.ok(step(needed, "logo").destinationUrl);
    assert.equal(step(needed, "invite_staff").kind, STEP_KIND.RECOMMENDED);
    assert.equal(step(needed, "invite_staff").destinationUrl, "/hq/settings/staff-access");
    assert.equal(needed.onboardingRequired, true);
    assert.equal(needed.status, STATUS.IN_PROGRESS);
    assert.equal(needed.currentStepKey, "contact_details");

    const skippedLogo = await skipOnboardingStep(pool, {
      productCode: PRODUCT.BLESSBOARD,
      organizationId: church.orgId,
      actor: hqActor,
      stepKey: "logo",
      deploymentCode: "blessboard-org-staging",
    });
    assert.equal(skippedLogo.ok, true);
    assert.equal(step(skippedLogo.evaluation, "logo").skipped, true);
    assert.equal(skippedLogo.evaluation.onboardingRequired, true);

    await setChurchContactEmail(church.churchId, `${church.orgKey}@example.org`, `Onboard Church`);
    const finished = await evaluateOrganizationOnboarding(pool, {
      productCode: PRODUCT.BLESSBOARD,
      organizationId: church.orgId,
      actor: hqActor,
      persist: true,
      deploymentCode: "blessboard-org-staging",
    });
    assert.equal(finished.status, STATUS.COMPLETED);
    assert.equal(finished.onboardingRequired, false);
    assert.equal(step(finished, "logo").complete, true);
    const bbRow = await pool.query(
      `SELECT onboarding_status, onboarding_completed_at
         FROM blessboard.organization_onboarding WHERE organization_id = $1`,
      [church.orgId]
    );
    assert.equal(bbRow.rowCount, 1);
    assert.equal(bbRow.rows[0].onboarding_status, "completed");
    assert.ok(bbRow.rows[0].onboarding_completed_at);
    const platformRow = await getProgress(pool, church.orgId, PRODUCT.BLESSBOARD);
    assert.equal(platformRow.status, STATUS.COMPLETED);
  });

  it("BlessBoard HQ dashboard redirects into onboarding and never loops once complete", async () => {
    if (!requireDb()) return;
    const church = await seedBlessBoardChurch();
    await clearChurchContact(church.churchId);
    const app = createV5FoundationApp({
      getPool: () => pool,
      env: {
        NODE_ENV: "test",
        PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
        SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
        SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
        BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
        BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
      },
    });
    const created = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId: church.user.user.id,
      organizationId: church.orgId,
      churchId: church.churchId,
      branchId: church.branchId,
    });
    assert.equal(created.ok, true, created.code);
    const cookie = `${DEFAULT_V5_COOKIE}=${created.rawToken}`;
    const home = await request(app).get("/hq").set("Host", church.host).set("Cookie", cookie);
    assert.equal(home.status, 303);
    assert.equal(home.headers.location, "/hq/onboarding");
    const page = await request(app).get("/hq/onboarding").set("Host", church.host).set("Cookie", cookie);
    assert.equal(page.status, 200);
    assert.match(page.text, /data-bb-hq-onboarding="1"/);
    assert.match(page.text, /data-bb-onboarding-step="contact_details"/);
    assert.match(page.text, /data-bb-onboarding-step="logo"/);

    await setChurchContactEmail(church.churchId, `${church.orgKey}@example.org`, "Onboard Church");
    const after = await request(app).get("/hq").set("Host", church.host).set("Cookie", cookie);
    assert.equal(after.status, 200);
    const loop = await request(app).get("/hq/onboarding").set("Host", church.host).set("Cookie", cookie);
    assert.equal(loop.status, 303);
    assert.equal(loop.headers.location, "/hq");
  });

  it("BlessBoard branch admin is not forced into onboarding", async () => {
    if (!requireDb()) return;
    const church = await seedBlessBoardChurch();
    await clearChurchContact(church.churchId);
    const evaluation = await evaluateOrganizationOnboarding(pool, {
      productCode: PRODUCT.BLESSBOARD,
      organizationId: church.orgId,
      actor: { roles: ["branch_admin"] },
      persist: true,
    });
    assert.equal(evaluation.canManage, false);
    assert.equal(evaluation.onboardingRequired, false);
  });

  it("both products share the same status vocabulary", async () => {
    if (!requireDb()) return;
    const clinic = await seedActiveClinic({ withDepartments: true });
    const church = await seedBlessBoardChurch();
    const ac = await evaluateOrganizationOnboarding(pool, {
      productCode: PRODUCT.ACTIVECLINIC,
      organizationId: clinic.orgId,
      actor: acAdminActor(),
      persist: true,
    });
    const bb = await evaluateOrganizationOnboarding(pool, {
      productCode: PRODUCT.BLESSBOARD,
      organizationId: church.orgId,
      actor: { roles: ["church_hq_admin"] },
      persist: true,
    });
    for (const evaluation of [ac, bb]) {
      assert.ok(Object.values(STATUS).includes(evaluation.status));
      assert.ok(evaluation.steps.every((s) => Object.values(STEP_KIND).includes(s.kind)));
      assert.equal(typeof evaluation.onboardingRequired, "boolean");
      assert.ok(evaluation.dashboardPath);
      assert.ok(evaluation.onboardingPath);
    }
    assert.equal(ac.productCode, PRODUCT.ACTIVECLINIC);
    assert.equal(bb.productCode, PRODUCT.BLESSBOARD);
    assert.notEqual(ac.dashboardPath, bb.dashboardPath);
  });
});
