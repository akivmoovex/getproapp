-- V2.11 ordinary-member portal activation invitations.
CREATE TABLE IF NOT EXISTS blessboard.member_portal_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE RESTRICT,
  church_id UUID NOT NULL REFERENCES blessboard.churches(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES blessboard.branches(id) ON DELETE RESTRICT,
  member_id UUID NOT NULL REFERENCES blessboard.members(id) ON DELETE RESTRICT,
  recipient_user_id UUID REFERENCES blessboard.users(id) ON DELETE SET NULL,
  purpose TEXT NOT NULL DEFAULT 'MEMBER_PORTAL_ACTIVATION',
  token_hash TEXT NOT NULL CHECK (char_length(token_hash) = 64),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','revoked','expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  invited_by_user_id UUID REFERENCES blessboard.users(id) ON DELETE SET NULL,
  accepted_user_id UUID REFERENCES blessboard.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id UUID REFERENCES blessboard.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (token_hash)
);

ALTER TABLE blessboard.member_portal_invitations
  ADD COLUMN IF NOT EXISTS recipient_user_id UUID REFERENCES blessboard.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'MEMBER_PORTAL_ACTIVATION',
  ADD COLUMN IF NOT EXISTS revoked_by_user_id UUID REFERENCES blessboard.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='blessboard' AND table_name='member_portal_invitations'
      AND column_name='token_hash' AND data_type <> 'text'
  ) THEN
    RAISE EXCEPTION 'member_portal_invitations.token_hash has incompatible type';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS member_portal_invitations_pending_member_uidx
  ON blessboard.member_portal_invitations(member_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS member_portal_invitations_scope_idx
  ON blessboard.member_portal_invitations(church_id, member_id, status, expires_at);

CREATE OR REPLACE FUNCTION blessboard.validate_member_portal_invitation_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  member_church UUID;
  branch_church UUID;
  church_org UUID;
BEGIN
  SELECT church_id INTO member_church FROM blessboard.members WHERE id = NEW.member_id;
  SELECT church_id INTO branch_church FROM blessboard.branches WHERE id = NEW.branch_id;
  SELECT organization_id INTO church_org FROM blessboard.churches WHERE id = NEW.church_id;
  IF member_church IS NULL OR member_church IS DISTINCT FROM NEW.church_id
     OR branch_church IS NULL OR branch_church IS DISTINCT FROM NEW.church_id
     OR church_org IS DISTINCT FROM NEW.organization_id
     OR NOT EXISTS (
       SELECT 1
         FROM blessboard.member_branch_memberships mbm
        WHERE mbm.member_id = NEW.member_id
          AND mbm.branch_id = NEW.branch_id
          AND mbm.membership_status = 'active'
     ) THEN
    RAISE EXCEPTION 'member portal invitation ownership mismatch'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS member_portal_invitations_validate_scope
  ON blessboard.member_portal_invitations;
CREATE TRIGGER member_portal_invitations_validate_scope
  BEFORE INSERT OR UPDATE OF organization_id, church_id, branch_id, member_id
  ON blessboard.member_portal_invitations
  FOR EACH ROW
  EXECUTE FUNCTION blessboard.validate_member_portal_invitation_scope();
