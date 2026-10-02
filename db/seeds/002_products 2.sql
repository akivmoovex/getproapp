-- Seed shared product catalogue only (no organizations / tenants / churches).

INSERT INTO platform.products (product_key, display_name, status)
VALUES
  ('blessboard', 'BlessBoard', 'active'),
  ('getpro', 'GetPro', 'active'),
  ('ngo', 'NGO', 'active')
ON CONFLICT (product_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  status = EXCLUDED.status,
  updated_at = now();
