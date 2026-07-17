-- Enrolment of an organization in a product.
-- product_tenant_key is unique within a product; may repeat across products.

CREATE TABLE IF NOT EXISTS platform.organization_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  product_id UUID NOT NULL
    REFERENCES platform.products (id)
    ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active',
  product_tenant_key TEXT NOT NULL,
  activated_at TIMESTAMPTZ NULL,
  deactivated_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organization_products_org_product_unique
    UNIQUE (organization_id, product_id),
  CONSTRAINT organization_products_product_tenant_key_unique
    UNIQUE (product_id, product_tenant_key),
  CONSTRAINT organization_products_status_check
    CHECK (status IN ('active', 'inactive', 'retired')),
  CONSTRAINT organization_products_product_tenant_key_format
    CHECK (product_tenant_key ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$'),
  CONSTRAINT organization_products_deactivated_after_activated
    CHECK (
      deactivated_at IS NULL
      OR activated_at IS NULL
      OR deactivated_at >= activated_at
    )
);

CREATE INDEX IF NOT EXISTS organization_products_organization_id_idx
  ON platform.organization_products (organization_id);

CREATE INDEX IF NOT EXISTS organization_products_product_id_idx
  ON platform.organization_products (product_id);
