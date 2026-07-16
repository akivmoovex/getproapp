"use strict";

async function insertSurvey(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_surveys (
       organization_id, branch_id, title, description, consent_text, status,
       is_template, is_recurring, recurrence_interval_days, next_run_at,
       sensitivity, authorised_audience, route_on_submit, created_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.title,
      fields.description || "",
      fields.consent_text || "",
      fields.status || "draft",
      fields.is_template === true,
      fields.is_recurring === true,
      fields.recurrence_interval_days ?? null,
      fields.next_run_at || null,
      fields.sensitivity || "standard",
      fields.authorised_audience || "branch_admin",
      fields.route_on_submit || "none",
      fields.created_by_admin_id ?? null,
    ]
  );
  return r.rows[0];
}

async function updateSurvey(pool, surveyId, branchId, fields) {
  const r = await pool.query(
    `UPDATE public.church_surveys
     SET title = COALESCE($3, title),
         description = COALESCE($4, description),
         consent_text = COALESCE($5, consent_text),
         status = COALESCE($6, status),
         is_recurring = COALESCE($7, is_recurring),
         recurrence_interval_days = COALESCE($8, recurrence_interval_days),
         next_run_at = COALESCE($9, next_run_at),
         sensitivity = COALESCE($10, sensitivity),
         authorised_audience = COALESCE($11, authorised_audience),
         route_on_submit = COALESCE($12, route_on_submit),
         updated_at = now()
     WHERE id = $1 AND branch_id = $2
     RETURNING *`,
    [
      surveyId,
      branchId,
      fields.title ?? null,
      fields.description ?? null,
      fields.consent_text ?? null,
      fields.status ?? null,
      fields.is_recurring ?? null,
      fields.recurrence_interval_days ?? null,
      fields.next_run_at ?? null,
      fields.sensitivity ?? null,
      fields.authorised_audience ?? null,
      fields.route_on_submit ?? null,
    ]
  );
  return r.rows[0] ?? null;
}

async function findSurveyByIdForBranch(pool, surveyId, branchId) {
  const r = await pool.query(
    `SELECT * FROM public.church_surveys WHERE id = $1 AND branch_id = $2 LIMIT 1`,
    [surveyId, branchId]
  );
  return r.rows[0] ?? null;
}

async function listSurveysForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT s.*,
            (SELECT COUNT(*)::int FROM public.church_survey_response_sessions rs
             WHERE rs.survey_id = s.id AND rs.status = 'submitted') AS response_count
     FROM public.church_surveys s
     WHERE s.branch_id = $1
     ORDER BY s.updated_at DESC`,
    [branchId]
  );
  return r.rows;
}

async function listActiveSurveysForMember(pool, branchId) {
  const r = await pool.query(
    `SELECT * FROM public.church_surveys
     WHERE branch_id = $1 AND status = 'active'
     ORDER BY title ASC`,
    [branchId]
  );
  return r.rows;
}

async function insertQuestion(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_survey_questions (
       organization_id, branch_id, survey_id, sort_order, question_key, prompt,
       question_type, options_json, is_required, branch_parent_question_id, branch_equals_value
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.survey_id,
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

async function listQuestionsForSurvey(pool, surveyId) {
  const r = await pool.query(
    `SELECT * FROM public.church_survey_questions
     WHERE survey_id = $1
     ORDER BY sort_order ASC, id ASC`,
    [surveyId]
  );
  return r.rows;
}

async function findOpenSessionForMember(pool, surveyId, memberId) {
  const r = await pool.query(
    `SELECT * FROM public.church_survey_response_sessions
     WHERE survey_id = $1 AND member_id = $2 AND status = 'in_progress'
     LIMIT 1`,
    [surveyId, memberId]
  );
  return r.rows[0] ?? null;
}

async function findSessionByIdForBranch(pool, sessionId, branchId) {
  const r = await pool.query(
    `SELECT rs.*, s.title AS survey_title, s.sensitivity, s.authorised_audience,
            s.consent_text, s.route_on_submit, m.full_name AS member_name
     FROM public.church_survey_response_sessions rs
     INNER JOIN public.church_surveys s ON s.id = rs.survey_id
     INNER JOIN public.church_members m ON m.id = rs.member_id
     WHERE rs.id = $1 AND rs.branch_id = $2
     LIMIT 1`,
    [sessionId, branchId]
  );
  return r.rows[0] ?? null;
}

async function findSessionByIdForMember(pool, sessionId, memberId) {
  const r = await pool.query(
    `SELECT rs.*, s.title AS survey_title, s.consent_text, s.status AS survey_status
     FROM public.church_survey_response_sessions rs
     INNER JOIN public.church_surveys s ON s.id = rs.survey_id
     WHERE rs.id = $1 AND rs.member_id = $2
     LIMIT 1`,
    [sessionId, memberId]
  );
  return r.rows[0] ?? null;
}

async function insertSession(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_survey_response_sessions (
       organization_id, branch_id, survey_id, member_id, status, consent_accepted_at
     ) VALUES ($1, $2, $3, $4, 'in_progress', $5)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.survey_id,
      fields.member_id,
      fields.consent_accepted_at || null,
    ]
  );
  return r.rows[0];
}

async function updateSession(pool, sessionId, fields) {
  const r = await pool.query(
    `UPDATE public.church_survey_response_sessions
     SET status = COALESCE($2, status),
         consent_accepted_at = COALESCE($3, consent_accepted_at),
         current_question_id = COALESCE($4, current_question_id),
         linked_prayer_request_id = COALESCE($5, linked_prayer_request_id),
         linked_pastoral_case_id = COALESCE($6, linked_pastoral_case_id),
         linked_appointment_id = COALESCE($7, linked_appointment_id),
         submitted_at = COALESCE($8, submitted_at),
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      sessionId,
      fields.status ?? null,
      fields.consent_accepted_at ?? null,
      fields.current_question_id ?? null,
      fields.linked_prayer_request_id ?? null,
      fields.linked_pastoral_case_id ?? null,
      fields.linked_appointment_id ?? null,
      fields.submitted_at ?? null,
    ]
  );
  return r.rows[0] ?? null;
}

async function upsertAnswer(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_survey_answers (
       organization_id, branch_id, session_id, question_id, answer_text, answer_json
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (session_id, question_id) DO UPDATE SET
       answer_text = EXCLUDED.answer_text,
       answer_json = EXCLUDED.answer_json,
       updated_at = now()
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.session_id,
      fields.question_id,
      fields.answer_text || "",
      JSON.stringify(fields.answer_json || {}),
    ]
  );
  return r.rows[0];
}

async function listAnswersForSession(pool, sessionId) {
  const r = await pool.query(
    `SELECT a.*, q.prompt, q.question_key, q.question_type
     FROM public.church_survey_answers a
     INNER JOIN public.church_survey_questions q ON q.id = a.question_id
     WHERE a.session_id = $1
     ORDER BY q.sort_order ASC`,
    [sessionId]
  );
  return r.rows;
}

async function listSubmittedSessionsForSurvey(pool, surveyId, branchId) {
  const r = await pool.query(
    `SELECT rs.*, m.full_name AS member_name
     FROM public.church_survey_response_sessions rs
     INNER JOIN public.church_members m ON m.id = rs.member_id
     WHERE rs.survey_id = $1 AND rs.branch_id = $2 AND rs.status = 'submitted'
     ORDER BY rs.submitted_at DESC`,
    [surveyId, branchId]
  );
  return r.rows;
}

async function listDueRecurringSurveys(pool, at) {
  const when = at instanceof Date ? at : new Date();
  const r = await pool.query(
    `SELECT * FROM public.church_surveys
     WHERE is_recurring = true AND status = 'active'
       AND next_run_at IS NOT NULL AND next_run_at <= $1`,
    [when]
  );
  return r.rows;
}

module.exports = {
  insertSurvey,
  updateSurvey,
  findSurveyByIdForBranch,
  listSurveysForBranch,
  listActiveSurveysForMember,
  insertQuestion,
  listQuestionsForSurvey,
  findOpenSessionForMember,
  findSessionByIdForBranch,
  findSessionByIdForMember,
  insertSession,
  updateSession,
  upsertAnswer,
  listAnswersForSession,
  listSubmittedSessionsForSurvey,
  listDueRecurringSurveys,
};
