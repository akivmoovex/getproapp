-- EC (end-customer) lead commission reporting for field agents: tenant-configured percent × sum of distinct qualifying project deal_price values (read-only metric).

ALTER TABLE public.tenant_commerce_settings
  ADD COLUMN IF NOT EXISTS field_agent_ec_commission_percent NUMERIC(12, 4) NULL;

COMMENT ON COLUMN public.tenant_commerce_settings.field_agent_ec_commission_percent IS
  'Optional percent for read-only EC_Commission (30d): applied to sum of distinct qualifying intake_client_projects.deal_price in the rolling window (not collected revenue).';
