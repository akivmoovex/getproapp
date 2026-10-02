"use strict";

const DEFAULT_SETTINGS = Object.freeze({
  default_duration_minutes: 30,
  buffer_minutes: 15,
  reminder_hours_before: 24,
});

async function getSettingsWithDefaults(pool, branchId) {
  const r = await pool.query(
    `SELECT * FROM public.church_appointment_settings WHERE branch_id = $1 LIMIT 1`,
    [branchId]
  );
  if (!r.rows[0]) return { ...DEFAULT_SETTINGS, branch_id: branchId };
  return r.rows[0];
}

async function upsertSettings(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_appointment_settings (
       organization_id, branch_id, default_duration_minutes, buffer_minutes,
       reminder_hours_before, updated_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (branch_id) DO UPDATE SET
       default_duration_minutes = EXCLUDED.default_duration_minutes,
       buffer_minutes = EXCLUDED.buffer_minutes,
       reminder_hours_before = EXCLUDED.reminder_hours_before,
       updated_by_admin_id = EXCLUDED.updated_by_admin_id,
       updated_at = now()
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.default_duration_minutes ?? 30,
      fields.buffer_minutes ?? 15,
      fields.reminder_hours_before ?? 24,
      fields.updated_by_admin_id ?? null,
    ]
  );
  return r.rows[0];
}

async function listAvailabilityForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT a.*, ba.full_name AS minister_name
     FROM public.church_appointment_availability a
     INNER JOIN public.church_branch_admins ba ON ba.id = a.minister_admin_id
     WHERE a.branch_id = $1
     ORDER BY ba.full_name ASC, a.day_of_week ASC, a.start_time ASC`,
    [branchId]
  );
  return r.rows;
}

async function insertAvailability(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_appointment_availability (
       organization_id, branch_id, minister_admin_id, day_of_week,
       start_time, end_time, is_recurring, effective_from, effective_to, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.minister_admin_id,
      fields.day_of_week,
      fields.start_time,
      fields.end_time,
      fields.is_recurring !== false,
      fields.effective_from || null,
      fields.effective_to || null,
    ]
  );
  return r.rows[0];
}

async function listLeaveForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT l.*, ba.full_name AS minister_name
     FROM public.church_appointment_leave l
     INNER JOIN public.church_branch_admins ba ON ba.id = l.minister_admin_id
     WHERE l.branch_id = $1 AND l.ends_at >= now()
     ORDER BY l.starts_at ASC`,
    [branchId]
  );
  return r.rows;
}

async function insertLeave(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_appointment_leave (
       organization_id, branch_id, minister_admin_id, starts_at, ends_at, reason, created_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.minister_admin_id,
      fields.starts_at,
      fields.ends_at,
      fields.reason || "",
      fields.created_by_admin_id ?? null,
    ]
  );
  return r.rows[0];
}

async function findLeaveOverlap(pool, ministerAdminId, startsAt, endsAt) {
  const r = await pool.query(
    `SELECT * FROM public.church_appointment_leave
     WHERE minister_admin_id = $1
       AND starts_at < $3 AND ends_at > $2
     LIMIT 1`,
    [ministerAdminId, startsAt, endsAt]
  );
  return r.rows[0] ?? null;
}

async function findConflictingAppointment(pool, ministerAdminId, startsAt, endsAt, bufferMinutes, excludeId) {
  const bufferMs = Number(bufferMinutes || 0) * 60 * 1000;
  const windowStart = new Date(new Date(startsAt).getTime() - bufferMs);
  const windowEnd = new Date(new Date(endsAt).getTime() + bufferMs);
  const r = await pool.query(
    `SELECT * FROM public.church_appointments
     WHERE minister_admin_id = $1
       AND status IN ('requested', 'approved')
       AND ($4::int IS NULL OR id <> $4)
       AND starts_at < $3 AND ends_at > $2
     LIMIT 1`,
    [ministerAdminId, windowStart, windowEnd, excludeId || null]
  );
  return r.rows[0] ?? null;
}

async function insertAppointment(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_appointments (
       organization_id, branch_id, member_id, minister_admin_id,
       starts_at, ends_at, duration_minutes, buffer_minutes, status,
       purpose, member_request_note, reschedule_of_appointment_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.member_id,
      fields.minister_admin_id,
      fields.starts_at,
      fields.ends_at,
      fields.duration_minutes,
      fields.buffer_minutes ?? 0,
      fields.status || "requested",
      fields.purpose || "",
      fields.member_request_note || "",
      fields.reschedule_of_appointment_id || null,
    ]
  );
  return r.rows[0];
}

async function findAppointmentByIdForBranch(pool, appointmentId, branchId) {
  const r = await pool.query(
    `SELECT a.*, m.full_name AS member_name, ba.full_name AS minister_name
     FROM public.church_appointments a
     INNER JOIN public.church_members m ON m.id = a.member_id
     INNER JOIN public.church_branch_admins ba ON ba.id = a.minister_admin_id
     WHERE a.id = $1 AND a.branch_id = $2
     LIMIT 1`,
    [appointmentId, branchId]
  );
  return r.rows[0] ?? null;
}

async function findAppointmentByIdForMember(pool, appointmentId, memberId) {
  const r = await pool.query(
    `SELECT a.*, ba.full_name AS minister_name
     FROM public.church_appointments a
     INNER JOIN public.church_branch_admins ba ON ba.id = a.minister_admin_id
     WHERE a.id = $1 AND a.member_id = $2
     LIMIT 1`,
    [appointmentId, memberId]
  );
  return r.rows[0] ?? null;
}

async function listAppointmentsForBranch(pool, branchId, opts = {}) {
  const statuses = opts.statuses || ["requested", "approved"];
  const r = await pool.query(
    `SELECT a.*, m.full_name AS member_name, ba.full_name AS minister_name
     FROM public.church_appointments a
     INNER JOIN public.church_members m ON m.id = a.member_id
     INNER JOIN public.church_branch_admins ba ON ba.id = a.minister_admin_id
     WHERE a.branch_id = $1 AND a.status = ANY($2::text[])
     ORDER BY a.starts_at ASC
     LIMIT $3`,
    [branchId, statuses, Math.min(Math.max(Number(opts.limit) || 100, 1), 300)]
  );
  return r.rows;
}

async function listAppointmentsForMember(pool, memberId) {
  const r = await pool.query(
    `SELECT a.*, ba.full_name AS minister_name
     FROM public.church_appointments a
     INNER JOIN public.church_branch_admins ba ON ba.id = a.minister_admin_id
     WHERE a.member_id = $1 AND a.status IN ('requested', 'approved')
     ORDER BY a.starts_at ASC`,
    [memberId]
  );
  return r.rows;
}

async function updateAppointment(pool, appointmentId, branchId, fields) {
  const r = await pool.query(
    `UPDATE public.church_appointments
     SET status = COALESCE($3, status),
         approved_at = COALESCE($4, approved_at),
         approved_by_admin_id = COALESCE($5, approved_by_admin_id),
         cancelled_at = COALESCE($6, cancelled_at),
         cancelled_by_type = COALESCE($7, cancelled_by_type),
         cancelled_by_id = COALESCE($8, cancelled_by_id),
         cancellation_reason = COALESCE($9, cancellation_reason),
         reminder_sent_at = COALESCE($10, reminder_sent_at),
         starts_at = COALESCE($11, starts_at),
         ends_at = COALESCE($12, ends_at),
         updated_at = now()
     WHERE id = $1 AND branch_id = $2
     RETURNING *`,
    [
      appointmentId,
      branchId,
      fields.status ?? null,
      fields.approved_at ?? null,
      fields.approved_by_admin_id ?? null,
      fields.cancelled_at ?? null,
      fields.cancelled_by_type ?? null,
      fields.cancelled_by_id ?? null,
      fields.cancellation_reason ?? null,
      fields.reminder_sent_at ?? null,
      fields.starts_at ?? null,
      fields.ends_at ?? null,
    ]
  );
  return r.rows[0] ?? null;
}

async function insertConfidentialNote(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_appointment_confidential_notes (
       organization_id, branch_id, appointment_id, note_body, created_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.appointment_id,
      fields.note_body,
      fields.created_by_admin_id,
    ]
  );
  return r.rows[0];
}

async function listConfidentialNotesForAppointment(pool, appointmentId, branchId) {
  const r = await pool.query(
    `SELECT n.*, ba.full_name AS author_name
     FROM public.church_appointment_confidential_notes n
     INNER JOIN public.church_branch_admins ba ON ba.id = n.created_by_admin_id
     WHERE n.appointment_id = $1 AND n.branch_id = $2
     ORDER BY n.created_at ASC`,
    [appointmentId, branchId]
  );
  return r.rows;
}

async function upsertReminder(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_appointment_reminders (
       organization_id, branch_id, appointment_id, remind_at, status
     ) VALUES ($1, $2, $3, $4, 'pending')
     ON CONFLICT (appointment_id) DO UPDATE SET
       remind_at = EXCLUDED.remind_at,
       status = 'pending',
       sent_at = NULL
     RETURNING *`,
    [fields.organization_id, fields.branch_id, fields.appointment_id, fields.remind_at]
  );
  return r.rows[0];
}

async function listDueReminders(pool, branchId, at) {
  const when = at instanceof Date ? at : new Date();
  const r = await pool.query(
    `SELECT r.*, a.member_id, a.starts_at, a.purpose, m.full_name AS member_name, m.email AS member_email
     FROM public.church_appointment_reminders r
     INNER JOIN public.church_appointments a ON a.id = r.appointment_id
     INNER JOIN public.church_members m ON m.id = a.member_id
     WHERE r.branch_id = $1 AND r.status = 'pending' AND r.remind_at <= $2
       AND a.status = 'approved'
     ORDER BY r.remind_at ASC`,
    [branchId, when]
  );
  return r.rows;
}

async function markReminderSent(pool, reminderId) {
  const r = await pool.query(
    `UPDATE public.church_appointment_reminders
     SET status = 'sent', sent_at = now()
     WHERE id = $1
     RETURNING *`,
    [reminderId]
  );
  return r.rows[0] ?? null;
}

async function cancelReminderForAppointment(pool, appointmentId) {
  const r = await pool.query(
    `UPDATE public.church_appointment_reminders
     SET status = 'cancelled'
     WHERE appointment_id = $1 AND status = 'pending'
     RETURNING *`,
    [appointmentId]
  );
  return r.rows;
}

module.exports = {
  DEFAULT_SETTINGS,
  getSettingsWithDefaults,
  upsertSettings,
  listAvailabilityForBranch,
  insertAvailability,
  listLeaveForBranch,
  insertLeave,
  findLeaveOverlap,
  findConflictingAppointment,
  insertAppointment,
  findAppointmentByIdForBranch,
  findAppointmentByIdForMember,
  listAppointmentsForBranch,
  listAppointmentsForMember,
  updateAppointment,
  insertConfidentialNote,
  listConfidentialNotesForAppointment,
  upsertReminder,
  listDueReminders,
  markReminderSent,
  cancelReminderForAppointment,
};
