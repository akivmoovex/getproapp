-- Growth advanced attendance: offline queue, branch rules, exemptions, cross-branch guest auth.
-- Foundation manual/QR check-in behaviour unchanged; Growth-only features gated by entitlements.

ALTER TABLE public.church_attendance_check_ins
  ADD COLUMN IF NOT EXISTS client_item_id TEXT,
  ADD COLUMN IF NOT EXISTS captured_at_client TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS capture_source TEXT,
  ADD COLUMN IF NOT EXISTS offline_queue_id INTEGER,
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS home_branch_id INTEGER REFERENCES public.church_branches (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS guest_authorized BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.church_attendance_check_ins
  DROP CONSTRAINT IF EXISTS church_attendance_check_ins_method_check;

ALTER TABLE public.church_attendance_check_ins
  ADD CONSTRAINT church_attendance_check_ins_method_check
  CHECK (method IN ('manual', 'qr', 'import', 'offline'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_church_attendance_check_ins_client_item
  ON public.church_attendance_check_ins (organization_id, branch_id, client_item_id)
  WHERE client_item_id IS NOT NULL AND trim(client_item_id) <> '';

CREATE INDEX IF NOT EXISTS idx_church_attendance_check_ins_needs_review
  ON public.church_attendance_check_ins (branch_id, needs_review)
  WHERE needs_review = true;

CREATE TABLE IF NOT EXISTS public.church_attendance_offline_queue (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  platform_tenant_id INTEGER NOT NULL,
  client_item_id TEXT NOT NULL,
  service_session_id INTEGER NOT NULL REFERENCES public.church_attendance_service_sessions (id) ON DELETE CASCADE,
  member_id INTEGER REFERENCES public.church_members (id) ON DELETE SET NULL,
  check_in_kind TEXT NOT NULL DEFAULT 'member',
  visitor_name TEXT,
  visitor_phone TEXT,
  captured_at_client TIMESTAMPTZ NOT NULL,
  capture_source TEXT NOT NULL DEFAULT '',
  sync_status TEXT NOT NULL DEFAULT 'pending',
  synced_check_in_id INTEGER REFERENCES public.church_attendance_check_ins (id) ON DELETE SET NULL,
  conflict_reason TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ
);

ALTER TABLE public.church_attendance_offline_queue
  DROP CONSTRAINT IF EXISTS church_attendance_offline_queue_kind_check;

ALTER TABLE public.church_attendance_offline_queue
  ADD CONSTRAINT church_attendance_offline_queue_kind_check
  CHECK (check_in_kind IN ('member', 'visitor'));

ALTER TABLE public.church_attendance_offline_queue
  DROP CONSTRAINT IF EXISTS church_attendance_offline_queue_status_check;

ALTER TABLE public.church_attendance_offline_queue
  ADD CONSTRAINT church_attendance_offline_queue_status_check
  CHECK (sync_status IN ('pending', 'synced', 'duplicate', 'conflict', 'failed', 'review_required'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_church_attendance_offline_queue_client_item
  ON public.church_attendance_offline_queue (organization_id, branch_id, client_item_id);

CREATE INDEX IF NOT EXISTS idx_church_attendance_offline_queue_branch_status
  ON public.church_attendance_offline_queue (branch_id, sync_status, created_at DESC);

ALTER TABLE public.church_attendance_check_ins
  DROP CONSTRAINT IF EXISTS church_attendance_check_ins_offline_queue_fk;

ALTER TABLE public.church_attendance_check_ins
  ADD CONSTRAINT church_attendance_check_ins_offline_queue_fk
  FOREIGN KEY (offline_queue_id) REFERENCES public.church_attendance_offline_queue (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.church_attendance_branch_rules (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  absence_threshold_weeks INTEGER,
  allow_multiple_services_per_day BOOLEAN NOT NULL DEFAULT true,
  cross_branch_guest_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_attendance_branch_rules_branch_unique UNIQUE (branch_id)
);

CREATE TABLE IF NOT EXISTS public.church_member_attendance_exemptions (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES public.church_members (id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT '',
  effective_from DATE NOT NULL,
  effective_to DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.church_member_attendance_exemptions
  DROP CONSTRAINT IF EXISTS church_member_attendance_exemptions_status_check;

ALTER TABLE public.church_member_attendance_exemptions
  ADD CONSTRAINT church_member_attendance_exemptions_status_check
  CHECK (status IN ('active', 'revoked'));

CREATE INDEX IF NOT EXISTS idx_church_member_attendance_exemptions_member
  ON public.church_member_attendance_exemptions (member_id, branch_id, status, effective_from DESC);

CREATE TABLE IF NOT EXISTS public.church_attendance_cross_branch_authorizations (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES public.church_members (id) ON DELETE CASCADE,
  home_branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  guest_branch_id INTEGER NOT NULL REFERENCES public.church_branches (id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  effective_to DATE,
  status TEXT NOT NULL DEFAULT 'active',
  authorized_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.church_attendance_cross_branch_authorizations
  DROP CONSTRAINT IF EXISTS church_attendance_cross_branch_auth_status_check;

ALTER TABLE public.church_attendance_cross_branch_authorizations
  ADD CONSTRAINT church_attendance_cross_branch_auth_status_check
  CHECK (status IN ('active', 'revoked'));

CREATE INDEX IF NOT EXISTS idx_church_attendance_cross_branch_auth_lookup
  ON public.church_attendance_cross_branch_authorizations (member_id, guest_branch_id, status);

COMMENT ON TABLE public.church_attendance_offline_queue IS
  'Growth offline check-in queue. Trusted org/branch/tenant context is set server-side on ingest.';
