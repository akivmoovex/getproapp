-- ActiveClinic product catalogue + testing deployment (idempotent).
-- Does not touch BlessBoard deployment rows or create organizations.

INSERT INTO platform.products (product_key, display_name, status)
VALUES
  ('activeclinic', 'ActiveClinic', 'active')
ON CONFLICT (product_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  status = EXCLUDED.status,
  updated_at = now();

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
  'activeclinic-org-v6',
  'activeclinic',
  'v6',
  'activeclinic.org',
  'testing',
  'active',
  false,
  'read_write',
  'activeclinic_org_sid'
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
