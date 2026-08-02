-- Prompt 10E: Platform Admin account-recovery permissions + recovery flags (additive).
-- Does not store plaintext passwords. Does not grant Finance/pastoral permissions.

ALTER TABLE blessboard.users
  ADD COLUMN IF NOT EXISTS password_change_required BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE blessboard.users
  ADD COLUMN IF NOT EXISTS sign_in_locked_until TIMESTAMPTZ NULL;

COMMENT ON COLUMN blessboard.users.password_change_required IS
  'When true, sign-in is blocked until the user completes a password reset.';
COMMENT ON COLUMN blessboard.users.sign_in_locked_until IS
  'When set in the future, sign-in is blocked until unlocked or the timestamp passes.';

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  (
    'platform.users.reset_access',
    'platform',
    'reset_access',
    'Reset staff access',
    'Send password-reset links, resend invitations, and require password change for staff users',
    'highly_sensitive'
  ),
  (
    'platform.users.revoke_sessions',
    'platform',
    'revoke_sessions',
    'Revoke staff sessions',
    'Revoke all active deployment sessions for a staff user',
    'sensitive'
  ),
  (
    'platform.users.suspend',
    'platform',
    'suspend',
    'Suspend staff sign-in',
    'Suspend a staff user so they cannot sign in',
    'highly_sensitive'
  ),
  (
    'platform.users.restore',
    'platform',
    'restore',
    'Restore staff sign-in',
    'Restore a suspended or inactive staff user sign-in without reactivating revoked RBAC assignments',
    'highly_sensitive'
  ),
  (
    'platform.users.unlock',
    'platform',
    'unlock',
    'Unlock staff account',
    'Clear a temporary sign-in lock on a staff user account',
    'sensitive'
  )
ON CONFLICT (permission_key) DO UPDATE
SET
  resource_key = EXCLUDED.resource_key,
  action_key = EXCLUDED.action_key,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  sensitivity = EXCLUDED.sensitivity,
  is_active = true,
  updated_at = now();

INSERT INTO blessboard.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM blessboard.roles r
  CROSS JOIN blessboard.permissions p
 WHERE r.role_key = 'platform_administrator'
   AND p.permission_key IN (
     'platform.users.reset_access',
     'platform.users.revoke_sessions',
     'platform.users.suspend',
     'platform.users.restore',
     'platform.users.unlock'
   )
ON CONFLICT DO NOTHING;
