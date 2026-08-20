"use strict";

/**
 * ActiveClinic V6 — foundation empty/error/restricted states (AC-V6-S08).
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const express = require("express");

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
  ensureDefaultDepartments,
} = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  createStaffMember,
  suspendStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  NETWORK_ADMIN,
  STAFF_ROLE,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  STATE,
  buildInlineState,
  buildFullPageState,
} = require("../src/activeclinic/services/activeClinicStateTaxonomy");
const {
  renderAccessStatePage,
} = require("../src/activeclinic/http/renderActiveClinicAccessState");
const {
  createActiveClinicErrorHandler,
} = require("../src/activeclinic/http/createActiveClinicErrorHandler");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
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
let phoneSeq = 880000000;

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

async function seedAcTenant(stamp, keyPrefix, opts) {
  const org = await provisionOrg({
    organizationKey: `${keyPrefix}_${stamp}`,
    displayName: `AC ${keyPrefix}`,
    productKey: "activeclinic",
    productTenantKey: `${keyPrefix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: (opts && opts.legalName) || "Legal Hospital States",
    publicName: (opts && opts.publicName) || "States Clinic",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    registrationNumber: (opts && opts.registrationNumber) || "REG-S08",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));
  let facility = null;
  if (!opts || opts.withFacility !== false) {
    facility = await createFacility(pool, {
      organizationId: org.records.organization.id,
      healthcareOrganizationId: hco.healthcareOrganization.id,
      facilityKey: `${keyPrefix}-main`,
      displayName: "Main Hospital",
      facilityType: "hospital",
      status: "active",
      isPrimary: true,
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
      phone: nextPhone(),
      city: "Lusaka",
    });
    assert.equal(facility.ok, true, JSON.stringify(facility));
    await ensureDefaultDepartments(pool, {
      organizationId: org.records.organization.id,
      healthcareOrganizationId: hco.healthcareOrganization.id,
      facilityId: facility.facility.id,
    });
  }
  return {
    orgId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility ? facility.facility.id : null,
    facilityKey: facility ? facility.facility.facilityKey : null,
  };
}

async function seedStaff(ac, opts) {
  const phone = opts.phone || nextPhone();
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
    organizationId: ac.orgId,
    healthcareOrganizationId: ac.hcoId,
    firstName: opts.firstName || "Staff",
    lastName: opts.lastName || "Member",
    employmentType: "permanent",
    phone,
    status: "active",
    platformIdentityId: identity.identity.id,
    jobTitle: opts.jobTitle || "Administrator",
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  if (ac.facilityId) {
    await assignStaffToFacility(pool, {
      organizationId: ac.orgId,
      staffMemberId: staff.staffMember.id,
      facilityId: ac.facilityId,
      isPrimary: true,
    });
  }
  await assignStaffRole(pool, {
    organizationId: ac.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey: opts.roleKey || STAFF_ROLE,
    scopeType:
      opts.scopeType ||
      (opts.roleKey === NETWORK_ADMIN ? "organisation" : "facility"),
    facilityId:
      opts.roleKey === NETWORK_ADMIN || opts.scopeType === "organisation"
        ? null
        : ac.facilityId,
  });
  return { identity: identity.identity, staff: staff.staffMember, phone };
}

async function sessionCookie(identityId, orgId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId: orgId,
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  const csrf = issueCsrfToken(MINIMAL_AC);
  return {
    cookie: [
      `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`,
      `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`,
    ].join("; "),
    csrf,
    rawToken: session.rawToken,
  };
}

function makeApp(env) {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: env || MINIMAL_AC,
    log: () => {},
  });
}

describe("AC-V6-S08 foundation states quality gate", () => {
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

  it("taxonomy builds safe inline and full-page models", () => {
    const inline = buildInlineState({
      stateKey: STATE.EMPTY,
      title: "No facilities have been added yet",
      description: "Safe copy",
      marker: "facilities-none",
      primaryAction: { href: "/app/facilities/new", label: "Add facility" },
    });
    assert.equal(inline.stateKey, STATE.EMPTY);
    assert.equal(inline.primaryAction.href, "/app/facilities/new");
    assert.doesNotMatch(JSON.stringify(inline), /permission_key|stack|sqlstate/i);

    const page = buildFullPageState(STATE.ACCESS_RESTRICTED, {});
    assert.equal(page.httpStatus, 403);
    assert.doesNotMatch(page.message, /activeclinic\.|permission_key/i);

    const html = renderAccessStatePage({
      stateKey: STATE.SESSION_EXPIRED,
      pageId: "session-expired",
    });
    assert.match(html, /data-ac-state="session-expired"/);
    assert.match(html, /Your session has ended/);
    assert.doesNotMatch(html, /BlessBoard|church/i);
  });

  it("error handler maps statuses to safe HTML states", async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.requestId = "req_test_01";
      next();
    });
    app.get("/boom-404", (_req, _res, next) => {
      const err = new Error("missing");
      err.status = 404;
      next(err);
    });
    app.get("/boom-503", (_req, _res, next) => {
      const err = new Error("down");
      err.status = 503;
      next(err);
    });
    app.get("/boom-500", (_req, _res, next) => {
      next(new Error("Unexpected internal failure with password=secret"));
    });
    app.use(createActiveClinicErrorHandler({ isProduction: true, log: () => {} }));

    const notFound = await request(app).get("/boom-404").set("Accept", "text/html");
    assert.equal(notFound.status, 404);
    assert.match(notFound.text, /data-ac-state="not-found"/);
    assert.doesNotMatch(notFound.text, /password=secret|Error: missing/i);

    const unavailable = await request(app).get("/boom-503").set("Accept", "text/html");
    assert.equal(unavailable.status, 503);
    assert.match(unavailable.text, /data-ac-state="service-unavailable"/);
    assert.match(unavailable.text, /Try again/);

    const unexpected = await request(app).get("/boom-500").set("Accept", "text/html");
    assert.equal(unexpected.status, 500);
    assert.match(unexpected.text, /data-ac-state="error"/);
    assert.doesNotMatch(unexpected.text, /password=secret|Unexpected internal/i);
  });

  it("unknown route returns ActiveClinic not-found HTML", async () => {
    requireDb();
    const app = makeApp();
    const res = await request(app)
      .get("/app/this-route-does-not-exist")
      .set("Accept", "text/html");
    assert.equal(res.status, 404);
    assert.match(res.text, /data-ac-state="not-found"|Page not found/);
    assert.doesNotMatch(res.text, /this-route-does-not-exist/);
  });

  it("empty and no-results states differ for facilities and staff", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "s08e");
    const admin = await seedStaff(ac, {
      roleKey: NETWORK_ADMIN,
      firstName: "Empty",
      lastName: "Admin",
    });
    const { cookie } = await sessionCookie(admin.identity.id, ac.orgId);
    const app = makeApp();

    const filtered = await request(app)
      .get("/app/facilities?q=zzznomatch")
      .set("Cookie", cookie);
    assert.equal(filtered.status, 200);
    assert.match(filtered.text, /data-ac-empty="facilities-filtered"/);
    assert.match(filtered.text, /data-ac-state-key="no_results"/);
    assert.match(filtered.text, /Clear filters/);
    assert.doesNotMatch(
      filtered.text,
      /data-ac-state-key="no_results"[\s\S]*Add facility/
    );

    const staffFiltered = await request(app)
      .get("/app/staff?q=zzznomatch")
      .set("Cookie", cookie);
    assert.equal(staffFiltered.status, 200);
    assert.match(staffFiltered.text, /data-ac-empty="staff-filtered"/);
    assert.match(staffFiltered.text, /data-ac-state-key="no_results"/);
  });

  it("access overview filtered uses no-results taxonomy", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "s08a");
    const admin = await seedStaff(ac, {
      roleKey: NETWORK_ADMIN,
      firstName: "Access",
      lastName: "Admin",
    });
    const { cookie } = await sessionCookie(admin.identity.id, ac.orgId);
    const app = makeApp();

    const filtered = await request(app)
      .get("/app/access?q=zzznomatch")
      .set("Cookie", cookie);
    assert.equal(filtered.status, 200);
    assert.match(filtered.text, /data-ac-empty="access-filtered"/);
    assert.match(filtered.text, /data-ac-state-key="no_results"/);
  });

  it("same-tenant restricted route hides permission keys", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "s08d");
    const staff = await seedStaff(ac, {
      roleKey: STAFF_ROLE,
      firstName: "Limited",
      lastName: "User",
    });
    const { cookie } = await sessionCookie(staff.identity.id, ac.orgId);
    const app = makeApp();

    const denied = await request(app).get("/app/access").set("Cookie", cookie);
    assert.equal(denied.status, 403);
    assert.match(denied.text, /data-ac-state="access-denied"/);
    assert.match(denied.text, /You do not have access to this area/);
    assert.doesNotMatch(
      denied.text,
      /assign_access|activeclinic\.access\.manage|permissionKey/i
    );
  });

  it("cross-tenant facility key stays not-found without existence leak", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const a = await seedAcTenant(stamp, "s08x");
    const b = await seedAcTenant(`${stamp}b`, "s08y");
    const admin = await seedStaff(a, {
      roleKey: NETWORK_ADMIN,
      firstName: "Tenant",
      lastName: "A",
    });
    const { cookie } = await sessionCookie(admin.identity.id, a.orgId);
    const app = makeApp();

    const foreign = await request(app)
      .get(`/app/facilities/${b.facilityKey}`)
      .set("Cookie", cookie);
    assert.equal(foreign.status, 404);
    assert.doesNotMatch(foreign.text, new RegExp(b.facilityKey, "i"));
  });

  it("suspended staff clears ActiveClinic cookie and shows context unavailable", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "s08s");
    const admin = await seedStaff(ac, {
      roleKey: NETWORK_ADMIN,
      firstName: "Sus",
      lastName: "Admin",
    });
    const { cookie } = await sessionCookie(admin.identity.id, ac.orgId);

    const suspended = await suspendStaffMember(pool, {
      id: admin.staff.id,
      organizationId: ac.orgId,
    });
    assert.equal(suspended.ok, true);

    const app = makeApp();
    const res = await request(app).get("/app").set("Cookie", cookie);
    assert.equal(res.status, 403);
    assert.match(res.text, /data-ac-state="context-unavailable"/);
    assert.match(res.text, /workspace is currently unavailable/i);
    const setCookie = [].concat(res.headers["set-cookie"] || []).join(";");
    assert.match(setCookie, new RegExp(`${COOKIE_ACTIVECLINIC_ORG}=;`));
  });

  it("production probe routes stay 404", async () => {
    requireDb();
    const prodApp = makeApp({ ...MINIMAL_AC, NODE_ENV: "production" });
    const res = await request(prodApp).get("/__ac/organizations");
    assert.equal(res.status, 404);
  });

  it("facility create validation preserves safe values and hides constraint names", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "s08v");
    const admin = await seedStaff(ac, {
      roleKey: NETWORK_ADMIN,
      firstName: "Val",
      lastName: "Admin",
    });
    const { cookie, csrf } = await sessionCookie(admin.identity.id, ac.orgId);
    const app = makeApp();

    const res = await request(app)
      .post("/app/facilities")
      .set("Cookie", cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        display_name: "",
        facility_key: "clinic-b",
        facility_type: "clinic",
        city: "Ndola",
      });
    assert.ok([200, 400].includes(res.status));
    assert.match(res.text, /ac-facility-error-summary|Check required|display/i);
    assert.match(res.text, /Ndola/);
    assert.doesNotMatch(res.text, /unique_violation|SQLSTATE|constraint/i);
  });

  it("login password is never echoed on validation failure", async () => {
    requireDb();
    const app = makeApp();
    const csrf = issueCsrfToken(MINIMAL_AC);
    const res = await request(app)
      .post("/login")
      .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        identifier: "nobody@example.test",
        password: "super-secret-password-value",
      });
    assert.ok([200, 401, 403].includes(res.status));
    assert.doesNotMatch(res.text, /super-secret-password-value/);
  });

  it("shell and state pages keep ActiveClinic branding only", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "s08b");
    const admin = await seedStaff(ac, {
      roleKey: NETWORK_ADMIN,
      firstName: "Brand",
      lastName: "Admin",
    });
    const { cookie } = await sessionCookie(admin.identity.id, ac.orgId);
    const app = makeApp();
    const home = await request(app).get("/app").set("Cookie", cookie);
    assert.equal(home.status, 200);
    assert.match(home.text, /data-ac-product="activeclinic"/);
    assert.doesNotMatch(home.text, /BlessBoard|church-body|bb-platform/i);
    assert.match(home.text, /ac-skip|Skip to/i);
  });
});
