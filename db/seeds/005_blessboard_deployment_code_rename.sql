-- Forward-only evolution of BlessBoard deployment catalogue codes.
-- Official Hostinger codes: blessboard-com-production, blessboard-org-staging.
--
-- Extracted from an in-place edit of seeds/001_deployments.sql (c683d599) that
-- caused checksum drift against already-applied seed 001. Seed 001 remains the
-- historical applied content; this seed carries the intended rename forward.
--
-- deployment_code is the PRIMARY KEY. platform.audit_events is append-only and
-- may still reference legacy codes, so legacy rows are retained as retired after
-- unique domain/cookie values are moved to the canonical rows. Mutable child
-- tables (domains, sessions, auth_transfers, support_contexts) are re-pointed.
-- Idempotent.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT *
    FROM (VALUES
      (
        'blessboard-com-v4'::text,
        'blessboard-com-production'::text,
        'blessboard'::text,
        'v5'::text,
        'blessboard.com'::text,
        'production'::text,
        true::boolean,
        'read_write'::text,
        'blessboard_com_sid'::text
      ),
      (
        'blessboard-org-v5'::text,
        'blessboard-org-staging'::text,
        'blessboard'::text,
        'v5'::text,
        'blessboard.org'::text,
        'testing'::text,
        false::boolean,
        'read_write'::text,
        'blessboard_org_sid'::text
      )
    ) AS t(
      legacy_code, canonical_code, application_code, release_version,
      canonical_domain, environment_code, jobs_enabled, database_access_mode,
      session_cookie_name
    )
  LOOP
    -- Ensure canonical row exists with official metadata.
    IF EXISTS (
      SELECT 1 FROM platform.deployments d WHERE d.deployment_code = r.canonical_code
    ) THEN
      UPDATE platform.deployments
         SET application_code = r.application_code,
             release_version = r.release_version,
             canonical_domain = r.canonical_domain,
             environment_code = r.environment_code,
             status = 'active',
             jobs_enabled = r.jobs_enabled,
             database_access_mode = r.database_access_mode,
             session_cookie_name = r.session_cookie_name,
             updated_at = now()
       WHERE deployment_code = r.canonical_code;
    ELSIF EXISTS (
      SELECT 1 FROM platform.deployments d WHERE d.deployment_code = r.legacy_code
    ) THEN
      -- Free unique domain/cookie on legacy so canonical can claim them.
      UPDATE platform.deployments
         SET canonical_domain = r.canonical_domain || '.__legacy_rename__',
             session_cookie_name = r.session_cookie_name || '.__legacy__',
             status = 'retired',
             updated_at = now()
       WHERE deployment_code = r.legacy_code;

      INSERT INTO platform.deployments (
        deployment_code, application_code, release_version, canonical_domain,
        environment_code, status, jobs_enabled, database_access_mode, session_cookie_name
      ) VALUES (
        r.canonical_code, r.application_code, r.release_version, r.canonical_domain,
        r.environment_code, 'active', r.jobs_enabled, r.database_access_mode, r.session_cookie_name
      );
    ELSE
      INSERT INTO platform.deployments (
        deployment_code, application_code, release_version, canonical_domain,
        environment_code, status, jobs_enabled, database_access_mode, session_cookie_name
      ) VALUES (
        r.canonical_code, r.application_code, r.release_version, r.canonical_domain,
        r.environment_code, 'active', r.jobs_enabled, r.database_access_mode, r.session_cookie_name
      );
    END IF;

    -- Re-point mutable FK children from legacy → canonical when both exist.
    IF EXISTS (
      SELECT 1 FROM platform.deployments d WHERE d.deployment_code = r.legacy_code
    ) AND EXISTS (
      SELECT 1 FROM platform.deployments d WHERE d.deployment_code = r.canonical_code
    ) THEN
      UPDATE platform.domains
         SET deployment_id = r.canonical_code, updated_at = now()
       WHERE deployment_id = r.legacy_code;

      UPDATE platform.auth_transfers
         SET deployment_code = r.canonical_code
       WHERE deployment_code = r.legacy_code;

      UPDATE platform.deployment_sessions
         SET deployment_code = r.canonical_code
       WHERE deployment_code = r.legacy_code;

      UPDATE platform.support_contexts
         SET deployment_code = r.canonical_code, updated_at = now()
       WHERE deployment_code = r.legacy_code;

      -- audit_events is append-only: leave historical rows on legacy code.
      UPDATE platform.deployments
         SET status = 'retired',
             canonical_domain = CASE
               WHEN canonical_domain = r.canonical_domain
                 THEN r.canonical_domain || '.__legacy_rename__'
               ELSE canonical_domain
             END,
             session_cookie_name = CASE
               WHEN session_cookie_name = r.session_cookie_name
                 THEN r.session_cookie_name || '.__legacy__'
               ELSE session_cookie_name
             END,
             updated_at = now()
       WHERE deployment_code = r.legacy_code;
    END IF;
  END LOOP;
END $$;
