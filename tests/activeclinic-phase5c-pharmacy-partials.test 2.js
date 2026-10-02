"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const request = require("supertest");

const ROOT = path.resolve(__dirname, "..");

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
  PHARMACIST,
  RECEPTIONIST,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  ensureDefaultDepartments,
} = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  registerActiveClinicPatient,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  addMedication,
  receiveStock,
  createPharmacyPrescription,
  getPrescriptionById,
  getInventoryBatchById,
  listAvailableBatchesForMedication,
} = require("../src/activeclinic/services/activeClinicPharmacyService");
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

const PASSWORD = "activeclinic-p5c-pharm-pass";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 990000000;

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
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

async function seedAcTenant(stamp, keyPrefix) {
  const org = await provisionOrg({
    organizationKey: `${keyPrefix}_${stamp}`,
    displayName: `AC ${keyPrefix}`,
    productKey: "activeclinic",
    productTenantKey: `${keyPrefix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "Legal Clinic",
    publicName: "Public Clinic",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true);
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `main-${keyPrefix}`.slice(0, 64),
    displayName: "Main Clinic",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facility.ok, true);
  await ensureDefaultDepartments(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  });
  return {
    orgId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  };
}

async function seedStaff(tenant, roleKey = PHARMACIST) {
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
    organizationId: tenant.orgId,
    healthcareOrganizationId: tenant.hcoId,
    firstName: "Pharm",
    lastName: "Staff",
    employmentType: "permanent",
    status: "active",
    phone,
    personalEmail: `pharmstaff_${Date.now()}@example.com`,
    staffRole: roleKey === RECEPTIONIST ? "receptionist" : "pharmacist",
    platformIdentityId: identity.identity.id,
  });
  assert.equal(staff.ok, true);
  await assignStaffToFacility(pool, {
    organizationId: tenant.orgId,
    staffMemberId: staff.staffMember.id,
    facilityId: tenant.facilityId,
  });
  await assignStaffRole(pool, {
    organizationId: tenant.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey,
    scopeType: "facility",
    facilityId: tenant.facilityId,
  });
  if (roleKey === PHARMACIST) {
    await assignStaffRole(pool, {
      organizationId: tenant.orgId,
      staffMemberId: staff.staffMember.id,
      roleKey: RECEPTIONIST,
      scopeType: "facility",
      facilityId: tenant.facilityId,
    });
  }
  return {
    identityId: identity.identity.id,
    staffId: staff.staffMember.id,
    phone,
  };
}

async function seedPatient(tenant, staffId) {
  const patient = await registerActiveClinicPatient(pool, {
    organizationId: tenant.orgId,
    healthcareOrganizationId: tenant.hcoId,
    facilityId: tenant.facilityId,
    actor: { staffMemberId: staffId },
    demographics: { firstName: "Pat", lastName: "Test", dateOfBirth: "1990-01-01" },
    registrationMethod: "walk_in",
  });
  assert.equal(patient.ok, true, JSON.stringify(patient));
  return patient.patient.id;
}

async function makeSessionCookie(identityId, orgId, facilityId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId: orgId,
    contextJson: facilityId ? { selectedFacilityId: facilityId } : {},
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

describe("ActiveClinic V7 Phase 5C pharmacy partial closure", () => {
  describe("wiring", () => {
    it("wires multi-step dispense, batch detail, and select-batch surfaces", () => {
      const routes = read("src/activeclinic/http/activeClinicPharmacyRoutes.js");
      const loaders = read("src/activeclinic/services/loadActiveClinicPharmacyScreens.js");
      const service = read("src/activeclinic/services/activeClinicPharmacyService.js");
      const review = read("views/activeclinic/app/pharmacy-dispense-content.ejs");
      const confirm = read("views/activeclinic/app/pharmacy-dispense-confirm-content.ejs");
      const completed = read("views/activeclinic/app/pharmacy-dispense-completed-content.ejs");
      const batchDetail = read("views/activeclinic/app/pharmacy-batch-detail-content.ejs");
      const selectBatch = read("views/activeclinic/app/pharmacy-select-batch-content.ejs");

      assert.match(routes, /\/app\/pharmacy\/prescriptions\/:id\/dispense\/confirm/);
      assert.match(routes, /\/app\/pharmacy\/prescriptions\/:id\/dispense\/completed/);
      assert.match(routes, /\/app\/pharmacy\/inventory\/batches\/:batchId/);
      assert.match(routes, /\/app\/pharmacy\/prescriptions\/:prescriptionId\/items\/:itemId\/select-batch/);
      assert.match(routes, /parseDispenseFormBody/);
      assert.match(review, /data-ac-dispense-step/);
      assert.match(review, /select-batch/);
      assert.match(confirm, /data-ac-dispense-step="confirm"/);
      assert.match(confirm, /Confirm dispense/);
      assert.match(completed, /data-ac-dispense-step="completed"/);
      assert.match(batchDetail, /data-ac-page-section="pharmacy-batch-detail"/);
      assert.match(selectBatch, /data-ac-page-section="pharmacy-select-batch"/);
      assert.match(loaders, /loadActiveClinicPharmacyDispenseCompletedScreen/);
      assert.match(loaders, /loadActiveClinicPharmacyBatchDetailScreen/);
      assert.match(loaders, /loadActiveClinicPharmacySelectBatchScreen/);
      assert.match(loaders, /batchesByMedication/);
      assert.match(service, /listAvailableBatchesForMedication/);
      assert.match(service, /getInventoryBatchById/);
      assert.match(service, /listStockMovementsForBatch/);
    });
  });

  describe("integration", () => {
    before(async () => {
      resetDeploymentProfileWarningsForTests();
      try {
        databaseUrl = await resetFoundationDatabase();
        pool = createFoundationPool(databaseUrl);
        await migrate({ connectionString: databaseUrl });
      } catch (err) {
        skipReason = err && err.message ? err.message : String(err);
        pool = null;
      }
    });

    after(async () => {
      if (pool) await pool.end();
    });

    it("runs review → confirm → completed dispense with real batches", async () => {
      requireDb();
      const stamp = Date.now();
      const tenant = await seedAcTenant(stamp, "p5c_disp");
      const staff = await seedStaff(tenant);
      const patientId = await seedPatient(tenant, staff.staffId);

      const medicationResult = await addMedication(pool, {
        staffId: staff.staffId,
        organizationId: tenant.orgId,
        healthcareOrganizationId: tenant.hcoId,
        genericName: "Amoxicillin",
        strength: "250mg",
        dosageForm: "capsule",
        unitOfMeasure: "capsule",
      });
      const receiveResult = await receiveStock(pool, {
        staffId: staff.staffId,
        organizationId: tenant.orgId,
        healthcareOrganizationId: tenant.hcoId,
        facilityId: tenant.facilityId,
        medicationCatalogueItemId: medicationResult.medication.id,
        batchNumber: `P5C-${stamp}`,
        quantity: 200,
        expiryDate: "2027-12-31",
      });
      assert.equal(receiveResult.ok, true);

      const prescriptionResult = await createPharmacyPrescription(pool, {
        staffId: staff.staffId,
        organizationId: tenant.orgId,
        healthcareOrganizationId: tenant.hcoId,
        facilityId: tenant.facilityId,
        patientId,
        prescriberStaffId: staff.staffId,
        priority: "normal",
        items: [
          {
            medicationCatalogueItemId: medicationResult.medication.id,
            quantityOrdered: 20,
            dosageInstructions: "Take 1 capsule three times daily",
          },
        ],
      });
      const detail = await getPrescriptionById(pool, {
        staffId: staff.staffId,
        organizationId: tenant.orgId,
        prescriptionId: prescriptionResult.prescription.id,
      });
      const itemId = detail.items[0].id;

      const env = { ...MINIMAL_AC, DATABASE_URL: databaseUrl };
      const app = createActiveClinicFoundationApp({ getPool: () => pool, env });
      const sessionCookie = await makeSessionCookie(staff.identityId, tenant.orgId, tenant.facilityId);

      const reviewRes = await request(app)
        .get(`/app/pharmacy/prescriptions/${prescriptionResult.prescription.id}/dispense`)
        .set("Cookie", sessionCookie)
        .expect(200);
      assert.match(reviewRes.text, /Review items/);
      assert.match(reviewRes.text, /select-batch/);

      const selectRes = await request(app)
        .get(`/app/pharmacy/prescriptions/${prescriptionResult.prescription.id}/items/${itemId}/select-batch`)
        .set("Cookie", sessionCookie)
        .expect(200);
      assert.match(selectRes.text, /Select medicine batch/);
      assert.match(selectRes.text, new RegExp(receiveResult.batch.batchNumber));

      const batchDetailRes = await request(app)
        .get(`/app/pharmacy/inventory/batches/${receiveResult.batch.id}`)
        .set("Cookie", sessionCookie)
        .expect(200);
      assert.match(batchDetailRes.text, /Movement history/);
      assert.match(batchDetailRes.text, new RegExp(receiveResult.batch.batchNumber));

      const csrfToken = issueCsrfToken(env);
      const csrfCookie = `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrfToken}`;
      const postReview = await request(app)
        .post(`/app/pharmacy/prescriptions/${prescriptionResult.prescription.id}/dispense`)
        .set("Cookie", `${sessionCookie}; ${csrfCookie}`)
        .type("form")
        .send({
          [CSRF_FIELD]: csrfToken,
          [`item_${itemId}`]: itemId,
          [`quantity_${itemId}`]: "20",
          [`batch_${itemId}`]: receiveResult.batch.id,
          dispenseType: "full",
          patientAcknowledged: "true",
        })
        .expect(303);
      assert.match(postReview.headers.location, /\/dispense\/confirm/);

      const confirmRes = await request(app)
        .get(postReview.headers.location)
        .set("Cookie", sessionCookie)
        .expect(200);
      assert.match(confirmRes.text, /Confirm dispensing/);

      const csrfToken2 = issueCsrfToken(env);
      const csrfCookie2 = `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrfToken2}`;
      const postConfirm = await request(app)
        .post(`/app/pharmacy/prescriptions/${prescriptionResult.prescription.id}/dispense`)
        .set("Cookie", `${sessionCookie}; ${csrfCookie2}`)
        .type("form")
        .send({
          [CSRF_FIELD]: csrfToken2,
          confirm: "1",
          [`item_${itemId}`]: itemId,
          [`quantity_${itemId}`]: "20",
          [`batch_${itemId}`]: receiveResult.batch.id,
          dispenseType: "full",
          patientAcknowledged: "true",
        })
        .expect(303);
      assert.match(postConfirm.headers.location, /\/dispense\/completed/);

      const completedRes = await request(app)
        .get(postConfirm.headers.location)
        .set("Cookie", sessionCookie)
        .expect(200);
      assert.match(completedRes.text, /Dispensing completed/);

      const batchSvc = await getInventoryBatchById(pool, {
        staffId: staff.staffId,
        organizationId: tenant.orgId,
        facilityId: tenant.facilityId,
        batchId: receiveResult.batch.id,
      });
      assert.equal(batchSvc.ok, true);
    });

    it("denies batch detail without pharmacy inventory permission", async () => {
      requireDb();
      const stamp = Date.now();
      const tenant = await seedAcTenant(stamp, "p5c_deny");
      const pharmacist = await seedStaff(tenant, PHARMACIST);
      const reception = await seedStaff(tenant, RECEPTIONIST);
      const medicationResult = await addMedication(pool, {
        staffId: pharmacist.staffId,
        organizationId: tenant.orgId,
        healthcareOrganizationId: tenant.hcoId,
        genericName: "Metformin",
        strength: "500mg",
        dosageForm: "tablet",
        unitOfMeasure: "tablet",
      });
      const receiveResult = await receiveStock(pool, {
        staffId: pharmacist.staffId,
        organizationId: tenant.orgId,
        healthcareOrganizationId: tenant.hcoId,
        facilityId: tenant.facilityId,
        medicationCatalogueItemId: medicationResult.medication.id,
        batchNumber: `DENY-${stamp}`,
        quantity: 50,
        expiryDate: "2027-06-30",
      });

      const env = { ...MINIMAL_AC, DATABASE_URL: databaseUrl };
      const app = createActiveClinicFoundationApp({ getPool: () => pool, env });
      const sessionCookie = await makeSessionCookie(reception.identityId, tenant.orgId, tenant.facilityId);

      await request(app)
        .get(`/app/pharmacy/inventory/batches/${receiveResult.batch.id}`)
        .set("Cookie", sessionCookie)
        .expect(403);

      const listed = await listAvailableBatchesForMedication(pool, {
        staffId: reception.staffId,
        organizationId: tenant.orgId,
        facilityId: tenant.facilityId,
        medicationCatalogueItemId: medicationResult.medication.id,
      });
      assert.equal(listed.ok, false);
      assert.equal(listed.result, "access_denied");
    });
  });
});
