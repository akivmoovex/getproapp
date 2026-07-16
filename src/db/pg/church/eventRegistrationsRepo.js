"use strict";

async function countActiveRegistrations(pool, eventId) {
  const r = await pool.query(
    `SELECT COALESCE(SUM(party_size), 0)::int AS n
     FROM public.church_event_registrations
     WHERE event_id = $1
       AND status IN ('pending', 'registered', 'waitlisted', 'approved', 'checked_in')`,
    [eventId]
  );
  return r.rows[0].n;
}

async function findOpenRegistrationForMember(pool, eventId, memberId) {
  const r = await pool.query(
    `SELECT * FROM public.church_event_registrations
     WHERE event_id = $1 AND member_id = $2
       AND status IN ('pending', 'registered', 'waitlisted', 'approved', 'checked_in')
     LIMIT 1`,
    [eventId, memberId]
  );
  return r.rows[0] ?? null;
}

async function insertRegistration(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_event_registrations (
       organization_id, branch_id, event_id, member_id, visitor_name, visitor_email,
       visitor_phone, status, party_size, parent_registration_id, consent_accepted_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.event_id,
      fields.member_id ?? null,
      fields.visitor_name || "",
      fields.visitor_email || "",
      fields.visitor_phone || "",
      fields.status || "registered",
      fields.party_size ?? 1,
      fields.parent_registration_id ?? null,
      fields.consent_accepted_at || null,
    ]
  );
  return r.rows[0];
}

async function findRegistrationByIdForBranch(pool, registrationId, branchId) {
  const r = await pool.query(
    `SELECT r.*, m.full_name AS member_name, e.title AS event_title
     FROM public.church_event_registrations r
     LEFT JOIN public.church_members m ON m.id = r.member_id
     INNER JOIN public.church_events e ON e.id = r.event_id
     WHERE r.id = $1 AND r.branch_id = $2
     LIMIT 1`,
    [registrationId, branchId]
  );
  return r.rows[0] ?? null;
}

async function listRegistrationsForEvent(pool, eventId) {
  const r = await pool.query(
    `SELECT r.*, m.full_name AS member_name
     FROM public.church_event_registrations r
     LEFT JOIN public.church_members m ON m.id = r.member_id
     WHERE r.event_id = $1
     ORDER BY r.created_at ASC`,
    [eventId]
  );
  return r.rows;
}

async function updateRegistration(pool, registrationId, fields) {
  const r = await pool.query(
    `UPDATE public.church_event_registrations
     SET status = COALESCE($2, status),
         approved_at = COALESCE($3, approved_at),
         approved_by_admin_id = COALESCE($4, approved_by_admin_id),
         cancelled_at = COALESCE($5, cancelled_at),
         cancelled_by_type = COALESCE($6, cancelled_by_type),
         cancelled_by_id = COALESCE($7, cancelled_by_id),
         cancellation_reason = COALESCE($8, cancellation_reason),
         checked_in_at = COALESCE($9, checked_in_at),
         no_show_marked_at = COALESCE($10, no_show_marked_at),
         no_show_marked_by_admin_id = COALESCE($11, no_show_marked_by_admin_id),
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      registrationId,
      fields.status ?? null,
      fields.approved_at ?? null,
      fields.approved_by_admin_id ?? null,
      fields.cancelled_at ?? null,
      fields.cancelled_by_type ?? null,
      fields.cancelled_by_id ?? null,
      fields.cancellation_reason ?? null,
      fields.checked_in_at ?? null,
      fields.no_show_marked_at ?? null,
      fields.no_show_marked_by_admin_id ?? null,
    ]
  );
  return r.rows[0] ?? null;
}

async function insertCompanion(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_event_registration_companions (
       organization_id, branch_id, registration_id, full_name, relationship, age_group
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.registration_id,
      fields.full_name,
      fields.relationship || "",
      fields.age_group || "",
    ]
  );
  return r.rows[0];
}

async function listCompanionsForRegistration(pool, registrationId) {
  const r = await pool.query(
    `SELECT * FROM public.church_event_registration_companions
     WHERE registration_id = $1 ORDER BY id ASC`,
    [registrationId]
  );
  return r.rows;
}

async function insertAnswer(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_event_registration_answers (
       organization_id, branch_id, registration_id, question_id, answer_text
     ) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (registration_id, question_id) DO UPDATE SET answer_text = EXCLUDED.answer_text
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.registration_id,
      fields.question_id,
      fields.answer_text || "",
    ]
  );
  return r.rows[0];
}

async function insertCheckIn(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_event_check_ins (
       organization_id, branch_id, event_id, registration_id, member_id,
       visitor_name, method, checked_in_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.event_id,
      fields.registration_id ?? null,
      fields.member_id ?? null,
      fields.visitor_name || "",
      fields.method || "manual",
      fields.checked_in_by_admin_id ?? null,
    ]
  );
  return r.rows[0];
}

async function listCheckInsForEvent(pool, eventId) {
  const r = await pool.query(
    `SELECT c.*, m.full_name AS member_name
     FROM public.church_event_check_ins c
     LEFT JOIN public.church_members m ON m.id = c.member_id
     WHERE c.event_id = $1
     ORDER BY c.checked_in_at DESC`,
    [eventId]
  );
  return r.rows;
}

async function insertForm(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_event_registration_forms (
       organization_id, branch_id, title, description, consent_text, created_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.title,
      fields.description || "",
      fields.consent_text || "",
      fields.created_by_admin_id ?? null,
    ]
  );
  return r.rows[0];
}

async function listFormsForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT * FROM public.church_event_registration_forms
     WHERE branch_id = $1 AND status = 'active'
     ORDER BY title ASC`,
    [branchId]
  );
  return r.rows;
}

async function findFormByIdForBranch(pool, formId, branchId) {
  const r = await pool.query(
    `SELECT * FROM public.church_event_registration_forms
     WHERE id = $1 AND branch_id = $2 LIMIT 1`,
    [formId, branchId]
  );
  return r.rows[0] ?? null;
}

async function insertQuestion(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_event_form_questions (
       organization_id, branch_id, form_id, sort_order, question_key, prompt,
       question_type, options_json, is_required, branch_parent_question_id, branch_equals_value
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.form_id,
      fields.sort_order ?? 0,
      fields.question_key,
      fields.prompt,
      fields.question_type || "text",
      JSON.stringify(fields.options || []),
      fields.is_required !== false,
      fields.branch_parent_question_id || null,
      fields.branch_equals_value || null,
    ]
  );
  return r.rows[0];
}

async function listQuestionsForForm(pool, formId) {
  const r = await pool.query(
    `SELECT * FROM public.church_event_form_questions
     WHERE form_id = $1 ORDER BY sort_order ASC, id ASC`,
    [formId]
  );
  return r.rows;
}

async function updateEventAdvancedSettings(pool, eventId, branchId, fields) {
  const r = await pool.query(
    `UPDATE public.church_events
     SET capacity = CASE WHEN $3::boolean THEN $4::int ELSE capacity END,
         registration_enabled = CASE WHEN $5::boolean THEN $6::boolean ELSE registration_enabled END,
         check_in_enabled = CASE WHEN $7::boolean THEN $8::boolean ELSE check_in_enabled END,
         registration_opens_at = CASE WHEN $9::boolean THEN $10::timestamptz ELSE registration_opens_at END,
         registration_closes_at = CASE WHEN $11::boolean THEN $12::timestamptz ELSE registration_closes_at END,
         requires_approval = CASE WHEN $13::boolean THEN $14::boolean ELSE requires_approval END,
         allow_companions = CASE WHEN $15::boolean THEN $16::boolean ELSE allow_companions END,
         max_companions = CASE WHEN $17::boolean THEN $18::int ELSE max_companions END,
         registration_form_id = CASE WHEN $19::boolean THEN $20::int ELSE registration_form_id END,
         feedback_enabled = CASE WHEN $21::boolean THEN $22::boolean ELSE feedback_enabled END,
         updated_at = now()
     WHERE id = $1 AND branch_id = $2
     RETURNING *`,
    [
      eventId,
      branchId,
      Object.prototype.hasOwnProperty.call(fields, "capacity"),
      fields.capacity ?? null,
      Object.prototype.hasOwnProperty.call(fields, "registration_enabled"),
      fields.registration_enabled === true,
      Object.prototype.hasOwnProperty.call(fields, "check_in_enabled"),
      fields.check_in_enabled === true,
      Object.prototype.hasOwnProperty.call(fields, "registration_opens_at"),
      fields.registration_opens_at ?? null,
      Object.prototype.hasOwnProperty.call(fields, "registration_closes_at"),
      fields.registration_closes_at ?? null,
      Object.prototype.hasOwnProperty.call(fields, "requires_approval"),
      fields.requires_approval === true,
      Object.prototype.hasOwnProperty.call(fields, "allow_companions"),
      fields.allow_companions === true,
      Object.prototype.hasOwnProperty.call(fields, "max_companions"),
      fields.max_companions ?? 0,
      Object.prototype.hasOwnProperty.call(fields, "registration_form_id"),
      fields.registration_form_id ?? null,
      Object.prototype.hasOwnProperty.call(fields, "feedback_enabled"),
      fields.feedback_enabled === true,
    ]
  );
  return r.rows[0] ?? null;
}

async function insertVolunteerNeed(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_event_volunteer_needs (
       organization_id, branch_id, event_id, role_name, slots_needed, notes, assigned_member_id, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.event_id,
      fields.role_name,
      fields.slots_needed ?? 1,
      fields.notes || "",
      fields.assigned_member_id ?? null,
      fields.assigned_member_id ? "filled" : "open",
    ]
  );
  return r.rows[0];
}

async function listVolunteerNeedsForEvent(pool, eventId) {
  const r = await pool.query(
    `SELECT v.*, m.full_name AS assigned_member_name
     FROM public.church_event_volunteer_needs v
     LEFT JOIN public.church_members m ON m.id = v.assigned_member_id
     WHERE v.event_id = $1
     ORDER BY v.id ASC`,
    [eventId]
  );
  return r.rows;
}

async function insertFeedback(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_event_feedback (
       organization_id, branch_id, event_id, registration_id, member_id, rating, comments
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.event_id,
      fields.registration_id ?? null,
      fields.member_id ?? null,
      fields.rating ?? null,
      fields.comments || "",
    ]
  );
  return r.rows[0];
}

async function insertVisitorFollowUp(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_event_visitor_follow_ups (
       organization_id, branch_id, event_id, registration_id, visitor_name,
       visitor_email, visitor_phone, notes, assigned_admin_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.event_id,
      fields.registration_id ?? null,
      fields.visitor_name || "",
      fields.visitor_email || "",
      fields.visitor_phone || "",
      fields.notes || "",
      fields.assigned_admin_id ?? null,
    ]
  );
  return r.rows[0];
}

async function listVisitorFollowUpsForEvent(pool, eventId) {
  const r = await pool.query(
    `SELECT * FROM public.church_event_visitor_follow_ups
     WHERE event_id = $1 ORDER BY created_at DESC`,
    [eventId]
  );
  return r.rows;
}

module.exports = {
  countActiveRegistrations,
  findOpenRegistrationForMember,
  insertRegistration,
  findRegistrationByIdForBranch,
  listRegistrationsForEvent,
  updateRegistration,
  insertCompanion,
  listCompanionsForRegistration,
  insertAnswer,
  insertCheckIn,
  listCheckInsForEvent,
  insertForm,
  listFormsForBranch,
  findFormByIdForBranch,
  insertQuestion,
  listQuestionsForForm,
  updateEventAdvancedSettings,
  insertVolunteerNeed,
  listVolunteerNeedsForEvent,
  insertFeedback,
  insertVisitorFollowUp,
  listVisitorFollowUpsForEvent,
};
