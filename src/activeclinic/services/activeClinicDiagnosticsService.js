"use strict";

/**
 * ActiveClinic P06 diagnostics service: laboratory/radiology fulfillment operations.
 */

const RESULT = {
  OK: "OK",
  ACCESS_DENIED: "ACCESS_DENIED",
  FACILITY_NOT_FOUND: "FACILITY_NOT_FOUND",
  PATIENT_NOT_FOUND: "PATIENT_NOT_FOUND",
  REQUEST_NOT_FOUND: "REQUEST_NOT_FOUND",
  SPECIMEN_NOT_FOUND: "SPECIMEN_NOT_FOUND",
  RESULT_NOT_FOUND: "RESULT_NOT_FOUND",
  INVALID_STATUS: "INVALID_STATUS",
  ALREADY_VERIFIED: "ALREADY_VERIFIED",
  ALREADY_RELEASED: "ALREADY_RELEASED",
  INVALID_INPUT: "INVALID_INPUT",
};

const PERM = {
  // Legacy hub/read aggregation (admin/manager/auditor).
  VIEW: "activeclinic.diagnostics.view",
  COLLECT: "activeclinic.diagnostics.collect",
  RESULT: "activeclinic.diagnostics.result",
  VERIFY: "activeclinic.diagnostics.verify",
  // Modality-specific (Prompt 9).
  LAB_VIEW: "activeclinic.lab.view",
  LAB_COLLECT: "activeclinic.lab.collect",
  LAB_RESULT: "activeclinic.lab.result",
  LAB_VERIFY: "activeclinic.lab.verify",
  RADIOLOGY_VIEW: "activeclinic.radiology.view",
  RADIOLOGY_RESULT: "activeclinic.radiology.result",
  RADIOLOGY_VERIFY: "activeclinic.radiology.verify",
};

/** Laboratory read: modality key or legacy diagnostics.view aggregation. */
const LAB_VIEW_ANY = Object.freeze([PERM.LAB_VIEW, PERM.VIEW]);
/** Radiology read: modality key or legacy diagnostics.view aggregation. */
const RADIOLOGY_VIEW_ANY = Object.freeze([PERM.RADIOLOGY_VIEW, PERM.VIEW]);
/** Diagnostics nav/hub: either modality view or legacy aggregation. */
const DIAGNOSTICS_HUB_ANY = Object.freeze([
  PERM.LAB_VIEW,
  PERM.RADIOLOGY_VIEW,
  PERM.VIEW,
]);

function permissionSet(auth) {
  return new Set(Array.isArray(auth && auth.permissions) ? auth.permissions : []);
}

function canViewLaboratory(auth) {
  const set = permissionSet(auth);
  return set.has(PERM.LAB_VIEW) || set.has(PERM.VIEW);
}

function canViewRadiology(auth) {
  const set = permissionSet(auth);
  return set.has(PERM.RADIOLOGY_VIEW) || set.has(PERM.VIEW);
}

function canEnterDiagnosticsHub(auth) {
  return canViewLaboratory(auth) || canViewRadiology(auth);
}

/**
 * Collect specimen for laboratory request
 */
async function collectSpecimen(pool, params) {
  const {
    organizationId,
    healthcareOrganizationId,
    facilityId,
    laboratoryRequestId,
    specimenType,
    collectionMethod,
    collectionSite,
    actor,
    deploymentCode,
  } = params;

  if (!specimenType || specimenType.length === 0) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify request exists and belongs to organization/facility
    const requestRes = await client.query(
      `SELECT id, patient_id, status
       FROM activeclinic.laboratory_requests
       WHERE id = $1
         AND organization_id = $2
         AND healthcare_organization_id = $3
         AND facility_id = $4`,
      [laboratoryRequestId, organizationId, healthcareOrganizationId, facilityId]
    );

    if (requestRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, code: RESULT.REQUEST_NOT_FOUND };
    }

    const request = requestRes.rows[0];
    if (request.status !== "pending_collection") {
      await client.query("ROLLBACK");
      return { ok: false, code: RESULT.INVALID_STATUS };
    }

    // Create specimen
    const specimenIdentifier = `SPEC-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;
    const specimenRes = await client.query(
      `INSERT INTO activeclinic.specimens (
        organization_id, healthcare_organization_id, facility_id,
        laboratory_request_id, patient_id, specimen_identifier,
        specimen_type, collection_method, collection_site,
        collected_at, collected_by_staff_id, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), $10, 'collected')
      RETURNING id`,
      [
        organizationId,
        healthcareOrganizationId,
        facilityId,
        laboratoryRequestId,
        request.patient_id,
        specimenIdentifier,
        specimenType,
        collectionMethod,
        collectionSite,
        actor.staffId,
      ]
    );

    const specimenId = specimenRes.rows[0].id;

    // Create specimen event
    await client.query(
      `INSERT INTO activeclinic.specimen_events (
        organization_id, healthcare_organization_id, specimen_id,
        event_type, actor_staff_id
      ) VALUES ($1, $2, $3, 'collected', $4)`,
      [organizationId, healthcareOrganizationId, specimenId, actor.staffId]
    );

    // Update laboratory request status
    await client.query(
      `UPDATE activeclinic.laboratory_requests
       SET status = 'collected', collected_at = now()
       WHERE id = $1`,
      [laboratoryRequestId]
    );

    await client.query("COMMIT");

    return {
      ok: true,
      specimen: {
        id: specimenId,
        identifier: specimenIdentifier,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Receive specimen at laboratory
 */
async function receiveSpecimen(pool, params) {
  const {
    organizationId,
    healthcareOrganizationId,
    specimenId,
    eventNote,
    actor,
    deploymentCode,
  } = params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify specimen exists
    const specimenRes = await client.query(
      `SELECT id, laboratory_request_id, status
       FROM activeclinic.specimens
       WHERE id = $1
         AND organization_id = $2
         AND healthcare_organization_id = $3`,
      [specimenId, organizationId, healthcareOrganizationId]
    );

    if (specimenRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, code: RESULT.SPECIMEN_NOT_FOUND };
    }

    const specimen = specimenRes.rows[0];
    if (specimen.status !== "collected") {
      await client.query("ROLLBACK");
      return { ok: false, code: RESULT.INVALID_STATUS };
    }

    // Create specimen event
    await client.query(
      `INSERT INTO activeclinic.specimen_events (
        organization_id, healthcare_organization_id, specimen_id,
        event_type, event_note, actor_staff_id
      ) VALUES ($1, $2, $3, 'received', $4, $5)`,
      [organizationId, healthcareOrganizationId, specimenId, eventNote, actor.staffId]
    );

    // Update specimen status
    await client.query(
      `UPDATE activeclinic.specimens
       SET status = 'received'
       WHERE id = $1`,
      [specimenId]
    );

    // Update laboratory request status
    await client.query(
      `UPDATE activeclinic.laboratory_requests
       SET status = 'received'
       WHERE id = $1`,
      [specimen.laboratory_request_id]
    );

    await client.query("COMMIT");

    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Reject specimen with reason
 */
async function rejectSpecimen(pool, params) {
  const {
    organizationId,
    healthcareOrganizationId,
    specimenId,
    rejectionReason,
    actor,
    deploymentCode,
  } = params;

  if (!rejectionReason || rejectionReason.length === 0) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify specimen exists
    const specimenRes = await client.query(
      `SELECT id, laboratory_request_id
       FROM activeclinic.specimens
       WHERE id = $1
         AND organization_id = $2
         AND healthcare_organization_id = $3`,
      [specimenId, organizationId, healthcareOrganizationId]
    );

    if (specimenRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, code: RESULT.SPECIMEN_NOT_FOUND };
    }

    const specimen = specimenRes.rows[0];

    // Create specimen event
    await client.query(
      `INSERT INTO activeclinic.specimen_events (
        organization_id, healthcare_organization_id, specimen_id,
        event_type, rejection_reason, actor_staff_id
      ) VALUES ($1, $2, $3, 'rejected', $4, $5)`,
      [organizationId, healthcareOrganizationId, specimenId, rejectionReason, actor.staffId]
    );

    // Update specimen status
    await client.query(
      `UPDATE activeclinic.specimens
       SET status = 'rejected'
       WHERE id = $1`,
      [specimenId]
    );

    // Update laboratory request status
    await client.query(
      `UPDATE activeclinic.laboratory_requests
       SET status = 'rejected'
       WHERE id = $1`,
      [specimen.laboratory_request_id]
    );

    await client.query("COMMIT");

    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Enter laboratory result
 */
async function enterLaboratoryResult(pool, params) {
  const {
    organizationId,
    healthcareOrganizationId,
    facilityId,
    laboratoryRequestId,
    resultSummary,
    isCritical,
    components,
    actor,
    deploymentCode,
  } = params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify request exists
    const requestRes = await client.query(
      `SELECT id, patient_id, status
       FROM activeclinic.laboratory_requests
       WHERE id = $1
         AND organization_id = $2
         AND healthcare_organization_id = $3
         AND facility_id = $4`,
      [laboratoryRequestId, organizationId, healthcareOrganizationId, facilityId]
    );

    if (requestRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, code: RESULT.REQUEST_NOT_FOUND };
    }

    const request = requestRes.rows[0];

    // Create result
    const resultRes = await client.query(
      `INSERT INTO activeclinic.laboratory_results (
        organization_id, healthcare_organization_id, facility_id,
        laboratory_request_id, patient_id, result_summary,
        is_critical, status, resulted_at, entered_by_staff_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'resulted', now(), $8)
      RETURNING id`,
      [
        organizationId,
        healthcareOrganizationId,
        facilityId,
        laboratoryRequestId,
        request.patient_id,
        resultSummary,
        isCritical,
        actor.staffId,
      ]
    );

    const resultId = resultRes.rows[0].id;

    // Create result components
    for (let i = 0; i < components.length; i++) {
      const comp = components[i];
      await client.query(
        `INSERT INTO activeclinic.laboratory_result_components (
          organization_id, healthcare_organization_id, laboratory_result_id,
          test_name, test_code, value_numeric, value_text, unit,
          reference_range_low, reference_range_high, reference_range_text,
          interpretation, is_abnormal, component_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          organizationId,
          healthcareOrganizationId,
          resultId,
          comp.test_name,
          comp.test_code || null,
          comp.value_numeric || null,
          comp.value_text || null,
          comp.unit || null,
          comp.reference_range_low || null,
          comp.reference_range_high || null,
          comp.reference_range_text || null,
          comp.interpretation || null,
          comp.is_abnormal || null,
          i + 1,
        ]
      );
    }

    // Update laboratory request status
    await client.query(
      `UPDATE activeclinic.laboratory_requests
       SET status = 'resulted', resulted_at = now()
       WHERE id = $1`,
      [laboratoryRequestId]
    );

    // If critical, create alert
    if (isCritical) {
      await client.query(
        `INSERT INTO activeclinic.clinical_alerts (
          organization_id, healthcare_organization_id, facility_id,
          patient_id, alert_type, alert_message, priority, status,
          raised_by_staff_id
        ) VALUES ($1, $2, $3, $4, 'critical_result', 'Critical laboratory result requires immediate review', 'critical', 'active', $5)`,
        [organizationId, healthcareOrganizationId, facilityId, request.patient_id, actor.staffId]
      );
    }

    await client.query("COMMIT");

    return {
      ok: true,
      result: {
        id: resultId,
        isCritical,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Enter radiology report
 */
async function enterRadiologyReport(pool, params) {
  const {
    organizationId,
    healthcareOrganizationId,
    facilityId,
    radiologyRequestId,
    findings,
    impression,
    technique,
    isCritical,
    actor,
    deploymentCode,
  } = params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify request exists
    const requestRes = await client.query(
      `SELECT id, patient_id, status
       FROM activeclinic.radiology_requests
       WHERE id = $1
         AND organization_id = $2
         AND healthcare_organization_id = $3
         AND facility_id = $4`,
      [radiologyRequestId, organizationId, healthcareOrganizationId, facilityId]
    );

    if (requestRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, code: RESULT.REQUEST_NOT_FOUND };
    }

    const request = requestRes.rows[0];

    // Create report
    const reportRes = await client.query(
      `INSERT INTO activeclinic.radiology_reports (
        organization_id, healthcare_organization_id, facility_id,
        radiology_request_id, patient_id, findings, impression, technique,
        is_critical, status, reported_at, reported_by_staff_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'reported', now(), $10)
      RETURNING id`,
      [
        organizationId,
        healthcareOrganizationId,
        facilityId,
        radiologyRequestId,
        request.patient_id,
        findings,
        impression,
        technique,
        isCritical,
        actor.staffId,
      ]
    );

    const reportId = reportRes.rows[0].id;

    // Update radiology request status
    await client.query(
      `UPDATE activeclinic.radiology_requests
       SET status = 'reported', reported_at = now()
       WHERE id = $1`,
      [radiologyRequestId]
    );

    // If critical, create alert
    if (isCritical) {
      await client.query(
        `INSERT INTO activeclinic.clinical_alerts (
          organization_id, healthcare_organization_id, facility_id,
          patient_id, alert_type, alert_message, priority, status,
          raised_by_staff_id
        ) VALUES ($1, $2, $3, $4, 'critical_result', 'Critical radiology finding requires immediate review', 'critical', 'active', $5)`,
        [organizationId, healthcareOrganizationId, facilityId, request.patient_id, actor.staffId]
      );
    }

    await client.query("COMMIT");

    return {
      ok: true,
      report: {
        id: reportId,
        isCritical,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Verify laboratory result
 */
async function verifyLaboratoryResult(pool, params) {
  const {
    organizationId,
    healthcareOrganizationId,
    laboratoryResultId,
    actor,
    deploymentCode,
  } = params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify result exists
    const resultRes = await client.query(
      `SELECT id, status, entered_by_staff_id
       FROM activeclinic.laboratory_results
       WHERE id = $1
         AND organization_id = $2
         AND healthcare_organization_id = $3`,
      [laboratoryResultId, organizationId, healthcareOrganizationId]
    );

    if (resultRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, code: RESULT.RESULT_NOT_FOUND };
    }

    const result = resultRes.rows[0];
    if (result.status === "verified" || result.status === "released") {
      await client.query("ROLLBACK");
      return { ok: false, code: RESULT.ALREADY_VERIFIED };
    }

    // Cannot verify own result (service layer check)
    if (result.entered_by_staff_id === actor.staffId) {
      await client.query("ROLLBACK");
      return { ok: false, code: RESULT.ACCESS_DENIED };
    }

    // Update result status
    await client.query(
      `UPDATE activeclinic.laboratory_results
       SET status = 'verified', verified_by_staff_id = $1, verified_at = now()
       WHERE id = $2`,
      [actor.staffId, laboratoryResultId]
    );

    await client.query("COMMIT");

    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Verify radiology report
 */
async function verifyRadiologyReport(pool, params) {
  const {
    organizationId,
    healthcareOrganizationId,
    radiologyReportId,
    actor,
    deploymentCode,
  } = params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify report exists
    const reportRes = await client.query(
      `SELECT id, status, reported_by_staff_id
       FROM activeclinic.radiology_reports
       WHERE id = $1
         AND organization_id = $2
         AND healthcare_organization_id = $3`,
      [radiologyReportId, organizationId, healthcareOrganizationId]
    );

    if (reportRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, code: RESULT.RESULT_NOT_FOUND };
    }

    const report = reportRes.rows[0];
    if (report.status === "verified" || report.status === "released") {
      await client.query("ROLLBACK");
      return { ok: false, code: RESULT.ALREADY_VERIFIED };
    }

    // Cannot verify own report (service layer check)
    if (report.reported_by_staff_id === actor.staffId) {
      await client.query("ROLLBACK");
      return { ok: false, code: RESULT.ACCESS_DENIED };
    }

    // Update report status
    await client.query(
      `UPDATE activeclinic.radiology_reports
       SET status = 'verified', verified_by_staff_id = $1, verified_at = now()
       WHERE id = $2`,
      [actor.staffId, radiologyReportId]
    );

    await client.query("COMMIT");

    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Release laboratory result
 */
async function releaseLaboratoryResult(pool, params) {
  const {
    organizationId,
    healthcareOrganizationId,
    laboratoryResultId,
    actor,
    deploymentCode,
  } = params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify result exists and is verified
    const resultRes = await client.query(
      `SELECT id, status, laboratory_request_id
       FROM activeclinic.laboratory_results
       WHERE id = $1
         AND organization_id = $2
         AND healthcare_organization_id = $3`,
      [laboratoryResultId, organizationId, healthcareOrganizationId]
    );

    if (resultRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, code: RESULT.RESULT_NOT_FOUND };
    }

    const result = resultRes.rows[0];
    if (result.status !== "verified") {
      await client.query("ROLLBACK");
      return { ok: false, code: RESULT.INVALID_STATUS };
    }

    // Update result status
    await client.query(
      `UPDATE activeclinic.laboratory_results
       SET status = 'released', released_at = now()
       WHERE id = $1`,
      [laboratoryResultId]
    );

    // Update request status
    await client.query(
      `UPDATE activeclinic.laboratory_requests
       SET status = 'released', released_at = now()
       WHERE id = $1`,
      [result.laboratory_request_id]
    );

    await client.query("COMMIT");

    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Release radiology report
 */
async function releaseRadiologyReport(pool, params) {
  const {
    organizationId,
    healthcareOrganizationId,
    radiologyReportId,
    actor,
    deploymentCode,
  } = params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify report exists and is verified
    const reportRes = await client.query(
      `SELECT id, status, radiology_request_id
       FROM activeclinic.radiology_reports
       WHERE id = $1
         AND organization_id = $2
         AND healthcare_organization_id = $3`,
      [radiologyReportId, organizationId, healthcareOrganizationId]
    );

    if (reportRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, code: RESULT.RESULT_NOT_FOUND };
    }

    const report = reportRes.rows[0];
    if (report.status !== "verified") {
      await client.query("ROLLBACK");
      return { ok: false, code: RESULT.INVALID_STATUS };
    }

    // Update report status
    await client.query(
      `UPDATE activeclinic.radiology_reports
       SET status = 'released', released_at = now()
       WHERE id = $1`,
      [radiologyReportId]
    );

    // Update request status
    await client.query(
      `UPDATE activeclinic.radiology_requests
       SET status = 'released', released_at = now()
       WHERE id = $1`,
      [report.radiology_request_id]
    );

    await client.query("COMMIT");

    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Acknowledge critical result
 */
async function acknowledgeCriticalResult(pool, params) {
  const {
    organizationId,
    healthcareOrganizationId,
    resultId,
    recipientName,
    notificationMethod,
    actor,
    deploymentCode,
  } = params;

  if (!recipientName || !notificationMethod) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Find and acknowledge alert
    const alertRes = await client.query(
      `SELECT id
       FROM activeclinic.clinical_alerts
       WHERE organization_id = $1
         AND healthcare_organization_id = $2
         AND alert_type = 'critical_result'
         AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [organizationId, healthcareOrganizationId]
    );

    if (alertRes.rows.length > 0) {
      await client.query(
        `UPDATE activeclinic.clinical_alerts
         SET status = 'acknowledged',
             acknowledged_by_staff_id = $1,
             acknowledged_at = now()
         WHERE id = $2`,
        [actor.staffId, alertRes.rows[0].id]
      );
    }

    await client.query("COMMIT");

    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
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
  PERM,
  LAB_VIEW_ANY,
  RADIOLOGY_VIEW_ANY,
  DIAGNOSTICS_HUB_ANY,
  canViewLaboratory,
  canViewRadiology,
  canEnterDiagnosticsHub,
};
