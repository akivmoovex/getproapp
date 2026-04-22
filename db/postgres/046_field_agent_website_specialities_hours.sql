BEGIN;

CREATE TABLE IF NOT EXISTS public.field_agent_submission_website_specialities (
  tenant_id INTEGER NOT NULL,
  submission_id INTEGER NOT NULL REFERENCES public.field_agent_provider_submissions(id) ON DELETE CASCADE,
  speciality_name TEXT NOT NULL,
  speciality_name_norm TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, submission_id, speciality_name_norm)
);

CREATE INDEX IF NOT EXISTS idx_fa_web_specialities_tenant_norm
  ON public.field_agent_submission_website_specialities (tenant_id, speciality_name_norm);

CREATE TABLE IF NOT EXISTS public.field_agent_submission_website_hours (
  tenant_id INTEGER NOT NULL,
  submission_id INTEGER NOT NULL REFERENCES public.field_agent_provider_submissions(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_closed BOOLEAN NOT NULL DEFAULT TRUE,
  opens_at TIME NULL,
  closes_at TIME NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, submission_id, day_of_week),
  CHECK (
    (is_closed = TRUE AND opens_at IS NULL AND closes_at IS NULL)
    OR
    (is_closed = FALSE AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at < closes_at)
  )
);

COMMIT;
