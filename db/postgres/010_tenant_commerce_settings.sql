-- Tenant-level commerce: deal fee %, credit thresholds, display currency, minimum review for offers.

CREATE TABLE IF NOT EXISTS public.tenant_commerce_settings (
  tenant_id INTEGER PRIMARY KEY REFERENCES public.tenants (id) ON DELETE CASCADE,
  currency TEXT NOT NULL DEFAULT 'ZMW',
  deal_price_percentage NUMERIC(12, 4) NOT NULL DEFAULT 3,
  minimum_credit_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  starting_credit_balance DOUBLE PRECISION NOT NULL DEFAULT 250,
  minimum_review_rating DOUBLE PRECISION NOT NULL DEFAULT 3,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT (now())
);

INSERT INTO public.tenant_commerce_settings (tenant_id)
SELECT id FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;
