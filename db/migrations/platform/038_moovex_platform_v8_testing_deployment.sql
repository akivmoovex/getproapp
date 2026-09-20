-- Additive: catalogue row for unified Moovex V8 testing runtime.
-- Without this row, V8 registration provisioning and session creation fail with
-- deployment_not_found while /healthz still reports moovex-platform-v8-testing.
-- Shares moovex-platform-v7 / testing database identity with V7 (unchanged).
-- Idempotent. Does not modify tenant or identity data.

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
