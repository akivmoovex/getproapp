-- GetPro Church — member auth and registration fields (Phase 2).
-- Idempotent: safe at startup via ensureChurchSchema.

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS phone_normalized TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS age_group TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS address_area TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS attendance_duration TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS ministry_interest TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_members
  DROP CONSTRAINT IF EXISTS church_members_status_check;

UPDATE public.church_members
SET status = 'suspended'
WHERE status = 'inactive';

ALTER TABLE public.church_members
  ADD CONSTRAINT church_members_status_check
  CHECK (status IN ('pending', 'verified', 'rejected', 'suspended'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_church_members_branch_email_pending_verified
  ON public.church_members (branch_id, lower(trim(email)))
  WHERE status IN ('pending', 'verified') AND trim(email) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_church_members_branch_phone_pending_verified
  ON public.church_members (branch_id, phone_normalized)
  WHERE status IN ('pending', 'verified') AND phone_normalized <> '';

CREATE INDEX IF NOT EXISTS idx_church_members_branch_email_lookup
  ON public.church_members (branch_id, lower(trim(email)));

CREATE INDEX IF NOT EXISTS idx_church_members_branch_phone_lookup
  ON public.church_members (branch_id, phone_normalized);
