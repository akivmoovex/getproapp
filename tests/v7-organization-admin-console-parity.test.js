"use strict";

/**
 * First-login organization admin console parity:
 * ActiveClinic organization admin vs BlessBoard HQ admin.
 * Isolated local foundation DB only. Does not deploy.
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
  resolveEffectivePermissions,
  ORGANIZATION_ADMIN,
  RECEPTIONIST,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const { ensureDefaultDepartments } = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  buildActiveClinicNavigation,
} = require("../src/activeclinic/services/activeClinicNavigation");
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
const { HQ_ADMIN_NAV } = require("../src/blessboard/http/hqAdminNav");
const {
  PRODUCT_CODE,
  buildPublicOrganizationWebsitePath,
} = require("../src/platform/website/publicWebsiteUrl");

const PASSWORD = "ConsoleParity12!";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

const PLATFORM_NAV_KEYS = Object.freeze([
  "home",
  "staff",
  "access",
  "facilities",
  "website",
  "settings",
]);

let pool;
let skipReason = null;
let stamp = 0;
let phoneSeq = 930000000;

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

function navKeysFromHtml(html, attr) {
  const re = new RegExp(`${attr}="([^"]+)"`, "g");
  const keys = [];
  let match = re.exec(html);
  while (match) {
    keys.push(match[1]);
    match = re.exec(html);
  }
  return keys;
}

describe("v7 organization admin console parity", () => {
  before(async () => {
    try {
      process.env.PLATFORM_DEPLOYMENT_CODE = "blessboard-org-staging";
      process.env.DEPLOYMENT_ENV = "testing";
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await ensureDatabaseIdentity(pool, {
        identityKey: "blessboard-platform-v5",
        environmentCode: "testing",
        allowCreate: true,
      });
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("platform nav catalogues expose equivalent organization-admin destinations", () => {
    const hqByKey = Object.fromEntries(HQ_ADMIN_NAV.map((item) => [item.key, item]));
    assert.equal(hqByKey.home.label, "Dashboard");
    assert.equal(hqByKey.home.href, "/hq");
    assert.equal(hqByKey.branches.label, "Branches");
    assert.equal(hqByKey["staff-access"].label, "Staff access");
    assert.equal(hqByKey["staff-access"].href, "/hq/settings/staff-access");
    assert.equal(hqByKey.settings.label, "Settings");
    assert.equal(hqByKey.content.label, "Website");
    assert.equal(hqByKey.content.href, "/hq/website");
    assert.ok(hqByKey.roles);
    assert.equal(hqByKey.roles.label, "Legacy permissions");

    const orgAdminNav = buildActiveClinicNavigation([
      "activeclinic.access",
      "activeclinic.staff.view",
      "activeclinic.staff.assign_access",
      "activeclinic.facility.create",
      "website.view",
      "website.edit",
    ]);
    const acKeys = orgAdminNav.items.map((item) => item.key);
    for (const key of PLATFORM_NAV_KEYS) {
      assert.ok(acKeys.includes(key), `ActiveClinic org-admin nav missing ${key}`);
    }
    assert.equal(orgAdminNav.items.find((item) => item.key === "home").label, "Dashboard");
    assert.equal(orgAdminNav.items.find((item) => item.key === "access").label, "Roles & access");
    assert.equal(orgAdminNav.items.find((item) => item.key === "website").href, "/app/settings/website");

    const receptionistNav = buildActiveClinicNavigation([
      "activeclinic.access",
      "activeclinic.patient.search",
      "activeclinic.appointment.view",
      "activeclinic.reception.view",
    ]);
    const recKeys = receptionistNav.items.map((item) => item.key);
    assert.ok(!recKeys.includes("website"));
    assert.ok(!recKeys.includes("access"));
    assert.ok(!recKeys.includes("facilities"));
    assert.ok(!recKeys.includes("staff"));

    assert.equal(
      buildPublicOrganizationWebsitePath({
        product: PRODUCT_CODE.ACTIVECLINIC,
        organizationKey: "sunrise",
      }),
      "/clinics/sunrise"
    );
    assert.equal(
      buildPublicOrganizationWebsitePath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: "hq-a",
      }),
      "/c/hq-a"
    );
  });

  it("ActiveClinic organization admin discovers console destinations; receptionist does not", async () => {
    if (!requireDb()) return;
    stamp += 1;
    const keyPrefix = `ocac${stamp}`;
    const org = await provisionPlatformTenant(pool, {
      skipDomain: true,
      dataEnvironment: "testing",
      organizationKey: `${keyPrefix}_${stamp}`,
      displayName: `Console Clinic ${stamp}`,
      productKey: "activeclinic",
      productTenantKey: `${keyPrefix}-${stamp}`,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(org.ok, true, JSON.stringify(org));
    const orgId = org.records.organization.id;
    const orgKey = org.records.organization.key || `${keyPrefix}_${stamp}`;
    const hco = await createHealthcareOrganization(pool, {
      organizationId: orgId,
      legalName: "Console Clinic Ltd",
      publicName: "Console Clinic",
      organizationType: "private_healthcare",
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
    });
    assert.equal(hco.ok, true, JSON.stringify(hco));
    const facility = await createFacility(pool, {
      organizationId: orgId,
      healthcareOrganizationId: hco.healthcareOrganization.id,
      facilityKey: `${keyPrefix}-hq`,
      displayName: "HQ Facility",
      facilityType: "clinic",
      status: "active",
      isPrimary: true,
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
      phone: nextPhone(),
      city: "Lusaka",
    });
    assert.equal(facility.ok, true, JSON.stringify(facility));
    await ensureDefaultDepartments(pool, {
      organizationId: orgId,
      healthcareOrganizationId: hco.healthcareOrganization.id,
      facilityId: facility.facility.id,
    });

    async function seedRole(roleKey, names) {
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
        firstName: names.first,
        lastName: names.last,
        employmentType: "permanent",
        phone,
        status: "active",
        platformIdentityId: identity.identity.id,
        jobTitle: names.title,
      });
      assert.equal(staff.ok, true, JSON.stringify(staff));
      await assignStaffToFacility(pool, {
        organizationId: orgId,
        staffMemberId: staff.staffMember.id,
        facilityId: facility.facility.id,
        isPrimary: true,
      });
      const orgWide = roleKey === ORGANIZATION_ADMIN;
      const assigned = await assignStaffRole(pool, {
        organizationId: orgId,
        staffMemberId: staff.staffMember.id,
        roleKey,
        scopeType: orgWide ? "organisation" : "facility",
        facilityId: orgWide ? null : facility.facility.id,
      });
      assert.equal(assigned.ok, true, JSON.stringify(assigned));
      return identity.identity.id;
    }

    const adminId = await seedRole(ORGANIZATION_ADMIN, {
      first: "Org",
      last: "Admin",
      title: "Administrator",
    });
    const recId = await seedRole(RECEPTIONIST, {
      first: "Front",
      last: "Desk",
      title: "Receptionist",
    });

    const adminPerms = await resolveEffectivePermissions(pool, {
      organizationId: orgId,
      platformIdentityId: adminId,
    });
    assert.equal(adminPerms.ok, true);
    const adminNav = buildActiveClinicNavigation(adminPerms.permissions);
    const adminKeys = adminNav.items.map((item) => item.key);
    for (const key of PLATFORM_NAV_KEYS) {
      assert.ok(adminKeys.includes(key), `live org-admin nav missing ${key}: ${adminKeys.join(",")}`);
    }
    assert.ok(adminPerms.permissions.includes("website.view") || adminPerms.permissions.includes("website.edit"));

    const recPerms = await resolveEffectivePermissions(pool, {
      organizationId: orgId,
      platformIdentityId: recId,
      facilityId: facility.facility.id,
    });
    assert.equal(recPerms.ok, true);
    const recNav = buildActiveClinicNavigation(recPerms.permissions);
    const recKeys = recNav.items.map((item) => item.key);
    assert.ok(!recKeys.includes("website"));
    assert.ok(!recKeys.includes("access"));
    assert.ok(!recKeys.includes("facilities"));

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const adminSession = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: adminId,
      organizationId: orgId,
    });
    const recSession = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: recId,
      organizationId: orgId,
      contextJson: { selectedFacilityId: facility.facility.id },
    });
    const adminCookie = `${COOKIE_ACTIVECLINIC_ORG}=${adminSession.rawToken}`;
    const recCookie = `${COOKIE_ACTIVECLINIC_ORG}=${recSession.rawToken}`;

    let home = await request(app).get("/app").set("Cookie", adminCookie);
    if (home.status === 303 && String(home.headers.location || "").includes("/app/onboarding")) {
      home = await request(app).get("/app/onboarding").set("Cookie", adminCookie);
    }
    assert.equal(home.status, 200, home.text && home.text.slice(0, 240));
    const adminNavKeys = navKeysFromHtml(home.text, "data-ac-nav-key");
    for (const key of PLATFORM_NAV_KEYS) {
      assert.ok(adminNavKeys.includes(key), `rendered org-admin nav missing ${key}`);
    }
    assert.match(home.text, /data-ac-organization-console="1"/);
    assert.match(home.text, /data-ac-console-public-url="1"/);
    assert.match(home.text, new RegExp(`/clinics/${orgKey}`));
    assert.match(home.text, /data-ac-console-link="organization"/);
    assert.match(home.text, /data-ac-console-link="website"/);
    assert.match(home.text, /href="\/app\/settings\/website"/);
    assert.match(home.text, /href="\/app\/settings\/organization"/);
    assert.match(home.text, /href="\/app\/staff"/);
    assert.match(home.text, /href="\/app\/access"/);
    assert.match(home.text, /href="\/app\/facilities"/);
    assert.match(home.text, /href="\/app\/settings"/);
    assert.doesNotMatch(home.text, /BlessBoard|church_hq_admin|\/hq\//);

    const recHome = await request(app).get("/app").set("Cookie", recCookie);
    assert.equal(recHome.status, 200, recHome.text && recHome.text.slice(0, 240));
    const recNavKeys = navKeysFromHtml(recHome.text, "data-ac-nav-key");
    assert.ok(!recNavKeys.includes("website"));
    assert.ok(!recNavKeys.includes("access"));
    assert.ok(!recNavKeys.includes("facilities"));
    assert.doesNotMatch(recHome.text, /data-ac-organization-console="1"/);
    assert.doesNotMatch(recHome.text, /data-ac-console-link="website"/);
    assert.doesNotMatch(recHome.text, /href="\/app\/settings\/website"/);
  });

  it("BlessBoard HQ admin discovers console destinations; branch admin cannot open HQ console", async () => {
    if (!requireDb()) return;
    stamp += 1;
    const key = `ocbb${stamp}`;
    const host = `${key}.blessboard.org`;
    const org = await provisionPlatformTenant(pool, {
      organizationKey: key,
      displayName: `Console Church ${stamp}`,
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
      displayName: `Console Church ${stamp}`,
      legalName: null,
      dataEnvironment: "testing",
      hqBranchKey: "hq",
      hqBranchDisplayName: "HQ",
      timezone: "Africa/Lusaka",
      countryCode: "ZM",
    });
    assert.equal(churchProv.ok, true, churchProv.message);
    await pool.query(
      `INSERT INTO blessboard.church_settings (church_id, public_name, primary_email)
       VALUES ($1, $2, $3)
       ON CONFLICT (church_id) DO UPDATE
         SET public_name = EXCLUDED.public_name,
             primary_email = EXCLUDED.primary_email`,
      [churchProv.records.church.id, `Console Church ${stamp}`, `${key}@example.org`]
    );
    const hqUser = await createBlessBoardUser(pool, {
      email: `${key}-hq@example.org`,
      password: PASSWORD,
      displayName: "HQ Admin",
    });
    assert.equal(hqUser.ok, true, hqUser.message);
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

    const app = createV5FoundationApp({
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

    async function cookieFor(userId) {
      const created = await createV5Session(pool, {
        deploymentCode: "blessboard-org-staging",
        userId,
        organizationId: org.records.organization.id,
        churchId: churchProv.records.church.id,
        branchId: churchProv.records.hqBranch.id,
      });
      assert.equal(created.ok, true, created.code);
      return `${DEFAULT_V5_COOKIE}=${created.rawToken}`;
    }

    let hqPage = await request(app)
      .get("/hq")
      .set("Host", host)
      .set("Cookie", await cookieFor(hqUser.user.id));
    if (hqPage.status === 303 && String(hqPage.headers.location || "").includes("/hq/onboarding")) {
      hqPage = await request(app)
        .get("/hq/onboarding")
        .set("Host", host)
        .set("Cookie", await cookieFor(hqUser.user.id));
    }
    assert.equal(hqPage.status, 200, hqPage.text && hqPage.text.slice(0, 240));
    assert.match(hqPage.text, /data-bb-shell="hq-admin"/);
    assert.match(hqPage.text, /data-bb-hq-dashboard="1"/);
    assert.match(hqPage.text, />Dashboard</);
    assert.match(hqPage.text, /href="\/hq\/branches"/);
    assert.match(hqPage.text, /href="\/hq\/website"/);
    assert.match(hqPage.text, /href="\/hq\/settings\/staff-access"/);
    assert.match(hqPage.text, /href="\/hq\/settings"/);
    assert.match(hqPage.text, />Staff access</);
    assert.match(hqPage.text, />Website</);
    assert.match(hqPage.text, />Settings</);
    assert.match(hqPage.text, /data-bb-organization-console="1"/);
    assert.match(hqPage.text, /data-bb-console-public-url="1"/);
    assert.match(hqPage.text, new RegExp(`/c/${key}`));
    assert.match(hqPage.text, /data-bb-console-link="website"/);
    assert.match(hqPage.text, /data-bb-console-link="settings"/);
    assert.match(hqPage.text, /data-bb-quick-action="staff-access"/);
    assert.doesNotMatch(hqPage.text, /data-bb-quick-action="roles"/);
    assert.doesNotMatch(hqPage.text, /ActiveClinic|\/app\/staff|clinic_profile/);

    const branchDenied = await request(app)
      .get("/hq")
      .set("Host", host)
      .set("Cookie", await cookieFor(branchUser.user.id));
    assert.ok(
      branchDenied.status === 403 || branchDenied.status === 303,
      `branch admin HQ status=${branchDenied.status}`
    );
    assert.doesNotMatch(branchDenied.text || "", /data-bb-organization-console="1"/);
  });
});
