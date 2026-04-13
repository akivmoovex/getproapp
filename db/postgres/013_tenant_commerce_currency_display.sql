-- Optional display fields for tenant currency (region commerce settings).

ALTER TABLE public.tenant_commerce_settings
  ADD COLUMN IF NOT EXISTS currency_name TEXT NOT NULL DEFAULT '';

ALTER TABLE public.tenant_commerce_settings
  ADD COLUMN IF NOT EXISTS currency_symbol TEXT NOT NULL DEFAULT '';
