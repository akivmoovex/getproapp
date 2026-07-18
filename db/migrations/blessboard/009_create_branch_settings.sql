-- Normalized branch/campus settings (one row per branch).
-- Not created at migrate/bootstrap/app startup — initialize explicitly when needed.

CREATE TABLE IF NOT EXISTS blessboard.branch_settings (
  branch_id UUID PRIMARY KEY
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  public_name TEXT NOT NULL,
  email TEXT NULL,
  phone TEXT NULL,
  timezone TEXT NULL,
  country_code TEXT NULL,
  address_line_1 TEXT NULL,
  address_line_2 TEXT NULL,
  city TEXT NULL,
  province_state TEXT NULL,
  postal_code TEXT NULL,
  latitude NUMERIC(9, 6) NULL,
  longitude NUMERIC(9, 6) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT branch_settings_public_name_len
    CHECK (char_length(public_name) BETWEEN 1 AND 200),
  CONSTRAINT branch_settings_email_len
    CHECK (email IS NULL OR char_length(email) BETWEEN 3 AND 254),
  CONSTRAINT branch_settings_phone_len
    CHECK (phone IS NULL OR char_length(phone) BETWEEN 3 AND 32),
  CONSTRAINT branch_settings_timezone_len
    CHECK (timezone IS NULL OR char_length(timezone) BETWEEN 1 AND 64),
  CONSTRAINT branch_settings_country_code_format
    CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT branch_settings_address_line_1_len
    CHECK (address_line_1 IS NULL OR char_length(address_line_1) BETWEEN 1 AND 200),
  CONSTRAINT branch_settings_address_line_2_len
    CHECK (address_line_2 IS NULL OR char_length(address_line_2) BETWEEN 1 AND 200),
  CONSTRAINT branch_settings_city_len
    CHECK (city IS NULL OR char_length(city) BETWEEN 1 AND 120),
  CONSTRAINT branch_settings_province_state_len
    CHECK (province_state IS NULL OR char_length(province_state) BETWEEN 1 AND 120),
  CONSTRAINT branch_settings_postal_code_len
    CHECK (postal_code IS NULL OR char_length(postal_code) BETWEEN 1 AND 32),
  CONSTRAINT branch_settings_latitude_range
    CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  CONSTRAINT branch_settings_longitude_range
    CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  CONSTRAINT branch_settings_updated_after_created
    CHECK (updated_at >= created_at)
);
