-- GetPro Church — branch host slug for multi-branch routing (Phase 24).
-- Idempotent: safe at startup via ensureChurchSchema.

ALTER TABLE public.church_branches
  ADD COLUMN IF NOT EXISTS host_slug TEXT;

-- Legacy single-branch orgs: host was organization slug.
UPDATE public.church_branches b
SET host_slug = lower(trim(o.slug))
FROM public.church_organizations o
WHERE b.organization_id = o.id
  AND (b.host_slug IS NULL OR trim(b.host_slug) = '');

UPDATE public.church_branches
SET host_slug = lower(trim(slug))
WHERE host_slug IS NULL OR trim(host_slug) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_church_branches_host_slug_unique
  ON public.church_branches (lower(trim(host_slug)))
  WHERE trim(host_slug) <> '';

CREATE INDEX IF NOT EXISTS idx_church_branches_host_slug
  ON public.church_branches (host_slug);
