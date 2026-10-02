-- Shared post-registration onboarding progress (mechanics only).
-- Product-specific clinic/church fields stay in product schemas.
-- BlessBoard follow-up / support columns remain on blessboard.organization_onboarding.

CREATE TABLE IF NOT EXISTS platform.organization_onboarding_progress (
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE CASCADE,
  product_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  current_step_key TEXT NULL,
  skipped_step_keys TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  last_resumed_at TIMESTAMPTZ NULL,
  last_audit_action TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, product_code),
  CONSTRAINT organization_onboarding_progress_product_check
    CHECK (product_code IN ('activeclinic', 'blessboard')),
  CONSTRAINT organization_onboarding_progress_status_check
    CHECK (status IN ('not_started', 'in_progress', 'completed', 'skipped')),
  CONSTRAINT organization_onboarding_progress_step_key_len
    CHECK (current_step_key IS NULL OR char_length(current_step_key) BETWEEN 1 AND 64),
  CONSTRAINT organization_onboarding_progress_audit_len
    CHECK (last_audit_action IS NULL OR char_length(last_audit_action) BETWEEN 1 AND 64)
);

CREATE INDEX IF NOT EXISTS organization_onboarding_progress_status_idx
  ON platform.organization_onboarding_progress (product_code, status);

COMMENT ON TABLE platform.organization_onboarding_progress IS
  'Durable organization onboarding cursor shared by ActiveClinic and BlessBoard. Step facts stay product-specific.';
