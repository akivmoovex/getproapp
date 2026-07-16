-- Index for organization-scoped member status counts (Admin Console usage meters).
-- Idempotent via ensureChurchSchema. Does not rewrite data.

CREATE INDEX IF NOT EXISTS idx_church_members_organization_status
  ON public.church_members (organization_id, status);
