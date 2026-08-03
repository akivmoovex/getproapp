"use strict";

/**
 * ActiveClinic appointment list / calendar / book / detail loaders (AC-V6-C04).
 * Stitch P03 appointment family; reception/queue screens deferred to C05/C06.
 */

const {
  listAppointments,
  getAppointmentDetail,
  listAppointmentServiceTypes,
  listAvailableAppointmentSlots,
  RESULT: APPT_RESULT,
  PERM,
} = require("./activeClinicAppointmentService");
const appointmentRepo = require("../repositories/appointmentRepository");
const {
  searchActiveClinicPatients,
  getPatientByOrgAndId,
  PERM: PATIENT_PERM,
} = require("./activeClinicPatientService");
const {
  formatPatientDisplayName,
} = require("./patientPrivacyHelpers");
const {
  listFacilitiesByOrganization,
} = require("./facilityService");
const {
  listStaffMembersByOrganization,
  listStaffMembersByFacility,
} = require("./activeClinicStaffService");

const STATUS_LABELS = Object.freeze({
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
  rescheduled: "Rescheduled",
});

const STITCH = Object.freeze({
  listDesktop: "284e9f8cd6804b0eb0f50574e2f571d6",
  listMobile: "480ecaba5258423e8711b1fdd2f39e1b",
  calendarDesktop: "0fca19f233af43c49966e7eb62bccb02",
  bookDesktop: "a99c6ac04cf24f2c8ca349715c1829dc",
  confirmationDesktop: "327422c1b36747039e4026a17c5a2f33",
  cancelDesktop: "b27eafc25bad4006868f3932d08bfed5",
  rescheduleDesktop: "da39a3945ace4fac85cb12bd86f0cdc2",
  rescheduleMobile: "9429b14e9ea243ad93aec4a486db93e9",
  sharedStates: "089aa8f266664446a8b38cb69d1fda48",
  missedDesktop: "7d37e069c7644e7cb4c9b72349a0ccf7",
});

function hasPerm(perms, key) {
  return Array.isArray(perms) ? perms.includes(key) : false;
}

function actorFromAuth(auth) {
  return {
    staffMemberId: auth.staffMember.id,
    platformIdentityId: auth.platformIdentity && auth.platformIdentity.id,
    organizationId: auth.organization.id,
  };
}

function formatWhen(startsAt, endsAt, timezone) {
  const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
  const end = endsAt instanceof Date ? endsAt : new Date(endsAt);
  if (Number.isNaN(start.getTime())) {
    return { dateLabel: "—", timeLabel: "—", dayKey: "" };
  }
  const dateLabel = start.toISOString().slice(0, 10);
  const timeLabel = `${start.toISOString().slice(11, 16)}–${
    Number.isNaN(end.getTime()) ? "?" : end.toISOString().slice(11, 16)
  } UTC`;
  return {
    dateLabel,
    timeLabel: `${timeLabel}${timezone ? ` (${timezone})` : ""}`,
    dayKey: dateLabel,
    startsAtIso: start.toISOString(),
    endsAtIso: Number.isNaN(end.getTime()) ? "" : end.toISOString(),
  };
}

async function loadFacilityOptions(db, auth) {
  const listed = await listFacilitiesByOrganization(db, {
    organizationId: auth.organization.id,
  });
  const facilities = (listed.facilities || []).filter((f) =>
    ["active", "planned"].includes(f.status)
  );
  return facilities.map((f) => ({
    id: f.id,
    key: f.facilityKey,
    displayName: f.displayName,
    status: f.status,
    timezone: f.timezone,
  }));
}

async function enrichAppointments(db, auth, appointments) {
  if (!appointments.length) return [];
  const orgId = auth.organization.id;
  const hcoId = auth.healthcareOrganization.id;
  const patientIds = [...new Set(appointments.map((a) => a.patientId))];
  const serviceIds = [...new Set(appointments.map((a) => a.serviceTypeId))];
  const staffIds = [
    ...new Set(appointments.map((a) => a.assignedStaffId).filter(Boolean)),
  ];

  const patients = {};
  for (const id of patientIds) {
    const p = await getPatientByOrgAndId(db, {
      organizationId: orgId,
      healthcareOrganizationId: hcoId,
      patientId: id,
    });
    if (p.ok) {
      patients[id] = {
        id: p.patient.id,
        patientNumber: p.patient.patientNumber,
        displayName: formatPatientDisplayName(p.patient),
      };
    }
  }

  const facilities = {};
  for (const f of await loadFacilityOptions(db, auth)) {
    facilities[f.id] = f;
  }

  const services = {};
  const svc = await listAppointmentServiceTypes(db, {
    organizationId: orgId,
    healthcareOrganizationId: hcoId,
    actor: actorFromAuth(auth),
    includeInactive: true,
  });
  if (svc.ok) {
    for (const s of svc.serviceTypes) {
      if (serviceIds.includes(s.id)) services[s.id] = s;
    }
  }

  const staff = {};
  if (staffIds.length) {
    const allStaff = await listStaffMembersByOrganization(db, {
      organizationId: orgId,
      healthcareOrganizationId: hcoId,
    });
    const rows = allStaff.ok ? allStaff.staffMembers || [] : [];
    for (const s of rows) {
      if (staffIds.includes(s.id)) {
        staff[s.id] = {
          id: s.id,
          displayName: [s.firstName || s.first_name, s.lastName || s.last_name]
            .filter(Boolean)
            .join(" "),
        };
      }
    }
  }

  return appointments.map((a) => {
    const when = formatWhen(a.startsAt, a.endsAt, a.timezone);
    return {
      ...a,
      statusLabel: STATUS_LABELS[a.status] || a.status,
      patient: patients[a.patientId] || null,
      facility: facilities[a.facilityId] || null,
      service: services[a.serviceTypeId] || null,
      assignedStaff: a.assignedStaffId ? staff[a.assignedStaffId] || null : null,
      when,
    };
  });
}

function parseListFilters(query) {
  const date = String(query.date || "").trim();
  const dateTo = String(query.date_to || "").trim();
  let startsFrom = null;
  let startsTo = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    startsFrom = new Date(`${date}T00:00:00.000Z`);
    const endDay = /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? dateTo : date;
    startsTo = new Date(new Date(`${endDay}T23:59:59.999Z`).getTime() + 1);
  } else {
    const y = new Date().toISOString().slice(0, 10);
    startsFrom = new Date(`${y}T00:00:00.000Z`);
    startsTo = new Date(startsFrom.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  return {
    facilityId: String(query.facility || "").trim() || null,
    status: String(query.status || "").trim() || null,
    assignedStaffId: String(query.staff || "").trim() || null,
    serviceTypeId: String(query.service || "").trim() || null,
    date: date || startsFrom.toISOString().slice(0, 10),
    dateTo: dateTo || "",
    startsFrom,
    startsTo,
    active: Boolean(
      query.facility ||
        query.status ||
        query.staff ||
        query.service ||
        query.date ||
        query.date_to
    ),
  };
}

async function loadActiveClinicAppointmentListScreen(db, input) {
  const { auth, query } = input;
  const filters = parseListFilters(query || {});
  const perms = auth.permissions || [];
  const listed = await listAppointments(db, {
    organizationId: auth.organization.id,
    healthcareOrganizationId: auth.healthcareOrganization.id,
    actor: actorFromAuth(auth),
    facilityId: filters.facilityId,
    status: filters.status,
    assignedStaffId: filters.assignedStaffId,
    serviceTypeId: filters.serviceTypeId,
    startsFrom: filters.startsFrom,
    startsTo: filters.startsTo,
    limit: 100,
  });
  if (!listed.ok) {
    return { ok: false, code: listed.code, list: null };
  }
  const appointments = await enrichAppointments(db, auth, listed.appointments);
  const facilities = await loadFacilityOptions(db, auth);
  const services = await listAppointmentServiceTypes(db, {
    organizationId: auth.organization.id,
    healthcareOrganizationId: auth.healthcareOrganization.id,
    actor: actorFromAuth(auth),
  });
  let staffOptions = [];
  const staffListed = await listStaffMembersByOrganization(db, {
    organizationId: auth.organization.id,
    healthcareOrganizationId: auth.healthcareOrganization.id,
  });
  if (staffListed.ok) {
    staffOptions = (staffListed.staffMembers || []).map((s) => ({
      id: s.id,
      label: [s.firstName || s.first_name, s.lastName || s.last_name]
        .filter(Boolean)
        .join(" "),
    }));
  }

  let emptyMode = null;
  if (!appointments.length) {
    emptyMode = filters.active ? "filtered" : "none";
  }

  return {
    ok: true,
    code: APPT_RESULT.OK,
    list: {
      appointments,
      filters,
      filterOptions: {
        facilities: facilities.map((f) => ({ value: f.id, label: f.displayName })),
        statuses: Object.entries(STATUS_LABELS).map(([value, label]) => ({
          value,
          label,
        })),
        staff: staffOptions.map((s) => ({ value: s.id, label: s.label })),
        services: (services.serviceTypes || []).map((s) => ({
          value: s.id,
          label: s.displayName,
        })),
      },
      emptyMode,
      resultCount: appointments.length,
      actions: {
        canCreate: hasPerm(perms, PERM.CREATE),
        createHref: "/app/appointments/new",
        calendarHref: "/app/appointments/calendar",
      },
      stitch: {
        desktop: STITCH.listDesktop,
        mobile: STITCH.listMobile,
        shared: STITCH.sharedStates,
      },
    },
  };
}

async function loadActiveClinicAppointmentCalendarScreen(db, input) {
  const listResult = await loadActiveClinicAppointmentListScreen(db, input);
  if (!listResult.ok) return listResult;
  const byDay = {};
  for (const a of listResult.list.appointments) {
    const key = a.when.dayKey || "unknown";
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(a);
  }
  const days = Object.keys(byDay)
    .sort()
    .map((dayKey) => ({
      dayKey,
      count: byDay[dayKey].length,
      appointments: byDay[dayKey],
    }));
  return {
    ok: true,
    code: APPT_RESULT.OK,
    calendar: {
      ...listResult.list,
      days,
      stitch: {
        desktop: STITCH.calendarDesktop,
        mobile: STITCH.listMobile,
        listAlt: STITCH.listDesktop,
      },
    },
  };
}

function emptyFormValues(auth) {
  const selected = auth.selectedFacility;
  const today = new Date().toISOString().slice(0, 10);
  return {
    patientId: "",
    patientNumber: "",
    patientQuery: "",
    facilityId: selected && selected.id ? selected.id : "",
    serviceTypeId: "",
    assignedStaffId: "",
    startsDate: today,
    startsTime: "09:00",
    endsTime: "09:30",
    timezone: (selected && selected.timezone) || "Africa/Lusaka",
    schedulingNote: "",
    reminderChannel: "none",
  };
}

function parseAppointmentFormBody(body) {
  const b = body || {};
  return {
    patientId: String(b.patient_id || "").trim(),
    patientNumber: String(b.patient_number || "").trim(),
    patientQuery: String(b.patient_query || "").trim(),
    facilityId: String(b.facility_id || "").trim(),
    serviceTypeId: String(b.service_type_id || "").trim(),
    assignedStaffId: String(b.assigned_staff_id || "").trim(),
    startsDate: String(b.starts_date || "").trim(),
    startsTime: String(b.starts_time || "").trim(),
    endsTime: String(b.ends_time || "").trim(),
    timezone: String(b.timezone || "").trim(),
    schedulingNote: String(b.scheduling_note || "").trim(),
    reminderChannel: String(b.reminder_channel || "none").trim(),
    confirm: String(b.confirm || "").trim() === "1",
    step: String(b.step || "").trim(),
  };
}

function buildStartsEnds(values) {
  const startsAt = new Date(`${values.startsDate}T${values.startsTime}:00`);
  const endsAt = new Date(`${values.startsDate}T${values.endsTime}:00`);
  return { startsAt, endsAt };
}

async function loadActiveClinicAppointmentFormScreen(db, input) {
  const { auth, values, mode, appointment, error, review, slotCheck } = input;
  const formValues = values || emptyFormValues(auth);
  const facilities = await loadFacilityOptions(db, auth);
  const services = await listAppointmentServiceTypes(db, {
    organizationId: auth.organization.id,
    healthcareOrganizationId: auth.healthcareOrganization.id,
    actor: actorFromAuth(auth),
  });
  let staffOptions = [];
  if (formValues.facilityId) {
    const staffListed = await listStaffMembersByFacility(db, {
      organizationId: auth.organization.id,
      facilityId: formValues.facilityId,
    });
    if (staffListed.ok) {
      staffOptions = (staffListed.staffMembers || []).map((s) => ({
        id: s.id,
        label: [s.firstName || s.first_name, s.lastName || s.last_name]
          .filter(Boolean)
          .join(" "),
      }));
    }
  }
  let patientMatches = [];
  if (
    formValues.patientQuery &&
    formValues.patientQuery.length >= 2 &&
    hasPerm(auth.permissions, PATIENT_PERM.SEARCH)
  ) {
    const search = await searchActiveClinicPatients(db, {
      organizationId: auth.organization.id,
      healthcareOrganizationId: auth.healthcareOrganization.id,
      actor: actorFromAuth(auth),
      nameQuery: formValues.patientQuery,
      limit: 10,
    });
    if (search.ok) {
      patientMatches = (search.results || search.patients || []).map((p) => ({
        id: p.id,
        patientNumber: p.patientNumber,
        displayName: p.displayName || formatPatientDisplayName(p),
      }));
    }
  }

  return {
    ok: true,
    form: {
      mode: mode || "create",
      values: formValues,
      facilities,
      services: services.serviceTypes || [],
      staffOptions,
      patientMatches,
      appointment: appointment || null,
      error: error || null,
      review: review || false,
      slotCheck: slotCheck || null,
      formAction:
        mode === "edit" && appointment
          ? `/app/appointments/${appointment.id}`
          : "/app/appointments",
      rescheduleAction:
        appointment && `/app/appointments/${appointment.id}/reschedule`,
      stitch: {
        book: STITCH.bookDesktop,
        review: STITCH.confirmationDesktop,
        rescheduleDesktop: STITCH.rescheduleDesktop,
        rescheduleMobile: STITCH.rescheduleMobile,
      },
    },
  };
}

async function loadActiveClinicAppointmentDetailScreen(db, input) {
  const { auth, appointmentId } = input;
  const detail = await getAppointmentDetail(db, {
    organizationId: auth.organization.id,
    healthcareOrganizationId: auth.healthcareOrganization.id,
    appointmentId,
    actor: actorFromAuth(auth),
  });
  if (!detail.ok) return { ok: false, code: detail.code, detail: null };

  const enriched = (await enrichAppointments(db, auth, [detail.appointment]))[0];
  const reminders = await appointmentRepo.listRemindersForAppointment(db, {
    organizationId: auth.organization.id,
    healthcareOrganizationId: auth.healthcareOrganization.id,
    appointmentId,
  });
  const perms = auth.permissions || [];
  const status = detail.appointment.status;
  const canEdit =
    hasPerm(perms, PERM.UPDATE) && ["scheduled", "confirmed"].includes(status);
  const canCancel =
    hasPerm(perms, PERM.CANCEL) &&
    ["scheduled", "confirmed", "checked_in"].includes(status);
  const canCheckIn =
    hasPerm(perms, PERM.CHECK_IN) && ["scheduled", "confirmed"].includes(status);
  const canNoShow =
    hasPerm(perms, PERM.UPDATE) && ["scheduled", "confirmed"].includes(status);

  return {
    ok: true,
    detail: {
      appointment: enriched,
      statusEvents: detail.statusEvents || [],
      reminders: reminders.map((r) => ({
        channel: r.preferred_channel,
        scheduledFor: r.scheduled_for,
        deliveryState: r.delivery_state,
      })),
      actions: {
        canEdit,
        canCancel,
        canCheckIn,
        canNoShow,
        editHref: `/app/appointments/${appointmentId}/edit`,
      },
      stitch: {
        cancel: STITCH.cancelDesktop,
        missed: STITCH.missedDesktop,
        confirmation: STITCH.confirmationDesktop,
      },
    },
  };
}

module.exports = {
  STITCH,
  STATUS_LABELS,
  actorFromAuth,
  emptyFormValues,
  parseAppointmentFormBody,
  buildStartsEnds,
  loadActiveClinicAppointmentListScreen,
  loadActiveClinicAppointmentCalendarScreen,
  loadActiveClinicAppointmentFormScreen,
  loadActiveClinicAppointmentDetailScreen,
  listAvailableAppointmentSlots,
};
