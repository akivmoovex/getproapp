-- Deal-style fields on intake_client_projects (urgency, internal pricing, CSR validation).
-- Idempotent: safe to run multiple times at startup.

ALTER TABLE public.intake_client_projects
  ADD COLUMN IF NOT EXISTS urgency TEXT NOT NULL DEFAULT 'not_urgent';

ALTER TABLE public.intake_client_projects
  ADD COLUMN IF NOT EXISTS deal_validation_status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE public.intake_client_projects
  ADD COLUMN IF NOT EXISTS validated_by_admin_user_id INTEGER REFERENCES public.admin_users (id);

ALTER TABLE public.intake_client_projects
  ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;

ALTER TABLE public.intake_client_projects
  ADD COLUMN IF NOT EXISTS price_estimation DOUBLE PRECISION;

ALTER TABLE public.intake_client_projects
  ADD COLUMN IF NOT EXISTS deal_price DOUBLE PRECISION;
