-- BlessBoard plan catalogue from approved public pricing (no prices stored — billing later).
-- Limits: NULL limit_value means unlimited.

INSERT INTO platform.plans (product_key, plan_key, display_name, description, sort_order, status)
VALUES
  ('blessboard', 'free', 'Free',
   'Ideal for small congregations or new church plants.', 10, 'active'),
  ('blessboard', 'growth', 'Growth',
   'Scale operations across multiple branches and roles.', 20, 'active'),
  ('blessboard', 'professional', 'Professional',
   'Premium branding and high-capacity church management.', 30, 'active'),
  ('blessboard', 'partner', 'Partner',
   'Contract-defined capacity for large networks or denominations.', 40, 'active')
ON CONFLICT (plan_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  status = EXCLUDED.status,
  updated_at = now();

-- Helper: upsert feature by plan_key
WITH plan_map AS (
  SELECT id, plan_key FROM platform.plans WHERE product_key = 'blessboard'
),
features (plan_key, feature_key, feature_kind, boolean_value, limit_value) AS (
  VALUES
    -- free
    ('free', 'max_branches', 'limit', NULL::boolean, 2),          -- 1 HQ + 1 branch
    ('free', 'max_users', 'limit', NULL, 10),
    ('free', 'max_staff_accounts', 'limit', NULL, 10),
    ('free', 'basic_reports', 'boolean', true, NULL::int),
    ('free', 'advanced_reports', 'boolean', false, NULL),
    ('free', 'custom_domain', 'boolean', false, NULL),
    ('free', 'custom_email', 'boolean', false, NULL),
    -- growth
    ('growth', 'max_branches', 'limit', NULL, 11),               -- 1 HQ + 10 branches
    ('growth', 'max_users', 'limit', NULL, NULL),                -- unlimited members
    ('growth', 'max_staff_accounts', 'limit', NULL, NULL),       -- billed per staff; no hard cap here
    ('growth', 'basic_reports', 'boolean', true, NULL),
    ('growth', 'advanced_reports', 'boolean', false, NULL),
    ('growth', 'custom_domain', 'boolean', false, NULL),
    ('growth', 'custom_email', 'boolean', false, NULL),
    -- professional
    ('professional', 'max_branches', 'limit', NULL, 51),        -- 1 HQ + 50 branches
    ('professional', 'max_users', 'limit', NULL, NULL),
    ('professional', 'max_staff_accounts', 'limit', NULL, 50),
    ('professional', 'basic_reports', 'boolean', true, NULL),
    ('professional', 'advanced_reports', 'boolean', true, NULL),
    ('professional', 'custom_domain', 'boolean', true, NULL),
    ('professional', 'custom_email', 'boolean', true, NULL),
    -- partner
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
