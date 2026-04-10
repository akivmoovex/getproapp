-- Per-tenant phone validation + normalization (Super Admin editable).
-- Apply after 000_full_schema.sql / canonical tenant bootstrap.

BEGIN;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS phone_strict_validation BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_regex TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone_default_country_code TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone_normalization_mode TEXT NOT NULL DEFAULT 'generic_digits';

-- Zambia: strict + default regex + E.164-style canonical storage (260 + 9 digits)
UPDATE public.tenants
SET
  phone_strict_validation = true,
  phone_regex = '^(?:\+?260|0)(?:95|96|97|76|77)\d{7}$',
  phone_default_country_code = '260',
  phone_normalization_mode = 'zm_e164'
WHERE lower(slug) = 'zm';

-- Demo: broad acceptance, no regex by default
UPDATE public.tenants
SET
  phone_strict_validation = false,
  phone_regex = '',
  phone_default_country_code = '',
  phone_normalization_mode = 'generic_digits'
WHERE lower(slug) = 'demo';

COMMIT;
