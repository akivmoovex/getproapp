-- Mirror of platform migration 038 for seed-driven catalogues.
-- Idempotent. Safe on shared testing DB (additive insert only).

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
) VALUES (
  'moovex-platform-v8-testing',
  'platform',
  'v8',
  'neuniversity.org',
  'testing',
  'active',
  false,
  'read_write',
  'moovex_platform_v8_testing_sid'
)
ON CONFLICT (deployment_code) DO UPDATE SET
  application_code = EXCLUDED.application_code,
  release_version = EXCLUDED.release_version,
  canonical_domain = CASE
    WHEN platform.deployments.canonical_domain IS NOT NULL
         AND platform.deployments.canonical_domain <> ''
      THEN platform.deployments.canonical_domain
    ELSE EXCLUDED.canonical_domain
  END,
  environment_code = 'testing',
  status = 'active',
  jobs_enabled = false,
  database_access_mode = EXCLUDED.database_access_mode,
  session_cookie_name = EXCLUDED.session_cookie_name,
  updated_at = now();
