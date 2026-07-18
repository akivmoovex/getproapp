-- Normalized church-wide public/admin settings (one row per church).
-- Not created at migrate/bootstrap/app startup — initialize explicitly when needed.

CREATE TABLE IF NOT EXISTS blessboard.church_settings (
  church_id UUID PRIMARY KEY
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  public_name TEXT NOT NULL,
  denomination TEXT NULL,
  primary_email TEXT NULL,
  primary_phone TEXT NULL,
  default_timezone TEXT NULL,
  default_country_code TEXT NULL,
  website_status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_settings_public_name_len
    CHECK (char_length(public_name) BETWEEN 1 AND 200),
  CONSTRAINT church_settings_denomination_len
    CHECK (denomination IS NULL OR char_length(denomination) BETWEEN 1 AND 120),
  CONSTRAINT church_settings_primary_email_len
    CHECK (primary_email IS NULL OR char_length(primary_email) BETWEEN 3 AND 254),
  CONSTRAINT church_settings_primary_phone_len
    CHECK (primary_phone IS NULL OR char_length(primary_phone) BETWEEN 3 AND 32),
  CONSTRAINT church_settings_timezone_len
    CHECK (default_timezone IS NULL OR char_length(default_timezone) BETWEEN 1 AND 64),
  CONSTRAINT church_settings_country_code_format
    CHECK (default_country_code IS NULL OR default_country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT church_settings_website_status_check
    CHECK (website_status IN ('draft', 'published', 'suspended')),
  CONSTRAINT church_settings_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE INDEX IF NOT EXISTS church_settings_website_status_idx
  ON blessboard.church_settings (website_status);
