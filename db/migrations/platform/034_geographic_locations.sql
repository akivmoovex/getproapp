-- Platform geographic reference data (shared across products).
-- User-added locations from registration are queryable immediately (approval_status pending).

CREATE TABLE IF NOT EXISTS platform.geographic_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code CHAR(2) NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  province_region TEXT NULL,
  source TEXT NOT NULL DEFAULT 'seed',
  approval_status TEXT NOT NULL DEFAULT 'approved',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_registration_reference TEXT NULL,
  CONSTRAINT geographic_locations_country_code_format
    CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT geographic_locations_name_len
    CHECK (char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT geographic_locations_normalized_name_len
    CHECK (char_length(normalized_name) BETWEEN 1 AND 120),
  CONSTRAINT geographic_locations_source_len
    CHECK (char_length(source) BETWEEN 1 AND 40),
  CONSTRAINT geographic_locations_approval_status_len
    CHECK (approval_status IN ('approved', 'pending', 'rejected', 'archived')),
  CONSTRAINT geographic_locations_province_region_len
    CHECK (province_region IS NULL OR char_length(province_region) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_geographic_locations_country_normalized
  ON platform.geographic_locations (country_code, normalized_name);

CREATE INDEX IF NOT EXISTS idx_geographic_locations_country_name
  ON platform.geographic_locations (country_code, name);

CREATE INDEX IF NOT EXISTS idx_geographic_locations_approval
  ON platform.geographic_locations (approval_status, country_code);

COMMENT ON TABLE platform.geographic_locations IS
  'Shared city/town reference data scoped by ISO country code.';

-- Zambia V1 starter catalogue (idempotent; user-added towns use registration flow).
INSERT INTO platform.geographic_locations
  (country_code, name, normalized_name, province_region, source, approval_status)
VALUES
  ('ZM', 'Lusaka', 'lusaka', 'Lusaka', 'seed', 'approved'),
  ('ZM', 'Kitwe', 'kitwe', 'Copperbelt', 'seed', 'approved'),
  ('ZM', 'Ndola', 'ndola', 'Copperbelt', 'seed', 'approved'),
  ('ZM', 'Kabwe', 'kabwe', 'Central', 'seed', 'approved'),
  ('ZM', 'Chingola', 'chingola', 'Copperbelt', 'seed', 'approved'),
  ('ZM', 'Mufulira', 'mufulira', 'Copperbelt', 'seed', 'approved'),
  ('ZM', 'Livingstone', 'livingstone', 'Southern', 'seed', 'approved'),
  ('ZM', 'Luanshya', 'luanshya', 'Copperbelt', 'seed', 'approved'),
  ('ZM', 'Chipata', 'chipata', 'Eastern', 'seed', 'approved'),
  ('ZM', 'Kasama', 'kasama', 'Northern', 'seed', 'approved'),
  ('ZM', 'Solwezi', 'solwezi', 'North-Western', 'seed', 'approved'),
  ('ZM', 'Mongu', 'mongu', 'Western', 'seed', 'approved'),
  ('ZM', 'Kafue', 'kafue', 'Lusaka', 'seed', 'approved'),
  ('ZM', 'Mazabuka', 'mazabuka', 'Southern', 'seed', 'approved'),
  ('ZM', 'Choma', 'choma', 'Southern', 'seed', 'approved'),
  ('ZM', 'Monze', 'monze', 'Southern', 'seed', 'approved'),
  ('ZM', 'Kapiri Mposhi', 'kapiri mposhi', 'Central', 'seed', 'approved'),
  ('ZM', 'Mpika', 'mpika', 'Muchinga', 'seed', 'approved'),
  ('ZM', 'Mansa', 'mansa', 'Luapula', 'seed', 'approved'),
  ('ZM', 'Kawambwa', 'kawambwa', 'Luapula', 'seed', 'approved'),
  ('ZM', 'Petauke', 'petauke', 'Eastern', 'seed', 'approved'),
  ('ZM', 'Serenje', 'serenje', 'Central', 'seed', 'approved'),
  ('ZM', 'Siavonga', 'siavonga', 'Southern', 'seed', 'approved'),
  ('ZM', 'Samfya', 'samfya', 'Luapula', 'seed', 'approved')
ON CONFLICT (country_code, normalized_name) DO NOTHING;
