-- V2.09 hosted shared-database safety checks.
-- Run manually in Supabase SQL Editor only. SELECTs/CTEs below do not write.
-- Never paste DATABASE_URL, passwords, tokens, patient data, or raw session values.

-- 1. Identity. Expected: exactly one PASS row. Do not export database names,
-- instance IDs, host fingerprints, or other connection-identifying values.
SELECT CASE WHEN identity_key = 'moovex-platform-v7'
                 AND environment_code = 'testing'
            THEN 'PASS' ELSE 'FAIL' END AS identity_status,
       CASE WHEN identity_key = 'moovex-platform-v7'
                 AND environment_code = 'testing'
            THEN 'expected' ELSE 'unexpected' END AS identity_match
FROM platform.database_identity;

-- 2. Migration ledger. Expected: each required tuple exists exactly once,
-- checksum is populated, and no required tuple is absent. This reports only
-- module/version/filename; it does not expose application data.
WITH required(module, version, filename) AS (
  VALUES
    ('platform','031','031_website_tenant_publish_policy.sql'),
    ('blessboard','099','099_church_registration_provision_stage.sql'),
    ('activeclinic','034','034_service_website_visibility.sql')
)
SELECT r.module, r.version, r.filename,
       CASE WHEN m.module IS NULL THEN 'MISSING'
            WHEN m.filename <> r.filename OR m.checksum IS NULL THEN 'MISMATCH'
            ELSE 'PASS' END AS result,
       m.applied_at
FROM required r
LEFT JOIN platform.schema_migrations m
  ON m.module = r.module AND m.version = r.version
ORDER BY r.module, r.version;

-- 3. Full ledger summary. Expected: no checksum drift and no pending
-- required entries; review any module/version outside the approved release
-- manifest before sharing the database.
SELECT module, version, filename, applied_at
FROM platform.schema_migrations
ORDER BY module, version;

-- 4. Confirm the shared compatibility surface exists. Expected: zero rows.
WITH required(schema_name, table_name, column_name) AS (
  VALUES
    ('platform','organizations','organization_key'),
    ('platform','organization_products','organization_id'),
    ('platform','identities','email_normalized'),
    ('platform','identity_product_profiles','product_key'),
    ('platform','identity_action_tokens','token_hash'),
    ('platform','deployment_sessions','deployment_code'),
    ('platform','deployment_sessions','organization_id'),
    ('platform','audit_events','deployment_code'),
    ('platform','website_instances','organization_id'),
    ('platform','website_content','published_value'),
    ('platform','website_versions','snapshot_json'),
    ('platform','schema_migrations','checksum'),
    ('platform','database_identity','identity_key'),
    ('blessboard','churches','organization_id'),
    ('blessboard','branches','church_id'),
    ('blessboard','users','status'),
    ('blessboard','user_invitations','organization_id'),
    ('activeclinic','healthcare_organizations','organization_id'),
    ('activeclinic','facilities','organization_id'),
    ('activeclinic','staff_members','organization_id'),
    ('activeclinic','staff_invitations','organization_id')
)
SELECT r.schema_name, r.table_name, r.column_name
FROM required r
LEFT JOIN information_schema.columns c
  ON c.table_schema = r.schema_name
 AND c.table_name = r.table_name
 AND c.column_name = r.column_name
WHERE c.column_name IS NULL
ORDER BY r.schema_name, r.table_name, r.column_name;

-- 5. Deployment records. deployments.deployment_code is TEXT PRIMARY KEY;
-- deployments has no id column. Expected: active rows for both profiles,
-- release_version v8/v7 respectively, environment testing, and read_write.
SELECT deployment_code, application_code, release_version, canonical_domain,
       environment_code, status, jobs_enabled, database_access_mode,
       session_cookie_name
FROM platform.deployments
WHERE deployment_code IN (
  'moovex-platform-v8-testing',
  'moovex-platform-testing'
)
ORDER BY deployment_code;

-- 6. Database deployment records do not define the profile apex allowlist.
-- Profile hostname coverage is checked in canonicalDeploymentProfiles.js and
-- platformRequestContext.js, not by requiring platform.domains rows.
-- This query verifies only the DB's canonical deployment records.
SELECT deployment_code, canonical_domain, environment_code, status,
       database_access_mode
FROM platform.deployments
WHERE deployment_code IN (
  'moovex-platform-v8-testing',
  'moovex-platform-testing'
)
ORDER BY deployment_code;

-- 7. Tenant/custom-domain ownership only. platform.domains is the
-- organization/custom hostname registry; apex/product hosts may legitimately
-- have no rows here. Exclude the profile-owned hosts and return aggregates.
SELECT d.deployment_id,
       COUNT(*)::bigint AS custom_domain_count,
       COUNT(DISTINCT d.organization_id)::bigint AS organization_count,
       COUNT(*) FILTER (WHERE d.status = 'active')::bigint AS active_domain_count
FROM platform.domains d
WHERE d.organization_id IS NOT NULL
  AND d.domain_type IN ('custom', 'alias')
  AND d.deployment_id IN (
    'moovex-platform-v8-testing',
    'moovex-platform-testing'
  )
GROUP BY d.deployment_id
ORDER BY d.deployment_id;

-- 8. Tenant environment separation, without names, keys, emails, phones, or
-- patient data. organizations.data_environment is TEXT. Expected: zero
-- mismatches for active custom domains.
SELECT d.deployment_id,
       COUNT(*) FILTER (WHERE o.data_environment <> dep.environment_code)::bigint
         AS environment_mismatch_count
FROM platform.domains d
JOIN platform.organizations o ON o.id = d.organization_id
JOIN platform.deployments dep ON dep.deployment_code = d.deployment_id
WHERE d.organization_id IS NOT NULL
  AND d.domain_type IN ('custom', 'alias')
  AND d.status = 'active'
  AND d.deployment_id IN (
    'moovex-platform-v8-testing',
    'moovex-platform-testing'
  )
GROUP BY d.deployment_id
ORDER BY d.deployment_id;

-- 9. Deployment-scoped session evidence without exposing tokens or identities.
-- Expected: rows are grouped by deployment_code; never export session IDs.
SELECT deployment_code,
       COUNT(*)::bigint AS session_count,
       COUNT(*) FILTER (WHERE revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP)::bigint
         AS active_session_count
FROM platform.deployment_sessions
GROUP BY deployment_code
ORDER BY deployment_code;

-- PASS/BLOCKED criteria:
-- PASS only if identity, required ledger rows, schema query (zero rows), and
-- deployment records match and profile apexDomains separately cover the
-- intended hosts. Missing apex/product rows in platform.domains are expected.
-- BLOCKED if identity/ledger/schema/deployment checks fail, a custom-domain
-- environment mismatch exists, or session deployment_code scoping is absent.
