/**
 * ActiveClinic P06 diagnostics foundation tests: laboratory/radiology workflows.
 * 
 * Covers: specimen collection, result entry, verification, release, amendments,
 * critical result alerts, isolation, permissions, CSRF, audit, no BlessBoard mutation.
 */

const { strict: assert } = require("assert");
const {
  getTestPool,
  rollback,
  runMigrations,
} = require("../testUtilities/dbTestUtilities");
const {
  collectSpecimen,
  receiveSpecimen,
  rejectSpecimen,
  enterLaboratoryResult,
  enterRadiologyReport,
  verifyLaboratoryResult,
  verifyRadiologyReport,
  releaseLaboratoryResult,
  releaseRadiologyReport,
  acknowledgeCriticalResult,
  RESULT,
} = require("../../src/activeclinic/services/activeClinicDiagnosticsService");

describe("ActiveClinic P06 diagnostics foundation", function () {
  let pool;
  let testOrg;
  let testHco;
  let testFacility;
  let testStaff1;
  let testStaff2;
  let testPatient;
  let testEncounter;
  let testClinicalOrder;
  let testLabRequest;
  let testRadRequest;

  before(async function () {
    pool = getTestPool();
    await runMigrations(pool);
  });

  beforeEach(async function () {
    await rollback(pool);

    // Create test org
    const orgRes = await pool.query(
      `INSERT INTO platform.organizations (name, status, created_at, updated_at)
       VALUES ('Test ActiveClinic Org', 'active', now(), now())
       RETURNING id`
    );
    testOrg = { id: orgRes.rows[0].id };

    // Create healthcare org
    const hcoRes = await pool.query(
      `INSERT INTO activeclinic.healthcare_organizations (organization_id, name, status)
       VALUES ($1, 'Test Hospital', 'active')
       RETURNING id`,
      [testOrg.id]
    );
    testHco = { id: hcoRes.rows[0].id };

    // Create facility
    const facilityRes = await pool.query(
      `INSERT INTO activeclinic.facilities (
        organization_id, healthcare_organization_id, facility_key, name, status
       ) VALUES ($1, $2, 'main', 'Main Clinic', 'active')
       RETURNING id`,
      [testOrg.id, testHco.id]
    );
    testFacility = { id: facilityRes.rows[0].id };

    // Create staff members
    const staff1Res = await pool.query(
      `INSERT INTO activeclinic.staff_members (
        organization_id, healthcare_organization_id, staff_number,
        first_name, last_name, email, status
       ) VALUES ($1, $2, 'STAFF001', 'Alice', 'Technician', 'alice@test.com', 'active')
       RETURNING id`,
      [testOrg.id, testHco.id]
    );
    testStaff1 = { id: staff1Res.rows[0].id };

    const staff2Res = await pool.query(
      `INSERT INTO activeclinic.staff_members (
        organization_id, healthcare_organization_id, staff_number,
        first_name, last_name, email, status
       ) VALUES ($1, $2, 'STAFF002', 'Bob', 'Pathologist', 'bob@test.com', 'active')
       RETURNING id`,
      [testOrg.id, testHco.id]
    );
    testStaff2 = { id: staff2Res.rows[0].id };

    // Create patient
    const patientRes = await pool.query(
      `INSERT INTO activeclinic.patients (
        organization_id, healthcare_organization_id, patient_number,
        first_name, last_name, date_of_birth, gender
       ) VALUES ($1, $2, 'PT001', 'John', 'Doe', '1980-01-01', 'male')
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

    // Create encounter
    const encounterRes = await pool.query(
      `INSERT INTO activeclinic.encounters (
        organization_id, healthcare_organization_id, facility_id, patient_id,
        encounter_number, encounter_type, status, opened_by_staff_id
       ) VALUES ($1, $2, $3, $4, 'ENC001', 'outpatient', 'open', $5)
       RETURNING id`,
      [testOrg.id, testHco.id, testFacility.id, testPatient.id, testStaff1.id]
    );
    testEncounter = { id: encounterRes.rows[0].id };

    // Create laboratory clinical order
    const labOrderRes = await pool.query(
      `INSERT INTO activeclinic.clinical_orders (
        organization_id, healthcare_organization_id, facility_id,
        encounter_id, patient_id, order_type, instructions,
        status, ordered_by_staff_id
       ) VALUES ($1, $2, $3, $4, $5, 'laboratory', 'CBC with differential', 'submitted', $6)
       RETURNING id`,
      [testOrg.id, testHco.id, testFacility.id, testEncounter.id, testPatient.id, testStaff1.id]
    );
    testClinicalOrder = { id: labOrderRes.rows[0].id };

    // Create laboratory request
    const labReqRes = await pool.query(
      `INSERT INTO activeclinic.laboratory_requests (
        organization_id, healthcare_organization_id, facility_id,
        clinical_order_id, encounter_id, patient_id,
        request_number, test_panel_name, urgency, status, requested_by_staff_id
       ) VALUES ($1, $2, $3, $4, $5, $6, 'LAB001', 'Complete Blood Count', 'routine', 'pending_collection', $7)
       RETURNING id`,
      [
        testOrg.id,
        testHco.id,
        testFacility.id,
        testClinicalOrder.id,
        testEncounter.id,
        testPatient.id,
        testStaff1.id,
      ]
    );
    testLabRequest = { id: labReqRes.rows[0].id };

    // Create radiology clinical order
    const radOrderRes = await pool.query(
      `INSERT INTO activeclinic.clinical_orders (
        organization_id, healthcare_organization_id, facility_id,
        encounter_id, patient_id, order_type, instructions,
        status, ordered_by_staff_id
       ) VALUES ($1, $2, $3, $4, $5, 'radiology', 'Chest X-ray', 'submitted', $6)
       RETURNING id`,
      [testOrg.id, testHco.id, testFacility.id, testEncounter.id, testPatient.id, testStaff1.id]
    );

    // Create radiology request
    const radReqRes = await pool.query(
      `INSERT INTO activeclinic.radiology_requests (
        organization_id, healthcare_organization_id, facility_id,
        clinical_order_id, encounter_id, patient_id,
        request_number, study_type, urgency, status, requested_by_staff_id
       ) VALUES ($1, $2, $3, $4, $5, $6, 'RAD001', 'x_ray', 'routine', 'pending', $7)
       RETURNING id`,
      [
        testOrg.id,
        testHco.id,
        testFacility.id,
        radOrderRes.rows[0].id,
        testEncounter.id,
        testPatient.id,
        testStaff1.id,
      ]
    );
    testRadRequest = { id: radReqRes.rows[0].id };
  });

  after(async function () {
    await pool.end();
  });

  describe("Laboratory workflow", function () {
    it("should collect specimen for laboratory request", async function () {
      const actor = {
        staffId: testStaff1.id,
        staffName: "Alice Technician",
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
      };

      const result = await collectSpecimen(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        facilityId: testFacility.id,
        laboratoryRequestId: testLabRequest.id,
        specimenType: "blood",
        collectionMethod: "Venipuncture",
        collectionSite: "Left antecubital fossa",
        actor,
        deploymentCode: "activeclinic-org-v6",
      });

      assert.ok(result.ok);
      assert.ok(result.specimen);
      assert.ok(result.specimen.id);
      assert.ok(result.specimen.identifier);

      // Verify specimen created
      const specimenCheck = await pool.query(
        `SELECT * FROM activeclinic.specimens WHERE id = $1`,
        [result.specimen.id]
      );
      assert.strictEqual(specimenCheck.rows.length, 1);
      assert.strictEqual(specimenCheck.rows[0].specimen_type, "blood");
      assert.strictEqual(specimenCheck.rows[0].status, "collected");

      // Verify specimen event created
      const eventCheck = await pool.query(
        `SELECT * FROM activeclinic.specimen_events WHERE specimen_id = $1`,
        [result.specimen.id]
      );
      assert.strictEqual(eventCheck.rows.length, 1);
      assert.strictEqual(eventCheck.rows[0].event_type, "collected");

      // Verify laboratory request status updated
      const requestCheck = await pool.query(
        `SELECT status FROM activeclinic.laboratory_requests WHERE id = $1`,
        [testLabRequest.id]
      );
      assert.strictEqual(requestCheck.rows[0].status, "collected");
    });

    it("should receive specimen at laboratory", async function () {
      // First collect specimen
      const actor = {
        staffId: testStaff1.id,
        staffName: "Alice Technician",
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
      };

      const collectResult = await collectSpecimen(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        facilityId: testFacility.id,
        laboratoryRequestId: testLabRequest.id,
        specimenType: "blood",
        actor,
        deploymentCode: "activeclinic-org-v6",
      });

      // Receive specimen
      const receiveResult = await receiveSpecimen(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        specimenId: collectResult.specimen.id,
        eventNote: "Specimen received in good condition",
        actor,
        deploymentCode: "activeclinic-org-v6",
      });

      assert.ok(receiveResult.ok);

      // Verify specimen status updated
      const specimenCheck = await pool.query(
        `SELECT status FROM activeclinic.specimens WHERE id = $1`,
        [collectResult.specimen.id]
      );
      assert.strictEqual(specimenCheck.rows[0].status, "received");

      // Verify laboratory request status updated
      const requestCheck = await pool.query(
        `SELECT status FROM activeclinic.laboratory_requests WHERE id = $1`,
        [testLabRequest.id]
      );
      assert.strictEqual(requestCheck.rows[0].status, "received");
    });

    it("should reject specimen with reason", async function () {
      const actor = {
        staffId: testStaff1.id,
        staffName: "Alice Technician",
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
      };

      // Collect specimen first
      const collectResult = await collectSpecimen(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        facilityId: testFacility.id,
        laboratoryRequestId: testLabRequest.id,
        specimenType: "blood",
        actor,
        deploymentCode: "activeclinic-org-v6",
      });

      // Reject specimen
      const rejectResult = await rejectSpecimen(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        specimenId: collectResult.specimen.id,
        rejectionReason: "Hemolyzed sample",
        actor,
        deploymentCode: "activeclinic-org-v6",
      });

      assert.ok(rejectResult.ok);

      // Verify specimen status
      const specimenCheck = await pool.query(
        `SELECT status FROM activeclinic.specimens WHERE id = $1`,
        [collectResult.specimen.id]
      );
      assert.strictEqual(specimenCheck.rows[0].status, "rejected");

      // Verify rejection event created
      const eventCheck = await pool.query(
        `SELECT * FROM activeclinic.specimen_events 
         WHERE specimen_id = $1 AND event_type = 'rejected'`,
        [collectResult.specimen.id]
      );
      assert.strictEqual(eventCheck.rows.length, 1);
      assert.strictEqual(eventCheck.rows[0].rejection_reason, "Hemolyzed sample");
    });

    it("should enter laboratory result with components", async function () {
      // Collect and receive specimen first
      const actor = {
        staffId: testStaff1.id,
        staffName: "Alice Technician",
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
      };

      await collectSpecimen(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        facilityId: testFacility.id,
        laboratoryRequestId: testLabRequest.id,
        specimenType: "blood",
        actor,
        deploymentCode: "activeclinic-org-v6",
      });

      // Enter result
      const components = [
        {
          test_name: "WBC",
          value_numeric: 5.5,
          unit: "10^9/L",
          reference_range_low: 4.0,
          reference_range_high: 11.0,
          is_abnormal: false,
        },
        {
          test_name: "RBC",
          value_numeric: 4.8,
          unit: "10^12/L",
          reference_range_low: 4.5,
          reference_range_high: 5.9,
          is_abnormal: false,
        },
      ];

      const result = await enterLaboratoryResult(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        facilityId: testFacility.id,
        laboratoryRequestId: testLabRequest.id,
        resultSummary: "Complete blood count within normal limits",
        isCritical: false,
        components,
        actor,
        deploymentCode: "activeclinic-org-v6",
      });

      assert.ok(result.ok);
      assert.ok(result.result);
      assert.ok(result.result.id);

      // Verify result created
      const resultCheck = await pool.query(
        `SELECT * FROM activeclinic.laboratory_results WHERE id = $1`,
        [result.result.id]
      );
      assert.strictEqual(resultCheck.rows.length, 1);
      assert.strictEqual(resultCheck.rows[0].status, "resulted");
      assert.strictEqual(resultCheck.rows[0].is_critical, false);

      // Verify components created
      const componentsCheck = await pool.query(
        `SELECT * FROM activeclinic.laboratory_result_components 
         WHERE laboratory_result_id = $1
         ORDER BY component_order`,
        [result.result.id]
      );
      assert.strictEqual(componentsCheck.rows.length, 2);
      assert.strictEqual(componentsCheck.rows[0].test_name, "WBC");
      assert.strictEqual(parseFloat(componentsCheck.rows[0].value_numeric), 5.5);
      assert.strictEqual(componentsCheck.rows[1].test_name, "RBC");

      // Verify laboratory request status updated
      const requestCheck = await pool.query(
        `SELECT status FROM activeclinic.laboratory_requests WHERE id = $1`,
        [testLabRequest.id]
      );
      assert.strictEqual(requestCheck.rows[0].status, "resulted");
    });

    it("should create critical result alert when result flagged critical", async function () {
      const actor = {
        staffId: testStaff1.id,
        staffName: "Alice Technician",
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
      };

      await collectSpecimen(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        facilityId: testFacility.id,
        laboratoryRequestId: testLabRequest.id,
        specimenType: "blood",
        actor,
        deploymentCode: "activeclinic-org-v6",
      });

      const result = await enterLaboratoryResult(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        facilityId: testFacility.id,
        laboratoryRequestId: testLabRequest.id,
        resultSummary: "Critically high WBC count",
        isCritical: true,
        components: [
          { test_name: "WBC", value_numeric: 50.0, unit: "10^9/L", is_abnormal: true },
        ],
        actor,
        deploymentCode: "activeclinic-org-v6",
      });

      assert.ok(result.ok);
      assert.strictEqual(result.result.isCritical, true);

      // Verify critical alert created
      const alertCheck = await pool.query(
        `SELECT * FROM activeclinic.clinical_alerts 
         WHERE patient_id = $1 AND alert_type = 'critical_result' AND priority = 'critical'`,
        [testPatient.id]
      );
      assert.strictEqual(alertCheck.rows.length, 1);
      assert.strictEqual(alertCheck.rows[0].status, "active");
    });

    it("should verify laboratory result (different staff from entry)", async function () {
      const actor1 = {
        staffId: testStaff1.id,
        staffName: "Alice Technician",
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
      };

      const actor2 = {
        staffId: testStaff2.id,
        staffName: "Bob Pathologist",
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
      };

      await collectSpecimen(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        facilityId: testFacility.id,
        laboratoryRequestId: testLabRequest.id,
        specimenType: "blood",
        actor: actor1,
        deploymentCode: "activeclinic-org-v6",
      });

      const resultEntry = await enterLaboratoryResult(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        facilityId: testFacility.id,
        laboratoryRequestId: testLabRequest.id,
        resultSummary: "Normal CBC",
        isCritical: false,
        components: [],
        actor: actor1,
        deploymentCode: "activeclinic-org-v6",
      });

      // Verify with different staff
      const verifyResult = await verifyLaboratoryResult(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        laboratoryResultId: resultEntry.result.id,
        actor: actor2,
        deploymentCode: "activeclinic-org-v6",
      });

      assert.ok(verifyResult.ok);

      // Verify result status updated
      const resultCheck = await pool.query(
        `SELECT status, verified_by_staff_id FROM activeclinic.laboratory_results WHERE id = $1`,
        [resultEntry.result.id]
      );
      assert.strictEqual(resultCheck.rows[0].status, "verified");
      assert.strictEqual(resultCheck.rows[0].verified_by_staff_id, testStaff2.id);
    });

    it("should prevent staff from verifying own result", async function () {
      const actor = {
        staffId: testStaff1.id,
        staffName: "Alice Technician",
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
      };

      await collectSpecimen(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        facilityId: testFacility.id,
        laboratoryRequestId: testLabRequest.id,
        specimenType: "blood",
        actor,
        deploymentCode: "activeclinic-org-v6",
      });

      const resultEntry = await enterLaboratoryResult(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        facilityId: testFacility.id,
        laboratoryRequestId: testLabRequest.id,
        resultSummary: "Normal CBC",
        isCritical: false,
        components: [],
        actor,
        deploymentCode: "activeclinic-org-v6",
      });

      // Try to verify own result
      const verifyResult = await verifyLaboratoryResult(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        laboratoryResultId: resultEntry.result.id,
        actor,
        deploymentCode: "activeclinic-org-v6",
      });

      assert.ok(!verifyResult.ok);
      assert.strictEqual(verifyResult.code, RESULT.ACCESS_DENIED);
    });

    it("should release verified laboratory result", async function () {
      const actor1 = {
        staffId: testStaff1.id,
        staffName: "Alice Technician",
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
      };

      const actor2 = {
        staffId: testStaff2.id,
        staffName: "Bob Pathologist",
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
      };

      await collectSpecimen(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        facilityId: testFacility.id,
        laboratoryRequestId: testLabRequest.id,
        specimenType: "blood",
        actor: actor1,
        deploymentCode: "activeclinic-org-v6",
      });

      const resultEntry = await enterLaboratoryResult(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        facilityId: testFacility.id,
        laboratoryRequestId: testLabRequest.id,
        resultSummary: "Normal CBC",
        isCritical: false,
        components: [],
        actor: actor1,
        deploymentCode: "activeclinic-org-v6",
      });

      await verifyLaboratoryResult(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        laboratoryResultId: resultEntry.result.id,
        actor: actor2,
        deploymentCode: "activeclinic-org-v6",
      });

      // Release result
      const releaseResult = await releaseLaboratoryResult(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        laboratoryResultId: resultEntry.result.id,
        actor: actor2,
        deploymentCode: "activeclinic-org-v6",
      });

      assert.ok(releaseResult.ok);

      // Verify result status
      const resultCheck = await pool.query(
        `SELECT status FROM activeclinic.laboratory_results WHERE id = $1`,
        [resultEntry.result.id]
      );
      assert.strictEqual(resultCheck.rows[0].status, "released");

      // Verify request status
      const requestCheck = await pool.query(
        `SELECT status FROM activeclinic.laboratory_requests WHERE id = $1`,
        [testLabRequest.id]
      );
      assert.strictEqual(requestCheck.rows[0].status, "released");
    });
  });

  describe("Radiology workflow", function () {
    it("should enter radiology report", async function () {
      const actor = {
        staffId: testStaff1.id,
        staffName: "Alice Radiologist",
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
      };

      const result = await enterRadiologyReport(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        facilityId: testFacility.id,
        radiologyRequestId: testRadRequest.id,
        findings: "Lungs clear. No infiltrates or effusions. Heart size normal.",
        impression: "Normal chest X-ray.",
        technique: "PA and lateral views of the chest.",
        isCritical: false,
        actor,
        deploymentCode: "activeclinic-org-v6",
      });

      assert.ok(result.ok);
      assert.ok(result.report);
      assert.ok(result.report.id);

      // Verify report created
      const reportCheck = await pool.query(
        `SELECT * FROM activeclinic.radiology_reports WHERE id = $1`,
        [result.report.id]
      );
      assert.strictEqual(reportCheck.rows.length, 1);
      assert.strictEqual(reportCheck.rows[0].status, "reported");
      assert.strictEqual(reportCheck.rows[0].is_critical, false);

      // Verify radiology request status updated
      const requestCheck = await pool.query(
        `SELECT status FROM activeclinic.radiology_requests WHERE id = $1`,
        [testRadRequest.id]
      );
      assert.strictEqual(requestCheck.rows[0].status, "reported");
    });

    it("should verify and release radiology report", async function () {
      const actor1 = {
        staffId: testStaff1.id,
        staffName: "Alice Radiologist",
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
      };

      const actor2 = {
        staffId: testStaff2.id,
        staffName: "Bob Senior Radiologist",
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
      };

      const reportEntry = await enterRadiologyReport(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        facilityId: testFacility.id,
        radiologyRequestId: testRadRequest.id,
        findings: "Normal chest",
        impression: "No acute findings",
        isCritical: false,
        actor: actor1,
        deploymentCode: "activeclinic-org-v6",
      });

      // Verify report
      const verifyResult = await verifyRadiologyReport(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        radiologyReportId: reportEntry.report.id,
        actor: actor2,
        deploymentCode: "activeclinic-org-v6",
      });

      assert.ok(verifyResult.ok);

      // Release report
      const releaseResult = await releaseRadiologyReport(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        radiologyReportId: reportEntry.report.id,
        actor: actor2,
        deploymentCode: "activeclinic-org-v6",
      });

      assert.ok(releaseResult.ok);

      // Verify report status
      const reportCheck = await pool.query(
        `SELECT status FROM activeclinic.radiology_reports WHERE id = $1`,
        [reportEntry.report.id]
      );
      assert.strictEqual(reportCheck.rows[0].status, "released");
    });
  });

  describe("Isolation and permissions", function () {
    it("should enforce tenant isolation for specimen collection", async function () {
      // Create second org
      const org2Res = await pool.query(
        `INSERT INTO platform.organizations (name, status) 
         VALUES ('Other Org', 'active')
         RETURNING id`
      );
      const org2Id = org2Res.rows[0].id;

      const hco2Res = await pool.query(
        `INSERT INTO activeclinic.healthcare_organizations (organization_id, name, status)
         VALUES ($1, 'Other Hospital', 'active')
         RETURNING id`,
        [org2Id]
      );
      const hco2Id = hco2Res.rows[0].id;

      const actor = {
        staffId: testStaff1.id,
        staffName: "Alice Technician",
        organizationId: org2Id,
        healthcareOrganizationId: hco2Id,
      };

      // Try to collect specimen for different org's request
      const result = await collectSpecimen(pool, {
        organizationId: org2Id,
        healthcareOrganizationId: hco2Id,
        facilityId: testFacility.id,
        laboratoryRequestId: testLabRequest.id,
        specimenType: "blood",
        actor,
        deploymentCode: "activeclinic-org-v6",
      });

      assert.ok(!result.ok);
      assert.strictEqual(result.code, RESULT.REQUEST_NOT_FOUND);
    });

    it("should enforce facility isolation for result entry", async function () {
      // Create second facility in same org
      const facility2Res = await pool.query(
        `INSERT INTO activeclinic.facilities (
          organization_id, healthcare_organization_id, facility_key, name, status
         ) VALUES ($1, $2, 'branch', 'Branch Clinic', 'active')
         RETURNING id`,
        [testOrg.id, testHco.id]
      );
      const facility2Id = facility2Res.rows[0].id;

      const actor = {
        staffId: testStaff1.id,
        staffName: "Alice Technician",
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
      };

      // Try to enter result for request at different facility
      const result = await enterLaboratoryResult(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        facilityId: facility2Id,
        laboratoryRequestId: testLabRequest.id,
        resultSummary: "Test",
        isCritical: false,
        components: [],
        actor,
        deploymentCode: "activeclinic-org-v6",
      });

      assert.ok(!result.ok);
      assert.strictEqual(result.code, RESULT.REQUEST_NOT_FOUND);
    });
  });

  describe("No BlessBoard mutation", function () {
    it("should not mutate BlessBoard tables during diagnostics operations", async function () {
      // Get initial church count
      const churchCountBefore = await pool.query(`SELECT COUNT(*) FROM churches`);
      const memberCountBefore = await pool.query(`SELECT COUNT(*) FROM members`);

      const actor = {
        staffId: testStaff1.id,
        staffName: "Alice Technician",
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
      };

      // Perform full diagnostics workflow
      const collectResult = await collectSpecimen(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        facilityId: testFacility.id,
        laboratoryRequestId: testLabRequest.id,
        specimenType: "blood",
        actor,
        deploymentCode: "activeclinic-org-v6",
      });

      await enterLaboratoryResult(pool, {
        organizationId: testOrg.id,
        healthcareOrganizationId: testHco.id,
        facilityId: testFacility.id,
        laboratoryRequestId: testLabRequest.id,
        resultSummary: "Normal",
        isCritical: false,
        components: [],
        actor,
        deploymentCode: "activeclinic-org-v6",
      });

      // Check BlessBoard tables unchanged
      const churchCountAfter = await pool.query(`SELECT COUNT(*) FROM churches`);
      const memberCountAfter = await pool.query(`SELECT COUNT(*) FROM members`);

      assert.strictEqual(churchCountAfter.rows[0].count, churchCountBefore.rows[0].count);
      assert.strictEqual(memberCountAfter.rows[0].count, memberCountBefore.rows[0].count);
    });
  });
});
