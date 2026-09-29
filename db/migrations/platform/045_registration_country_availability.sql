-- V2.04 QA-03: Platform registration country availability (neutral markets).
-- Extends platform.geographic_countries from 044. No religion fields.

ALTER TABLE platform.geographic_countries
  ADD COLUMN IF NOT EXISTS registration_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN platform.geographic_countries.registration_enabled IS
  'When true and is_active, country may appear in BB/AC registration country selectors.';

CREATE INDEX IF NOT EXISTS idx_geographic_countries_registration_enabled
  ON platform.geographic_countries (registration_enabled, is_active)
  WHERE registration_enabled = TRUE AND is_active = TRUE;

-- Enable the initial V2.04 supported markets (same set as city-catalogue markets).
UPDATE platform.geographic_countries
   SET registration_enabled = TRUE,
       is_active = TRUE,
       updated_at = now()
 WHERE country_code IN (
   'ZM', 'ZW', 'BW', 'NA', 'ZA', 'LS', 'SZ', 'MW', 'MZ',
   'KE', 'UG', 'TZ', 'RW', 'BI',
   'US', 'CA', 'GB', 'AU', 'NZ'
 );

-- Ensure rows exist even if city seed was skipped (idempotent upserts).
INSERT INTO platform.geographic_countries (
  country_code, country_name, city_catalogue_enabled, catalogue_status,
  is_active, registration_enabled
) VALUES
  ('ZM', 'Zambia', TRUE, 'seeded', TRUE, TRUE),
  ('ZW', 'Zimbabwe', TRUE, 'seeded', TRUE, TRUE),
  ('BW', 'Botswana', TRUE, 'seeded', TRUE, TRUE),
  ('NA', 'Namibia', TRUE, 'seeded', TRUE, TRUE),
  ('ZA', 'South Africa', TRUE, 'seeded', TRUE, TRUE),
  ('LS', 'Lesotho', TRUE, 'seeded', TRUE, TRUE),
  ('SZ', 'Eswatini', TRUE, 'seeded', TRUE, TRUE),
  ('MW', 'Malawi', TRUE, 'seeded', TRUE, TRUE),
  ('MZ', 'Mozambique', TRUE, 'seeded', TRUE, TRUE),
  ('KE', 'Kenya', TRUE, 'seeded', TRUE, TRUE),
  ('UG', 'Uganda', TRUE, 'seeded', TRUE, TRUE),
  ('TZ', 'Tanzania', TRUE, 'seeded', TRUE, TRUE),
  ('RW', 'Rwanda', TRUE, 'seeded', TRUE, TRUE),
  ('BI', 'Burundi', TRUE, 'seeded', TRUE, TRUE),
  ('US', 'United States', TRUE, 'seeded', TRUE, TRUE),
  ('CA', 'Canada', TRUE, 'seeded', TRUE, TRUE),
  ('GB', 'United Kingdom', TRUE, 'seeded', TRUE, TRUE),
  ('AU', 'Australia', TRUE, 'seeded', TRUE, TRUE),
  ('NZ', 'New Zealand', TRUE, 'seeded', TRUE, TRUE)
ON CONFLICT (country_code) DO UPDATE SET
  country_name = EXCLUDED.country_name,
  registration_enabled = TRUE,
  is_active = TRUE,
  updated_at = now();
