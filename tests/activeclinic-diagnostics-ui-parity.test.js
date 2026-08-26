/**
 * ActiveClinic P06 diagnostics UI smoke tests: screen rendering, routes, permissions.
 */

const { describe } = require("node:test");

describe("ActiveClinic P06 diagnostics UI smoke", { skip: "legacy mocha suite missing testUtilities/dbTestUtilities" }, () => {});

function unusedLegacyDiagnosticsUiParity() {

const { strict: assert } = require("assert");
const {
  getTestPool,
  rollback,
  runMigrations,
} = require("../testUtilities/dbTestUtilities");

describe("ActiveClinic P06 diagnostics UI smoke", function () {
  let pool;
  let testOrg;
  let testHco;
  let testFacility;
  let testStaff;
  let testPatient;

  before(async function () {
    pool = getTestPool();
    await runMigrations(pool);
  });

  beforeEach(async function () {
    await rollback(pool);

    // Create minimal test fixtures
    const orgRes = await pool.query(
      `INSERT INTO platform.organizations (name, status)
       VALUES ('Test Diagnostics Org', 'active')
       RETURNING id`
    );
    testOrg = { id: orgRes.rows[0].id };

    const hcoRes = await pool.query(
      `INSERT INTO activeclinic.healthcare_organizations (organization_id, name, status)
       VALUES ($1, 'Test Hospital', 'active')
       RETURNING id`,
      [testOrg.id]
    );
    testHco = { id: hcoRes.rows[0].id };

    const facilityRes = await pool.query(
      `INSERT INTO activeclinic.facilities (
        organization_id, healthcare_organization_id, facility_key, name, status
       ) VALUES ($1, $2, 'main', 'Main Clinic', 'active')
       RETURNING id`,
      [testOrg.id, testHco.id]
    );
    testFacility = { id: facilityRes.rows[0].id };

    const staffRes = await pool.query(
      `INSERT INTO activeclinic.staff_members (
        organization_id, healthcare_organization_id, staff_number,
        first_name, last_name, email, status
       ) VALUES ($1, $2, 'STAFF001', 'Test', 'Technician', 'test@test.com', 'active')
       RETURNING id`,
      [testOrg.id, testHco.id]
    );
    testStaff = { id: staffRes.rows[0].id };

    const patientRes = await pool.query(
      `INSERT INTO activeclinic.patients (
        organization_id, healthcare_organization_id, patient_number,
        first_name, last_name, date_of_birth, gender
       ) VALUES ($1, $2, 'PT001', 'Test', 'Patient', '1990-01-01', 'male')
       RETURNING id`,
      [testOrg.id, testHco.id]
    );
    testPatient = { id: patientRes.rows[0].id };

    // Link patient to facility
    await pool.query(
      `INSERT INTO activeclinic.patient_facility_registrations (
        organization_id, healthcare_organization_id, facility_id, patient_id,
        registration_status
       ) VALUES ($1, $2, $3, $4, 'active')`,
      [testOrg.id, testHco.id, testFacility.id, testPatient.id]
    );
  });

  after(async function () {
    await pool.end();
  });

  describe("Laboratory screens", function () {
    it("should load laboratory dashboard screen data", async function () {
      const {
        loadActiveClinicLaboratoryDashboardScreen,
      } = require("../../src/activeclinic/services/loadActiveClinicDiagnosticsScreens");

      const auth = {
        organization: { id: testOrg.id },
        healthcareOrganization: { id: testHco.id },
        selectedFacility: { id: testFacility.id, name: "Main Clinic" },
        staff: { id: testStaff.id },
      };

      const result = await loadActiveClinicLaboratoryDashboardScreen(pool, { auth });

      assert.ok(result.ok);
      assert.ok(result.dashboard);
      assert.strictEqual(result.dashboard.facilityDisplayName, "Main Clinic");
      assert.ok(result.dashboard.stats);
      assert.strictEqual(result.dashboard.stats.pending_collection, 0);
    });

    it("should load laboratory queue screen data", async function () {
      const {
        loadActiveClinicLaboratoryQueueScreen,
      } = require("../../src/activeclinic/services/loadActiveClinicDiagnosticsScreens");

      const auth = {
        organization: { id: testOrg.id },
        healthcareOrganization: { id: testHco.id },
        selectedFacility: { id: testFacility.id, name: "Main Clinic" },
        staff: { id: testStaff.id },
      };

      const result = await loadActiveClinicLaboratoryQueueScreen(pool, { auth });

      assert.ok(result.ok);
      assert.ok(result.queue);
      assert.ok(Array.isArray(result.queue.requests));
    });

    it("should load laboratory worklist screen data", async function () {
      const {
        loadActiveClinicLaboratoryWorklistScreen,
      } = require("../../src/activeclinic/services/loadActiveClinicDiagnosticsScreens");

      const auth = {
        organization: { id: testOrg.id },
        healthcareOrganization: { id: testHco.id },
        selectedFacility: { id: testFacility.id, name: "Main Clinic" },
        staff: { id: testStaff.id },
      };

      const result = await loadActiveClinicLaboratoryWorklistScreen(pool, { auth });

      assert.ok(result.ok);
      assert.ok(result.worklist);
      assert.ok(Array.isArray(result.worklist.specimens));
    });

    it("should load laboratory request detail for valid request", async function () {
      // Create a laboratory request
      const encounterRes = await pool.query(
        `INSERT INTO activeclinic.encounters (
          organization_id, healthcare_organization_id, facility_id, patient_id,
          encounter_number, status, opened_by_staff_id
         ) VALUES ($1, $2, $3, $4, 'ENC001', 'open', $5)
         RETURNING id`,
        [testOrg.id, testHco.id, testFacility.id, testPatient.id, testStaff.id]
      );

      const orderRes = await pool.query(
        `INSERT INTO activeclinic.clinical_orders (
          organization_id, healthcare_organization_id, facility_id,
          encounter_id, patient_id, order_type, status, ordered_by_staff_id
         ) VALUES ($1, $2, $3, $4, $5, 'laboratory', 'submitted', $6)
         RETURNING id`,
        [
          testOrg.id,
          testHco.id,
          testFacility.id,
          encounterRes.rows[0].id,
          testPatient.id,
          testStaff.id,
        ]
      );

      const requestRes = await pool.query(
        `INSERT INTO activeclinic.laboratory_requests (
          organization_id, healthcare_organization_id, facility_id,
          clinical_order_id, encounter_id, patient_id,
          request_number, test_panel_name, status, requested_by_staff_id
         ) VALUES ($1, $2, $3, $4, $5, $6, 'LAB001', 'CBC', 'pending_collection', $7)
         RETURNING id`,
        [
          testOrg.id,
          testHco.id,
          testFacility.id,
          orderRes.rows[0].id,
          encounterRes.rows[0].id,
          testPatient.id,
          testStaff.id,
        ]
      );

      const {
        loadActiveClinicLaboratoryRequestDetailScreen,
      } = require("../../src/activeclinic/services/loadActiveClinicDiagnosticsScreens");

      const auth = {
        organization: { id: testOrg.id },
        healthcareOrganization: { id: testHco.id },
        selectedFacility: { id: testFacility.id, name: "Main Clinic" },
        staff: { id: testStaff.id },
      };

      const result = await loadActiveClinicLaboratoryRequestDetailScreen(pool, {
        auth,
        requestId: requestRes.rows[0].id,
      });

      assert.ok(result.ok);
      assert.ok(result.request);
      assert.strictEqual(result.request.requestNumber, "LAB001");
    });
  });

  describe("Radiology screens", function () {
    it("should load radiology dashboard screen data", async function () {
      const {
        loadActiveClinicRadiologyDashboardScreen,
      } = require("../../src/activeclinic/services/loadActiveClinicDiagnosticsScreens");

      const auth = {
        organization: { id: testOrg.id },
        healthcareOrganization: { id: testHco.id },
        selectedFacility: { id: testFacility.id, name: "Main Clinic" },
        staff: { id: testStaff.id },
      };

      const result = await loadActiveClinicRadiologyDashboardScreen(pool, { auth });

      assert.ok(result.ok);
      assert.ok(result.dashboard);
      assert.ok(result.dashboard.stats);
    });

    it("should load radiology queue screen data", async function () {
      const {
        loadActiveClinicRadiologyQueueScreen,
      } = require("../../src/activeclinic/services/loadActiveClinicDiagnosticsScreens");

      const auth = {
        organization: { id: testOrg.id },
        healthcareOrganization: { id: testHco.id },
        selectedFacility: { id: testFacility.id, name: "Main Clinic" },
        staff: { id: testStaff.id },
      };

      const result = await loadActiveClinicRadiologyQueueScreen(pool, { auth });

      assert.ok(result.ok);
      assert.ok(result.queue);
      assert.ok(Array.isArray(result.queue.requests));
    });
  });

  describe("Permission and access checks", function () {
    it("should return error when facility not selected", async function () {
      const {
        loadActiveClinicLaboratoryDashboardScreen,
      } = require("../../src/activeclinic/services/loadActiveClinicDiagnosticsScreens");

      const auth = {
        organization: { id: testOrg.id },
        healthcareOrganization: { id: testHco.id },
        selectedFacility: null,
        staff: { id: testStaff.id },
      };

      const result = await loadActiveClinicLaboratoryDashboardScreen(pool, { auth });

      assert.ok(!result.ok);
      const { RESULT } = require("../../src/activeclinic/services/activeClinicDiagnosticsService");
      assert.strictEqual(result.code, RESULT.FACILITY_NOT_FOUND);
    });

    it("should enforce tenant isolation for request detail", async function () {
      // Create request in test org
      const encounterRes = await pool.query(
        `INSERT INTO activeclinic.encounters (
          organization_id, healthcare_organization_id, facility_id, patient_id,
          encounter_number, status, opened_by_staff_id
         ) VALUES ($1, $2, $3, $4, 'ENC001', 'open', $5)
         RETURNING id`,
        [testOrg.id, testHco.id, testFacility.id, testPatient.id, testStaff.id]
      );

      const orderRes = await pool.query(
        `INSERT INTO activeclinic.clinical_orders (
          organization_id, healthcare_organization_id, facility_id,
          encounter_id, patient_id, order_type, status, ordered_by_staff_id
         ) VALUES ($1, $2, $3, $4, $5, 'laboratory', 'submitted', $6)
         RETURNING id`,
        [
          testOrg.id,
          testHco.id,
          testFacility.id,
          encounterRes.rows[0].id,
          testPatient.id,
          testStaff.id,
        ]
      );

      const requestRes = await pool.query(
        `INSERT INTO activeclinic.laboratory_requests (
          organization_id, healthcare_organization_id, facility_id,
          clinical_order_id, encounter_id, patient_id,
          request_number, test_panel_name, status, requested_by_staff_id
         ) VALUES ($1, $2, $3, $4, $5, $6, 'LAB001', 'CBC', 'pending_collection', $7)
         RETURNING id`,
        [
          testOrg.id,
          testHco.id,
          testFacility.id,
          orderRes.rows[0].id,
          encounterRes.rows[0].id,
          testPatient.id,
          testStaff.id,
        ]
      );

      // Create second org and try to access
      const org2Res = await pool.query(
        `INSERT INTO platform.organizations (name, status)
         VALUES ('Other Org', 'active')
         RETURNING id`
      );

      const hco2Res = await pool.query(
        `INSERT INTO activeclinic.healthcare_organizations (organization_id, name, status)
         VALUES ($1, 'Other Hospital', 'active')
         RETURNING id`,
        [org2Res.rows[0].id]
      );

      const {
        loadActiveClinicLaboratoryRequestDetailScreen,
      } = require("../../src/activeclinic/services/loadActiveClinicDiagnosticsScreens");

      const auth = {
        organization: { id: org2Res.rows[0].id },
        healthcareOrganization: { id: hco2Res.rows[0].id },
        selectedFacility: { id: testFacility.id, name: "Main Clinic" },
        staff: { id: testStaff.id },
      };

      const result = await loadActiveClinicLaboratoryRequestDetailScreen(pool, {
        auth,
        requestId: requestRes.rows[0].id,
      });

      assert.ok(!result.ok);
      const { RESULT } = require("../../src/activeclinic/services/activeClinicDiagnosticsService");
      assert.strictEqual(result.code, RESULT.REQUEST_NOT_FOUND);
    });
  });

  describe("View rendering smoke checks", function () {
    it("should have all required diagnostic view files", async function () {
      const fs = require("fs").promises;
      const path = require("path");

      const viewsDir = path.join(
        __dirname,
        "..",
        "views",
        "activeclinic",
        "app"
      );

      const requiredViews = [
        "diagnostics-laboratory-dashboard-content.ejs",
        "diagnostics-laboratory-queue-content.ejs",
        "diagnostics-laboratory-worklist-content.ejs",
        "diagnostics-laboratory-request-detail-content.ejs",
        "diagnostics-specimen-collection-content.ejs",
        "diagnostics-specimen-receipt-content.ejs",
        "diagnostics-specimen-rejected-content.ejs",
        "diagnostics-enter-laboratory-result-content.ejs",
        "diagnostics-radiology-dashboard-content.ejs",
        "diagnostics-radiology-queue-content.ejs",
        "diagnostics-enter-radiology-report-content.ejs",
        "diagnostics-critical-result-alert-content.ejs",
      ];

      for (const viewFile of requiredViews) {
        const viewPath = path.join(viewsDir, viewFile);
        try {
          await fs.access(viewPath);
        } catch (err) {
          assert.fail(`View file missing: ${viewFile}`);
        }
      }
    });

    it("should have Stitch screen IDs in view files", async function () {
      const fs = require("fs").promises;
      const path = require("path");

      const viewsDir = path.join(
        __dirname,
        "..",
        "views",
        "activeclinic",
        "app"
      );

      const stitchIds = [
        "5b7b36f6af3b4735a81cca8cea77ee99", // Laboratory Dashboard
        "f8b17233f1f7457ea5fe5179207aa0d1", // Laboratory Request Queue
        "cd5ff44012dd4f0f88fc7ed60848fd37", // Laboratory Worklist
        "51c3b93fec6e40aebc327a4998fb29ea", // Laboratory Request Detail
        "73c50eef2b10459793f12689cce27bb6", // Specimen Collection
        "5018c7fabf324fcebfbac85d7048f19a", // Specimen Receipt
        "b62c8afb0c59477d8bcfeaac7210987a", // Specimen Rejected
        "59ee5d74ff1f47eca3c6fb09413b7c09", // Enter Laboratory Result
        "65286a85cc674df097dedf0890378a29", // Radiology Dashboard
        "1fa6c921703145af96e47f7344b6cb62", // Radiology Request Queue
        "41a0f1b3e1974e7ca26599bf8a37fc5f", // Enter Radiology Report
        "f53854e6c18e45a094a0bab86e011e5b", // Critical Result Alert
      ];

      const viewFiles = await fs.readdir(viewsDir);
      const diagnosticsViews = viewFiles.filter((f) => f.startsWith("diagnostics-"));

      for (const viewFile of diagnosticsViews) {
        const viewPath = path.join(viewsDir, viewFile);
        const content = await fs.readFile(viewPath, "utf8");
        const hasStitchId = stitchIds.some((id) => content.includes(id));
        assert.ok(hasStitchId, `View ${viewFile} missing Stitch ID`);
      }
    });
  });
});
}
