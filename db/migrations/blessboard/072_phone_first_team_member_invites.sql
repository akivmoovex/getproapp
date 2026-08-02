-- Prompt 10H: phone-first HQ/branch team member creation.
-- Organisation-scoped phone uniqueness (branches are scopes, not tenants).
-- Email remains optional when phone is present.

-- ---------------------------------------------------------------------------
-- Users: optional phone; email may be null when phone is set
-- ---------------------------------------------------------------------------
ALTER TABLE blessboard.users
  ADD COLUMN IF NOT EXISTS phone_normalized TEXT NULL,
  ADD COLUMN IF NOT EXISTS phone_display TEXT NULL;

ALTER TABLE blessboard.users
  DROP CONSTRAINT IF EXISTS users_email_normalized_format;

ALTER TABLE blessboard.users
  ALTER COLUMN email_normalized DROP NOT NULL;

ALTER TABLE blessboard.users
  ALTER COLUMN email_display DROP NOT NULL;

ALTER TABLE blessboard.users
  DROP CONSTRAINT IF EXISTS users_email_normalized_unique;

ALTER TABLE blessboard.users
  DROP CONSTRAINT IF EXISTS users_email_display_len;

ALTER TABLE blessboard.users
  ADD CONSTRAINT users_email_normalized_format
    CHECK (
      email_normalized IS NULL
      OR (
        email_normalized = lower(trim(email_normalized))
        AND email_normalized ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
        AND char_length(email_normalized) BETWEEN 3 AND 254
      )
    );

ALTER TABLE blessboard.users
  ADD CONSTRAINT users_email_display_len
    CHECK (
      email_display IS NULL
      OR char_length(email_display) BETWEEN 1 AND 254
    );

ALTER TABLE blessboard.users
  ADD CONSTRAINT users_phone_normalized_format
    CHECK (
      phone_normalized IS NULL
      OR (
        phone_normalized ~ '^\+[1-9][0-9]{6,14}$'
        AND char_length(phone_normalized) BETWEEN 8 AND 20
      )
    );

ALTER TABLE blessboard.users
  ADD CONSTRAINT users_phone_display_len
    CHECK (
      phone_display IS NULL
      OR char_length(phone_display) BETWEEN 1 AND 40
    );

ALTER TABLE blessboard.users
  ADD CONSTRAINT users_contact_required
    CHECK (
      email_normalized IS NOT NULL
      OR phone_normalized IS NOT NULL
    );

CREATE UNIQUE INDEX IF NOT EXISTS users_email_normalized_uidx
  ON blessboard.users (email_normalized)
  WHERE email_normalized IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Authoritative org-scoped staff phone uniqueness
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

-- ---------------------------------------------------------------------------
-- Invitations: phone support; email optional when phone present
-- ---------------------------------------------------------------------------
ALTER TABLE blessboard.user_invitations
  ADD COLUMN IF NOT EXISTS phone_normalized TEXT NULL,
  ADD COLUMN IF NOT EXISTS phone_display TEXT NULL;

ALTER TABLE blessboard.user_invitations
  ALTER COLUMN email_normalized DROP NOT NULL;

ALTER TABLE blessboard.user_invitations
  ALTER COLUMN email_display DROP NOT NULL;

ALTER TABLE blessboard.user_invitations
  DROP CONSTRAINT IF EXISTS user_invitations_email_normalized_format;

ALTER TABLE blessboard.user_invitations
  DROP CONSTRAINT IF EXISTS user_invitations_email_display_len;

ALTER TABLE blessboard.user_invitations
  ADD CONSTRAINT user_invitations_email_normalized_format
    CHECK (
      email_normalized IS NULL
      OR (
        email_normalized = lower(trim(email_normalized))
        AND email_normalized ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
        AND char_length(email_normalized) BETWEEN 3 AND 254
      )
    );

ALTER TABLE blessboard.user_invitations
  ADD CONSTRAINT user_invitations_email_display_len
    CHECK (
      email_display IS NULL
      OR char_length(email_display) BETWEEN 1 AND 254
    );

ALTER TABLE blessboard.user_invitations
  ADD CONSTRAINT user_invitations_phone_normalized_format
    CHECK (
      phone_normalized IS NULL
      OR (
        phone_normalized ~ '^\+[1-9][0-9]{6,14}$'
        AND char_length(phone_normalized) BETWEEN 8 AND 20
      )
    );

ALTER TABLE blessboard.user_invitations
  ADD CONSTRAINT user_invitations_phone_display_len
    CHECK (
      phone_display IS NULL
      OR char_length(phone_display) BETWEEN 1 AND 40
    );

ALTER TABLE blessboard.user_invitations
  ADD CONSTRAINT user_invitations_contact_required
    CHECK (
      email_normalized IS NOT NULL
      OR phone_normalized IS NOT NULL
    );

CREATE UNIQUE INDEX IF NOT EXISTS user_invitations_pending_phone_uidx
  ON blessboard.user_invitations (organization_id, phone_normalized)
  WHERE status = 'pending' AND phone_normalized IS NOT NULL;

-- Phone-only invites share NULL email; the legacy pending-scope index used
-- NULLS NOT DISTINCT and incorrectly blocked distinct phone invites.
DROP INDEX IF EXISTS blessboard.user_invitations_pending_scope_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS user_invitations_pending_email_scope_uidx
  ON blessboard.user_invitations (
    organization_id,
    email_normalized,
    role_key,
    church_id,
    branch_id
  )
  NULLS NOT DISTINCT
  WHERE status = 'pending' AND email_normalized IS NOT NULL;

CREATE OR REPLACE FUNCTION blessboard.normalize_user_email()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.email_normalized IS NOT NULL THEN
    NEW.email_normalized := lower(trim(NEW.email_normalized));
  END IF;
  IF NEW.email_display IS NOT NULL THEN
    NEW.email_display := trim(NEW.email_display);
  END IF;
  NEW.display_name := trim(NEW.display_name);
  IF NEW.phone_normalized IS NOT NULL THEN
    NEW.phone_normalized := trim(NEW.phone_normalized);
  END IF;
  IF NEW.phone_display IS NOT NULL THEN
    NEW.phone_display := trim(NEW.phone_display);
  END IF;
  RETURN NEW;
END;
$$;
