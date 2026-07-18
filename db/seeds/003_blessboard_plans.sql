-- BlessBoard plan catalogue display alignment (Foundation / Growth / Network).
-- plan_key values remain free / growth / professional / partner for compatibility.
-- No schema changes. Prices are not stored (see blessBoardBillingCatalogue).
-- Limits: NULL limit_value means unlimited.
-- Migration to rename plan_key values is proposed in docs/product/BLESSBOARD_PRICING_DECISION.md.

INSERT INTO platform.plans (product_key, plan_key, display_name, description, sort_order, status)
VALUES
  ('blessboard', 'free', 'Foundation',
   'USD 0/month — 1 HQ, maximum 1 active branch, up to 250 members and 10 administrator accounts.', 10, 'active'),
  ('blessboard', 'growth', 'Growth',
   'USD 14.99 per active branch/month — unlimited branches, fair-use members, advanced workflows and cross-branch administration.', 20, 'active'),
  ('blessboard', 'professional', 'Network',
   'USD 29.99 per active branch/month — custom domain, hosted mailboxes, integrations, executive reports, priority support.', 30, 'active'),
  ('blessboard', 'partner', 'Partner (legacy)',
   'Legacy catalogue key — use Network for new assignments. Kept for existing subscriptions until plan_key migration.', 40, 'inactive')
ON CONFLICT (plan_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  status = EXCLUDED.status,
  updated_at = now();

WITH plan_map AS (
  SELECT id, plan_key FROM platform.plans WHERE product_key = 'blessboard'
),
features (plan_key, feature_key, feature_kind, boolean_value, limit_value) AS (
  VALUES
    -- free key = Foundation (display)
    ('free', 'max_branches', 'limit', NULL::boolean, 1),
    ('free', 'max_users', 'limit', NULL, 250),
    ('free', 'max_staff_accounts', 'limit', NULL, 10),
    ('free', 'basic_reports', 'boolean', true, NULL::int),
    ('free', 'advanced_reports', 'boolean', false, NULL),
    ('free', 'custom_domain', 'boolean', false, NULL),
    ('free', 'custom_email', 'boolean', false, NULL),
    -- growth
    ('growth', 'max_branches', 'limit', NULL, NULL),
    ('growth', 'max_users', 'limit', NULL, NULL),
    ('growth', 'max_staff_accounts', 'limit', NULL, NULL),
    ('growth', 'basic_reports', 'boolean', true, NULL),
    ('growth', 'advanced_reports', 'boolean', true, NULL),
    ('growth', 'custom_domain', 'boolean', false, NULL),
    ('growth', 'custom_email', 'boolean', false, NULL),
    -- professional key = Network (display)
    ('professional', 'max_branches', 'limit', NULL, NULL),
    ('professional', 'max_users', 'limit', NULL, NULL),
    ('professional', 'max_staff_accounts', 'limit', NULL, NULL),
    ('professional', 'basic_reports', 'boolean', true, NULL),
    ('professional', 'advanced_reports', 'boolean', true, NULL),
    ('professional', 'custom_domain', 'boolean', true, NULL),
    ('professional', 'custom_email', 'boolean', true, NULL),
    -- partner legacy (inactive plan; features retained for existing subs)
    ('partner', 'max_branches', 'limit', NULL, NULL),
    ('partner', 'max_users', 'limit', NULL, NULL),
    ('partner', 'max_staff_accounts', 'limit', NULL, NULL),
    ('partner', 'basic_reports', 'boolean', true, NULL),
    ('partner', 'advanced_reports', 'boolean', true, NULL),
    ('partner', 'custom_domain', 'boolean', true, NULL),
    ('partner', 'custom_email', 'boolean', true, NULL)
)
INSERT INTO platform.plan_features (plan_id, feature_key, feature_kind, boolean_value, limit_value)
SELECT p.id, f.feature_key, f.feature_kind, f.boolean_value, f.limit_value
  FROM features f
  INNER JOIN plan_map p ON p.plan_key = f.plan_key
ON CONFLICT (plan_id, feature_key) DO UPDATE SET
  feature_kind = EXCLUDED.feature_kind,
  boolean_value = EXCLUDED.boolean_value,
  limit_value = EXCLUDED.limit_value,
  updated_at = now();
