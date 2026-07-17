-- Seed BlessBoard V4 and V5 deployment rows (idempotent).

INSERT INTO platform.deployments (
  deployment_code,
  application_code,
  release_version,
  canonical_domain,
  environment_code,
  status,
  jobs_enabled,
  database_access_mode,
  session_cookie_name
) VALUES
  (
    'blessboard-com-v4',
    'blessboard',
    'v4',
    'blessboard.com',
    'production',
    'active',
    true,
    'read_write',
    'blessboard_com_sid'
  ),
  (
    'blessboard-org-v5',
    'blessboard',
    'v5',
    'blessboard.org',
    'testing',
    'active',
    false,
    'read_write',
    'blessboard_org_sid'
  )
ON CONFLICT (deployment_code) DO UPDATE SET
  application_code = EXCLUDED.application_code,
  release_version = EXCLUDED.release_version,
  canonical_domain = EXCLUDED.canonical_domain,
  environment_code = EXCLUDED.environment_code,
  status = EXCLUDED.status,
  jobs_enabled = EXCLUDED.jobs_enabled,
  database_access_mode = EXCLUDED.database_access_mode,
  session_cookie_name = EXCLUDED.session_cookie_name,
  updated_at = now();
