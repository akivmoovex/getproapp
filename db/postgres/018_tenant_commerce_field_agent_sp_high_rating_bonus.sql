-- Read-only reporting: bonus percent on earned SP commission when rolling SP_Rating (30d) is high.

ALTER TABLE public.tenant_commerce_settings
  ADD COLUMN IF NOT EXISTS field_agent_sp_high_rating_bonus_percent NUMERIC(12, 4) NULL;

COMMENT ON COLUMN public.tenant_commerce_settings.field_agent_sp_high_rating_bonus_percent IS
  'Optional percent bonus on earned field-agent SP commission (30d) when avg SP_Rating (30d) >= 4.0. Null = 0. Display/reporting only.';
