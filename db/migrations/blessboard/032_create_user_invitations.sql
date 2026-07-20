-- Staff user invitations (hash-only tokens; copy-once delivery until email exists).
-- Allows password_hash NULL only while users.status = 'invited'.

ALTER TABLE blessboard.users
  ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE blessboard.users
  DROP CONSTRAINT IF EXISTS users_password_hash_len;

ALTER TABLE blessboard.users
  ADD CONSTRAINT users_password_hash_len
    CHECK (password_hash IS NULL OR char_length(password_hash) BETWEEN 20 AND 200);

ALTER TABLE blessboard.users
  DROP CONSTRAINT IF EXISTS users_invited_password_consistency;

ALTER TABLE blessboard.users
  ADD CONSTRAINT users_invited_password_consistency
    CHECK (
      (status = 'invited' AND password_hash IS NULL)
      OR (status <> 'invited' AND password_hash IS NOT NULL)
    );

CREATE TABLE IF NOT EXISTS blessboard.user_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  email_normalized TEXT NOT NULL,
  email_display TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role_key TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  invited_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE SET NULL,
  accepted_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  revoked_by_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_invitations_role_key_check
    CHECK (role_key IN ('church_hq_admin', 'branch_admin')),
  CONSTRAINT user_invitations_status_check
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  CONSTRAINT user_invitations_email_normalized_format
    CHECK (
      email_normalized = lower(trim(email_normalized))
      AND email_normalized ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
      AND char_length(email_normalized) BETWEEN 3 AND 254
    ),
  CONSTRAINT user_invitations_email_display_len
    CHECK (char_length(email_display) BETWEEN 1 AND 254),
  CONSTRAINT user_invitations_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 200),
  CONSTRAINT user_invitations_token_hash_len
    CHECK (char_length(token_hash) = 64),
  CONSTRAINT user_invitations_hq_scope
    CHECK (
      role_key <> 'church_hq_admin'
      OR branch_id IS NULL
    ),
  CONSTRAINT user_invitations_branch_scope
    CHECK (
      role_key <> 'branch_admin'
      OR branch_id IS NOT NULL
    ),
  CONSTRAINT user_invitations_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS user_invitations_token_hash_uidx
  ON blessboard.user_invitations (token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS user_invitations_pending_scope_uidx
  ON blessboard.user_invitations (
    organization_id,
    email_normalized,
    role_key,
    church_id,
    branch_id
  )
  NULLS NOT DISTINCT
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS user_invitations_org_status_idx
  ON blessboard.user_invitations (organization_id, status, expires_at);

CREATE INDEX IF NOT EXISTS user_invitations_email_idx
  ON blessboard.user_invitations (email_normalized);

CREATE OR REPLACE FUNCTION blessboard.validate_user_invitation_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  church_org UUID;
  branch_church UUID;
BEGIN
  SELECT c.organization_id INTO church_org
    FROM blessboard.churches c
   WHERE c.id = NEW.church_id;
  IF church_org IS NULL THEN
    RAISE EXCEPTION 'blessboard.user_invitations church_id not found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF church_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'blessboard.user_invitations church must belong to organization'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF NEW.branch_id IS NOT NULL THEN
    SELECT b.church_id INTO branch_church
      FROM blessboard.branches b
     WHERE b.id = NEW.branch_id;
    IF branch_church IS NULL THEN
      RAISE EXCEPTION 'blessboard.user_invitations branch_id not found'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF branch_church IS DISTINCT FROM NEW.church_id THEN
      RAISE EXCEPTION 'blessboard.user_invitations branch must belong to church'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  NEW.email_normalized := lower(trim(NEW.email_normalized));
  NEW.email_display := trim(NEW.email_display);
  NEW.display_name := trim(NEW.display_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_invitations_validate_ownership ON blessboard.user_invitations;
CREATE TRIGGER user_invitations_validate_ownership
  BEFORE INSERT OR UPDATE OF organization_id, church_id, branch_id, email_normalized, email_display, display_name
  ON blessboard.user_invitations
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.validate_user_invitation_ownership();
