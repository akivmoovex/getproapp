-- Growth trial source on subscriptions (V5).
-- Trial duration is code policy (starts_at + 30 days UTC).

ALTER TABLE platform.organization_subscriptions
  ADD COLUMN IF NOT EXISTS trial_source TEXT NULL;

ALTER TABLE platform.organization_subscriptions
  DROP CONSTRAINT IF EXISTS organization_subscriptions_trial_source_check;

ALTER TABLE platform.organization_subscriptions
  ADD CONSTRAINT organization_subscriptions_trial_source_check
    CHECK (
      trial_source IS NULL
      OR trial_source IN (
        'direct_growth_registration',
        'foundation_trial_offer'
      )
    );

COMMENT ON COLUMN platform.organization_subscriptions.trial_source IS
  'Origin of a Growth trial window. Null for non-trial or legacy rows.';
