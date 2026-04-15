-- Targeted indexes for admin field-agent analytics drill-down pagination/filtering.
-- Keeps query semantics unchanged while improving tenant-scoped FIFO scans.

CREATE INDEX IF NOT EXISTS idx_faps_tenant_created_id
  ON public.field_agent_provider_submissions (tenant_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_faps_tenant_status_created_id
  ON public.field_agent_provider_submissions (tenant_id, status, created_at, id);

CREATE INDEX IF NOT EXISTS idx_faps_tenant_agent_created_id
  ON public.field_agent_provider_submissions (tenant_id, field_agent_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_facl_tenant_created_id
  ON public.field_agent_callback_leads (tenant_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_facl_tenant_agent_created_id
  ON public.field_agent_callback_leads (tenant_id, field_agent_id, created_at, id);
