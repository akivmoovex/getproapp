-- AC-V6-P27: expand identity_product_profiles + identity_action_tokens for patient portal.
-- Append-only. Does not alter prior migration checksums.

-- ---------------------------------------------------------------------------
-- Allow activeclinic_patient profile type
-- ---------------------------------------------------------------------------
ALTER TABLE platform.identity_product_profiles
  DROP CONSTRAINT IF EXISTS identity_product_profiles_profile_type_check;

ALTER TABLE platform.identity_product_profiles
  ADD CONSTRAINT identity_product_profiles_profile_type_check
  CHECK (
    profile_type IN (
      'blessboard_user',
      'activeclinic_staff',
      'activeclinic_patient'
    )
  );

COMMENT ON CONSTRAINT identity_product_profiles_profile_type_check
  ON platform.identity_product_profiles IS
  'BlessBoard users, ActiveClinic staff members, and ActiveClinic patients.';

-- ---------------------------------------------------------------------------
-- Expand product/profile consistency
-- ---------------------------------------------------------------------------
ALTER TABLE platform.identity_product_profiles
  DROP CONSTRAINT IF EXISTS identity_product_profiles_product_profile_type_consistency;

ALTER TABLE platform.identity_product_profiles
  DROP CONSTRAINT IF EXISTS identity_product_profiles_product_profile_consistency;

ALTER TABLE platform.identity_product_profiles
  ADD CONSTRAINT identity_product_profiles_product_profile_type_consistency
  CHECK (
    (product_key = 'blessboard' AND profile_type = 'blessboard_user')
    OR (product_key = 'activeclinic' AND profile_type IN ('activeclinic_staff', 'activeclinic_patient'))
  );

COMMENT ON CONSTRAINT identity_product_profiles_product_profile_type_consistency
  ON platform.identity_product_profiles IS
  'ActiveClinic allows staff OR patient profiles; BlessBoard uses user profiles only.';

-- ---------------------------------------------------------------------------
-- Expand identity_action_tokens purposes for patient portal
-- ---------------------------------------------------------------------------
ALTER TABLE platform.identity_action_tokens
  DROP CONSTRAINT IF EXISTS identity_action_tokens_purpose_check;

ALTER TABLE platform.identity_action_tokens
  ADD CONSTRAINT identity_action_tokens_purpose_check
  CHECK (
    purpose IN (
      'activeclinic_staff_activation',
      'activeclinic_password_reset',
      'activeclinic_patient_password_reset',
      'activeclinic_patient_phone_verification'
    )
  );

COMMENT ON CONSTRAINT identity_action_tokens_purpose_check
  ON platform.identity_action_tokens IS
  'Staff and patient activation, password reset, and patient phone verification tokens.';
