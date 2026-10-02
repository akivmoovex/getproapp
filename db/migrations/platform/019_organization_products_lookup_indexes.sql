-- Additive lookup indexes for product-scoped organization_products queries.
-- Does not alter columns, uniqueness, or existing BlessBoard rows.

CREATE INDEX IF NOT EXISTS organization_products_product_status_idx
  ON platform.organization_products (product_id, status);

CREATE INDEX IF NOT EXISTS organization_products_org_status_idx
  ON platform.organization_products (organization_id, status);

CREATE INDEX IF NOT EXISTS organization_products_active_product_idx
  ON platform.organization_products (product_id, organization_id)
  WHERE status = 'active';
