"use strict";

/**
 * ActiveClinic P04 clinical screen loaders.
 */

const {
  listOpenEncounters,
  getEncounterById,
  listVitalSignsForEncounter,
  listActiveAlertsForFacility,
  RESULT,
} = require("./activeClinicClinicalService");

function actorFromAuth(auth) {
  return {
    staffMemberId: auth.staffMember.id,
    platformIdentityId: auth.identity.id,
    healthcareOrganizationId: auth.healthcareOrganization.id,
    facilityId: auth.selectedFacility ? auth.selectedFacility.id : null,
  };
}

/**
 * Load clinical queue screen (list of open encounters).
 */
async function loadActiveClinicClinicalQueueScreen(db, input) {
  if (!input.auth.selectedFacility) {
    return { ok: false, code: RESULT.FACILITY_NOT_FOUND, queue: null };
  }

  const listed = await listOpenEncounters(db, {
    organizationId: input.auth.organization.id,
    healthcareOrganizationId: input.auth.healthcareOrganization.id,
    facilityId: input.auth.selectedFacility.id,
    actor: actorFromAuth(input.auth),
  });

  if (!listed.ok) {
    return { ok: false, code: listed.code, queue: null };
  }

  return {
    ok: true,
    code: RESULT.OK,
    queue: {
      facilityDisplayName: input.auth.selectedFacility.displayName,
      encounters: listed.encounters,
      actions: {
        canStartEncounter: true,
      },
    },
  };
}

/**
 * Load consultation workspace screen.
 */
async function loadActiveClinicConsultationWorkspaceScreen(db, input) {
  if (!input.auth.selectedFacility) {
    return { ok: false, code: RESULT.FACILITY_NOT_FOUND, workspace: null };
  }

  const encounter = await getEncounterById(db, {
    organizationId: input.auth.organization.id,
    healthcareOrganizationId: input.auth.healthcareOrganization.id,
    facilityId: input.auth.selectedFacility.id,
    encounterId: input.encounterId,
    actor: actorFromAuth(input.auth),
  });

  if (!encounter.ok) {
    return { ok: false, code: encounter.code, workspace: null };
  }

  const vitalsRes = await listVitalSignsForEncounter(db, {
    organizationId: input.auth.organization.id,
    healthcareOrganizationId: input.auth.healthcareOrganization.id,
    facilityId: input.auth.selectedFacility.id,
    encounterId: input.encounterId,
    actor: actorFromAuth(input.auth),
  });

  const triageRes = await db.query(
    `SELECT t.*, s.display_name AS recorded_by_staff_display_name
       FROM activeclinic.triage_assessments t
       LEFT JOIN activeclinic.staff_members s ON s.id = t.recorded_by_staff_id
      WHERE t.encounter_id = $1`,
    [input.encounterId]
  );

  const consultationRes = await db.query(
    `SELECT c.*,
            cs.display_name AS created_by_staff_display_name,
            ss.display_name AS signed_by_staff_display_name
       FROM activeclinic.consultation_notes c
       LEFT JOIN activeclinic.staff_members cs ON cs.id = c.created_by_staff_id
       LEFT JOIN activeclinic.staff_members ss ON ss.id = c.signed_by_staff_id
      WHERE c.encounter_id = $1
      ORDER BY c.created_at DESC`,
    [input.encounterId]
  );

  const ordersRes = await db.query(
    `SELECT o.*, s.display_name AS ordered_by_staff_display_name
       FROM activeclinic.clinical_orders o
       LEFT JOIN activeclinic.staff_members s ON s.id = o.ordered_by_staff_id
      WHERE o.encounter_id = $1
      ORDER BY o.created_at DESC`,
    [input.encounterId]
  );

  const diagnosesRes = await db.query(
    `SELECT d.*, s.display_name AS recorded_by_staff_display_name
       FROM activeclinic.clinical_diagnoses d
       LEFT JOIN activeclinic.staff_members s ON s.id = d.recorded_by_staff_id
      WHERE d.encounter_id = $1
      ORDER BY d.created_at DESC`,
    [input.encounterId]
  );

  return {
    ok: true,
    code: RESULT.OK,
    workspace: {
      encounter: encounter.encounter,
      triage: triageRes.rows.length > 0 ? triageRes.rows[0] : null,
      vitals: vitalsRes.observations || [],
      consultationNotes: consultationRes.rows || [],
      orders: ordersRes.rows || [],
      diagnoses: diagnosesRes.rows || [],
      actions: {
        canRecordTriage: true,
        canRecordVitals: true,
        canDraftConsultation: true,
        canSignConsultation: true,
        canCreateOrder: true,
        canRecordDiagnosis: true,
        canCloseEncounter: encounter.encounter.status === "open",
      },
    },
  };
}

/**
 * Load triage assessment screen.
 */
async function loadActiveClinicTriageAssessmentScreen(db, input) {
  if (!input.auth.selectedFacility) {
    return { ok: false, code: RESULT.FACILITY_NOT_FOUND, triage: null };
  }

  const encounter = await getEncounterById(db, {
    organizationId: input.auth.organization.id,
    healthcareOrganizationId: input.auth.healthcareOrganization.id,
    facilityId: input.auth.selectedFacility.id,
    encounterId: input.encounterId,
    actor: actorFromAuth(input.auth),
  });

  if (!encounter.ok) {
    return { ok: false, code: encounter.code, triage: null };
  }

  const triageRes = await db.query(
    `SELECT * FROM activeclinic.triage_assessments WHERE encounter_id = $1`,
    [input.encounterId]
  );

  return {
    ok: true,
    code: RESULT.OK,
    triage: {
      encounter: encounter.encounter,
      assessment: triageRes.rows.length > 0 ? triageRes.rows[0] : null,
      values: input.values || {},
      error: input.error || null,
    },
  };
}

/**
 * Load vital signs entry screen.
 */
async function loadActiveClinicVitalSignsEntryScreen(db, input) {
  if (!input.auth.selectedFacility) {
    return { ok: false, code: RESULT.FACILITY_NOT_FOUND, vitals: null };
  }

  const encounter = await getEncounterById(db, {
    organizationId: input.auth.organization.id,
    healthcareOrganizationId: input.auth.healthcareOrganization.id,
    facilityId: input.auth.selectedFacility.id,
    encounterId: input.encounterId,
    actor: actorFromAuth(input.auth),
  });

  if (!encounter.ok) {
    return { ok: false, code: encounter.code, vitals: null };
  }

  const vitalsRes = await listVitalSignsForEncounter(db, {
    organizationId: input.auth.organization.id,
    healthcareOrganizationId: input.auth.healthcareOrganization.id,
    facilityId: input.auth.selectedFacility.id,
    encounterId: input.encounterId,
    actor: actorFromAuth(input.auth),
  });

  return {
    ok: true,
    code: RESULT.OK,
    vitals: {
      encounter: encounter.encounter,
      observations: vitalsRes.observations || [],
      values: input.values || {},
      error: input.error || null,
    },
  };
}

/**
 * Load clinical escalation alert screen.
 */
async function loadActiveClinicClinicalAlertScreen(db, input) {
  if (!input.auth.selectedFacility) {
    return { ok: false, code: RESULT.FACILITY_NOT_FOUND, alerts: null };
  }

  const listed = await listActiveAlertsForFacility(db, {
    organizationId: input.auth.organization.id,
    healthcareOrganizationId: input.auth.healthcareOrganization.id,
    facilityId: input.auth.selectedFacility.id,
    actor: actorFromAuth(input.auth),
  });

  if (!listed.ok) {
    return { ok: false, code: listed.code, alerts: null };
  }

  return {
    ok: true,
    code: RESULT.OK,
    alerts: {
      facilityDisplayName: input.auth.selectedFacility.displayName,
      activeAlerts: listed.alerts,
      actions: {
        canRaiseAlert: true,
      },
    },
  };
}

/**
 * Load order form screens (lab/prescription/radiology).
 */
async function loadActiveClinicOrderFormScreen(db, input) {
  if (!input.auth.selectedFacility) {
    return { ok: false, code: RESULT.FACILITY_NOT_FOUND, orderForm: null };
  }

  const encounter = await getEncounterById(db, {
    organizationId: input.auth.organization.id,
    healthcareOrganizationId: input.auth.healthcareOrganization.id,
    facilityId: input.auth.selectedFacility.id,
    encounterId: input.encounterId,
    actor: actorFromAuth(input.auth),
  });

  if (!encounter.ok) {
    return { ok: false, code: encounter.code, orderForm: null };
  }

  return {
    ok: true,
    code: RESULT.OK,
    orderForm: {
      encounter: encounter.encounter,
      orderType: input.orderType,
      values: input.values || {},
      error: input.error || null,
    },
  };
}

module.exports = {
  loadActiveClinicClinicalQueueScreen,
  loadActiveClinicConsultationWorkspaceScreen,
  loadActiveClinicTriageAssessmentScreen,
  loadActiveClinicVitalSignsEntryScreen,
  loadActiveClinicClinicalAlertScreen,
  loadActiveClinicOrderFormScreen,
  actorFromAuth,
};
