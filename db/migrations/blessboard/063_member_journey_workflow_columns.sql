-- Member journey operational workflow columns (additive; testing controlled apply).

ALTER TABLE blessboard.journey_contacts
  ADD COLUMN IF NOT EXISTS follow_up_status TEXT NULL;

ALTER TABLE blessboard.journey_contacts
  ADD COLUMN IF NOT EXISTS follow_up_assigned_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT;

ALTER TABLE blessboard.journey_contacts
  ADD COLUMN IF NOT EXISTS follow_up_updated_at TIMESTAMPTZ NULL;

ALTER TABLE blessboard.journey_contacts
  ADD COLUMN IF NOT EXISTS follow_up_outcome_summary TEXT NULL;

ALTER TABLE blessboard.journey_contacts
  DROP CONSTRAINT IF EXISTS journey_contacts_follow_up_status_check;

ALTER TABLE blessboard.journey_contacts
  ADD CONSTRAINT journey_contacts_follow_up_status_check
    CHECK (
      follow_up_status IS NULL
      OR follow_up_status IN (
        'pending', 'contacted', 'unreachable', 'scheduled', 'attended', 'declined'
      )
    );

ALTER TABLE blessboard.journey_contacts
  DROP CONSTRAINT IF EXISTS journey_contacts_follow_up_outcome_len;

ALTER TABLE blessboard.journey_contacts
  ADD CONSTRAINT journey_contacts_follow_up_outcome_len
    CHECK (
      follow_up_outcome_summary IS NULL
      OR char_length(follow_up_outcome_summary) BETWEEN 1 AND 500
    );

ALTER TABLE blessboard.cell_memberships
  ADD COLUMN IF NOT EXISTS transfer_reason TEXT NULL;

ALTER TABLE blessboard.cell_memberships
  DROP CONSTRAINT IF EXISTS cell_memberships_transfer_reason_len;

ALTER TABLE blessboard.cell_memberships
  ADD CONSTRAINT cell_memberships_transfer_reason_len
    CHECK (
      transfer_reason IS NULL OR char_length(transfer_reason) BETWEEN 1 AND 500
    );

ALTER TABLE blessboard.cell_memberships
  ADD COLUMN IF NOT EXISTS care_status TEXT NULL;

ALTER TABLE blessboard.cell_memberships
  DROP CONSTRAINT IF EXISTS cell_memberships_care_status_check;

ALTER TABLE blessboard.cell_memberships
  ADD CONSTRAINT cell_memberships_care_status_check
    CHECK (
      care_status IS NULL
      OR care_status IN ('active', 'needs_follow_up', 'inactive')
    );

CREATE INDEX IF NOT EXISTS journey_contacts_follow_up_status_idx
  ON blessboard.journey_contacts (church_id, follow_up_status)
  WHERE follow_up_status IS NOT NULL;
