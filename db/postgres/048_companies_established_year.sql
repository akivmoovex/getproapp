BEGIN;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS established_year INTEGER;

COMMIT;
