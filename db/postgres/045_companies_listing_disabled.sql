-- Tenant manager: hide provider from public directory, search, typeahead, sitemap, and mini-site (row kept).

BEGIN;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS listing_disabled BOOLEAN NOT NULL DEFAULT false;

COMMIT;
