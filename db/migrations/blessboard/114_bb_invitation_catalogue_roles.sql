-- V2.02: Allow BlessBoard staff invitations to store catalogue role keys.
-- Additive / reversible. Keeps legacy invite keys for in-flight pending invites.
-- Does not drop blessboard.user_roles.

ALTER TABLE blessboard.user_invitations
  DROP CONSTRAINT IF EXISTS user_invitations_role_key_check;

ALTER TABLE blessboard.user_invitations
  ADD CONSTRAINT user_invitations_role_key_check
    CHECK (
      role_key IN (
        -- Legacy (pending invites may still use these during cutover)
        'church_hq_admin',
        'branch_admin',
        -- Catalogue staff roles
        'organisation_administrator',
        'church_system_administrator',
        'branch_administrator',
        'branch_pastor',
        'ministry_leader',
        'registration_officer',
        'first_timers_coordinator',
        'classes_coordinator',
        'cell_coordinator',
        'cell_leader',
        'department_head',
        'service_director',
        'minister',
        'welfare_officer',
        'finance_director',
        'finance_officer',
        'finance_approver',
        'communications_officer',
        'website_editor',
        'website_publisher',
        'auditor'
      )
    );

ALTER TABLE blessboard.user_invitations
  DROP CONSTRAINT IF EXISTS user_invitations_hq_scope;

ALTER TABLE blessboard.user_invitations
  ADD CONSTRAINT user_invitations_hq_scope
    CHECK (
      role_key NOT IN (
        'church_hq_admin',
        'organisation_administrator',
        'church_system_administrator'
      )
      OR branch_id IS NULL
    );

ALTER TABLE blessboard.user_invitations
  DROP CONSTRAINT IF EXISTS user_invitations_branch_scope;

ALTER TABLE blessboard.user_invitations
  ADD CONSTRAINT user_invitations_branch_scope
    CHECK (
      role_key NOT IN (
        'branch_admin',
        'branch_administrator',
        'branch_pastor'
      )
      OR branch_id IS NOT NULL
    );
