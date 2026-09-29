"use strict";

const appointmentsRepo = require("../../db/pg/church/appointmentsRepo");
const branchAdminsRepo = require("../../db/pg/church/branchAdminsRepo");
const membersRepo = require("../../db/pg/church/membersRepo");
const { getEntitlement } = require("./churchEntitlementService");

const APPOINTMENT_ERRORS = Object.freeze({
  PACKAGE_REQUIRED: "PACKAGE_REQUIRED",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  ON_LEAVE: "ON_LEAVE",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  PERMISSION_DENIED: "PERMISSION_DENIED",
});

function makeError(code, message) {
  return Object.assign(new Error(message), { code });
}

function assertAppointmentsCalendar(plan) {
  if (!getEntitlement(plan, "appointments.calendar")) {
    throw makeError(APPOINTMENT_ERRORS.PACKAGE_REQUIRED, "Appointment calendar requires Growth.");
  }
}

function canViewConfidentialNotes(admin) {
  return Boolean(admin && admin.can_access_pastoral);
}

async function assertMinisterOnBranch(pool, ministerAdminId, branchId) {
  const admin = await branchAdminsRepo.findBranchAdminById(pool, ministerAdminId);
  if (!admin || Number(admin.branch_id) !== Number(branchId) || admin.status !== "active") {
    throw makeError(APPOINTMENT_ERRORS.NOT_FOUND, "Minister not found on this branch.");
  }
  return admin;
}

async function saveSettings(pool, ctx, plan, data) {
  assertAppointmentsCalendar(plan);
  return appointmentsRepo.upsertSettings(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    ...data,
    updated_by_admin_id: ctx.admin_id,
  });
}

async function addAvailability(pool, ctx, plan, data) {
  assertAppointmentsCalendar(plan);
  await assertMinisterOnBranch(pool, data.minister_admin_id, ctx.branch_id);
  return appointmentsRepo.insertAvailability(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    ...data,
  });
}

async function addLeave(pool, ctx, plan, data) {
  assertAppointmentsCalendar(plan);
  await assertMinisterOnBranch(pool, data.minister_admin_id, ctx.branch_id);
  return appointmentsRepo.insertLeave(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    ...data,
    created_by_admin_id: ctx.admin_id,
  });
}

async function requestAppointment(pool, ctx, plan, data, opts = {}) {
  assertAppointmentsCalendar(plan);
  await assertMinisterOnBranch(pool, data.minister_admin_id, ctx.branch_id);

  const memberId = data.member_id || ctx.member_id;
  if (!memberId) throw makeError(APPOINTMENT_ERRORS.NOT_FOUND, "Member is required.");
  const member = await membersRepo.findMemberById(pool, memberId);
  if (!member || Number(member.branch_id) !== Number(ctx.branch_id)) {
    throw makeError(APPOINTMENT_ERRORS.NOT_FOUND, "Member not found on this branch.");
  }

  const settings = await appointmentsRepo.getSettingsWithDefaults(pool, ctx.branch_id);
  const buffer = settings.buffer_minutes != null ? Number(settings.buffer_minutes) : 15;

  const leave = await appointmentsRepo.findLeaveOverlap(
    pool,
    data.minister_admin_id,
    data.starts_at,
    data.ends_at
  );
  if (leave) {
    throw makeError(APPOINTMENT_ERRORS.ON_LEAVE, "Minister is on leave for this time.");
  }

  const conflict = await appointmentsRepo.findConflictingAppointment(
    pool,
    data.minister_admin_id,
    data.starts_at,
    data.ends_at,
    buffer,
    opts.excludeAppointmentId || null
  );
  if (conflict) {
    throw makeError(APPOINTMENT_ERRORS.CONFLICT, "Time slot conflicts with an existing booking (including buffer).");
  }

  const appointment = await appointmentsRepo.insertAppointment(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    member_id: memberId,
    minister_admin_id: data.minister_admin_id,
    starts_at: data.starts_at,
    ends_at: data.ends_at,
    duration_minutes: data.duration_minutes,
    buffer_minutes: buffer,
    status: opts.autoApprove ? "approved" : "requested",
    purpose: data.purpose,
    member_request_note: data.member_request_note,
    reschedule_of_appointment_id: opts.rescheduleOfId || null,
  });

  if (opts.autoApprove || appointment.status === "approved") {
    await scheduleReminder(pool, ctx, appointment, settings);
  }
  return appointment;
}

async function scheduleReminder(pool, ctx, appointment, settings) {
  const hours = settings && settings.reminder_hours_before != null
    ? Number(settings.reminder_hours_before)
    : 24;
  const remindAt = new Date(new Date(appointment.starts_at).getTime() - hours * 60 * 60 * 1000);
  if (remindAt.getTime() <= Date.now()) return null;
  return appointmentsRepo.upsertReminder(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    appointment_id: appointment.id,
    remind_at: remindAt,
  });
}

async function approveAppointment(pool, ctx, plan, appointmentId) {
  assertAppointmentsCalendar(plan);
  const existing = await appointmentsRepo.findAppointmentByIdForBranch(
    pool,
    appointmentId,
    ctx.branch_id
  );
  if (!existing) throw makeError(APPOINTMENT_ERRORS.NOT_FOUND, "Appointment not found.");
  if (existing.status !== "requested") {
    throw makeError(APPOINTMENT_ERRORS.INVALID_TRANSITION, "Only requested appointments can be approved.");
  }
  const updated = await appointmentsRepo.updateAppointment(pool, appointmentId, ctx.branch_id, {
    status: "approved",
    approved_at: new Date(),
    approved_by_admin_id: ctx.admin_id,
  });
  const settings = await appointmentsRepo.getSettingsWithDefaults(pool, ctx.branch_id);
  await scheduleReminder(pool, ctx, updated, settings);
  return updated;
}

async function cancelAppointment(pool, ctx, plan, appointmentId, reason, actor) {
  assertAppointmentsCalendar(plan);
  let existing;
  if (actor === "member") {
    existing = await appointmentsRepo.findAppointmentByIdForMember(
      pool,
      appointmentId,
      ctx.member_id
    );
  } else {
    existing = await appointmentsRepo.findAppointmentByIdForBranch(
      pool,
      appointmentId,
      ctx.branch_id
    );
  }
  if (!existing) throw makeError(APPOINTMENT_ERRORS.NOT_FOUND, "Appointment not found.");
  if (!["requested", "approved"].includes(existing.status)) {
    throw makeError(APPOINTMENT_ERRORS.INVALID_TRANSITION, "Appointment cannot be cancelled.");
  }
  const updated = await appointmentsRepo.updateAppointment(pool, appointmentId, existing.branch_id, {
    status: "cancelled",
    cancelled_at: new Date(),
    cancelled_by_type: actor === "member" ? "member" : "admin",
    cancelled_by_id: actor === "member" ? ctx.member_id : ctx.admin_id,
    cancellation_reason: reason || "",
  });
  await appointmentsRepo.cancelReminderForAppointment(pool, appointmentId);
  return updated;
}

async function rescheduleAppointment(pool, ctx, plan, appointmentId, bookingData, actor) {
  assertAppointmentsCalendar(plan);
  let existing;
  if (actor === "member") {
    existing = await appointmentsRepo.findAppointmentByIdForMember(
      pool,
      appointmentId,
      ctx.member_id
    );
  } else {
    existing = await appointmentsRepo.findAppointmentByIdForBranch(
      pool,
      appointmentId,
      ctx.branch_id
    );
  }
  if (!existing || !["requested", "approved"].includes(existing.status)) {
    throw makeError(APPOINTMENT_ERRORS.NOT_FOUND, "Appointment not found.");
  }

  const replacement = await requestAppointment(
    pool,
    {
      ...ctx,
      member_id: existing.member_id,
      organization_id: existing.organization_id,
      branch_id: existing.branch_id,
    },
    plan,
    {
      ...bookingData,
      member_id: existing.member_id,
      purpose: bookingData.purpose || existing.purpose,
      member_request_note: bookingData.member_request_note || existing.member_request_note,
      minister_admin_id: bookingData.minister_admin_id || existing.minister_admin_id,
    },
    {
      autoApprove: existing.status === "approved" && actor === "admin",
      rescheduleOfId: existing.id,
      excludeAppointmentId: existing.id,
    }
  );

  await appointmentsRepo.updateAppointment(pool, existing.id, existing.branch_id, {
    status: "rescheduled",
    cancelled_at: new Date(),
    cancelled_by_type: actor === "member" ? "member" : "admin",
    cancelled_by_id: actor === "member" ? ctx.member_id : ctx.admin_id,
    cancellation_reason: "Rescheduled",
  });
  await appointmentsRepo.cancelReminderForAppointment(pool, existing.id);
  return replacement;
}

async function processDueReminders(pool, ctx, plan, at) {
  assertAppointmentsCalendar(plan);
  const due = await appointmentsRepo.listDueReminders(pool, ctx.branch_id, at || new Date());
  const sent = [];
  for (const row of due) {
    await appointmentsRepo.markReminderSent(pool, row.id);
    await appointmentsRepo.updateAppointment(pool, row.appointment_id, ctx.branch_id, {
      reminder_sent_at: new Date(),
    });
    sent.push(row);
  }
  return sent;
}

async function addConfidentialNote(pool, ctx, plan, appointmentId, noteBody) {
  assertAppointmentsCalendar(plan);
  if (!canViewConfidentialNotes(ctx)) {
    throw makeError(
      APPOINTMENT_ERRORS.PERMISSION_DENIED,
      "Pastoral access required to write confidential notes."
    );
  }
  const existing = await appointmentsRepo.findAppointmentByIdForBranch(
    pool,
    appointmentId,
    ctx.branch_id
  );
  if (!existing) throw makeError(APPOINTMENT_ERRORS.NOT_FOUND, "Appointment not found.");
  return appointmentsRepo.insertConfidentialNote(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    appointment_id: appointmentId,
    note_body: noteBody,
    created_by_admin_id: ctx.admin_id,
  });
}

async function loadAppointmentDetail(pool, ctx, plan, appointmentId) {
  assertAppointmentsCalendar(plan);
  const appointment = await appointmentsRepo.findAppointmentByIdForBranch(
    pool,
    appointmentId,
    ctx.branch_id
  );
  if (!appointment) throw makeError(APPOINTMENT_ERRORS.NOT_FOUND, "Appointment not found.");
  const canViewNotes = canViewConfidentialNotes(ctx);
  const confidentialNotes = canViewNotes
    ? await appointmentsRepo.listConfidentialNotesForAppointment(
        pool,
        appointmentId,
        ctx.branch_id
      )
    : [];
  return {
    appointment,
    confidentialNotes,
    canViewConfidentialNotes: canViewNotes,
  };
}

async function loadDashboard(pool, ctx, plan) {
  assertAppointmentsCalendar(plan);
  const settings = await appointmentsRepo.getSettingsWithDefaults(pool, ctx.branch_id);
  const availability = await appointmentsRepo.listAvailabilityForBranch(pool, ctx.branch_id);
  const leave = await appointmentsRepo.listLeaveForBranch(pool, ctx.branch_id);
  const appointments = await appointmentsRepo.listAppointmentsForBranch(pool, ctx.branch_id);
  return { settings, availability, leave, appointments };
}

module.exports = {
  APPOINTMENT_ERRORS,
  assertAppointmentsCalendar,
  canViewConfidentialNotes,
  saveSettings,
  addAvailability,
  addLeave,
  requestAppointment,
  approveAppointment,
  cancelAppointment,
  rescheduleAppointment,
  processDueReminders,
  addConfidentialNote,
  loadAppointmentDetail,
  loadDashboard,
};
