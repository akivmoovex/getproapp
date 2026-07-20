-- Provider-neutral billing boundary on product subscriptions.
-- Does not add payment provider APIs, card storage, or invoice tables.
-- Product plan/status remain the entitlement source of truth; billing_* is operational metadata.

ALTER TABLE platform.organization_subscriptions
  ADD COLUMN IF NOT EXISTS billing_provider TEXT NULL;

ALTER TABLE platform.organization_subscriptions
  ADD COLUMN IF NOT EXISTS billing_customer_ref TEXT NULL;

ALTER TABLE platform.organization_subscriptions
  ADD COLUMN IF NOT EXISTS billing_subscription_ref TEXT NULL;

ALTER TABLE platform.organization_subscriptions
  ADD COLUMN IF NOT EXISTS billing_payment_status TEXT NULL;

ALTER TABLE platform.organization_subscriptions
  ADD COLUMN IF NOT EXISTS billing_current_period_end TIMESTAMPTZ NULL;

ALTER TABLE platform.organization_subscriptions
  ADD COLUMN IF NOT EXISTS billing_cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE platform.organization_subscriptions
  ADD COLUMN IF NOT EXISTS billing_synced_at TIMESTAMPTZ NULL;

ALTER TABLE platform.organization_subscriptions
  DROP CONSTRAINT IF EXISTS organization_subscriptions_billing_provider_len;

ALTER TABLE platform.organization_subscriptions
  ADD CONSTRAINT organization_subscriptions_billing_provider_len
    CHECK (billing_provider IS NULL OR char_length(billing_provider) BETWEEN 1 AND 64);

ALTER TABLE platform.organization_subscriptions
  DROP CONSTRAINT IF EXISTS organization_subscriptions_billing_customer_ref_len;

ALTER TABLE platform.organization_subscriptions
  ADD CONSTRAINT organization_subscriptions_billing_customer_ref_len
    CHECK (billing_customer_ref IS NULL OR char_length(billing_customer_ref) BETWEEN 1 AND 200);

ALTER TABLE platform.organization_subscriptions
  DROP CONSTRAINT IF EXISTS organization_subscriptions_billing_subscription_ref_len;

ALTER TABLE platform.organization_subscriptions
  ADD CONSTRAINT organization_subscriptions_billing_subscription_ref_len
    CHECK (billing_subscription_ref IS NULL OR char_length(billing_subscription_ref) BETWEEN 1 AND 200);

ALTER TABLE platform.organization_subscriptions
  DROP CONSTRAINT IF EXISTS organization_subscriptions_billing_payment_status_check;

ALTER TABLE platform.organization_subscriptions
  ADD CONSTRAINT organization_subscriptions_billing_payment_status_check
    CHECK (
      billing_payment_status IS NULL
      OR billing_payment_status IN (
        'not_applicable',
        'pending',
        'externally_paid',
        'succeeded',
        'failed',
        'canceled'
      )
    );

COMMENT ON COLUMN platform.organization_subscriptions.billing_provider IS
  'Provider-neutral label (e.g. stripe, manual_external). Never store secrets.';
COMMENT ON COLUMN platform.organization_subscriptions.billing_customer_ref IS
  'External customer id from a billing provider. Sensitive operational metadata.';
COMMENT ON COLUMN platform.organization_subscriptions.billing_subscription_ref IS
  'External subscription id from a billing provider. Sensitive operational metadata.';
COMMENT ON COLUMN platform.organization_subscriptions.billing_payment_status IS
  'Billing payment state; does not replace product subscription status for entitlements.';
