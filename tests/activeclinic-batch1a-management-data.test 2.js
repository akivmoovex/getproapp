"use strict";

/**
 * V2.03 ACN25 performance + ACN26 import/export centre.
 * RBAC, tenant isolation, invalid/large input, export privacy, audit.
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
  assignStaffRole,
  CLINIC_MANAGER,
  RECEPTIONIST,
  CASHIER,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  loadClinicPerformanceDashboard,
} = require("../src/activeclinic/services/activeClinicPerformanceService");
const {
  registerActiveClinicDataJobAdapters,
} = require("../src/activeclinic/services/activeClinicDataJobAdapters");
const {
  clearDataJobAdapters,
  clearArtifacts,
  validateImportFile,
  previewDataJobImport,
  runDataJobExport,
  downloadDataJobArtifact,
  listDataJobAdapters,
} = require("../src/platform/jobs");
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
let phoneSeq = 750000000;
let app;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

async function provisionClinic(label, roleKeys) {
  const stamp = `${label}_${Date.now().toString(36)}`;
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: stamp,
    displayName: `Mgmt ${label}`,
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
    displayName: `${label} HQ`,
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
    city: "Lusaka",
  });
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
      scopeType: "facility",
      facilityId: facility.facility.id,
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

async function sessionCookie(clinic) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: clinic.identityId,
    organizationId: clinic.organizationId,
  });
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

describe("ActiveClinic V2.03 ACN25–26 management data", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      clearDataJobAdapters();
      clearArtifacts();
      registerActiveClinicDataJobAdapters();
      app = createActiveClinicFoundationApp({
        getPool: () => pool,
        env: MINIMAL_AC,
        log: () => {},
      });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
      pool = null;
    }
  });

  after(async () => {
    if (pool) await pool.end();
    clearDataJobAdapters();
    clearArtifacts();
  });

  beforeEach(() => {
    clearArtifacts();
  });

  it("ships Stitch markers, permissions migration, and platform adapters", () => {
    const migration = read(
      "db/migrations/blessboard/118_activeclinic_management_data_permissions.sql"
    );
    assert.match(migration, /activeclinic\.performance\.view/);
    assert.match(migration, /activeclinic\.data\.import/);
    assert.match(migration, /activeclinic\.data\.export/);

    assert.match(
      read("views/activeclinic/app/performance-dashboard-content.ejs"),
      /data-ac-stitch="ACN25"/
    );
    assert.match(
      read("views/activeclinic/app/data-import-export-content.ejs"),
      /data-ac-stitch="ACN26"/
    );
    assert.match(
      read("src/activeclinic/http/activeClinicManagementDataRoutes.js"),
      /b834a9b768664c1d91302a0aa1b79b7c|4137e48363914fa1be8a0bff9b3970c3/
    );

    const adapters = listDataJobAdapters("activeclinic");
    const keys = adapters.map((a) => a.entityKey).sort();
    assert.deepEqual(keys, [
      "ac.appointments",
      "ac.financial_summary",
      "ac.patients",
      "ac.services",
      "ac.setup_catalogue",
    ]);
  });

  it("rejects oversized and forged-tenant CSV at the platform validation layer", () => {
    const huge = "code,name,amount\n" + "A,B,1\n".repeat(6000);
    const tooMany = validateImportFile({
      text: huge,
      filename: "big.csv",
      maxRows: 5000,
    });
    assert.equal(tooMany.ok, false);
    assert.equal(tooMany.code, "too_many_rows");

    const forged = validateImportFile({
      text: "code,name,amount,organization_id\nX,Y,10,abc\n",
      filename: "bad.csv",
      requiredHeaders: ["code", "name", "amount"],
    });
    assert.equal(forged.ok, false);
    assert.equal(forged.code, "forbidden_tenant_columns");
  });

  it("loads performance aggregates without clinical narrative fields and gates RBAC", async () => {
    requireDb();
    const manager = await provisionClinic("perfmgr", [CLINIC_MANAGER]);
    const reception = await provisionClinic("perfrecv", [RECEPTIONIST]);

    const allowed = await loadClinicPerformanceDashboard(pool, {
      organizationId: manager.organizationId,
      healthcareOrganizationId: manager.hcoId,
      facilityId: manager.facilityId,
      permissions: ["activeclinic.performance.view", "activeclinic.billing.view"],
      filters: {},
    });
    assert.equal(allowed.ok, true);
    assert.ok(Object.prototype.hasOwnProperty.call(allowed.metrics, "appointments"));
    assert.ok(Object.prototype.hasOwnProperty.call(allowed.metrics, "noShows"));
    assert.ok(Object.prototype.hasOwnProperty.call(allowed.metrics, "avgWaitMinutes"));
    assert.doesNotMatch(JSON.stringify(allowed), /diagnosis|chiefComplaint|SOAP|narrative/i);

    const denied = await loadClinicPerformanceDashboard(pool, {
      organizationId: reception.organizationId,
      healthcareOrganizationId: reception.hcoId,
      facilityId: reception.facilityId,
      permissions: ["activeclinic.access", "activeclinic.reception.view"],
      filters: {},
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.code, "access_denied");

    const cookieRecv = await sessionCookie(reception);
    const httpDenied = await request(app)
      .get("/app/performance")
      .set("Cookie", cookieRecv);
    assert.equal(httpDenied.status, 403);

    const cookieMgr = await sessionCookie(manager);
    const httpOk = await request(app).get("/app/performance").set("Cookie", cookieMgr);
    assert.ok([200, 303].includes(httpOk.status));
    if (httpOk.status === 200) {
      assert.match(httpOk.text, /Clinic performance|Appointments|Popular services/);
      assert.doesNotMatch(httpOk.text, /diagnosis|chief complaint/i);
    }
  });

  it("imports setup catalogue with preview/commit and isolates exports across tenants", async () => {
    requireDb();
    const a = await provisionClinic("dataa", [CLINIC_MANAGER]);
    const b = await provisionClinic("datab", [CLINIC_MANAGER]);

    const csv = [
      "code,name,amount,category",
      "CONSULT,Consultation,150.00,consult",
      "DRESS,Dressing,25.50,procedure",
    ].join("\n");

    const preview = await previewDataJobImport(pool, {
      trusted: {
        organizationId: a.organizationId,
        facilityId: a.facilityId,
        healthcareOrganizationId: a.hcoId,
        staffId: a.staffId,
      },
      productCode: "activeclinic",
      entityKey: "ac.setup_catalogue",
      actorIdentityId: a.identityId,
      text: csv,
      filename: "setup.csv",
      requiredHeaders: ["code", "name", "amount"],
    });
    assert.equal(preview.ok, true, JSON.stringify(preview));
    assert.equal(preview.preview.acceptedCount, 2);
    assert.equal(preview.preview.errorCount, 0);

    const events = await pool.query(
      `SELECT to_status FROM platform.data_job_events
        WHERE job_id = $1 AND organization_id = $2
        ORDER BY created_at ASC`,
      [preview.job.id, a.organizationId]
    );
    assert.ok(events.rows.length >= 2);
    assert.ok(events.rows.some((r) => r.to_status === "succeeded"));
    assert.ok(events.rows.some((r) => r.to_status === "validating" || r.to_status === "queued"));

    const exportA = await runDataJobExport(pool, {
      trusted: {
        organizationId: a.organizationId,
        facilityId: a.facilityId,
        healthcareOrganizationId: a.hcoId,
        staffId: a.staffId,
      },
      productCode: "activeclinic",
      entityKey: "ac.services",
      actorIdentityId: a.identityId,
    });
    assert.equal(exportA.ok, true, JSON.stringify(exportA));

    const downloadB = await downloadDataJobArtifact(pool, {
      trusted: {
        organizationId: b.organizationId,
        facilityId: b.facilityId,
      },
      jobId: exportA.job.id,
    });
    assert.equal(downloadB.ok, false);
    assert.ok(["not_found", "artifact_expired"].includes(downloadB.code));

    // Export privacy: patients CSV must not include clinical columns
    const patientsExport = await runDataJobExport(pool, {
      trusted: {
        organizationId: a.organizationId,
        facilityId: a.facilityId,
        healthcareOrganizationId: a.hcoId,
        staffId: a.staffId,
      },
      productCode: "activeclinic",
      entityKey: "ac.patients",
      actorIdentityId: a.identityId,
    });
    assert.equal(patientsExport.ok, true);
    const artifact = await downloadDataJobArtifact(pool, {
      trusted: {
        organizationId: a.organizationId,
        facilityId: a.facilityId,
      },
      jobId: patientsExport.job.id,
    });
    assert.equal(artifact.ok, true);
    assert.doesNotMatch(artifact.artifact.body, /diagnosis|chief_complaint|soap|national_id/i);
    assert.match(artifact.artifact.body, /patient_number/);

    const cookieCashier = await sessionCookie(
      await provisionClinic("datacash", [CASHIER])
    );
    const deniedImport = await request(app)
      .get("/app/data")
      .set("Cookie", cookieCashier);
    assert.equal(deniedImport.status, 403);
  });
});
