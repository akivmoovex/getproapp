-- GetPro Church — platform support notes for ministry leaders (Phase 47).
-- Idempotent: safe at startup via ensureChurchSchema.

ALTER TABLE public.church_platform_support_notes
  DROP CONSTRAINT IF EXISTS church_platform_support_notes_entity_type_check;

ALTER TABLE public.church_platform_support_notes
  ADD CONSTRAINT church_platform_support_notes_entity_type_check
  CHECK (entity_type IN (
    'organization', 'branch', 'hq_admin', 'branch_admin', 'member', 'ministry_leader'
  ));
