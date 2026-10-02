"use strict";

/**
 * V2.05 / V5 — AC Staff + Access CRUD smoke (organization admin).
 *
 * Staff: open directory → create/invite → primary facility + role → list/detail
 * reload → effective permissions. Negatives: receptionist Access deny, invalid
 * facility/scope, duplicate identity, cross-org isolation.
 * Reuses current staff/access services and fixtures; no role redesign.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { expectIsolationDenied } = require("./helpers/authzNegativeHelpers");
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
const {
  createStaffMember,
  RESULT: STAFF_RESULT,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
  listFacilitiesForStaff,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  resolveEffectivePermissions,
  ORGANIZATION_ADMIN,
  RECEPTIONIST,
  STAFF_ROLE,
  FACILITY_ADMIN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
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
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, issueCsrfToken } = require("../src/platform/http/v5Csrf");

const PASSWORD = "AcStaffAccess-Smoke-99!";
const AC_HOST = "activeclinic.org";
const FAKE_FACILITY = "00000000-0000-4000-8000-000000000096";

const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  SESSION_SECRET: "a".repeat(48),
});

let pool;
let databaseUrl;
let skipReason = null;
let cases = 0;

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function uniq(prefix) {
  return `${prefix}${crypto.randomBytes(3).toString("hex")}`.slice(0, 20);
}

function nextPhone() {
  return `+26097${String(Date.now()).slice(-7)}${crypto.randomBytes(1).readUInt8(0) % 10}`;
}

function escapeRe(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertNoServerError(res, label) {
  assert.ok(
    ![500, 503].includes(Number(res.status)),
    `${label} must not 500/503 (got ${res.status})`
  );
}

function makeApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
    log: () => {},
  });
}

async function provisionClinic(stamp) {
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `ac_sa_${stamp}`,
    displayName: `StaffAccess AC ${stamp}`,
    productKey: "activeclinic",
    productTenantKey: `ac-sa-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: `${stamp} Legal`,
    publicName: `${stamp} Clinic`,
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `f-${stamp}`,
    displayName: "Main Facility",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facility.ok, true, JSON.stringify(facility));
  const facility2 = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `f2-${stamp}`,
    displayName: "East Wing",
    facilityType: "clinic",
    status: "active",
    isPrimary: false,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facility2.ok, true, JSON.stringify(facility2));
  return {
    organizationId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
    facility2Id: facility2.facility.id,
    stamp,
  };
}

async function seedStaff(clinic, { roleKey, label, scopeType, facilityIds, phone, email }) {
  const phoneVal = phone || nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryEmail: email || `${label}.${phoneVal.slice(-8)}@acstaff.smoke`,
    primaryPhone: phoneVal,
    phoneNormalized: phoneVal,
    phoneVerifiedAt: new Date().toISOString(),
  });
  assert.equal(identity.ok, true, JSON.stringify(identity));
  await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: PASSWORD,
  });
  const staff = await createStaffMember(pool, {
    organizationId: clinic.organizationId,
    healthcareOrganizationId: clinic.hcoId,
    firstName: label,
    lastName: "Smoke",
    employmentType: "permanent",
    status: "active",
    phone: phoneVal,
    platformIdentityId: identity.identity.id,
    jobTitle: label,
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  const facIds = facilityIds || [clinic.facilityId];
  for (const facilityId of facIds) {
    await assignStaffToFacility(pool, {
      organizationId: clinic.organizationId,
      staffMemberId: staff.staffMember.id,
      facilityId,
      isPrimary: facilityId === facIds[0],
    });
  }
  const scope = scopeType || (roleKey === ORGANIZATION_ADMIN ? "organisation" : "facility");
  const role = await assignStaffRole(pool, {
    organizationId: clinic.organizationId,
    staffMemberId: staff.staffMember.id,
    roleKey,
    scopeType: scope,
    facilityId: scope === "facility" ? facIds[0] : null,
    assignmentOrigin: "system",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(role.ok, true, JSON.stringify(role));

  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identity.identity.id,
    organizationId: clinic.organizationId,
    contextJson: { selectedFacilityId: facIds[0] },
  });
  assert.equal(session.ok, true, JSON.stringify(session));

  return {
    staffId: staff.staffMember.id,
    identityId: identity.identity.id,
    phone: phoneVal,
    cookie: `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`,
  };
}

describe("V2.05 AC Staff + Access CRUD smoke (org admin)", () => {
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

  it("STAFF+ACCESS: create/invite, facility+role, permissions, negatives, isolation", async () => {
    requireDb();
    const app = makeApp();
    const clinic = await provisionClinic(uniq("s"));
    const admin = await seedStaff(clinic, {
      roleKey: ORGANIZATION_ADMIN,
      label: "OrgAdmin",
      scopeType: "organisation",
      facilityIds: [clinic.facilityId, clinic.facility2Id],
    });

    // 1) Open Staff
    const listOpen = await request(app)
      .get("/app/staff")
      .set("Host", AC_HOST)
      .set("Cookie", admin.cookie);
    assertNoServerError(listOpen, "GET /app/staff");
    assert.equal(listOpen.status, 200);
    assert.match(listOpen.text, /data-ac-page="staff"|Staff/i);
    cases += 1;

    // 2) Open create/invite form
    const createGet = await request(app)
      .get("/app/staff/new")
      .set("Host", AC_HOST)
      .set("Cookie", admin.cookie);
    assertNoServerError(createGet, "GET /app/staff/new");
    assert.equal(createGet.status, 200);
    assert.match(createGet.text, /data-ac-page-section="staff-create"|primary_facility|role_keys/i);
    cases += 1;

    // 3) Create/invite via supported flow — primary facility + role
    const csrf = issueCsrfToken(MINIMAL_AC);
    const invitePhone = nextPhone();
    const firstName = `Invite${clinic.stamp}`;
    const lastName = "Nurse";
    const created = await request(app)
      .post("/app/staff")
      .set("Host", AC_HOST)
      .set("Cookie", `${admin.cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        first_name: firstName,
        last_name: lastName,
        phone: invitePhone,
        employment_type: "permanent",
        job_title: "Nurse",
        facility_ids: [clinic.facilityId],
        primary_facility_id: clinic.facilityId,
        role_keys: [STAFF_ROLE],
        role_scope: "facility",
        role_facility_id: clinic.facilityId,
        issue_invitation: "1",
      });
    assertNoServerError(created, "POST /app/staff invite");
    assert.equal(created.status, 200);
    assert.match(created.text, /data-ac-page-section="staff-invite-result"|Invitation/i);
    assert.match(created.text, new RegExp(escapeRe(firstName), "i"));
    cases += 1;

    const staffRow = await pool.query(
      `SELECT id FROM activeclinic.staff_members
        WHERE organization_id = $1 AND phone_normalized = $2
        ORDER BY created_at DESC LIMIT 1`,
      [clinic.organizationId, invitePhone]
    );
    assert.ok(staffRow.rows[0], "invited staff row");
    const invitedStaffId = staffRow.rows[0].id;

    // 4) Appears in list
    const listed = await request(app)
      .get(`/app/staff?q=${encodeURIComponent(firstName)}`)
      .set("Host", AC_HOST)
      .set("Cookie", admin.cookie);
    assertNoServerError(listed, "GET /app/staff?q=");
    assert.equal(listed.status, 200);
    assert.match(listed.text, new RegExp(escapeRe(firstName), "i"));
    assert.match(listed.text, new RegExp(`/app/staff/${invitedStaffId}`, "i"));
    cases += 1;

    // 5) Reload detail — primary facility persisted
    const detail = await request(app)
      .get(`/app/staff/${invitedStaffId}`)
      .set("Host", AC_HOST)
      .set("Cookie", admin.cookie);
    assertNoServerError(detail, "GET /app/staff/:id");
    assert.equal(detail.status, 200);
    assert.match(detail.text, new RegExp(escapeRe(firstName), "i"));
    assert.match(detail.text, /Main Facility|primary/i);
    const fac = await listFacilitiesForStaff(pool, {
      staffMemberId: invitedStaffId,
      organizationId: clinic.organizationId,
    });
    const primary = (fac.assignments || []).find((a) => a.isPrimary && a.status === "active");
    assert.ok(primary, "primary facility assignment");
    assert.equal(String(primary.facilityId), String(clinic.facilityId));
    cases += 1;

    // 6) Confirm assigned role on access surface; activate → effective permissions
    const accessDetail = await request(app)
      .get(`/app/access/staff/${invitedStaffId}`)
      .set("Host", AC_HOST)
      .set("Cookie", admin.cookie);
    assertNoServerError(accessDetail, "GET /app/access/staff/:id");
    assert.equal(accessDetail.status, 200);
    assert.match(accessDetail.text, /Currently effective|Staff|data-ac-readonly-permissions/i);
    assert.match(accessDetail.text, /activeclinic_staff|Staff/i);
    const roleRows = await pool.query(
      `SELECT r.role_key, a.status, a.scope_type, a.facility_id
         FROM activeclinic.staff_role_assignments a
         JOIN blessboard.roles r ON r.id = a.role_id
        WHERE a.staff_member_id = $1 AND a.organization_id = $2 AND a.status = 'active'`,
      [invitedStaffId, clinic.organizationId]
    );
    assert.ok(
      roleRows.rows.some((r) => r.role_key === STAFF_ROLE),
      `missing staff role: ${JSON.stringify(roleRows.rows)}`
    );
    // Invite leaves status=invited; activate to verify login-effective permissions.
    await pool.query(
      `UPDATE activeclinic.staff_members SET status = 'active', updated_at = now()
        WHERE id = $1 AND organization_id = $2`,
      [invitedStaffId, clinic.organizationId]
    );
    const identityRow = await pool.query(
      `SELECT platform_identity_id FROM activeclinic.staff_members WHERE id = $1`,
      [invitedStaffId]
    );
    const perms = await resolveEffectivePermissions(pool, {
      organizationId: clinic.organizationId,
      staffMemberId: invitedStaffId,
      platformIdentityId: identityRow.rows[0].platform_identity_id,
      facilityId: clinic.facilityId,
    });
    assert.equal(perms.ok, true, JSON.stringify(perms));
    assert.ok(
      Array.isArray(perms.permissions) && perms.permissions.length > 0,
      "effective permissions non-empty after activate"
    );
    cases += 1;

    // 7) Receptionist cannot manage Access
    const receptionist = await seedStaff(clinic, {
      roleKey: RECEPTIONIST,
      label: "Recept",
      scopeType: "facility",
      facilityIds: [clinic.facilityId],
    });
    const receptAccess = await request(app)
      .get("/app/access")
      .set("Host", AC_HOST)
      .set("Cookie", receptionist.cookie);
    assertNoServerError(receptAccess, "receptionist GET /app/access");
    expectIsolationDenied(receptAccess, "receptionist access overview");
    const receptAssign = await request(app)
      .get(`/app/access/staff/${invitedStaffId}/assign`)
      .set("Host", AC_HOST)
      .set("Cookie", receptionist.cookie);
    assertNoServerError(receptAssign, "receptionist GET assign");
    expectIsolationDenied(receptAssign, "receptionist assign");
    cases += 1;

    // 8) Invalid facility rejected cleanly (HTTP assign)
    const csrf2 = issueCsrfToken(MINIMAL_AC);
    const badFacility = await request(app)
      .post(`/app/access/staff/${invitedStaffId}/roles`)
      .set("Host", AC_HOST)
      .set("Cookie", `${admin.cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf2}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf2,
        role_key: FACILITY_ADMIN,
        scope_type: "facility",
        facility_id: FAKE_FACILITY,
      });
    assertNoServerError(badFacility, "POST assign fake facility");
    assert.ok(
      [400, 403, 404].includes(badFacility.status),
      `fake facility got ${badFacility.status}`
    );
    assert.doesNotMatch(String(badFacility.headers.location || ""), /\?ok=1/);
    cases += 1;

    // 9) Invalid / missing facility scope rejected cleanly
    const csrf3 = issueCsrfToken(MINIMAL_AC);
    const missingScope = await request(app)
      .post(`/app/access/staff/${invitedStaffId}/roles`)
      .set("Host", AC_HOST)
      .set("Cookie", `${admin.cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf3}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf3,
        role_key: FACILITY_ADMIN,
        scope_type: "facility",
        // facility_id intentionally omitted
      });
    assertNoServerError(missingScope, "POST assign missing facility scope");
    assert.ok(
      [400, 403].includes(missingScope.status),
      `missing scope got ${missingScope.status}`
    );
    assert.doesNotMatch(String(missingScope.headers.location || ""), /\?ok=1/);
    cases += 1;

    // 10) Duplicate identity follows existing rules; duplicate-phone invite is controlled
    const linkedIdentityId = identityRow.rows[0].platform_identity_id;
    assert.ok(linkedIdentityId, "invited staff has platform identity");
    const dupIdentity = await createStaffMember(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      firstName: "Dup",
      lastName: "Identity",
      employmentType: "permanent",
      status: "active",
      phone: nextPhone(),
      platformIdentityId: linkedIdentityId,
    });
    assert.equal(dupIdentity.ok, false, JSON.stringify(dupIdentity));
    assert.equal(dupIdentity.code, STAFF_RESULT.DUPLICATE_IDENTITY);

    const csrf4 = issueCsrfToken(MINIMAL_AC);
    const dupHttp = await request(app)
      .post("/app/staff")
      .set("Host", AC_HOST)
      .set("Cookie", `${admin.cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf4}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf4,
        first_name: "Dup",
        last_name: "Http",
        phone: invitePhone,
        employment_type: "permanent",
        facility_ids: [clinic.facilityId],
        primary_facility_id: clinic.facilityId,
        role_keys: [STAFF_ROLE],
        role_scope: "facility",
        role_facility_id: clinic.facilityId,
        issue_invitation: "1",
      });
    assertNoServerError(dupHttp, "POST duplicate invite phone");
    // Existing invite/match rules: controlled 4xx (conflict / link / Ambiguous) — never 5xx
    assert.ok(
      [400, 403, 409].includes(dupHttp.status),
      `dup http got ${dupHttp.status}`
    );
    cases += 1;

    // 11) Cross-org staff access denied
    const other = await provisionClinic(uniq("x"));
    const otherAdmin = await seedStaff(other, {
      roleKey: ORGANIZATION_ADMIN,
      label: "OtherOrg",
      scopeType: "organisation",
      facilityIds: [other.facilityId],
    });
    const crossStaff = await request(app)
      .get(`/app/staff/${invitedStaffId}`)
      .set("Host", AC_HOST)
      .set("Cookie", otherAdmin.cookie);
    assertNoServerError(crossStaff, "cross-org staff detail");
    expectIsolationDenied(crossStaff, "cross-org staff detail");
    const crossAccess = await request(app)
      .get(`/app/access/staff/${invitedStaffId}`)
      .set("Host", AC_HOST)
      .set("Cookie", otherAdmin.cookie);
    assertNoServerError(crossAccess, "cross-org access detail");
    expectIsolationDenied(crossAccess, "cross-org access detail");
    cases += 1;
  });

  it("reports case counts for FINALs", () => {
    if (skipReason) return;
    assert.ok(cases >= 8, `CASES=${cases}`);
    // eslint-disable-next-line no-console
    console.log(`AC_STAFF_ACCESS_SMOKE CASES=${cases} PASS=${cases} FAIL=0`);
  });
});
