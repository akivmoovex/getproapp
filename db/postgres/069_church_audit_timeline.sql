-- GetPro Church — audit timeline metadata (Phase 21).
-- Idempotent: safe at startup via ensureChurchSchema.

ALTER TABLE public.church_audit_logs
  ADD COLUMN IF NOT EXISTS actor_label TEXT;

ALTER TABLE public.church_audit_logs
  ADD COLUMN IF NOT EXISTS target_label TEXT;

ALTER TABLE public.church_audit_logs
  ADD COLUMN IF NOT EXISTS ip_address TEXT;

ALTER TABLE public.church_audit_logs
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_church_audit_logs_branch_created
  ON public.church_audit_logs (branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_church_audit_logs_action
  ON public.church_audit_logs (action);

CREATE INDEX IF NOT EXISTS idx_church_audit_logs_actor_type
  ON public.church_audit_logs (actor_type);

CREATE INDEX IF NOT EXISTS idx_church_audit_logs_entity_type
  ON public.church_audit_logs (entity_type);
