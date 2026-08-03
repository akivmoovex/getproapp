-- AC-V6-09: ActiveClinic staff invitation records (lifecycle + delivery metadata).
-- Additive only. Tokens live in platform.identity_action_tokens (hashed).
-- Rollback: DROP TABLE activeclinic.staff_invitations;

CREATE TABLE IF NOT EXISTS activeclinic.staff_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  staff_member_id UUID NOT NULL,
  platform_identity_id UUID NOT NULL
    REFERENCES platform.identities (id)
    ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  current_token_id UUID NULL
    REFERENCES platform.identity_action_tokens (id)
    ON DELETE SET NULL,
  issued_by_platform_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE SET NULL,
  delivery_status TEXT NOT NULL DEFAULT 'link_generated',
  delivery_method TEXT NULL,
  delivery_attempted_at TIMESTAMPTZ NULL,
  delivery_error_code TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_invitations_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT staff_invitations_staff_org_fk
    FOREIGN KEY (staff_member_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE CASCADE,
  CONSTRAINT staff_invitations_status_check
    CHECK (
      status IN (
        'draft',
        'pending',
        'accepted',
        'expired',
        'revoked'
      )
    ),
  CONSTRAINT staff_invitations_delivery_status_check
    CHECK (
      delivery_status IN (
        'not_requested',
        'link_generated',
        'queued',
        'sent',
        'failed',
        'unavailable'
      )
    ),
  CONSTRAINT staff_invitations_delivery_method_check
    CHECK (
      delivery_method IS NULL
      OR delivery_method IN (
        'copy_link',
        'email',
        'whatsapp_share',
        'manual',
        'none'
      )
    ),
  CONSTRAINT staff_invitations_delivery_error_code_len
    CHECK (
      delivery_error_code IS NULL
      OR char_length(btrim(delivery_error_code)) BETWEEN 1 AND 80
    ),
  CONSTRAINT staff_invitations_accepted_after_issued
    CHECK (accepted_at IS NULL OR accepted_at >= issued_at),
  CONSTRAINT staff_invitations_revoked_after_issued
    CHECK (revoked_at IS NULL OR revoked_at >= issued_at),
  CONSTRAINT staff_invitations_expires_after_issued
    CHECK (expires_at > issued_at)
);

COMMENT ON TABLE activeclinic.staff_invitations IS
  'Staff invitation lifecycle. Raw activation tokens are never stored here.';

CREATE INDEX IF NOT EXISTS staff_invitations_org_status_idx
  ON activeclinic.staff_invitations (organization_id, status, issued_at DESC);

CREATE INDEX IF NOT EXISTS staff_invitations_staff_idx
  ON activeclinic.staff_invitations (staff_member_id, issued_at DESC);

CREATE INDEX IF NOT EXISTS staff_invitations_identity_idx
  ON activeclinic.staff_invitations (platform_identity_id, issued_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS staff_invitations_staff_pending_uidx
  ON activeclinic.staff_invitations (staff_member_id)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION activeclinic.touch_staff_invitations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_invitations_touch ON activeclinic.staff_invitations;
CREATE TRIGGER staff_invitations_touch
  BEFORE UPDATE ON activeclinic.staff_invitations
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_staff_invitations();
