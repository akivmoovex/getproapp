"use strict";

/**
 * ActiveClinic P06 diagnostics screen loaders: laboratory/radiology dashboards, queues, worklists, forms.
 */

const { RESULT: DIAGNOSTICS_RESULT } = require("./activeClinicDiagnosticsService");

function actorFromAuth(auth) {
  return {
    staffId: auth.staff.id,
    staffName: auth.staff.display_name,
    organizationId: auth.organization.id,
    healthcareOrganizationId: auth.healthcareOrganization.id,
  };
}

/**
 * Load laboratory dashboard screen
 */
async function loadActiveClinicLaboratoryDashboardScreen(pool, params) {
  const { auth } = params;

  if (!auth.selectedFacility) {
    return { ok: false, code: DIAGNOSTICS_RESULT.FACILITY_NOT_FOUND };
  }

  const client = await pool.connect();
  try {
    // Count pending, processing, verified requests
    const statsRes = await client.query(
      `SELECT status, COUNT(*) as count
       FROM activeclinic.laboratory_requests
       WHERE facility_id = $1
         AND organization_id = $2
         AND healthcare_organization_id = $3
       GROUP BY status`,
      [auth.selectedFacility.id, auth.organization.id, auth.healthcareOrganization.id]
    );

    const stats = {
      pending_collection: 0,
      processing: 0,
      verified: 0,
    };

    for (const row of statsRes.rows) {
      if (row.status === "pending_collection") stats.pending_collection = parseInt(row.count, 10);
      if (row.status === "processing") stats.processing = parseInt(row.count, 10);
      if (row.status === "verified") stats.verified = parseInt(row.count, 10);
    }

    return {
      ok: true,
      dashboard: {
        facilityDisplayName: auth.selectedFacility.name,
        stats,
      },
    };
  } finally {
    client.release();
  }
}

/**
 * Load laboratory request queue screen
 */
async function loadActiveClinicLaboratoryQueueScreen(pool, params) {
  const { auth } = params;

  if (!auth.selectedFacility) {
    return { ok: false, code: DIAGNOSTICS_RESULT.FACILITY_NOT_FOUND };
  }

  const client = await pool.connect();
  try {
    const requestsRes = await client.query(
      `SELECT lr.id, lr.request_number, lr.test_panel_name, lr.urgency,
              lr.status, lr.requested_at,
              p.first_name || ' ' || p.last_name as patient_display_name
       FROM activeclinic.laboratory_requests lr
       INNER JOIN activeclinic.patients p ON lr.patient_id = p.id
       WHERE lr.facility_id = $1
         AND lr.organization_id = $2
         AND lr.healthcare_organization_id = $3
         AND lr.status IN ('pending_collection', 'collected', 'received', 'processing')
       ORDER BY lr.urgency DESC, lr.requested_at`,
      [auth.selectedFacility.id, auth.organization.id, auth.healthcareOrganization.id]
    );

    return {
      ok: true,
      queue: {
        facilityDisplayName: auth.selectedFacility.name,
        requests: requestsRes.rows.map((r) => ({
          id: r.id,
          requestNumber: r.request_number,
          testPanelName: r.test_panel_name,
          urgency: r.urgency,
          status: r.status,
          patientDisplayName: r.patient_display_name,
          requestedAt: r.requested_at,
        })),
      },
    };
  } finally {
    client.release();
  }
}

/**
 * Load laboratory worklist screen (specimen processing)
 */
async function loadActiveClinicLaboratoryWorklistScreen(pool, params) {
  const { auth } = params;

  if (!auth.selectedFacility) {
    return { ok: false, code: DIAGNOSTICS_RESULT.FACILITY_NOT_FOUND };
  }

  const client = await pool.connect();
  try {
    const specimensRes = await client.query(
      `SELECT s.id, s.specimen_identifier, s.specimen_type, s.status,
              s.collected_at,
              lr.request_number, lr.test_panel_name,
              p.first_name || ' ' || p.last_name as patient_display_name
       FROM activeclinic.specimens s
       INNER JOIN activeclinic.laboratory_requests lr ON s.laboratory_request_id = lr.id
       INNER JOIN activeclinic.patients p ON s.patient_id = p.id
       WHERE s.facility_id = $1
         AND s.organization_id = $2
         AND s.healthcare_organization_id = $3
         AND s.status IN ('collected', 'received', 'processing')
       ORDER BY s.collected_at`,
      [auth.selectedFacility.id, auth.organization.id, auth.healthcareOrganization.id]
    );

    return {
      ok: true,
      worklist: {
        specimens: specimensRes.rows.map((s) => ({
          id: s.id,
          specimenIdentifier: s.specimen_identifier,
          specimenType: s.specimen_type,
          status: s.status,
          requestNumber: s.request_number,
          testPanelName: s.test_panel_name,
          patientDisplayName: s.patient_display_name,
          collectedAt: s.collected_at,
        })),
      },
    };
  } finally {
    client.release();
  }
}

/**
 * Load laboratory request detail screen
 */
async function loadActiveClinicLaboratoryRequestDetailScreen(pool, params) {
  const { auth, requestId } = params;

  const client = await pool.connect();
  try {
    const requestRes = await client.query(
      `SELECT lr.id, lr.request_number, lr.test_panel_name, lr.urgency,
              lr.status, lr.requested_at, lr.clinical_notes,
              p.first_name || ' ' || p.last_name as patient_display_name
       FROM activeclinic.laboratory_requests lr
       INNER JOIN activeclinic.patients p ON lr.patient_id = p.id
       WHERE lr.id = $1
         AND lr.organization_id = $2
         AND lr.healthcare_organization_id = $3
         AND lr.facility_id = $4`,
      [requestId, auth.organization.id, auth.healthcareOrganization.id, auth.selectedFacility.id]
    );

    if (requestRes.rows.length === 0) {
      return { ok: false, code: DIAGNOSTICS_RESULT.REQUEST_NOT_FOUND };
    }

    const request = requestRes.rows[0];

    // Load specimen events
    const eventsRes = await client.query(
      `SELECT se.event_type, se.event_note, se.rejection_reason, se.created_at,
              s.specimen_identifier
       FROM activeclinic.specimen_events se
       INNER JOIN activeclinic.specimens s ON se.specimen_id = s.id
       WHERE s.laboratory_request_id = $1
       ORDER BY se.created_at`,
      [requestId]
    );

    return {
      ok: true,
      request: {
        id: request.id,
        requestNumber: request.request_number,
        testPanelName: request.test_panel_name,
        urgency: request.urgency,
        status: request.status,
        clinicalNotes: request.clinical_notes,
        patientDisplayName: request.patient_display_name,
        requestedAt: request.requested_at,
        events: eventsRes.rows,
        actions: {
          canCollect: request.status === "pending_collection",
        },
      },
    };
  } finally {
    client.release();
  }
}

/**
 * Load specimen collection screen
 */
async function loadActiveClinicSpecimenCollectionScreen(pool, params) {
  const { auth, requestId } = params;

  const client = await pool.connect();
  try {
    const requestRes = await client.query(
      `SELECT lr.id, lr.request_number, lr.test_panel_name,
              p.first_name || ' ' || p.last_name as patient_display_name
       FROM activeclinic.laboratory_requests lr
       INNER JOIN activeclinic.patients p ON lr.patient_id = p.id
       WHERE lr.id = $1
         AND lr.organization_id = $2
         AND lr.healthcare_organization_id = $3`,
      [requestId, auth.organization.id, auth.healthcareOrganization.id]
    );

    if (requestRes.rows.length === 0) {
      return { ok: false, code: DIAGNOSTICS_RESULT.REQUEST_NOT_FOUND };
    }

    const request = requestRes.rows[0];

    return {
      ok: true,
      collection: {
        request: {
          id: request.id,
          requestNumber: request.request_number,
          testPanelName: request.test_panel_name,
          patientDisplayName: request.patient_display_name,
        },
        specimenTypes: ["blood", "urine", "stool", "sputum", "csf", "tissue", "swab", "other"],
      },
    };
  } finally {
    client.release();
  }
}

/**
 * Load specimen receipt screen
 */
async function loadActiveClinicSpecimenReceiptScreen(pool, params) {
  const { auth, specimenId } = params;

  const client = await pool.connect();
  try {
    const specimenRes = await client.query(
      `SELECT s.id, s.specimen_identifier, s.specimen_type,
              lr.request_number, lr.test_panel_name,
              p.first_name || ' ' || p.last_name as patient_display_name
       FROM activeclinic.specimens s
       INNER JOIN activeclinic.laboratory_requests lr ON s.laboratory_request_id = lr.id
       INNER JOIN activeclinic.patients p ON s.patient_id = p.id
       WHERE s.id = $1
         AND s.organization_id = $2
         AND s.healthcare_organization_id = $3`,
      [specimenId, auth.organization.id, auth.healthcareOrganization.id]
    );

    if (specimenRes.rows.length === 0) {
      return { ok: false, code: DIAGNOSTICS_RESULT.SPECIMEN_NOT_FOUND };
    }

    const specimen = specimenRes.rows[0];

    return {
      ok: true,
      receipt: {
        specimen: {
          id: specimen.id,
          specimenIdentifier: specimen.specimen_identifier,
          specimenType: specimen.specimen_type,
          requestNumber: specimen.request_number,
          testPanelName: specimen.test_panel_name,
          patientDisplayName: specimen.patient_display_name,
        },
      },
    };
  } finally {
    client.release();
  }
}

/**
 * Load specimen rejected screen
 */
async function loadActiveClinicSpecimenRejectedScreen(pool, params) {
  const { auth, specimenId } = params;

  const client = await pool.connect();
  try {
    const specimenRes = await client.query(
      `SELECT s.id, s.specimen_identifier, s.specimen_type,
              lr.request_number, lr.test_panel_name,
              p.first_name || ' ' || p.last_name as patient_display_name
       FROM activeclinic.specimens s
       INNER JOIN activeclinic.laboratory_requests lr ON s.laboratory_request_id = lr.id
       INNER JOIN activeclinic.patients p ON s.patient_id = p.id
       WHERE s.id = $1
         AND s.organization_id = $2
         AND s.healthcare_organization_id = $3`,
      [specimenId, auth.organization.id, auth.healthcareOrganization.id]
    );

    if (specimenRes.rows.length === 0) {
      return { ok: false, code: DIAGNOSTICS_RESULT.SPECIMEN_NOT_FOUND };
    }

    const specimen = specimenRes.rows[0];

    return {
      ok: true,
      rejection: {
        specimen: {
          id: specimen.id,
          specimenIdentifier: specimen.specimen_identifier,
          specimenType: specimen.specimen_type,
          requestNumber: specimen.request_number,
          testPanelName: specimen.test_panel_name,
          patientDisplayName: specimen.patient_display_name,
        },
        rejectionReasons: [
          "Hemolyzed sample",
          "Insufficient quantity",
          "Unlabeled specimen",
          "Clotted sample",
          "Contaminated",
          "Other",
        ],
      },
    };
  } finally {
    client.release();
  }
}

/**
 * Load enter laboratory result screen
 */
async function loadActiveClinicEnterLaboratoryResultScreen(pool, params) {
  const { auth, requestId } = params;

  const client = await pool.connect();
  try {
    const requestRes = await client.query(
      `SELECT lr.id, lr.request_number, lr.test_panel_name, lr.test_panel_code,
              p.first_name || ' ' || p.last_name as patient_display_name
       FROM activeclinic.laboratory_requests lr
       INNER JOIN activeclinic.patients p ON lr.patient_id = p.id
       WHERE lr.id = $1
         AND lr.organization_id = $2
         AND lr.healthcare_organization_id = $3`,
      [requestId, auth.organization.id, auth.healthcareOrganization.id]
    );

    if (requestRes.rows.length === 0) {
      return { ok: false, code: DIAGNOSTICS_RESULT.REQUEST_NOT_FOUND };
    }

    const request = requestRes.rows[0];

    return {
      ok: true,
      resultEntry: {
        request: {
          id: request.id,
          requestNumber: request.request_number,
          testPanelName: request.test_panel_name,
          testPanelCode: request.test_panel_code,
          patientDisplayName: request.patient_display_name,
        },
      },
    };
  } finally {
    client.release();
  }
}

/**
 * Load radiology dashboard screen
 */
async function loadActiveClinicRadiologyDashboardScreen(pool, params) {
  const { auth } = params;

  if (!auth.selectedFacility) {
    return { ok: false, code: DIAGNOSTICS_RESULT.FACILITY_NOT_FOUND };
  }

  const client = await pool.connect();
  try {
    const statsRes = await client.query(
      `SELECT status, COUNT(*) as count
       FROM activeclinic.radiology_requests
       WHERE facility_id = $1
         AND organization_id = $2
         AND healthcare_organization_id = $3
       GROUP BY status`,
      [auth.selectedFacility.id, auth.organization.id, auth.healthcareOrganization.id]
    );

    const stats = {
      pending: 0,
      in_progress: 0,
      verified: 0,
    };

    for (const row of statsRes.rows) {
      if (row.status === "pending") stats.pending = parseInt(row.count, 10);
      if (row.status === "in_progress") stats.in_progress = parseInt(row.count, 10);
      if (row.status === "verified") stats.verified = parseInt(row.count, 10);
    }

    return {
      ok: true,
      dashboard: {
        facilityDisplayName: auth.selectedFacility.name,
        stats,
      },
    };
  } finally {
    client.release();
  }
}

/**
 * Load radiology request queue screen
 */
async function loadActiveClinicRadiologyQueueScreen(pool, params) {
  const { auth } = params;

  if (!auth.selectedFacility) {
    return { ok: false, code: DIAGNOSTICS_RESULT.FACILITY_NOT_FOUND };
  }

  const client = await pool.connect();
  try {
    const requestsRes = await client.query(
      `SELECT rr.id, rr.request_number, rr.study_type, rr.study_description,
              rr.urgency, rr.status, rr.requested_at,
              p.first_name || ' ' || p.last_name as patient_display_name
       FROM activeclinic.radiology_requests rr
       INNER JOIN activeclinic.patients p ON rr.patient_id = p.id
       WHERE rr.facility_id = $1
         AND rr.organization_id = $2
         AND rr.healthcare_organization_id = $3
         AND rr.status IN ('pending', 'in_progress', 'completed')
       ORDER BY rr.urgency DESC, rr.requested_at`,
      [auth.selectedFacility.id, auth.organization.id, auth.healthcareOrganization.id]
    );

    return {
      ok: true,
      queue: {
        facilityDisplayName: auth.selectedFacility.name,
        requests: requestsRes.rows.map((r) => ({
          id: r.id,
          requestNumber: r.request_number,
          studyType: r.study_type,
          studyDescription: r.study_description,
          urgency: r.urgency,
          status: r.status,
          patientDisplayName: r.patient_display_name,
          requestedAt: r.requested_at,
        })),
      },
    };
  } finally {
    client.release();
  }
}

/**
 * Load enter radiology report screen
 */
async function loadActiveClinicEnterRadiologyReportScreen(pool, params) {
  const { auth, requestId } = params;

  const client = await pool.connect();
  try {
    const requestRes = await client.query(
      `SELECT rr.id, rr.request_number, rr.study_type, rr.study_description,
              rr.clinical_indication,
              p.first_name || ' ' || p.last_name as patient_display_name
       FROM activeclinic.radiology_requests rr
       INNER JOIN activeclinic.patients p ON rr.patient_id = p.id
       WHERE rr.id = $1
         AND rr.organization_id = $2
         AND rr.healthcare_organization_id = $3`,
      [requestId, auth.organization.id, auth.healthcareOrganization.id]
    );

    if (requestRes.rows.length === 0) {
      return { ok: false, code: DIAGNOSTICS_RESULT.REQUEST_NOT_FOUND };
    }

    const request = requestRes.rows[0];

    return {
      ok: true,
      reportEntry: {
        request: {
          id: request.id,
          requestNumber: request.request_number,
          studyType: request.study_type,
          studyDescription: request.study_description,
          clinicalIndication: request.clinical_indication,
          patientDisplayName: request.patient_display_name,
        },
      },
    };
  } finally {
    client.release();
  }
}

/**
 * Load critical result alert screen
 */
async function loadActiveClinicCriticalResultAlertScreen(pool, params) {
  const { auth, resultId } = params;

  const client = await pool.connect();
  try {
    // Try laboratory result first
    const labResultRes = await client.query(
      `SELECT lr.id, 'laboratory' as result_type,
              lr.result_summary,
              lreq.request_number,
              lreq.test_panel_name,
              p.first_name || ' ' || p.last_name as patient_display_name,
              p.id as patient_id
       FROM activeclinic.laboratory_results lr
       INNER JOIN activeclinic.laboratory_requests lreq ON lr.laboratory_request_id = lreq.id
       INNER JOIN activeclinic.patients p ON lr.patient_id = p.id
       WHERE lr.id = $1
         AND lr.organization_id = $2
         AND lr.healthcare_organization_id = $3
         AND lr.is_critical = true`,
      [resultId, auth.organization.id, auth.healthcareOrganization.id]
    );

    if (labResultRes.rows.length > 0) {
      const result = labResultRes.rows[0];
      return {
        ok: true,
        alert: {
          resultType: "laboratory",
          resultId: result.id,
          requestNumber: result.request_number,
          testPanelName: result.test_panel_name,
          resultSummary: result.result_summary,
          patientDisplayName: result.patient_display_name,
          patientId: result.patient_id,
        },
      };
    }

    // Try radiology report
    const radResultRes = await client.query(
      `SELECT rr.id, 'radiology' as result_type,
              rr.impression,
              rreq.request_number,
              rreq.study_type,
              p.first_name || ' ' || p.last_name as patient_display_name,
              p.id as patient_id
       FROM activeclinic.radiology_reports rr
       INNER JOIN activeclinic.radiology_requests rreq ON rr.radiology_request_id = rreq.id
       INNER JOIN activeclinic.patients p ON rr.patient_id = p.id
       WHERE rr.id = $1
         AND rr.organization_id = $2
         AND rr.healthcare_organization_id = $3
         AND rr.is_critical = true`,
      [resultId, auth.organization.id, auth.healthcareOrganization.id]
    );

    if (radResultRes.rows.length > 0) {
      const result = radResultRes.rows[0];
      return {
        ok: true,
        alert: {
          resultType: "radiology",
          resultId: result.id,
          requestNumber: result.request_number,
          studyType: result.study_type,
          impression: result.impression,
          patientDisplayName: result.patient_display_name,
          patientId: result.patient_id,
        },
      };
    }

    return { ok: false, code: DIAGNOSTICS_RESULT.RESULT_NOT_FOUND };
  } finally {
    client.release();
  }
}

module.exports = {
  loadActiveClinicLaboratoryDashboardScreen,
  loadActiveClinicLaboratoryQueueScreen,
  loadActiveClinicLaboratoryWorklistScreen,
  loadActiveClinicLaboratoryRequestDetailScreen,
  loadActiveClinicSpecimenCollectionScreen,
  loadActiveClinicSpecimenReceiptScreen,
  loadActiveClinicSpecimenRejectedScreen,
  loadActiveClinicEnterLaboratoryResultScreen,
  loadActiveClinicRadiologyDashboardScreen,
  loadActiveClinicRadiologyQueueScreen,
  loadActiveClinicEnterRadiologyReportScreen,
  loadActiveClinicCriticalResultAlertScreen,
  actorFromAuth,
};
