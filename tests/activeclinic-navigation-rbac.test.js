"use strict";

/**
 * ActiveClinic Prompt 8 — permission-aware navigation + facility context.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
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
const {
  createFacility,
} = require("../src/activeclinic/services/facilityService");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  resolveEffectivePermissions,
  ORGANIZATION_ADMIN,
  FACILITY_ADMIN,
  CLINIC_MANAGER,
  RECEPTIONIST,
  NURSE,
  CLINICIAN,
  PHARMACIST,
  LAB_TECHNICIAN,
  RADIOLOGY_STAFF,
  BILLING_OFFICER,
  CASHIER,
  FINANCE_SUPERVISOR,
  AUDITOR,
  STAFF_ROLE,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  buildActiveClinicNavigation,
  matchActiveNavKey,
} = require("../src/activeclinic/services/activeClinicNavigation");
const {
  buildActiveClinicShellViewModel,
} = require("../src/activeclinic/services/buildActiveClinicShellViewModel");
const {
  selectFacilityForSession,
} = require("../src/activeclinic/services/activeClinicFacilityContextService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  ensureDefaultDepartments,
} = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, issueCsrfToken } = require("../src/platform/http/v5Csrf");

const PASSWORD = "activeclinic-pass-12";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 820000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

async function provisionOrg(input) {
  const result = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    ...input,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}

async function seedTenant(stamp, keyPrefix) {
  const org = await provisionOrg({
    organizationKey: `${keyPrefix}_${stamp}`,
    displayName: `Nav ${keyPrefix}`,
    productKey: "activeclinic",
    productTenantKey: `${keyPrefix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  const orgId = org.records.organization.id;
  const hco = await createHealthcareOrganization(pool, {
    organizationId: orgId,
    legalName: `Legal ${keyPrefix}`,
    publicName: `Public ${keyPrefix}`,
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));
  const facilityA = await createFacility(pool, {
    organizationId: orgId,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `${keyPrefix}-a`,
    displayName: "Facility A",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facilityA.ok, true, JSON.stringify(facilityA));
  const facilityB = await createFacility(pool, {
    organizationId: orgId,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `${keyPrefix}-b`,
    displayName: "Facility B",
    facilityType: "clinic",
    status: "active",
    isPrimary: false,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facilityB.ok, true, JSON.stringify(facilityB));
  await ensureDefaultDepartments(pool, {
    organizationId: orgId,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityId: facilityA.facility.id,
  });
  await ensureDefaultDepartments(pool, {
    organizationId: orgId,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityId: facilityB.facility.id,
  });
  return {
    orgId,
    hcoId: hco.healthcareOrganization.id,
    facilityAId: facilityA.facility.id,
    facilityBId: facilityB.facility.id,
  };
}

async function seedRoleUser(ac, opts) {
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryEmail: `nav.${phone.slice(-8)}@example.test`,
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
    organizationId: ac.orgId,
    healthcareOrganizationId: ac.hcoId,
    firstName: opts.firstName || "Nav",
    lastName: opts.lastName || "User",
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
    jobTitle: opts.jobTitle || "Staff",
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  const facilityIds = opts.facilityIds || [ac.facilityAId];
  for (let i = 0; i < facilityIds.length; i += 1) {
    await assignStaffToFacility(pool, {
      organizationId: ac.orgId,
      staffMemberId: staff.staffMember.id,
      facilityId: facilityIds[i],
      isPrimary: i === 0,
    });
  }
  const roles = Array.isArray(opts.roles) ? opts.roles : [{ roleKey: opts.roleKey }];
  for (const role of roles) {
    await assignStaffRole(pool, {
      organizationId: ac.orgId,
      staffMemberId: staff.staffMember.id,
      roleKey: role.roleKey,
      scopeType: role.scopeType || (role.facilityId ? "facility" : "organisation"),
      facilityId: role.facilityId || null,
      assignmentOrigin: "system",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
  }
  return {
    identityId: identity.identity.id,
    staffMemberId: staff.staffMember.id,
    identity: identity.identity,
    staff: staff.staffMember,
  };
}

async function navKeysFor(user, ac, facilityId) {
  const perms = await resolveEffectivePermissions(pool, {
    organizationId: ac.orgId,
    staffMemberId: user.staffMemberId,
    platformIdentityId: user.identityId,
    facilityId: facilityId || null,
  });
  assert.equal(perms.ok, true, JSON.stringify(perms));
  return {
    permissions: perms.permissions,
    keys: buildActiveClinicNavigation(perms.permissions).items.map((i) => i.key),
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
  return { cookie: `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`, session };
}

function makeApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: MINIMAL_AC,
    log: () => {},
  });
}

function expectKeys(keys, required, forbidden) {
  for (const key of required) {
    assert.ok(keys.includes(key), `expected nav key ${key} in ${keys.join(",")}`);
  }
  for (const key of forbidden) {
    assert.ok(!keys.includes(key), `did not expect nav key ${key} in ${keys.join(",")}`);
  }
}

describe("ActiveClinic permission-aware navigation (Prompt 8)", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  beforeEach(() => {
    resetDeploymentProfileWarningsForTests();
  });

  function requireDb() {
    if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("registers Diagnostics and matches /app/diagnostics* nav key", () => {
    assert.equal(matchActiveNavKey("/app/diagnostics"), "diagnostics");
    assert.equal(matchActiveNavKey("/app/diagnostics/laboratory"), "diagnostics");
    const nav = buildActiveClinicNavigation([
      "activeclinic.access",
      "activeclinic.diagnostics.view",
    ]);
    assert.ok(nav.items.find((i) => i.key === "diagnostics"));
    assert.equal(nav.desktop.length, nav.mobile.length);
  });

  it("role navigation matrix matches catalogue permissions", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedTenant(stamp, "navm");

    const cases = [
      {
        roleKey: RECEPTIONIST,
        scopeType: "facility",
        facilityId: ac.facilityAId,
        required: ["home", "patients", "appointments", "reception", "settings"],
        forbidden: ["clinical", "pharmacy", "diagnostics", "cashier", "access", "facilities"],
      },
      {
        roleKey: NURSE,
        scopeType: "facility",
        facilityId: ac.facilityAId,
        required: ["home", "patients", "appointments", "reception", "clinical", "settings"],
        forbidden: ["pharmacy", "billing", "cashier", "access", "diagnostics"],
      },
      {
        roleKey: CLINICIAN,
        scopeType: "facility",
        facilityId: ac.facilityAId,
        required: ["home", "patients", "appointments", "clinical", "settings"],
        forbidden: ["pharmacy", "diagnostics", "cashier", "access", "reception"],
      },
      {
        roleKey: PHARMACIST,
        scopeType: "facility",
        facilityId: ac.facilityAId,
        required: ["home", "patients", "pharmacy", "settings"],
        forbidden: ["clinical", "diagnostics", "cashier", "access", "reception"],
      },
      {
        roleKey: LAB_TECHNICIAN,
        scopeType: "facility",
        facilityId: ac.facilityAId,
        required: ["home", "patients", "diagnostics", "settings"],
        forbidden: ["clinical", "pharmacy", "cashier", "access", "reception"],
      },
      {
        roleKey: RADIOLOGY_STAFF,
        scopeType: "facility",
        facilityId: ac.facilityAId,
        required: ["home", "patients", "diagnostics", "settings"],
        forbidden: ["clinical", "pharmacy", "cashier", "access"],
      },
      {
        roleKey: BILLING_OFFICER,
        scopeType: "facility",
        facilityId: ac.facilityAId,
        required: ["home", "patients", "billing", "settings"],
        forbidden: ["clinical", "pharmacy", "diagnostics", "cashier", "access"],
      },
      {
        roleKey: CASHIER,
        scopeType: "facility",
        facilityId: ac.facilityAId,
        required: ["home", "cashier", "billing", "settings"],
        forbidden: [
          "clinical",
          "pharmacy",
          "diagnostics",
          "access",
          "reception",
          "facilities",
          "patients",
        ],
      },
      {
        roleKey: FINANCE_SUPERVISOR,
        scopeType: "facility",
        facilityId: ac.facilityAId,
        required: ["home", "patients", "billing", "cashier", "settings"],
        forbidden: ["clinical", "pharmacy", "diagnostics", "access"],
      },
      {
        roleKey: AUDITOR,
        scopeType: "organisation",
        facilityId: null,
        required: [
          "home",
          "patients",
          "appointments",
          "reception",
          "clinical",
          "pharmacy",
          "diagnostics",
          "billing",
          "staff",
          "settings",
        ],
        forbidden: ["access", "cashier", "facilities"],
      },
      {
        roleKey: FACILITY_ADMIN,
        scopeType: "facility",
        facilityId: ac.facilityAId,
        required: ["home", "staff", "access", "facilities", "clinical", "diagnostics", "settings"],
        forbidden: ["cashier"],
      },
      {
        roleKey: ORGANIZATION_ADMIN,
        scopeType: "organisation",
        facilityId: null,
        required: ["home", "staff", "access", "facilities", "patients", "clinical", "settings"],
        forbidden: ["cashier"],
      },
      {
        roleKey: CLINIC_MANAGER,
        scopeType: "facility",
        facilityId: ac.facilityAId,
        required: [
          "home",
          "patients",
          "appointments",
          "reception",
          "clinical",
          "pharmacy",
          "diagnostics",
          "billing",
          "staff",
          "settings",
        ],
        forbidden: ["access", "cashier", "facilities"],
      },
      {
        roleKey: STAFF_ROLE,
        scopeType: "facility",
        facilityId: ac.facilityAId,
        required: ["home", "settings"],
        forbidden: ["patients", "clinical", "facilities", "access", "diagnostics"],
      },
    ];

    for (const c of cases) {
      const user = await seedRoleUser(ac, {
        firstName: c.roleKey.split("_").pop(),
        lastName: "Role",
        facilityIds: [ac.facilityAId, ac.facilityBId],
        roles: [
          {
            roleKey: c.roleKey,
            scopeType: c.scopeType,
            facilityId: c.facilityId,
          },
        ],
      });
      const { keys } = await navKeysFor(
        user,
        ac,
        c.scopeType === "facility" ? ac.facilityAId : ac.facilityAId
      );
      expectKeys(keys, c.required, c.forbidden);
    }
  });

  it("facility switch recalculates clinical vs cashier navigation without new login", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}sw`;
    const ac = await seedTenant(stamp, "navs");
    const user = await seedRoleUser(ac, {
      firstName: "Split",
      lastName: "Roles",
      facilityIds: [ac.facilityAId, ac.facilityBId],
      roles: [
        {
          roleKey: CLINICIAN,
          scopeType: "facility",
          facilityId: ac.facilityAId,
        },
        {
          roleKey: CASHIER,
          scopeType: "facility",
          facilityId: ac.facilityBId,
        },
      ],
    });

    const atA = await navKeysFor(user, ac, ac.facilityAId);
    expectKeys(atA.keys, ["clinical", "patients", "appointments"], ["cashier", "pharmacy", "diagnostics"]);

    const atB = await navKeysFor(user, ac, ac.facilityBId);
    expectKeys(atB.keys, ["cashier"], ["clinical", "appointments", "reception"]);

    const { cookie, session } = await sessionCookie(
      user.identityId,
      ac.orgId,
      ac.facilityAId
    );
    const app = makeApp();
    const csrf = issueCsrfToken(MINIMAL_AC);

    const homeA = await request(app).get("/app").set("Cookie", cookie);
    assert.equal(homeA.status, 200);
    assert.match(homeA.text, /Clinical|data-ac-nav-key="clinical"|href="\/app\/clinical"/);
    assert.doesNotMatch(homeA.text, /href="\/app\/cashier"/);

    const switched = await selectFacilityForSession(pool, {
      auth: {
        authenticated: true,
        organization: { id: ac.orgId },
        staffMember: { id: user.staffMemberId },
        isNetworkAdmin: false,
      },
      sessionId: session.session.id,
      facilityId: ac.facilityBId,
    });
    assert.equal(switched.ok, true, JSON.stringify(switched));

    const homeB = await request(app).get("/app").set("Cookie", cookie);
    assert.equal(homeB.status, 200);
    assert.match(homeB.text, /Cashier|href="\/app\/cashier"/);
    assert.doesNotMatch(homeB.text, /href="\/app\/clinical"/);

    const switchedBack = await selectFacilityForSession(pool, {
      auth: {
        authenticated: true,
        organization: { id: ac.orgId },
        staffMember: { id: user.staffMemberId },
        isNetworkAdmin: false,
      },
      sessionId: session.session.id,
      facilityId: ac.facilityAId,
    });
    assert.equal(switchedBack.ok, true, JSON.stringify(switchedBack));
    const homeAgain = await request(app).get("/app").set("Cookie", cookie);
    assert.match(homeAgain.text, /href="\/app\/clinical"/);
    assert.doesNotMatch(homeAgain.text, /href="\/app\/cashier"/);

    // HTTP facility form switch (same session cookie).
    await request(app)
      .post("/app/select-facility")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        facility_id: ac.facilityBId,
      });
    const afterPost = await request(app).get("/app").set("Cookie", cookie);
    assert.match(afterPost.text, /href="\/app\/cashier"/);
  });

  it("same-facility multi-role unions modules; org-admin keeps clinical read at other facilities", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}mr`;
    const ac = await seedTenant(stamp, "navu");
    const multi = await seedRoleUser(ac, {
      firstName: "Union",
      lastName: "User",
      facilityIds: [ac.facilityAId],
      roles: [
        {
          roleKey: CLINICIAN,
          scopeType: "facility",
          facilityId: ac.facilityAId,
        },
        {
          roleKey: FACILITY_ADMIN,
          scopeType: "facility",
          facilityId: ac.facilityAId,
        },
      ],
    });
    const union = await navKeysFor(multi, ac, ac.facilityAId);
    expectKeys(
      union.keys,
      ["clinical", "staff", "access", "facilities", "patients"],
      ["cashier"]
    );

    const orgClin = await seedRoleUser(ac, {
      firstName: "Org",
      lastName: "Clin",
      facilityIds: [ac.facilityAId, ac.facilityBId],
      roles: [
        { roleKey: ORGANIZATION_ADMIN, scopeType: "organisation" },
        {
          roleKey: CLINICIAN,
          scopeType: "facility",
          facilityId: ac.facilityAId,
        },
      ],
    });
    const atA = await navKeysFor(orgClin, ac, ac.facilityAId);
    const atB = await navKeysFor(orgClin, ac, ac.facilityBId);
    assert.ok(atA.keys.includes("clinical"));
    // Org-admin catalogue includes encounter.view organization-wide — Clinical stays visible at B.
    assert.ok(atB.keys.includes("clinical"));
    assert.ok(atA.keys.includes("access"));
    assert.ok(atB.keys.includes("access"));
    assert.ok(!atA.keys.includes("cashier"));
  });

  it("diagnostics nav + direct route for lab/radiology; denied for receptionist/cashier", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}dg`;
    const ac = await seedTenant(stamp, "navd");
    const lab = await seedRoleUser(ac, {
      roleKey: LAB_TECHNICIAN,
      scopeType: "facility",
      facilityId: ac.facilityAId,
      facilityIds: [ac.facilityAId],
      firstName: "Lab",
      lastName: "Tech",
      roles: [
        {
          roleKey: LAB_TECHNICIAN,
          scopeType: "facility",
          facilityId: ac.facilityAId,
        },
      ],
    });
    const rad = await seedRoleUser(ac, {
      firstName: "Rad",
      lastName: "Staff",
      facilityIds: [ac.facilityAId],
      roles: [
        {
          roleKey: RADIOLOGY_STAFF,
          scopeType: "facility",
          facilityId: ac.facilityAId,
        },
      ],
    });
    const reception = await seedRoleUser(ac, {
      firstName: "Rec",
      lastName: "Desk",
      facilityIds: [ac.facilityAId],
      roles: [
        {
          roleKey: RECEPTIONIST,
          scopeType: "facility",
          facilityId: ac.facilityAId,
        },
      ],
    });
    const cash = await seedRoleUser(ac, {
      firstName: "Cash",
      lastName: "ier",
      facilityIds: [ac.facilityAId],
      roles: [
        {
          roleKey: CASHIER,
          scopeType: "facility",
          facilityId: ac.facilityAId,
        },
      ],
    });

    assert.ok((await navKeysFor(lab, ac, ac.facilityAId)).keys.includes("diagnostics"));
    assert.ok((await navKeysFor(rad, ac, ac.facilityAId)).keys.includes("diagnostics"));
    assert.ok(!(await navKeysFor(reception, ac, ac.facilityAId)).keys.includes("diagnostics"));
    assert.ok(!(await navKeysFor(cash, ac, ac.facilityAId)).keys.includes("diagnostics"));

    const app = makeApp();
    const { cookie: labCookie } = await sessionCookie(
      lab.identityId,
      ac.orgId,
      ac.facilityAId
    );
    const hub = await request(app).get("/app/diagnostics").set("Cookie", labCookie);
    assert.equal(hub.status, 200);
    assert.match(hub.text, /data-ac-page-section="diagnostics-hub"|data-ac-diagnostics-hub/);
    assert.match(hub.text, /data-ac-diagnostics-card="laboratory"/);
    assert.doesNotMatch(hub.text, /data-ac-diagnostics-card="radiology"/);
    assert.match(hub.text, /href="\/app\/diagnostics"/);

    const { cookie: radCookie } = await sessionCookie(
      rad.identityId,
      ac.orgId,
      ac.facilityAId
    );
    const radHub = await request(app).get("/app/diagnostics").set("Cookie", radCookie);
    assert.equal(radHub.status, 200);
    assert.match(radHub.text, /data-ac-diagnostics-card="radiology"/);
    assert.doesNotMatch(radHub.text, /data-ac-diagnostics-card="laboratory"/);

    const { cookie: recCookie } = await sessionCookie(
      reception.identityId,
      ac.orgId,
      ac.facilityAId
    );
    const denied = await request(app).get("/app/diagnostics").set("Cookie", recCookie);
    assert.equal(denied.status, 403);

    const { cookie: cashCookie } = await sessionCookie(
      cash.identityId,
      ac.orgId,
      ac.facilityAId
    );
    assert.equal(
      (await request(app).get("/app/diagnostics").set("Cookie", cashCookie)).status,
      403
    );
    assert.equal(
      (await request(app).get("/app/clinical").set("Cookie", cashCookie)).status,
      403
    );
  });

  it("shell view-model uses selected-facility permissions for desktop and mobile nav", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}sh`;
    const ac = await seedTenant(stamp, "navh");
    const user = await seedRoleUser(ac, {
      firstName: "Shell",
      lastName: "Nav",
      facilityIds: [ac.facilityAId, ac.facilityBId],
      roles: [
        {
          roleKey: CLINICIAN,
          scopeType: "facility",
          facilityId: ac.facilityAId,
        },
        {
          roleKey: CASHIER,
          scopeType: "facility",
          facilityId: ac.facilityBId,
        },
      ],
    });
    const authBase = {
      authenticated: true,
      platformIdentity: { id: user.identityId },
      organization: { id: ac.orgId, displayName: "Org" },
      healthcareOrganization: { publicName: "HCO" },
      staffMember: { id: user.staffMemberId, displayName: "Shell Nav", status: "active" },
      permissions: [],
      roleAssignments: [],
      facilityAssignments: [],
      isNetworkAdmin: false,
      selectedFacility: null,
    };
    const reqA = {
      path: "/app",
      v5Session: {
        session: { contextJson: { selectedFacilityId: ac.facilityAId } },
      },
    };
    const shellA = await buildActiveClinicShellViewModel(pool, {
      req: reqA,
      auth: authBase,
      csrfToken: "t",
      activeNav: "home",
    });
    const keysA = shellA.navigation.items.map((i) => i.key);
    assert.deepEqual(shellA.navigation.desktop.map((i) => i.key), keysA);
    assert.deepEqual(shellA.navigation.mobile.map((i) => i.key), keysA);
    assert.ok(keysA.includes("clinical"));
    assert.ok(!keysA.includes("cashier"));

    const reqB = {
      path: "/app",
      v5Session: {
        session: { contextJson: { selectedFacilityId: ac.facilityBId } },
      },
    };
    const shellB = await buildActiveClinicShellViewModel(pool, {
      req: reqB,
      auth: authBase,
      csrfToken: "t",
      activeNav: "home",
    });
    const keysB = shellB.navigation.items.map((i) => i.key);
    assert.ok(keysB.includes("cashier"));
    assert.ok(!keysB.includes("clinical"));
  });
});
