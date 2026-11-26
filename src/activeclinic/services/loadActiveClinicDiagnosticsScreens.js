"use strict";

/**
 * ActiveClinic P06 diagnostics screen loaders: laboratory/radiology dashboards, queues, worklists, forms.
 */

const { RESULT: DIAGNOSTICS_RESULT } = require("./activeClinicDiagnosticsService");
const {
  canAttachLaboratoryResult,
  canAttachRadiologyReport,
  laboratoryQueueTabs,
  radiologyQueueTabs,
  laboratoryDashboardStats,
  radiologyDashboardStats,
} = require("./clinicalOperationsRules");

const STITCH_B2 = Object.freeze({
  diagnosticsDesktop: "07d08d75a44248acab897adb33254426",
  diagnosticsMobile: "f092ae1348084d1bb41b689d34c86f16",
});

function actorFromAuth(auth) {
  return {
    staffId: auth.staff.id,
    staffName: auth.staff.display_name,
    organizationId: auth.organization.id,
    healthcareOrganizationId: auth.healthcareOrganization.id,
  };
}

async function loadLabStatusCounts(client, auth) {
  const statsRes = await client.query(
    `SELECT status, COUNT(*)::int AS count
       FROM activeclinic.laboratory_requests
      WHERE facility_id = $1
        AND organization_id = $2
        AND healthcare_organization_id = $3
      GROUP BY status`,
    [auth.selectedFacility.id, auth.organization.id, auth.healthcareOrganization.id]
  );
  const stats = {
    pending_collection: 0,
    collected: 0,
    received: 0,
    processing: 0,
    resulted: 0,
    verified: 0,
    total: 0,
  };
  for (const row of statsRes.rows) {
    stats.total += row.count;
    if (Object.prototype.hasOwnProperty.call(stats, row.status)) {
      stats[row.status] = row.count;
    }
  }
  return stats;
}

async function loadRadStatusCounts(client, auth) {
  const statsRes = await client.query(
    `SELECT status, COUNT(*)::int AS count
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
    completed: 0,
    reported: 0,
    verified: 0,
    total: 0,
  };
  for (const row of statsRes.rows) {
    stats.total += row.count;
    if (Object.prototype.hasOwnProperty.call(stats, row.status)) {
      stats[row.status] = row.count;
    }
  }
  return stats;
}

/**
 * Batch 2 diagnostics hub — permission-gated lab/radiology KPIs only.
 */
async function loadActiveClinicDiagnosticsHubScreen(pool, params) {
  const { auth, showLaboratory, showRadiology } = params;
  if (!auth.selectedFacility) {
    return { ok: false, code: DIAGNOSTICS_RESULT.FACILITY_NOT_FOUND };
  }

  const client = await pool.connect();
  try {
    const hub = {
      showLaboratory: !!showLaboratory,
      showRadiology: !!showRadiology,
      laboratory: null,
      radiology: null,
      stitch: {
        desktop: STITCH_B2.diagnosticsDesktop,
        mobile: STITCH_B2.diagnosticsMobile,
      },
    };
    if (showLaboratory) {
      hub.laboratory = await loadLabStatusCounts(client, auth);
    }
    if (showRadiology) {
      hub.radiology = await loadRadStatusCounts(client, auth);
    }
    return { ok: true, hub };
  } finally {
    client.release();
  }
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
    const stats = await loadLabStatusCounts(client, auth);

    return {
      ok: true,
      dashboard: {
        facilityDisplayName:
          (auth.selectedFacility.displayName || auth.selectedFacility.name) || "",
        stats: laboratoryDashboardStats(stats),
        stitch: {
          desktop: STITCH_B2.diagnosticsDesktop,
          mobile: STITCH_B2.diagnosticsMobile,
        },
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
  const { auth, query } = params;

  if (!auth.selectedFacility) {
    return { ok: false, code: DIAGNOSTICS_RESULT.FACILITY_NOT_FOUND };
  }

  const status = String((query && query.status) || "open").trim() || "open";
  const q = String((query && query.q) || "").trim().slice(0, 120);
  const client = await pool.connect();
  try {
    const paramsSql = [
      auth.selectedFacility.id,
      auth.organization.id,
      auth.healthcareOrganization.id,
    ];
    let where = `lr.facility_id = $1
         AND lr.organization_id = $2
         AND lr.healthcare_organization_id = $3`;
    if (status === "open") {
      where += ` AND lr.status IN ('pending_collection', 'collected', 'received', 'processing')`;
    } else if (status !== "all") {
      paramsSql.push(status);
      where += ` AND lr.status = $${paramsSql.length}`;
    }
    if (q) {
      paramsSql.push(`%${q.replace(/[%_]/g, "")}%`);
      where += ` AND (
        lr.request_number ILIKE $${paramsSql.length}
        OR lr.test_panel_name ILIKE $${paramsSql.length}
        OR (p.first_name || ' ' || p.last_name) ILIKE $${paramsSql.length}
        OR COALESCE(p.patient_number, '') ILIKE $${paramsSql.length}
      )`;
    }

    const requestsRes = await client.query(
      `SELECT lr.id, lr.request_number, lr.test_panel_name, lr.urgency,
              lr.status, lr.requested_at, p.patient_number,
              p.first_name || ' ' || p.last_name as patient_display_name,
              sm.display_name AS ordering_clinician_display_name
       FROM activeclinic.laboratory_requests lr
       INNER JOIN activeclinic.patients p ON lr.patient_id = p.id
       LEFT JOIN activeclinic.staff_members sm ON lr.requested_by_staff_id = sm.id
       WHERE ${where}
       ORDER BY lr.urgency DESC, lr.requested_at
       LIMIT 200`,
      paramsSql
    );

    const counts = await loadLabStatusCounts(client, auth);
    const statusTabs = laboratoryQueueTabs(counts, status);

    return {
      ok: true,
      queue: {
        facilityDisplayName:
          (auth.selectedFacility.displayName || auth.selectedFacility.name) || "",
        currentStatus: status,
        q,
        statusTabs,
        modality: "laboratory",
        stitch: {
          desktop: STITCH_B2.diagnosticsDesktop,
          mobile: STITCH_B2.diagnosticsMobile,
        },
        requests: requestsRes.rows.map((r) => ({
          id: r.id,
          requestNumber: r.request_number,
          testPanelName: r.test_panel_name,
          urgency: r.urgency,
          status: r.status,
          patientDisplayName: r.patient_display_name,
          patientNumber: r.patient_number || null,
          orderingClinicianDisplayName: r.ordering_clinician_display_name || null,
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
    const resultRes = await client.query(
      `SELECT id, status, result_summary, patient_id, entered_by_staff_id
         FROM activeclinic.laboratory_results
        WHERE laboratory_request_id = $1
          AND organization_id = $2
          AND healthcare_organization_id = $3
        ORDER BY created_at DESC
        LIMIT 1`,
      [requestId, auth.organization.id, auth.healthcareOrganization.id]
    );
    const result = resultRes.rows[0] || null;

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
        result: result
          ? {
              id: result.id,
              status: result.status,
              summary: result.result_summary,
              patientId: result.patient_id,
              enteredByStaffId: result.entered_by_staff_id,
            }
          : null,
        actions: {
          canCollect: request.status === "pending_collection",
          canEnterResult: canAttachLaboratoryResult(request.status) && !result,
          canVerify: Boolean(result && result.status === "resulted"),
          canPrint: Boolean(result),
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
      `SELECT lr.id, lr.request_number, lr.test_panel_name, lr.test_panel_code, lr.status,
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
    if (!canAttachLaboratoryResult(request.status)) {
      return { ok: false, code: DIAGNOSTICS_RESULT.INVALID_STATUS };
    }

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
    const stats = await loadRadStatusCounts(client, auth);

    return {
      ok: true,
      dashboard: {
        facilityDisplayName:
          (auth.selectedFacility.displayName || auth.selectedFacility.name) || "",
        stats: radiologyDashboardStats(stats),
        stitch: {
          desktop: STITCH_B2.diagnosticsDesktop,
          mobile: STITCH_B2.diagnosticsMobile,
        },
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
  const { auth, query } = params;

  if (!auth.selectedFacility) {
    return { ok: false, code: DIAGNOSTICS_RESULT.FACILITY_NOT_FOUND };
  }

  const status = String((query && query.status) || "open").trim() || "open";
  const q = String((query && query.q) || "").trim().slice(0, 120);
  const client = await pool.connect();
  try {
    const paramsSql = [
      auth.selectedFacility.id,
      auth.organization.id,
      auth.healthcareOrganization.id,
    ];
    let where = `rr.facility_id = $1
         AND rr.organization_id = $2
         AND rr.healthcare_organization_id = $3`;
    if (status === "open") {
      where += ` AND rr.status IN ('pending', 'in_progress', 'completed')`;
    } else if (status !== "all") {
      paramsSql.push(status);
      where += ` AND rr.status = $${paramsSql.length}`;
    }
    if (q) {
      paramsSql.push(`%${q.replace(/[%_]/g, "")}%`);
      where += ` AND (
        rr.request_number ILIKE $${paramsSql.length}
        OR COALESCE(rr.study_type, '') ILIKE $${paramsSql.length}
        OR COALESCE(rr.study_description, '') ILIKE $${paramsSql.length}
        OR (p.first_name || ' ' || p.last_name) ILIKE $${paramsSql.length}
        OR COALESCE(p.patient_number, '') ILIKE $${paramsSql.length}
      )`;
    }

    const requestsRes = await client.query(
      `SELECT rr.id, rr.request_number, rr.study_type, rr.study_description,
              rr.urgency, rr.status, rr.requested_at, p.patient_number,
              p.first_name || ' ' || p.last_name as patient_display_name,
              sm.display_name AS ordering_clinician_display_name
       FROM activeclinic.radiology_requests rr
       INNER JOIN activeclinic.patients p ON rr.patient_id = p.id
       LEFT JOIN activeclinic.staff_members sm ON rr.requested_by_staff_id = sm.id
       WHERE ${where}
       ORDER BY rr.urgency DESC, rr.requested_at
       LIMIT 200`,
      paramsSql
    );

    const counts = await loadRadStatusCounts(client, auth);
    const statusTabs = radiologyQueueTabs(counts, status);

    return {
      ok: true,
      queue: {
        facilityDisplayName:
          (auth.selectedFacility.displayName || auth.selectedFacility.name) || "",
        currentStatus: status,
        q,
        statusTabs,
        modality: "radiology",
        stitch: {
          desktop: STITCH_B2.diagnosticsDesktop,
          mobile: STITCH_B2.diagnosticsMobile,
        },
        requests: requestsRes.rows.map((r) => ({
          id: r.id,
          requestNumber: r.request_number,
          studyType: r.study_type,
          studyDescription: r.study_description,
          urgency: r.urgency,
          status: r.status,
          patientDisplayName: r.patient_display_name,
          patientNumber: r.patient_number || null,
          orderingClinicianDisplayName: r.ordering_clinician_display_name || null,
          requestedAt: r.requested_at,
          canEnterReport: canAttachRadiologyReport(r.status),
        })),
      },
    };
  } finally {
    client.release();
  }
}

/**
 * Load radiology request detail screen
 */
async function loadActiveClinicRadiologyRequestDetailScreen(pool, params) {
  const { auth, requestId } = params;
  const client = await pool.connect();
  try {
    const requestRes = await client.query(
      `SELECT rr.id, rr.request_number, rr.study_type, rr.study_description,
              rr.clinical_indication, rr.urgency, rr.status, rr.requested_at,
              p.first_name || ' ' || p.last_name as patient_display_name
         FROM activeclinic.radiology_requests rr
         INNER JOIN activeclinic.patients p ON rr.patient_id = p.id
        WHERE rr.id = $1
          AND rr.organization_id = $2
          AND rr.healthcare_organization_id = $3
          AND rr.facility_id = $4`,
      [requestId, auth.organization.id, auth.healthcareOrganization.id, auth.selectedFacility.id]
    );
    if (requestRes.rows.length === 0) {
      return { ok: false, code: DIAGNOSTICS_RESULT.REQUEST_NOT_FOUND };
    }
    const request = requestRes.rows[0];
    const reportRes = await client.query(
      `SELECT id, status, findings, impression, technique, patient_id, reported_by_staff_id
         FROM activeclinic.radiology_reports
        WHERE radiology_request_id = $1
          AND organization_id = $2
          AND healthcare_organization_id = $3
        ORDER BY created_at DESC
        LIMIT 1`,
      [requestId, auth.organization.id, auth.healthcareOrganization.id]
    );
    const report = reportRes.rows[0] || null;
    return {
      ok: true,
      request: {
        id: request.id,
        requestNumber: request.request_number,
        studyType: request.study_type,
        studyDescription: request.study_description,
        clinicalIndication: request.clinical_indication,
        urgency: request.urgency,
        status: request.status,
        patientDisplayName: request.patient_display_name,
        requestedAt: request.requested_at,
        report: report
          ? {
              id: report.id,
              status: report.status,
              findings: report.findings,
              impression: report.impression,
              technique: report.technique,
              patientId: report.patient_id,
              reportedByStaffId: report.reported_by_staff_id,
            }
          : null,
        actions: {
          canEnterReport: canAttachRadiologyReport(request.status) && !report,
          canVerify: Boolean(report && report.status === "reported"),
          canPrint: Boolean(report),
        },
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
              rr.clinical_indication, rr.status,
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
    if (!canAttachRadiologyReport(request.status)) {
      return { ok: false, code: DIAGNOSTICS_RESULT.INVALID_STATUS };
    }

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
  loadActiveClinicDiagnosticsHubScreen,
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
  loadActiveClinicRadiologyRequestDetailScreen,
  loadActiveClinicEnterRadiologyReportScreen,
  loadActiveClinicCriticalResultAlertScreen,
  actorFromAuth,
  STITCH_B2,
};
