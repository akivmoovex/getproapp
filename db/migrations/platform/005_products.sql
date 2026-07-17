-- Shared product catalogue (BlessBoard, GetPro, NGO, …).
-- product_key is immutable after insert (enforced by trigger).

CREATE TABLE IF NOT EXISTS platform.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT products_product_key_unique UNIQUE (product_key),
  CONSTRAINT products_product_key_format
    CHECK (product_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT products_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 120),
  CONSTRAINT products_status_check
    CHECK (status IN ('active', 'inactive', 'retired'))
);

CREATE OR REPLACE FUNCTION platform.prevent_product_key_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.product_key IS DISTINCT FROM OLD.product_key THEN
    RAISE EXCEPTION 'platform.products.product_key is immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_product_key_immutable ON platform.products;
CREATE TRIGGER products_product_key_immutable
  BEFORE UPDATE ON platform.products
  FOR EACH ROW
  EXECUTE FUNCTION platform.prevent_product_key_change();
