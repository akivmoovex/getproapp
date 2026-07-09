-- GetPro Church — member self-service password change metadata (Phase 35).
-- Idempotent: safe at startup via ensureChurchSchema.

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS password_changed_by TEXT;

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS failed_password_change_attempts INTEGER NOT NULL DEFAULT 0;
