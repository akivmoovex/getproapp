-- Seed BlessBoard deployment catalogue rows (idempotent).
-- Official Hostinger codes: blessboard-com-production, blessboard-org-staging.
-- Legacy codes blessboard-com-v4 / blessboard-org-v5 are renamed when present
-- (canonical_domain is unique — one row per apex domain).

UPDATE platform.deployments
SET
  deployment_code = 'blessboard-com-production',
  application_code = 'blessboard',
  release_version = 'v5',
  canonical_domain = 'blessboard.com',
  environment_code = 'production',
  status = 'active',
  jobs_enabled = true,
  database_access_mode = 'read_write',
  session_cookie_name = 'blessboard_com_sid',
  updated_at = now()
WHERE deployment_code = 'blessboard-com-v4'
  AND NOT EXISTS (
    SELECT 1 FROM platform.deployments d
     WHERE d.deployment_code = 'blessboard-com-production'
  );

UPDATE platform.deployments
SET
  deployment_code = 'blessboard-org-staging',
  application_code = 'blessboard',
  release_version = 'v5',
  canonical_domain = 'blessboard.org',
  environment_code = 'testing',
  status = 'active',
  jobs_enabled = false,
  database_access_mode = 'read_write',
  session_cookie_name = 'blessboard_org_sid',
  updated_at = now()
WHERE deployment_code = 'blessboard-org-v5'
  AND NOT EXISTS (
    SELECT 1 FROM platform.deployments d
     WHERE d.deployment_code = 'blessboard-org-staging'
  );

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
    'blessboard-com-production',
    'blessboard',
    'v5',
    'blessboard.com',
    'production',
    'active',
    true,
    'read_write',
    'blessboard_com_sid'
  ),
  (
    'blessboard-org-staging',
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
