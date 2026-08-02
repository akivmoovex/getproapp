-- Prompt 11B: phone identity foundation (additive, migration-compatible).
-- Organisation = tenant. Phone uniqueness remains on organization_staff_phones
-- (organization_id, phone_normalized) from migration 072 — not branch-scoped,
-- not a global unique on blessboard.users.

-- ---------------------------------------------------------------------------
-- Users: verification + preference metadata (nullable for email-only rows)
-- ---------------------------------------------------------------------------
ALTER TABLE blessboard.users
  ADD COLUMN IF NOT EXISTS phone_country_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS preferred_login_identifier TEXT NULL,
  ADD COLUMN IF NOT EXISTS preferred_contact_channel TEXT NULL;

ALTER TABLE blessboard.users
  DROP CONSTRAINT IF EXISTS users_phone_country_code_format;

ALTER TABLE blessboard.users
  ADD CONSTRAINT users_phone_country_code_format
    CHECK (
      phone_country_code IS NULL
      OR phone_country_code ~ '^[A-Z]{2}$'
    );

ALTER TABLE blessboard.users
  DROP CONSTRAINT IF EXISTS users_preferred_login_identifier_check;

ALTER TABLE blessboard.users
  ADD CONSTRAINT users_preferred_login_identifier_check
    CHECK (
      preferred_login_identifier IS NULL
      OR preferred_login_identifier IN ('phone', 'email')
    );

ALTER TABLE blessboard.users
  DROP CONSTRAINT IF EXISTS users_preferred_contact_channel_check;

ALTER TABLE blessboard.users
  ADD CONSTRAINT users_preferred_contact_channel_check
    CHECK (
      preferred_contact_channel IS NULL
      OR preferred_contact_channel IN ('whatsapp', 'sms', 'email')
    );

-- Administrators must not mark phones verified by writing this column alone;
-- application services set phone_verified_at only after OTP/provider success.

COMMENT ON COLUMN blessboard.users.phone_normalized IS
  'E.164 phone. Global users table; tenant uniqueness enforced via organization_staff_phones.';
COMMENT ON COLUMN blessboard.users.phone_verified_at IS
  'Set only after successful phone verification (OTP). Null means unverified or missing.';
COMMENT ON COLUMN blessboard.users.preferred_login_identifier IS
  'phone | email — preference hint; authentication still accepts either when present.';
COMMENT ON COLUMN blessboard.users.preferred_contact_channel IS
  'whatsapp | sms | email — operational contact preference.';

-- ---------------------------------------------------------------------------
-- Invitations: optional country code for display / share helpers
-- ---------------------------------------------------------------------------
ALTER TABLE blessboard.user_invitations
  ADD COLUMN IF NOT EXISTS phone_country_code TEXT NULL;

ALTER TABLE blessboard.user_invitations
  DROP CONSTRAINT IF EXISTS user_invitations_phone_country_code_format;

ALTER TABLE blessboard.user_invitations
  ADD CONSTRAINT user_invitations_phone_country_code_format
    CHECK (
      phone_country_code IS NULL
      OR phone_country_code ~ '^[A-Z]{2}$'
    );

-- ---------------------------------------------------------------------------
-- Ensure tenant staff-phone uniqueness index exists (idempotent with 072)
-- Conceptual equivalent: UNIQUE (organization_id, normalized_phone)
-- WHERE normalized_phone IS NOT NULL — enforced as PK on organization_staff_phones.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blessboard.organization_staff_phones (
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  phone_normalized TEXT NOT NULL,
  user_id UUID NOT NULL
    REFERENCES blessboard.users (id)
    ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, phone_normalized),
  CONSTRAINT organization_staff_phones_phone_format
    CHECK (
      phone_normalized ~ '^\+[1-9][0-9]{6,14}$'
      AND char_length(phone_normalized) BETWEEN 8 AND 20
    )
);

CREATE INDEX IF NOT EXISTS organization_staff_phones_user_idx
  ON blessboard.organization_staff_phones (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS organization_staff_phones_org_user_uidx
  ON blessboard.organization_staff_phones (organization_id, user_id);

COMMENT ON TABLE blessboard.organization_staff_phones IS
  'Authoritative organisation-scoped staff phone uniqueness (HQ and branches share tenant).';
