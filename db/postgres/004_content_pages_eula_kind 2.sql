-- Allow EULA rows in content_pages (per-tenant legal text).
ALTER TABLE public.content_pages DROP CONSTRAINT IF EXISTS content_pages_kind_check;
ALTER TABLE public.content_pages
  ADD CONSTRAINT content_pages_kind_check CHECK (kind IN ('article', 'guide', 'faq', 'eula'));
