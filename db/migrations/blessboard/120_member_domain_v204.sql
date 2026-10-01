-- V2.04 Phase 4 — BlessBoard member domain foundation (additive).
-- Membership lifecycle + portal access separation + profile fields + RBAC.
-- Does not drop legacy columns. No production apply in this commit.

-- ---------------------------------------------------------------------------
-- Membership lifecycle statuses (canonical) + keep legacy pending/suspended/archived
-- ---------------------------------------------------------------------------
ALTER TABLE blessboard.members
  DROP CONSTRAINT IF EXISTS members_status_check;

ALTER TABLE blessboard.members
  ADD CONSTRAINT members_status_check
  CHECK (
    status IN (
      'pending',
      'active',
      'inactive',
      'suspended',
      'archived',
      'transferred',
      'former',
      'deceased'
    )
  );

COMMENT ON COLUMN blessboard.members.status IS
  'V2.04 membership lifecycle: active|inactive|transferred|former|deceased (+ legacy pending/suspended/archived).';

-- Portal access is separate from membership.
ALTER TABLE blessboard.members
  ADD COLUMN IF NOT EXISTS portal_access_status TEXT NOT NULL DEFAULT 'not_activated';

ALTER TABLE blessboard.members
  DROP CONSTRAINT IF EXISTS members_portal_access_status_check;

ALTER TABLE blessboard.members
  ADD CONSTRAINT members_portal_access_status_check
  CHECK (
    portal_access_status IN ('not_activated', 'active', 'blocked')
  );

COMMENT ON COLUMN blessboard.members.portal_access_status IS
  'V2.04 portal access independent of membership: not_activated|active|blocked.';

-- Optional link to platform.persons (reuse); not required for staff-created members.
ALTER TABLE blessboard.members
  ADD COLUMN IF NOT EXISTS platform_person_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'members_platform_person_fk'
  ) THEN
    ALTER TABLE blessboard.members
      ADD CONSTRAINT members_platform_person_fk
      FOREIGN KEY (platform_person_id)
      REFERENCES platform.persons (id)
      ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    -- platform.persons may not exist yet in some isolated migration orders; skip FK.
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS members_platform_person_idx
  ON blessboard.members (platform_person_id)
  WHERE platform_person_id IS NOT NULL;

-- Profile fields (staff/member editable per rules; Church ID / official branch excluded).
ALTER TABLE blessboard.members
  ADD COLUMN IF NOT EXISTS date_of_birth DATE NULL;

ALTER TABLE blessboard.members
  ADD COLUMN IF NOT EXISTS occupation TEXT NULL;

ALTER TABLE blessboard.members
  ADD COLUMN IF NOT EXISTS marital_status TEXT NULL;

ALTER TABLE blessboard.members
  ADD COLUMN IF NOT EXISTS number_of_children INTEGER NULL;

ALTER TABLE blessboard.members
  ADD COLUMN IF NOT EXISTS address_line_1 TEXT NULL;

ALTER TABLE blessboard.members
  ADD COLUMN IF NOT EXISTS address_line_2 TEXT NULL;

ALTER TABLE blessboard.members
  ADD COLUMN IF NOT EXISTS address_city TEXT NULL;

ALTER TABLE blessboard.members
  ADD COLUMN IF NOT EXISTS address_district TEXT NULL;

ALTER TABLE blessboard.members
  ADD COLUMN IF NOT EXISTS address_province TEXT NULL;

ALTER TABLE blessboard.members
  ADD COLUMN IF NOT EXISTS address_country_code TEXT NULL;

ALTER TABLE blessboard.members
  ADD COLUMN IF NOT EXISTS address_postal_code TEXT NULL;

ALTER TABLE blessboard.members
  ADD COLUMN IF NOT EXISTS next_of_kin_name TEXT NULL;

ALTER TABLE blessboard.members
  ADD COLUMN IF NOT EXISTS next_of_kin_relationship TEXT NULL;

ALTER TABLE blessboard.members
  ADD COLUMN IF NOT EXISTS next_of_kin_phone_display TEXT NULL;

ALTER TABLE blessboard.members
  ADD COLUMN IF NOT EXISTS next_of_kin_phone_normalized TEXT NULL;

-- Phone change / recovery verification gate (preserve verification requirements).
ALTER TABLE blessboard.members
  ADD COLUMN IF NOT EXISTS phone_pending_normalized TEXT NULL;

ALTER TABLE blessboard.members
  ADD COLUMN IF NOT EXISTS phone_pending_display TEXT NULL;

ALTER TABLE blessboard.members
  ADD COLUMN IF NOT EXISTS phone_verification_required BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE blessboard.members
  DROP CONSTRAINT IF EXISTS members_occupation_len;
ALTER TABLE blessboard.members
  ADD CONSTRAINT members_occupation_len
  CHECK (occupation IS NULL OR char_length(occupation) BETWEEN 1 AND 120);

ALTER TABLE blessboard.members
  DROP CONSTRAINT IF EXISTS members_marital_status_check;
ALTER TABLE blessboard.members
  ADD CONSTRAINT members_marital_status_check
  CHECK (
    marital_status IS NULL
    OR marital_status IN (
      'single',
      'married',
      'divorced',
      'widowed',
      'separated',
      'other',
      'prefer_not_to_say'
    )
  );

ALTER TABLE blessboard.members
  DROP CONSTRAINT IF EXISTS members_number_of_children_check;
ALTER TABLE blessboard.members
  ADD CONSTRAINT members_number_of_children_check
  CHECK (number_of_children IS NULL OR number_of_children BETWEEN 0 AND 50);

ALTER TABLE blessboard.members
  DROP CONSTRAINT IF EXISTS members_next_of_kin_phone_format;
ALTER TABLE blessboard.members
  ADD CONSTRAINT members_next_of_kin_phone_format
  CHECK (
    next_of_kin_phone_normalized IS NULL
    OR (
      next_of_kin_phone_normalized ~ '^\+[1-9][0-9]{6,14}$'
      AND char_length(next_of_kin_phone_normalized) BETWEEN 8 AND 20
    )
  );

ALTER TABLE blessboard.members
  DROP CONSTRAINT IF EXISTS members_phone_pending_format;
ALTER TABLE blessboard.members
  ADD CONSTRAINT members_phone_pending_format
  CHECK (
    phone_pending_normalized IS NULL
    OR (
      phone_pending_normalized ~ '^\+[1-9][0-9]{6,14}$'
      AND char_length(phone_pending_normalized) BETWEEN 8 AND 20
    )
  );

-- Church ID uniqueness within church for all rows with a number (immutable identity).
DROP INDEX IF EXISTS blessboard.members_church_member_number_live_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS members_church_member_number_uidx
  ON blessboard.members (church_id, lower(trim(member_number)))
  WHERE member_number IS NOT NULL;

-- Live contact uniqueness also covers new lifecycle statuses.
DROP INDEX IF EXISTS blessboard.members_church_email_live_uidx;
DROP INDEX IF EXISTS blessboard.members_church_phone_live_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS members_church_email_live_uidx
  ON blessboard.members (church_id, email_normalized)
  WHERE email_normalized IS NOT NULL
    AND status IN (
      'pending', 'active', 'inactive', 'suspended', 'transferred'
    );

CREATE UNIQUE INDEX IF NOT EXISTS members_church_phone_live_uidx
  ON blessboard.members (church_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL
    AND status IN (
      'pending', 'active', 'inactive', 'suspended', 'transferred'
    );

-- ---------------------------------------------------------------------------
-- RBAC: granular member capabilities (roles receive these — not hard-coded titles)
-- ---------------------------------------------------------------------------
INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  (
    'members.block',
    'members',
    'block',
    'Block member portal access',
    'Block or unblock member portal access without changing membership',
    'sensitive'
  ),
  (
    'members.manage_church_id',
    'members',
    'manage_church_id',
    'Manage Church ID',
    'Assign or change church-controlled Church ID / member number',
    'sensitive'
  )
ON CONFLICT (permission_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  sensitivity = EXCLUDED.sensitivity,
  resource_key = EXCLUDED.resource_key,
  action_key = EXCLUDED.action_key,
  is_active = true,
  updated_at = now();

-- Grant to admin catalogue roles that already manage members (not Pastor/Secretary hard-codes).
INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE p.permission_key IN ('members.block', 'members.manage_church_id')
   AND r.role_key IN (
     'organisation_administrator',
     'church_system_administrator',
     'branch_administrator',
     'platform_administrator'
   )
ON CONFLICT DO NOTHING;

-- Backfill portal_access_status from user_id / suspended.
UPDATE blessboard.members
   SET portal_access_status = CASE
     WHEN status = 'suspended' THEN 'blocked'
     WHEN user_id IS NOT NULL THEN 'active'
     ELSE 'not_activated'
   END
 WHERE portal_access_status = 'not_activated'
    OR portal_access_status IS NULL;

-- Reversal notes (manual):
--   DELETE FROM blessboard.role_permissions WHERE permission_id IN
--     (SELECT id FROM blessboard.permissions WHERE permission_key IN
--       ('members.block','members.manage_church_id'));
--   DELETE FROM blessboard.permissions WHERE permission_key IN
--     ('members.block','members.manage_church_id');
--   ALTER TABLE blessboard.members DROP COLUMN IF EXISTS portal_access_status;
--   (profile / pending phone columns similarly)
