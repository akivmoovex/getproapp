-- Foundation pastoral care: permissions, prayer workflow fields, cases, safeguarding, attachments.
-- Idempotent: safe at startup via ensureChurchSchema.

ALTER TABLE public.church_branch_admins
  ADD COLUMN IF NOT EXISTS can_access_pastoral BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.church_branch_admins
  ADD COLUMN IF NOT EXISTS can_access_safeguarding BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.church_branch_admins.can_access_pastoral IS
  'When true, branch admin may view and process prayer requests and pastoral cases.';

COMMENT ON COLUMN public.church_branch_admins.can_access_safeguarding IS
  'When true, branch admin may access safeguarding incidents (separate from pastoral care).';

ALTER TABLE public.church_prayer_requests
  ADD COLUMN IF NOT EXISTS assigned_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL;

ALTER TABLE public.church_prayer_requests
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;

ALTER TABLE public.church_prayer_requests
  ADD COLUMN IF NOT EXISTS acknowledged_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL;

ALTER TABLE public.church_prayer_requests
  ADD COLUMN IF NOT EXISTS due_date DATE;

ALTER TABLE public.church_prayer_requests
  ADD COLUMN IF NOT EXISTS next_action TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_prayer_requests
  ADD COLUMN IF NOT EXISTS closure_outcome TEXT;

ALTER TABLE public.church_prayer_requests
  ADD COLUMN IF NOT EXISTS closure_reason TEXT;

ALTER TABLE public.church_prayer_requests
  DROP CONSTRAINT IF EXISTS church_prayer_requests_status_check;

ALTER TABLE public.church_prayer_requests
  ADD CONSTRAINT church_prayer_requests_status_check
  CHECK (status IN ('submitted', 'acknowledged', 'assigned', 'in_follow_up', 'reviewed', 'closed'));

CREATE INDEX IF NOT EXISTS idx_church_prayer_requests_branch_assigned
  ON public.church_prayer_requests (branch_id, assigned_admin_id, status);

CREATE TABLE IF NOT EXISTS public.church_pastoral_cases (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES public.church_members (id) ON DELETE CASCADE,
  prayer_request_id INTEGER REFERENCES public.church_prayer_requests (id) ON DELETE SET NULL,
  case_type TEXT NOT NULL DEFAULT 'pastoral_care',
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  assigned_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  due_date DATE,
  next_action TEXT NOT NULL DEFAULT '',
  outcome TEXT,
  opened_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  closed_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  closure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.church_pastoral_cases
  DROP CONSTRAINT IF EXISTS church_pastoral_cases_type_check;

ALTER TABLE public.church_pastoral_cases
  ADD CONSTRAINT church_pastoral_cases_type_check
  CHECK (case_type = 'pastoral_care');

ALTER TABLE public.church_pastoral_cases
  DROP CONSTRAINT IF EXISTS church_pastoral_cases_status_check;

ALTER TABLE public.church_pastoral_cases
  ADD CONSTRAINT church_pastoral_cases_status_check
  CHECK (status IN ('open', 'in_follow_up', 'closed'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_church_pastoral_cases_open_member
  ON public.church_pastoral_cases (branch_id, member_id)
  WHERE status IN ('open', 'in_follow_up');

CREATE INDEX IF NOT EXISTS idx_church_pastoral_cases_branch_status
  ON public.church_pastoral_cases (branch_id, status, due_date);

CREATE TABLE IF NOT EXISTS public.church_pastoral_case_follow_ups (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  pastoral_case_id INTEGER NOT NULL REFERENCES public.church_pastoral_cases (id) ON DELETE CASCADE,
  contact_attempt TEXT NOT NULL DEFAULT '',
  outcome TEXT NOT NULL DEFAULT '',
  next_action TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  recorded_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_church_pastoral_case_follow_ups_case
  ON public.church_pastoral_case_follow_ups (pastoral_case_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS public.church_safeguarding_incidents (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  member_id INTEGER REFERENCES public.church_members (id) ON DELETE SET NULL,
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  assigned_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  reported_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  closed_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  closure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.church_safeguarding_incidents
  DROP CONSTRAINT IF EXISTS church_safeguarding_incidents_status_check;

ALTER TABLE public.church_safeguarding_incidents
  ADD CONSTRAINT church_safeguarding_incidents_status_check
  CHECK (status IN ('open', 'escalated', 'closed'));

CREATE INDEX IF NOT EXISTS idx_church_safeguarding_incidents_branch_status
  ON public.church_safeguarding_incidents (branch_id, status);

CREATE TABLE IF NOT EXISTS public.church_pastoral_attachments (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  stored_filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  visibility TEXT NOT NULL DEFAULT 'pastoral_only',
  uploaded_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.church_pastoral_attachments
  DROP CONSTRAINT IF EXISTS church_pastoral_attachments_entity_check;

ALTER TABLE public.church_pastoral_attachments
  ADD CONSTRAINT church_pastoral_attachments_entity_check
  CHECK (entity_type IN ('prayer_request', 'pastoral_case', 'safeguarding_incident'));

ALTER TABLE public.church_pastoral_attachments
  DROP CONSTRAINT IF EXISTS church_pastoral_attachments_visibility_check;

ALTER TABLE public.church_pastoral_attachments
  ADD CONSTRAINT church_pastoral_attachments_visibility_check
  CHECK (visibility IN ('pastoral_only', 'safeguarding_only'));

CREATE INDEX IF NOT EXISTS idx_church_pastoral_attachments_entity
  ON public.church_pastoral_attachments (entity_type, entity_id);
