-- Repair production deployment catalogue when seeds 007/008 no-op'd.
--
-- Race (observed on fresh moovex-platform-v7/production bootstrap):
--   db:bootstrap:foundation runs migrate (seeds) BEFORE identity:init.
--   Seeds 007/008 are production-gated; with no identity row they RETURN early
--   but are still recorded in platform.schema_migrations, so they never re-run.
--   Result: activeclinic-org-v6 keeps activeclinic.org, and both
--   activeclinic-org-production and moovex-platform-production are missing.
--   ActiveClinic register then fails provision_failed/organization
--   (deployment_not_found for PLATFORM_DEPLOYMENT_CODE=activeclinic-org-production).
--
-- This seed re-applies the 007+008 catalogue effects once identity is production.
-- Testing identity: no-op. Idempotent. Does not touch tenant/customer data.
-- Leaves 004–010 checksums unchanged.

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

  -- Same retire list as seed 007 (frees activeclinic.org for production row).
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

  -- Same insert as seed 008 (unified production Hostinger code).
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
    'moovex-platform-production',
    'platform',
    'v7',
    'moovex-platform-production.catalogue',
    'production',
    'active',
    true,
    'read_write',
    'moovex_platform_production_sid'
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
    environment_code = 'production',
    status = 'active',
    jobs_enabled = EXCLUDED.jobs_enabled,
    database_access_mode = EXCLUDED.database_access_mode,
    session_cookie_name = EXCLUDED.session_cookie_name,
    updated_at = now();
END $$;
