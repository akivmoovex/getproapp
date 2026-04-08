-- Optional localization for content_pages: locale column + unique (tenant, kind, slug, locale).
-- Idempotent: safe to re-run.

BEGIN;

ALTER TABLE public.content_pages ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en';

ALTER TABLE public.content_pages DROP CONSTRAINT IF EXISTS content_pages_tenant_id_kind_slug_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_pages_tenant_kind_slug_locale
  ON public.content_pages (tenant_id, kind, slug, locale);

COMMIT;
