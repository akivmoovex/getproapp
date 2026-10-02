-- V2.02 Phase A: idempotent backfill of catalogue assignments from legacy user_roles.
-- Does NOT drop user_roles. Does NOT invent roles beyond the approved legacy→catalogue map.
-- Safe to re-run. New grants must still use user_role_assignments / catalogue invites.

CREATE OR REPLACE FUNCTION blessboard.backfill_catalogue_assignments_from_user_roles()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  inserted_count integer := 0;
BEGIN
  INSERT INTO blessboard.user_role_assignments (
    user_id,
    organization_id,
    church_id,
    role_id,
    scope_type,
    scope_id,
    status,
    assigned_by_user_id,
    assignment_origin,
    assignment_reason
  )
  SELECT
    ur.user_id,
    ur.organization_id,
    CASE
      WHEN ur.role_key = 'platform_admin' THEN NULL
      ELSE ur.church_id
    END AS church_id,
    r.id AS role_id,
    CASE ur.role_key
      WHEN 'platform_admin' THEN 'platform'
      WHEN 'church_hq_admin' THEN 'church'
      WHEN 'branch_admin' THEN 'branch'
    END AS scope_type,
    CASE ur.role_key
      WHEN 'platform_admin' THEN NULL
      WHEN 'church_hq_admin' THEN ur.church_id
      WHEN 'branch_admin' THEN ur.branch_id
    END AS scope_id,
    'active',
    NULL,
    'migration',
    'v2_02_phase_a_user_roles_backfill'
  FROM blessboard.user_roles ur
  INNER JOIN blessboard.roles r
    ON r.is_active = true
   AND r.role_key = CASE ur.role_key
     WHEN 'platform_admin' THEN 'platform_administrator'
     WHEN 'church_hq_admin' THEN 'organisation_administrator'
     WHEN 'branch_admin' THEN 'branch_administrator'
   END
  WHERE ur.status = 'active'
    AND (
      (ur.role_key = 'platform_admin' AND ur.church_id IS NULL AND ur.branch_id IS NULL)
      OR (ur.role_key = 'church_hq_admin' AND ur.church_id IS NOT NULL AND ur.branch_id IS NULL)
      OR (ur.role_key = 'branch_admin' AND ur.church_id IS NOT NULL AND ur.branch_id IS NOT NULL)
    )
    AND NOT EXISTS (
      SELECT 1
        FROM blessboard.user_role_assignments a
       WHERE a.user_id = ur.user_id
         AND a.organization_id = ur.organization_id
         AND a.role_id = r.id
         AND a.status = 'active'
         AND a.revoked_at IS NULL
         AND a.scope_type = CASE ur.role_key
           WHEN 'platform_admin' THEN 'platform'
           WHEN 'church_hq_admin' THEN 'church'
           WHEN 'branch_admin' THEN 'branch'
         END
         AND COALESCE(a.scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
           = COALESCE(
               CASE ur.role_key
                 WHEN 'platform_admin' THEN NULL
                 WHEN 'church_hq_admin' THEN ur.church_id
                 WHEN 'branch_admin' THEN ur.branch_id
               END,
               '00000000-0000-0000-0000-000000000000'::uuid
             )
         AND COALESCE(a.church_id, '00000000-0000-0000-0000-000000000000'::uuid)
           = COALESCE(
               CASE
                 WHEN ur.role_key = 'platform_admin' THEN NULL
                 ELSE ur.church_id
               END,
               '00000000-0000-0000-0000-000000000000'::uuid
             )
    );

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

COMMENT ON FUNCTION blessboard.backfill_catalogue_assignments_from_user_roles() IS
  'V2.02 Phase A: map active legacy user_roles → catalogue user_role_assignments (idempotent).';

SELECT blessboard.backfill_catalogue_assignments_from_user_roles();
