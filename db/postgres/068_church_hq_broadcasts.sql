-- GetPro Church — HQ broadcast center (Phase 19).
-- Idempotent: safe at startup via ensureChurchSchema.

CREATE TABLE IF NOT EXISTS public.church_hq_broadcasts (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES public.church_organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'General',
  audience TEXT NOT NULL DEFAULT 'members',
  target_scope TEXT NOT NULL DEFAULT 'all_branches',
  status TEXT NOT NULL DEFAULT 'draft',
  publish_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by_hq_admin_id BIGINT REFERENCES public.church_hq_admins(id) ON DELETE SET NULL,
  updated_by_hq_admin_id BIGINT REFERENCES public.church_hq_admins(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_church_hq_broadcasts_org_status
  ON public.church_hq_broadcasts (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_church_hq_broadcasts_org_publish
  ON public.church_hq_broadcasts (organization_id, publish_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.church_hq_broadcast_targets (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES public.church_organizations(id) ON DELETE CASCADE,
  broadcast_id BIGINT NOT NULL REFERENCES public.church_hq_broadcasts(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL REFERENCES public.church_branches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (broadcast_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_church_hq_broadcast_targets_branch
  ON public.church_hq_broadcast_targets (branch_id, broadcast_id);
