-- Organisation data environment classification (production | pilot | demo | test).
-- Default production for existing rows. Demo slug backfilled. Idempotent.

ALTER TABLE public.church_organizations
  ADD COLUMN IF NOT EXISTS data_environment TEXT NOT NULL DEFAULT 'production';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'church_organizations_data_environment_check'
  ) THEN
    ALTER TABLE public.church_organizations
      ADD CONSTRAINT church_organizations_data_environment_check
      CHECK (data_environment IN ('production', 'pilot', 'demo', 'test'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_church_organizations_data_environment
  ON public.church_organizations (data_environment);

-- Classify the canonical BlessBoard demo organisations.
UPDATE public.church_organizations
SET data_environment = 'demo'
WHERE lower(trim(slug)) IN ('demo', 'demo2')
  AND data_environment = 'production';
