-- GetPro Church — HQ branch registry metadata (Phase 18).
-- Idempotent: safe at startup via ensureChurchSchema.

ALTER TABLE public.church_branches
  ADD COLUMN IF NOT EXISTS city TEXT;

ALTER TABLE public.church_branches
  ADD COLUMN IF NOT EXISTS country TEXT;

ALTER TABLE public.church_branches
  ADD COLUMN IF NOT EXISTS pastor_name TEXT;

ALTER TABLE public.church_branches
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;

ALTER TABLE public.church_branches
  ADD COLUMN IF NOT EXISTS contact_email TEXT;
