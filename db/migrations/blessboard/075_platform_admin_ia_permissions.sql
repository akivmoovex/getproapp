-- Prompt 13B–13D: Platform Admin information-architecture permissions (additive).
-- View-only technical and catalogue permissions. No assignment or mutation grants.
-- Constraint: resource_key = first segment of permission_key; action_key = last segment.

INSERT INTO blessboard.permissions (
  permission_key, resource_key, action_key, display_name, description, sensitivity
) VALUES
  (
    'platform.deployments.view',
    'platform',
    'view',
    'View deployment diagnostics',
    'Read-only technical deployment registry and safe diagnostics',
    'sensitive'
  ),
  (
    'platform.domains.view',
    'platform',
    'view',
    'View domains and public links',
    'Read-only organisation, church, and branch public link directory',
    'standard'
  ),
  (
    'platform.access_health.view',
    'platform',
    'view',
    'View access health',
    'Read-only platform access-health counts and warnings (no confidential bodies)',
    'sensitive'
  ),
  (
    'platform.audit.view',
    'platform',
    'view',
    'View platform audit summaries',
    'Read-only platform audit summaries without confidential pastoral or Finance payloads',
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
     'platform.deployments.view',
     'platform.domains.view',
     'platform.access_health.view',
     'platform.audit.view',
     'platform.roles.view'
   )
ON CONFLICT DO NOTHING;
