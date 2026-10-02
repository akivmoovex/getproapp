-- AC-V6-06: allow one platform identity to link multiple ActiveClinic staff profiles
-- (one per healthcare organization). BlessBoard remains one profile per identity.

DROP INDEX IF EXISTS platform.identity_product_profiles_identity_product_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS identity_product_profiles_identity_blessboard_uidx
  ON platform.identity_product_profiles (identity_id, product_key)
  WHERE status = 'active' AND product_key = 'blessboard';

-- ActiveClinic: one link row per (identity, staff profile); multi-org allowed.
CREATE UNIQUE INDEX IF NOT EXISTS identity_product_profiles_identity_ac_profile_uidx
  ON platform.identity_product_profiles (identity_id, product_key, product_profile_id)
  WHERE status = 'active' AND product_key = 'activeclinic';

COMMENT ON INDEX platform.identity_product_profiles_identity_blessboard_uidx IS
  'BlessBoard: at most one active product profile per identity.';
COMMENT ON INDEX platform.identity_product_profiles_identity_ac_profile_uidx IS
  'ActiveClinic: identity may link multiple staff profiles across organizations.';
