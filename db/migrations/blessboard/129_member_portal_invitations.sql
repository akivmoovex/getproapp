-- BB-11B3: isolated ordinary-member portal activation invitations.
-- Staff invitations remain in blessboard.user_invitations unchanged.

CREATE TABLE IF NOT EXISTS blessboard.member_portal_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id) ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id) ON DELETE RESTRICT,
  branch_id UUID NULL
    REFERENCES blessboard.branches (id) ON DELETE RESTRICT,
  member_id UUID NOT NULL
    REFERENCES blessboard.members (id) ON DELETE RESTRICT,
  recipient_user_id UUID NULL
    REFERENCES blessboard.users (id) ON DELETE SET NULL,
  purpose TEXT NOT NULL DEFAULT 'MEMBER_PORTAL_ACTIVATION',
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  invited_by_user_id UUID NULL
    REFERENCES blessboard.users (id) ON DELETE SET NULL,
  accepted_user_id UUID NULL
    REFERENCES blessboard.users (id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  revoked_by_user_id UUID NULL
    REFERENCES blessboard.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT member_portal_invitations_purpose_check
    CHECK (purpose = 'MEMBER_PORTAL_ACTIVATION'),
  CONSTRAINT member_portal_invitations_status_check
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  CONSTRAINT member_portal_invitations_token_hash_len
    CHECK (char_length(token_hash) = 64),
  CONSTRAINT member_portal_invitations_expiry_check
    CHECK (expires_at > created_at),
  CONSTRAINT member_portal_invitations_acceptance_check
    CHECK (
      (status = 'accepted' AND accepted_at IS NOT NULL AND accepted_user_id IS NOT NULL)
      OR (status <> 'accepted' AND accepted_at IS NULL AND accepted_user_id IS NULL)
    ),
  CONSTRAINT member_portal_invitations_revocation_check
    CHECK (
      (status = 'revoked' AND revoked_at IS NOT NULL)
      OR (status <> 'revoked' AND revoked_at IS NULL AND revoked_by_user_id IS NULL)
    ),
  CONSTRAINT member_portal_invitations_updated_after_created
    CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS member_portal_invitations_token_hash_uidx
  ON blessboard.member_portal_invitations (token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS member_portal_invitations_pending_member_uidx
  ON blessboard.member_portal_invitations (member_id, purpose)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS member_portal_invitations_church_status_idx
  ON blessboard.member_portal_invitations (church_id, status, expires_at);

CREATE INDEX IF NOT EXISTS member_portal_invitations_organization_idx
  ON blessboard.member_portal_invitations (organization_id, status, expires_at);

CREATE OR REPLACE FUNCTION blessboard.validate_member_portal_invitation_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  church_org UUID;
  branch_church UUID;
  member_church UUID;
BEGIN
  SELECT c.organization_id INTO church_org
    FROM blessboard.churches c WHERE c.id = NEW.church_id;
  IF church_org IS NULL OR church_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'member portal invitation church/organization mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  SELECT b.church_id INTO branch_church
    FROM blessboard.branches b WHERE b.id = NEW.branch_id;
  IF NEW.branch_id IS NOT NULL
     AND (branch_church IS NULL OR branch_church IS DISTINCT FROM NEW.church_id) THEN
    RAISE EXCEPTION 'member portal invitation branch/church mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  SELECT m.church_id INTO member_church
    FROM blessboard.members m WHERE m.id = NEW.member_id;
  IF member_church IS NULL OR member_church IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'member portal invitation member/church mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_portal_invitations_validate_ownership
  ON blessboard.member_portal_invitations;
CREATE TRIGGER member_portal_invitations_validate_ownership
  BEFORE INSERT OR UPDATE OF organization_id, church_id, branch_id, member_id
  ON blessboard.member_portal_invitations
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.validate_member_portal_invitation_ownership();
