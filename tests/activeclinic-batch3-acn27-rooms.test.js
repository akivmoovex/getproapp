"use strict";

/**
 * V2.03 ACN27 — Rooms & Spaces MVP.
 * Service CRUD, tenant/facility isolation, RBAC, route markers.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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
const {
  ensureDefaultDepartments,
} = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  createFacilityRoom,
  updateFacilityRoom,
  getFacilityRoom,
  listFacilityRooms,
  RESULT,
} = require("../src/activeclinic/services/activeClinicFacilityRoomService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
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

const ROOT = path.join(__dirname, "..");
let pool;
let skipReason = null;
let phoneSeq = 780000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function extractCsrf(res) {
  const html = String(res.text || "");
  const meta = html.match(/name="csrf-token"\s+content="([^"]+)"/);
  if (meta) return meta[1];
  const field = html.match(new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"`));
  return field ? field[1] : issueCsrfToken(MINIMAL_AC);
}

function cookieHeader(sessionCookie, pageRes) {
  const parts = [sessionCookie];
  const set = pageRes && pageRes.headers && pageRes.headers["set-cookie"];
  if (Array.isArray(set)) parts.push(...set);
  else if (set) parts.push(set);
  return parts.join("; ");
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

async function provisionClinic(label, roleKey) {
  const stamp = `${label}_${Date.now().toString(36)}`;
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: stamp,
    displayName: `ACN27 ${label}`,
    productKey: "activeclinic",
    productTenantKey: stamp,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: `${label} Legal`,
    publicName: `${label} Clinic`,
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `hq-${stamp}`,
    displayName: "HQ",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
    city: "Lusaka",
  });
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
  });
  await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: PASSWORD,
  });
  const staff = await createStaffMember(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    firstName: "Room",
    lastName: label,
    employmentType: "permanent",
    phone,
    status: "active",
    platformIdentityId: identity.identity.id,
    jobTitle: "Staff",
  });
  await assignStaffToFacility(pool, {
    organizationId: org.records.organization.id,
    staffMemberId: staff.staffMember.id,
    facilityId: facility.facility.id,
    isPrimary: true,
  });
  await assignStaffRole(pool, {
    organizationId: org.records.organization.id,
    staffMemberId: staff.staffMember.id,
    roleKey: roleKey || ORGANIZATION_ADMIN,
    scopeType: "organisation",
  });
  await ensureDefaultDepartments(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  });
  return {
    organizationId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
    staffId: staff.staffMember.id,
    identityId: identity.identity.id,
  };
}

describe("ActiveClinic V2.03 ACN27 Rooms & Spaces", () => {
  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
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

  it("migration 040 defines facility_rooms with facility-scoped code uniqueness", () => {
    const sql = fs.readFileSync(
      path.join(ROOT, "db/migrations/activeclinic/040_facility_rooms.sql"),
      "utf8"
    );
    assert.match(sql, /CREATE TABLE IF NOT EXISTS activeclinic\.facility_rooms/);
    assert.match(sql, /facility_rooms_facility_code_unique/);
    assert.match(sql, /department_id UUID NULL/);
    assert.match(sql, /Does NOT reuse service_points/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS[^\n]*service_points/);
  });

  it("creates, lists, updates rooms with optional department", async () => {
    requireDb();
    const a = await provisionClinic("crud");
    const deptList = await pool.query(
      `SELECT id FROM activeclinic.departments
        WHERE facility_id = $1 AND organization_id = $2
        LIMIT 1`,
      [a.facilityId, a.organizationId]
    );
    const departmentId = deptList.rows[0] && deptList.rows[0].id;

    const created = await createFacilityRoom(pool, {
      organizationId: a.organizationId,
      facilityId: a.facilityId,
      departmentId,
      displayName: "Exam Room 101",
      roomCode: "RM-EX-101",
      roomType: "exam",
      floorArea: "Floor 1, Pod A",
      description: "Standard exam room",
      status: "available",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      actor: { platformIdentityId: a.identityId },
    });
    assert.equal(created.ok, true, JSON.stringify(created));
    assert.equal(created.room.departmentId, departmentId);
    assert.equal(created.room.facilityId, a.facilityId);

    const listed = await listFacilityRooms(pool, {
      organizationId: a.organizationId,
      facilityId: a.facilityId,
    });
    assert.equal(listed.ok, true);
    assert.ok(listed.rooms.some((r) => r.id === created.room.id));
    assert.ok(listed.metrics.total >= 1);

    const unassigned = await createFacilityRoom(pool, {
      organizationId: a.organizationId,
      facilityId: a.facilityId,
      departmentId: null,
      displayName: "Admin Closet",
      roomCode: "RM-ADM-01",
      roomType: "administrative",
      status: "inactive",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(unassigned.ok, true, JSON.stringify(unassigned));
    assert.equal(unassigned.room.departmentId, null);

    const updated = await updateFacilityRoom(pool, {
      organizationId: a.organizationId,
      roomId: created.room.id,
      displayName: "Exam Room 101A",
      status: "unavailable",
      departmentId: null,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(updated.ok, true, JSON.stringify(updated));
    assert.equal(updated.room.displayName, "Exam Room 101A");
    assert.equal(updated.room.status, "unavailable");
    assert.equal(updated.room.departmentId, null);
  });

  it("rejects forged org/facility and department/facility mismatch", async () => {
    requireDb();
    const a = await provisionClinic("isoA");
    const b = await provisionClinic("isoB");

    const forgedOrg = await createFacilityRoom(pool, {
      organizationId: a.organizationId,
      facilityId: b.facilityId,
      displayName: "X",
      roomCode: "RM-X-1",
      roomType: "exam",
    });
    assert.equal(forgedOrg.ok, false);
    assert.equal(forgedOrg.code, RESULT.FACILITY_NOT_FOUND);

    const roomOnA = await createFacilityRoom(pool, {
      organizationId: a.organizationId,
      facilityId: a.facilityId,
      displayName: "Safe",
      roomCode: "RM-SAFE-1",
      roomType: "consultation",
    });
    assert.equal(roomOnA.ok, true);

    const crossGet = await getFacilityRoom(pool, {
      organizationId: b.organizationId,
      roomId: roomOnA.room.id,
    });
    assert.equal(crossGet.ok, false);
    assert.equal(crossGet.code, RESULT.NOT_FOUND);

    const deptOnB = await pool.query(
      `SELECT id FROM activeclinic.departments
        WHERE facility_id = $1 AND organization_id = $2 LIMIT 1`,
      [b.facilityId, b.organizationId]
    );
    const mismatch = await createFacilityRoom(pool, {
      organizationId: a.organizationId,
      facilityId: a.facilityId,
      departmentId: deptOnB.rows[0].id,
      displayName: "Bad Dept",
      roomCode: "RM-BAD-1",
      roomType: "exam",
    });
    assert.equal(mismatch.ok, false);
    assert.ok(
      mismatch.code === RESULT.DEPARTMENT_NOT_FOUND ||
        mismatch.code === RESULT.DEPARTMENT_FACILITY_MISMATCH,
      mismatch.code
    );
  });

  it("rejects duplicate room codes within the same facility only", async () => {
    requireDb();
    const a = await provisionClinic("dup");
    const first = await createFacilityRoom(pool, {
      organizationId: a.organizationId,
      facilityId: a.facilityId,
      displayName: "One",
      roomCode: "RM-DUP-1",
      roomType: "exam",
    });
    assert.equal(first.ok, true);
    const clash = await createFacilityRoom(pool, {
      organizationId: a.organizationId,
      facilityId: a.facilityId,
      displayName: "Two",
      roomCode: "rm-dup-1",
      roomType: "treatment",
    });
    assert.equal(clash.ok, false);
    assert.equal(clash.code, RESULT.DUPLICATE_CODE);

    const f2 = await createFacility(pool, {
      organizationId: a.organizationId,
      healthcareOrganizationId: a.hcoId,
      facilityKey: `sat-${Date.now().toString(36)}`,
      displayName: "Satellite",
      facilityType: "clinic",
      status: "active",
      isPrimary: false,
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
      phone: nextPhone(),
      city: "Ndola",
    });
    const otherFacility = await createFacilityRoom(pool, {
      organizationId: a.organizationId,
      facilityId: f2.facility.id,
      displayName: "Same code elsewhere",
      roomCode: "RM-DUP-1",
      roomType: "exam",
    });
    assert.equal(otherFacility.ok, true, JSON.stringify(otherFacility));
  });

  it("HTTP list/create/detail with Stitch markers; receptionist cannot manage", async () => {
    requireDb();
    const admin = await provisionClinic("httpAdmin");
    const reception = await provisionClinic("httpRx", RECEPTIONIST);
    const app = createActiveClinicFoundationApp({
      env: MINIMAL_AC,
      getPool: () => pool,
      allowPlatformRuntimeChild: true,
    });

    const adminCookie = await sessionCookie(
      admin.identityId,
      admin.organizationId,
      admin.facilityId
    );
    const list = await request(app)
      .get(`/app/rooms?facility=${admin.facilityId}`)
      .set("Cookie", adminCookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /data-ac-stitch="ACN27"/);
    assert.match(list.text, /b8f071b326234022afb3eecc665be9bc/);
    assert.match(list.text, /74a8167ce99e45388a7dd1fbe9a92a88/);
    assert.match(list.text, /Rooms &amp; Spaces|Rooms & Spaces/);

    const formGet = await request(app)
      .get(`/app/rooms/new?facility=${admin.facilityId}`)
      .set("Cookie", adminCookie);
    assert.equal(formGet.status, 200);
    const csrf = extractCsrf(formGet);
    const created = await request(app)
      .post("/app/rooms")
      .set("Cookie", cookieHeader(adminCookie, formGet))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        facility_id: admin.facilityId,
        display_name: "Triage Bay A",
        room_code: "RM-TRG-01",
        room_type: "triage",
        floor_area: "Floor 1",
        status: "available",
      });
    assert.ok([302, 303].includes(created.status), String(created.status));
    assert.match(String(created.headers.location || ""), /\/app\/rooms\//);

    const roomId = String(created.headers.location).split("/").pop().split("?")[0];
    const detail = await request(app)
      .get(`/app/rooms/${roomId}`)
      .set("Cookie", adminCookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /Triage Bay A/);
    assert.match(detail.text, /data-ac-page-section="room-detail"/);

    const rxCookie = await sessionCookie(
      reception.identityId,
      reception.organizationId,
      reception.facilityId
    );
    const rxNew = await request(app).get("/app/rooms/new").set("Cookie", rxCookie);
    assert.ok([403, 302, 303].includes(rxNew.status), String(rxNew.status));
    if (rxNew.status === 200) {
      assert.fail("receptionist must not manage rooms");
    }
  });

  it("does not collide with B2-10 facilities route ownership", async () => {
    requireDb();
    const admin = await provisionClinic("b210");
    const app = createActiveClinicFoundationApp({
      env: MINIMAL_AC,
      getPool: () => pool,
      allowPlatformRuntimeChild: true,
    });
    const cookie = await sessionCookie(
      admin.identityId,
      admin.organizationId,
      admin.facilityId
    );
    const facilities = await request(app).get("/app/facilities").set("Cookie", cookie);
    assert.equal(facilities.status, 200);
    assert.match(facilities.text, /data-ac-stitch="AC-B2-10"/);
    assert.match(facilities.text, /Rooms/);
    const rooms = await request(app).get("/app/rooms").set("Cookie", cookie);
    assert.equal(rooms.status, 200);
    assert.match(rooms.text, /data-ac-stitch="ACN27"/);
    assert.doesNotMatch(rooms.text, /data-ac-stitch="AC-B2-10"/);
  });
});
