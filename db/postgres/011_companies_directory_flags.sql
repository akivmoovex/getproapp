-- Admin-curated directory featured list + premium flag (tenant-scoped via companies.tenant_id).
-- Idempotent: safe at startup.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS directory_featured BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_companies_tenant_directory_featured
  ON public.companies (tenant_id)
  WHERE directory_featured = true;
