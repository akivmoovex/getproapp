-- Field-agent SP_Rating (30d) banding and SP commission quality logic: configurable low/high star thresholds (reporting only).

ALTER TABLE public.tenant_commerce_settings
  ADD COLUMN IF NOT EXISTS field_agent_sp_rating_low_threshold NUMERIC(12, 4) NULL;

ALTER TABLE public.tenant_commerce_settings
  ADD COLUMN IF NOT EXISTS field_agent_sp_rating_high_threshold NUMERIC(12, 4) NULL;

COMMENT ON COLUMN public.tenant_commerce_settings.field_agent_sp_rating_low_threshold IS
  'Optional: below this rolling SP_Rating (30d) value, low band + holdback in field-agent reporting. Null uses runtime default (2.5).';

COMMENT ON COLUMN public.tenant_commerce_settings.field_agent_sp_rating_high_threshold IS
  'Optional: at or above this rolling SP_Rating (30d) value, high band + bonus eligibility in field-agent reporting. Null uses runtime default (4.0).';
