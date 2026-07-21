-- Foundation→Growth introductory trial offers (V5).
-- Lives in blessboard so FKs to blessboard.users are valid after platform exists.

CREATE TABLE IF NOT EXISTS blessboard.organization_growth_trial_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id),
  offer_source TEXT NOT NULL
    DEFAULT 'foundation_upgrade',
  status TEXT NOT NULL,
  offered_at TIMESTAMPTZ NULL,
  offered_by UUID NULL
    REFERENCES blessboard.users (id),
  accepted_at TIMESTAMPTZ NULL,
  accepted_by UUID NULL
    REFERENCES blessboard.users (id),
  trial_subscription_id UUID NULL
    REFERENCES platform.organization_subscriptions (id),
  starts_at TIMESTAMPTZ NULL,
  ends_at TIMESTAMPTZ NULL,
  exception_reason TEXT NULL,
  is_exception BOOLEAN NOT NULL DEFAULT false,
  declined_at TIMESTAMPTZ NULL,
  canceled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organization_growth_trial_offers_source_check
    CHECK (offer_source IN ('foundation_upgrade', 'platform_exception')),
  CONSTRAINT organization_growth_trial_offers_status_check
    CHECK (
      status IN (
        'offered',
        'accepted',
        'active',
        'expired',
        'declined',
        'canceled',
        'consumed',
        'exception_granted'
      )
    ),
  CONSTRAINT organization_growth_trial_offers_exception_reason_check
    CHECK (
      exception_reason IS NULL
      OR char_length(exception_reason) BETWEEN 1 AND 1000
    ),
  CONSTRAINT organization_growth_trial_offers_updated_after_created
    CHECK (updated_at >= created_at)
);

COMMENT ON TABLE blessboard.organization_growth_trial_offers IS
  'Foundation→Growth introductory trial offers. Eligible (no row) is derived. Trial starts only on tenant accept.';

CREATE UNIQUE INDEX IF NOT EXISTS organization_growth_trial_offers_open_uidx
  ON blessboard.organization_growth_trial_offers (organization_id)
  WHERE status = 'offered';

CREATE UNIQUE INDEX IF NOT EXISTS organization_growth_trial_offers_intro_consumed_uidx
  ON blessboard.organization_growth_trial_offers (organization_id)
  WHERE is_exception = false
    AND status IN ('accepted', 'active', 'expired', 'consumed');

CREATE INDEX IF NOT EXISTS organization_growth_trial_offers_org_status_idx
  ON blessboard.organization_growth_trial_offers (organization_id, status);

CREATE INDEX IF NOT EXISTS organization_growth_trial_offers_status_offered_idx
  ON blessboard.organization_growth_trial_offers (status, offered_at DESC)
  WHERE status = 'offered';
