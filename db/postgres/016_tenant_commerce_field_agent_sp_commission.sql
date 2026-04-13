-- Field agent SP commission: percent of collected lead fees (reporting); separate from deal_price_percentage.

ALTER TABLE public.tenant_commerce_settings
  ADD COLUMN IF NOT EXISTS field_agent_sp_commission_percent NUMERIC(12, 4) NULL;

COMMENT ON COLUMN public.tenant_commerce_settings.field_agent_sp_commission_percent IS
  'Percent of provider lead fees (deal_price on charged assignments) attributed to the account-manager field agent; null = not configured / 0% for reporting.';
