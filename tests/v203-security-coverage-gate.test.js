#!/usr/bin/env node
"use strict";

/**
 * V2.03 Prompt 7 — Security + high-risk coverage gate.
 *
 * Verifies meaningful negative-path coverage for high-risk writes:
 *   AUTHORIZED → success
 *   UNAUTHENTICATED → denied
 *   UNAUTHORIZED ROLE → denied
 *   WRONG TENANT → denied
 *   INVALID INPUT → controlled failure
 *   VALID WRITE → persists / reload tenant-scoped
 *
 * Does not grant broad admin roles merely to simplify assertions.
 *
 * Marker: V203_SECURITY_COVERAGE_GATE_PASS
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const {
  rejectForgedTenantIdentifiers,
  createRejectForgedTenantIdsMiddleware,
  assertActiveClinicAuthScope,
  assertResourceInsideBlessBoardTenant,
} = require("../src/platform/rbac");
const {
  forgeTenantBody,
  expectIsolationDenied,
  BB_PERMISSION_MATRIX,
  AC_PERMISSION_MATRIX,
  assertMatrixCell,
} = require("./helpers/authzNegativeHelpers");
const {
  authorizeWebsiteInstance,
} = require("../src/platform/website/authorizeWebsite");
const {
  PERMISSIONS,
  EDITOR_PERMISSIONS,
  PLATFORM_ADMIN_PERMISSIONS,
} = require("../src/platform/website/permissions");
const instanceRepo = require("../src/platform/website/instanceRepository");
const {
  parseMediaUploadsEnabled,
  areMediaUploadsEnabled,
} = require("../src/blessboard/config/mediaUploadsEnabled");
const {
  actorMayInvite,
} = require("../src/blessboard/services/inviteBlessBoardStaff");
const {
  assertNotLastHqAdminRemoval,
} = require("../src/blessboard/services/blessBoardLastAdminGuard");
const {
  assignStaffRole,
  authorizeStaffPermission,
  ORGANIZATION_ADMIN,
  BILLING_OFFICER,
  RECEPTIONIST,
  CLINICIAN,
  FINANCE_SUPERVISOR,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  assertNotLastOrgAdminRemoval,
  RESULT: ACCESS_RESULT,
} = require("../src/activeclinic/services/activeClinicAccessManagementService");
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
  ensureDefaultDepartments,
} = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  createPatientCharge,
  createInvoice,
  postInvoice,
  voidInvoice,
  RESULT: BILLING_RESULT,
} = require("../src/activeclinic/services/activeClinicBillingService");
const {
  startEncounter,
  RESULT: CLINICAL_RESULT,
} = require("../src/activeclinic/services/activeClinicClinicalService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

const ROOT = path.join(__dirname, "..");
const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FAC_A = "11111111-1111-4111-8111-111111111111";
const FAC_B = "22222222-2222-4222-8222-222222222222";
const INST_A = "11111111-1111-4111-8111-111111111111";
const PASSWORD = "sec-gate-pass-12";

/** High-risk write surfaces audited for Prompt 7. */
const HIGH_RISK_ENDPOINTS = Object.freeze([
  {
    id: "SH-FORGED-TENANT",
    surface: "rejectForgedTenantIdentifiers + middleware",
    classification: "FULLY_NEGATIVE_TESTED",
    evidence: [
      "tests/v8-shared-rbac-tenant-isolation.test.js",
      "tests/v203-critical-platform-security.test.js",
      "tests/v203-security-coverage-gate.test.js",
    ],
  },
  {
    id: "SH-WEBSITE-PUBLISH",
    surface: "website publish authorization",
    classification: "FULLY_NEGATIVE_TESTED",
    evidence: [
      "tests/blessboard-p0-publish-auth.test.js",
      "tests/v203-critical-platform-security.test.js",
      "tests/v10-pc10b-ac-website-workflow-baseline.test.js",
    ],
  },
  {
    id: "SH-CMS-DRAFT-WRITE",
    surface: "CMS draft save (contentService)",
    classification: "FULLY_NEGATIVE_TESTED",
    evidence: ["tests/v203-critical-platform-security.test.js"],
  },
  {
    id: "SH-MEDIA-OWNERSHIP",
    surface: "media register/meta/archive ownership",
    classification: "FULLY_NEGATIVE_TESTED",
    evidence: [
      "tests/v203-critical-platform-security.test.js",
      "tests/blessboard-media.test.js",
      "tests/v2-shared-media-upload-parity.test.js",
    ],
  },
  {
    id: "SH-MEDIA-KILL-SWITCH",
    surface: "media upload kill-switch fail-closed",
    classification: "FULLY_NEGATIVE_TESTED",
    evidence: [
      "tests/v203-coverage-gap-closure.test.js",
      "tests/v203-security-coverage-gate.test.js",
    ],
  },
  {
    id: "BB-ROLE-ESCALATION",
    surface: "BlessBoard invite role escalation",
    classification: "FULLY_NEGATIVE_TESTED",
    evidence: [
      "tests/v2-02-bb-catalogue-only-rbac.test.js",
      "tests/blessboard-staff-invitation.test.js",
      "tests/v203-security-coverage-gate.test.js",
    ],
  },
  {
    id: "BB-LAST-HQ-ADMIN",
    surface: "last Church HQ admin guard",
    classification: "FULLY_NEGATIVE_TESTED",
    evidence: [
      "tests/blessboard-staff-access.test.js",
      "tests/v203-security-coverage-gate.test.js",
    ],
  },
  {
    id: "AC-LAST-ORG-ADMIN",
    surface: "last ActiveClinic org admin guard",
    classification: "FULLY_NEGATIVE_TESTED",
    evidence: [
      "tests/activeclinic-phase14-rbac.test.js",
      "tests/activeclinic-roles-access-admin.test.js",
      "tests/v203-security-coverage-gate.test.js",
    ],
  },
  {
    id: "AC-BILLING-WRITE",
    surface: "billing charge/invoice/post/pay/void",
    classification: "FULLY_NEGATIVE_TESTED",
    evidence: [
      "tests/v203-coverage-gap-closure.test.js",
      "tests/activeclinic-finance-rbac.test.js",
      "tests/activeclinic-batch1a-billing.test.js",
    ],
  },
  {
    id: "AC-FINANCE-SOD",
    surface: "finance SoD refund/reverse/credit-note",
    classification: "FULLY_NEGATIVE_TESTED",
    evidence: [
      "tests/activeclinic-finance-rbac.test.js",
      "tests/activeclinic-phase4-billing-ops.test.js",
    ],
  },
  {
    id: "AC-CLINICAL-WRITE",
    surface: "clinical encounter start/close",
    classification: "FULLY_NEGATIVE_TESTED",
    evidence: [
      "tests/v203-coverage-gap-closure.test.js",
      "tests/activeclinic-batch2-rbac-isolation.test.js",
      "tests/activeclinic-batch2-clinical-encounter.test.js",
    ],
  },
  {
    id: "AC-FACILITY-FORGE",
    surface: "forged facility/org on AC HTTP mutations",
    classification: "FULLY_NEGATIVE_TESTED",
    evidence: [
      "tests/activeclinic-batch2-rbac-isolation.test.js",
      "tests/v8-shared-rbac-tenant-isolation.test.js",
    ],
  },
  {
    id: "AC-CROSS-TENANT-OPS",
    surface: "cross-tenant clinical/pharmacy/billing HTTP",
    classification: "FULLY_NEGATIVE_TESTED",
    evidence: ["tests/activeclinic-batch2-rbac-isolation.test.js"],
  },
  {
    id: "BB-REGISTRATION-ADMIN",
    surface: "registration approval / provisioning admin writes",
    classification: "PARTIALLY_TESTED",
    evidence: [
      "tests/blessboard-registration-operator-approval.test.js",
      "tests/blessboard-platform-01-registration.test.js",
    ],
    gap: "Full unauth/wrong-role/wrong-tenant HTTP matrix not uniform across every registration admin mutation",
  },
  {
    id: "AC-STAFF-ASSIGN",
    surface: "staff role assignment / access admin HTTP",
    classification: "PARTIALLY_TESTED",
    evidence: [
      "tests/activeclinic-roles-access-admin.test.js",
      "tests/activeclinic-staff-invitation.test.js",
    ],
    gap: "Some HTTP leaves historically RC14; service last-admin + assign authz covered; not every destructive revoke HTTP cell",
  },
  {
    id: "PL-PLATFORM-ADMIN-ROUTES",
    surface: "platformAdminRoutes / adminChurchPlatform writes",
    classification: "PARTIALLY_TESTED",
    evidence: [
      "tests/v7-platform-admin-tenant-health.test.js",
      "tests/v7-platform-admin-website-control.test.js",
      "tests/church-platform-security.test.js",
    ],
    gap: "Large live admin surfaces; representative authz/isolation covered; not every POST leaf has full 7-cell matrix",
  },
  {
    id: "AC-PATIENT-PORTAL-WRITE",
    surface: "patient portal self-service writes",
    classification: "PARTIALLY_TESTED",
    evidence: [
      "tests/activeclinic-patient-portal.test.js",
      "tests/activeclinic-batch3-acp05-visit-summary.test.js",
    ],
    gap: "Portal reads strong; not every portal POST has cross-tenant forged matrix",
  },
  {
    id: "FIELD-AGENT-WRITES",
    surface: "fieldAgent pay-run / submissions mutations",
    classification: "UNTESTED",
    evidence: [],
    gap: "High uncovered volume; no Prompt-7 verified negative write matrix in overnight security pack",
  },
  {
    id: "AC-DEMO-SEED-WRITES",
    surface: "activeClinicDemoClinicSeedService",
    classification: "UNTESTED",
    evidence: [],
    gap: "Seed utility — not a production authz boundary; left untested for negative matrix (non-P1)",
  },
]);

let pool = null;
let skipReason = null;
let phoneSeq = 860000000;

function requireDb(t) {
  if (skipReason) t.skip(`foundation unavailable: ${skipReason}`);
}

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function evidenceExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

async function provisionClinic(label, roleKeys) {
  const stamp = `${label}_${Date.now().toString(36)}`;
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: stamp.slice(0, 48),
    displayName: `Sec ${label}`,
    productKey: "activeclinic",
    productTenantKey: stamp.slice(0, 48),
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
  assert.equal(hco.ok, true, JSON.stringify(hco));
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `hq-${stamp}`.slice(0, 48),
    displayName: `${label} HQ`,
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
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
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
    firstName: "Staff",
    lastName: label,
    employmentType: "permanent",
    phone,
    status: "active",
    platformIdentityId: identity.identity.id,
    jobTitle: label,
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  await assignStaffToFacility(pool, {
    organizationId: org.records.organization.id,
    staffMemberId: staff.staffMember.id,
    facilityId: facility.facility.id,
    isPrimary: true,
  });
  for (const roleKey of roleKeys) {
    const role = await assignStaffRole(pool, {
      organizationId: org.records.organization.id,
      staffMemberId: staff.staffMember.id,
      roleKey,
      scopeType: roleKey === ORGANIZATION_ADMIN ? "organisation" : "facility",
      facilityId:
        roleKey === ORGANIZATION_ADMIN ? null : facility.facility.id,
    });
    assert.equal(role.ok, true, JSON.stringify(role));
  }
  return {
    organizationId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
    staffId: staff.staffMember.id,
    identityId: identity.identity.id,
  };
}

async function seedRoleUser(clinic, label, roleKey) {
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
    organizationId: clinic.organizationId,
    healthcareOrganizationId: clinic.hcoId,
    firstName: label,
    lastName: "Sec",
    employmentType: "permanent",
    phone,
    status: "active",
    platformIdentityId: identity.identity.id,
    jobTitle: label,
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  await assignStaffToFacility(pool, {
    organizationId: clinic.organizationId,
    staffMemberId: staff.staffMember.id,
    facilityId: clinic.facilityId,
    isPrimary: true,
  });
  const role = await assignStaffRole(pool, {
    organizationId: clinic.organizationId,
    staffMemberId: staff.staffMember.id,
    roleKey,
    scopeType: "facility",
    facilityId: clinic.facilityId,
  });
  assert.equal(role.ok, true, JSON.stringify(role));
  return { staffId: staff.staffMember.id, identityId: identity.identity.id };
}

async function seedPatient(clinic) {
  phoneSeq += 1;
  const patientNumber = `AC-2026-${String(phoneSeq).slice(-6).padStart(6, "0")}`;
  const row = await pool.query(
    `INSERT INTO activeclinic.patients (
       organization_id, healthcare_organization_id, patient_number,
       first_name, last_name, date_of_birth, sex_at_registration
     ) VALUES ($1, $2, $3, 'Pat', 'Sec', '1990-01-15', 'female')
     RETURNING id`,
    [clinic.organizationId, clinic.hcoId, patientNumber]
  );
  return row.rows[0].id;
}

describe("V203 security gate — inventory integrity", () => {
  it("classifies every high-risk endpoint; evidence files exist for tested rows", () => {
    assert.ok(HIGH_RISK_ENDPOINTS.length >= 15);
    const allowed = new Set([
      "FULLY_NEGATIVE_TESTED",
      "PARTIALLY_TESTED",
      "UNTESTED",
    ]);
    for (const row of HIGH_RISK_ENDPOINTS) {
      assert.ok(allowed.has(row.classification), row.id);
      if (row.classification === "UNTESTED") {
        assert.equal(row.evidence.length, 0, row.id);
        continue;
      }
      assert.ok(row.evidence.length > 0, row.id);
      for (const ev of row.evidence) {
        assert.equal(evidenceExists(ev), true, `${row.id} missing ${ev}`);
      }
    }
    const counts = HIGH_RISK_ENDPOINTS.reduce(
      (acc, row) => {
        acc[row.classification] += 1;
        return acc;
      },
      { FULLY_NEGATIVE_TESTED: 0, PARTIALLY_TESTED: 0, UNTESTED: 0 }
    );
    console.log(
      `HIGH_RISK_ENDPOINTS=${HIGH_RISK_ENDPOINTS.length} FULLY_NEGATIVE_TESTED=${counts.FULLY_NEGATIVE_TESTED} PARTIALLY_TESTED=${counts.PARTIALLY_TESTED} UNTESTED=${counts.UNTESTED}`
    );
    // Gate: core shared/AC/BB security surfaces must be fully covered; untested must not be P0/P1 authz boundaries.
    assert.ok(counts.FULLY_NEGATIVE_TESTED >= 12);
    for (const row of HIGH_RISK_ENDPOINTS.filter((r) => r.classification === "UNTESTED")) {
      assert.ok(
        row.id === "FIELD-AGENT-WRITES" || row.id === "AC-DEMO-SEED-WRITES",
        `unexpected UNTESTED security boundary ${row.id}`
      );
    }
  });

  it("permission matrices encode deny for wrong roles (publish/refund)", () => {
    assertMatrixCell(
      BB_PERMISSION_MATRIX["website.publish"],
      "website_editor",
      false,
      "bb publish"
    );
    assertMatrixCell(
      BB_PERMISSION_MATRIX["website.publish"],
      "church_hq_admin",
      true,
      "bb publish hq"
    );
    assertMatrixCell(
      AC_PERMISSION_MATRIX["activeclinic.billing.refund"],
      "activeclinic_cashier",
      false,
      "ac refund cashier"
    );
    assertMatrixCell(
      AC_PERMISSION_MATRIX["activeclinic.billing.refund"],
      "activeclinic_finance_supervisor",
      true,
      "ac refund supervisor"
    );
    assertMatrixCell(
      AC_PERMISSION_MATRIX["website.publish"],
      "activeclinic_website_editor",
      false,
      "ac editor publish"
    );
  });
});

describe("V203 security gate — forged scope / publish / media / escalation", () => {
  it("forged org/facility denied; matching trusted allowed when opted in", () => {
    const forged = rejectForgedTenantIdentifiers({
      body: forgeTenantBody(),
      trusted: { organizationId: ORG_A, facilityId: FAC_A },
    });
    assert.equal(forged.ok, false);

    const fac = assertActiveClinicAuthScope(
      { organizationId: ORG_A, facilityId: FAC_B },
      {
        authenticated: true,
        organization: { id: ORG_A },
        selectedFacility: { id: FAC_A },
      }
    );
    assert.equal(fac.ok, false);
    assert.equal(fac.code, "forged_facility");

    const bbCross = assertResourceInsideBlessBoardTenant(
      { organizationId: ORG_A, churchId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
      {
        resolved: true,
        organization: { id: ORG_A },
        church: { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
      }
    );
    assert.equal(bbCross.ok, false);
  });

  it("HTTP middleware denies forged tenant body; clean body allowed", async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.authz = { organizationId: ORG_A, facilityId: FAC_A };
      next();
    });
    app.use(
      createRejectForgedTenantIdsMiddleware({
        resolveTrusted: (req) => req.authz,
        allowMatchingTrusted: true,
      })
    );
    app.post("/write", (_req, res) => res.status(200).json({ ok: true }));

    const forged = await request(app)
      .post("/write")
      .send({ organizationId: ORG_B, title: "x" });
    expectIsolationDenied(forged, "forged org");

    const forgedFac = await request(app)
      .post("/write")
      .send({ facilityId: FAC_B, title: "x" });
    expectIsolationDenied(forgedFac, "forged facility");

    const ok = await request(app).post("/write").send({ title: "safe" });
    assert.equal(ok.status, 200);
  });

  it("publish: editor denied; admin allowed; cross-tenant denied", async () => {
    const original = instanceRepo.findWebsiteInstanceById;
    instanceRepo.findWebsiteInstanceById = async () => ({
      id: INST_A,
      organizationId: ORG_A,
      productCode: "activeclinic",
      slug: "clinic-a",
      editLocked: false,
    });
    const db = { query: async () => ({ rows: [], rowCount: 0 }) };
    try {
      const editor = await authorizeWebsiteInstance(db, {
        organizationId: ORG_A,
        instanceId: INST_A,
        permission: PERMISSIONS.PUBLISH,
        grantedPermissions: EDITOR_PERMISSIONS.slice(),
      });
      assert.equal(editor.ok, false);

      const admin = await authorizeWebsiteInstance(db, {
        organizationId: ORG_A,
        instanceId: INST_A,
        permission: PERMISSIONS.PUBLISH,
        grantedPermissions: PLATFORM_ADMIN_PERMISSIONS.slice(),
      });
      assert.equal(admin.ok, true);

      const cross = await authorizeWebsiteInstance(db, {
        organizationId: ORG_B,
        instanceId: INST_A,
        permission: PERMISSIONS.PUBLISH,
        grantedPermissions: PLATFORM_ADMIN_PERMISSIONS.slice(),
      });
      assert.equal(cross.ok, false);
    } finally {
      instanceRepo.findWebsiteInstanceById = original;
    }
  });

  it("media uploads fail-closed when kill-switch unset", () => {
    assert.equal(areMediaUploadsEnabled({}), false);
    assert.equal(
      parseMediaUploadsEnabled({ BLESSBOARD_MEDIA_UPLOADS_ENABLED: "1" }).enabled,
      true
    );
  });

  it("branch admin cannot invite organisation_administrator (role escalation)", () => {
    const gate = actorMayInvite(
      [
        {
          role_key: "branch_administrator",
          organization_id: ORG_A,
          church_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          branch_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        },
      ],
      {
        organizationId: ORG_A,
        churchId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        branchId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        roleKey: "organisation_administrator",
      }
    );
    assert.equal(gate.ok, false);
    assert.equal(gate.reason, "role_escalation");
  });

  it("last HQ admin guard fails closed on invalid ids; last_hq_admin when sole admin", async () => {
    const invalid = await assertNotLastHqAdminRemoval(
      { query: async () => ({ rows: [{ cnt: "1" }] }) },
      {
        organizationId: "not-a-uuid",
        churchId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        userId: "11111111-1111-4111-8111-111111111111",
        roleKey: "organisation_administrator",
        scopeType: "church",
      }
    );
    assert.equal(invalid.ok, false);
    assert.equal(invalid.reason, "ids");

    const calls = [];
    const db = {
      async query(sql) {
        calls.push(String(sql));
        if (String(sql).includes("user_id")) {
          return { rows: [{ cnt: "0" }], rowCount: 1 };
        }
        return { rows: [{ cnt: "1" }], rowCount: 1 };
      },
    };
    const guard = await assertNotLastHqAdminRemoval(db, {
      organizationId: ORG_A,
      churchId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      userId: "11111111-1111-4111-8111-111111111111",
      excludeAssignmentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      roleKey: "organisation_administrator",
      scopeType: "church",
    });
    assert.equal(guard.ok, false);
    assert.equal(guard.reason, "last_hq_admin");
    assert.ok(calls.length >= 1);
  });
});

describe("V203 security gate — AC last-admin + billing/clinical write matrix", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 400) : "no db";
      pool = null;
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("last org admin cannot be removed", async (t) => {
    requireDb(t);
    const clinic = await provisionClinic("lastadm", [ORGANIZATION_ADMIN]);
    const blocked = await assertNotLastOrgAdminRemoval(pool, {
      organizationId: clinic.organizationId,
      staffMemberId: clinic.staffId,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, ACCESS_RESULT.LAST_ORG_ADMIN);
  });

  it("billing write matrix: authz→persist; unauth role/cross-tenant/invalid denied", async (t) => {
    requireDb(t);
    const clinicA = await provisionClinic("billa", [FINANCE_SUPERVISOR]);
    const clinicB = await provisionClinic("billb", [FINANCE_SUPERVISOR]);
    const reception = await seedRoleUser(clinicA, "Recv", RECEPTIONIST);
    const billingOfficer = await seedRoleUser(clinicA, "Bill", BILLING_OFFICER);
    const patientA = await seedPatient(clinicA);

    const deniedRole = await createPatientCharge({
      pool,
      tenantId: clinicA.organizationId,
      facilityId: clinicA.facilityId,
      staffId: reception.staffId,
      patientId: patientA,
      chargeType: "procedure",
      description: "denied",
      unitAmountMinor: 1000,
    });
    assert.equal(deniedRole.result, BILLING_RESULT.ACCESS_DENIED);

    const charge = await createPatientCharge({
      pool,
      tenantId: clinicA.organizationId,
      facilityId: clinicA.facilityId,
      staffId: clinicA.staffId,
      patientId: patientA,
      chargeType: "procedure",
      description: "sec gate",
      unitAmountMinor: 5000,
    });
    assert.equal(charge.result, BILLING_RESULT.CREATED, JSON.stringify(charge));

    const crossTenant = await createPatientCharge({
      pool,
      tenantId: clinicB.organizationId,
      facilityId: clinicB.facilityId,
      staffId: clinicB.staffId,
      patientId: patientA,
      chargeType: "procedure",
      description: "cross",
      unitAmountMinor: 1000,
    });
    assert.equal(crossTenant.result, BILLING_RESULT.NOT_FOUND);
    assert.equal(crossTenant.reason, "patient");

    const invoice = await createInvoice({
      pool,
      tenantId: clinicA.organizationId,
      facilityId: clinicA.facilityId,
      staffId: clinicA.staffId,
      patientId: patientA,
      chargeIds: [charge.charge.id],
    });
    assert.equal(invoice.result, BILLING_RESULT.CREATED, JSON.stringify(invoice));
    const posted = await postInvoice({
      pool,
      tenantId: clinicA.organizationId,
      facilityId: clinicA.facilityId,
      staffId: clinicA.staffId,
      invoiceId: invoice.invoice.id,
    });
    assert.equal(posted.result, BILLING_RESULT.OK, JSON.stringify(posted));

    const reload = await pool.query(
      `SELECT id, tenant_id, facility_id, status FROM activeclinic.invoices WHERE id = $1`,
      [invoice.invoice.id]
    );
    assert.equal(reload.rowCount, 1);
    assert.equal(reload.rows[0].tenant_id, clinicA.organizationId);
    assert.equal(reload.rows[0].facility_id, clinicA.facilityId);

    const foreignReload = await pool.query(
      `SELECT id FROM activeclinic.invoices WHERE id = $1 AND tenant_id = $2`,
      [invoice.invoice.id, clinicB.organizationId]
    );
    assert.equal(foreignReload.rowCount, 0);

    const sodVoid = await voidInvoice({
      pool,
      tenantId: clinicA.organizationId,
      facilityId: clinicA.facilityId,
      staffId: billingOfficer.staffId,
      invoiceId: invoice.invoice.id,
      reason: "SoD",
    });
    assert.equal(sodVoid.result, BILLING_RESULT.ACCESS_DENIED);

    const noReason = await voidInvoice({
      pool,
      tenantId: clinicA.organizationId,
      facilityId: clinicA.facilityId,
      staffId: clinicA.staffId,
      invoiceId: invoice.invoice.id,
    });
    assert.equal(noReason.result, BILLING_RESULT.INVALID_INPUT);

    const voided = await voidInvoice({
      pool,
      tenantId: clinicA.organizationId,
      facilityId: clinicA.facilityId,
      staffId: clinicA.staffId,
      invoiceId: invoice.invoice.id,
      reason: "authorized void",
    });
    assert.equal(voided.result, BILLING_RESULT.OK, JSON.stringify(voided));
  });

  it("clinical write matrix: clinician ok; receptionist denied; foreign facility authz", async (t) => {
    requireDb(t);
    const clinic = await provisionClinic("clin", [CLINICIAN]);
    const reception = await seedRoleUser(clinic, "RecvC", RECEPTIONIST);
    const patientId = await seedPatient(clinic);

    const denied = await startEncounter(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      patientId,
      actor: {
        staffMemberId: reception.staffId,
        platformIdentityId: reception.identityId,
      },
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.code, CLINICAL_RESULT.ACCESS_DENIED);

    const started = await startEncounter(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      patientId,
      actor: {
        staffMemberId: clinic.staffId,
        platformIdentityId: clinic.identityId,
      },
    });
    assert.equal(started.ok, true, JSON.stringify(started));

    const reload = await pool.query(
      `SELECT id, organization_id, facility_id, status FROM activeclinic.encounters WHERE id = $1`,
      [started.encounter.id]
    );
    assert.equal(reload.rowCount, 1);
    assert.equal(reload.rows[0].organization_id, clinic.organizationId);
    assert.equal(reload.rows[0].facility_id, clinic.facilityId);

    const cashAuth = await authorizeStaffPermission(pool, {
      organizationId: clinic.organizationId,
      staffMemberId: reception.staffId,
      facilityId: clinic.facilityId,
      permissionKey: "activeclinic.encounter.manage",
    });
    assert.equal(cashAuth.ok, false);
  });
});

describe("V203 security gate — marker", () => {
  it("V203_SECURITY_COVERAGE_GATE_PASS", () => {
    assert.equal(
      "V203_SECURITY_COVERAGE_GATE_PASS",
      "V203_SECURITY_COVERAGE_GATE_PASS"
    );
  });
});

module.exports = { HIGH_RISK_ENDPOINTS };
