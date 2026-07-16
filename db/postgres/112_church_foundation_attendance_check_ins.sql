-- Foundation attendance: service sessions, per-person check-ins, opaque QR tokens.
-- Idempotent: safe at startup via ensureChurchSchema.

CREATE TABLE IF NOT EXISTS public.church_attendance_service_sessions (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  attendance_type TEXT NOT NULL DEFAULT '',
  service_name TEXT NOT NULL DEFAULT '',
  session_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  opened_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  closed_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.church_attendance_service_sessions
  DROP CONSTRAINT IF EXISTS church_attendance_service_sessions_status_check;

ALTER TABLE public.church_attendance_service_sessions
  ADD CONSTRAINT church_attendance_service_sessions_status_check
  CHECK (status IN ('open', 'closed'));

CREATE INDEX IF NOT EXISTS idx_church_attendance_service_sessions_branch_date
  ON public.church_attendance_service_sessions (branch_id, session_date DESC, status);

CREATE TABLE IF NOT EXISTS public.church_member_attendance_qr_tokens (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES public.church_members (id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_church_member_attendance_qr_tokens_token
  ON public.church_member_attendance_qr_tokens (token);

CREATE UNIQUE INDEX IF NOT EXISTS idx_church_member_attendance_qr_tokens_active_member
  ON public.church_member_attendance_qr_tokens (branch_id, member_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.church_attendance_check_ins (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  service_session_id INTEGER NOT NULL REFERENCES public.church_attendance_service_sessions (id) ON DELETE CASCADE,
  member_id INTEGER REFERENCES public.church_members (id) ON DELETE SET NULL,
  check_in_kind TEXT NOT NULL,
  method TEXT NOT NULL,
  visitor_name TEXT,
  visitor_phone TEXT,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_in_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  voided_at TIMESTAMPTZ,
  voided_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  void_reason TEXT,
  correction_of_check_in_id INTEGER REFERENCES public.church_attendance_check_ins (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.church_attendance_check_ins
  DROP CONSTRAINT IF EXISTS church_attendance_check_ins_kind_check;

ALTER TABLE public.church_attendance_check_ins
  ADD CONSTRAINT church_attendance_check_ins_kind_check
  CHECK (check_in_kind IN ('member', 'visitor'));

ALTER TABLE public.church_attendance_check_ins
  DROP CONSTRAINT IF EXISTS church_attendance_check_ins_method_check;

ALTER TABLE public.church_attendance_check_ins
  ADD CONSTRAINT church_attendance_check_ins_method_check
  CHECK (method IN ('manual', 'qr', 'import'));

ALTER TABLE public.church_attendance_check_ins
  DROP CONSTRAINT IF EXISTS church_attendance_check_ins_status_check;

ALTER TABLE public.church_attendance_check_ins
  ADD CONSTRAINT church_attendance_check_ins_status_check
  CHECK (status IN ('active', 'voided'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_church_attendance_check_ins_member_session_active
  ON public.church_attendance_check_ins (service_session_id, member_id)
  WHERE member_id IS NOT NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_church_attendance_check_ins_branch_session
  ON public.church_attendance_check_ins (branch_id, service_session_id, status, checked_in_at DESC);

ALTER TABLE public.church_branch_admins
  ADD COLUMN IF NOT EXISTS can_correct_attendance BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.church_branch_admins.can_correct_attendance IS
  'When true, branch admin may void or correct attendance check-ins with audit reason.';
