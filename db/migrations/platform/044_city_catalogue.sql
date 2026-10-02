-- V2.04 QA-02: Platform city catalogue (countries + extended geographic_locations).
-- Neutral geography only: city_catalogue_enabled / catalogue_status (no religion fields).
-- Extends platform.geographic_locations from 034; non-destructive.

CREATE TABLE IF NOT EXISTS platform.geographic_countries (
  country_code CHAR(2) PRIMARY KEY,
  country_name TEXT NOT NULL,
  city_catalogue_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  catalogue_status TEXT NOT NULL DEFAULT 'none',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT geographic_countries_country_code_format
    CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT geographic_countries_name_len
    CHECK (char_length(country_name) BETWEEN 1 AND 120),
  CONSTRAINT geographic_countries_catalogue_status
    CHECK (catalogue_status IN ('none', 'seeded', 'partial', 'complete'))
);

COMMENT ON TABLE platform.geographic_countries IS
  'Platform countries with optional city-catalogue coverage flags (shared BB/AC).';

CREATE INDEX IF NOT EXISTS idx_geographic_countries_catalogue_enabled
  ON platform.geographic_countries (city_catalogue_enabled, is_active)
  WHERE city_catalogue_enabled = TRUE AND is_active = TRUE;

ALTER TABLE platform.geographic_locations
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE platform.geographic_locations
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION NULL;

ALTER TABLE platform.geographic_locations
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION NULL;

ALTER TABLE platform.geographic_locations
  ADD COLUMN IF NOT EXISTS external_ref TEXT NULL;

ALTER TABLE platform.geographic_locations
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Stable disambiguator for same-name cities within a country (admin area optional).
ALTER TABLE platform.geographic_locations
  ADD COLUMN IF NOT EXISTS disambiguator TEXT
  GENERATED ALWAYS AS (COALESCE(province_region, '')) STORED;

ALTER TABLE platform.geographic_locations
  DROP CONSTRAINT IF EXISTS geographic_locations_external_ref_len;

ALTER TABLE platform.geographic_locations
  ADD CONSTRAINT geographic_locations_external_ref_len
  CHECK (external_ref IS NULL OR char_length(external_ref) BETWEEN 1 AND 64);

-- Replace single-name uniqueness with country + normalized name + admin disambiguator.
DROP INDEX IF EXISTS platform.uq_geographic_locations_country_normalized;

CREATE UNIQUE INDEX IF NOT EXISTS uq_geographic_locations_country_normalized_admin
  ON platform.geographic_locations (country_code, normalized_name, disambiguator);

-- Prefix search support for country-scoped autocomplete (LIKE 'q%').
CREATE INDEX IF NOT EXISTS idx_geographic_locations_country_normalized_prefix
  ON platform.geographic_locations (country_code, normalized_name text_pattern_ops)
  WHERE is_active = TRUE
    AND approval_status IN ('approved', 'pending');

CREATE INDEX IF NOT EXISTS idx_geographic_locations_active_country
  ON platform.geographic_locations (country_code, is_active, approval_status);
