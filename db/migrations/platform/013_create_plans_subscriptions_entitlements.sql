-- Configurable plans + organization subscriptions + entitlement overrides.
-- No billing/payment tables. Plan keys are immutable after insert.

CREATE TABLE IF NOT EXISTS platform.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key TEXT NOT NULL
    REFERENCES platform.products (product_key)
    ON DELETE RESTRICT,
  plan_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plans_plan_key_unique UNIQUE (plan_key),
  CONSTRAINT plans_plan_key_format
    CHECK (plan_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT plans_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 120),
  CONSTRAINT plans_description_len
    CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 1000),
  CONSTRAINT plans_status_check
    CHECK (status IN ('active', 'inactive', 'retired')),
  CONSTRAINT plans_sort_order_range
    CHECK (sort_order BETWEEN 0 AND 100000),
  CONSTRAINT plans_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS plans_product_sort_idx
  ON platform.plans (product_key, sort_order ASC, plan_key ASC);

CREATE OR REPLACE FUNCTION platform.prevent_plan_key_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.plan_key IS DISTINCT FROM OLD.plan_key THEN
    RAISE EXCEPTION 'platform.plans.plan_key is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plans_plan_key_immutable ON platform.plans;
CREATE TRIGGER plans_plan_key_immutable
  BEFORE UPDATE ON platform.plans
  FOR EACH ROW
  EXECUTE FUNCTION platform.prevent_plan_key_change();

CREATE TABLE IF NOT EXISTS platform.plan_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL
    REFERENCES platform.plans (id)
    ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  feature_kind TEXT NOT NULL,
  boolean_value BOOLEAN NULL,
  limit_value INT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plan_features_plan_feature_unique UNIQUE (plan_id, feature_key),
  CONSTRAINT plan_features_feature_key_format
    CHECK (feature_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT plan_features_kind_check
    CHECK (feature_kind IN ('boolean', 'limit')),
  CONSTRAINT plan_features_boolean_consistency
    CHECK (
      (feature_kind = 'boolean' AND boolean_value IS NOT NULL AND limit_value IS NULL)
      OR (feature_kind = 'limit' AND boolean_value IS NULL)
    ),
  CONSTRAINT plan_features_limit_non_negative
    CHECK (limit_value IS NULL OR limit_value >= 0),
  CONSTRAINT plan_features_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS plan_features_feature_key_idx
  ON platform.plan_features (feature_key);

CREATE TABLE IF NOT EXISTS platform.organization_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  product_key TEXT NOT NULL
    REFERENCES platform.products (product_key)
    ON DELETE RESTRICT,
  plan_id UUID NOT NULL
    REFERENCES platform.plans (id)
    ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organization_subscriptions_status_check
    CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'expired', 'inactive')),
  CONSTRAINT organization_subscriptions_ends_after_starts
    CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT organization_subscriptions_notes_len
    CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 1000),
  CONSTRAINT organization_subscriptions_updated_after_created
    CHECK (updated_at >= created_at)
);

-- At most one current subscription row per org+product (active/trialing/past_due).
CREATE UNIQUE INDEX IF NOT EXISTS organization_subscriptions_org_product_current_uidx
  ON platform.organization_subscriptions (organization_id, product_key)
  WHERE status IN ('active', 'trialing', 'past_due');

CREATE INDEX IF NOT EXISTS organization_subscriptions_org_status_idx
  ON platform.organization_subscriptions (organization_id, status, starts_at DESC);

CREATE TABLE IF NOT EXISTS platform.organization_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  product_key TEXT NOT NULL
    REFERENCES platform.products (product_key)
    ON DELETE RESTRICT,
  feature_key TEXT NOT NULL,
  feature_kind TEXT NOT NULL,
  boolean_value BOOLEAN NULL,
  limit_value INT NULL,
  reason TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NULL,
  created_by_user_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organization_entitlements_feature_key_format
    CHECK (feature_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT organization_entitlements_kind_check
    CHECK (feature_kind IN ('boolean', 'limit')),
  CONSTRAINT organization_entitlements_boolean_consistency
    CHECK (
      (feature_kind = 'boolean' AND boolean_value IS NOT NULL AND limit_value IS NULL)
      OR (feature_kind = 'limit' AND boolean_value IS NULL)
    ),
  CONSTRAINT organization_entitlements_limit_non_negative
    CHECK (limit_value IS NULL OR limit_value >= 0),
  CONSTRAINT organization_entitlements_reason_len
    CHECK (char_length(reason) BETWEEN 1 AND 500),
  CONSTRAINT organization_entitlements_ends_after_starts
    CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT organization_entitlements_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS organization_entitlements_org_feature_idx
  ON platform.organization_entitlements (organization_id, product_key, feature_key, starts_at DESC);
