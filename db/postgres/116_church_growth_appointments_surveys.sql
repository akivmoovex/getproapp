-- Growth appointments calendar + custom surveys.
-- Appointment schedule metadata is separate from confidential counselling notes.
-- Foundation: no calendar; surveys limited to standard templates (enforced in app).
-- No Network integrations. No advanced counselling-case management.

-- ---------------------------------------------------------------------------
-- Appointments
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.church_appointment_settings (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  default_duration_minutes INTEGER NOT NULL DEFAULT 30,
  buffer_minutes INTEGER NOT NULL DEFAULT 15,
  reminder_hours_before INTEGER NOT NULL DEFAULT 24,
  updated_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_appointment_settings_branch_unique UNIQUE (branch_id),
  CONSTRAINT church_appointment_settings_duration_check CHECK (default_duration_minutes BETWEEN 5 AND 480),
  CONSTRAINT church_appointment_settings_buffer_check CHECK (buffer_minutes BETWEEN 0 AND 120),
  CONSTRAINT church_appointment_settings_reminder_check CHECK (reminder_hours_before BETWEEN 1 AND 168)
);

CREATE TABLE IF NOT EXISTS public.church_appointment_availability (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  minister_admin_id INTEGER NOT NULL REFERENCES public.church_branch_admins (id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_recurring BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE,
  effective_to DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_appointment_availability_dow_check CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT church_appointment_availability_time_check CHECK (end_time > start_time),
  CONSTRAINT church_appointment_availability_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX IF NOT EXISTS idx_church_appointment_availability_minister
  ON public.church_appointment_availability (branch_id, minister_admin_id, status);

CREATE TABLE IF NOT EXISTS public.church_appointment_leave (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  minister_admin_id INTEGER NOT NULL REFERENCES public.church_branch_admins (id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_appointment_leave_range_check CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_church_appointment_leave_minister
  ON public.church_appointment_leave (branch_id, minister_admin_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS public.church_appointments (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES public.church_members (id) ON DELETE CASCADE,
  minister_admin_id INTEGER NOT NULL REFERENCES public.church_branch_admins (id) ON DELETE RESTRICT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL,
  buffer_minutes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'requested',
  purpose TEXT NOT NULL DEFAULT '',
  member_request_note TEXT NOT NULL DEFAULT '',
  cancellation_reason TEXT,
  reschedule_of_appointment_id INTEGER REFERENCES public.church_appointments (id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  approved_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  cancelled_by_type TEXT,
  cancelled_by_id INTEGER,
  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_appointments_range_check CHECK (ends_at > starts_at),
  CONSTRAINT church_appointments_status_check
    CHECK (status IN ('requested', 'approved', 'cancelled', 'completed', 'rescheduled')),
  CONSTRAINT church_appointments_cancelled_by_check
    CHECK (cancelled_by_type IS NULL OR cancelled_by_type IN ('member', 'admin'))
);

CREATE INDEX IF NOT EXISTS idx_church_appointments_branch_status
  ON public.church_appointments (branch_id, status, starts_at);

CREATE INDEX IF NOT EXISTS idx_church_appointments_minister_window
  ON public.church_appointments (minister_admin_id, starts_at, ends_at)
  WHERE status IN ('requested', 'approved');

COMMENT ON TABLE public.church_appointments IS
  'Schedule metadata only. Confidential counselling notes live in church_appointment_confidential_notes.';

CREATE TABLE IF NOT EXISTS public.church_appointment_confidential_notes (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  appointment_id INTEGER NOT NULL REFERENCES public.church_appointments (id) ON DELETE CASCADE,
  note_body TEXT NOT NULL,
  created_by_admin_id INTEGER NOT NULL REFERENCES public.church_branch_admins (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_church_appointment_confidential_notes_appt
  ON public.church_appointment_confidential_notes (appointment_id);

COMMENT ON TABLE public.church_appointment_confidential_notes IS
  'Counselling notes. Visible only to pastoral-authorised admins; schedule coordinators must not read these.';

CREATE TABLE IF NOT EXISTS public.church_appointment_reminders (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  appointment_id INTEGER NOT NULL REFERENCES public.church_appointments (id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_appointment_reminders_status_check
    CHECK (status IN ('pending', 'sent', 'cancelled')),
  CONSTRAINT church_appointment_reminders_appt_unique UNIQUE (appointment_id)
);

-- ---------------------------------------------------------------------------
-- Surveys
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.church_surveys (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  consent_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  is_template BOOLEAN NOT NULL DEFAULT false,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurrence_interval_days INTEGER,
  next_run_at TIMESTAMPTZ,
  sensitivity TEXT NOT NULL DEFAULT 'standard',
  authorised_audience TEXT NOT NULL DEFAULT 'branch_admin',
  route_on_submit TEXT NOT NULL DEFAULT 'none',
  created_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_surveys_status_check CHECK (status IN ('draft', 'active', 'closed')),
  CONSTRAINT church_surveys_sensitivity_check CHECK (sensitivity IN ('standard', 'sensitive')),
  CONSTRAINT church_surveys_audience_check
    CHECK (authorised_audience IN ('branch_admin', 'pastoral', 'supervisor')),
  CONSTRAINT church_surveys_route_check
    CHECK (route_on_submit IN ('none', 'prayer_request', 'care_case', 'appointment_request')),
  CONSTRAINT church_surveys_recurrence_check
    CHECK (
      (is_recurring = false AND recurrence_interval_days IS NULL)
      OR (is_recurring = true AND recurrence_interval_days BETWEEN 1 AND 365)
    )
);

CREATE INDEX IF NOT EXISTS idx_church_surveys_branch_status
  ON public.church_surveys (branch_id, status);

CREATE TABLE IF NOT EXISTS public.church_survey_questions (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  survey_id INTEGER NOT NULL REFERENCES public.church_surveys (id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  question_key TEXT NOT NULL,
  prompt TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'text',
  options_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_required BOOLEAN NOT NULL DEFAULT true,
  branch_parent_question_id INTEGER REFERENCES public.church_survey_questions (id) ON DELETE SET NULL,
  branch_equals_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_survey_questions_type_check
    CHECK (question_type IN ('text', 'single_choice', 'multi_choice', 'yes_no')),
  CONSTRAINT church_survey_questions_survey_key_unique UNIQUE (survey_id, question_key)
);

CREATE INDEX IF NOT EXISTS idx_church_survey_questions_survey
  ON public.church_survey_questions (survey_id, sort_order);

CREATE TABLE IF NOT EXISTS public.church_survey_response_sessions (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  survey_id INTEGER NOT NULL REFERENCES public.church_surveys (id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES public.church_members (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress',
  consent_accepted_at TIMESTAMPTZ,
  current_question_id INTEGER REFERENCES public.church_survey_questions (id) ON DELETE SET NULL,
  linked_prayer_request_id INTEGER,
  linked_pastoral_case_id INTEGER,
  linked_appointment_id INTEGER,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_survey_response_sessions_status_check
    CHECK (status IN ('in_progress', 'submitted'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_church_survey_sessions_open_member
  ON public.church_survey_response_sessions (survey_id, member_id)
  WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS idx_church_survey_sessions_branch
  ON public.church_survey_response_sessions (branch_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.church_survey_answers (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  session_id INTEGER NOT NULL REFERENCES public.church_survey_response_sessions (id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES public.church_survey_questions (id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL DEFAULT '',
  answer_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_survey_answers_session_question_unique UNIQUE (session_id, question_id)
);

COMMENT ON TABLE public.church_survey_response_sessions IS
  'Save-and-resume survey sessions. Sensitive responses respect survey.authorised_audience.';
