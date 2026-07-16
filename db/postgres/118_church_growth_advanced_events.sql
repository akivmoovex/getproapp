-- Foundation: basic event registration, capacity, check-in.
-- Growth: reusable forms, conditional questions, waitlist, registration window,
-- approval, cancellation, companions, volunteer needs, no-show, feedback, visitor follow-up.
-- No paid events. No Network tools. No fabricated transport/accommodation logistics.

ALTER TABLE public.church_events
  ADD COLUMN IF NOT EXISTS capacity INTEGER,
  ADD COLUMN IF NOT EXISTS registration_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS check_in_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS registration_opens_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS registration_closes_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_companions BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_companions INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS registration_form_id INTEGER,
  ADD COLUMN IF NOT EXISTS feedback_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.church_events
  DROP CONSTRAINT IF EXISTS church_events_capacity_check;

ALTER TABLE public.church_events
  ADD CONSTRAINT church_events_capacity_check
  CHECK (capacity IS NULL OR capacity >= 1);

ALTER TABLE public.church_events
  DROP CONSTRAINT IF EXISTS church_events_max_companions_check;

ALTER TABLE public.church_events
  ADD CONSTRAINT church_events_max_companions_check
  CHECK (max_companions >= 0 AND max_companions <= 20);

CREATE TABLE IF NOT EXISTS public.church_event_registration_forms (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  consent_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_event_registration_forms_status_check CHECK (status IN ('active', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_church_event_registration_forms_branch
  ON public.church_event_registration_forms (branch_id, status);

ALTER TABLE public.church_events
  DROP CONSTRAINT IF EXISTS church_events_registration_form_fk;

ALTER TABLE public.church_events
  ADD CONSTRAINT church_events_registration_form_fk
  FOREIGN KEY (registration_form_id)
  REFERENCES public.church_event_registration_forms (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.church_event_form_questions (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  form_id INTEGER NOT NULL REFERENCES public.church_event_registration_forms (id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  question_key TEXT NOT NULL,
  prompt TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'text',
  options_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_required BOOLEAN NOT NULL DEFAULT true,
  branch_parent_question_id INTEGER REFERENCES public.church_event_form_questions (id) ON DELETE SET NULL,
  branch_equals_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_event_form_questions_type_check
    CHECK (question_type IN ('text', 'single_choice', 'yes_no', 'file_note')),
  CONSTRAINT church_event_form_questions_form_key_unique UNIQUE (form_id, question_key)
);

CREATE INDEX IF NOT EXISTS idx_church_event_form_questions_form
  ON public.church_event_form_questions (form_id, sort_order);

CREATE TABLE IF NOT EXISTS public.church_event_registrations (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES public.church_events (id) ON DELETE CASCADE,
  member_id INTEGER REFERENCES public.church_members (id) ON DELETE SET NULL,
  visitor_name TEXT NOT NULL DEFAULT '',
  visitor_email TEXT NOT NULL DEFAULT '',
  visitor_phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'registered',
  party_size INTEGER NOT NULL DEFAULT 1,
  parent_registration_id INTEGER REFERENCES public.church_event_registrations (id) ON DELETE CASCADE,
  consent_accepted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  cancelled_by_type TEXT,
  cancelled_by_id INTEGER,
  cancellation_reason TEXT,
  checked_in_at TIMESTAMPTZ,
  no_show_marked_at TIMESTAMPTZ,
  no_show_marked_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_event_registrations_status_check
    CHECK (status IN ('pending', 'registered', 'waitlisted', 'approved', 'cancelled', 'checked_in', 'no_show')),
  CONSTRAINT church_event_registrations_party_check CHECK (party_size >= 1 AND party_size <= 50),
  CONSTRAINT church_event_registrations_person_check
    CHECK (member_id IS NOT NULL OR length(trim(visitor_name)) > 0),
  CONSTRAINT church_event_registrations_cancelled_by_check
    CHECK (cancelled_by_type IS NULL OR cancelled_by_type IN ('member', 'admin', 'visitor'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_church_event_registrations_open_member
  ON public.church_event_registrations (event_id, member_id)
  WHERE member_id IS NOT NULL
    AND status IN ('pending', 'registered', 'waitlisted', 'approved', 'checked_in');

CREATE INDEX IF NOT EXISTS idx_church_event_registrations_event_status
  ON public.church_event_registrations (event_id, status);

CREATE TABLE IF NOT EXISTS public.church_event_registration_answers (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  registration_id INTEGER NOT NULL REFERENCES public.church_event_registrations (id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES public.church_event_form_questions (id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_event_registration_answers_unique UNIQUE (registration_id, question_id)
);

CREATE TABLE IF NOT EXISTS public.church_event_registration_companions (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  registration_id INTEGER NOT NULL REFERENCES public.church_event_registrations (id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  relationship TEXT NOT NULL DEFAULT '',
  age_group TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.church_event_check_ins (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES public.church_events (id) ON DELETE CASCADE,
  registration_id INTEGER REFERENCES public.church_event_registrations (id) ON DELETE SET NULL,
  member_id INTEGER REFERENCES public.church_members (id) ON DELETE SET NULL,
  visitor_name TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT 'manual',
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_in_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  CONSTRAINT church_event_check_ins_method_check CHECK (method IN ('manual', 'registration'))
);

CREATE INDEX IF NOT EXISTS idx_church_event_check_ins_event
  ON public.church_event_check_ins (event_id, checked_in_at DESC);

CREATE TABLE IF NOT EXISTS public.church_event_volunteer_needs (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES public.church_events (id) ON DELETE CASCADE,
  role_name TEXT NOT NULL,
  slots_needed INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  assigned_member_id INTEGER REFERENCES public.church_members (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_event_volunteer_needs_slots_check CHECK (slots_needed >= 1),
  CONSTRAINT church_event_volunteer_needs_status_check
    CHECK (status IN ('open', 'filled', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS public.church_event_feedback (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES public.church_events (id) ON DELETE CASCADE,
  registration_id INTEGER REFERENCES public.church_event_registrations (id) ON DELETE SET NULL,
  member_id INTEGER REFERENCES public.church_members (id) ON DELETE SET NULL,
  rating INTEGER,
  comments TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_event_feedback_rating_check CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5))
);

CREATE TABLE IF NOT EXISTS public.church_event_visitor_follow_ups (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES public.church_events (id) ON DELETE CASCADE,
  registration_id INTEGER REFERENCES public.church_event_registrations (id) ON DELETE SET NULL,
  visitor_name TEXT NOT NULL DEFAULT '',
  visitor_email TEXT NOT NULL DEFAULT '',
  visitor_phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT NOT NULL DEFAULT '',
  assigned_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_event_visitor_follow_ups_status_check
    CHECK (status IN ('open', 'contacted', 'closed'))
);

COMMENT ON TABLE public.church_event_registrations IS
  'Foundation: registered/checked_in. Growth adds pending/waitlisted/approved/no_show and companions.';
