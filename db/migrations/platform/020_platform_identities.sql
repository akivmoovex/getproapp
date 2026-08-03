-- AC-V6-04: product-neutral platform identities + product-profile links.
-- Additive only. Does not move BlessBoard credentials or rewrite sessions.

-- ---------------------------------------------------------------------------
-- platform.identities — authentication account (no org/product/clinical data)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'active',
  primary_phone TEXT NULL,
  phone_normalized TEXT NULL,
  phone_verified_at TIMESTAMPTZ NULL,
  primary_email TEXT NULL,
  email_normalized TEXT NULL,
  email_verified_at TIMESTAMPTZ NULL,
  -- Nullable during transition: BlessBoard-linked identities keep password on
  -- blessboard.users until an explicit credential cutover (strategy B).
  password_hash TEXT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  locked_at TIMESTAMPTZ NULL,
  suspended_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT identities_status_check
    CHECK (status IN ('active', 'inactive', 'suspended')),
  CONSTRAINT identities_email_normalized_format
    CHECK (
      email_normalized IS NULL
      OR (
        email_normalized = lower(trim(email_normalized))
        AND email_normalized ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
        AND char_length(email_normalized) BETWEEN 3 AND 254
      )
    ),
  CONSTRAINT identities_primary_email_len
    CHECK (
      primary_email IS NULL
      OR char_length(primary_email) BETWEEN 1 AND 254
    ),
  CONSTRAINT identities_phone_normalized_format
    CHECK (
      phone_normalized IS NULL
      OR (
        phone_normalized ~ '^\+[1-9][0-9]{6,14}$'
        AND char_length(phone_normalized) BETWEEN 8 AND 20
      )
    ),
  CONSTRAINT identities_primary_phone_len
    CHECK (
      primary_phone IS NULL
      OR char_length(primary_phone) BETWEEN 1 AND 40
    ),
  CONSTRAINT identities_password_hash_len
    CHECK (
      password_hash IS NULL
      OR char_length(password_hash) BETWEEN 20 AND 200
    ),
  CONSTRAINT identities_phone_verified_requires_phone
    CHECK (
      phone_verified_at IS NULL
      OR phone_normalized IS NOT NULL
    ),
  CONSTRAINT identities_email_verified_requires_email
    CHECK (
      email_verified_at IS NULL
      OR email_normalized IS NOT NULL
    ),
  CONSTRAINT identities_suspended_at_consistent
    CHECK (
      (status = 'suspended' AND suspended_at IS NOT NULL)
      OR (status <> 'suspended' AND suspended_at IS NULL)
    ),
  CONSTRAINT identities_locked_after_created
    CHECK (locked_at IS NULL OR locked_at >= created_at),
  CONSTRAINT identities_suspended_after_created
    CHECK (suspended_at IS NULL OR suspended_at >= created_at)
);

COMMENT ON TABLE platform.identities IS
  'Product-neutral authentication identity. No org, product, or clinical ownership.';
COMMENT ON COLUMN platform.identities.password_hash IS
  'Optional. Null when credential remains on a product profile (BlessBoard transition). Never duplicate hashes across products.';

CREATE UNIQUE INDEX IF NOT EXISTS identities_verified_phone_uidx
  ON platform.identities (phone_normalized)
  WHERE phone_normalized IS NOT NULL
    AND phone_verified_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS identities_verified_email_uidx
  ON platform.identities (email_normalized)
  WHERE email_normalized IS NOT NULL
    AND email_verified_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS identities_phone_normalized_idx
  ON platform.identities (phone_normalized)
  WHERE phone_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS identities_email_normalized_idx
  ON platform.identities (email_normalized)
  WHERE email_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS identities_status_idx
  ON platform.identities (status);

CREATE OR REPLACE FUNCTION platform.normalize_identity_contacts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.email_normalized IS NOT NULL THEN
    NEW.email_normalized := lower(trim(NEW.email_normalized));
  END IF;
  IF NEW.primary_email IS NOT NULL THEN
    NEW.primary_email := trim(NEW.primary_email);
  END IF;
  IF NEW.primary_phone IS NOT NULL THEN
    NEW.primary_phone := trim(NEW.primary_phone);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS identities_normalize_contacts ON platform.identities;
CREATE TRIGGER identities_normalize_contacts
  BEFORE INSERT OR UPDATE OF email_normalized, primary_email, primary_phone, status,
    phone_normalized, phone_verified_at, email_verified_at, password_hash,
    must_change_password, locked_at, suspended_at
  ON platform.identities
  FOR EACH ROW
  EXECUTE FUNCTION platform.normalize_identity_contacts();

-- ---------------------------------------------------------------------------
-- platform.identity_product_profiles — explicit product profile links
-- product_profile_id is validated in application code (not a polymorphic FK).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.identity_product_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL
    REFERENCES platform.identities (id)
    ON DELETE RESTRICT,
  product_key TEXT NOT NULL
    REFERENCES platform.products (product_key)
    ON DELETE RESTRICT,
  profile_type TEXT NOT NULL,
  product_profile_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT identity_product_profiles_status_check
    CHECK (status IN ('active', 'inactive', 'revoked')),
  CONSTRAINT identity_product_profiles_profile_type_check
    CHECK (
      profile_type IN ('blessboard_user', 'activeclinic_staff')
    ),
  CONSTRAINT identity_product_profiles_product_profile_type_consistency
    CHECK (
      (product_key = 'blessboard' AND profile_type = 'blessboard_user')
      OR (product_key = 'activeclinic' AND profile_type = 'activeclinic_staff')
    )
);

COMMENT ON TABLE platform.identity_product_profiles IS
  'Links a platform identity to a product-specific profile id. Existence does not grant org/product access.';

CREATE UNIQUE INDEX IF NOT EXISTS identity_product_profiles_identity_product_uidx
  ON platform.identity_product_profiles (identity_id, product_key)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS identity_product_profiles_product_profile_uidx
  ON platform.identity_product_profiles (product_key, product_profile_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS identity_product_profiles_identity_idx
  ON platform.identity_product_profiles (identity_id)
  WHERE status = 'active';

CREATE OR REPLACE FUNCTION platform.touch_identity_product_profiles()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS identity_product_profiles_touch ON platform.identity_product_profiles;
CREATE TRIGGER identity_product_profiles_touch
  BEFORE UPDATE ON platform.identity_product_profiles
  FOR EACH ROW
  EXECUTE FUNCTION platform.touch_identity_product_profiles();

-- ---------------------------------------------------------------------------
-- Sessions: additive nullable platform identity reference (no cutover)
-- ---------------------------------------------------------------------------
ALTER TABLE platform.deployment_sessions
  ADD COLUMN IF NOT EXISTS platform_identity_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'deployment_sessions_platform_identity_id_fkey'
  ) THEN
    ALTER TABLE platform.deployment_sessions
      ADD CONSTRAINT deployment_sessions_platform_identity_id_fkey
      FOREIGN KEY (platform_identity_id)
      REFERENCES platform.identities (id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS deployment_sessions_platform_identity_id_idx
  ON platform.deployment_sessions (platform_identity_id)
  WHERE platform_identity_id IS NOT NULL;

COMMENT ON COLUMN platform.deployment_sessions.platform_identity_id IS
  'Optional platform identity principal. BlessBoard sessions continue to use user_id; ActiveClinic cutover is a future migration.';
