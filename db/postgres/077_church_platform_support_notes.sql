-- GetPro Church — platform-only support notes (Phase 33).
-- Idempotent: safe at startup via ensureChurchSchema.

CREATE TABLE IF NOT EXISTS public.church_platform_support_notes (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER REFERENCES public.church_branches (id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  note_body TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'platform_only',
  created_by_platform_admin_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_platform_support_notes_entity_type_check
    CHECK (entity_type IN ('organization', 'branch', 'hq_admin', 'branch_admin', 'member')),
  CONSTRAINT church_platform_support_notes_visibility_check
    CHECK (visibility IN ('platform_only')),
  CONSTRAINT church_platform_support_notes_body_len_check
    CHECK (char_length(trim(note_body)) >= 3 AND char_length(note_body) <= 2000)
);

CREATE INDEX IF NOT EXISTS idx_church_platform_support_notes_org_created
  ON public.church_platform_support_notes (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_church_platform_support_notes_branch_created
  ON public.church_platform_support_notes (branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_church_platform_support_notes_entity_created
  ON public.church_platform_support_notes (entity_type, entity_id, created_at DESC);
