-- Production catalogue hygiene after seeds 004–006.
-- Testing identity: no-op so Hostinger testing keeps pronline / v6 rows.
-- Production identity: retire testing-only deployment rows and add
-- activeclinic-org-production when activeclinic.org is free.
-- Idempotent. Does not touch BlessBoard public_pages, churches, or users.
-- Leaves 004/006 checksums unchanged (already applied on testing).

DO $$
DECLARE
  env_code TEXT;
BEGIN
  SELECT environment_code INTO env_code
    FROM platform.database_identity
   LIMIT 1;

  IF env_code IS DISTINCT FROM 'production' THEN
    RETURN;
  END IF;

  UPDATE platform.deployments d
     SET status = 'retired',
         canonical_domain = CASE
           WHEN d.canonical_domain LIKE '%.__testing_not_for_production__' THEN d.canonical_domain
           ELSE left(d.canonical_domain || '.__testing_not_for_production__', 253)
         END,
         session_cookie_name = CASE
           WHEN d.session_cookie_name LIKE '%.__testing__' THEN d.session_cookie_name
           ELSE left(d.session_cookie_name || '.__testing__', 64)
         END,
         updated_at = now()
   WHERE d.deployment_code IN (
     'activeclinic-org-v6',
     'moovex-platform-testing',
     'blessboard-pronline-testing',
     'activeclinic-pronline-testing',
     'getpro-pronline-testing',
     'netraz-pronline-testing'
   )
     AND d.status IS DISTINCT FROM 'retired';

  IF NOT EXISTS (
    SELECT 1 FROM platform.deployments
     WHERE canonical_domain = 'activeclinic.org'
  ) THEN
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
      'activeclinic-org-production',
      'activeclinic',
      'v7',
      'activeclinic.org',
      'production',
      'active',
      true,
      'read_write',
      'activeclinic_org_prod_sid'
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
  END IF;
END $$;
