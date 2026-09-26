"use strict";

/**
 * ActiveClinic clinical screen loaders (ACN14–16 + legacy triage/vitals surfaces).
 */

const {
  listOpenEncounters,
  listPractitionerWorklist,
  getEncounterById,
  listVitalSignsForEncounter,
  RESULT,
  PERM,
} = require("./activeClinicClinicalService");
const {
  listClinicalFollowUpItems,
  ITEM_TYPES,
  STATUSES,
  TYPE_LABELS,
  STATUS_LABELS,
} = require("./activeClinicClinicalFollowUpService");
const {
  authorizeStaffPermission,
} = require("./activeClinicAuthorizationService");

const STITCH = Object.freeze({
  worklistDesktop: "ae083a2bfe324046b4d9a0648c516bbd",
  worklistMobile: "f792e472b455437eb354e25d336fd869",
  /** Batch 1 ACN15 Juflona pilot references (retained for dual markers). */
  encounterDesktopBatch1: "3ea33c0c474342bbbbb307014209bfec",
  encounterMobileBatch1: "ec4486cb5e944705bede9c3100c47e9d",
  /** Batch 2 AC-B2-06 frozen Stitch project 7300898757945019896. */
  encounterDesktop: "b3d1767822e74ccd844a04947266f4c3",
  encounterMobile: "f0a06faaa89b4ded8506f3fc67cdfa77",
  followUpDesktop: "0c83bbfc71b94c2f958931693345d1db",
  followUpMobile: "362b305120114a5cac2ac38622a148f8",
});

function actorFromAuth(auth) {
  return {
    staffMemberId: auth.staffMember.id,
    platformIdentityId: auth.platformIdentity && auth.platformIdentity.id,
    organizationId: auth.organization && auth.organization.id,
    healthcareOrganizationId: auth.healthcareOrganization.id,
    facilityId: auth.selectedFacility ? auth.selectedFacility.id : null,
  };
}

async function hasPerm(db, auth, permissionKey) {
  const authz = await authorizeStaffPermission(db, {
    organizationId: auth.organization.id,
    staffMemberId: auth.staffMember.id,
    platformIdentityId: auth.platformIdentity && auth.platformIdentity.id,
    permissionKey,
    facilityId: auth.selectedFacility ? auth.selectedFacility.id : null,
  });
  return authz.ok === true;
}

/**
 * ACN14 Practitioner worklist (replaces flat open-encounter queue presentation).
 */
async function loadActiveClinicClinicalQueueScreen(db, input) {
  if (!input.auth.selectedFacility) {
    return { ok: false, code: RESULT.FACILITY_NOT_FOUND, queue: null };
  }

  const listed = await listPractitionerWorklist(db, {
    organizationId: input.auth.organization.id,
    healthcareOrganizationId: input.auth.healthcareOrganization.id,
    facilityId: input.auth.selectedFacility.id,
    actor: actorFromAuth(input.auth),
  });

  if (!listed.ok) {
    return { ok: false, code: listed.code, queue: null };
  }

  // Keep flat encounters for older consumers / empty-state counts.
  const openListed = await listOpenEncounters(db, {
    organizationId: input.auth.organization.id,
    healthcareOrganizationId: input.auth.healthcareOrganization.id,
    facilityId: input.auth.selectedFacility.id,
    actor: actorFromAuth(input.auth),
  });

  return {
    ok: true,
    code: RESULT.OK,
    queue: {
      facilityDisplayName: input.auth.selectedFacility.displayName,
      encounters: openListed.ok ? openListed.encounters : [],
      worklist: listed.worklist,
      stitch: {
        desktop: STITCH.worklistDesktop,
        mobile: STITCH.worklistMobile,
      },
      actions: {
        canStartEncounter: await hasPerm(db, input.auth, PERM.MANAGE),
        canOpenFollowUp: true,
      },
    },
  };
}

/**
 * ACN15 Clinical encounter workspace.
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

  const diagnosesRes = await db.query(
    `SELECT d.*, s.display_name AS recorded_by_staff_display_name
       FROM activeclinic.clinical_diagnoses d
       LEFT JOIN activeclinic.staff_members s ON s.id = d.recorded_by_staff_id
      WHERE d.encounter_id = $1
      ORDER BY d.created_at DESC`,
    [input.encounterId]
  );

  const draftRow =
    consultationRes.rows.find((n) => n.status === "draft") || null;
  const draftNote = draftRow || null;

  const ordersRes = await db.query(
    `SELECT o.id, o.order_type, o.order_details, o.instructions, o.status,
            o.created_at, s.display_name AS ordered_by_staff_display_name
       FROM activeclinic.clinical_orders o
       LEFT JOIN activeclinic.staff_members s ON s.id = o.ordered_by_staff_id
      WHERE o.encounter_id = $1
        AND o.organization_id = $2
        AND o.facility_id = $3
      ORDER BY o.created_at DESC
      LIMIT 50`,
    [
      input.encounterId,
      input.auth.organization.id,
      input.auth.selectedFacility.id,
    ]
  );

  const canRecord = await hasPerm(db, input.auth, PERM.CONSULTATION_RECORD);
  const canSign = await hasPerm(db, input.auth, PERM.CONSULTATION_SIGN);
  const canManage = await hasPerm(db, input.auth, PERM.MANAGE);
  const canTriage = await hasPerm(db, input.auth, PERM.TRIAGE);
  const canDiagnosis = await hasPerm(db, input.auth, PERM.DIAGNOSIS_RECORD);
  const canOrder = await hasPerm(db, input.auth, PERM.ORDER_CREATE);
  const encounterOpen = encounter.encounter.status === "open";
  const eid = input.encounterId;

  return {
    ok: true,
    code: RESULT.OK,
    workspace: {
      encounter: encounter.encounter,
      triage: triageRes.rows.length > 0 ? triageRes.rows[0] : null,
      vitals: vitalsRes.observations || [],
      consultationNotes: consultationRes.rows || [],
      draftNote,
      diagnoses: diagnosesRes.rows || [],
      orders: ordersRes.rows || [],
      stitch: {
        desktop: STITCH.encounterDesktop,
        mobile: STITCH.encounterMobile,
        batch1Desktop: STITCH.encounterDesktopBatch1,
        batch1Mobile: STITCH.encounterMobileBatch1,
      },
      links: {
        encounter: `/app/clinical/encounter/${eid}`,
        triage: `/app/clinical/encounter/${eid}/triage`,
        vitals: `/app/clinical/encounter/${eid}/vitals`,
        diagnosis: `/app/clinical/encounter/${eid}/diagnosis`,
        nursing: `/app/clinical/encounter/${eid}/nursing-intake`,
        orderPrescription: `/app/clinical/encounter/${eid}/order/prescription`,
        orderLab: `/app/clinical/encounter/${eid}/order/lab`,
        orderRadiology: `/app/clinical/encounter/${eid}/order/radiology`,
        patient: encounter.encounter.patientNumber
          ? `/app/patients/${encodeURIComponent(encounter.encounter.patientNumber)}`
          : null,
      },
      actions: {
        canRecordDraft: canRecord && encounterOpen,
        canSignConsultation: canSign && !!draftNote,
        canCompleteEncounter: canManage && canRecord && encounterOpen,
        canCloseEncounter: canManage && encounterOpen,
        canRecordTriage: canTriage && encounterOpen,
        canRecordVitals: canTriage && encounterOpen,
        canRecordDiagnosis: canDiagnosis && encounterOpen,
        canCreateOrder: canOrder && encounterOpen,
      },
    },
  };
}

/**
 * ACN16 Follow-up worklist.
 */
async function loadActiveClinicFollowUpWorklistScreen(db, input) {
  if (!input.auth.selectedFacility) {
    return { ok: false, code: RESULT.FACILITY_NOT_FOUND, followUp: null };
  }

  const listed = await listClinicalFollowUpItems(db, {
    organizationId: input.auth.organization.id,
    healthcareOrganizationId: input.auth.healthcareOrganization.id,
    facilityId: input.auth.selectedFacility.id,
    actor: actorFromAuth(input.auth),
    body: {},
    query: input.query || {},
    itemType: input.query && input.query.item_type,
    status: input.query && input.query.status,
    ownerStaffId: input.query && input.query.owner_staff_id,
  });
  if (!listed.ok) {
    return { ok: false, code: listed.code, followUp: null };
  }

  const counts = {
    due_review: 0,
    missed_appointment: 0,
    pending_referral: 0,
    incomplete_notes: 0,
    outstanding_action: 0,
  };
  for (const item of listed.items) {
    if (counts[item.itemType] != null) counts[item.itemType] += 1;
  }

  return {
    ok: true,
    code: RESULT.OK,
    followUp: {
      facilityDisplayName: input.auth.selectedFacility.displayName,
      items: listed.items,
      counts,
      filters: {
        itemType: (input.query && input.query.item_type) || "",
        status: (input.query && input.query.status) || "",
      },
      options: {
        types: ITEM_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] })),
        statuses: STATUSES.filter((s) => !["completed", "cancelled"].includes(s)).map(
          (s) => ({ value: s, label: STATUS_LABELS[s] })
        ),
      },
      stitch: {
        desktop: STITCH.followUpDesktop,
        mobile: STITCH.followUpMobile,
      },
      actions: {
        canUpdate: await hasPerm(db, input.auth, PERM.CONSULTATION_RECORD),
      },
    },
  };
}

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

async function loadActiveClinicClinicalAlertScreen(db, input) {
  if (!input.auth.selectedFacility) {
    return { ok: false, code: RESULT.FACILITY_NOT_FOUND, alerts: null };
  }

  const {
    listActiveAlertsForFacility,
  } = require("./activeClinicClinicalService");

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
      orderType: input.orderType || "lab",
      values: input.values || {},
      error: input.error || null,
    },
  };
}

module.exports = {
  STITCH,
  actorFromAuth,
  loadActiveClinicClinicalQueueScreen,
  loadActiveClinicConsultationWorkspaceScreen,
  loadActiveClinicFollowUpWorklistScreen,
  loadActiveClinicTriageAssessmentScreen,
  loadActiveClinicVitalSignsEntryScreen,
  loadActiveClinicClinicalAlertScreen,
  loadActiveClinicOrderFormScreen,
};
