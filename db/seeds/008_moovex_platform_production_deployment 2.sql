-- Ensure moovex-platform-production exists on V7 production catalogues.
-- Seed 006 inserts moovex-platform-testing (and other unified codes) but never
-- inserted moovex-platform-production. Seed 007 retires testing rows and may
-- add activeclinic-org-production, but also omitted the unified production code.
-- Without this row, public self-registration provisioning fails with
-- deployment_not_found when PLATFORM_DEPLOYMENT_CODE=moovex-platform-production.
--
-- Production-gated: testing bootstrap is unchanged (no-op when identity ≠ production).
-- Idempotent. Does not touch tenant/customer data.
--
-- canonical_domain cannot be moovex.org (held by moovex-org-production UNIQUE).
-- Catalogue placeholder is fine: runtime resolves hosts via JS profile
-- productSelection=hostname; provisioning looks up by deployment_code only.
-- session_cookie_name matches PROFILE_MOOVEX_PLATFORM_PRODUCTION.

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
