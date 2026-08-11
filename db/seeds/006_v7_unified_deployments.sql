-- V7 unified multi-product deployment catalogue (idempotent).
-- Inserts only domains that do not collide with existing unique canonical_domain rows.
-- Deferred (domain still held by legacy testing rows):
--   activeclinic-org-production (activeclinic.org held by activeclinic-org-v6)
--   blessboard-org-legacy-redirect (blessboard.org held by blessboard-org-staging)
-- Runtime JS profiles already register those codes; DB rows land after Hostinger cutover.

UPDATE platform.products
SET display_name = 'Netraz',
    updated_at = now()
WHERE product_key = 'ngo'
  AND display_name IS DISTINCT FROM 'Netraz';

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
    'blessboard-pronline-testing',
    'blessboard',
    'v7',
    'blessboard.pronline.org',
    'testing',
    'active',
    false,
    'read_write',
    'blessboard_pronline_sid'
  ),
  (
    'activeclinic-pronline-testing',
    'activeclinic',
    'v7',
    'activeclinic.pronline.org',
    'testing',
    'active',
    false,
    'read_write',
    'activeclinic_pronline_sid'
  ),
  (
    'getproapp-org-production',
    'getpro',
    'v7',
    'getproapp.org',
    'production',
    'active',
    true,
    'read_write',
    'getproapp_org_sid'
  ),
  (
    'getpro-pronline-testing',
    'getpro',
    'v7',
    'getproapp.pronline.org',
    'testing',
    'active',
    false,
    'read_write',
    'getpro_pronline_sid'
  ),
  (
    'netraz-org-production',
    'ngo',
    'v7',
    'netraz.org',
    'production',
    'active',
    true,
    'read_write',
    'netraz_org_sid'
  ),
  (
    'netraz-pronline-testing',
    'ngo',
    'v7',
    'netraz.pronline.org',
    'testing',
    'active',
    false,
    'read_write',
    'netraz_pronline_sid'
  ),
  (
    'moovex-org-production',
    'platform',
    'v7',
    'moovex.org',
    'production',
    'active',
    false,
    'read_write',
    'moovex_org_sid'
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
